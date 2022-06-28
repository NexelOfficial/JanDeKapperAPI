var EntitySchema = require("typeorm").EntitySchema;

module.exports = new EntitySchema({
    name: "Reservation",
    tableName: "reservations",
    columns: {
        reservation_id: {
            primary: true,
            type: "int",
            generated: true
        },
        email_address: {
            type: "varchar"
        }, 
        employee_id: {
            type: "int"
        },
        start: {
            type: "bigint"
        },
        end: {
            type: "bigint"
        },
        treatments: {
            type: "json"
        }
    },
    relations: {
        customer: {
            type: 'many-to-one',
            target: 'Customer',
            joinColumn: {
                name: "email_address"
            }
        }
    }
});