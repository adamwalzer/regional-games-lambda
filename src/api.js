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
 * @param query
 * @param resolve
 * @param reject
 * @return {Promise}
 */
var makeApiGet = (request, base, path, query, resolve, reject) => {
    query      = _.defaults(query, {});
    path       = _.startsWith('/', path) ? path : '/' + path;
    var apiUrl = base + path;
    return new Promise(function (apiResolve, apiReject) {
        request(base + path, { qs: query }, (err, response, body) => {
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

/**
 * Makes a Post call to the API
 *
 * @param request
 * @param base
 * @param path
 * @param data
 * @param resolve
 * @param reject
 * @return {Promise}
 */
var makeApiPost = (request, base, path, data, resolve, reject) => {
    path       = _.startsWith('/', path) ? path : '/' + path;
    var apiUrl = base + path;
    return new Promise(function (apiResolve, apiReject) {
        request(base + path, { method: 'POST', json: data }, (err, response, body) => {
            if (err) {
                return apiReject(Error('Error posting: ' + apiUrl + ' ' + err));
            }

            // TODO CORE-3409 is resolved then this can check 500 errors then reject

            return apiResolve(response);
        });
    })
        .then((body) => {
            logger.log('debug', 'Completed POST request to:', apiUrl);
            _.attempt(resolve, body);
        })
        .catch(function (err) {
            logger.log('error', err);
            _.attempt(reject, [err]);
            throw err;
        });
};
module.exports  = {
    buildApi,
    makeApiGet,
    makeApiPost
};
