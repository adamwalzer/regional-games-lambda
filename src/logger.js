var winston = require('winston');
var rollbar = require('winston-rollbar').Rollbar;
var rollbarToken = process.env.ROLLBAR_TOKEN;
var rollbarConfig = {
    environment: "local",
    level: "error",
    enabled: false
};

var logger = new (winston.Logger)({
    exitOnError: false,
    level: 'error',
    transports: [
        new (winston.transports.Console)({
            colorize: true
        }),
        new (winston.transports.Rollbar)({
            rollbarAccessToken: rollbarToken,
            rollbarConfig: rollbarConfig,
            level: rollbarConfig.level,
            handleExceptions: true
        })
    ]
});

module.exports = {
    logger
};
