const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const security = require('@tryghost/security');
const moment = require('moment');

const settingsCache = require('../../shared/settings-cache');
const limitService = require('../services/limits');
const ghostBookshelf = require('./base');
const {setIsRoles} = require('./role-utils');

const messages = {
    notEnoughPermission: 'You do not have permission to perform this action',
    roleNotFound: 'Role not found',
    notAllowedToInviteOwner: 'Not allowed to invite an owner user.',
    notAllowedToInvite: 'Not allowed to invite this role.'
};

let Invite;
let Invites;

Invite = ghostBookshelf.Model.extend({
    tableName: 'invites',

    actionsCollectCRUD: true,
    actionsResourceType: 'invite',
    actionsExtraContext: ['status', 'role_id'],

    toJSON: function (unfilteredOptions) {
        const attrs = ghostBookshelf.Model.prototype.toJSON.call(this, unfilteredOptions);

        delete attrs.token;
        return attrs;
    }
}, {
    orderDefaultOptions: function orderDefaultOptions() {
        return {};
    },

    add: function add(data, unfilteredOptions) {
        const options = Invite.filterOptions(unfilteredOptions, 'add');
        data = data || {};

        if (!options.context || !options.context.internal) {
            data.status = 'pending';
        }

        data.expires = moment().add(1, 'week').valueOf();
        data.token = security.tokens.generateFromEmail({
            email: data.email,
            expires: data.expires,
            secret: settingsCache.get('db_hash')
        });

        return ghostBookshelf.Model.add.call(this, data, options);
    },

    async permissible(inviteModel, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
        const isAdd = (action === 'add');

        if (!isAdd) {
            if (hasUserPermission && hasApiKeyPermission) {
                return Promise.resolve();
            }

            return Promise.reject(new errors.NoPermissionError({
                message: tpl(messages.notEnoughPermission)
            }));
        }

        // CASE: make sure user is allowed to add a user with this role
        return ghostBookshelf.model('Role')
            .findOne({id: unsafeAttrs.role_id})
            .then(async (roleToInvite) => {
                if (!roleToInvite) {
                    return Promise.reject(new errors.NotFoundError({
                        message: tpl(messages.roleNotFound)
                    }));
                }

                if (roleToInvite.get('name') === 'Owner') {
                    return Promise.reject(new errors.NoPermissionError({
                        message: tpl(messages.notAllowedToInviteOwner)
                    }));
                }

                if (isAdd && limitService.isLimited('staff') && roleToInvite.get('name') !== 'Contributor') {
                    // CASE: if your site is limited to a certain number of staff users
                    // Inviting a new user requires we check we won't go over the limit
                    await limitService.errorIfWouldGoOverLimit('staff');
                }

                let allowed = [];
                if (loadedPermissions.user) {
                    const {isOwner, isAdmin, isEitherEditor} = setIsRoles(loadedPermissions);
                    if (isOwner || isAdmin) {
                        allowed = ['Administrator', 'Editor', 'Author', 'Contributor', 'Super Editor'];
                    } else if (isEitherEditor) {
                        allowed = ['Author', 'Contributor'];
                    }
                } else if (loadedPermissions.apiKey) {
                    allowed = ['Editor', 'Author', 'Contributor', 'Super Editor'];
                }

                if (allowed.indexOf(roleToInvite.get('name')) === -1) {
                    throw new errors.NoPermissionError({
                        message: tpl(messages.notAllowedToInvite)
                    });
                }

                if (hasUserPermission && hasApiKeyPermission) {
                    return Promise.resolve();
                }

                return Promise.reject(new errors.NoPermissionError({
                    message: tpl(messages.notEnoughPermission)
                }));
            });
    },

    /**
     * New permission check method with simplified interface.
     *
     * Returns: { result: 'grant' | 'deny' | null }
     * - 'grant': Permission granted regardless of base permission
     * - 'deny': Permission denied
     * - null: Defer to base permission check
     *
     * @param {Object|string} inviteModelOrId - Invite model or ID (unused for most actions)
     * @param {string} action - Action being performed (add, browse, etc.)
     * @param {PermissionContext} permCtx - Permission context with role, isViaApiKey, unsafeAttrs, etc.
     * @returns {Promise<{result: string|null}>}
     */
    async permissibleV2(inviteModelOrId, action, permCtx) {
        // For non-add actions, defer to base permission
        if (action !== 'add') {
            return {result: null};
        }

        // Get the role being invited to
        const roleToInvite = await ghostBookshelf.model('Role')
            .findOne({id: permCtx.unsafeAttrs.role_id});

        if (!roleToInvite) {
            throw new errors.NotFoundError({
                message: tpl(messages.roleNotFound)
            });
        }

        const targetRoleName = roleToInvite.get('name');

        // Cannot invite Owner
        if (targetRoleName === 'Owner') {
            return {result: 'deny'};
        }

        // Check staff limits for non-Contributor roles
        if (limitService.isLimited('staff') && targetRoleName !== 'Contributor') {
            await limitService.errorIfWouldGoOverLimit('staff');
        }

        // Define invitation hierarchy based on actor type
        let allowedRoles = [];

        if (permCtx.isViaApiKey) {
            // API keys can invite Editor, Author, Contributor, Super Editor (not Admin)
            allowedRoles = ['Editor', 'Author', 'Contributor', 'Super Editor'];
        } else {
            // Staff user hierarchy
            const inviteHierarchy = {
                Owner: ['Administrator', 'Editor', 'Author', 'Contributor', 'Super Editor'],
                Administrator: ['Administrator', 'Editor', 'Author', 'Contributor', 'Super Editor'],
                'Super Editor': ['Author', 'Contributor'],
                Editor: ['Author', 'Contributor'],
                Author: [],
                Contributor: []
            };

            allowedRoles = inviteHierarchy[permCtx.role] || [];
        }

        // Check if allowed to invite this role
        if (!allowedRoles.includes(targetRoleName)) {
            return {result: 'deny'};
        }

        // Defer to base permission for final check
        return {result: null};
    }
});

Invites = ghostBookshelf.Collection.extend({
    model: Invite
});

module.exports = {
    Invite: ghostBookshelf.model('Invite', Invite),
    Invites: ghostBookshelf.collection('Invites', Invites)
};
