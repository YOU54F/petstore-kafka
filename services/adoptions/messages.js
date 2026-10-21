// The events adoptions-service produces on pets.statusChanged: holding, claiming or releasing pets as an adoption
// moves on. index.js sends every one through here, and the provider pact test verifies them against what
// petstore-inc's notifications service expects.

// adopterId is optional: the customer id given with the adoption request (e.g. a Petstore Inc customer), so the
// adopter can be told. It is left out when the adoption didn't name one.
const petAdoptionStatusChanged = (petId, status, adopterId) => ({
  topic: 'pets.statusChanged',
  value: adopterId ? { id: petId, status, adopterId } : { id: petId, status },
})

// kafkajs producer.send() payload for several messages on one topic
const toRecord = (messages) => ({
  topic: messages[0].topic,
  messages: messages.map(({ value }) => ({ value: JSON.stringify(value) })),
})

module.exports = {
  petAdoptionStatusChanged,
  toRecord,
}
