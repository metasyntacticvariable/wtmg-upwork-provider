const worker = require("./components/worker");
var logger = require("./lib/logger");

logger.info("Starting upwork provider..");
worker.run();
