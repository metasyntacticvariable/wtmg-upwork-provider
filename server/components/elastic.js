const elasticsearch = require("elasticsearch");
const config = require("../lib/config");
const moment = require("moment");
const logger = require("../lib/logger");
const { to } = require("await-to-js");

const ES_DOCTYPE = {};
ES_DOCTYPE[config.es.type] = {
  dynamic_templates: [
    {
      strings: {
        path_match: "OtherMetadata.*",
        match_mapping_type: "string",
        mapping: {
          type: "keyword",
          ignore_above: 256
        }
      }
    },
    {
      integers: {
        path_match: "OtherMetadata.BlendedCost",
        mapping: {
          type: "float"
        }
      }
    }
  ],
  properties: {
    PeriodStart: { type: "date", format: "YYYY-MM-dd HH:mm:ss" },
    PeriodEnd: { type: "date", format: "YYYY-MM-dd HH:mm:ss" },
    ChargeAmount: { type: "float" },
    CostAmount: { type: "float" },
    ResourceType: { type: "keyword" },
    ResourceAlias: { type: "keyword" },
    ResourcePrice: { type: "float" },
    ResourceUnit: { type: "keyword" },
    ResourceName: { type: "keyword" },
    ProductName: { type: "keyword" },
    ProductAlias: { type: "keyword" },
    ProductStatus: { type: "keyword" },
    ContractNumber: { type: "keyword" },
    TaskAlias: { type: "keyword" },
    TaskTitle: { type: "keyword" },
    TaskStatus: { type: "keyword" },
    TenantName: { type: "keyword" },
    TenantAlias: { type: "keyword" },
    TenantInvoiceCurrency: { type: "keyword" },
    ServiceContractMarkup: { type: "float" },
    ServiceRequestNumber: { type: "keyword" },
    ServiceRequestCustomerRef: { type: "keyword" },
    ServiceMarkupType: { type: "keyword" },
    InvoiceCurrency: { type: "keyword" },
    Assignees: { type: "keyword" },
    ServiceName: { type: "keyword" },
    ServicePricingUnit: { type: "keyword" },
    ServiceDefaultMarkup: { type: "float" },
    ServiceCategory: { type: "keyword" },
    ServiceSubCategory: { type: "keyword" },
    ProviderAccountName: { type: "keyword" },
    ProviderAccountAlias: { type: "keyword" },
    ProviderName: { type: "keyword" },
    ProviderAlias: { type: "keyword" },
    ProviderBillingCurrency: { type: "keyword" },
    OtherMetadata: { dynamic: true, properties: {} }
  }
};

const elasticClient = new elasticsearch.Client({
  host: [
    {
      host: config.es.host,
      auth: config.es.user + ":" + config.es.password,
      protocol: "https",
      port: 9243
    }
  ]
});

function indexExists(indexName) {
  return elasticClient.indices.exists({
    index: indexName
  });
}

function initIndex(indexName) {
  return elasticClient.indices.create({
    index: indexName
  });
}

function deleteIndex(indexName) {
  return elasticClient.indices.delete({
    index: indexName
  });
}

function constructESIndex(date) {
  const dateObj = moment(date).utc();
  const index = `${config.es.index}-${dateObj.year()}`;
  if (config.es.includeMonth) {
    return `${index}-${dateObj.month()}`;
  }
  return index;
}

function initMapping(indexName, type, mapping) {
  return elasticClient.indices.putMapping({
    index: indexName,
    type: type,
    body: mapping
  });
}

const createMapping = async (indexName, type, mapping) => {
  const exists = await indexExists(indexName);
  if (!exists) {
    logger.info("Creating index...");
    await initIndex(indexName);
  }
  const [err] = await to(initMapping(indexName, type, mapping));
  if (err) {
    logger.error(
      `Error while updating/creating the mapping for index ${indexName} ${
        err.stack
      }`
    );
  } else {
    logger.info(`Mapping ${indexName} created/updated`);
  }
};

exports.deleteIndex = deleteIndex;
exports.initIndex = initIndex;
exports.indexExists = indexExists;
exports.initMapping = initMapping;
exports.createMapping = createMapping;
exports.client = elasticClient;
exports.constructESIndex = constructESIndex;
exports.ES_DOCTYPE = ES_DOCTYPE;
