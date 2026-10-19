// Drift AsyncAPI harness: runs the real pets-service and adoptions-service (pets/index.js, adoptions/index.js) against
// the broker in KAFKA_BOOTSTRAP, and sets up provider states and triggers for Drift over HTTP:
//   GET  /healthz       200 once a warm-up pet and adoption have gone all the way through both services
//   POST /drift/state   {state, trigger?, petId?, adoptionId?}: waits for the topics to go quiet, sets up the state,
//                       and remembers the trigger (asyncapi.lua calls it on operation:started)
//   POST /drift/trigger runs the remembered trigger and prints {} (trigger.sh; Drift has subscribed by then)
// Workarounds for Drift's kafka plugin: it doesn't create topics, so this does (one partition each, as the services'
// caches assume), and it can't read compressed batches, so they're created uncompressed (kafkajs doesn't compress
// by default either).
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { Kafka, logLevel } = require('kafkajs')

const KAFKA_BOOTSTRAP = process.env.KAFKA_BOOTSTRAP
if (!KAFKA_BOOTSTRAP) {
  console.error('KAFKA_BOOTSTRAP is required')
  process.exit(1)
}
const PORT = Number(process.env.DRIFT_SERVER_PORT || 18182)
const PETS_PORT = Number(process.env.PETS_PORT || 18184)
const ADOPTIONS_PORT = Number(process.env.ADOPTIONS_PORT || 18185)
const TOPICS = ['pets.added', 'pets.statusChanged', 'adoptions.requested', 'adoptions.statusChanged']
const QUIET_MS = 1500
const services = path.resolve(__dirname, '..')

const kafka = new Kafka({ brokers: KAFKA_BOOTSTRAP.split(','), clientId: 'drift-harness', logLevel: logLevel.WARN })
const seen = [] // every message on TOPICS since the harness subscribed: {topic, value}
let lastMessageAt = Date.now()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor(description, predicate, { from = 0, timeoutMs = 30000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (seen.slice(from).some(predicate)) return
    await sleep(100)
  }
  throw new Error(`timed out waiting for ${description}`)
}

// Nothing on any topic for QUIET_MS: the services have finished with whatever came before.
async function settle(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() - lastMessageAt < QUIET_MS) {
    if (Date.now() > deadline) throw new Error('the topics did not go quiet')
    await sleep(100)
  }
}

async function call(port, method, urlPath, body) {
  const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${urlPath}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function untilUp(port) {
  for (let i = 0; i < 120; i++) {
    try {
      return await call(port, 'GET', port === PETS_PORT ? '/api/pets' : '/api/adoptions')
    } catch (_) {
      await sleep(500)
    }
  }
  throw new Error(`nothing listening on ${port}`)
}

const is = (topic, fields) => m => m.topic === topic && Object.entries(fields).every(([k, v]) => m.value[k] === v)

async function availablePet(petId = crypto.randomUUID()) {
  const from = seen.length
  await call(PETS_PORT, 'POST', '/api/pets', { id: petId, name: 'Drift', location: 'Plett' })
  await waitFor(`pet ${petId} available`, is('pets.statusChanged', { id: petId, status: 'available' }), { from })
  return petId
}

async function availableAdoption(adoptionId = crypto.randomUUID(), petId) {
  petId = await availablePet(petId)
  const from = seen.length
  await call(ADOPTIONS_PORT, 'POST', '/api/adoptions',
    { id: adoptionId, pets: [petId], location: 'Plett', adopterId: 'drift-adopter' })
  await waitFor(`adoption ${adoptionId} available`,
    is('adoptions.statusChanged', { id: adoptionId, status: 'available' }), { from })
  return { petId, adoptionId }
}

const states = {
  'nothing in particular': async () => ({}),
  'no pet exists': async () => ({}),
  'a pet is available': async ({ petId }) => ({ petId: await availablePet(petId) }),
  'an adoption is available': async ({ petId, adoptionId }) => availableAdoption(adoptionId, petId),
}

const triggers = {
  'add pet': () => call(PETS_PORT, 'POST', '/api/pets', { name: 'Drift', location: 'Plett' }),
  'patch pet': ({ petId }) => call(PETS_PORT, 'PATCH', `/api/pets/${petId}`, { status: 'adopted' }),
  'request adoption': ({ petId }) =>
    call(ADOPTIONS_PORT, 'POST', '/api/adoptions', { pets: [petId], location: 'Plett', adopterId: 'drift-adopter' }),
  approve: ({ adoptionId }) => call(ADOPTIONS_PORT, 'PATCH', `/api/adoptions/${adoptionId}`, { status: 'approved' }),
  deny: ({ adoptionId }) => call(ADOPTIONS_PORT, 'PATCH', `/api/adoptions/${adoptionId}`, { status: 'denied' }),
}

let ready = false
let pending = null // {trigger, context} from the last /drift/state

const children = []
function start(name, script, port) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `drift-${name}-`))
  const child = spawn(process.execPath, [script], {
    cwd: path.dirname(script),
    env: { ...process.env, KAFKA_HOSTS: KAFKA_BOOTSTRAP, DATA_BASEPATH: dataDir, NODE_PORT: String(port) },
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  child.on('exit', code => {
    if (!shuttingDown) {
      console.error(`${name} exited (${code})`)
      process.exit(1)
    }
  })
  children.push(child)
}

let shuttingDown = false
async function shutdown(code = 0) {
  shuttingDown = true
  // The services disconnect from Kafka before they exit; give them up to 10s.
  const exited = children.filter(child => child.exitCode === null && child.signalCode === null)
    .map(child => new Promise(resolve => child.once('exit', resolve)))
  children.forEach(child => child.kill('SIGTERM'))
  await Promise.race([Promise.all(exited), sleep(10000)])
  children.forEach(child => child.kill('SIGKILL'))
  process.exit(code)
}
process.once('SIGTERM', () => shutdown())
process.once('SIGINT', () => shutdown())

function respond(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => (data += chunk))
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch (e) {
        reject(e)
      }
    })
  })
}

