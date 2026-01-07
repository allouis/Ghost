/**
 * Permission Config Module
 *
 * This module provides a JSON-based permission lookup system that replaces
 * database queries for permission checks. It parses the fixtures.json file
 * at module load time and builds an in-memory map of role → action → object
 * permissions.
 *
 * Part of the permissions system refactor (Phase 1, Step 1.1).
 */

import path from 'path';

interface PermissionEntry {
    object_type: string;
    action_type: string;
    name: string;
}

interface ModelFixture {
    name: string;
    entries: PermissionEntry[];
}

interface RelationEntry {
    from: {
        model: string;
        relation: string;
    };
    to: {
        model: string;
    };
    entries: Record<string, RolePermissionValue>;
}

interface Fixtures {
    models: ModelFixture[];
    relations: RelationEntry[];
}

type RolePermissionValue = 'all' | string | string[];
type RolePermissions = Record<string, RolePermissionValue>;
type RolePermissionsMap = Record<string, RolePermissions>;
type ObjectActionsMap = Record<string, string[]>;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fixtures: Fixtures = require(path.join(__dirname, '../../data/schema/fixtures/fixtures.json'));

/**
 * Parses the fixtures.json relations section and builds a map of
 * role name → { objectType → actions }
 *
 * The fixtures format supports:
 * - { "all": "all" } - superuser pattern, all actions on all objects
 * - "all" shorthand meaning all available actions for that object
 * - Array of specific actions like ["browse", "read", "edit"]
 * - Single action string like "read"
 */
function buildRolePermissions(): RolePermissionsMap {
    const perms: RolePermissionsMap = {};

    // Find the Role → Permission relation in fixtures
    const rolePermRelation = fixtures.relations.find(function (rel) {
        return rel.from.model === 'Role' &&
            rel.from.relation === 'permissions' &&
            rel.to.model === 'Permission';
    });

    if (!rolePermRelation) {
        return perms;
    }

    // Copy all entries from fixtures
    for (const [roleName, rolePerms] of Object.entries(rolePermRelation.entries)) {
        perms[roleName] = rolePerms;
    }

    // Owner role should exist in fixtures now (mirrors Administrator)
    // This fallback is kept for backwards compatibility with older fixtures
    if (perms.Administrator && !perms.Owner) {
        perms.Owner = {...perms.Administrator};
    }

    // Add Member pseudo-role with comment permissions
    // Members can browse, read, edit, add, destroy, like, unlike, report comments
    // but NOT moderate
    if (!perms.Member) {
        perms.Member = {
            comment: ['browse', 'read', 'edit', 'add', 'destroy', 'like', 'unlike', 'report']
        };
    }

    return perms;
}

/**
 * Builds a map of object_type → [available action_types]
 * by scanning all Permission entries in fixtures.
 */
function buildObjectActions(): ObjectActionsMap {
    const actions: ObjectActionsMap = {};

    // Find the Permission model fixtures
    const permissionFixture = fixtures.models.find(m => m.name === 'Permission');
    if (!permissionFixture) {
        return actions;
    }

    for (const entry of permissionFixture.entries) {
        const objectType = entry.object_type;
        const actionType = entry.action_type;

        if (!actions[objectType]) {
            actions[objectType] = [];
        }

        if (!actions[objectType].includes(actionType)) {
            actions[objectType].push(actionType);
        }
    }

    return actions;
}

// Build the role → permissions map at module load time
const rolePermissions = buildRolePermissions();

// Build the object → actions map for looking up all valid actions
const objectActions = buildObjectActions();

/**
 * Check if a role has permission to perform an action on an object type.
 */
export function hasPermission(role: string, actionType: string, objectType: string): boolean {
    const rolePerms = rolePermissions[role];
    if (!rolePerms) {
        return false;
    }

    // Handle { "all": "all" } superuser pattern - all actions on all objects
    // Check if the action/object exists in the system to prevent typos granting access
    if (rolePerms.all === 'all') {
        const validActions = objectActions[objectType];
        return validActions ? validActions.includes(actionType) : false;
    }

    const objectPerms = rolePerms[objectType];
    if (!objectPerms) {
        return false;
    }

    // Handle "all" shorthand - check if action exists for this object type
    if (objectPerms === 'all') {
        const validActions = objectActions[objectType];
        return validActions ? validActions.includes(actionType) : false;
    }

    // Handle array of specific actions
    if (Array.isArray(objectPerms)) {
        return objectPerms.includes(actionType);
    }

    // Handle single action string
    return objectPerms === actionType;
}

/**
 * Get all valid actions for a given object type.
 */
export function getAllActionsForObject(objectType: string): string[] {
    return objectActions[objectType] || [];
}

/**
 * Get the raw permission definition for a role.
 */
export function getRolePermissions(role: string): RolePermissions | undefined {
    return rolePermissions[role];
}
