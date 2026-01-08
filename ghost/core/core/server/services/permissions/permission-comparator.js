/**
 * Permission Comparator
 *
 * This module wraps both the old canThis and new canThis-v2 systems,
 * running them in parallel and comparing their results. This is part
 * of the "branch by abstraction" pattern for safely transitioning to
 * the new permission system.
 *
 * Part of the permissions system refactor (Phase 4, Step 4.1).
 */

const errors = require('@tryghost/errors');

/**
 * Decision types for comparison results.
 */
const Decision = {
    BOTH_GRANTED: 'BOTH_GRANTED',
    BOTH_DENIED: 'BOTH_DENIED',
    CONFLICT_OLD_GRANTED: 'CONFLICT_OLD_GRANTED',
    CONFLICT_NEW_GRANTED: 'CONFLICT_NEW_GRANTED'
};

/**
 * Check if an error is a permission denial (NoPermissionError).
 *
 * @param {Error} err - The error to check
 * @returns {boolean} True if it's a permission denial
 */
function isPermissionDenial(err) {
    return err && err.errorType === 'NoPermissionError';
}

/**
 * Compare the results of old and new permission systems.
 *
 * This is the core comparison function that runs both systems
 * and determines if they agree or conflict.
 *
 * @param {Object} context - Request context (user, api_key, member, etc.)
 * @param {string} action - Action type (browse, read, edit, add, destroy)
 * @param {string} objectType - Object type (post, user, comment, etc.)
 * @param {string|Object|null} modelOrId - Model instance or ID
 * @param {Object} unsafeAttrs - Attributes being modified
 * @param {Function} oldCheck - Function that runs the old permission check
 * @param {Function} newCheck - Function that runs the new permission check
 * @returns {Promise<Object>} Comparison result with decision, metadata, and any errors
 */
async function compare(context, action, objectType, modelOrId, unsafeAttrs, oldCheck, newCheck) {
    const result = {
        context,
        action,
        objectType,
        modelOrId,
        oldGranted: false,
        newGranted: false,
        oldError: null,
        newError: null,
        newExcludedAttrs: [],
        decision: null,
        conflict: false,
        timestamp: new Date().toISOString()
    };

    // Run old system check
    try {
        await oldCheck();
        result.oldGranted = true;
    } catch (err) {
        result.oldGranted = false;
        result.oldError = isPermissionDenial(err) ? err : err.message;
    }

    // Run new system check
    try {
        const newResult = await newCheck();
        result.newGranted = true;
        result.newExcludedAttrs = newResult?.excludedAttrs || [];
    } catch (err) {
        result.newGranted = false;
        result.newError = isPermissionDenial(err) ? err : err.message;
    }

    // Determine decision
    if (result.oldGranted && result.newGranted) {
        result.decision = Decision.BOTH_GRANTED;
        result.conflict = false;
    } else if (!result.oldGranted && !result.newGranted) {
        result.decision = Decision.BOTH_DENIED;
        result.conflict = false;
    } else if (result.oldGranted && !result.newGranted) {
        result.decision = Decision.CONFLICT_OLD_GRANTED;
        result.conflict = true;
    } else {
        result.decision = Decision.CONFLICT_NEW_GRANTED;
        result.conflict = true;
    }

    return result;
}

/**
 * Run a full comparison using the actual canThis and checkPermission functions.
 *
 * This function handles the interface differences between old (chainable) and
 * new (direct function call) permission systems.
 *
 * @param {Object} context - Request context
 * @param {string} action - Action type
 * @param {string} objectType - Object type
 * @param {string|Object|null} modelOrId - Model or ID
 * @param {Object} unsafeAttrs - Attributes being modified
 * @param {Function} canThis - Old canThis function
 * @param {Function} checkPermission - New checkPermission function
 * @returns {Promise<Object>} Comparison result
 */
async function runComparison(context, action, objectType, modelOrId, unsafeAttrs, canThis, checkPermission) {
    // Wrap old system - it uses chainable API: canThis(context).action.objectType(modelOrId, unsafeAttrs)
    const oldCheck = async () => {
        const canThisResult = canThis(context);
        const actionHandler = canThisResult[action];
        if (!actionHandler || !actionHandler[objectType]) {
            throw new errors.InternalServerError({
                message: `Unknown action or object type: ${action}.${objectType}`
            });
        }
        return actionHandler[objectType](modelOrId, unsafeAttrs);
    };

    // Wrap new system - it uses direct function call
    const newCheck = async () => {
        return checkPermission(context, action, objectType, modelOrId, unsafeAttrs);
    };

    return compare(context, action, objectType, modelOrId, unsafeAttrs, oldCheck, newCheck);
}

/**
 * Get the result to return based on the old system's decision.
 *
 * During the transition period, we always return what the old system
 * would have returned to ensure backwards compatibility.
 *
 * @param {Object} comparisonResult - Result from compare()
 * @returns {Promise<void>} Resolves if old granted, rejects if old denied
 */
async function getResultForOldSystem(comparisonResult) {
    if (comparisonResult.oldGranted) {
        return Promise.resolve();
    }

    // Return the original error from the old system
    if (comparisonResult.oldError && comparisonResult.oldError.errorType) {
        return Promise.reject(comparisonResult.oldError);
    }

    // Fallback to a generic permission error
    return Promise.reject(new errors.NoPermissionError({
        message: 'You do not have permission to perform this action'
    }));
}

module.exports = {
    Decision,
    compare,
    runComparison,
    getResultForOldSystem
};
