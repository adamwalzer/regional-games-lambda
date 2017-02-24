var api  = require('./src/api.js');
var _    = require('lodash');
var argv = require('yargs')
    .usage('$0 api [args]')
    .options(
        {
            v:   {
                boolean:  true,
                alias:    'verbose',
                describe: 'Turn on verbose logging'
            },
            d:   {
                boolean:  true,
                alias:    'debug',
                describe: 'Turn on debugging ',
            },
            uri: {
                type:     'string',
                describe: 'Base API URI',
                demand:   true
            }
        }
    )
    .argv;

var user = process.env.API_USER;
var pass = process.env.API_PASS;

var request    = api.buildApi({ auth: { user: user, password: pass } });
var apiRequest = _.partial(api.makeApiCall, request, argv.uri);

/**
 * Fetches all the games that are marker as regional
 *
 * @todo Add Check if the game is global
 * @param apiRequest
 * @return {Promise.<TResult>}
 */
var getRegionalGames = (apiRequest) => {
    return new Promise((resolve, reject) => {
        try {
            return apiRequest('game', { per_page: 100 }, resolve, reject);
        } catch (err) {
            reject(err);
        }
    }).then(gameJson => {
        // pull all out games that require a zip to play
        return _.reduce(_.get(gameJson, '_embedded.game', []), (result, gameData) => {
            if (_.has(gameData, 'meta.zipcodes') && !_.isEmpty(gameData.meta.zipcodes)) {
                result.push(gameData);
            }

            return result;
        }, []);
    })
};

/**
 * Calls the API to get all the addresses for a given zip code
 *
 * @param {Function} apiRequest - makes API calls
 * @param {String} zipCode - The zip code
 * @return {Promise.<TResult> | Array} list of all address Id for the zip code
 */
var callGetAddressIdByZipCode = (apiRequest, zipCode) => {
    return new Promise((resolve, reject) => {
        try {
            return apiRequest('address', { postal_code: zipCode, filter: 'group', per_page: 100 }, resolve, reject);
        } catch (err) {
            reject(err);
        }
    }).then(addressJson => {
        return _.reduce(_.get(addressJson, '_embedded.address', []), (result, addressData) => {
            result.push(_.get(addressData, 'address_id'));
            return result;
        }, []);
    })
};

/**
 * Partail for callGetAddressIdByZipCode
 */
var getAddressIdByZip = _.partial(callGetAddressIdByZipCode, apiRequest);

/**
 * Promises to get all the addresses that have groups based off zip code
 *
 * @param {Function} getAddressIdByZip - function used to call the API
 * @param {Object} gamesByZip - Hash of all games by zip code
 * @return {Promise.<*>}
 */
var getAllAddressesForGames = (getAddressIdByZip, gamesByZip) => {
    var promises = _.reduce(gamesByZip, (result, games, zipCode) => {
        result.push(
            getAddressIdByZip(zipCode)
                .then(address => {
                    return {
                        games: games,
                        addresses: address,
                        zip_code: zipCode
                    };
                })
        );
        return result;
    }, []);

    return Promise.all(promises);
};

/**
 * Makes an API call to get all the Groups for an address
 *
 * @param {Function} apiRequest - Makes the APi call
 * @param {String} addressId - The Address Id to get
 * @return {Promise.<TResult>}
 */
var callGetGroupsByAddress = (apiRequest, addressId) => {
    return new Promise((resolve, reject) => {
        try {
            return apiRequest('address/' + addressId + '/group' , { per_page: 100 }, resolve, reject);
        } catch (err) {
            reject(err);
        }
    }).then(groupJson => {
        return _.reduce(_.get(groupJson, '_embedded.group', []), (result, groupData) => {
            result.push(_.get(groupData, 'group_id'));
            return result;
        }, []);
    })
};

/**
 * Partial for the callGetGroupsByAddress
 */
var getGroupsForAddress = _.partial(callGetGroupsByAddress, apiRequest);

/**
 * Promises to get all the groups for all the addresses a game is tied too
 *
 * @param {Function} getGroupsForAddress
 * @param gamesWithAddress
 * @return {Promise.<*>}
 */
var getAllGroupsForAddress = (getGroupsForAddress, gamesWithAddress) => {
    var promises = _.reduce(gamesWithAddress, (result, data) => {
        _.each(data.addresses, (addressId) => {
            result.push(
                getGroupsForAddress(addressId)
                    .then(groups => {
                        var appendGroups = _.cloneDeep(data);
                        appendGroups['groups'] = groups;
                        return appendGroups
                    })
            );
        });
        return result;
    }, []);

    return Promise.all(promises);
};

/**
 * Creates a has of zipCodes and all the games for those zip codes
 *
 * @param {Object} regionalGames - All Games that have regional games tied to them
 * @return {Object} Games for each zip code
 */
var createHashByZip = (regionalGames) => {
    return _.reduce(regionalGames, (result, gameData) => {
        _.each(gameData.meta.zipcodes, (zipCode) => {
            (result[zipCode] || (result[zipCode] = [])).push(gameData.game_id);
        });

        return result;
    }, {});
};

var result = Promise.resolve(
    getRegionalGames(apiRequest)
        .then(createHashByZip)
        .then(gamesByZip => {
            return getAllAddressesForGames(getAddressIdByZip, gamesByZip);
        })
        // Filter addresses that have no groups
        .then(addresses => {
            return _.remove(addresses, addressData => {
                return !_.isEmpty(addressData.addresses)
            })
        })
        .then(addresses => {
            return getAllGroupsForAddress(getGroupsForAddress, addresses);
        })
        .then(addressWithGroups => {
            console.log(addressWithGroups);
        })
        .catch(console.error)
);
