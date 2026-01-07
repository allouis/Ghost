import assert from 'assert/strict';
import {PermissionContext} from '../../../../../core/server/services/permissions/PermissionContext';

describe('Permission Context', function () {
    describe('constructor', function () {
        it('should create a context with all properties', function () {
            const ctx = new PermissionContext({
                role: 'Administrator',
                actorId: 'user-123',
                isViaApiKey: false,
                unsafeAttrs: {status: 'published'}
            });

            assert.equal(ctx.role, 'Administrator');
            assert.equal(ctx.actorId, 'user-123');
            assert.equal(ctx.isViaApiKey, false);
            assert.deepEqual(ctx.unsafeAttrs, {status: 'published'});
        });

        it('should handle null actorId', function () {
            const ctx = new PermissionContext({
                role: 'Admin Integration',
                actorId: null,
                isViaApiKey: true,
                unsafeAttrs: {}
            });

            assert.equal(ctx.actorId, null);
            assert.equal(ctx.isViaApiKey, true);
        });

        it('should default unsafeAttrs to empty object', function () {
            const ctx = new PermissionContext({
                role: 'Editor',
                actorId: 'user-456',
                isViaApiKey: false
            });

            assert.deepEqual(ctx.unsafeAttrs, {});
        });

        it('should default isViaApiKey to false', function () {
            const ctx = new PermissionContext({
                role: 'Editor',
                actorId: 'user-456'
            });

            assert.equal(ctx.isViaApiKey, false);
        });
    });

    describe('isActorId', function () {
        it('should return true when actorId matches', function () {
            const ctx = new PermissionContext({
                role: 'Author',
                actorId: 'user-123',
                isViaApiKey: false
            });

            assert.equal(ctx.isActorId('user-123'), true);
        });

        it('should return false when actorId does not match', function () {
            const ctx = new PermissionContext({
                role: 'Author',
                actorId: 'user-123',
                isViaApiKey: false
            });

            assert.equal(ctx.isActorId('user-456'), false);
        });

        it('should return false when actorId is null', function () {
            const ctx = new PermissionContext({
                role: 'Admin Integration',
                actorId: null,
                isViaApiKey: true
            });

            assert.equal(ctx.isActorId('user-123'), false);
        });

        it('should return false when comparing with null', function () {
            const ctx = new PermissionContext({
                role: 'Author',
                actorId: 'user-123',
                isViaApiKey: false
            });

            assert.equal(ctx.isActorId(null), false);
        });

        it('should return false when both are null', function () {
            const ctx = new PermissionContext({
                role: 'Admin Integration',
                actorId: null,
                isViaApiKey: true
            });

            assert.equal(ctx.isActorId(null), false);
        });
    });

    describe('fromRequestContext', function () {
        it('should create context from user context', function () {
            const requestContext = {
                user: 'user-123'
            };
            const role = 'Editor';
            const unsafeAttrs = {title: 'Test'};

            const ctx = PermissionContext.fromRequestContext(requestContext, role, unsafeAttrs);

            assert.equal(ctx.role, 'Editor');
            assert.equal(ctx.actorId, 'user-123');
            assert.equal(ctx.isViaApiKey, false);
            assert.deepEqual(ctx.unsafeAttrs, {title: 'Test'});
        });

        it('should create context from API key context', function () {
            const requestContext = {
                api_key: {id: 'key-123', type: 'admin'}
            };
            const role = 'Admin Integration';
            const unsafeAttrs = {};

            const ctx = PermissionContext.fromRequestContext(requestContext, role, unsafeAttrs);

            assert.equal(ctx.role, 'Admin Integration');
            assert.equal(ctx.actorId, null);
            assert.equal(ctx.isViaApiKey, true);
        });

        it('should create context from member context', function () {
            const requestContext = {
                member: {id: 'member-123'}
            };
            const role = 'Member';
            const unsafeAttrs = {comment: 'Hello'};

            const ctx = PermissionContext.fromRequestContext(requestContext, role, unsafeAttrs);

            assert.equal(ctx.role, 'Member');
            assert.equal(ctx.actorId, 'member-123');
            assert.equal(ctx.isViaApiKey, false);
            assert.deepEqual(ctx.unsafeAttrs, {comment: 'Hello'});
        });

        it('should handle user with API key (staff token)', function () {
            const requestContext = {
                user: 'user-123',
                api_key: {id: 'key-456', type: 'admin'}
            };
            const role = 'Administrator';
            const unsafeAttrs = {};

            const ctx = PermissionContext.fromRequestContext(requestContext, role, unsafeAttrs);

            assert.equal(ctx.role, 'Administrator');
            assert.equal(ctx.actorId, 'user-123');
            assert.equal(ctx.isViaApiKey, true);
        });

        it('should handle empty context', function () {
            const requestContext = {};
            const role = 'Unknown';
            const unsafeAttrs = {};

            const ctx = PermissionContext.fromRequestContext(requestContext, role, unsafeAttrs);

            assert.equal(ctx.role, 'Unknown');
            assert.equal(ctx.actorId, null);
            assert.equal(ctx.isViaApiKey, false);
        });

        it('should default unsafeAttrs to empty object', function () {
            const requestContext = {
                user: 'user-123'
            };
            const role = 'Editor';

            const ctx = PermissionContext.fromRequestContext(requestContext, role);

            assert.deepEqual(ctx.unsafeAttrs, {});
        });
    });

    describe('isStaff', function () {
        it('should return true for Administrator', function () {
            const ctx = new PermissionContext({role: 'Administrator', actorId: '1'});
            assert.equal(ctx.isStaff(), true);
        });

        it('should return true for Owner', function () {
            const ctx = new PermissionContext({role: 'Owner', actorId: '1'});
            assert.equal(ctx.isStaff(), true);
        });

        it('should return true for Editor', function () {
            const ctx = new PermissionContext({role: 'Editor', actorId: '1'});
            assert.equal(ctx.isStaff(), true);
        });

        it('should return true for Author', function () {
            const ctx = new PermissionContext({role: 'Author', actorId: '1'});
            assert.equal(ctx.isStaff(), true);
        });

        it('should return true for Contributor', function () {
            const ctx = new PermissionContext({role: 'Contributor', actorId: '1'});
            assert.equal(ctx.isStaff(), true);
        });

        it('should return false for Member', function () {
            const ctx = new PermissionContext({role: 'Member', actorId: '1'});
            assert.equal(ctx.isStaff(), false);
        });

        it('should return false for integration roles', function () {
            const ctx = new PermissionContext({role: 'Admin Integration', actorId: null});
            assert.equal(ctx.isStaff(), false);
        });
    });
});
