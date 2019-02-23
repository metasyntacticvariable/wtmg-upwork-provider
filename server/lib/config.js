"use strict";

const path = require("path");
const moment = require("moment");
const _ = require("lodash");

const env = process.env.NODE_ENV || "development";
if (env === "development") {
  require("dotenv").config();
}

const defaultDays = 1;

// All configurations will extend these options
// ============================================

function getDates() {
  const fromDate =
    process.env.PERIOD_FROM && moment(process.env.PERIOD_FROM).utc();
  const toDate = process.env.PERIOD_TO && moment(process.env.PERIOD_TO).utc();
  const from =
    fromDate && fromDate.isValid()
      ? fromDate
      : moment()
          .utc()
          .subtract(defaultDays, "d");
  const to = toDate && toDate.isValid() ? toDate : moment().utc();
  return {
    from,
    to
  };
}

const common = {
  application: "wtmg-provider-upwork",
  aws: {},
  lookup: {
    url: process.env.API_URL
  },
  es: {
    index: process.env.ES_INDEX,
    type: process.env.ES_TYPE,
    includeMonth: false,
    enable: process.env.ES_ENABLE || true,
    host: process.env.ES_HOST,
    port: process.env.ES_PORT || 9243,
    user: process.env.ES_USER || "wtmg-provider-es",
    password: process.env.ES_PASSWORD
  },
  upwork: {
    period: {
      ...getDates()
    }
  },
  s3: {
    source: {
      prefix: process.env.S3_SOURCE_PREFIX || "reports/time",
      bucket: process.env.S3_SOURCE_BUCKET || ""
    },
    destination: {
      prefix: process.env.S3_DESTINATION_PREFIX || "reports/time",
      bucket: process.env.S3_DESTINATION_BUCKET || ""
    }
  },
  providerSecret:
    process.env.API_SECRET || "162896a0-aeeb-4d17-8a5a-1792fad82c2d",
  root: path.normalize(`${__dirname}/../../`)
};

var awsSettings = {};
if (env === "development") {
  awsSettings = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_DEFAULT_REGION || "ap-southeast-2"
  };
} else {
  awsSettings = {
    region: process.env.AWS_DEFAULT_REGION || "ap-southeast-2"
  };
}
_.assign(common.aws, awsSettings);

// Export the config object based on the NODE_ENV
// ==============================================
module.exports = _.merge(common || {});