http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/healthz') return respond(res, ready ? 200 : 503, { ready })
    if (req.method === 'POST' && req.url === '/drift/state') {
      const { state, trigger, ...ids } = await readBody(req)
      if (!states[state]) return respond(res, 400, { error: `unknown state '${state}'` })
      if (trigger && !triggers[trigger]) return respond(res, 400, { error: `unknown trigger '${trigger}'` })
      await settle()
      const context = { ...ids, ...(await states[state](ids)) }
      await settle()
      pending = trigger ? { trigger, context } : null
      console.log(`drift: state '${state}' ready ${JSON.stringify(context)}`)
      return respond(res, 200, context)
    }
    if (req.method === 'POST' && req.url === '/drift/trigger') {
      if (!pending) return respond(res, 400, { error: 'no trigger set up' })
      const { trigger, context } = pending
      pending = null
      await triggers[trigger](context)
      console.log(`drift: triggered '${trigger}'`)
      return respond(res, 200, {})
    }
    respond(res, 404, { error: 'not found' })
  } catch (e) {
    console.error(e)
    respond(res, 500, { error: e.message })
  }
}).listen(PORT, '127.0.0.1', () => console.log(`drift harness on http://127.0.0.1:${PORT}`))

async function main() {
  const admin = kafka.admin()
  await admin.connect()
  await admin.createTopics({
    waitForLeaders: true,
    topics: TOPICS.map(topic => ({
      topic,
      numPartitions: 1,
      configEntries: [{ name: 'compression.type', value: 'uncompressed' }],
    })),
  })
  await admin.disconnect()

  const watcher = kafka.consumer({ groupId: `drift-harness-${crypto.randomUUID()}` })
  await watcher.connect()
  await watcher.subscribe({ topics: TOPICS, fromBeginning: false })
  const joined = new Promise(resolve => watcher.on(watcher.events.GROUP_JOIN, resolve))
  await watcher.run({
    eachMessage: async ({ topic, message }) => {
      lastMessageAt = Date.now()
      try {
        seen.push({ topic, value: JSON.parse(message.value.toString()) })
      } catch (_) {
        seen.push({ topic, value: {} })
      }
    },
  })
  await joined

  start('pets', path.join(services, 'pets', 'index.js'), PETS_PORT)
  start('adoptions', path.join(services, 'adoptions', 'index.js'), ADOPTIONS_PORT)
  await untilUp(PETS_PORT)
  await untilUp(ADOPTIONS_PORT)

  // Warm-up: the services' consumer groups join a while after they listen; retry until a pet and an adoption go
  // all the way through.
  const deadline = Date.now() + 120000
  for (;;) {
    try {
      await availableAdoption()
      break
    } catch (e) {
      if (Date.now() > deadline) throw e
      console.log(`drift: warming up (${e.message})`)
    }
  }
  await settle()
  ready = true
  console.log('drift: ready')
}

main().catch(e => {
  console.error(e)
  shutdown(1)
})
