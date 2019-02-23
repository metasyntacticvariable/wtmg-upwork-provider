const _ = require("lodash");
const rp = require("request-promise");
const async = require("async");
const config = require("../lib/config");
const logger = require("../lib/logger");
const UpworkApi = require("upwork-api");

const crypto = require("crypto");
const shasum = crypto.createHash("sha1");
shasum.update(config.providerSecret);
const secret = shasum.digest("hex");
const headers = { "User-Agent": "Request-Promise", "provider-secret": secret };

function lookupMappedUpworkTeams() {
  return rp
    .get({
      uri: `${config.lookup.url}/data-providers`,
      headers,
      qs: {
        filter: {
          where: {
            name: "upwork"
          },
          include: {
            relation: "dataMappings",
            scope: {
              where: {
                providerProperty: "team.id"
              }
            }
          }
        }
      },
      json: true
    })
    .then(providers => {
      logger.info(`Fetched ${providers.length} provider accounts`);
      providers = _.uniqBy(providers, "rootAccount");
      return providers && providers[0];
    });
}

function getUpworkClient(
  consumerKey,
  consumerSecret,
  access_token,
  access_token_secret
) {
  return new Promise(resolve => {
    const api = new UpworkApi({
      consumerKey: consumerKey,
      consumerSecret: consumerSecret,
      accessToken: access_token,
      accessSecret: access_token_secret,
      debug: true
    });
    api.setAccessToken(access_token, access_token_secret, () => {
      resolve(api);
    });
  });
}

function lookupRootAccount(provider) {
  return rp
    .get({
      headers,
      url: `${config.lookup.url}/userCredentials/${provider.rootAccount}`,
      json: true
    })
    .then(function(result) {
      provider.account = result;
      return provider;
    });
}

module.exports = {
  lookupMappedUpworkTeams: lookupMappedUpworkTeams,
  lookupRootAccount: lookupRootAccount,
  getUpworkClient: getUpworkClient,
  headers: headers
};
