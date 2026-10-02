# OGHUB.gg — Competitive Skill-Gaming Platform

OGHUB lets players join paid-entry rooms, play the same seeded game round, and win from a prize pool, while game developers plug their games in through an SDK. The hard part is not the game itself. It is running fair competition with real money: rooms must settle exactly once, scores must be verifiable, and cheaters must be caught.

## Architecture

```
 Unity / Web game ──► OGHUB SDK (HMAC-signed requests, nonce, replay capture)
                              │
                              ▼
 Next.js web app ◄──► Express API ──► PostgreSQL (Prisma)  wallets, rooms, sessions, scores
                     │    │    └────► Redis                 room state, timers, pub/sub, event streams
                     │    └── WebSockets                    room lobby + live session validation
                     └── Payment providers (Stripe, crypto)  deposits / payouts behind one interface
```

Turborepo monorepo:

| Path | What it is |
|---|---|
| `apps/api` | Express + TypeScript API: rooms, sessions, wallet, payments, leaderboards, anti-cheat |
| `apps/web` | Next.js player app: lobby, rooms, wallet, profile, leaderboards |
| `packages/db` | Prisma schema (users, wallets, transactions, rooms, sessions, replays, …) |
| `packages/sdk-core`, `packages/sdk` | TypeScript game SDK: session lifecycle, input recording, event reporting, integrity |
| `packages/sdk-unity` | C# SDK for Unity games |
| `games/NeonRunner` | Reference Unity game with a deterministic, replay-verifiable simulation |

## Engineering highlights

- **Room lifecycle as an explicit state machine.** `WAITING → FULL → READY_CHECK → COUNTDOWN → IN_PROGRESS → SETTLING → COMPLETED`. Invalid transitions are rejected; state and timers live in Redis and are recovered after a restart.
- **Idempotent, transactional settlement.** Prize distribution runs inside a single DB transaction guarded by a conditional status update, so a room can never pay out twice. Ties and all-invalid rounds are refunded.
- **Layered anti-cheat engine.** Universal checks (score range, duration, replay integrity), per-game rules loaded from a game definition, behavioral analysis (e.g. robotic input timing via coefficient of variation), statistical outliers (z-score, improvement rate) and Redis-backed rate limiting. Each layer contributes to a fraud score: ACCEPT / FLAG / REJECT / BAN.
- **Deterministic replays.** The reference game runs a fixed-point, tick-locked simulation with a seeded RNG, so the server can verify a submitted run from its input log and seed.
- **SDK request integrity.** HMAC request signing with timestamp tolerance, nonce tracking against replay attacks and SDK version enforcement.
- **Event ingestion pipeline.** SDK events go through Redis Streams with consumer groups, batched DB writes, a dead-letter queue and backpressure.
- **Pluggable payments.** Stripe and a crypto provider implement one `PaymentProvider` interface (checkout, webhook verification, payouts), with deposit/withdrawal limits.
- **Ops basics.** Dockerfiles for API and web, docker-compose for the full stack, Zod-validated input, structured logging (pino), Swagger docs, Vitest tests.

## Running locally

Requires Node.js 20+ and Docker.

```bash
cp .env.example .env
docker compose up -d postgres redis
npm install
npm run db:push          # apply Prisma schema
npm run dev              # API on :3001, web on :3000
```

Or run everything in containers: `docker compose up --build`.

Tests: `cd apps/api && npx vitest run`. The fraud-engine suites need the Postgres and Redis containers running.

## Tech stack

TypeScript · Node.js · Express · Next.js · PostgreSQL · Prisma · Redis · WebSockets · Stripe · Docker · Turborepo · Vitest · Unity (C#)
