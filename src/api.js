var request = require('request');
var _       = require('lodash');
var logger  = require('./logger.js').logger;

/**
 * Builds an API request
 *
 * @type {Function}
 * @param {Object} options - Options for the API request
 *
 * @return {request}
 */
var buildApi = _.memoize((options) => {
    var apiOptions = _.defaults(options, { timeout: 3000, json: true, strictSsl: true });
    if (apiOptions.auth == null ||
        apiOptions.auth.user == null ||
        apiOptions.auth.password == null
    ) {
        throw Error('Cannot make api requests with missing options');
    }

    return request.defaults(apiOptions);
});

/**
 * Makes a get call to the API
 *
 * @param request
 * @param base
 * @param path
 * @param options
 * @param resolve
 * @param reject
 * @return {Promise}
 */
var makeApiCall = (request, base, path, options, resolve, reject) => {
    options    = _.defaults(options, {});
    path       = _.startsWith('/', path) ? path : '/' + path;
    var apiUrl = base + path;
    return new Promise(function (apiResolve, apiReject) {
        request(base + path, {qs: options}, (err, response, body) => {
            if (err) {
                return apiReject(Error('Error requesting: ' + apiUrl + ' ' + err));
            }

            if (response.statusCode !== 200) {
                return apiReject(Error('Invalid response code: ' + response.statusCode));
            }

            if (_.isEmpty(body)) {
                return apiReject(Error('Empty response body from: ' + apiUrl));
            }

            return apiResolve(body);
        });
    })
        .then(body => {
            logger.log('debug', 'Completed request to:', apiUrl);
            _.attempt(resolve, body);
        })
        .catch(function (err) {
            logger.log('error', err);
            _.attempt(reject, [err]);
            throw err;
        });
};

module.exports = {
    buildApi,
    makeApiCall
};
