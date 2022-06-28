var EntitySchema = require("typeorm").EntitySchema;

module.exports = new EntitySchema({
    name: "Customer",
    tableName: "customers",
    columns: {
        email_address: {
            primary: true,
            type: "varchar"
        },
        first_name: {
            type: "varchar"
        },
        last_name: {
            type: "varchar"
        },
        phone_number: {
            type: "varchar"
        }
    },
    relations: {
        reservations: {
            type: 'one-to-many',
            target: 'Reservation',
            joinColumn: {
                name: "reservation_id"
            },
            
        }
    }
});