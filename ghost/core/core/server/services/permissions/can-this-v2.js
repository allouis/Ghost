/**
 * can-this-v2: New Permission Checker
 *
 * This module provides a cleaner, simpler permission checking system that:
 * 1. Uses JSON config instead of DB queries for base permission lookup
 * 2. Has explicit Owner permissions (no bypass)
 * 3. Calls permissibleV2 methods with a clean PermissionContext
 * 4. Returns a clear result: granted with optional excludedAttrs, or throws NoPermissionError
 *
 * Part of the permissions system refactor (Phase 3, Step 3.1).
 */

const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const models = require('../../models');
const providers = require('./providers');
const parseContext = require('./parse-context');
const permissionConfig = require('./permission-config');
const PermissionContext = require('./PermissionContext');

const messages = {
    noPermissionToAction: 'You do not have permission to perform this action'
};

/**
 * Get the model class for a given object type.
 * Uses dynamic lookup to support stubbing in tests.
 *
 * @param {string} objectType - Object type (e.g., 'post', 'user')
 * @returns {Object|undefined} The model class or undefined
 */
function getModel(objectType) {
    const objectTypeModelMap = {
        post: models.Post,
        role: models.Role,
        user: models.User,
        permission: models.Permission,
        setting: models.Settings,
        invite: models.Invite,
        integration: models.Integration,
        comment: models.Comment
    };
    return objectTypeModelMap[objectType];
}

/**
 * Resolve the role name from loaded permissions data.
 *
 * @param {Object} loadedPermissions - Object with user/apiKey/member permission data
 * @returns {string|null} The role name, or null if no role found
 */
function resolveRole(loadedPermissions) {
    // Check user roles first (staff users)
    if (loadedPermissions.user && loadedPermissions.user.roles && loadedPermissions.user.roles.length > 0) {
        return loadedPermissions.user.roles[0].name;
    }

    // Then check API key roles
    if (loadedPermissions.apiKey && loadedPermissions.apiKey.roles && loadedPermissions.apiKey.roles.length > 0) {
        return loadedPermissions.apiKey.roles[0].name;
    }

    // For members, use the pseudo-role 'Member'
    if (loadedPermissions.member) {
        return 'Member';
    }

    return null;
}

/**
 * Load permissions from providers based on context.
 *
 * @param {Object} context - Parsed context with user/api_key/member info
 * @returns {Promise<Object>} Object with loaded user/apiKey/member permission data
 */
async function loadPermissions(context) {
    const result = {
        user: null,
        apiKey: null,
        member: null
    };

    // Load user permissions if user context present
    if (context.user) {
        result.user = await providers.user(context.user);
    }

    // Load API key permissions if api_key context present
    if (context.api_key) {
        result.apiKey = await providers.apiKey(context.api_key.id);
    }

    // Load member data if member context present
    if (context.member) {
        result.member = await providers.member(context.member.id);
    }

    return result;
}

/**
 * Build a PermissionContext from the parsed context and loaded permissions.
 *
 * @param {Object} context - Parsed context
 * @param {string} role - Resolved role name
 * @param {Object} unsafeAttrs - Attributes being modified
 * @returns {PermissionContext}
 */
function buildPermissionContext(context, role, unsafeAttrs) {
    let actorId = null;
    let isViaApiKey = false;

    // Determine actor ID
    if (context.user) {
        actorId = context.user;
    } else if (context.member && context.member.id) {
        actorId = context.member.id;
    }
    // For pure API key requests, actorId stays null

    // Check if request came through API key
    if (context.api_key) {
        isViaApiKey = true;
    }

    return new PermissionContext({
        role,
        actorId,
        isViaApiKey,
        unsafeAttrs: unsafeAttrs || {}
    });
}

/**
 * Check if an actor has permission to perform an action on an object.
 *
 * This is the main entry point for the new permission system.
 *
 * @param {Object|string} context - Request context (user, api_key, member, internal, etc.)
 * @param {string} action - Action type (e.g., 'browse', 'read', 'edit', 'add', 'destroy')
 * @param {string} objectType - Object type (e.g., 'post', 'user', 'comment')
 * @param {Object|string|null} modelOrId - Model instance or ID (optional)
 * @param {Object} unsafeAttrs - Attributes being modified (optional)
 * @returns {Promise<{excludedAttrs: string[], role: string|null}>} Result with excluded attributes and resolved role
 * @throws {NoPermissionError} When permission is denied
 */
async function checkPermission(context, action, objectType, modelOrId = null, unsafeAttrs = {}) {
    // Parse the context
    const parsedContext = parseContext(context);

    // Internal context always has permission
    if (parsedContext.internal) {
        return {excludedAttrs: [], role: 'internal'};
    }

    // Load permissions from providers
    const loadedPermissions = await loadPermissions(parsedContext);

    // Resolve the role to use for permission checks
    // When both user and api_key are present (staff API key), use user's role
    const role = resolveRole(loadedPermissions);

    // No role means no permission (anonymous/public access)
    if (!role) {
        throw new errors.NoPermissionError({
            message: tpl(messages.noPermissionToAction)
        });
    }

    // Step 1: Check base permission from JSON config (no Owner bypass!)
    const hasBasePermission = permissionConfig.hasPermission(role, action, objectType);

    // Step 2: Build the permission context
    const permCtx = buildPermissionContext(parsedContext, role, unsafeAttrs);

    // Step 3: Call permissibleV2 on the target model if it exists
    const TargetModel = getModel(objectType);
    if (TargetModel && typeof TargetModel.permissibleV2 === 'function') {
        const {result, excludedAttrs = []} = await TargetModel.permissibleV2(
            modelOrId,
            action,
            permCtx
        );

        // permissibleV2 can override the base permission
        if (result === 'deny') {
            throw new errors.NoPermissionError({
                message: tpl(messages.noPermissionToAction)
            });
        }

        if (result === 'grant') {
            // Granted regardless of base permission
            return {excludedAttrs, role};
        }

        // result === null means defer to base permission
        if (!hasBasePermission) {
            throw new errors.NoPermissionError({
                message: tpl(messages.noPermissionToAction)
            });
        }

        return {excludedAttrs, role};
    }

    // Step 4: No permissibleV2, use base permission only
    if (!hasBasePermission) {
        throw new errors.NoPermissionError({
            message: tpl(messages.noPermissionToAction)
        });
    }

    return {excludedAttrs: [], role};
}

module.exports = {
    checkPermission
};
