const _ = require("lodash");
const Promise = require("bluebird");
const moment = require("moment");
const config = require("../lib/config");
const logger = require("../lib/logger");
const lookup = require("./lookup");
const configurator = require("../components/configurator");
const Roles = require("upwork-api/lib/routers/hr/roles.js").Roles;
const Time = require("upwork-api/lib/routers/reports/time.js").Time;
const Engagements = require("upwork-api/lib/routers/hr/engagements.js")
  .Engagements;
const Workdiary = require("upwork-api/lib/routers/workdiary.js").Workdiary;

function hourly_intervals(start, end, hourly_charge) {
  start.minutes(Math.ceil(start.minutes() / 60) * 60);
  const result = [];
  const current = moment(start);
  const tracker = moment(start);

  while (current < end) {
    const period_start = current.format("YYYY-MM-DD HH:mm:ss");
    let period_end = null;
    const duration = moment.duration(end.diff(current));
    const minutes = duration.asMinutes();
    let total_minutes = 60;
    if (minutes >= 60) {
      current.add(60, "minutes");
    } else {
      current.add(minutes, "minutes");
      total_minutes = minutes;
    }
    tracker.add(60, "minutes");
    period_end = current.format("YYYY-MM-DD HH:mm:ss");
    const tracker_end = tracker.format("YYYY-MM-DD HH:mm:ss");
    result.push({
      start: period_start,
      end: period_end,
      charges: (total_minutes * Number(hourly_charge)) / 60,
      hours: total_minutes / 60,
      timeRange: `${period_start}-${tracker_end}`
    });
  }

  return result;
}

function transformUpworkReport(table) {
  if (typeof table === "undefined") {
    return;
  }
  let colsArray = _.map(table.cols, "label");
  return _.map(table.rows, row => _.zipObject(colsArray, _.map(row.c, "v")));
}

function isUpworkUserPermissionsGranted(permissions) {
  let upworkPermissionsRequired = [
    "manage_recruiting",
    "manage_employment",
    "manage_finance"
  ];
  if (Array.isArray(permissions)) {
    return Boolean(
      _.intersection(upworkPermissionsRequired, permissions).length
    );
  } else {
    return upworkPermissionsRequired.includes(permissions);
  }
}

function get_time_report(report) {
  return configurator
    .getUpworkClient(
      report.credentials.consumerKey,
      report.credentials.consumerSecret,
      report.credentials.token,
      report.credentials.tokenSecret
    )
    .then(api => {
      const reports = new Time(api);
      return new Promise((resolve, reject) => {
        const companyId = report.metadata.company_id;
        const teamId = report.metadata.team_id;
        reports.getByTeamFull(
          companyId,
          teamId,
          report.searchParams,
          (error, result) => {
            let processed = [];
            if (error || !result) {
              if (error) {
                logger.error(error);
              }
              return resolve(processed);
            }
            let data = transformUpworkReport(result.table);
            data = _.groupBy(
              data,
              item => `${item.worked_on}--${item.provider_id}`
            );
            _.forEach(data, (group, key) => {
              const date = key.split("--")[0];
              const start = moment(date).set("hour", "8");
              const end = moment(date).set("hour", "8");
              _.forEach(group, item => {
                const contract = report.contracts[item.assignment_ref].contract;
                const hourly_charge_rate = contract.hourly_charge_rate;
                end.add(item.hours, "hours");
                let intervals = hourly_intervals(
                  start,
                  end,
                  hourly_charge_rate
                );
                start.add(item.hours, "hours");
                start.minutes(Math.ceil(start.minutes() / 60) * 60);
                end.minutes(Math.ceil(end.minutes() / 60) * 60);
                const task = item.task && item.task.split(":")[0];
                intervals = _.map(intervals, interval => {
                  return Object.assign({}, item, interval, {
                    task,
                    metadata: report.metadata,
                    ...report.contracts[item.assignment_ref]
                  });
                });
                processed = processed.concat(intervals);
              });
            });
            resolve(processed);
          }
        );
      });
    });
}

