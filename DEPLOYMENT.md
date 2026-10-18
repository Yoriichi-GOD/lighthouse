# Lighthouse on Railway

This is a controlled, shared hackathon demo, not a multi-user service. Everyone with the demo password can see the same history and use the configured team accounts. Run one replica only.

## Configuration

| Variable | Required value or purpose |
| --- | --- |
| `NODE_ENV` | `production`; binds `0.0.0.0` and enables the access gate. |
| `PORT` | Railway-provided listening port; do not copy the local `.env` port. |
| `RAILWAY_PUBLIC_DOMAIN` | Railway-provided generated public hostname. Used as the exact HTTPS origin. |
| `APP_ORIGIN` | Optional explicit HTTPS origin; overrides `RAILWAY_PUBLIC_DOMAIN` for a custom domain. No path, wildcard, query, or credentials. |
| `DEMO_ACCESS_PASSWORD` | Random shared demo password, at least 24 characters. Keep private. Changing it invalidates existing sessions. |
| `TINYFISH_TEAM_1_KEY` | Server-side team 1 TinyFish key. |
| `TINYFISH_TEAM_2_KEY` | Server-side team 2 TinyFish key. |
| `TINYFISH_TEAM_3_KEY` | Server-side team 3 TinyFish key. |
| `TINYFISH_TEAM_4_KEY` | Server-side team 4 TinyFish key. |
| `DATA_DIR` | `/data`, with a persistent Railway volume mounted at `/data`. Without a volume the JSON file is ephemeral. |

Only configure team keys that are intended for this demo. Keys are never returned through `/api/config`. There is no automatic account switching or key fallback. Deployment history starts separately from the local workstation; local usage counters do not represent account-wide provider usage.

## Deploy and redeploy

1. Connect the private `Yoriichi-GOD/lighthouse` repository through Railway's GitHub integration, branch `main`, root directory `/`.
2. Configure the variables above. Generate the Railway public domain and attach the `/data` volume. Keep one replica in one region; use existing trial credits only unless spending is separately approved.
3. In Railway service settings configure Railpack, build command `npm test`, start command `npm start`, healthcheck `/health`, and one replica. Node must be 22.12 or newer (specified in `package.json`). No Dockerfile is needed. The live Railway dashboard on 2026-10-18 says new services cannot opt into legacy Config as Code, so these settings are managed in the dashboard instead of `railway.json`.
4. Push an inspected and tested commit to `main`, or redeploy the selected commit from Railway. Confirm the deployment's GitHub SHA matches `git rev-parse HEAD`.
5. Confirm `/health` returns 200, anonymous `/api/history` returns 401, sign-in works, and the app assets load. Run the Normal-mode MGNREGS FY 2024–25 Budget Estimate query and inspect the official-source excerpt for ₹86,000 crore. Do not start Research solely for a smoke test without explicit approval.
6. After a volume-backed redeploy, verify a previously saved history ID and result remain present. A volume attachment alone is not evidence of tested persistence. Expect brief downtime during volume-backed deployments.

## Access and limits

Production requires a password and exact public HTTPS origin at startup. `/health`, `/login`, and `/login.css` are public; all application assets and API/history/report routes require a signed session. Sessions expire after eight hours and use Secure, HttpOnly, SameSite=Strict cookies. Mutation requests require the exact Origin. Railway's `healthcheck.railway.app` Host is allowed only on GET `/health`, never on the API. Arbitrary forwarded Host/IP headers are not trusted.

Shared process-wide limits: 20 sign-in attempts/minute, 120 authenticated API requests/minute, and six new questions/minute. These are fixed one-minute windows, reset on restart, and are intended for a small controlled demo. Existing per-account Research daily limits and in-process concurrency controls remain active. Authenticated users share the quota; this is not identity-based authorization. A burst of failed login attempts can temporarily block everyone for up to one minute. Keep the demo password private.

JSON writes retain the temporary-file + rename behavior. Startup checks the data directory is writable. Do not attach multiple application instances to this file. Existing history remains unencrypted on the Railway volume; only the authenticated API exposes it. Back up before deleting a volume. Never put `.env`, `.env.demo`, keys, or `.data/` into Git.

## Verification boundaries

`npm test` includes the six original tests plus production configuration/session/rate-limit checks and HTTP integration tests using a mocked TinyFish transport. These cover Normal, Research start/poll/cancel, duplicate-run rejection, forbidden origins/hosts, anonymous access, oversized bodies, static files, and history after application restart. They consume no TinyFish credits. A mocked Research lifecycle proves routing and handling, not live provider availability.

Official Railway references: [healthchecks](https://docs.railway.com/deployments/healthchecks), [configuration as code](https://docs.railway.com/config-as-code/reference).
