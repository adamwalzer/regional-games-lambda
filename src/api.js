var _ = require('lodash');
var request = require('request');

/**
 * Marshals calls to the API
 *
 * @module api
 * @param {String} apiUri - the base path for the API
 * @param {Object} options - key value for the
 * @param {Object.<logger>} logger - Logger
 * @return {{apiRequest, postRequest}}
 */
module.exports = function (apiUri, options, logger) {
    logger.info('debug', 'Initializing API');
    _.defaults(options, {});

    options.timeout = 3000;
    options.json = true;
    options.strictSsl = true;

    if (options.auth == null ||
        options.auth.user == null ||
        options.auth.password == null
    ) {
        throw Error('Cannot make api requests with missing options');
    }

    var requester = request.defaults(options);

    /**
     * Makes a get call to the API
     *
     * @param {Object.<request>} request - Request Module
     * @param base
     * @param path
     * @param query
     * @param resolve
     * @param reject
     * @return {Promise}
     */
    var makeApiGet = (request, base, path, query, resolve, reject) => {
        _.defaults(query, {});
        path = _.startsWith('/', path) ? path : '/' + path;
        var apiUrl = base + path;
        logger.log('debug', 'Making call to:' , apiUrl, 'with the following query:', query);
        return new Promise(function (apiResolve, apiReject) {
            request(base + path, {qs: query}, (err, response, body) => {
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
     * @param {Object.<request>} request - Request Module
     * @param {String} base
     * @param {String} path
     * @param {Object} data
     * @param resolve
     * @param reject
     * @return {Promise}
     */
    var makeApiPost = (request, base, path, data, resolve, reject) => {
        path = _.startsWith('/', path) ? path : '/' + path;
        var apiUrl = base + path;
        logger.log('debug', 'Posting to:' , apiUrl, 'with the following data:', data);
        return new Promise(function (apiResolve, apiReject) {
            request(base + path, {method: 'POST', json: data}, (err, response, body) => {
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

    return {
        apiRequest: _.partial(makeApiGet, requester, apiUri),
        postRequest: _.partial(makeApiPost, requester, apiUri)
    }
};
