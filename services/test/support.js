const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execSync } = require('node:child_process')
const { FlatDB } = require('../lib')

// Consumer tests write here; the pets-service provider test reads these when there is no broker.
const PACT_DIR = path.resolve(__dirname, '../pacts')

// A FlatDB in a fresh temp dir, so tests never touch a service's real cache.
function tempDb(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
  return new FlatDB(path.join(dir, `${name}.db`))
}

// What the broker records for this build: the commit and its branch (CI env first, then git).
function gitInfo() {
  const git = (args) => {
    try {
      return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch (_) {
      return undefined
    }
  }
  return {
    version: process.env.GITHUB_SHA || git('rev-parse HEAD') || 'local',
    branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git('rev-parse --abbrev-ref HEAD') || 'local',
  }
}

module.exports = {
  PACT_DIR,
  tempDb,
  gitInfo,
}
