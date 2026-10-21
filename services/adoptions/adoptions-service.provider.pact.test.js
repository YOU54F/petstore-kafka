const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { Verifier, providerWithMetadata } = require('@pact-foundation/pact')
const { PACT_DIR, gitInfo } = require('../test/support')
const { petAdoptionStatusChanged } = require('./messages')

// adoptions-service as a provider, under the pacticipant adoptions-service-events (whose provider contract is the
// AsyncAPI document, specs/asyncapi/adoptions-service.asyncapi.yaml): the pets.statusChanged events it sends as
// adoptions move on, against what its consumers expect (petstore-inc's notifications service, which tells the
// adopter). Messages only, answered by the same builder index.js sends with; no Kafka.

// Each message's topic travels as Kafka metadata, so it is part of the contract too.
const asMessage = ({ topic, value }) => providerWithMetadata(() => value, { topic })

// The verifier needs a provider URL even for message-only pacts; nothing calls it.
let server
beforeAll(async () => {
  server = http.createServer((_req, res) => res.writeHead(404).end()).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
})
afterAll(() => new Promise((resolve) => server.close(resolve)))

// Without a broker: *-adoptions-service-events.json in PACT_DIR, plus any files in PACT_URLS (comma separated), e.g.
// petstore-inc/services/notifications/pacts/notifications-adoptions-service-events.json.
function localPacts() {
  const fromDir = fs.existsSync(PACT_DIR)
    ? fs.readdirSync(PACT_DIR).filter((f) => f.endsWith('-adoptions-service-events.json')).map((f) => path.join(PACT_DIR, f))
    : []
  const fromEnv = (process.env.PACT_URLS || '').split(',').map((s) => s.trim()).filter(Boolean)
  return [...fromDir, ...fromEnv].filter((f) => /^https?:/.test(f) || fs.existsSync(f))
}

function pactSource({ local = true } = {}) {
  const { PACT_BROKER_BASE_URL, PACT_BROKER_TOKEN, PACT_BROKER_USERNAME, PACT_BROKER_PASSWORD } = process.env
  if(!PACT_BROKER_BASE_URL) return { pactUrls: local ? localPacts() : [] }

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
    // WIP pacts: notifications' pact is published from a petstore-inc feature branch before it merges.
    includeWipPactsSince: process.env.PACT_INCLUDE_WIP_SINCE || '2026-01-01',
    // No consumer may have published yet; that is not a failure.
    failIfNoPactsFound: false,
    publishVerificationResult: process.env.CI === 'true',
    providerVersion: version,
    providerVersionBranch: branch,
  }
}

// adoptions-service: consumer versions already deployed to local (notifications) still name it as the message
// provider. Broker only; drop it once every consumer has redeployed with a pact against adoptions-service-events.
describe.each([
  ['adoptions-service-events', pactSource()],
  ['adoptions-service', pactSource({ local: false })],
])('%s', (provider, source) => {
  const nothingToVerify = source.pactUrls && source.pactUrls.length === 0
  ;(nothingToVerify ? it.skip : it)('meets the expectations of its consumers', () => {
    return new Verifier({
      provider,
      providerBaseUrl: `http://127.0.0.1:${server.address().port}`,
      logLevel: process.env.LOG_LEVEL || 'warn',
      ...source,

      stateHandlers: {
        'an adoption by a Petstore Inc customer is approved': async () => {},
      },

      messageProviders: {
        'a pet status change for an adoption': asMessage(petAdoptionStatusChanged(crypto.randomUUID(), 'adopted', 'c-1')),
      },
    }).verifyProvider()
  }, 60_000)
})
