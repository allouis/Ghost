// Based heavily on the settings cache
const _ = require('lodash');
const path = require('path');
const fixtures = require(path.join(__dirname, '../../data/schema/fixtures/fixtures.json'));

let actionsMap = {};

module.exports = {
    getAll: function getAll() {
        return _.cloneDeep(actionsMap);
    },
    init: function init(perms) {
        const seenActions = {};

        actionsMap = {};

        // Build a hash map of the actions on objects, i.e
        /*
         {
         'edit': ['post', 'tag', 'user', 'page'],
         'delete': ['post', 'user'],
         'create': ['post', 'user', 'page']
         }
         */
        _.each(perms.models, function (perm) {
            const actionType = perm.get('action_type');
            const objectType = perm.get('object_type');

            actionsMap[actionType] = actionsMap[actionType] || [];
            seenActions[actionType] = seenActions[actionType] || {};

            // Check if we've already seen this action -> object combo
            if (seenActions[actionType][objectType]) {
                return;
            }

            actionsMap[actionType].push(objectType);
            seenActions[actionType][objectType] = true;
        });

        return actionsMap;
    },
    empty: function empty() {
        return _.size(actionsMap) === 0;
    },

    /**
     * Initialize the actions map from fixtures.json instead of DB query.
     * This is part of the permissions refactor (Phase 3, Step 3.2).
     *
     * Builds the same structure as init() but using the JSON fixtures
     * instead of loading from the database.
     *
     * @returns {Object} The actions map: { actionType: [objectType1, objectType2, ...] }
     */
    initFromJSON: function initFromJSON() {
        const seenActions = {};

        actionsMap = {};

        // Find the Permission model fixtures
        const permissionFixture = fixtures.models.find(m => m.name === 'Permission');
        if (!permissionFixture) {
            return actionsMap;
        }

        // Build a hash map of the actions on objects, i.e
        /*
         {
         'edit': ['post', 'tag', 'user', 'page'],
         'delete': ['post', 'user'],
         'create': ['post', 'user', 'page']
         }
         */
        for (const entry of permissionFixture.entries) {
            const actionType = entry.action_type;
            const objectType = entry.object_type;

            actionsMap[actionType] = actionsMap[actionType] || [];
            seenActions[actionType] = seenActions[actionType] || {};

            // Check if we've already seen this action -> object combo
            if (seenActions[actionType][objectType]) {
                continue;
            }

            actionsMap[actionType].push(objectType);
            seenActions[actionType][objectType] = true;
        }

        return actionsMap;
    }
};
