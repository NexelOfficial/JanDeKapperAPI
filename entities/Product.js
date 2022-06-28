var EntitySchema = require("typeorm").EntitySchema;

module.exports = new EntitySchema({
    name: "Product",
    tableName: "products",
    columns: {
        product_id: {
            primary: true,
            type: "int",
            generated: true
        },
        title: {
            type: "varchar"
        }, 
        price: {
            type: "float"
        }, 
        amt: {
            type: "int"
        }
    }
});