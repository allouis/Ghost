const should = require('should');
const sinon = require('sinon');
const errors = require('@tryghost/errors');
const models = require('../../../../core/server/models');
const permissions = require('../../../../core/server/services/permissions');
const schema = require('../../../../core/server/data/schema');
const security = require('@tryghost/security');
const testUtils = require('../../../utils');
const PermissionContext = require('../../../../core/server/services/permissions/PermissionContext');
const limitService = require('../../../../core/server/services/limits');

describe('Unit: models/user', function () {
    before(function () {
        models.init();
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('updateLastSeen method', function () {
        it('exists', function () {
            should.equal(typeof models.User.prototype.updateLastSeen, 'function');
        });

        it('sets the last_seen property to new Date and returns a call to save', function () {
            const instance = {
                set: sinon.spy(),
                save: sinon.stub().resolves()
            };

            const now = new Date();
            const clock = sinon.useFakeTimers(now.getTime());

            const returnVal = models.User.prototype.updateLastSeen.call(instance);

            should.deepEqual(instance.set.args[0][0], {
                last_seen: now
            });

            should.equal(returnVal, instance.save.returnValues[0]);

            clock.restore();
        });
    });

    describe('validation', function () {
        beforeEach(function () {
            sinon.stub(security.password, 'hash').resolves('$2a$10$we16f8rpbrFZ34xWj0/ZC.LTPUux8ler7bcdTs5qIleN6srRHhilG');
        });

        describe('blank', function () {
            it('name cannot be blank', function () {
                return models.User.add({email: 'test@ghost.org'})
                    .then(function () {
                        throw new Error('expected ValidationError');
                    })
                    .catch(function (err) {
                        (err instanceof errors.ValidationError).should.eql(true);
                        err.message.should.match(/users\.name/);
                    });
            });

            it('email cannot be blank', function () {
                let data = {name: 'name'};
                sinon.stub(models.User, 'findOne').resolves(null);

                return models.User.add(data)
                    .then(function () {
                        throw new Error('expected ValidationError');
                    })
                    .catch(function (err) {
                        err.should.be.an.Array();
                        (err[0] instanceof errors.ValidationError).should.eql(true);
                        err[0].message.should.match(/users\.email/);
                    });
            });
        });
    });

    describe('fn: check', function () {
        beforeEach(function () {
            sinon.stub(security.password, 'hash').resolves('$2a$10$we16f8rpbrFZ34xWj0/ZC.LTPUux8ler7bcdTs5qIleN6srRHhilG');
        });

        it('user status is warn', function () {
            sinon.stub(security.password, 'compare').resolves(true);

            // NOTE: Add a user with a broken field to ensure we only validate changed fields on login
            sinon.stub(schema, 'validate').resolves();

            const user = models.User.forge(testUtils.DataGenerator.forKnex.createUser({
                status: 'warn-1',
                email: 'test-9@example.de',
                website: '!!!!!this-is-not-a-website!!!!'
            }));

            sinon.stub(models.User, 'getByEmail').resolves(user);
            sinon.stub(models.User, 'isPasswordCorrect').resolves();

            sinon.stub(user, 'updateLastSeen').resolves();
            sinon.stub(user, 'save').resolves();

            return models.User.check({email: user.get('email'), password: 'test'});
        });

        it('user status is active', function () {
            const user = models.User.forge(testUtils.DataGenerator.forKnex.createUser({
                status: 'active',
                email: 'test@ghost.de'
            }));

            sinon.stub(models.User, 'getByEmail').resolves(user);
            sinon.stub(models.User, 'isPasswordCorrect').resolves();

            sinon.stub(user, 'updateLastSeen').resolves();
            sinon.stub(user, 'save').resolves();

            return models.User.check({email: user.get('email'), password: 'test'});
        });

        it('password is incorrect', function () {
            const user = models.User.forge(testUtils.DataGenerator.forKnex.createUser({
                status: 'active',
                email: 'test@ghost.de'
            }));

            sinon.stub(models.User, 'getByEmail').resolves(user);
            sinon.stub(models.User, 'isPasswordCorrect').rejects(new errors.ValidationError());

            return models.User.check({email: user.get('email'), password: 'test'})
                .catch(function (err) {
                    (err instanceof errors.ValidationError).should.eql(true);
                });
        });

        it('status is locked', function () {
            const user = models.User.forge(testUtils.DataGenerator.forKnex.createUser({
                status: 'locked',
                email: 'test@ghost.de'
            }));

            sinon.stub(models.User, 'getByEmail').resolves(user);

            return models.User.check({email: user.get('email'), password: 'test'})
                .catch(function (err) {
                    (err instanceof errors.PasswordResetRequiredError).should.eql(true);
                });
        });
    });

    describe('permissible', function () {
        function getUserModel(id, role, roleId) {
            const hasRole = sinon.stub();

            hasRole.withArgs(role).returns(true);

            return {
                id: id,
                hasRole: hasRole,
                related: sinon.stub().returns([{name: role, id: roleId}]),
                get: sinon.stub().returns(id)
            };
        }

        it('cannot delete owner', function (done) {
            const mockUser = getUserModel(1, 'Owner');
            const context = {user: 1};

            models.User.permissible(mockUser, 'destroy', context, {}, testUtils.permissions.owner, true, true, true).then(() => {
                done(new Error('Permissible function should have errored'));
            }).catch((error) => {
                error.should.be.an.instanceof(errors.NoPermissionError);
                should(mockUser.hasRole.calledOnce).be.true();
                done();
            });
        });

        it('can always edit self', function () {
            const mockUser = getUserModel(3, 'Contributor');
            const context = {user: 3};

            return models.User.permissible(mockUser, 'edit', context, {}, testUtils.permissions.contributor, false, true, true).then(() => {
                should(mockUser.get.calledOnce).be.true();
            });
        });

        it('cannot edit my status to inactive', function () {
            const mockUser = getUserModel(3, 'Editor');
            const context = {user: 3};

            return models.User.permissible(mockUser, 'edit', context, {status: 'inactive'}, testUtils.permissions.editor, false, true, true)
                .then(Promise.reject)
                .catch((err) => {
                    err.should.be.an.instanceof(errors.NoPermissionError);
                });
        });

        it('without related roles', function () {
            sinon.stub(models.User, 'findOne').withArgs({
                id: 3,
                status: 'all'
            }, {withRelated: ['roles']}).resolves(getUserModel(3, 'Contributor'));

            const mockUser = {id: 3, related: sinon.stub().returns()};
            const context = {user: 3};

            return models.User.permissible(mockUser, 'edit', context, {}, testUtils.permissions.contributor, false, true, true)
                .then(() => {
                    models.User.findOne.calledOnce.should.be.true();
                });
        });

        describe('change role', function () {
            function getUserToEdit(id, role) {
                const hasRole = sinon.stub();

                hasRole.withArgs(role).returns(true);

                return {
                    id: id,
                    hasRole: hasRole,
                    related: sinon.stub().returns([role]),
                    get: sinon.stub().returns(id)
                };
            }

            beforeEach(function () {
                sinon.stub(models.User, 'getOwnerUser');
                sinon.stub(permissions, 'canThis');

                models.User.getOwnerUser.resolves({
                    id: testUtils.context.owner.context.user,
                    related: () => {
                        return {
                            at: () => {
                                return testUtils.permissions.owner.user.roles[0].id;
                            }
                        };
                    }
                });
            });

            it('cannot change own role', function () {
                const mockUser = getUserToEdit(testUtils.context.admin.context.user, testUtils.permissions.editor.user.roles[0]);
                const context = testUtils.context.admin.context;
                const unsafeAttrs = testUtils.permissions.editor.user;

                return models.User.permissible(mockUser, 'edit', context, unsafeAttrs, testUtils.permissions.admin, false, true, true)
                    .then(Promise.reject)
                    .catch((err) => {
                        err.should.be.an.instanceof(errors.NoPermissionError);
                    });
            });

            it('is owner and does not change the role', function () {
                const mockUser = getUserToEdit(testUtils.context.owner.context.user, testUtils.permissions.owner.user.roles[0]);
                const context = testUtils.context.owner.context;
                const unsafeAttrs = testUtils.permissions.owner.user;

                return models.User.permissible(mockUser, 'edit', context, unsafeAttrs, testUtils.permissions.owner, false, true, true)
                    .then(() => {
                        models.User.getOwnerUser.calledOnce.should.be.true();
                    });
            });

            it('cannot change owner\'s role', function () {
                const mockUser = getUserToEdit(testUtils.context.owner.context.user, testUtils.permissions.owner.user.roles[0]);
                const context = testUtils.context.admin.context;
                const unsafeAttrs = testUtils.permissions.editor.user;

                return models.User.permissible(mockUser, 'edit', context, unsafeAttrs, testUtils.permissions.admin, false, true, true)
                    .then(Promise.reject)
                    .catch((err) => {
                        err.should.be.an.instanceof(errors.NoPermissionError);
                    });
            });

            it('admin can change author role', function () {
                const mockUser = getUserToEdit(testUtils.context.author.context.user, testUtils.permissions.author.user.roles[0]);
                const context = testUtils.context.admin.context;
                const unsafeAttrs = testUtils.permissions.editor.user;

                permissions.canThis.returns({
                    assign: {
                        role: sinon.stub().resolves()
                    }
                });

                return models.User.permissible(mockUser, 'edit', context, unsafeAttrs, testUtils.permissions.admin, true, true, true)
                    .then(() => {
                        models.User.getOwnerUser.calledOnce.should.be.true();
                        permissions.canThis.calledOnce.should.be.true();
                    });
            });

            it('author can\'t change admin role', function () {
                const mockUser = getUserToEdit(testUtils.context.admin.context.user, testUtils.permissions.admin.user.roles[0]);
                const context = testUtils.context.author.context;
                const unsafeAttrs = testUtils.permissions.editor.user;

                permissions.canThis.returns({
                    assign: {
                        role: sinon.stub().resolves()
                    }
                });

                return models.User.permissible(mockUser, 'edit', context, unsafeAttrs, testUtils.permissions.author, false, true, true)
                    .then(Promise.reject)
                    .catch((err) => {
                        err.should.be.an.instanceof(errors.NoPermissionError);
                    });
            });
        });

        describe('as editor', function () {
            it('can\'t edit another editor', function (done) {
                const mockUser = getUserModel(3, 'Editor');
                const context = {user: 2};

                models.User.permissible(mockUser, 'edit', context, {}, testUtils.permissions.editor, true, true, true).then(() => {
                    done(new Error('Permissible function should have errored'));
                }).catch((error) => {
                    error.should.be.an.instanceof(errors.NoPermissionError);
                    should(mockUser.hasRole.called).be.true();
                    should(mockUser.get.calledOnce).be.true();
                    done();
                });
            });

            it('can\'t edit owner', function (done) {
                const mockUser = getUserModel(3, 'Owner');
                const context = {user: 2};

                models.User.permissible(mockUser, 'edit', context, {}, testUtils.permissions.editor, true, true, true).then(() => {
                    done(new Error('Permissible function should have errored'));
                }).catch((error) => {
                    error.should.be.an.instanceof(errors.NoPermissionError);
                    should(mockUser.hasRole.called).be.true();
                    should(mockUser.get.calledOnce).be.true();
                    done();
                });
            });

            it('can\'t edit an admin', function (done) {
                const mockUser = getUserModel(3, 'Administrator');
                const context = {user: 2};

                models.User.permissible(mockUser, 'edit', context, {}, testUtils.permissions.editor, true, true, true).then(() => {
                    done(new Error('Permissible function should have errored'));
                }).catch((error) => {
                    error.should.be.an.instanceof(errors.NoPermissionError);
                    should(mockUser.hasRole.called).be.true();
                    should(mockUser.get.calledOnce).be.true();
                    done();
                });
            });

            it('can edit author', function () {
                const mockUser = getUserModel(3, 'Author');
                const context = {user: 2};

                return models.User.permissible(mockUser, 'edit', context, {}, testUtils.permissions.editor, true, true, true).then(() => {
                    should(mockUser.hasRole.called).be.true();
                    should(mockUser.get.calledOnce).be.true();
                });
            });

            it('can edit contributor', function () {
                const mockUser = getUserModel(3, 'Contributor');
                const context = {user: 2};

                return models.User.permissible(mockUser, 'edit', context, {}, testUtils.permissions.editor, true, true, true).then(() => {
                    should(mockUser.hasRole.called).be.true();
                    should(mockUser.get.calledOnce).be.true();
                });
            });

            it('can destroy self', function () {
                const mockUser = getUserModel(3, 'Editor');
                const context = {user: 3};

                return models.User.permissible(mockUser, 'destroy', context, {}, testUtils.permissions.editor, true, true, true).then(() => {
                    should(mockUser.hasRole.called).be.true();
                    should(mockUser.get.calledOnce).be.true();
                });
            });

            it('can\'t destroy another editor', function (done) {
                const mockUser = getUserModel(3, 'Editor');
                const context = {user: 2};

                models.User.permissible(mockUser, 'destroy', context, {}, testUtils.permissions.editor, true, true, true).then(() => {
                    done(new Error('Permissible function should have errored'));
                }).catch((error) => {
                    error.should.be.an.instanceof(errors.NoPermissionError);
                    should(mockUser.hasRole.called).be.true();
                    should(mockUser.get.calledOnce).be.true();
                    done();
                });
            });

            it('can\'t destroy an admin', function (done) {
                const mockUser = getUserModel(3, 'Administrator');
                const context = {user: 2};

                models.User.permissible(mockUser, 'destroy', context, {}, testUtils.permissions.editor, true, true, true).then(() => {
                    done(new Error('Permissible function should have errored'));
                }).catch((error) => {
                    error.should.be.an.instanceof(errors.NoPermissionError);
                    should(mockUser.hasRole.called).be.true();
                    should(mockUser.get.calledOnce).be.true();
                    done();
                });
            });

            it('can destroy an author', function () {
                const mockUser = getUserModel(3, 'Author');
                const context = {user: 2};

                return models.User.permissible(mockUser, 'destroy', context, {}, testUtils.permissions.editor, true, true, true).then(() => {
                    should(mockUser.hasRole.called).be.true();
                    should(mockUser.get.calledOnce).be.true();
                });
            });

            it('can destroy a contributor', function () {
                const mockUser = getUserModel(3, 'Contributor');
                const context = {user: 2};

                return models.User.permissible(mockUser, 'destroy', context, {}, testUtils.permissions.editor, true, true, true).then(() => {
                    should(mockUser.hasRole.called).be.true();
                    should(mockUser.get.calledOnce).be.true();
                });
            });
        });
    });

    describe('transferOwnership', function () {
        beforeEach(function () {
            sinon.stub(models.Role, 'findOne');

            models.Role.findOne
                .withArgs({name: 'Owner'})
                .resolves(testUtils.permissions.owner.user.roles[0]);

            models.Role.findOne
                .withArgs({name: 'Administrator'})
                .resolves(testUtils.permissions.admin.user.roles[0]);

            sinon.stub(models.User, 'findOne');
        });

        it('Cannot transfer ownership if not owner', function () {
            const loggedInUser = testUtils.context.admin;
            const contextUser = sinon.stub();

            contextUser.toJSON = sinon.stub().returns(testUtils.permissions.admin.user);

            models.User
                .findOne
                .withArgs({id: loggedInUser.context.user}, {withRelated: ['roles']})
                .resolves(contextUser);

            return models.User.transferOwnership({id: loggedInUser.context.user}, loggedInUser)
                .then(Promise.reject)
                .catch((err) => {
                    err.should.be.an.instanceof(errors.NoPermissionError);
                });
        });

        it('Owner tries to transfer ownership to editor', function () {
            const loggedInUser = testUtils.context.owner;
            const userToChange = testUtils.context.editor;

            const loggedInContext = {
                toJSON: sinon.stub().returns(testUtils.permissions.owner.user)
            };
            const userToChangeContext = {
                toJSON: sinon.stub().returns(
                    // Test utils don't contain `status` which is required
                    Object.assign({status: 'active'}, testUtils.permissions.editor.user)
                )
            };

            models.User
                .findOne
                .withArgs({id: loggedInUser.context.user}, {withRelated: ['roles']})
                .resolves(loggedInContext);

            models.User
                .findOne
                .withArgs({id: userToChange.context.user}, {withRelated: ['roles']})
                .resolves(userToChangeContext);

            return models.User.transferOwnership({id: userToChange.context.user}, loggedInUser)
                .then(Promise.reject)
                .catch((err) => {
                    err.should.be.an.instanceof(errors.ValidationError);
                    err.message.indexOf('Only administrators can')
                        .should.be.aboveOrEqual(0, 'contains correct error message');
                });
        });

        it('Owner tries to transfer ownership to suspended user', function () {
            const loggedInUser = testUtils.context.owner;
            const userToChange = testUtils.context.admin;

            const userToChangeJSON = Object.assign({status: 'inactive'}, testUtils.permissions.admin.user);
            const loggedInContext = {
                toJSON: sinon.stub().returns(testUtils.permissions.owner.user)
            };
            const userToChangeContext = {
                toJSON: sinon.stub().returns(userToChangeJSON)
            };

            models.User
                .findOne
                .withArgs({id: loggedInUser.context.user}, {withRelated: ['roles']})
                .resolves(loggedInContext);

            models.User
                .findOne
                .withArgs({id: userToChange.context.user}, {withRelated: ['roles']})
                .resolves(userToChangeContext);

            return models.User.transferOwnership({id: userToChange.context.user}, loggedInUser)
                .then(Promise.reject)
                .catch((err) => {
                    err.should.be.an.instanceof(errors.ValidationError);
                    err.message.indexOf('Only active administrators can')
                        .should.be.aboveOrEqual(0, 'contains correct error message');
                });
        });

        it('should clear ownerIdCache after successful transfer', function () {
            const loggedInUser = testUtils.context.owner;
            const userToChange = testUtils.context.admin;

            const userToChangeJSON = Object.assign({status: 'active'}, testUtils.permissions.admin.user);
            const loggedInContext = {
                toJSON: sinon.stub().returns(testUtils.permissions.owner.user),
                roles: sinon.stub().returns({
                    updatePivot: sinon.stub().resolves()
                })
            };
            const userToChangeContext = {
                toJSON: sinon.stub().returns(userToChangeJSON),
                roles: sinon.stub().returns({
                    updatePivot: sinon.stub().resolves()
                }),
                id: userToChange.context.user
            };

            models.User
                .findOne
                .withArgs({id: loggedInUser.context.user}, {withRelated: ['roles']})
                .resolves(loggedInContext);

            models.User
                .findOne
                .withArgs({id: userToChange.context.user}, {withRelated: ['roles']})
                .resolves(userToChangeContext);

            models.User.ownerIdCache.set('old-owner-id');
            should.equal(models.User.ownerIdCache.get(), 'old-owner-id');

            const clearSpy = sinon.spy(models.User.ownerIdCache, 'clear');

            const mockCollection = {
                query: sinon.stub().returnsThis(),
                fetch: sinon.stub().resolves({
                    models: [loggedInContext, userToChangeContext]
                })
            };

            sinon.stub(models.Users, 'forge').returns(mockCollection);

            return models.User.transferOwnership({id: userToChange.context.user}, loggedInUser)
                .then(() => {
                    clearSpy.calledOnce.should.be.true();
                    should.equal(models.User.ownerIdCache.get(), null);
                })
                .finally(() => {
                    clearSpy.restore();
                });
        });
    });

    describe('getEmailAlertUsers', function () {
        beforeEach(function () {
            sinon.stub(models.User, 'findAll');
        });

        it('can filter out only Admin and Owner users', function () {
            const users = sinon.stub();

            users.toJSON = sinon.stub().returns([
                testUtils.permissions.owner.user,
                testUtils.permissions.admin.user,
                testUtils.permissions.editor.user,
                testUtils.permissions.author.user,
                testUtils.permissions.contributor.user
            ]);

            models.User
                .findAll
                .resolves(users);

            return models.User.getEmailAlertUsers('free-signup', {}).then((alertUsers) => {
                alertUsers.length.should.eql(2);
                alertUsers[0].roles[0].name.should.eql('Owner');
                alertUsers[1].roles[0].name.should.eql('Administrator');
            });
        });
    });

    describe('isSetup', function () {
        it('active', function () {
            sinon.stub(models.User, 'getOwnerUser').resolves({get: sinon.stub().returns('active')});

            return models.User.isSetup()
                .then((result) => {
                    result.should.be.true();
                });
        });

        it('inactive', function () {
            sinon.stub(models.User, 'getOwnerUser').resolves({get: sinon.stub().returns('inactive')});

            return models.User.isSetup()
                .then((result) => {
                    result.should.be.false();
                });
        });
    });

    describe('ownerIdCache', function () {
        it('should return null initially', function () {
            should.equal(models.User.ownerIdCache.get(), null);
        });

        it('should store and retrieve values', function () {
            models.User.ownerIdCache.set('abc123');

            should.equal(models.User.ownerIdCache.get(), 'abc123');
        });

        it('should clear stored values', function () {
            models.User.ownerIdCache.set('abc123');
            models.User.ownerIdCache.clear();

            should.equal(models.User.ownerIdCache.get(), null);
        });
    });

    describe('getOwnerId', function () {
        beforeEach(function () {
            models.User.ownerIdCache.clear();
        });

        afterEach(function () {
            models.User.ownerIdCache.clear();
        });

        it('should return cached owner id if available', function () {
            models.User.ownerIdCache.set('abc123');

            sinon.stub(models.User, 'getOwnerUser');

            return models.User.getOwnerId()
                .then((ownerId) => {
                    should.equal(ownerId, 'abc123');
                    models.User.getOwnerUser.called.should.be.false();
                });
        });

        it('should fetch owner and cache the id if not cached', function () {
            const mockOwner = {
                id: 'abc123'
            };

            sinon.stub(models.User, 'getOwnerUser').resolves(mockOwner);

            return models.User.getOwnerId()
                .then((ownerId) => {
                    should.equal(ownerId, mockOwner.id);
                    models.User.getOwnerUser.calledOnce.should.be.true();
                    should.equal(models.User.ownerIdCache.get(), mockOwner.id);
                });
        });

        it('should use cached value on subsequent calls', function () {
            const mockOwner = {
                id: 'abc123'
            };

            sinon.stub(models.User, 'getOwnerUser').resolves(mockOwner);

            return models.User.getOwnerId()
                .then((ownerId) => {
                    should.equal(ownerId, mockOwner.id);
                    models.User.getOwnerUser.calledOnce.should.be.true();

                    return models.User.getOwnerId();
                })
                .then((ownerId) => {
                    should.equal(ownerId, mockOwner.id);
                    models.User.getOwnerUser.calledOnce.should.be.true();
                });
        });

        it('should pass options to getOwnerUser', function () {
            const mockOwner = {
                id: 'abc123'
            };
            const options = {
                transacting: true
            };

            sinon.stub(models.User, 'getOwnerUser').resolves(mockOwner);

            return models.User.getOwnerId(options)
                .then(() => {
                    models.User.getOwnerUser.calledOnce.should.be.true();
                    models.User.getOwnerUser.calledWith(options).should.be.true();
                });
        });
    });

    describe('permissibleV2', function () {
        function getUserModel(id, role, status = 'active') {
            return {
                id: id,
                get: sinon.stub().callsFake((prop) => {
                    if (prop === 'id') {
                        return id;
                    }
                    if (prop === 'status') {
                        return status;
                    }
                    return null;
                }),
                hasRole: sinon.stub().callsFake(roleName => roleName === role),
                related: sinon.stub().callsFake((rel) => {
                    if (rel === 'roles') {
                        return {
                            models: [{id: `${role.toLowerCase()}_role_id`, name: role}],
                            at: () => ({id: `${role.toLowerCase()}_role_id`, name: role})
                        };
                    }
                    return {models: []};
                })
            };
        }

        beforeEach(function () {
            sinon.stub(limitService, 'isLimited').returns(false);
        });

        describe('self-edit', function () {
            it('allows user to edit themselves', async function () {
                const userModel = getUserModel('user_123', 'Author');
                const permCtx = new PermissionContext({
                    role: 'Author',
                    actorId: 'user_123',
                    isViaApiKey: false,
                    unsafeAttrs: {name: 'New Name'}
                });

                const result = await models.User.permissibleV2(userModel, 'edit', permCtx);
                should.equal(result.result, null);
            });

            it('denies user changing own status to inactive', async function () {
                const userModel = getUserModel('user_123', 'Author');
                const permCtx = new PermissionContext({
                    role: 'Author',
                    actorId: 'user_123',
                    isViaApiKey: false,
                    unsafeAttrs: {status: 'inactive'}
                });

                const result = await models.User.permissibleV2(userModel, 'edit', permCtx);
                result.should.deepEqual({result: 'deny'});
            });

            it('denies user changing own role', async function () {
                const userModel = getUserModel('user_123', 'Author');
                const permCtx = new PermissionContext({
                    role: 'Author',
                    actorId: 'user_123',
                    isViaApiKey: false,
                    unsafeAttrs: {roles: [{id: 'admin_role_id'}]}
                });

                const result = await models.User.permissibleV2(userModel, 'edit', permCtx);
                result.should.deepEqual({result: 'deny'});
            });
        });

        describe('owner protection', function () {
            it('only Owner can edit Owner user', async function () {
                const userModel = getUserModel('owner_id', 'Owner');
                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'admin_id',
                    isViaApiKey: false,
                    unsafeAttrs: {name: 'New Name'}
                });

                const result = await models.User.permissibleV2(userModel, 'edit', permCtx);
                result.should.deepEqual({result: 'deny'});
            });

            it('Owner can edit Owner user', async function () {
                const userModel = getUserModel('owner_id', 'Owner');
                const permCtx = new PermissionContext({
                    role: 'Owner',
                    actorId: 'owner_id',
                    isViaApiKey: false,
                    unsafeAttrs: {name: 'New Name'}
                });

                const result = await models.User.permissibleV2(userModel, 'edit', permCtx);
                should.equal(result.result, null);
            });

            it('Owner cannot be deleted', async function () {
                const userModel = getUserModel('owner_id', 'Owner');
                const permCtx = new PermissionContext({
                    role: 'Owner',
                    actorId: 'owner_id',
                    isViaApiKey: false
                });

                const result = await models.User.permissibleV2(userModel, 'destroy', permCtx);
                result.should.deepEqual({result: 'deny'});
            });
        });

        describe('editor restrictions', function () {
            it('Editor can edit Author', async function () {
                const userModel = getUserModel('author_id', 'Author');
                const permCtx = new PermissionContext({
                    role: 'Editor',
                    actorId: 'editor_id',
                    isViaApiKey: false,
                    unsafeAttrs: {name: 'New Name'}
                });

                const result = await models.User.permissibleV2(userModel, 'edit', permCtx);
                should.equal(result.result, null);
            });

            it('Editor can edit Contributor', async function () {
                const userModel = getUserModel('contrib_id', 'Contributor');
                const permCtx = new PermissionContext({
                    role: 'Editor',
                    actorId: 'editor_id',
                    isViaApiKey: false,
                    unsafeAttrs: {name: 'New Name'}
                });

                const result = await models.User.permissibleV2(userModel, 'edit', permCtx);
                should.equal(result.result, null);
            });

            it('Editor cannot edit Administrator', async function () {
                const userModel = getUserModel('admin_id', 'Administrator');
                const permCtx = new PermissionContext({
                    role: 'Editor',
                    actorId: 'editor_id',
                    isViaApiKey: false,
                    unsafeAttrs: {name: 'New Name'}
                });

                const result = await models.User.permissibleV2(userModel, 'edit', permCtx);
                result.should.deepEqual({result: 'deny'});
            });

            it('Editor can delete themselves', async function () {
                const userModel = getUserModel('editor_id', 'Editor');
                const permCtx = new PermissionContext({
                    role: 'Editor',
                    actorId: 'editor_id',
                    isViaApiKey: false
                });

                const result = await models.User.permissibleV2(userModel, 'destroy', permCtx);
                should.equal(result.result, null);
            });

            it('Editor can delete Author', async function () {
                const userModel = getUserModel('author_id', 'Author');
                const permCtx = new PermissionContext({
                    role: 'Editor',
                    actorId: 'editor_id',
                    isViaApiKey: false
                });

                const result = await models.User.permissibleV2(userModel, 'destroy', permCtx);
                should.equal(result.result, null);
            });
        });

        describe('admin permissions', function () {
            it('Administrator can edit any non-owner user', async function () {
                const userModel = getUserModel('editor_id', 'Editor');
                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'admin_id',
                    isViaApiKey: false,
                    unsafeAttrs: {name: 'New Name'}
                });

                const result = await models.User.permissibleV2(userModel, 'edit', permCtx);
                should.equal(result.result, null);
            });

            it('Administrator can delete non-owner user', async function () {
                const userModel = getUserModel('editor_id', 'Editor');
                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'admin_id',
                    isViaApiKey: false
                });

                const result = await models.User.permissibleV2(userModel, 'destroy', permCtx);
                should.equal(result.result, null);
            });
        });

        describe('staff limits', function () {
            it('throws error if unsuspending would exceed staff limit', async function () {
                limitService.isLimited.returns(true);
                sinon.stub(limitService, 'errorIfWouldGoOverLimit').rejects(new Error('Staff limit reached'));

                const userModel = getUserModel('user_id', 'Editor', 'inactive');
                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'admin_id',
                    isViaApiKey: false,
                    unsafeAttrs: {status: 'active'}
                });

                try {
                    await models.User.permissibleV2(userModel, 'edit', permCtx);
                    throw new Error('Should have thrown');
                } catch (err) {
                    err.message.should.eql('Staff limit reached');
                }
            });

            it('does not check limit when unsuspending Contributor', async function () {
                limitService.isLimited.returns(true);
                const errorStub = sinon.stub(limitService, 'errorIfWouldGoOverLimit').rejects(new Error('Staff limit reached'));

                const userModel = getUserModel('user_id', 'Contributor', 'inactive');
                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'admin_id',
                    isViaApiKey: false,
                    unsafeAttrs: {status: 'active'}
                });

                const result = await models.User.permissibleV2(userModel, 'edit', permCtx);
                should.equal(result.result, null);
                errorStub.called.should.be.false();
            });
        });

        describe('model resolution', function () {
            it('loads model from ID string', async function () {
                const userModel = getUserModel('user_123', 'Author');
                const findOneStub = sinon.stub(models.User, 'findOne').resolves(userModel);

                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'admin_id',
                    isViaApiKey: false
                });

                const result = await models.User.permissibleV2('user_123', 'edit', permCtx);
                should.equal(result.result, null);

                findOneStub.calledOnce.should.be.true();
                findOneStub.firstCall.args[0].should.deepEqual({id: 'user_123', status: 'all'});
            });

            it('throws NotFoundError when user not found', async function () {
                sinon.stub(models.User, 'findOne').resolves(null);

                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'admin_id',
                    isViaApiKey: false
                });

                try {
                    await models.User.permissibleV2('nonexistent', 'edit', permCtx);
                    throw new Error('Should have thrown');
                } catch (err) {
                    err.errorType.should.eql('NotFoundError');
                }
            });
        });
    });
});
