const config = require("../lib/config");
const logger = require("../lib/logger");
const elastic = require("../components/elastic");
const _ = require("lodash");
const Promise = require("bluebird");
const mapper = require("../components/mapper");
const configurator = require("../components/configurator");
const lookup = require("../components/lookup");
const moment = require("moment");
const etl = require("etl");

function mapProduct(product, esData) {
  if (product) {
    Object.assign(esData, {
      ProductName: product.name,
      ProductAlias: product.alias,
      ProductStatus: product.status
    });

    if (product && product.contract) {
      esData.ContractNumber = product.contract.contractNumber;
      esData.ContractName = product.contract.contractName;
    }
  }
}

function run() {
  global.RunIdentifier = moment().unix();
  let sinceFrom = config.upwork.period.from;
  let sinceTo = config.upwork.period.to;

  logger.info(`Period From : ${sinceFrom}`);
  logger.info(`Period To : ${sinceTo}`);

  return elastic
    .createMapping(
      elastic.constructESIndex(sinceFrom),
      config.es.type,
      elastic.ES_DOCTYPE
    )
    .then(configurator.lookupMappedUpworkTeams)
    .then(configurator.lookupRootAccount)
    .then(mapper.timeReports)
    .then(timereports => {
      return Promise.resolve(timereports).mapSeries(report => {
        const tenant = report.tenant || {};
        const defaultProduct = report.product;
        return new Promise((resolve, reject) => {
          mapper
            .get_time_report(report)
            .then(data => {
              if (data && data.length === 0) {
                return resolve();
              }
              etl
                .toStream(data)
                .pipe(
                  etl.map(timeReportOnActivity => {
                    const provisioingAction =
                      timeReportOnActivity.provisioingAction || {};
                    const resource = provisioingAction.resource;
                    const product = provisioingAction.product;
                    const serviceRequest = provisioingAction.serviceRequest;
                    logger.info(
                      `Processing time report for ${
                        timeReportOnActivity.contract.provider__id
                      } for ${timeReportOnActivity.worked_on}`
                    );
                    const start = moment(timeReportOnActivity.start).utc();
                    const end = moment(timeReportOnActivity.end).utc();
                    const duration = moment.duration(end.diff(start));
                    const hoursWorked = duration.asHours();
                    const esData = {
                      _id: `upwork-${timeReportOnActivity.timeRange}-${
                        timeReportOnActivity.provider_id
                      }`,
                      _index: elastic.constructESIndex(
                        timeReportOnActivity.start
                      ),
                      _type: config.es.type,
                      PeriodStart: timeReportOnActivity.start,
                      PeriodEnd: timeReportOnActivity.end,
                      ProviderAlias: "upwork",
                      ProviderName: "Upwork",
                      ProvisionedUnits: timeReportOnActivity.hours,
                      ProviderAccountAlias: timeReportOnActivity.provider_id,
                      ProviderAccountName: timeReportOnActivity.provider_name,
                      CostAmount: provisioingAction.overrideCost * hoursWorked,
                      ChargeAmount:
                        provisioingAction.overridePrice * hoursWorked,
                      ProvisionedItem: "Developer",
                      ProductName: "UNKNOWN",
                      ProductAlias: "UNKNOWN",
                      TenantAlias: "UNKNOWN",
                      TenantName: "UNKNOWN",
                      ResourceAlias: "UNKNOWN",
                      ResourceName: "UNKNOWN",
                      TaskAlias: "UNKNOWN",
                      OtherMetadata: _.assign(
                        {},
                        _.pick(timeReportOnActivity, [
                          "worked_on",
                          "hours",
                          "task",
                          "charges",
                          "contract.provider__id",
                          "contract.engagement_title",
                          "contract.provider_team__id",
                          "contract.hourly_charge_rate"
                        ])
                      )
                    };
                    if (tenant && !_.isEmpty(tenant)) {
                      esData.TenantName = tenant.name;
                      esData.TenantAlias = tenant.alias;
                      esData.TenantInvoiceCurrency = tenant.invoiceCurrency;
                    }
                    if (product) {
                      mapProduct(product, esData);
                    }
                    if (resource) {
                      Object.assign(esData, {
                        ResourceName: resource.name,
                        ResourceAlias: resource.alias,
                        ResourceType: resource.type,
                        ResourceUnit: resource.resourceUnit,
                        ResourcePrice: resource.defaultPrice,
                        ResourceCost: resource.defaultCost
                      });
                    }

                    if (serviceRequest) {
                      Object.assign(esData, {
                        ServiceRequestNumber: serviceRequest.requestNumber,
                        ServiceRequestCustomerRef: serviceRequest.customerRef
                      });

                      if (serviceRequest.service) {
                        const service = serviceRequest.service;
                        Object.assign(esData, {
                          ServiceName: service.name,
                          ServicePricingUnit: service.pricingUnit,
                          ServiceDefaultMarkup: service.defaultMarkup,
                          ServiceCategory: service.category,
                          ServiceSubCategory: service.subCategory,
                          ServiceMarkupType: service.markupType
                        });
                      }
                    }

                    return lookup
                      .getTask(timeReportOnActivity.task)
                      .then(tasks => {
                        if (tasks && tasks[0]) {
                          esData.TaskAlias = tasks[0].alias;
                          esData.TaskTitle = tasks[0].title;
                          esData.TaskStatus = tasks[0].status;
                          if (tasks[0].product && !product) {
                            mapProduct(tasks[0].product, esData);
                          }
                        } else {
                          esData.TaskAlias = timeReportOnActivity.task;
                        }
                        return esData;
                      })
                      .then(() => {
                        const tenantBillingCurrency =
                          tenant.invoiceCurrency || "AUD";
                        if (
                          _.isNaN(esData.ChargeAmount) &&
                          tenant.defaultMarkup
                        ) {
                          return lookup
                            .calculateOverridePrice(
                              timeReportOnActivity.charges,
                              tenant
                            )
                            .then(amount => {
                              if (_.isNumber(amount)) {
                                esData.ChargeAmount = amount;
                              }
                              return lookup.fixer("USD", tenantBillingCurrency);
                            })
                            .then(rate => {
                              esData.CostAmount =
                                timeReportOnActivity.charges * rate;
                            });
                        }
                        return esData;
                      })
                      .then(() => {
                        if (
                          esData.ProductAlias === "UNKNOWN" &&
                          defaultProduct
                        ) {
                          mapProduct(defaultProduct, esData);
                        }
                        return esData;
                      });
                  })
                )
                .pipe(etl.collect(50))
                .pipe(
                  etl.elastic.index(elastic.client, null, null, {
                    concurrency: 10
                  })
                )
                .promise()
                .then(() => {
                  // https://developers.upwork.com/?lang=python#getting-started_rate-limits
                  setTimeout(() => {
                    resolve();
                  }, 500);
                })
                .catch(reject);
            })
            .catch(reject);
        });
      });
    })
    .catch(err => {
      logger.error(err);
    });
}

module.exports = {
  run
};
