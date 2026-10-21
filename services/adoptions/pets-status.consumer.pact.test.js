const { Pact, Matchers: { regex, uuid } } = require('@pact-foundation/pact')
const { PACT_DIR, tempDb } = require('../test/support')
const { cachePetStatus } = require('./processor')

const pact = new Pact({
  consumer: 'adoptions-service',
  provider: 'pets-service-events',
  dir: PACT_DIR,
  logLevel: process.env.LOG_LEVEL || 'warn',
})

describe('adoptions-service consuming pets.statusChanged', () => {
  it('caches the status of a pet', () => {
    return pact
      .addAsynchronousInteraction()
      .given('a pet exists')
      .reference('AsyncAPI', 'operationId', 'publishPetStatusChanged') // specs/asyncapi/pets-service.asyncapi.yaml
      .expectsToReceive('a pet status change', (builder) => {
        builder
          .withJSONContent({
            id: uuid('6c9f429c-3f5d-4a55-88bf-026b2b404710'),
            status: regex('^(pending|available|onhold|adopted)$', 'available'),
          })
          .withMetadata({ topic: 'pets.statusChanged' })
      })
      .executeTest(async (message) => {
        const db = tempDb('adoptions-pet-status-cache')
        const log = message.contents.content

        cachePetStatus({ log, db })

        expect(db.dbGet(log.id)).toEqual({ status: 'available' })
      })
  })
})
