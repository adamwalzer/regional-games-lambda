var _ = require('lodash');
var util = require('util');
var logger = require('./src/logger.js').logger;
var argv = require('yargs')
    .usage('$0 api [args]')
    .options(
        {
            v: {
                boolean: true,
                alias: 'verbose',
                describe: 'Turn on verbose logging'
            },
            d: {
                boolean: true,
                alias: 'debug',
                describe: 'Turn on debugging ',
            },
            uri: {
                type: 'string',
                describe: 'Base API URI',
                demand: true
            },
            process: {
                type: 'string',
                choices: ['cron', 'group'],
                default: 'cron'
            },
            group: {
                type: 'string',
                describe: 'Process all users in this group'
            },
        }
    )
    .argv;

if (argv.v) {
    logger.level = 'info';
}

if (argv.d) {
    logger.level = 'debug';
}

logger.log('debug', 'options', argv);
var user = process.env.API_USER;
var pass = process.env.API_PASS;

var api = require('./src/api.js')(argv.uri, {auth: {user: user, password: pass}}, logger);
var processor = require('./src/processor')(api, logger);

// Yea I can do this in YARGS but meh right now
switch (argv.process) {
    case 'cron':
        logger.log('info', 'Processing cron for all games');
        processor.cron();
        break;

    case 'group':
        logger.log('info', 'Processing all games for user');
        processor.group(argv.group);
        break;

    default:
        process.exit(1);
}
