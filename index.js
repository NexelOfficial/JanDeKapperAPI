const typeorm = require("typeorm");

const cors = require("cors");
const express = require("express");
const bcrypt = require("bcrypt");
const { createServer } = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const { MoreThan, Between, LessThanOrEqual, LessThan } = require("typeorm");
const app = express();
const SSE = require('express-sse');
const { chairs, clients, init } = require("./boot/kafka");

// Setup env file
dotenv.config();

// General Configuration from the .env file
const config = {
    type: "postgres",
    port: 5432,
    host: process.env.HOST,
    username: process.env.USER,
    password: process.env.PASSWORD,
    database: process.env.DATABASE,
    entities: [
        require("./entities/Reservation"),
        require("./entities/Employee"),
        require("./entities/Workshift"),
        require("./entities/Customer"),
        require("./entities/Account"),
        require("./entities/Product"),
        require("./entities/Treatment"),
        require("./entities/Order")
    ],
    ssl: true,
    extra: {
        ssl: {
            rejectUnauthorized: false,
        },
    },
    syncronize: true,
    logging: false,
};

// The CORS config
const corsConfig = {
    origin: "*",
    methods: ["GET", "PUT", "POST", "DELETE"],
    preflightContinue: false,
    optionsSuccessStatus: 200,
    allowedHeaders: ["Content-Type, X-Access-Token"],
};

