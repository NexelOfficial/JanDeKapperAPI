const { Kafka, logLevel } = require('kafkajs')

const chairs = new Map();
const clients = {value:0}
const broker = process.env.KAFKA || 'jans-sensors.tk'
const kafka = new Kafka({
    clientId: 'barber api',
    brokers: [`jans-sensors.tk:9092`],
    logLevel: logLevel.ERROR
})

async function init(io) {
    const consumer = kafka.consumer({groupId: 'chair-sensors1'})
    await consumer.connect()
    await consumer.subscribe({ topic: "PIRsensor", fromBeginning: true })
    await consumer.subscribe({ topic: "SwitchA"  })
    await consumer.subscribe({ topic: "SwitchB"  })
    await consumer.subscribe({ topic: "SwitchC" })
    await consumer.subscribe({ topic: "SwitchD"  })
    await consumer.subscribe({ topic: "SwitchE"  })
    await consumer.subscribe({ topic: "SwitchF"  })
    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            if(topic == "PIRsensor"){
                const increment = message.value.toString();
                if( increment == "1"){
                    clients.value = clients.value +1; 
                }else{
                    if(clients.value != 0) clients.value = clients.value -1;  
                }
                console.log({clients: clients.value});
                io.emit('pir-sensor',{clients: clients.value})
            }else{
                const switches = []
                chairs.set(topic, message.value.toString());
                for(let [key,value] of chairs.entries()){
                    switches.push({name: key,value})
                }
                io.emit("switch-sensor",switches)
                
            }
        }
    })
    
}

module.exports = {
    kafka,
    init,
    chairs,
    clients
}