function get_engagements(
  api,
  team_reference,
  offset = 0,
  count = 10,
  list = []
) {
  return new Promise((resolve, reject) => {
    offset = Number(offset);
    count = Number(count);
    const engagements = new Engagements(api);
    engagements.getList(
      {
        buyer_team__reference: team_reference,
        page: `${offset}:${count}`
      },
      (error, res) => {
        if (error) {
          return reject(error);
        }
        const contracts = res.engagements.engagement;
        list = list.concat(contracts);
        if (
          res.engagements.lister &&
          Number(res.engagements.lister.total_count) >
            offset + Number(res.engagements.lister.total_items)
        ) {
          get_engagements(
            api,
            team_reference,
            offset + count,
            count,
            list
          ).then(list => {
            resolve(list);
          });
        } else {
          resolve(list);
        }
      }
    );
  });
}

function get_workdairies(credentials, contract_refernce, workday) {
  return configurator
    .getUpworkClient(
      credentials.consumerKey,
      credentials.consumerSecret,
      credentials.token,
      credentials.tokenSecret
    )
    .then(
      api =>
        new Promise((resolve, reject) => {
          const workdiary = new Workdiary(api);
          workdiary.getByContract(
            contract_refernce,
            workday,
            {},
            (error, data) => {
              if (error) {
                return reject(error);
              }
              resolve(data);
            }
          );
        })
    );
}

function mapContract(upworkRole, provider, contract, tenant, dateFrom, dateTo) {
  return Promise.all([
    lookup.getProduct(contract.job_ref_ciphertext, provider.id),
    lookup.getResource(contract.reference)
  ]).then(responses => {
    const [product, provisioingActions] = responses;
    const provisioingAction = provisioingActions[0] || {};
    return {
      [contract.reference]: {
        provisioingAction,
        contract,
        product
      }
    };
  });
}

function timeReports(provider) {
  let upwokrApi;
  let tenant;
  const dateFrom = config.upwork.period.from;
  const dateTo = config.upwork.period.to;

  if (!provider || !provider.account) {
    logger.error(
      `provider: ${provider.name}(${provider.id}) doesn't have a root account`
    );
    return undefined;
  }

  return configurator
    .getUpworkClient(
      provider.appAuthKey,
      provider.appAuthSecret,
      provider.account.credentials.token,
      provider.account.credentials.tokenSecret
    )
    .then(api => {
      upwokrApi = api;
      const roles = new Roles(api);
      const getAll = Promise.promisify(roles.getAll.bind(roles));
      return getAll();
    })
    .then(rolesData => {
      return Promise.map(
        rolesData.userroles.userrole,
        roleData => {
          if (isUpworkUserPermissionsGranted(roleData.permissions.permission)) {
            return lookup
              .getTenant(roleData.team__reference, provider.id)
              .then(res => {
                tenant = res;
                return get_engagements(upwokrApi, roleData.team__reference);
              })
              .then(contracts => {
                contracts = _.compact(contracts);
                return Promise.mapSeries(contracts, contract => {
                  return mapContract(
                    roleData,
                    provider,
                    contract,
                    tenant,
                    dateFrom,
                    dateTo
                  );
                });
              })
              .then(contracts => {
                return (contracts.length && Object.assign(...contracts)) || {};
              })
              .then(contracts => {
                return Object.assign(
                  _.pick(roleData, [
                    "parent_team__id",
                    "parent_team__name",
                    "team__id",
                    "team__name"
                  ]),
                  {
                    searchParams: {
                      tq: `SELECT worked_on, assignment_ref, provider_id, provider_name, memo, task, sum(hours), sum(charges) WHERE worked_on >= '${moment(
                        dateFrom
                      )
                        .utc()
                        .format("YYYY-MM-DD")}' AND worked_on <= '${moment(
                        dateTo
                      )
                        .utc()
                        .format("YYYY-MM-DD")}'`
                    },
                    credentials: {
                      consumerKey: provider.appAuthKey,
                      consumerSecret: provider.appAuthSecret,
                      token: provider.account.credentials.token,
                      tokenSecret: provider.account.credentials.tokenSecret
                    },
                    metadata: {
                      dateFrom,
                      dateTo,
                      external_id: provider.account.externalId,
                      company_id: roleData.parent_team__id,
                      company_reference: roleData.company__reference,
                      company_name: roleData.company__name,
                      team_name: roleData.team__name,
                      team_id: roleData.team__id,
                      team_reference: roleData.team__reference,
                      upwork_provider_id: provider.id
                    },
                    contracts,
                    tenant
                  }
                );
              });
          }
          return [];
        },
        { concurrency: 2 }
      );
    })
    .then(teams => {
      return teams.filter(team => !_.isEmpty(team.contracts));
    });
}

module.exports = {
  timeReports,
  get_workdairies,
  get_time_report
};
