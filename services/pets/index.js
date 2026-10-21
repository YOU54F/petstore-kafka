const { Kafka, logLevel, Partitioners } = require('kafkajs')
const { KafkaSink, KafkaLogger, KafkaStream } = require('../lib')
const { createApp } = require('./service')
const { petsCacheProcessor } = require('./processor')
const { petStatusChanged, toRecord } = require('./messages')

// Configs
const KAFKA_HOSTS = (process.env.KAFKA_HOSTS || 'localhost:9092').split(',').map(s => s.trim())
const DATA_BASEPATH = process.env.DATA_BASEPATH || __dirname
const CLIENT_ID = 'pets'

// ---------------------------------------------------------------
// Kafka
console.log('Connecting to Kafka on: ' + JSON.stringify(KAFKA_HOSTS))
const kafka = new Kafka({
  logLevel: logLevel.INFO,
  logCreator: KafkaLogger,
  brokers: KAFKA_HOSTS,
  clientId: CLIENT_ID,
  retry: {
    initialRetryTime: 1000,
    retries: 16
  }
})
const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner })
producer.connect()

const petsCache = new KafkaSink({
  kafka,
  basePath: DATA_BASEPATH,
  name: 'pets-cache',
  topics: ['pets.added', 'pets.statusChanged'],
  onLog: ({log, topic, sink}) => {
    petsCacheProcessor({log, topic, db: sink.db})
  }
})

const petsStream = new KafkaStream({
  kafka,
  name: 'pets-stream',
  topics: ['pets.added'],
  onLog: async ({ log }) => {
    console.log(`Pet added, producing pets.statusChanged ${log.id} - available`)
    await producer.send(toRecord(petStatusChanged(log, 'available')))
  }
})

const consumers = [petsCache.consumer, petsCache.admin, petsStream.consumer]

// ---------------------------------------------------------------------------------------
// Boring stuff follows...
// ---------------------------------------------------------------------------------------

// Start server and handle logic around graceful exit
const app = createApp({ producer, db: petsCache.db })
const server = app.listen(process.env.NODE_PORT || 3100, () => {
  console.log('Server listening on http://' + server.address().address + ':' + server.address().port)
})
// Keep track of connections to kill 'em off later.
let connections = []
server.on('connection', connection => {
  connections.push(connection);
  connection.on('close', () => connections = connections.filter(curr => curr !== connection));
});

// Exit gracefully
const errorTypes = ['unhandledRejection', 'uncaughtException']
const signalTraps = ['SIGTERM', 'SIGINT', 'SIGUSR2']
errorTypes.forEach(type => {
  process.on(type, async e => {
    try {
      console.log(`process.on ${type}`)
      console.error(e)
      await shutdown()
    } catch (_) {
      process.exit(1)
    }
  })
})

signalTraps.forEach(type => {
  process.once(type, async () => {
    try {
      await shutdown()
    } finally {
      process.kill(process.pid, type)
    }
  })
})

async function shutdown() {
  await Promise.all([producer, ...consumers].map(client => client.disconnect()))

  server.close(() => {
    console.log('Closed out remaining connections');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 5000);

  connections.forEach(curr => curr.end());
  setTimeout(() => connections.forEach(curr => curr.destroy()), 5000);
}
