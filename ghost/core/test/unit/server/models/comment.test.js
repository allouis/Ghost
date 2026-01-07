const sinon = require('sinon');
const models = require('../../../../core/server/models');
const testUtils = require('../../../utils');
const PermissionContext = require('../../../../core/server/services/permissions/PermissionContext');

describe('Unit: models/comment', function () {
    before(function () {
        models.init();
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('permissible', function () {
        function getCommentModel(id, memberId) {
            const obj = {
                id: id,
                member_id: memberId
            };

            return {
                id: obj.id,
                get: sinon.stub().callsFake((prop) => {
                    return obj[prop];
                })
            };
        }

        it('user can do all', async function () {
            const comment = getCommentModel(1, 'member_123');
            const context = {user: 1};

            const response = await models.Comment.permissible(comment, 'destroy', context, {}, testUtils.permissions.owner, true, true, true);
            response.should.eql(true);
        });

        it('can only edit own comments', async function () {
            const comment = getCommentModel(1, 'member_123');
            const context = {
                member: {
                    id: 'other_member'
                }
            };

            try {
                const response = await models.Comment.permissible(comment, 'edit', context, {}, null, false, true, true);
                response.should.eql(true);
            } catch (err) {
                err.message.should.eql('You may only edit your own comments');
                return;
            }
            throw new Error('Should throw');
        });

        it('can edit own comments', async function () {
            const comment = getCommentModel(1, 'member_123');
            const context = {
                member: {
                    id: 'member_123'
                }
            };

            await models.Comment.permissible(comment, 'edit', context, {}, null, false, true, true);
        });

        it('can only destroy own comments', async function () {
            const comment = getCommentModel(1, 'member_123');
            const context = {
                member: {
                    id: 'other_member'
                }
            };

            try {
                const response = await models.Comment.permissible(comment, 'destroy', context, {}, null, false, true, true);
                response.should.eql(true);
            } catch (err) {
                err.message.should.eql('You may only delete your own comments');
                return;
            }
            throw new Error('Should throw');
        });

        it('can edit destroy comments', async function () {
            const comment = getCommentModel(1, 'member_123');
            const context = {
                member: {
                    id: 'member_123'
                }
            };

            await models.Comment.permissible(comment, 'destroy', context, {}, null, false, true, true);
        });
    });

    describe('permissibleV2', function () {
        function getCommentModel(id, memberId) {
            const obj = {
                id: id,
                member_id: memberId
            };

            return {
                id: obj.id,
                get: sinon.stub().callsFake((prop) => {
                    return obj[prop];
                })
            };
        }

        describe('staff users', function () {
            it('grants permission to staff (Administrator)', async function () {
                const comment = getCommentModel(1, 'member_123');
                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_456',
                    isViaApiKey: false
                });

                const result = await models.Comment.permissibleV2(comment, 'edit', permCtx);
                result.should.deepEqual({result: 'grant'});
            });

            it('grants permission to staff (Editor)', async function () {
                const comment = getCommentModel(1, 'member_123');
                const permCtx = new PermissionContext({
                    role: 'Editor',
                    actorId: 'user_456',
                    isViaApiKey: false
                });

                const result = await models.Comment.permissibleV2(comment, 'destroy', permCtx);
                result.should.deepEqual({result: 'grant'});
            });

            it('grants permission to Owner', async function () {
                const comment = getCommentModel(1, 'member_123');
                const permCtx = new PermissionContext({
                    role: 'Owner',
                    actorId: 'user_456',
                    isViaApiKey: false
                });

                const result = await models.Comment.permissibleV2(comment, 'moderate', permCtx);
                result.should.deepEqual({result: 'grant'});
            });
        });

        describe('members', function () {
            it('denies edit of another member\'s comment', async function () {
                const comment = getCommentModel(1, 'member_123');
                const permCtx = new PermissionContext({
                    role: 'Member',
                    actorId: 'member_456',
                    isViaApiKey: false
                });

                const result = await models.Comment.permissibleV2(comment, 'edit', permCtx);
                result.should.deepEqual({result: 'deny'});
            });

            it('allows edit of own comment', async function () {
                const comment = getCommentModel(1, 'member_123');
                const permCtx = new PermissionContext({
                    role: 'Member',
                    actorId: 'member_123',
                    isViaApiKey: false
                });

                const result = await models.Comment.permissibleV2(comment, 'edit', permCtx);
                result.should.deepEqual({result: null});
            });

            it('denies destroy of another member\'s comment', async function () {
                const comment = getCommentModel(1, 'member_123');
                const permCtx = new PermissionContext({
                    role: 'Member',
                    actorId: 'member_456',
                    isViaApiKey: false
                });

                const result = await models.Comment.permissibleV2(comment, 'destroy', permCtx);
                result.should.deepEqual({result: 'deny'});
            });

            it('allows destroy of own comment', async function () {
                const comment = getCommentModel(1, 'member_123');
                const permCtx = new PermissionContext({
                    role: 'Member',
                    actorId: 'member_123',
                    isViaApiKey: false
                });

                const result = await models.Comment.permissibleV2(comment, 'destroy', permCtx);
                result.should.deepEqual({result: null});
            });

            it('defers to base permission for browse action', async function () {
                const comment = getCommentModel(1, 'member_123');
                const permCtx = new PermissionContext({
                    role: 'Member',
                    actorId: 'member_456',
                    isViaApiKey: false
                });

                const result = await models.Comment.permissibleV2(comment, 'browse', permCtx);
                result.should.deepEqual({result: null});
            });

            it('defers to base permission for add action', async function () {
                const permCtx = new PermissionContext({
                    role: 'Member',
                    actorId: 'member_123',
                    isViaApiKey: false
                });

                const result = await models.Comment.permissibleV2(null, 'add', permCtx);
                result.should.deepEqual({result: null});
            });
        });

        describe('model resolution', function () {
            it('loads model from ID string', async function () {
                const comment = getCommentModel('comment_1', 'member_123');
                const findOneStub = sinon.stub(models.Comment, 'findOne').resolves(comment);

                const permCtx = new PermissionContext({
                    role: 'Member',
                    actorId: 'member_123',
                    isViaApiKey: false
                });

                const result = await models.Comment.permissibleV2('comment_1', 'edit', permCtx);
                result.should.deepEqual({result: null});

                findOneStub.calledOnce.should.be.true();
                findOneStub.calledWith({id: 'comment_1'}).should.be.true();
            });

            it('throws NotFoundError when comment not found', async function () {
                sinon.stub(models.Comment, 'findOne').resolves(null);

                const permCtx = new PermissionContext({
                    role: 'Member',
                    actorId: 'member_123',
                    isViaApiKey: false
                });

                try {
                    await models.Comment.permissibleV2('nonexistent', 'edit', permCtx);
                    throw new Error('Should have thrown');
                } catch (err) {
                    err.message.should.eql('Comment could not be found');
                }
            });
        });
    });
});