typeorm.createConnection(config).then((connection) => {
    // Startup REST Api
    app.use(express.json());
    app.use(cors(corsConfig));
    app.use(helmet());
    const httpServer = createServer(app);
    const io = new Server(httpServer, { cors:"*" });
    httpServer.listen(process.env.PORT);
    const reservationRepo = connection.getRepository("Reservation");
    const employeeRepo = connection.getRepository("Employee");
    const workshiftRepo = connection.getRepository("Workshift");
    const accountRepo = connection.getRepository("Account");
    const customerRepo = connection.getRepository("Customer");
    const productRepo = connection.getRepository("Product");
    const treatmentRepo = connection.getRepository("Treatment");
    const orderRepo = connection.getRepository("Order");

    // Authenticate given token (if given)
    const checkToken = (req, res, next) => {
        const token = req.headers["x-access-token"];

        if (token == null)
            return res.status(403).send({
                status: "failure",
                reason: "Not authenticated / Invalid Token",
            });

        jwt.verify(token, process.env.TOKEN_SECRET, (error, user) => {
            if (error)
                return res.status(403).send({
                    status: "failure",
                    reason: "Not authenticated / Invalid Token",
                });

            req.user = user;
            next();
        });
    };

    // Allow client to login using a username and password
    app.post("/auth", (req, res) => {
        let data = {
            username: req.body.username,
            password: req.body.password,
        };

        accountRepo.find({ username: data.username }).then((results) => {
            if (results.length > 0) {
                const account = results[0];
                const options = { expiresIn: process.env.TOKEN_EXPIRE_TIME };

                bcrypt.compare(
                    data.password,
                    account.password,
                    function (err, result) {
                        if (result == true) {
                            const accessToken = jwt.sign(
                                account,
                                process.env.TOKEN_SECRET,
                                options
                            );
                            const responseData = {
                                username: account.username,
                                role: account.role,
                                token: accessToken,
                            };

                            res.send({ status: "succes", data: responseData });
                            return true;
                        }

                        res.status(403).send({
                            status: "failure",
                            reason: "Wrong information",
                        });
                        return false;
                    }
                );
            } else {
                res.status(403).send({
                    status: "failure",
                    reason: "Wrong information",
                });
                return false;
            }
        });
    });

    // Validate a token to see if it still works
    app.post("/validate", (req, res) => {
        let data = {
            token: req.body.token,
        };

        if (data.token == null)
            return res
                .status(400)
                .send({
                    status: "failure",
                    reason: "No valid token was given",
                });

        jwt.verify(data.token, process.env.TOKEN_SECRET, (error, user) => {
            if (error)
                return res.json({
                    status: "succes",
                    data: { valid: false, token: data.token },
                });
            else
                return res.json({
                    status: "succes",
                    data: { valid: true, token: data.token },
                });
        });
    });

    // Recieve all reservations
    app.get("/reservations/:id?", checkToken, (req, res) => {
        const data = {
            id: req.params.id,
        };
        reservationRepo.findOne({reservation_id: data.id, relations: ['customer']}).then(d=>console.log(d))
        console.log(data.id)
        if (data.id) handleAction(reservationRepo.findOneOrFail(data.id, { relations: ['customer']}), res);
        else handleAction(reservationRepo.find({relations: ['customer']}), res);
    });

    // Upload a new reservation
    app.post("/reservations", (req, res) => {
        let data = {
            email_address: req.body.email_address,
            employee_id: req.body.employee_id,
            start: roundTo15m(req.body.start, Math.floor),
            end: roundTo15m(req.body.end, Math.ceil),
            first_name: req.body.first_name,
            last_name: req.body.last_name,
            phone_number: req.body.phone_number,
            treatments: req.body.treatments,
        };

        // Check if customer already exists
        customerRepo.findOne(data.email_address).then((result) => {
            if (!result) {
                // Customer doesn't exist yet, add to database
                customerRepo.insert(data).then(() => {
                    return handleAction(reservationRepo.save(data), res);
                });
            } else {
                return handleAction(reservationRepo.save(data), res);
            }
        });
    });

    // Delete a reservation
    app.delete("/reservations", checkToken, (req, res) => {
        let data = {
            id: req.body.id,
        };

        if (data.id) handleAction(reservationRepo.delete(data.id), res);
        else
            return res.status(400).send({
                status: "failure",
                reason: "NO_ID",
            });
    });

    // Recieve all employees or a given employee
    app.get("/employees/:id?", (req, res) => {
        const data = {
            id: req.params.id,
        };

        if (data.id) handleAction(employeeRepo.findOne(data.id), res);
        else handleAction(employeeRepo.find(), res);
    });

    // Request all employee timeframes
    app.post("/find_timeframes", (req, res) => {
        let data = {
            employee_id: req.body.employee_id,
            ms: req.body.ms,
        };

        if (!data.ms) data.ms = new Date().getTime();

        let [start, end] = getDayStartEnd(data.ms);
        let params = {
            where: {
                start: Between(start, end),
            },
        };

        if (data.employee_id) params.employee_id = data.employee_id;

        // First check when the employee is working
        workshiftRepo.find(params).then((shiftResults) => {
            // Get today's appointments for this employee
            reservationRepo.find(params).then((resResults) => {
                // Keep track of all the timeframes already available and then get all timeframes
                let busyFrames = {};
                let timeframes = {};

                // Get the not available timeframes
                for (let reservation of resResults) {
                    let appointmentFrames = getTimeframes(
                        reservation.start,
                        reservation.end
                    );

                    for (let frame of appointmentFrames)
                        if (frame.employee_id === data.employee_id) {
                            if (frame in busyFrames)
                                busyFrames[frame].push(reservation.employee_id);
                            else busyFrames[frame] = [reservation.employee_id];
                        }
                }

                // Add the remaining ones to a list
                for (let shift of shiftResults) {
                    let shiftFrames = getTimeframes(shift.start, shift.end);

                    for (let frame of shiftFrames)
                        if (!(frame in busyFrames))
                            timeframes[frame] = {
                                ms: frame,
                                employee_id: shift.employee_id,
                            };
                }

                res.json({ status: "success", data: timeframes });
            });
        });
    });

    // Upload a new employee
    app.post("/employees", checkToken, (req, res) => {
        let data = {
            first_name: req.body.first_name,
            last_name: req.body.last_name,
            skills: req.body.skills,
        };

        handleAction(employeeRepo.save(data), res);
    });

    // Delete an employee
    app.delete("/employees", checkToken, (req, res) => {
        let data = { id: req.body.id };

        if (data.id)
            workshiftRepo.delete(data.id).then(() => {
                reservationRepo.delete(data.id).then(() => {
                    handleAction(employeeRepo.delete(data.id), res);
                });
            });
        else
            return res.status(400).send({
                status: "failure",
                reason: "NO_ID",
            });
    });

    app.get("/day_reservations/:ms?", checkToken, (req, res) => {
        const data = {
            ms: req.params.ms,
        };

        let ms = data.ms ? data.ms : new Date().getTime();

        const [start, end] = getDayStartEnd(ms);

        let params = {
            where: {
                start: Between(start, end),
            },
        };

        handleAction(reservationRepo.find(params), res);
    });

    // Recieve all customers
    app.get("/customers/:email_address?", checkToken, (req, res) => {
        const data = {
            email_address: req.params.email_address,
        };

        if (data.email_address)
            handleAction(customerRepo.findOne(data.email_address), res);
        else handleAction(customerRepo.find(), res);
    });

    // Upload a new customer
    app.post("/customers", checkToken, (req, res) => {
        let data = {
            first_name: req.body.first_name,
            last_name: req.body.last_name,
            phone_number: req.body.phone_number,
            email_address: req.body.email_address,
        };

        handleAction(customerRepo.insert(data), res);
    });

    // Delete a user
    app.delete("/customers", checkToken, (req, res) => {
        let data = { email_address: req.body.email_address };

        if (data.email_address)
            handleAction(customerRepo.delete(data.email_address), res);
        else
            return res.status(400).send({
                status: "failure",
                reason: "NO_ID",
            });
    });

    // Recieve all workshifts
    app.get("/workshifts/:id?", checkToken, (req, res) => {
        const data = {
            id: req.params.id,
        };

        if (data.id) handleAction(workshiftRepo.findOne(data.id), res);
        else handleAction(workshiftRepo.find(), res);
    });

    // Upload a new shft
    app.post("/workshifts", checkToken, (req, res) => {
        let data = {
            employee_id: req.body.employee_id,
            start: roundTo15m(req.body.start, Math.floor),
            end: roundTo15m(req.body.end, Math.ceil),
            state: req.body.state,
        };

        handleAction(workshiftRepo.save(data), res);
    });

    // Delete a shift
    app.delete("/workshifts", checkToken, (req, res) => {
        let data = { id: req.body.id };

        if (data.id) handleAction(workshiftRepo.delete(data.id), res);
        else
            return res.status(400).send({
                status: "failure",
                reason: "NO_ID",
            });
    });

    // Recieve all products
    app.get("/products/:id?", checkToken, (req, res) => {
        const data = {
            id: req.params.id,
        };

        if (data.id) handleAction(productRepo.findOne(data.id), res);
        else handleAction(productRepo.find(), res);
    });

    // Upload a new product
    app.post("/products", checkToken, (req, res) => {
        let data = {
            title: req.body.title,
            price: req.body.price,
            amt: req.body.amt,
        };

        handleAction(productRepo.save(data), res);
    });

    // Delete a product
    app.delete("/products", checkToken, (req, res) => {
        let data = { id: req.body.id };

        if (data.id) handleAction(productRepo.delete(data.id), res);
        else
            return res.status(400).send({
                status: "failure",
                reason: "NO_ID",
            });
    });

    // Recieve all products
    app.get("/orders/:id?", checkToken, (req, res) => {
        const data = {
            id: req.params.id,
        };

        if (data.id) handleAction(orderRepo.findOne(data.id), res);
        else handleAction(orderRepo.find(), res);
    });

    // Upload a new product
    app.post("/orders", checkToken, (req, res) => {
        let data = {
            grossTotal: req.body.grossTotal,
            discount: req.body.discount,
            netTotal: req.body.netTotal,
            payAmount: req.body.payAmount,
            change: req.body.change,
            products: req.body.products,
        };

        // if (!isJson(data.products))
        //     return res.status(400).send({
        //         status: "failure",
        //         reason: "PRODUCTS_NO_JSON",
        //     });

        // let products = JSON.parse(data.products);
        // let noStorageProducts = []

        // for (let pdt of products)
        // {
        //     if (pdt?.title && pdt?.amt) {
        //         productRepo.find(pdt.product_id).then(dbPdt => {
        //             if (dbPdt.amt > 0)
        //                 productRepo.update(pdt.product_id, { amt: dbPdt.amt - 1});
        //             else
        //                 noStorageProducts.push(pdt);
        //         });
        //     }
        // }

        // console.log(noStorageProducts);

        // if (noStorageProducts.length > 0)
        //     return res.status(400).send({
        //         status: "failure",
        //         reason: "NO_MORE_STORAGE",
        //         data: { noStorageProducts }
        //     });

        handleAction(orderRepo.save(data), res);
    });

    // Delete a product
    app.delete("/orders", checkToken, (req, res) => {
        let data = { id: req.body.id };

        if (data.id) handleAction(orderRepo.delete(data.id), res);
        else
            return res.status(400).send({
                status: "failure",
                reason: "NO_ID",
            });
    });

    // Recieve all treatments
    app.get("/treatments/:id?", (req, res) => {
        const data = {
            id: req.params.id,
        };

        if (data.id) handleAction(treatmentRepo.findOne(data.id), res);
        else handleAction(treatmentRepo.find(), res);
    });

    // Upload a new treatment
    app.post("/treatments", checkToken, (req, res) => {
        let data = {
            title: req.body.title,
        };

        handleAction(treatmentRepo.save(data), res);
    });

    // Delete a treatment
    app.delete("/treatments", checkToken, (req, res) => {
        let data = { id: req.body.id };

        if (data.id) handleAction(treatmentRepo.delete(data.id), res);
        else
            return res.status(400).send({
                status: "failure",
                reason: "NO_ID",
            });
    });

    app.get("/available_dates/:ms/:employee_id?", (req, res) => {
        const data = {
            ms: req.params.ms,
            employee_id: req.params.employee_id,
        };

        const [start] = getDayStartEnd(data.ms);

        let params = {
            where: {
                start: MoreThan(start),
            },
        };

        if (data.employee_id) params.where.employee_id = data.employee_id;

        // First check when the employee is working
        workshiftRepo.find(params).then((results) => {
            let available_days = [];

            for (let shift of results) {
                let [startShift] = getDayStartEnd(shift?.start);

                if (!available_days.includes(startShift))
                    available_days.push(startShift);
            }

            res.json({ status: "success", data: available_days });
        });
    });

    app.get("/occupied_dates/:employee_id?", (req, res) => {
        const data = {
            employee_id: req.params.employee_id,
        };

        params = { where: {} };

        if (data.employee_id) params.where.employee_id = data.employee_id;

        // First check when the employee is working
        reservationRepo.find(params).then((results) => {
            let occupied_days = [];

            for (let reservation of results) {
                let [startShift] = getDayStartEnd(reservation?.start);

                if (!occupied_days.includes(startShift))
                    occupied_days.push(startShift);
            }

            res.json({ status: "success", data: occupied_days });
        });
    });
    //sockets
    io.on("connection", (socket) => {
        const switches = []
        for(let [key,value] of chairs.entries()){
            switches.push({name: key,value})
        }
        // 
        socket.emit("switch-sensor",switches);
        socket.emit('pir-sensor',{clients: clients.value})
      });
    init(io);
});

