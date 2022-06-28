var EntitySchema = require("typeorm").EntitySchema;

module.exports = new EntitySchema({
    name: "Order",
    tableName: "orders",
    columns: {
        order_id: {
            primary: true,
            type: "int",
            generated: true
        },
        grossTotal: {
            type: "float"
        }, 
        discount: {
            type: "float"
        }, 
        netTotal: {
            type: "float"
        }, 
        payAmount: {
            type: "float"
        }, 
        change: {
            type: "float"
        }, 
        products: {
            type: "json"
        }, 
    }
});