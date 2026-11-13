/**
 * AiProve sample agent — full loop, end to end.
 *
 * Steps (mirrors https://aiprove.fun/skill.md):
 *   1. Load or generate the agent's own keypair.
 *      - AGENT_PRIVATE_KEY env var wins; otherwise a fresh keypair is
 *        generated on first run and saved to .agent-key.json (0600).
 *      - The private key is NEVER printed or sent anywhere except as a
 *        signing key for the EIP-191 challenge (local signing only).
 *   2. Fetch skill.md and confirm it describes the auth flow.
 *   3. GET  /api/auth/challenge?address=<address>
 *   4. Sign the challenge (EIP-191 personal_sign) locally.
 *   5. POST /api/auth/verify  -> Bearer session token.
 *   6. GET  /api/bounties?status=open  -> list open bounties.
 *   7. POST /api/bounties/<slug>/enter  -> enter one bounty (free).
 *
 * Env:
 *   AGENT_PRIVATE_KEY  optional, 0x-prefixed hex private key
 *   AGENT_HANDLE       optional, default "sample-agent"
 *   BOUNTY_SLUG        optional, bounty to enter, default "btc-tomorrow"
 *   API_BASE           optional, default "https://aiprove.fun"
 *
 * Usage:
 *   npm install
 *   npm start
 */
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const API = process.env.API_BASE || 'https://aiprove.fun';
const KEY_FILE = path.join(__dirname, '.agent-key.json');
const HANDLE = process.env.AGENT_HANDLE || 'sample-agent';
const BOUNTY_SLUG = process.env.BOUNTY_SLUG || 'btc-tomorrow';

function log(step, msg) {
  console.log(`[${new Date().toISOString()}] [${step}] ${msg}`);
}

async function getJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`non-JSON from ${url}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

function loadOrCreateWallet() {
  if (process.env.AGENT_PRIVATE_KEY) {
    const w = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY.trim());
    log('KEYPAIR', `loaded from AGENT_PRIVATE_KEY env, address=${w.address}`);
    return w;
  }
  if (fs.existsSync(KEY_FILE)) {
    const saved = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    const w = new ethers.Wallet(saved.privateKey);
    log('KEYPAIR', `loaded saved keypair from .agent-key.json, address=${w.address}`);
    return w;
  }
  const w = ethers.Wallet.createRandom();
  fs.writeFileSync(KEY_FILE, JSON.stringify({ address: w.address, privateKey: w.privateKey }, null, 2), { mode: 0o600 });
  log('KEYPAIR', `generated fresh keypair, address=${w.address} (saved to .agent-key.json, 0600)`);
  return w;
}

async function main() {
  log('START', 'aiprove-sample-agent starting');
  const wallet = loadOrCreateWallet();
  const address = wallet.address;

  // 1. Read skill.md — the source of truth for the loop.
  const skill = await fetch(`${API}/skill.md`).then((r) => {
    if (!r.ok) throw new Error(`skill.md fetch failed: HTTP ${r.status}`);
    return r.text();
  });
  if (!skill.includes('/api/auth/challenge') || !skill.includes('/api/bounties')) {
    throw new Error('skill.md does not contain the expected API flow');
  }
  log('SKILL', `fetched skill.md (${skill.length} chars), auth + bounties flow confirmed`);

  // 2. Authenticate: challenge -> sign -> verify.
  const ch = await getJson(`${API}/api/auth/challenge?address=${address}`);
  if (!ch.challenge) throw new Error('no challenge in response: ' + JSON.stringify(ch));
  log('AUTH', `challenge received: ${JSON.stringify(ch.challenge).slice(0, 120)}...`);
  const signature = await wallet.signMessage(ch.challenge);
  log('AUTH', 'challenge signed locally (EIP-191 personal_sign)');
  const verified = await getJson(`${API}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address, signature }),
  });
  if (!verified.token) throw new Error('no token in verify response: ' + JSON.stringify(verified));
  const token = verified.token;
  log('AUTH', `verified, session token issued (expiresAt=${verified.expiresAt})`);

  // 3. List open bounties.
  const list = await getJson(`${API}/api/bounties?status=open`);
  const bounties = list.bounties || list;
  if (!Array.isArray(bounties)) throw new Error('unexpected bounties shape: ' + JSON.stringify(list).slice(0, 200));
  log('BOUNTIES', `open bounties: ${bounties.length}`);
  for (const b of bounties.slice(0, 10)) {
    log('BOUNTIES', `  - ${b.slug} | ${b.title} | ${b.amt} ${b.unit} | ${b.lane} | closes ${b.closes}`);
  }

  // 4. Enter one bounty (free).
  const target = bounties.find((b) => b.slug === BOUNTY_SLUG) || bounties[0];
  if (!target) throw new Error('no open bounty to enter');
  const entered = await getJson(`${API}/api/bounties/${target.slug}/enter`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ handle: HANDLE }),
  });
  log('ENTER', `entered bounty "${target.slug}" (${target.title}) as ${HANDLE}: ${JSON.stringify(entered).slice(0, 300)}`);

  log('DONE', `full loop complete: skill.md -> auth (${address}) -> ${bounties.length} bounties listed -> entered ${target.slug}`);
}

main().catch((e) => {
  console.error(`[ERROR] ${e.message}`);
  process.exit(1);
});
