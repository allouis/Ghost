const should = require('should');
const sinon = require('sinon');
const models = require('../../../../../core/server/models');
const permissionComparator = require('../../../../../core/server/services/permissions/permission-comparator');

describe('permission-comparator', function () {
    before(function () {
        models.init();
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('compare', function () {
        it('returns BOTH_GRANTED when both systems grant permission', async function () {
            const oldResult = {granted: true};
            const newResult = {granted: true, excludedAttrs: []};

            const result = await permissionComparator.compare(
                {user: 'user-id'},
                'edit',
                'post',
                'post-id-1',
                {},
                async () => oldResult,
                async () => newResult
            );

            result.decision.should.equal('BOTH_GRANTED');
            result.oldGranted.should.be.true();
            result.newGranted.should.be.true();
            result.conflict.should.be.false();
        });

        it('returns BOTH_DENIED when both systems deny permission', async function () {
            const oldError = new Error('No permission');
            oldError.errorType = 'NoPermissionError';
            const newError = new Error('No permission');
            newError.errorType = 'NoPermissionError';

            const result = await permissionComparator.compare(
                {user: 'user-id'},
                'edit',
                'post',
                'post-id-1',
                {},
                async () => {
                    throw oldError;
                },
                async () => {
                    throw newError;
                }
            );

            result.decision.should.equal('BOTH_DENIED');
            result.oldGranted.should.be.false();
            result.newGranted.should.be.false();
            result.conflict.should.be.false();
        });

        it('returns CONFLICT_OLD_GRANTED when old grants but new denies', async function () {
            const oldResult = {granted: true};
            const newError = new Error('No permission');
            newError.errorType = 'NoPermissionError';

            const result = await permissionComparator.compare(
                {user: 'user-id'},
                'destroy',
                'user',
                'owner-id',
                {},
                async () => oldResult,
                async () => {
                    throw newError;
                }
            );

            result.decision.should.equal('CONFLICT_OLD_GRANTED');
            result.oldGranted.should.be.true();
            result.newGranted.should.be.false();
            result.conflict.should.be.true();
        });

        it('returns CONFLICT_NEW_GRANTED when new grants but old denies', async function () {
            const oldError = new Error('No permission');
            oldError.errorType = 'NoPermissionError';
            const newResult = {granted: true, excludedAttrs: []};

            const result = await permissionComparator.compare(
                {user: 'user-id'},
                'edit',
                'post',
                'post-id-1',
                {},
                async () => {
                    throw oldError;
                },
                async () => newResult
            );

            result.decision.should.equal('CONFLICT_NEW_GRANTED');
            result.oldGranted.should.be.false();
            result.newGranted.should.be.true();
            result.conflict.should.be.true();
        });

        it('includes context metadata in result', async function () {
            const result = await permissionComparator.compare(
                {user: 'user-id-1'},
                'edit',
                'post',
                'post-id-123',
                {title: 'Updated'},
                async () => ({granted: true}),
                async () => ({granted: true, excludedAttrs: []})
            );

            result.context.should.deepEqual({user: 'user-id-1'});
            result.action.should.equal('edit');
            result.objectType.should.equal('post');
            result.modelOrId.should.equal('post-id-123');
        });

        it('handles old system throwing non-permission errors', async function () {
            const oldError = new Error('Database connection failed');

            const result = await permissionComparator.compare(
                {user: 'user-id'},
                'edit',
                'post',
                'post-id-1',
                {},
                async () => {
                    throw oldError;
                },
                async () => ({granted: true, excludedAttrs: []})
            );

            result.oldError.should.equal('Database connection failed');
            result.oldGranted.should.be.false();
        });

        it('handles new system throwing non-permission errors', async function () {
            const newError = new Error('Some unexpected error');

            const result = await permissionComparator.compare(
                {user: 'user-id'},
                'edit',
                'post',
                'post-id-1',
                {},
                async () => ({granted: true}),
                async () => {
                    throw newError;
                }
            );

            result.newError.should.equal('Some unexpected error');
            result.newGranted.should.be.false();
        });

        it('includes excludedAttrs from new system when both grant', async function () {
            const result = await permissionComparator.compare(
                {user: 'user-id'},
                'edit',
                'post',
                'post-id-1',
                {},
                async () => ({granted: true}),
                async () => ({granted: true, excludedAttrs: ['status', 'visibility']})
            );

            result.newExcludedAttrs.should.deepEqual(['status', 'visibility']);
        });
    });

    describe('runComparison', function () {
        it('runs both checks and returns comparison result', async function () {
            const oldCanThis = sinon.stub().returns({
                edit: {
                    post: sinon.stub().resolves()
                }
            });

            const newCheckPermission = sinon.stub().resolves({excludedAttrs: []});

            const result = await permissionComparator.runComparison(
                {user: 'user-id'},
                'edit',
                'post',
                'post-id-1',
                {},
                oldCanThis,
                newCheckPermission
            );

            result.decision.should.equal('BOTH_GRANTED');
            oldCanThis.calledOnce.should.be.true();
            newCheckPermission.calledOnce.should.be.true();
        });

        it('handles old canThis chain correctly', async function () {
            const postHandler = sinon.stub().resolves();
            const oldCanThis = sinon.stub().returns({
                edit: {
                    post: postHandler
                }
            });

            const newCheckPermission = sinon.stub().resolves({excludedAttrs: []});

            await permissionComparator.runComparison(
                {user: 'user-id'},
                'edit',
                'post',
                'post-id-1',
                {title: 'Updated'},
                oldCanThis,
                newCheckPermission
            );

            postHandler.calledWith('post-id-1', {title: 'Updated'}).should.be.true();
        });

        it('handles old system denial correctly', async function () {
            const error = new Error('No permission');
            error.errorType = 'NoPermissionError';

            const postHandler = sinon.stub().rejects(error);
            const oldCanThis = sinon.stub().returns({
                edit: {
                    post: postHandler
                }
            });

            const newCheckPermission = sinon.stub().resolves({excludedAttrs: []});

            const result = await permissionComparator.runComparison(
                {user: 'user-id'},
                'edit',
                'post',
                'post-id-1',
                {},
                oldCanThis,
                newCheckPermission
            );

            result.decision.should.equal('CONFLICT_NEW_GRANTED');
            result.oldGranted.should.be.false();
            result.newGranted.should.be.true();
        });
    });

    describe('getResultForOldSystem', function () {
        it('resolves when old system granted', async function () {
            const comparisonResult = {
                oldGranted: true,
                decision: 'BOTH_GRANTED'
            };

            await permissionComparator.getResultForOldSystem(comparisonResult)
                .should.be.fulfilled();
        });

        it('rejects when old system denied', async function () {
            const error = new Error('No permission');
            error.errorType = 'NoPermissionError';

            const comparisonResult = {
                oldGranted: false,
                oldError: error,
                decision: 'BOTH_DENIED'
            };

            await permissionComparator.getResultForOldSystem(comparisonResult)
                .should.be.rejectedWith({errorType: 'NoPermissionError'});
        });
    });

    describe('reportConflict', function () {
        let sentry;

        beforeEach(function () {
            sentry = require('../../../../../core/shared/sentry');
            // Ensure captureMessage exists for stubbing (it may be undefined when Sentry is disabled)
            if (!sentry.captureMessage) {
                sentry.captureMessage = () => {};
            }
        });

        it('does nothing when there is no conflict', function () {
            const captureMessageStub = sinon.stub(sentry, 'captureMessage');

            const comparisonResult = {
                conflict: false,
                decision: 'BOTH_GRANTED'
            };

            permissionComparator.reportConflict(comparisonResult);

            captureMessageStub.called.should.be.false();
        });

        it('calls sentry.captureMessage when there is a conflict', function () {
            const captureMessageStub = sinon.stub(sentry, 'captureMessage');

            const comparisonResult = {
                conflict: true,
                decision: 'CONFLICT_OLD_GRANTED',
                context: {user: 'user-id'},
                action: 'edit',
                objectType: 'post',
                modelOrId: 'post-id-1',
                oldGranted: true,
                newGranted: false,
                oldError: null,
                newError: {message: 'No permission'},
                newExcludedAttrs: [],
                resolvedRole: 'Administrator',
                timestamp: '2026-01-08T00:00:00.000Z'
            };

            permissionComparator.reportConflict(comparisonResult);

            captureMessageStub.calledOnce.should.be.true();
            const call = captureMessageStub.firstCall;

            call.args[0].should.equal('[Permissions] Conflict detected: CONFLICT_OLD_GRANTED');
            call.args[1].level.should.equal('info');
            call.args[1].tags.permission_decision.should.equal('CONFLICT_OLD_GRANTED');
            call.args[1].tags.permission_action.should.equal('edit');
            call.args[1].tags.permission_object.should.equal('post');
            call.args[1].tags.permission_role.should.equal('Administrator');
        });

        it('uses resolved role from new system for api_key context', function () {
            const captureMessageStub = sinon.stub(sentry, 'captureMessage');

            const comparisonResult = {
                conflict: true,
                decision: 'CONFLICT_NEW_GRANTED',
                context: {api_key: {id: 'key-id'}},
                action: 'add',
                objectType: 'post',
                modelOrId: null,
                oldGranted: false,
                newGranted: true,
                resolvedRole: 'Admin Integration',
                timestamp: '2026-01-08T00:00:00.000Z'
            };

            permissionComparator.reportConflict(comparisonResult);

            captureMessageStub.firstCall.args[1].tags.permission_role.should.equal('Admin Integration');
        });

        it('uses resolved role from new system for member context', function () {
            const captureMessageStub = sinon.stub(sentry, 'captureMessage');

            const comparisonResult = {
                conflict: true,
                decision: 'CONFLICT_OLD_GRANTED',
                context: {member: {id: 'member-id'}},
                action: 'edit',
                objectType: 'comment',
                modelOrId: 'comment-id-1',
                oldGranted: true,
                newGranted: false,
                resolvedRole: 'Member',
                timestamp: '2026-01-08T00:00:00.000Z'
            };

            permissionComparator.reportConflict(comparisonResult);

            captureMessageStub.firstCall.args[1].tags.permission_role.should.equal('Member');
        });

        it('falls back to context type with "(unresolved)" when no resolvedRole', function () {
            const captureMessageStub = sinon.stub(sentry, 'captureMessage');

            const comparisonResult = {
                conflict: true,
                decision: 'CONFLICT_OLD_GRANTED',
                context: {user: 'user-id'},
                action: 'edit',
                objectType: 'post',
                modelOrId: null,
                oldGranted: true,
                newGranted: false,
                resolvedRole: null,
                timestamp: '2026-01-08T00:00:00.000Z'
            };

            permissionComparator.reportConflict(comparisonResult);

            captureMessageStub.firstCall.args[1].tags.permission_role.should.equal('user (unresolved)');
        });

        it('extracts model ID from object with id property', function () {
            const captureMessageStub = sinon.stub(sentry, 'captureMessage');

            const comparisonResult = {
                conflict: true,
                decision: 'CONFLICT_NEW_GRANTED',
                context: {user: 'user-id'},
                action: 'edit',
                objectType: 'post',
                modelOrId: {id: 'model-id-123', title: 'Test Post'},
                oldGranted: false,
                newGranted: true,
                timestamp: '2026-01-08T00:00:00.000Z'
            };

            permissionComparator.reportConflict(comparisonResult);

            captureMessageStub.firstCall.args[1].extra.modelId.should.equal('model-id-123');
        });

        it('handles missing sentry.captureMessage gracefully', function () {
            // Temporarily remove captureMessage
            const originalCaptureMessage = sentry.captureMessage;
            delete sentry.captureMessage;

            const comparisonResult = {
                conflict: true,
                decision: 'CONFLICT_OLD_GRANTED',
                context: {user: 'user-id'},
                action: 'edit',
                objectType: 'post'
            };

            // Should not throw
            (function () {
                permissionComparator.reportConflict(comparisonResult);
            }).should.not.throw();

            // Restore
            sentry.captureMessage = originalCaptureMessage;
        });
    });
});
