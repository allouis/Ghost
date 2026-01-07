import assert from 'assert/strict';
import {hasPermission, getAllActionsForObject, getRolePermissions} from '../../../../../core/server/services/permissions/permission-config';

describe('Permission Config', function () {
    describe('hasPermission', function () {
        describe('Administrator role', function () {
            it('should allow Administrator to browse posts', function () {
                assert.equal(hasPermission('Administrator', 'browse', 'post'), true);
            });

            it('should allow Administrator to edit posts', function () {
                assert.equal(hasPermission('Administrator', 'edit', 'post'), true);
            });

            it('should allow Administrator to delete posts', function () {
                assert.equal(hasPermission('Administrator', 'destroy', 'post'), true);
            });

            it('should allow Administrator all user permissions', function () {
                assert.equal(hasPermission('Administrator', 'browse', 'user'), true);
                assert.equal(hasPermission('Administrator', 'read', 'user'), true);
                assert.equal(hasPermission('Administrator', 'edit', 'user'), true);
                assert.equal(hasPermission('Administrator', 'add', 'user'), true);
                assert.equal(hasPermission('Administrator', 'destroy', 'user'), true);
            });

            it('should allow Administrator to read member_signin_url', function () {
                assert.equal(hasPermission('Administrator', 'read', 'member_signin_url'), true);
            });

            it('should allow Administrator to resetAllPasswords on authentication', function () {
                assert.equal(hasPermission('Administrator', 'resetAllPasswords', 'authentication'), true);
            });
        });

        describe('Editor role', function () {
            it('should allow Editor to edit posts', function () {
                assert.equal(hasPermission('Editor', 'edit', 'post'), true);
            });

            it('should allow Editor to browse settings but not edit', function () {
                assert.equal(hasPermission('Editor', 'browse', 'setting'), true);
                assert.equal(hasPermission('Editor', 'read', 'setting'), true);
                assert.equal(hasPermission('Editor', 'edit', 'setting'), false);
            });

            it('should not allow Editor to manage integrations', function () {
                assert.equal(hasPermission('Editor', 'browse', 'integration'), false);
            });
        });

        describe('Author role', function () {
            it('should allow Author to add posts', function () {
                assert.equal(hasPermission('Author', 'add', 'post'), true);
            });

            it('should allow Author to add tags', function () {
                assert.equal(hasPermission('Author', 'add', 'tag'), true);
            });

            it('should not allow Author to delete tags', function () {
                assert.equal(hasPermission('Author', 'destroy', 'tag'), false);
            });

            it('should not allow Author to manage users', function () {
                assert.equal(hasPermission('Author', 'edit', 'user'), false);
                assert.equal(hasPermission('Author', 'add', 'user'), false);
                assert.equal(hasPermission('Author', 'destroy', 'user'), false);
            });
        });

        describe('Contributor role', function () {
            it('should allow Contributor to edit posts', function () {
                assert.equal(hasPermission('Contributor', 'edit', 'post'), true);
            });

            it('should not allow Contributor to add tags', function () {
                assert.equal(hasPermission('Contributor', 'add', 'tag'), false);
            });

            it('should not allow Contributor to manage labels', function () {
                assert.equal(hasPermission('Contributor', 'browse', 'label'), false);
            });
        });

        describe('Owner role', function () {
            it('should have all Administrator permissions', function () {
                assert.equal(hasPermission('Owner', 'browse', 'post'), true);
                assert.equal(hasPermission('Owner', 'edit', 'setting'), true);
                assert.equal(hasPermission('Owner', 'destroy', 'user'), true);
            });
        });

        describe('Member pseudo-role', function () {
            it('should allow Member to browse comments', function () {
                assert.equal(hasPermission('Member', 'browse', 'comment'), true);
            });

            it('should allow Member to add comments', function () {
                assert.equal(hasPermission('Member', 'add', 'comment'), true);
            });

            it('should allow Member to edit comments', function () {
                assert.equal(hasPermission('Member', 'edit', 'comment'), true);
            });

            it('should allow Member to like comments', function () {
                assert.equal(hasPermission('Member', 'like', 'comment'), true);
            });

            it('should not allow Member to moderate comments', function () {
                assert.equal(hasPermission('Member', 'moderate', 'comment'), false);
            });

            it('should not allow Member to access posts', function () {
                assert.equal(hasPermission('Member', 'browse', 'post'), false);
            });
        });

        describe('Integration roles', function () {
            it('should allow DB Backup Integration to access db', function () {
                assert.equal(hasPermission('DB Backup Integration', 'exportContent', 'db'), true);
                assert.equal(hasPermission('DB Backup Integration', 'importContent', 'db'), true);
            });

            it('should allow Scheduler Integration to publish posts', function () {
                assert.equal(hasPermission('Scheduler Integration', 'publish', 'post'), true);
            });

            it('should not allow Scheduler Integration to edit posts', function () {
                assert.equal(hasPermission('Scheduler Integration', 'edit', 'post'), false);
            });
        });

        describe('Unknown role', function () {
            it('should return false for unknown roles', function () {
                assert.equal(hasPermission('Unknown', 'browse', 'post'), false);
            });
        });

        describe('Unknown action/object', function () {
            it('should return false for unknown action types', function () {
                assert.equal(hasPermission('Administrator', 'unknown_action', 'post'), false);
            });

            it('should return false for unknown object types', function () {
                assert.equal(hasPermission('Administrator', 'browse', 'unknown_object'), false);
            });
        });
    });

    describe('getAllActionsForObject', function () {
        it('should return all actions for post object type', function () {
            const actions = getAllActionsForObject('post');
            assert.ok(actions.includes('browse'));
            assert.ok(actions.includes('read'));
            assert.ok(actions.includes('edit'));
            assert.ok(actions.includes('add'));
            assert.ok(actions.includes('destroy'));
            assert.ok(actions.includes('publish'));
        });

        it('should return all actions for comment object type', function () {
            const actions = getAllActionsForObject('comment');
            assert.ok(actions.includes('browse'));
            assert.ok(actions.includes('read'));
            assert.ok(actions.includes('edit'));
            assert.ok(actions.includes('add'));
            assert.ok(actions.includes('destroy'));
            assert.ok(actions.includes('like'));
            assert.ok(actions.includes('unlike'));
            assert.ok(actions.includes('report'));
            assert.ok(actions.includes('moderate'));
        });

        it('should return empty array for unknown object type', function () {
            const actions = getAllActionsForObject('unknown');
            assert.ok(Array.isArray(actions));
            assert.equal(actions.length, 0);
        });
    });

    describe('getRolePermissions', function () {
        it('should return all permissions for Administrator', function () {
            const perms = getRolePermissions('Administrator');
            assert.ok(perms);
            assert.equal(perms.post, 'all');
            assert.equal(perms.user, 'all');
            assert.equal(perms.setting, 'all');
        });

        it('should return limited permissions for Editor', function () {
            const perms = getRolePermissions('Editor');
            assert.ok(perms);
            assert.equal(perms.post, 'all');
            assert.deepEqual(perms.setting, ['browse', 'read']);
        });

        it('should return undefined for unknown role', function () {
            const perms = getRolePermissions('Unknown');
            assert.equal(perms, undefined);
        });
    });
});
