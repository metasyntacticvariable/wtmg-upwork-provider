"use strict";

const moment = require("moment");
const rp = require("request-promise");
const Promise = require("bluebird");
const configurator = require("../components/configurator");
const config = require("../lib/config");
const fixerBuffer = {};

function dataMappingDirect(
  providerProperty,
  providerValue,
  provider_id,
  mappingModelName
) {
  let params = {
    filter: {
      where: {
        providerProperty: providerProperty,
        providerValue: providerValue,
        dataProviderId: provider_id
      }
    }
  };
  if (mappingModelName) {
    params.filter.where.mappingModelName = mappingModelName;
  }
  return rp.get({
    headers: configurator.headers,
    url: `${config.lookup.url}/data-mappings`,
    qs: params,
    json: true
  });
}

function getProduct(providerValue, providerId) {
  return dataMappingDirect("job.reference", providerValue, providerId).then(
    function(dataMapping) {
      if (dataMapping && dataMapping.length) {
        return rp.get({
          headers: configurator.headers,
          url: `${config.lookup.url}/products/${dataMapping[0].mappedValue}`,
          json: true
        });
      }
    }
  );
}

function getTenant(providerValue, providerId) {
  let tenant;
  return dataMappingDirect(
    "team.reference",
    providerValue,
    providerId,
    "tenant"
  )
    .then(function(dataMapping) {
      if (!dataMapping || (dataMapping && dataMapping.length === 0)) {
        return;
      }
      return rp.get({
        headers: configurator.headers,
        url: `${config.lookup.url}/tenants/${dataMapping[0].mappedValue}`,
        json: true
      });
    })
    .then(function(res) {
      if (res) {
        tenant = res;
        return getDefaultMarkup(tenant.id, providerId);
      }
    })
    .then(function(defaultMarkup) {
      if (defaultMarkup && defaultMarkup[0] && tenant) {
        tenant.defaultMarkup = defaultMarkup[0];
      }
      return tenant;
    });
}

function getDefaultMarkup(tenantId, providerId) {
  return rp.get({
    headers: configurator.headers,
    url: `${config.lookup.url}/default-markups`,
    qs: {
      filter: {
        where: {
          tenantId: tenantId,
          dataProviderId: providerId
        }
      }
    },
    json: true
  });
}

function getResource(reference) {
  return rp.get({
    headers: configurator.headers,
    url: `${config.lookup.url}/provisioning-actions`,
    qs: {
      filter: {
        where: {
          externalRefId: reference
        },
        include: [
          {
            relation: "resource",
            scope: {
              include: ["user"]
            }
          },
          "product",
          {
            relation: "serviceRequest",
            scope: {
              include: ["requestedBy", "service", "serviceContract"]
            }
          }
        ]
      }
    },
    json: true
  });
}

function getTask(alias) {
  return rp.get({
    headers: configurator.headers,
    url: `${config.lookup.url}/tasks`,
    json: true,
    qs: {
      filter: {
        where: {
          or: [
            {
              alias: alias
            },
            {
              externalRefId: alias
            }
          ]
        },
        include: ["product"]
      }
    }
  });
}

function fixer(from = "USD", to = "AUD", date = moment().format("YYYY-MM-DD")) {
  if (fixerBuffer[`${from}:${to}`]) {
    return Promise.resolve(fixerBuffer[`${from}:${to}`]);
  }
  return rp(
    `https://api.exchangeratesapi.io/${date}?base=${from}&symbols=${to}`
  ).then(function(fixerRates) {
    try {
      fixerRates = JSON.parse(fixerRates);
    } catch (e) {
      //
    }
    const rate = fixerRates && fixerRates.rates && fixerRates.rates[to];
    fixerBuffer[`${from}:${to}`] = rate;
    return rate;
  });
}

function calculateOverridePrice(charge, tenant) {
  const tenantBillingCurrency = tenant.invoiceCurrency || "AUD";
  const markupType = tenant.defaultMarkup.markupType;
  let overridePrice = 0;
  return fixer("USD", tenantBillingCurrency).then(function(exchangeRate) {
    if (exchangeRate) {
      overridePrice = exchangeRate * charge;

      let markup = 0;
      if (markupType === "Flat") {
        markup = tenant.defaultMarkup.defaultMarkup;
      } else {
        markup = (tenant.defaultMarkup.defaultMarkup * exchangeRate) / 100;
      }
      overridePrice += markup;
      return (overridePrice = Math.round(overridePrice * 100) / 100);
    }
  });
}

module.exports = {
  getTask: getTask,
  calculateOverridePrice: calculateOverridePrice,
  getTenant: getTenant,
  getProduct: getProduct,
  fixer: fixer,
  fixerBuffer: fixerBuffer,
  getResource: getResource
};
