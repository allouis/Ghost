const should = require('should');
const actionsMapCache = require('../../../../../core/server/services/permissions/actions-map-cache');

describe('actions-map-cache', function () {
    describe('initFromJSON', function () {
        it('builds actions map from fixtures.json permissions', function () {
            const actionsMap = actionsMapCache.initFromJSON();

            // Verify structure: action_type → [object_types]
            should.exist(actionsMap);
            actionsMap.should.be.an.Object();

            // The fixtures.json has permissions like "browse post", "edit post", etc.
            // Check that some expected actions exist
            should.exist(actionsMap.browse);
            actionsMap.browse.should.be.an.Array();

            should.exist(actionsMap.edit);
            actionsMap.edit.should.be.an.Array();

            should.exist(actionsMap.add);
            actionsMap.add.should.be.an.Array();

            should.exist(actionsMap.destroy);
            actionsMap.destroy.should.be.an.Array();
        });

        it('includes post as an object type for multiple actions', function () {
            const actionsMap = actionsMapCache.initFromJSON();

            // Posts have browse, read, edit, add, destroy permissions
            actionsMap.browse.should.containEql('post');
            actionsMap.read.should.containEql('post');
            actionsMap.edit.should.containEql('post');
            actionsMap.add.should.containEql('post');
            actionsMap.destroy.should.containEql('post');
        });

        it('includes user as an object type', function () {
            const actionsMap = actionsMapCache.initFromJSON();

            actionsMap.browse.should.containEql('user');
            actionsMap.read.should.containEql('user');
            actionsMap.edit.should.containEql('user');
        });

        it('includes comment actions', function () {
            const actionsMap = actionsMapCache.initFromJSON();

            actionsMap.should.have.property('moderate');
            actionsMap.moderate.should.containEql('comment');

            actionsMap.browse.should.containEql('comment');
            actionsMap.add.should.containEql('comment');
        });

        it('does not include duplicate object types for same action', function () {
            const actionsMap = actionsMapCache.initFromJSON();

            // Check that each action's object types array has no duplicates
            for (const [action, objectTypes] of Object.entries(actionsMap)) {
                const uniqueTypes = [...new Set(objectTypes)];
                objectTypes.length.should.equal(uniqueTypes.length,
                    `Action "${action}" has duplicate object types`);
            }
        });

        it('returns same structure as init() would return', function () {
            // The JSON-based init should produce the same shape as DB-based init
            const actionsMap = actionsMapCache.initFromJSON();

            // All values should be arrays of strings
            for (const [action, objectTypes] of Object.entries(actionsMap)) {
                action.should.be.a.String();
                objectTypes.should.be.an.Array();
                for (const objType of objectTypes) {
                    objType.should.be.a.String();
                }
            }
        });
    });

    describe('getAll after initFromJSON', function () {
        it('returns the actions map after initFromJSON is called', function () {
            actionsMapCache.initFromJSON();

            const result = actionsMapCache.getAll();

            should.exist(result);
            result.should.be.an.Object();
            should.exist(result.browse);
            should.exist(result.edit);
        });

        it('empty() returns false after initFromJSON', function () {
            actionsMapCache.initFromJSON();

            actionsMapCache.empty().should.be.false();
        });
    });
});