function handleAction(action, res) {
    action
        .then((result) => {
            return res.json({
                status: "success",
                data: result,
            });
        })
        .catch((error) => {
            return res.status(400).send({
                status: "failure",
                reason: error.code,
            });
        });
}

// Get start and end of day by ms
function getDayStartEnd(ms) {
    if (typeof ms != "number") {
        if (canParseFloat(ms)) ms = parseFloat(ms);
    }

    var start = new Date(ms);
    start.setHours(0, 0, 0, 0);

    var end = new Date(ms);
    end.setHours(23, 59, 59, 999);

    return [start.getTime(), end.getTime()];
}

function isJson(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

// Round ms to 15 minutes
function roundTo15m(ms, method) {
    if (typeof ms != "number") {
        if (canParseFloat(ms)) ms = parseFloat(ms);
    }

    if (method != Math.floor && method != Math.ceil && method != Math.round)
        method = Math.round;

    var date = new Date(ms);
    var minutes = method(date.getMinutes() / 15) * 15;

    date.setMinutes(minutes);
    date.setSeconds(0);
    date.setMilliseconds(0);

    return date.getTime();
}

function canParseFloat(string) {
    try {
        parseFloat(string);
        return true;
    } catch (error) {
        return false;
    }
}

// Get list of timeframes from ms
function getTimeframes(start, end) {
    if (typeof start != "number" || typeof end != "number") {
        if (canParseFloat(start)) start = parseFloat(start);
        if (canParseFloat(end)) end = parseFloat(end);
    }

    let timeframes = [];
    let startR = roundTo15m(start, Math.floor);
    let endR = roundTo15m(end, Math.ceil);
    let m15 = 900000;

    for (let i = startR; i <= endR; i += m15) timeframes.push(i);

    return timeframes;
}
