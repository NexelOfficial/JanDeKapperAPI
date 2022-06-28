var EntitySchema = require("typeorm").EntitySchema;

module.exports = new EntitySchema({
    name: "Employee",
    tableName: "employees",
    columns: {
        employee_id: {
            primary: true,
            type: "int",
            generated: true
        },
        first_name: {
            type: "varchar"
        }, 
        last_name: {
            type: "varchar"
        }
    }
});