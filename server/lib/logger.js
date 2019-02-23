const winston = require("winston");
const _ = require("lodash");
const config = require("./config");

winston.emitErrs = true;

const transports = [];

transports.push(
  new winston.transports.Console({
    json: false,
    level: process.env.LOG_LEVEL || "verbose",
    formatter: function(options) {
      const opts = {
        timestamp: new Date().toISOString(),
        loglevel: options.level,
        application: config.application,
        environment: process.env.NODE_ENV,
        message: options.message,
        type: options.meta.logType || "ApplicationLog"
      };
      if (!_.isEmpty(options.meta)) {
        if (options.meta.logType) {
          delete options.meta.logType;
        }
        opts.metadata = options.meta;
      }
      return JSON.stringify(opts);
    }
  })
);

var logger = new winston.Logger({
  transports: transports
});

// flush log messages to file before exiting the process
logger.exitAfterFlush = function(code) {
  if (logger.transports.jsonFile) {
    logger.transports.jsonFile.on("flush", function() {
      process.exit(code);
    });
  } else {
    process.exit(code);
  }
};

module.exports = logger;
