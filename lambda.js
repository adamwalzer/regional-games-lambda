var _ = require('lodash');
var logger = require('./src/logger.js').logger;
var user = process.env.API_USER;
var pass = process.env.API_PASS;

exports.handler = function (event, context, callback) {
    logger.log('debug', 'Processing event: ' + JSON.stringify(event));

    var apiUri = _.get(event, 'uri', false);
    var job = _.get(event, 'job', 'cron');
    var group = _.get(event, 'group', false);

    logger.log('info', 'Process Job', job);
    logger.log('info', 'API Url', apiUri);

    if (_.isEmpty(apiUri)) {
        logger.log('error', 'API Uri missing from lambda event');
        callback('API Uri missing from lambda event');
        return;
    }

    var api = require('./src/api.js')(apiUri, {auth: {user: user, password: pass}}, logger);
    var processor = require('./src/processor')(api, logger);

    switch (job) {
        case 'cron':
            logger.log('info', 'Processing cron for all games');
            processor.cron();
            break;

        case 'group':
            logger.log('info', 'Processing all games for group', group);
            if (!_.isEmpty(group)) {
                processor.group(group);
                return;
            }

            logger.log('error', 'Invalid group: ', group);
            callback('Invalid group: ' + group);
            break;

        default:
            logger.log('error', 'Invalid process job', job);
            callback('Invalid process job: ' + job);
    }
};