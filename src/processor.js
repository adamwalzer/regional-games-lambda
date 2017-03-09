var api = require('./api.js');
var _ = require('lodash');
var util = require('util');
var EventEmitter = require('events');
var logger = require('./logger.js').logger;

function ProcessorEmitter() {
    EventEmitter.call(this);
}

util.inherits(ProcessorEmitter, EventEmitter);

/**
 * @typedef {Object.<string, [string]>} GameZipHash
 */

/**
 * @typedef {Object} GameHash
 * @property {String[]} games - List of Game Ids for the zip_code
 * @property {String[]} addresses - List of Address Ids for the zip_code
 * @property {String[]} groups - List of group Ids for the zip_code
 * @property {String} zip_code - The Zip code for the games and addresses
 */

/**
 * @typedef {Object} UserEntity
 * @property {String} user_id
 */

/**
 * @typedef {Object} GroupEntity
 * @property {String} group_id
 */

/**
 * @typedef {Object} GameEntity
 * @property {String} game_id
 */

/**
 *
 * @param {Object.<api>} api
 * @param {object.<logger>} logger
 */
module.exports = function Processor(api, logger) {
    logger.info('debug', 'Initializing processor');

    var events = new ProcessorEmitter();

    /**
     * Creates a has of zipCodes and all the games for those zip codes
     *
     * @param {Object} regionalGames - All Games that have regional games tied to them
     * @return {Object.<GameZipHash>} Games for each zip code
     */
    var createHashByZip = (regionalGames) => {
        return _.reduce(regionalGames, (result, gameData) => {
            _.each(_.get(gameData, 'meta.zipcodes', []), (zipCode) => {
                (
                    result[zipCode] || (
                        result[zipCode] = []
                    )
                ).push(gameData.game_id);
            });

            return result;
        }, {});
    };

    /**
     * Fetches all the regional games
     *
     * @todo Add Check if the game is global
     * @param {Object.<api>} api
     * @return {Object.<GameZipHash>}
     */
    var getRegionalGames = api => {
        return new Promise((resolve, reject) => {
            try {
                return api.apiRequest('game', {per_page: 100}, resolve, reject);
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
     * @param {Object.<api>} api
     * @param {String} zipCode - The zip code
     * @return {Object.<GameHash>} list of all address Id for the zip code
     */
    var callGetAddressIdByZipCode = (api, zipCode) => {
        return new Promise((resolve, reject) => {
            try {
                return api.apiRequest('address', {
                    postal_code: zipCode,
                    filter: 'group',
                    per_page: 100
                }, resolve, reject);
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
     * Promises to get all the addresses that have groups based off zip code
     *
     * @param {Function} getAddressIdByZip - function used to call the API
     * @param {Object.<GameZipHash>} gamesByZip - Hash of all games by zip code
     * @return {Object.<GameHash>}
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
     * @param {Object.<api>} api
     * @param {String} addressId - The Address Id to get
     * @return {String[]} - list of Group Id's that have AddressId
     */
    var callGetGroupsByAddress = (api, addressId) => {
        return new Promise((resolve, reject) => {
            try {
                return api.apiRequest('address/' + addressId + '/group', {per_page: 100}, resolve, reject);
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
     * Builds in the Groups for the gameHash
     *
     * @param {Function} getGroupsForAddress - Function that promises to get all groups for an address
     * @param {Object.<GameHash>} gameHash - Current Game hash
     * @return {Object.<GameHash>}
     */
    var getAllGroupsForAddress = (getGroupsForAddress, gameHash) => {
        var promises = _.reduce(gameHash, (result, data) => {
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
     * Promises to get all the users for a group on a page
     *
     * @param {Object.<api>} api
     * @param {String} groupId - the group id
     * @param {Number} page - the page to get
     * @return {Promise}
     */
    var getAllUsersForGroup = (api, groupId, page) => {
        return new Promise((resolve, reject) => {
            try {
                return api.apiRequest('group/' + groupId + '/users', {per_page: 100, page: page}, resolve, reject);
            } catch (err) {
                reject(err);
            }
        })
    };

    /**
     * Saves a game to a user
     *
     * @todo check error response from API
     * @param {Object.<api>} api
     * @param {String} userId
     * @param {String} gameId
     * @return {Promise}
     */
    var postGameToUser = (api, userId, gameId) => {
        logger.log('info', 'Saving game', gameId, 'to user', userId);
        return new Promise((resolve, reject) => {
            try {
                return api.postRequest('user/' + userId + '/game/' + gameId, {}, resolve, reject);
            } catch (err) {
                reject(err);
            }
        });
    };

    /**
     * Attaches Multiple games to users in a group
     *
     * @param {Object.<api>} api - Makes API calls
     * @param {String[]} gameIds - list of game Id's to attach
     * @param {String} groupId - the group Id
     * @param {Number} page - the current page
     * @param {Function} resolve - Promise resolver
     */
    var processGroupUserPage = (api, gameIds, groupId, page, resolve) => {
        logger.log('debug', 'processing page', page, 'for group', groupId, 'with games', gameIds);
        getAllUsersForGroup(api, groupId, page)
            .then(userData => {
                var promises = _.each(_.get(userData, '_embedded.items'), user => {
                    /**
                     * @type {Object.<UserEntity>} user
                     */
                    _.each(gameIds, gameId => {
                        events.emit('saveGameToUser', user.user_id, gameId);
                    });
                });

                Promise.resolve(Promise.all(promises));

                // TODO make more HATOAS'ee (pass in the next url instead of increasing the page)
                page++;
                if (_.has(userData, '_links.next')) {
                    events.emit('groupPage', groupId, gameIds, page, resolve);
                    return;
                }

                resolve();
            });
    };

    var getAddressIdByZip = _.partial(callGetAddressIdByZipCode, api);
    var getGroupsForAddress = _.partial(callGetGroupsByAddress, api);

    events.on('groupUserPage', _.partial(processGroupUserPage, api));
    events.on('saveGameToUser', _.partial(postGameToUser, api));

    /**
     * Basic Processing steps for all types
     *
     * @return {Promise.<GameHash>}
     */
    var basicProcess = () => {
        return getRegionalGames(api)
        // setup the game hash
            .then(createHashByZip)
            // Find the addresses based on the zip code
            .then(gamesByZip => {
                return getAllAddressesForGames(getAddressIdByZip, gamesByZip);
            })
            // Filter Games that have have no addresses
            .then(gameHash => {
                return _.remove(gameHash, addressData => {
                    return !_.isEmpty(addressData.addresses)
                })
            })
            // Find all the groups for the addresses
            .then(gameHash => {
                return getAllGroupsForAddress(getGroupsForAddress, gameHash);
            })
    };

    return {
        group: (group) => {
            return basicProcess()
                // find all the users for all groups and attach
                .then(gameHash => {
                    logger.log('debug', 'Processing game hash', gameHash);
                    _.each(gameHash, gameData => {
                        logger.log('debug', 'Game Data:', gameData);

                        if (_.indexOf(gameData.groups, group) > -1) {
                            logger.log('debug', 'Triggering event for group', groupId);
                            events.emit('groupUserPage', gameData.games, group, 1, _.noop);
                        }
                    });
                })
                .then(() => {
                    logger.log('info', 'Done Processing group', groupId);
                    return true;
                });
        },
        cron: () => {
            return basicProcess()
                // find all the users for all groups and attach
                .then(gameHash => {
                    logger.log('debug', 'Processing game hash', gameHash);
                    return new Promise((reject, resolve) => {
                        _.each(gameHash, gameData => {
                            logger.log('debug', 'Game Data:', gameData);
                            _.each(gameData.groups, groupId => {
                                logger.log('debug', 'Triggering event for group', groupId);
                                events.emit('groupUserPage', gameData.games, groupId, 1, resolve);
                            });
                        });
                    });
                })
                .then(() => {
                    logger.log('info', 'Done Processing cron');
                    return true;
                });
        }
    };
};