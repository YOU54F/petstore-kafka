#!/usr/bin/env node
// Publish the consumer pacts written by the pact tests to the broker.
//
//   node scripts/pact-publish.mjs                  # services/pacts and web-ui/pacts
//   node scripts/pact-publish.mjs web-ui/pacts     # just one
//
// Uses PACT_BROKER_BASE_URL plus PACT_BROKER_TOKEN (PactFlow) or PACT_BROKER_USERNAME/PASSWORD (OSS broker); see the
// README's Contract testing section. Plain Node and the broker's /contracts/publish API, so it also runs in CI job
// containers, which have no Docker socket. The consumer version is the commit SHA (what can-i-deploy asks about) and
// the branch is the current branch; override them with PACT_CONSUMER_VERSION / PACT_CONSUMER_BRANCH.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const { PACT_BROKER_BASE_URL: base, PACT_BROKER_TOKEN: token, PACT_BROKER_USERNAME: user, PACT_BROKER_PASSWORD: pass } =
  process.env;
if (!base) {
  console.error('Set PACT_BROKER_BASE_URL (see the README)');
  process.exit(2);
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const version = process.env.PACT_CONSUMER_VERSION || git('rev-parse', 'HEAD');
// CI checkouts are detached, so fall back to the Actions ref (the PR's source branch first).
const branch =
  process.env.PACT_CONSUMER_BRANCH ||
  process.env.GITHUB_HEAD_REF ||
  process.env.GITHUB_REF_NAME ||
  git('branch', '--show-current') ||
  undefined;
const auth = token
  ? `Bearer ${token}`
  : user
    ? `Basic ${Buffer.from(`${user}:${pass ?? ''}`).toString('base64')}`
    : undefined;

const dirs = process.argv.length > 2 ? process.argv.slice(2) : ['services/pacts', 'web-ui/pacts'];
let failed = false;
for (const dir of dirs) {
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    files = [];
  }
  if (!files.length) {
    console.error(`No pacts in ${dir}; run 'make test' first`);
    process.exit(2);
  }
  for (const file of files) {
    const content = readFileSync(join(dir, file));
    const pact = JSON.parse(content.toString('utf8'));
    const res = await fetch(new URL('contracts/publish', base.replace(/\/?$/, '/')), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/hal+json',
        ...(auth && { authorization: auth }),
      },
      body: JSON.stringify({
        pacticipantName: pact.consumer.name,
        pacticipantVersionNumber: version,
        branch,
        contracts: [
          {
            consumerName: pact.consumer.name,
            providerName: pact.provider.name,
            specification: 'pact',
            contentType: 'application/json',
            content: content.toString('base64'),
          },
        ],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      failed = true;
      console.error(`${file}: broker responded ${res.status}`, JSON.stringify(body.errors ?? body));
      continue;
    }
    for (const log of body.logs ?? []) console.log(log.message);
  }
}
process.exit(failed ? 1 : 0);
