// The events pets-service produces. service.js and index.js build every message through these, and the
// provider pact test verifies them against what adoptions-service and websocket-service expect.

const petAdded = (pet) => ({
  topic: 'pets.added',
  value: pet,
})

const petStatusChanged = (pet, status) => ({
  topic: 'pets.statusChanged',
  value: { ...pet, status },
})

// kafkajs producer.send() payload for a message
const toRecord = ({ topic, value }) => ({
  topic,
  messages: [{ value: JSON.stringify(value) }],
})

module.exports = {
  petAdded,
  petStatusChanged,
  toRecord,
}
