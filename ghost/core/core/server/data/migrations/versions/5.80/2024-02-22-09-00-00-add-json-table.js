const {addTable} = require('../../utils');

module.exports = addTable('json', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    json: {type: 'text', maxlength: 1_000_000_000, nullable: true}
});
