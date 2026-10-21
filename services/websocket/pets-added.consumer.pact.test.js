const { Pact, Matchers: { string, uuid } } = require('@pact-foundation/pact')
const { PACT_DIR, tempDb } = require('../test/support')
const { cacheLocation } = require('./processor')

const pact = new Pact({
  consumer: 'websocket-service',
  provider: 'pets-service-events',
  dir: PACT_DIR,
  logLevel: process.env.LOG_LEVEL || 'warn',
})

describe('websocket-service consuming pets.added', () => {
  it('remembers where a new pet is', () => {
    return pact
      .addAsynchronousInteraction()
      .reference('AsyncAPI', 'operationId', 'publishPetAdded') // specs/asyncapi/pets-service.asyncapi.yaml
      .expectsToReceive('a pet was added', (builder) => {
        builder
          .withJSONContent({
            id: uuid('6c9f429c-3f5d-4a55-88bf-026b2b404710'),
            location: string('Plett'),
          })
          .withMetadata({ topic: 'pets.added' })
      })
      .executeTest(async (message) => {
        const db = tempDb('websocket-location-cache')
        const log = message.contents.content

        cacheLocation({ log, db })

        expect(db.dbGet(log.id)).toEqual({ location: 'Plett' })
      })
  })
})
