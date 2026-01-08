const should = require('should');
const sinon = require('sinon');
const models = require('../../../../../core/server/models');
const canThisV2 = require('../../../../../core/server/services/permissions/can-this-v2');
const permissionConfig = require('../../../../../core/server/services/permissions/permission-config');
const providers = require('../../../../../core/server/services/permissions/providers');

describe('can-this-v2', function () {
    before(function () {
        models.init();
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('checkPermission', function () {
        describe('internal context', function () {
            it('grants permission for internal context', async function () {
                const result = await canThisV2.checkPermission(
                    {internal: true},
                    'edit',
                    'post'
                );

                should.exist(result);
                result.should.deepEqual({excludedAttrs: [], role: 'internal'});
            });

            it('grants permission for internal context string', async function () {
                const result = await canThisV2.checkPermission(
                    'internal',
                    'edit',
                    'post'
                );

                should.exist(result);
                result.should.deepEqual({excludedAttrs: [], role: 'internal'});
            });
        });

        describe('no context (public/anonymous)', function () {
            it('denies permission when no user/api_key/member in context', async function () {
                await canThisV2.checkPermission({}, 'edit', 'post')
                    .should.be.rejectedWith({errorType: 'NoPermissionError'});
            });

            it('denies permission when only external flag is set', async function () {
                await canThisV2.checkPermission({external: true}, 'edit', 'post')
                    .should.be.rejectedWith({errorType: 'NoPermissionError'});
            });
        });

        describe('user-based permissions', function () {
            it('grants permission when user has role with permission in JSON config', async function () {
                sinon.stub(providers, 'user').resolves({
                    permissions: [],
                    roles: [{name: 'Administrator'}]
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(true);

                const result = await canThisV2.checkPermission(
                    {user: 'user-id-1'},
                    'edit',
                    'post'
                );

                should.exist(result);
                result.should.deepEqual({excludedAttrs: [], role: 'Administrator'});

                permissionConfig.hasPermission.calledWith('Administrator', 'edit', 'post').should.be.true();
            });

            it('denies permission when user role lacks permission in JSON config', async function () {
                sinon.stub(providers, 'user').resolves({
                    permissions: [],
                    roles: [{name: 'Contributor'}]
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(false);

                await canThisV2.checkPermission({user: 'user-id-1'}, 'edit', 'post')
                    .should.be.rejectedWith({errorType: 'NoPermissionError'});

                permissionConfig.hasPermission.calledWith('Contributor', 'edit', 'post').should.be.true();
            });

            it('checks Owner role permissions explicitly (no bypass)', async function () {
                sinon.stub(providers, 'user').resolves({
                    permissions: [],
                    roles: [{name: 'Owner'}]
                });

                const hasPermissionStub = sinon.stub(permissionConfig, 'hasPermission').returns(true);

                const result = await canThisV2.checkPermission(
                    {user: 'owner-user-id'},
                    'edit',
                    'setting'
                );

                should.exist(result);
                hasPermissionStub.calledWith('Owner', 'edit', 'setting').should.be.true();
            });

            it('uses first role if user has multiple roles', async function () {
                sinon.stub(providers, 'user').resolves({
                    permissions: [],
                    roles: [{name: 'Editor'}, {name: 'Author'}]
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(true);

                await canThisV2.checkPermission({user: 'user-id-1'}, 'edit', 'post');

                permissionConfig.hasPermission.calledWith('Editor', 'edit', 'post').should.be.true();
            });
        });

        describe('api key-based permissions', function () {
            it('grants permission when api key role has permission', async function () {
                sinon.stub(providers, 'apiKey').resolves({
                    permissions: [],
                    roles: [{name: 'Admin Integration'}]
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(true);

                const result = await canThisV2.checkPermission(
                    {api_key: {id: 'api-key-id', type: 'admin'}},
                    'edit',
                    'post'
                );

                should.exist(result);
                result.should.deepEqual({excludedAttrs: [], role: 'Admin Integration'});
            });

            it('denies permission when api key role lacks permission', async function () {
                sinon.stub(providers, 'apiKey').resolves({
                    permissions: [],
                    roles: [{name: 'Content Integration'}]
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(false);

                await canThisV2.checkPermission(
                    {api_key: {id: 'api-key-id', type: 'content'}},
                    'edit',
                    'post'
                ).should.be.rejectedWith({errorType: 'NoPermissionError'});
            });
        });

        describe('member-based permissions', function () {
            it('grants permission when Member role has permission for action', async function () {
                sinon.stub(providers, 'member').resolves({
                    permissions: []
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(true);

                const result = await canThisV2.checkPermission(
                    {member: {id: 'member-id-1'}},
                    'add',
                    'comment'
                );

                should.exist(result);
                permissionConfig.hasPermission.calledWith('Member', 'add', 'comment').should.be.true();
            });

            it('denies permission when Member role lacks permission', async function () {
                sinon.stub(providers, 'member').resolves({
                    permissions: []
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(false);

                await canThisV2.checkPermission(
                    {member: {id: 'member-id-1'}},
                    'edit',
                    'post'
                ).should.be.rejectedWith({errorType: 'NoPermissionError'});
            });
        });

        describe('combined user + api key (staff API key)', function () {
            it('uses user role when both user and api_key are present', async function () {
                sinon.stub(providers, 'user').resolves({
                    permissions: [],
                    roles: [{name: 'Editor'}]
                });

                sinon.stub(providers, 'apiKey').resolves({
                    permissions: [],
                    roles: [{name: 'Admin Integration'}]
                });

                const hasPermissionStub = sinon.stub(permissionConfig, 'hasPermission').returns(true);

                await canThisV2.checkPermission(
                    {user: 'user-id-1', api_key: {id: 'api-key-id'}},
                    'edit',
                    'post'
                );

                hasPermissionStub.calledWith('Editor', 'edit', 'post').should.be.true();
                hasPermissionStub.calledWith('Admin Integration', 'edit', 'post').should.be.false();
            });
        });

        describe('permissibleV2 integration', function () {
            it('calls permissibleV2 on the target model if available', async function () {
                sinon.stub(providers, 'user').resolves({
                    permissions: [],
                    roles: [{name: 'Administrator'}]
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(true);

                const permissibleV2Stub = sinon.stub(models.Post, 'permissibleV2').resolves({
                    result: null
                });

                await canThisV2.checkPermission(
                    {user: 'user-id-1'},
                    'edit',
                    'post',
                    'post-id-1',
                    {title: 'New Title'}
                );

                permissibleV2Stub.calledOnce.should.be.true();
                permissibleV2Stub.firstCall.args[0].should.equal('post-id-1');
                permissibleV2Stub.firstCall.args[1].should.equal('edit');
                permissibleV2Stub.firstCall.args[2].should.be.an.Object();
                permissibleV2Stub.firstCall.args[2].role.should.equal('Administrator');
            });

            it('grants permission when permissibleV2 returns grant regardless of base', async function () {
                sinon.stub(providers, 'user').resolves({
                    permissions: [],
                    roles: [{name: 'Member'}]
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(false);

                sinon.stub(models.Comment, 'permissibleV2').resolves({
                    result: 'grant'
                });

                const result = await canThisV2.checkPermission(
                    {user: 'user-id-1'},
                    'edit',
                    'comment',
                    'comment-id-1'
                );

                should.exist(result);
                result.should.deepEqual({excludedAttrs: [], role: 'Member'});
            });

            it('denies permission when permissibleV2 returns deny', async function () {
                sinon.stub(providers, 'user').resolves({
                    permissions: [],
                    roles: [{name: 'Administrator'}]
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(true);

                sinon.stub(models.User, 'permissibleV2').resolves({
                    result: 'deny'
                });

                await canThisV2.checkPermission(
                    {user: 'user-id-1'},
                    'destroy',
                    'user',
                    'owner-user-id'
                ).should.be.rejectedWith({errorType: 'NoPermissionError'});
            });

            it('returns excludedAttrs from permissibleV2', async function () {
                sinon.stub(providers, 'user').resolves({
                    permissions: [],
                    roles: [{name: 'Contributor'}]
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(true);

                sinon.stub(models.Post, 'permissibleV2').resolves({
                    result: null,
                    excludedAttrs: ['status', 'visibility']
                });

                const result = await canThisV2.checkPermission(
                    {user: 'user-id-1'},
                    'edit',
                    'post',
                    'post-id-1'
                );

                result.excludedAttrs.should.deepEqual(['status', 'visibility']);
            });

            it('defers to base permission when permissibleV2 returns null', async function () {
                sinon.stub(providers, 'user').resolves({
                    permissions: [],
                    roles: [{name: 'Editor'}]
                });

                const hasPermissionStub = sinon.stub(permissionConfig, 'hasPermission').returns(true);

                sinon.stub(models.Post, 'permissibleV2').resolves({
                    result: null
                });

                await canThisV2.checkPermission(
                    {user: 'user-id-1'},
                    'edit',
                    'post',
                    'post-id-1'
                );

                hasPermissionStub.called.should.be.true();
            });

            it('denies when permissibleV2 returns null and base permission is false', async function () {
                sinon.stub(providers, 'user').resolves({
                    permissions: [],
                    roles: [{name: 'Author'}]
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(false);

                sinon.stub(models.Post, 'permissibleV2').resolves({
                    result: null
                });

                await canThisV2.checkPermission(
                    {user: 'user-id-1'},
                    'destroy',
                    'post',
                    'post-id-1'
                ).should.be.rejectedWith({errorType: 'NoPermissionError'});
            });
        });

        describe('PermissionContext construction', function () {
            it('passes correct PermissionContext with user context', async function () {
                sinon.stub(providers, 'user').resolves({
                    permissions: [],
                    roles: [{name: 'Editor'}]
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(true);

                const permissibleV2Stub = sinon.stub(models.Post, 'permissibleV2').resolves({
                    result: null
                });

                await canThisV2.checkPermission(
                    {user: 'user-id-1'},
                    'edit',
                    'post',
                    'post-id-1',
                    {title: 'Updated'}
                );

                const permCtx = permissibleV2Stub.firstCall.args[2];
                permCtx.role.should.equal('Editor');
                permCtx.actorId.should.equal('user-id-1');
                permCtx.isViaApiKey.should.be.false();
                permCtx.unsafeAttrs.should.deepEqual({title: 'Updated'});
            });

            it('passes correct PermissionContext with api_key context', async function () {
                sinon.stub(providers, 'apiKey').resolves({
                    permissions: [],
                    roles: [{name: 'Admin Integration'}]
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(true);

                const permissibleV2Stub = sinon.stub(models.Post, 'permissibleV2').resolves({
                    result: null
                });

                await canThisV2.checkPermission(
                    {api_key: {id: 'api-key-id'}},
                    'edit',
                    'post',
                    'post-id-1'
                );

                const permCtx = permissibleV2Stub.firstCall.args[2];
                permCtx.role.should.equal('Admin Integration');
                permCtx.isViaApiKey.should.be.true();
                should.not.exist(permCtx.actorId);
            });

            it('passes correct PermissionContext with member context', async function () {
                sinon.stub(providers, 'member').resolves({
                    permissions: []
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(true);

                const permissibleV2Stub = sinon.stub(models.Comment, 'permissibleV2').resolves({
                    result: null
                });

                await canThisV2.checkPermission(
                    {member: {id: 'member-id-1'}},
                    'add',
                    'comment',
                    null
                );

                const permCtx = permissibleV2Stub.firstCall.args[2];
                permCtx.role.should.equal('Member');
                permCtx.actorId.should.equal('member-id-1');
                permCtx.isViaApiKey.should.be.false();
            });

            it('sets isViaApiKey when both user and api_key present', async function () {
                sinon.stub(providers, 'user').resolves({
                    permissions: [],
                    roles: [{name: 'Editor'}]
                });

                sinon.stub(providers, 'apiKey').resolves({
                    permissions: [],
                    roles: [{name: 'Admin Integration'}]
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(true);

                const permissibleV2Stub = sinon.stub(models.Post, 'permissibleV2').resolves({
                    result: null
                });

                await canThisV2.checkPermission(
                    {user: 'user-id-1', api_key: {id: 'api-key-id'}},
                    'edit',
                    'post',
                    'post-id-1'
                );

                const permCtx = permissibleV2Stub.firstCall.args[2];
                permCtx.role.should.equal('Editor');
                permCtx.actorId.should.equal('user-id-1');
                permCtx.isViaApiKey.should.be.true();
            });
        });

        describe('models without permissibleV2', function () {
            it('uses only base permission for models without permissibleV2', async function () {
                sinon.stub(providers, 'user').resolves({
                    permissions: [],
                    roles: [{name: 'Administrator'}]
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(true);

                const result = await canThisV2.checkPermission(
                    {user: 'user-id-1'},
                    'edit',
                    'tag',
                    'tag-id-1'
                );

                should.exist(result);
                result.should.deepEqual({excludedAttrs: [], role: 'Administrator'});
            });

            it('denies when base permission is false for models without permissibleV2', async function () {
                sinon.stub(providers, 'user').resolves({
                    permissions: [],
                    roles: [{name: 'Author'}]
                });

                sinon.stub(permissionConfig, 'hasPermission').returns(false);

                await canThisV2.checkPermission(
                    {user: 'user-id-1'},
                    'destroy',
                    'tag',
                    'tag-id-1'
                ).should.be.rejectedWith({errorType: 'NoPermissionError'});
            });
        });
    });
});
