const assert = require('node:assert/strict');
require('should');
const errors = require('@tryghost/errors');
const sinon = require('sinon');
const models = require('../../../../core/server/models');
const settingsCache = require('../../../../core/shared/settings-cache');
const PermissionContext = require('../../../../core/server/services/permissions/PermissionContext');
const limitService = require('../../../../core/server/services/limits');

describe('Unit: models/invite', function () {
    before(function () {
        models.init();
    });

    beforeEach(function () {
        sinon.stub(settingsCache, 'get').withArgs('db_hash').returns('12345678');
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('permissible', function () {
        describe('action: add', function () {
            let inviteModel;
            let context;
            let unsafeAttrs;
            let roleModel;
            let loadedPermissions;

            before(function () {
                inviteModel = {};
                context = {};
                unsafeAttrs = {role_id: 'role_id'};
                roleModel = sinon.stub();
                roleModel.get = sinon.stub();
                loadedPermissions = {
                    user: {
                        roles: []
                    }
                };
            });

            it('role does not exist', function () {
                sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(null);

                return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs)
                    .then(Promise.reject)
                    .catch((err) => {
                        assert.equal(err instanceof errors.NotFoundError, true);
                    });
            });

            it('invite owner', function () {
                sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                roleModel.get.withArgs('name').returns('Owner');

                return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs)
                    .then(Promise.reject)
                    .catch((err) => {
                        assert.equal(err instanceof errors.NoPermissionError, true);
                    });
            });

            describe('as owner', function () {
                beforeEach(function () {
                    loadedPermissions.user.roles = [{name: 'Owner'}];
                });

                it('invite administrator', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Administrator');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, true, true, true);
                });

                it('invite editor', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Editor');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, true, true, true);
                });

                it('invite author', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Author');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, true, true, true);
                });

                it('invite contributor', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Contributor');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, true, true, true);
                });
            });

            describe('as administrator', function () {
                beforeEach(function () {
                    loadedPermissions.user.roles = [{name: 'Administrator'}];
                });

                it('invite administrator', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Administrator');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, true, true, true);
                });

                it('invite editor', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Editor');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, true, true, true);
                });

                it('invite author', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Author');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, true, true, true);
                });

                it('invite contributor', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Contributor');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, true, true, true);
                });
            });

            describe('as editor', function () {
                beforeEach(function () {
                    loadedPermissions.user.roles = [{name: 'Editor'}];
                });

                it('invite administrator', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Administrator');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, true, true, true)
                        .then(Promise.reject)
                        .catch((err) => {
                            assert.equal(err instanceof errors.NoPermissionError, true);
                        });
                });

                it('invite editor', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Editor');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, true, true, true)
                        .then(Promise.reject)
                        .catch((err) => {
                            assert.equal(err instanceof errors.NoPermissionError, true);
                        });
                });

                it('invite editor with staff token', function () {
                    loadedPermissions.apiKey = {
                        roles: [{name: 'Admin Integration'}]
                    };
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Editor');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, true, true, true)
                        .then(Promise.reject)
                        .catch((err) => {
                            assert.equal(err instanceof errors.NoPermissionError, true);
                            delete loadedPermissions.apiKey;
                        });
                });

                it('invite author', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Author');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, true, true, true);
                });

                it('invite contributor', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Contributor');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, true, true, true);
                });
            });

            describe('as author', function () {
                beforeEach(function () {
                    loadedPermissions.user.roles = [{name: 'Author'}];
                });

                it('invite administrator', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Administrator');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, false, false, true)
                        .then(Promise.reject)
                        .catch((err) => {
                            assert.equal(err instanceof errors.NoPermissionError, true);
                        });
                });

                it('invite editor', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Editor');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, false, false, true)
                        .then(Promise.reject)
                        .catch((err) => {
                            assert.equal(err instanceof errors.NoPermissionError, true);
                        });
                });

                it('invite author', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Author');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, false, false, true)
                        .then(Promise.reject)
                        .catch((err) => {
                            assert.equal(err instanceof errors.NoPermissionError, true);
                        });
                });

                it('invite contributor', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Contributor');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, false, false, true)
                        .then(Promise.reject)
                        .catch((err) => {
                            assert.equal(err instanceof errors.NoPermissionError, true);
                        });
                });
            });

            describe('as contributor', function () {
                beforeEach(function () {
                    loadedPermissions.user.roles = [{name: 'Contributor'}];
                });

                it('invite administrator', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Administrator');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, false, false, true)
                        .then(Promise.reject)
                        .catch((err) => {
                            assert.equal(err instanceof errors.NoPermissionError, true);
                        });
                });

                it('invite editor', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Editor');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, false, false, true)
                        .then(Promise.reject)
                        .catch((err) => {
                            assert.equal(err instanceof errors.NoPermissionError, true);
                        });
                });

                it('invite author', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Author');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, false, false, true)
                        .then(Promise.reject)
                        .catch((err) => {
                            assert.equal(err instanceof errors.NoPermissionError, true);
                        });
                });

                it('invite contributor', function () {
                    sinon.stub(models.Role, 'findOne').withArgs({id: 'role_id'}).resolves(roleModel);
                    roleModel.get.withArgs('name').returns('Contributor');

                    return models.Invite.permissible(inviteModel, 'add', context, unsafeAttrs, loadedPermissions, false, false, true)
                        .then(Promise.reject)
                        .catch((err) => {
                            assert.equal(err instanceof errors.NoPermissionError, true);
                        });
                });
            });
        });
    });

    describe('permissibleV2', function () {
        let roleModel;

        beforeEach(function () {
            roleModel = {
                get: sinon.stub()
            };
            sinon.stub(limitService, 'isLimited').returns(false);
        });

        describe('non-add actions', function () {
            it('defers to base permission for browse', async function () {
                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Invite.permissibleV2(null, 'browse', permCtx);
                result.should.deepEqual({result: null});
            });

            it('defers to base permission for destroy', async function () {
                const permCtx = new PermissionContext({
                    role: 'Editor',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Invite.permissibleV2(null, 'destroy', permCtx);
                result.should.deepEqual({result: null});
            });
        });

        describe('add action - role lookup', function () {
            it('throws NotFoundError when role not found', async function () {
                sinon.stub(models.Role, 'findOne').resolves(null);

                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false,
                    unsafeAttrs: {role_id: 'nonexistent'}
                });

                try {
                    await models.Invite.permissibleV2(null, 'add', permCtx);
                    throw new Error('Should have thrown');
                } catch (err) {
                    err.message.should.eql('Role not found');
                }
            });

            it('denies inviting Owner role', async function () {
                roleModel.get.withArgs('name').returns('Owner');
                sinon.stub(models.Role, 'findOne').resolves(roleModel);

                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false,
                    unsafeAttrs: {role_id: 'owner_role_id'}
                });

                const result = await models.Invite.permissibleV2(null, 'add', permCtx);
                result.should.deepEqual({result: 'deny'});
            });
        });

        describe('add action - staff limits', function () {
            it('throws error if staff limit would be exceeded for non-Contributor', async function () {
                roleModel.get.withArgs('name').returns('Editor');
                sinon.stub(models.Role, 'findOne').resolves(roleModel);
                limitService.isLimited.returns(true);
                sinon.stub(limitService, 'errorIfWouldGoOverLimit').rejects(new Error('Staff limit reached'));

                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false,
                    unsafeAttrs: {role_id: 'editor_role_id'}
                });

                try {
                    await models.Invite.permissibleV2(null, 'add', permCtx);
                    throw new Error('Should have thrown');
                } catch (err) {
                    err.message.should.eql('Staff limit reached');
                }
            });

            it('does not check limit for Contributor role', async function () {
                roleModel.get.withArgs('name').returns('Contributor');
                sinon.stub(models.Role, 'findOne').resolves(roleModel);
                limitService.isLimited.returns(true);
                const errorStub = sinon.stub(limitService, 'errorIfWouldGoOverLimit').rejects(new Error('Staff limit reached'));

                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false,
                    unsafeAttrs: {role_id: 'contributor_role_id'}
                });

                const result = await models.Invite.permissibleV2(null, 'add', permCtx);
                result.should.deepEqual({result: null});
                errorStub.called.should.be.false();
            });
        });

        describe('add action - hierarchy (Owner)', function () {
            it('Owner can invite Administrator', async function () {
                roleModel.get.withArgs('name').returns('Administrator');
                sinon.stub(models.Role, 'findOne').resolves(roleModel);

                const permCtx = new PermissionContext({
                    role: 'Owner',
                    actorId: 'user_123',
                    isViaApiKey: false,
                    unsafeAttrs: {role_id: 'admin_role_id'}
                });

                const result = await models.Invite.permissibleV2(null, 'add', permCtx);
                result.should.deepEqual({result: null});
            });

            it('Owner can invite Editor', async function () {
                roleModel.get.withArgs('name').returns('Editor');
                sinon.stub(models.Role, 'findOne').resolves(roleModel);

                const permCtx = new PermissionContext({
                    role: 'Owner',
                    actorId: 'user_123',
                    isViaApiKey: false,
                    unsafeAttrs: {role_id: 'editor_role_id'}
                });

                const result = await models.Invite.permissibleV2(null, 'add', permCtx);
                result.should.deepEqual({result: null});
            });
        });

        describe('add action - hierarchy (Administrator)', function () {
            it('Administrator can invite Administrator', async function () {
                roleModel.get.withArgs('name').returns('Administrator');
                sinon.stub(models.Role, 'findOne').resolves(roleModel);

                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false,
                    unsafeAttrs: {role_id: 'admin_role_id'}
                });

                const result = await models.Invite.permissibleV2(null, 'add', permCtx);
                result.should.deepEqual({result: null});
            });

            it('Administrator can invite Editor', async function () {
                roleModel.get.withArgs('name').returns('Editor');
                sinon.stub(models.Role, 'findOne').resolves(roleModel);

                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false,
                    unsafeAttrs: {role_id: 'editor_role_id'}
                });

                const result = await models.Invite.permissibleV2(null, 'add', permCtx);
                result.should.deepEqual({result: null});
            });
        });

        describe('add action - hierarchy (Editor)', function () {
            it('Editor cannot invite Administrator', async function () {
                roleModel.get.withArgs('name').returns('Administrator');
                sinon.stub(models.Role, 'findOne').resolves(roleModel);

                const permCtx = new PermissionContext({
                    role: 'Editor',
                    actorId: 'user_123',
                    isViaApiKey: false,
                    unsafeAttrs: {role_id: 'admin_role_id'}
                });

                const result = await models.Invite.permissibleV2(null, 'add', permCtx);
                result.should.deepEqual({result: 'deny'});
            });

            it('Editor can invite Author', async function () {
                roleModel.get.withArgs('name').returns('Author');
                sinon.stub(models.Role, 'findOne').resolves(roleModel);

                const permCtx = new PermissionContext({
                    role: 'Editor',
                    actorId: 'user_123',
                    isViaApiKey: false,
                    unsafeAttrs: {role_id: 'author_role_id'}
                });

                const result = await models.Invite.permissibleV2(null, 'add', permCtx);
                result.should.deepEqual({result: null});
            });
        });

        describe('add action - API key restrictions', function () {
            it('API key cannot invite Administrator', async function () {
                roleModel.get.withArgs('name').returns('Administrator');
                sinon.stub(models.Role, 'findOne').resolves(roleModel);

                const permCtx = new PermissionContext({
                    role: 'Admin Integration',
                    actorId: null,
                    isViaApiKey: true,
                    unsafeAttrs: {role_id: 'admin_role_id'}
                });

                const result = await models.Invite.permissibleV2(null, 'add', permCtx);
                result.should.deepEqual({result: 'deny'});
            });

            it('API key can invite Editor', async function () {
                roleModel.get.withArgs('name').returns('Editor');
                sinon.stub(models.Role, 'findOne').resolves(roleModel);

                const permCtx = new PermissionContext({
                    role: 'Admin Integration',
                    actorId: null,
                    isViaApiKey: true,
                    unsafeAttrs: {role_id: 'editor_role_id'}
                });

                const result = await models.Invite.permissibleV2(null, 'add', permCtx);
                result.should.deepEqual({result: null});
            });

            it('API key can invite Author', async function () {
                roleModel.get.withArgs('name').returns('Author');
                sinon.stub(models.Role, 'findOne').resolves(roleModel);

                const permCtx = new PermissionContext({
                    role: 'Admin Integration',
                    actorId: null,
                    isViaApiKey: true,
                    unsafeAttrs: {role_id: 'author_role_id'}
                });

                const result = await models.Invite.permissibleV2(null, 'add', permCtx);
                result.should.deepEqual({result: null});
            });
        });
    });
});
