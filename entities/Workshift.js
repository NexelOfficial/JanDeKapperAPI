var EntitySchema = require("typeorm").EntitySchema;

module.exports = new EntitySchema({
    name: "Workshift",
    tableName: "workshifts",
    columns: {
        workshift_id: {
            primary: true,
            type: "int",
            generated: true
        },
        employee_id: {
            type: "int"
        }, 
        start: {
            type: "bigint"
        }, 
        end: {
            type: "bigint"
        }
    }
});