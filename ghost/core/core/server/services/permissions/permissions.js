// canThis(someUser).edit.posts([id]|[[ids]])
// canThis(someUser).edit.post(somePost|somePostId)

const models = require('../../models');
const config = require('../../../shared/config');

const actionsMap = require('./actions-map-cache');
const originalCanThis = require('./can-this');
const canThisV2 = require('./can-this-v2');
const comparator = require('./permission-comparator');

const init = function init(options) {
    options = options || {};

    // Load all the permissions
    return models.Permission.findAll(options)
        .then(function (permissionsCollection) {
            return actionsMap.init(permissionsCollection);
        });
};

/**
 * Create a wrapped canThis that optionally runs comparison between old and new systems.
 *
 * When runComparison is enabled, both permission systems are executed and their results
 * compared. Conflicts are reported to Sentry. The result from the old system is returned
 * by default (for backwards compatibility) unless useNewSystem is also enabled.
 *
 * This wrapper preserves the chainable API: canThis(context).edit.post(model)
 *
 * Part of Phase 4, Step 4.4 of the permissions refactor.
 *
 * @param {Object} context - Request context (user, api_key, member, internal, etc.)
 * @returns {Object} A canThis-compatible object with action handlers
 */
function canThis(context) {
    const permissionsConfig = config.get('permissions') || {};
    const runComparison = permissionsConfig.runComparison === true;
    const useNewSystem = permissionsConfig.useNewSystem === true;

    // If neither flag is enabled, just use the original canThis
    if (!runComparison && !useNewSystem) {
        return originalCanThis(context);
    }

    // Get the original canThis result to build our wrapper around
    const originalResult = originalCanThis(context);

    // Create a proxy that intercepts action and object type access
    // to wrap the final permission check with comparison logic
    return createComparisonProxy(context, originalResult, runComparison, useNewSystem);
}

/**
 * Create a proxy around the canThis result that intercepts the final permission check.
 *
 * @param {Object} context - Request context
 * @param {Object} originalResult - Original canThis(context) result
 * @param {boolean} runComparison - Whether to run comparison
 * @param {boolean} useNewSystem - Whether to return new system's result
 * @returns {Proxy} Wrapped canThis result
 */
function createComparisonProxy(context, originalResult, runComparison, useNewSystem) {
    return new Proxy(originalResult, {
        get(target, actionType) {
            // Get the original action handler (e.g., canThis(context).edit)
            const originalActionHandler = target[actionType];

            // If it's not an object (e.g., it's a function or primitive), return as-is
            if (!originalActionHandler || typeof originalActionHandler !== 'object') {
                return originalActionHandler;
            }

            // Create a proxy for the action handler to intercept object type access
            return new Proxy(originalActionHandler, {
                get(actionTarget, objectType) {
                    // Get the original object type handler (e.g., canThis(context).edit.post)
                    const originalObjTypeHandler = actionTarget[objectType];

                    // If it's not a function, return as-is
                    if (typeof originalObjTypeHandler !== 'function') {
                        return originalObjTypeHandler;
                    }

                    // Return a wrapped function that runs comparison
                    return async function wrappedHandler(modelOrId, unsafeAttrs = {}) {
                        // Run comparison between both systems
                        const result = await comparator.runComparison(
                            context,
                            actionType,
                            objectType,
                            modelOrId,
                            unsafeAttrs,
                            originalCanThis,
                            canThisV2.checkPermission
                        );

                        // Report any conflicts to Sentry
                        comparator.reportConflict(result);

                        // Return based on which system we're trusting
                        if (useNewSystem) {
                            // Trust new system's result
                            if (result.newGranted) {
                                return;
                            }
                            if (result.newError && result.newError.errorType) {
                                return Promise.reject(result.newError);
                            }
                            const errors = require('@tryghost/errors');
                            return Promise.reject(new errors.NoPermissionError({
                                message: 'You do not have permission to perform this action'
                            }));
                        }

                        // Default: return old system's result (safe for transition)
                        return comparator.getResultForOldSystem(result);
                    };
                }
            });
        }
    });
}

module.exports = {
    init: init,
    canThis: canThis,
    // @TODO: Make it so that we don't need to export these
    parseContext: require('./parse-context')
};
