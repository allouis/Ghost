require('should');
const sinon = require('sinon');
const models = require('../../../../core/server/models');
const PermissionContext = require('../../../../core/server/services/permissions/PermissionContext');

describe('Unit: models/role', function () {
    before(function () {
        models.init();
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('permissibleV2', function () {
        function getRoleModel(name) {
            return {
                get: sinon.stub().callsFake((prop) => {
                    if (prop === 'name') {
                        return name;
                    }
                    return null;
                })
            };
        }

        describe('role assignment hierarchy', function () {
            it('Owner can assign Owner role', async function () {
                const roleModel = getRoleModel('Owner');
                const permCtx = new PermissionContext({
                    role: 'Owner',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Role.permissibleV2(roleModel, 'assign', permCtx);
                result.should.deepEqual({result: null});
            });

            it('Owner can assign Administrator role', async function () {
                const roleModel = getRoleModel('Administrator');
                const permCtx = new PermissionContext({
                    role: 'Owner',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Role.permissibleV2(roleModel, 'assign', permCtx);
                result.should.deepEqual({result: null});
            });

            it('Administrator cannot assign Owner role', async function () {
                const roleModel = getRoleModel('Owner');
                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Role.permissibleV2(roleModel, 'assign', permCtx);
                result.should.deepEqual({result: 'deny'});
            });

            it('Administrator can assign Administrator role', async function () {
                const roleModel = getRoleModel('Administrator');
                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Role.permissibleV2(roleModel, 'assign', permCtx);
                result.should.deepEqual({result: null});
            });

            it('Administrator can assign Editor role', async function () {
                const roleModel = getRoleModel('Editor');
                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Role.permissibleV2(roleModel, 'assign', permCtx);
                result.should.deepEqual({result: null});
            });

            it('Editor cannot assign Administrator role', async function () {
                const roleModel = getRoleModel('Administrator');
                const permCtx = new PermissionContext({
                    role: 'Editor',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Role.permissibleV2(roleModel, 'assign', permCtx);
                result.should.deepEqual({result: 'deny'});
            });

            it('Editor can assign Author role', async function () {
                const roleModel = getRoleModel('Author');
                const permCtx = new PermissionContext({
                    role: 'Editor',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Role.permissibleV2(roleModel, 'assign', permCtx);
                result.should.deepEqual({result: null});
            });

            it('Super Editor can assign Author role', async function () {
                const roleModel = getRoleModel('Author');
                const permCtx = new PermissionContext({
                    role: 'Super Editor',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Role.permissibleV2(roleModel, 'assign', permCtx);
                result.should.deepEqual({result: null});
            });

            it('Author cannot assign any role', async function () {
                const roleModel = getRoleModel('Contributor');
                const permCtx = new PermissionContext({
                    role: 'Author',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Role.permissibleV2(roleModel, 'assign', permCtx);
                result.should.deepEqual({result: 'deny'});
            });
        });

        describe('API key restrictions', function () {
            it('API key cannot assign Owner role', async function () {
                const roleModel = getRoleModel('Owner');
                const permCtx = new PermissionContext({
                    role: 'Admin Integration',
                    actorId: null,
                    isViaApiKey: true
                });

                const result = await models.Role.permissibleV2(roleModel, 'assign', permCtx);
                result.should.deepEqual({result: 'deny'});
            });

            it('API key can assign Administrator role', async function () {
                const roleModel = getRoleModel('Administrator');
                const permCtx = new PermissionContext({
                    role: 'Admin Integration',
                    actorId: null,
                    isViaApiKey: true
                });

                const result = await models.Role.permissibleV2(roleModel, 'assign', permCtx);
                result.should.deepEqual({result: null});
            });
        });

        describe('non-assign actions', function () {
            it('defers to base permission for browse', async function () {
                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Role.permissibleV2(null, 'browse', permCtx);
                result.should.deepEqual({result: null});
            });

            it('defers to base permission for read', async function () {
                const permCtx = new PermissionContext({
                    role: 'Editor',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Role.permissibleV2(null, 'read', permCtx);
                result.should.deepEqual({result: null});
            });
        });

        describe('model resolution', function () {
            it('loads model from ID string', async function () {
                const roleModel = getRoleModel('Editor');
                const findOneStub = sinon.stub(models.Role, 'findOne').resolves(roleModel);

                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Role.permissibleV2('role_1', 'assign', permCtx);
                result.should.deepEqual({result: null});

                findOneStub.calledOnce.should.be.true();
                findOneStub.calledWith({id: 'role_1', status: 'all'}).should.be.true();
            });

            it('throws NotFoundError when role not found', async function () {
                sinon.stub(models.Role, 'findOne').resolves(null);

                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                try {
                    await models.Role.permissibleV2('nonexistent', 'assign', permCtx);
                    throw new Error('Should have thrown');
                } catch (err) {
                    err.message.should.eql('Role not found');
                }
            });
        });
    });
});
