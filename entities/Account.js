var EntitySchema = require("typeorm").EntitySchema;

module.exports = new EntitySchema({
    name: "Account",
    tableName: "accounts",
    columns: {
        username: {
            primary: true,
            type: "varchar",
        },
        password: {
            type: "varchar",
        }
    }
});