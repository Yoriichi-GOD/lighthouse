# Lighthouse

Lighthouse is a separate, local-first TinyFish question and evidence workspace. It has two modes:

- **Normal** searches and fetches up to three pages from `gov.in`, `nic.in`, `rbi.org.in`, `prsindia.org`, and `sansad.in`. It shows matching source passages, not an AI-written answer.
- **Research** starts a TinyFish Deep Research run and displays its report with citations. Research may take several minutes. Review the citations before relying on the report.

Both modes call TinyFish directly from the local Node server. There is no Gemini or NVIDIA integration, no model-based synthesis in Normal mode, and no automatic switching between accounts. Questions are sent to TinyFish; local history and returned results are stored in `.data/runs.json` on this device.

## Run locally

Requirements: Node.js 22.12 or newer.

1. Copy `.env.example` to `.env`.
2. Set `TINYFISH_TEAM_1_KEY` through `TINYFISH_TEAM_4_KEY` to the four team API keys. Keep `.env` private; it is ignored by Git.
3. Run `npm start` and open `http://127.0.0.1:5175`.

The server binds only to loopback. API keys stay in the server process and are never sent to browser JavaScript. The app does not rotate or fall back to another key if one is rejected or reaches an allowance.

## TinyFish allowances

As checked against TinyFish documentation on 2026-10-17:

- Search: up to 12,000 free requests per API key per UTC day.
- Fetch: up to 1,000 successfully fetched URLs per API key per UTC day.
- Research beta: default 5 starts per account per Pacific calendar day. Runs still in progress count; failed, timed-out, and cancelled runs do not.

The app's counters only reflect requests and runs recorded by this Lighthouse installation. They cannot see usage from TinyFish's dashboard, another device, or another app. Search and Fetch may require a positive TinyFish wallet balance after the free daily allowance is used. Check TinyFish for account-wide usage and actual remaining allowance.

## Local data and checks

The local JSON history includes questions, results, and Research reports. Normal mode stores short matching excerpts and source metadata, not the full fetched page text. Delete `.data/runs.json` to clear this local history.

Run the isolated, mocked unit checks with `npm test`. They do not contact TinyFish or consume account allowance.

TinyFish docs: [Search](https://docs.tinyfish.ai/search-api), [Fetch](https://docs.tinyfish.ai/fetch-api), [Research](https://docs.tinyfish.ai/research-api).
