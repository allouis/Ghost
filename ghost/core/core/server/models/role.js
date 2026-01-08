const _ = require('lodash');
const ghostBookshelf = require('./base');
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const {setIsRoles} = require('./role-utils');

const messages = {
    roleNotFound: 'Role not found',
    notEnoughPermission: 'You do not have permission to perform this action'
};

let Role;
let Roles;

Role = ghostBookshelf.Model.extend({

    tableName: 'roles',

    relationships: ['permissions'],

    relationshipBelongsTo: {
        permissions: 'permissions'
    },

    users: function users() {
        return this.belongsToMany('User');
    },

    permissions: function permissions() {
        return this.belongsToMany('Permission');
    },

    api_keys: function apiKeys() {
        return this.hasMany('ApiKey');
    }
}, {
    /**
     * Returns an array of keys permitted in a method's `options` hash, depending on the current method.
     * @param {String} methodName The name of the method to check valid options for.
     * @return {Array} Keys allowed in the `options` hash of the model's method.
     */
    permittedOptions: function permittedOptions(methodName) {
        let options = ghostBookshelf.Model.permittedOptions.call(this, methodName);

        // allowlists for the `options` hash argument on methods, by method name.
        // these are the only options that can be passed to Bookshelf / Knex.
        const validOptions = {
            findOne: ['withRelated'],
            findAll: ['withRelated']
        };

        if (validOptions[methodName]) {
            options = options.concat(validOptions[methodName]);
        }

        return options;
    },

    permissible: function permissible(roleModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
        // If we passed in an id instead of a model, get the model
        // then check the permissions
        if (_.isNumber(roleModelOrId) || _.isString(roleModelOrId)) {
            // Get the actual role model
            return this.findOne({id: roleModelOrId, status: 'all'})
                .then((foundRoleModel) => {
                    if (!foundRoleModel) {
                        throw new errors.NotFoundError({
                            message: tpl(messages.roleNotFound)
                        });
                    }

                    // Grab the original args without the first one
                    const origArgs = _.toArray(arguments).slice(1);

                    return this.permissible(foundRoleModel, ...origArgs);
                });
        }

        const roleModel = roleModelOrId;

        if (action === 'assign' && loadedPermissions.user) {
            const {isOwner, isAdmin, isEitherEditor} = setIsRoles(loadedPermissions);
            let checkAgainst;
            if (isOwner) {
                checkAgainst = ['Owner', 'Administrator', 'Super Editor', 'Editor', 'Author', 'Contributor'];
            } else if (isAdmin) {
                checkAgainst = ['Administrator', 'Super Editor', 'Editor', 'Author', 'Contributor'];
            } else if (isEitherEditor) {
                checkAgainst = ['Author', 'Contributor'];
            }

            // Role in the list of permissible roles
            hasUserPermission = roleModelOrId && _.includes(checkAgainst, roleModel.get('name'));
        }

        if (action === 'assign' && loadedPermissions.apiKey) {
            // apiKey cannot 'assign' the 'Owner' role
            if (roleModel.get('name') === 'Owner') {
                return Promise.reject(new errors.NoPermissionError({
                    message: tpl(messages.notEnoughPermission)
                }));
            }
        }

        if (hasUserPermission && hasApiKeyPermission) {
            return Promise.resolve();
        }

        return Promise.reject(new errors.NoPermissionError({message: tpl(messages.notEnoughPermission)}));
    },

    /**
     * New permission check method with simplified interface.
     *
     * Returns: { result: 'grant' | 'deny' | null }
     * - 'grant': Permission granted regardless of base permission
     * - 'deny': Permission denied
     * - null: Defer to base permission check
     *
     * @param {Object|string|number} roleModelOrId - Role model or ID
     * @param {string} action - Action being performed (assign, browse, etc.)
     * @param {PermissionContext} permCtx - Permission context with role, isViaApiKey, etc.
     * @returns {Promise<{result: string|null}>}
     */
    async permissibleV2(roleModelOrId, action, permCtx) {
        // For non-assign actions, defer to base permission
        if (action !== 'assign') {
            return {result: null};
        }

        // Load model if given an ID
        let roleModel = roleModelOrId;
        if (typeof roleModelOrId === 'string' || typeof roleModelOrId === 'number') {
            roleModel = await this.findOne({id: roleModelOrId, status: 'all'});
            if (!roleModel) {
                throw new errors.NotFoundError({
                    message: tpl(messages.roleNotFound)
                });
            }
        }

        const targetRoleName = roleModel.get('name');

        // API key cannot assign Owner role
        if (permCtx.isViaApiKey && targetRoleName === 'Owner') {
            return {result: 'deny'};
        }

        // For API keys (except Owner assignment blocked above), defer to base permission
        // API keys don't have the same role hierarchy restrictions as users
        if (permCtx.isViaApiKey) {
            return {result: null};
        }

        // Define role assignment hierarchy for staff users
        // Each role can assign roles at or below their level
        const roleHierarchy = {
            Owner: ['Owner', 'Administrator', 'Super Editor', 'Editor', 'Author', 'Contributor'],
            Administrator: ['Administrator', 'Super Editor', 'Editor', 'Author', 'Contributor'],
            'Super Editor': ['Author', 'Contributor'],
            Editor: ['Author', 'Contributor'],
            Author: [],
            Contributor: []
        };

        const actorRole = permCtx.role;
        const allowedRoles = roleHierarchy[actorRole] || [];

        // Check if actor's role can assign the target role
        if (!allowedRoles.includes(targetRoleName)) {
            return {result: 'deny'};
        }

        // Defer to base permission for final check
        return {result: null};
    }
});

Roles = ghostBookshelf.Collection.extend({
    model: Role
});

module.exports = {
    Role: ghostBookshelf.model('Role', Role),
    Roles: ghostBookshelf.collection('Roles', Roles)
};
