/**
 * Permission Comparator
 *
 * This module wraps both the old canThis and new canThis-v2 systems,
 * running them in parallel and comparing their results. This is part
 * of the "branch by abstraction" pattern for safely transitioning to
 * the new permission system.
 *
 * Part of the permissions system refactor (Phase 4, Step 4.1).
 * Sentry monitoring added in Step 4.2.
 */

const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');
const sentry = require('../../../shared/sentry');

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
        resolvedRole: null,
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
        result.resolvedRole = newResult?.role || null;
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

/**
 * Report a permission conflict to Sentry for monitoring.
 *
 * This logs conflicts as Sentry events (not errors) to enable
 * tracking the conflict rate over time without generating noise
 * in error tracking.
 *
 * Part of Phase 4, Step 4.2.
 *
 * @param {Object} comparisonResult - The result from compare()
 */
function reportConflict(comparisonResult) {
    if (!comparisonResult.conflict) {
        return;
    }

    // Use the resolved role name from the new permission system if available
    // Falls back to context type if role wasn't resolved (e.g., permission denied before resolution)
    let role = comparisonResult.resolvedRole || 'unknown';
    if (role === 'unknown') {
        // Fallback to context type for identification
        if (comparisonResult.context?.user) {
            role = 'user (unresolved)';
        } else if (comparisonResult.context?.api_key) {
            role = 'api_key (unresolved)';
        } else if (comparisonResult.context?.member) {
            role = 'member (unresolved)';
        } else if (comparisonResult.context?.internal) {
            role = 'internal';
        }
    }

    // Determine model ID for logging
    let modelId = null;
    if (comparisonResult.modelOrId) {
        if (typeof comparisonResult.modelOrId === 'string' || typeof comparisonResult.modelOrId === 'number') {
            modelId = String(comparisonResult.modelOrId);
        } else if (comparisonResult.modelOrId.id) {
            modelId = String(comparisonResult.modelOrId.id);
        }
    }

    const message = `[Permissions] Conflict detected: ${comparisonResult.decision}`;

    // Always log conflicts for visibility in development and production logs
    logging.warn(message, {
        action: comparisonResult.action,
        objectType: comparisonResult.objectType,
        role,
        oldGranted: comparisonResult.oldGranted,
        newGranted: comparisonResult.newGranted,
        modelId
    });

    // Use captureMessage with 'info' level to avoid triggering error alerts
    sentry.captureMessage?.(message, {
        level: 'info',
        tags: {
            permission_decision: comparisonResult.decision,
            permission_action: comparisonResult.action,
            permission_object: comparisonResult.objectType,
            permission_role: role,
            permission_old_granted: String(comparisonResult.oldGranted),
            permission_new_granted: String(comparisonResult.newGranted)
        },
        extra: {
            context: comparisonResult.context,
            action: comparisonResult.action,
            objectType: comparisonResult.objectType,
            modelId: modelId,
            resolvedRole: comparisonResult.resolvedRole,
            oldGranted: comparisonResult.oldGranted,
            newGranted: comparisonResult.newGranted,
            oldError: comparisonResult.oldError?.message || comparisonResult.oldError,
            newError: comparisonResult.newError?.message || comparisonResult.newError,
            newExcludedAttrs: comparisonResult.newExcludedAttrs,
            timestamp: comparisonResult.timestamp
        }
    });
}

module.exports = {
    Decision,
    compare,
    runComparison,
    getResultForOldSystem,
    reportConflict
};
