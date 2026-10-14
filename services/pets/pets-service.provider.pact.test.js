const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { Verifier, providerWithMetadata } = require('@pact-foundation/pact')
const { PACT_DIR, tempDb, gitInfo } = require('../test/support')
const { createApp } = require('./service')
const { petAdded, petStatusChanged } = require('./messages')

// pets-service against everything its consumers expect of it: web-ui's REST pact, and the events that
// adoptions-service and websocket-service consume. No Kafka: the app gets a stub producer, and message
// interactions are answered by the same builders the service sends with.

const db = tempDb('pets-cache')
const producer = { send: async () => {} }
const examplePet = () => ({ id: crypto.randomUUID(), name: 'Max', location: 'Plett', status: 'pending' })

// Each message's topic travels as Kafka metadata, so it is part of the contract too.
const asMessage = ({ topic, value }) => providerWithMetadata(() => value, { topic })

let server
beforeAll(async () => {
  server = createApp({ producer, db }).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
})
afterAll(() => new Promise((resolve) => server.close(resolve)))

function pactSource() {
  const { PACT_BROKER_BASE_URL, PACT_BROKER_TOKEN, PACT_BROKER_USERNAME, PACT_BROKER_PASSWORD } = process.env

  if(!PACT_BROKER_BASE_URL) {
    const local = [
      ...fs.readdirSync(PACT_DIR).filter((f) => f.endsWith('-pets-service.json')).map((f) => path.join(PACT_DIR, f)),
      path.resolve(__dirname, '../../web-ui/pacts/web-ui-pets-service.json'),
    ]
    return { pactUrls: local.filter((f) => fs.existsSync(f)) }
  }

  const { version, branch } = gitInfo()
  // pact-core validates every auth key that is present, even an undefined one, so only add the ones in use.
  const auth = PACT_BROKER_TOKEN
    ? { pactBrokerToken: PACT_BROKER_TOKEN }
    : { pactBrokerUsername: PACT_BROKER_USERNAME, pactBrokerPassword: PACT_BROKER_PASSWORD }
  return {
    pactBrokerUrl: PACT_BROKER_BASE_URL,
    ...auth,
    consumerVersionSelectors: [{ mainBranch: true }, { matchingBranch: true }, { deployedOrReleased: true }],
    enablePending: true,
    publishVerificationResult: process.env.CI === 'true',
    providerVersion: version,
    providerVersionBranch: branch,
  }
}

describe('pets-service', () => {
  it('meets the expectations of its consumers', () => {
    return new Verifier({
      provider: 'pets-service',
      providerBaseUrl: `http://127.0.0.1:${server.address().port}/api`,
      logLevel: process.env.LOG_LEVEL || 'warn',
      ...pactSource(),

      stateHandlers: {
        'some pets exist': async ({ location, status }) => {
          const pet = { ...examplePet(), location, status }
          db.dbPut(pet.id, pet)
        },
        'a pet called foo does not exist': async () => {},
        'a pet exists': async () => {},
      },

      messageProviders: {
        'a pet was added': asMessage(petAdded(examplePet())),
        'a pet status change': asMessage(petStatusChanged(examplePet(), 'available')),
      },
    }).verifyProvider()
  }, 60_000)
})
