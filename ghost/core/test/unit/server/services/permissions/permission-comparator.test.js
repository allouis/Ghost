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
});
