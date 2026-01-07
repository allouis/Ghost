const should = require('should');
const sinon = require('sinon');
const models = require('../../../../core/server/models');
const {knex} = require('../../../../core/server/data/db');
const PermissionContext = require('../../../../core/server/services/permissions/PermissionContext');
const limitService = require('../../../../core/server/services/limits');

describe('Unit: models/integration', function () {
    before(function () {
        models.init();
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('permittedOptions', function () {
        let basePermittedOptionsReturnVal;

        beforeEach(function () {
            basePermittedOptionsReturnVal = ['super', 'doopa'];
            sinon.stub(models.Base.Model, 'permittedOptions')
                .returns(basePermittedOptionsReturnVal);
        });

        it('returns the base permittedOptions result', function () {
            const returnedOptions = models.Integration.permittedOptions();
            should.deepEqual(returnedOptions, basePermittedOptionsReturnVal);
        });

        it('returns the base permittedOptions result plus "filter" when methodName is findOne', function () {
            const returnedOptions = models.Integration.permittedOptions('findOne');
            should.deepEqual(returnedOptions, basePermittedOptionsReturnVal.concat('filter'));
        });
    });

    describe('findOne', function () {
        const mockDb = require('mock-knex');
        let tracker;

        before(function () {
            mockDb.mock(knex);
            tracker = mockDb.getTracker();
        });

        after(function () {
            mockDb.unmock(knex);
        });

        it('generates correct query (allows use of options.filter)', function () {
            const queries = [];
            tracker.install();

            tracker.on('query', (query) => {
                queries.push(query);
                query.response([]);
            });

            return models.Integration.findOne({
                id: '123'
            }, {
                filter: 'type:[custom,builtin,core]'
            }).then(() => {
                queries.length.should.eql(1);
                queries[0].sql.should.eql('select `integrations`.* from `integrations` where `integrations`.`type` in (?, ?, ?) and `integrations`.`id` = ? limit ?');
                queries[0].bindings.should.eql(['custom', 'builtin', 'core', '123', 1]);
            });
        });
    });

    describe('getInternalFrontendKey', function () {
        const mockDb = require('mock-knex');
        let tracker;

        before(function () {
            mockDb.mock(knex);
            tracker = mockDb.getTracker();
        });

        after(function () {
            mockDb.unmock(knex);
        });

        it('generates correct query', function () {
            const queries = [];
            tracker.install();

            tracker.on('query', (query) => {
                queries.push(query);
                query.response([]);
            });

            return models.Integration.getInternalFrontendKey().then(() => {
                queries.length.should.eql(1);
                queries[0].sql.should.eql('select `integrations`.* from `integrations` where `integrations`.`slug` = ? limit ?');
                queries[0].bindings.should.eql(['ghost-internal-frontend', 1]);
            });
        });
    });

    describe('permissibleV2', function () {
        describe('limit checks', function () {
            it('throws error if custom integrations limit would be exceeded on add', async function () {
                sinon.stub(limitService, 'isLimited').returns(true);
                sinon.stub(limitService, 'errorIfWouldGoOverLimit').rejects(new Error('Host limit reached'));

                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                try {
                    await models.Integration.permissibleV2(null, 'add', permCtx);
                    throw new Error('Should have thrown');
                } catch (err) {
                    err.message.should.eql('Host limit reached');
                }
            });

            it('does not check limit for non-add actions', async function () {
                const isLimitedStub = sinon.stub(limitService, 'isLimited').returns(true);
                sinon.stub(limitService, 'errorIfWouldGoOverLimit').rejects(new Error('Host limit reached'));

                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Integration.permissibleV2(null, 'edit', permCtx);
                result.should.deepEqual({result: null});
                isLimitedStub.called.should.be.false();
            });
        });

        describe('permission results', function () {
            beforeEach(function () {
                sinon.stub(limitService, 'isLimited').returns(false);
            });

            it('defers to base permission on add when limit not reached', async function () {
                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Integration.permissibleV2(null, 'add', permCtx);
                result.should.deepEqual({result: null});
            });

            it('defers to base permission on browse', async function () {
                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Integration.permissibleV2(null, 'browse', permCtx);
                result.should.deepEqual({result: null});
            });

            it('defers to base permission on edit', async function () {
                const permCtx = new PermissionContext({
                    role: 'Administrator',
                    actorId: 'user_123',
                    isViaApiKey: false
                });

                const result = await models.Integration.permissibleV2(null, 'edit', permCtx);
                result.should.deepEqual({result: null});
            });
        });
    });
});
