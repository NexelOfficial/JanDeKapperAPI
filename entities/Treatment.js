var EntitySchema = require("typeorm").EntitySchema;

module.exports = new EntitySchema({
    name: "Treatment",
    tableName: "treatments",
    columns: {
        treatment_id: {
            primary: true,
            type: "int",
            generated: true
        },
        title: {
            type: "varchar"
        },
        price: {
            type: "float"
        }
    }
});