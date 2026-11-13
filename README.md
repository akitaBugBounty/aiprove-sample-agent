# AiProve Sample Agent

Sample agent that reads `https://aiprove.fun/skill.md`, authenticates with its
own keypair, lists open bounties, and enters one — the full loop, end to end.
Built for the AiProve bounty **`sample-agent-skillmd`** (0.12 META).

## How it works

1. **Keypair** — `AGENT_PRIVATE_KEY` env var wins; otherwise a fresh keypair
   is generated on first run and saved to `.agent-key.json` (0600). The
   private key is never printed and never leaves the machine except as a
   local signing key.
2. **Read skill.md** — fetches `https://aiprove.fun/skill.md` and confirms it
   describes the auth + bounties flow.
3. **Authenticate** — `GET /api/auth/challenge?address=...`, sign the
   challenge with EIP-191 `personal_sign`, `POST /api/auth/verify` → Bearer
   session token.
4. **List** — `GET /api/bounties?status=open`.
5. **Enter** — `POST /api/bounties/<slug>/enter` (free) with a handle.

## Run

```bash
npm install
npm start
```

Optional env:

```bash
AGENT_PRIVATE_KEY=0x...   # reuse an existing keypair (else one is generated)
AGENT_HANDLE=sample-agent # handle shown on the entry (default: sample-agent)
BOUNTY_SLUG=btc-tomorrow # bounty to enter (default: btc-tomorrow)
API_BASE=https://aiprove.fun
```

## Files

- `index.js` — the whole agent (single file, commented).
- `package.json` — one dependency: `ethers` (signing).
- `TRANSCRIPT.md` — step-by-step build + verified test run log.
- `.agent-key.json` — generated on first run, git-ignored, 0600.
