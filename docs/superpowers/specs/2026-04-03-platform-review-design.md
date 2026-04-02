# OGHUB.gg Platform Review — Risk-Tiered Improvement Roadmap

**Date:** 2026-04-03
**Scope:** Comprehensive review of the OGHUB.gg skill-based gaming platform
**Approach:** Risk-Tiered Audit — findings ordered strictly by severity
**Goal:** Prioritized improvement backlog for ongoing development

---

## Finding Format

Each finding includes:
- **Severity:** CRITICAL | HIGH | MEDIUM | LOW
- **Domain:** Security | Architecture | Game Mechanics | Database | Data Integrity | Business Logic | Performance | UX | Testing | Code Quality | Compliance
- **Files:** Affected file paths
- **Issue:** What's wrong
- **Impact:** What happens if unfixed
- **Fix:** Concrete recommendation

---

## CRITICAL

### 1. Wallet deposit accepts arbitrary amounts with no payment verification
- **Domain:** Security
- **Files:** `apps/api/src/wallet/wallet.router.ts:39-87`
- **Issue:** The `/deposit` endpoint takes an `amount` from the request body and directly credits the wallet. There is no payment gateway, no Stripe/PayPal integration, no verification that money was actually received. Any authenticated user can credit themselves unlimited funds.
- **Impact:** Complete financial exploitation. Users mint free money and drain prize pools.
- **Fix:** Remove the direct deposit endpoint. Integrate a payment processor (Stripe, PayPal). Only credit wallets via webhook confirmation from the payment provider. Add idempotency keys to prevent double-crediting.

### 2. JWT secret falls back to hardcoded `'dev-secret'`
- **Domain:** Security
- **Files:** `apps/api/src/common/auth.ts:15`
- **Issue:** `const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'` — if `JWT_SECRET` env var is missing or empty, all tokens are signed with a known string. Any attacker can forge valid JWTs.
- **Impact:** Full account takeover for any user. Attackers can impersonate admins.
- **Fix:** Fail hard at startup if `JWT_SECRET` is not set. Add startup validation for all required env vars.

### 3. CORS allows all origins
- **Domain:** Security
- **Files:** `apps/api/src/main.ts:27`
- **Issue:** `cors({ origin: true, credentials: true })` accepts requests from any origin with credentials. This enables CSRF-like attacks where a malicious site can make authenticated API calls on behalf of a logged-in user.
- **Impact:** Cross-origin attackers can drain wallets, submit scores, or modify accounts for any user who visits a malicious page while logged in.
- **Fix:** Whitelist specific origins: `cors({ origin: ['https://oghub.gg', 'http://localhost:3000'], credentials: true })`.

### 4. Entry fee deduction and session creation are not atomic
- **Domain:** Data Integrity
- **Files:** `apps/api/src/sessions/sessions.router.ts:39-67, 76-90`
- **Issue:** The entry fee is deducted in one `$transaction`, then the session is created in a separate Prisma call outside that transaction. If session creation fails after fee deduction, the user loses their entry fee with no session.
- **Impact:** Users lose money to phantom charges. No automatic recovery.
- **Fix:** Wrap both the fee deduction AND session creation in a single `$transaction`.

### 5. SDK `extractSessionId` is broken — session routing will fail
- **Domain:** Game Mechanics
- **Files:** `packages/sdk/src/index.ts:228-239`
- **Issue:** `extractSessionId` tries to parse the JWT payload for a `sessionId` field, but the JWT created in `sessions.router.ts:70-74` doesn't contain a `sessionId` — it only has `userId`, `email`, and `role`. The method will always return `''`, making `initSession` call `POST /api/sessions//validate` (empty ID).
- **Impact:** The SDK cannot validate sessions. The entire game lifecycle is broken.
- **Fix:** Pass `sessionId` separately from the token (as the code comment on line 231 suggests), or include `sessionId` in the JWT payload.

---

## HIGH

### 6. Event drain worker is never started
- **Domain:** Architecture
- **Files:** `apps/api/src/events/event-pipeline.ts:149-218`, `apps/api/src/main.ts`
- **Issue:** `startEventDrainWorker()` is defined but never called anywhere. Events are enqueued into Redis Streams via `enqueueEvents()` but nothing ever drains them. The stream will fill to 1M entries and then backpressure will reject all new events.
- **Impact:** All gameplay events are silently lost. Anti-cheat has no event data to analyze. Replays have incomplete data.
- **Fix:** Call `startEventDrainWorker()` in `main.ts` after server starts, or run it as a separate worker process.

### 7. HMAC guards are defined but never wired into routes
- **Domain:** Security
- **Files:** `apps/api/src/common/hmac.ts`, `apps/api/src/common/sdk-integrity.ts`, all routers
- **Issue:** Both `hmacGuard` and `enhancedHmacGuard` exist but neither is applied to any route. The SDK signs every request with HMAC, but the server never verifies those signatures. Any HTTP client can forge SDK requests without knowing the app secret.
- **Impact:** The entire SDK security model is theater. Attackers can submit arbitrary scores, events, and replay data without the SDK.
- **Fix:** Apply `enhancedHmacGuard` as middleware on session and event endpoints that the SDK calls.

### 8. No tests exist anywhere in the project
- **Domain:** Testing
- **Files:** Entire project
- **Issue:** Zero test files across all packages. No unit tests, integration tests, or end-to-end tests. No test runner configured.
- **Impact:** Every change risks breaking existing functionality undetected. Anti-cheat logic, wallet math, and session state machines are completely unverified.
- **Fix:** Start with critical-path tests: wallet transactions (balance math, race conditions), fraud engine (each detection layer), session state machine transitions. Use Vitest for the API, Jest or Playwright for the frontend.

### 9. Fake social proof and manufactured urgency throughout the UI
- **Domain:** UX / Compliance
- **Files:** `apps/web/src/components/LiveWinnersTicker.tsx:5-18`, `apps/web/src/components/UrgencyBanner.tsx:27-29`, `apps/web/src/app/page.tsx:103-107,158-161`
- **Issue:** Multiple deceptive UI elements:
  - `LiveWinnersTicker` displays hardcoded fake winners (`FAKE_WINNERS` array) — no real data
  - "847 playing now" is a static hardcoded number
  - "2x BONUS ACTIVE" is a static label with no backing logic
  - `UrgencyBanner` randomly decreases "spots left" on a timer (line 27-29: `Math.random() > 0.7`) — pure fabrication
  - "$5,000 prize pool filling fast!" is static text
- **Impact:** Deceptive practices. In regulated gambling jurisdictions, fake social proof and manufactured scarcity are specifically prohibited. Serious legal/compliance risk. Also damages trust if users discover the deception.
- **Fix:** Replace all fake data with real-time data from the API. Add WebSocket or polling for live player counts, actual recent winners, and real challenge capacity. Remove manufactured urgency entirely or tie it to actual challenge state.

### 10. No rate limiting on authentication endpoints
- **Domain:** Security
- **Files:** `apps/api/src/auth/auth.router.ts`
- **Issue:** Login and register endpoints have no rate limiting. An attacker can brute-force passwords or spam account creation without any throttling.
- **Impact:** Credential stuffing attacks, password brute-forcing, mass fake account creation.
- **Fix:** Add rate limiting middleware (e.g., `express-rate-limit`) on `/api/auth/login` (e.g., 5 attempts per minute per IP) and `/api/auth/register` (e.g., 3 per hour per IP).

### 11. No password complexity validation
- **Domain:** Security
- **Files:** `apps/api/src/auth/auth.router.ts:16-17`
- **Issue:** Registration accepts any password — a single character is valid. No minimum length, no complexity requirements.
- **Impact:** Users create weak passwords that are trivially brute-forced.
- **Fix:** Enforce minimum 8 characters. Consider requiring mixed case + number. Validate server-side (don't rely on client).

### 12. No email verification flow
- **Domain:** Security
- **Files:** `apps/api/src/auth/auth.router.ts`
- **Issue:** Accounts are immediately active after registration with no email verification. Users can register with any email, including others' emails.
- **Impact:** Fake accounts, impersonation, no way to contact users for password reset or compliance notifications.
- **Fix:** Add email verification with a token-based confirmation flow. Don't allow wallet operations until email is confirmed.

### 13. Wallet transactions don't use serializable isolation
- **Domain:** Data Integrity
- **Files:** `apps/api/src/wallet/wallet.router.ts:48-74`, `apps/api/src/sessions/sessions.router.ts:40-66`
- **Issue:** Prisma `$transaction` uses the default `ReadCommitted` isolation level. The failure-scenarios doc (DATA-001) claims "serializable isolation" is used, but it isn't. Concurrent requests can read the same balance and both succeed, causing double-spend.
- **Impact:** Under concurrent load, users can spend more than their balance — negative balances, platform financial loss.
- **Fix:** Add `{ isolationLevel: 'Serializable' }` to `$transaction` calls on wallet operations, or use Postgres advisory locks, or add a `CHECK (balance >= 0)` constraint at the database level.

### 14. Ghost/replay endpoints require no authentication
- **Domain:** Security
- **Files:** `apps/api/src/ghosts/ghosts.router.ts`
- **Issue:** Both ghost endpoints (`/:challengeId/top` and `/:sessionId`) are publicly accessible. Anyone can download full replay data including input timelines for any session.
- **Impact:** Competitors can study exact inputs of top players. In a skill-based money platform, this is a competitive integrity issue — someone could reverse-engineer winning strategies from replay data.
- **Fix:** Add `authGuard` and consider restricting replay access to participants of the same challenge, or only expose ghost data through the session validation flow (which already does this).

### 15. Dead `validateScore` function — logic duplication
- **Domain:** Code Quality
- **Files:** `apps/api/src/sessions/sessions.router.ts:354-385`
- **Issue:** `validateScore()` is defined at the bottom of the file but never called. The actual validation uses `validateSession()` from the fraud engine. This creates confusion about which validation rules are actually enforced.
- **Impact:** Developers may modify `validateScore` thinking it's active. The dead code creates false confidence.
- **Fix:** Delete `validateScore` entirely. All validation should go through the fraud engine.

---

## MEDIUM

### 16. No input validation or sanitization on request bodies
- **Domain:** Security
- **Files:** All router files
- **Issue:** No validation library (Zod, Joi, etc.) is used. Request bodies are destructured directly. Fields like `amount` in wallet deposit are passed to `new Decimal()` without type checking — non-numeric strings will throw unhandled Prisma errors. Event payloads accept arbitrary JSON with no size or structure limits.
- **Impact:** Unexpected crashes, potential for injection via JSON payloads stored in the database, verbose error messages leaking internals.
- **Fix:** Add Zod schemas for all request bodies. Validate and sanitize at the router level before processing.

### 17. No startup validation for required environment variables
- **Domain:** Architecture
- **Files:** `apps/api/src/main.ts`, `.env.example`
- **Issue:** The app starts silently even if critical env vars (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`) are missing. Failures only surface when those features are first used.
- **Impact:** Confusing runtime errors, silent fallback to insecure defaults (see finding #2).
- **Fix:** Add a startup check that validates all required env vars and fails fast with clear messages.

### 18. No database-level CHECK constraint on wallet balance
- **Domain:** Database
- **Files:** `packages/db/prisma/schema.prisma:44`
- **Issue:** The failure scenarios doc claims a `CHECK (balance >= 0)` constraint exists, but the Prisma schema has no such constraint. Prisma doesn't support CHECK constraints natively.
- **Impact:** Application-level bugs can create negative balances with no database safety net.
- **Fix:** Add a raw SQL migration: `ALTER TABLE "Wallet" ADD CONSTRAINT balance_non_negative CHECK (balance >= 0);`

### 19. No withdrawal mechanism
- **Domain:** Business Logic
- **Files:** `apps/api/src/wallet/wallet.router.ts`
- **Issue:** The `TransactionType` enum includes `WITHDRAWAL` but no withdrawal endpoint exists. Users can deposit money and win prizes but have no way to cash out.
- **Impact:** Platform is a dead end for users. Regulatory compliance requires withdrawal capability for real-money gaming.
- **Fix:** Implement a withdrawal flow with identity verification (KYC), cooling-off periods, and integration with payment processors for payouts.

### 20. Prize pool and payout logic is completely missing
- **Domain:** Business Logic
- **Files:** `packages/db/prisma/schema.prisma:139-141`, all routers
- **Issue:** Challenges have `entryFee`, `prizePool`, and `platformFee` fields, but there's no code that: (a) accumulates entry fees into the prize pool, (b) determines challenge winners, (c) distributes prizes, or (d) takes the platform fee. The `prizePool` field is never updated after challenge creation.
- **Impact:** The core monetization loop doesn't function. Entry fees are collected but prizes are never paid out.
- **Fix:** Implement challenge lifecycle: accumulate fees into prize pool on entry, determine winners when challenge ends (time-based or entry-based), distribute prizes proportionally, deduct platform fee.

### 21. No challenge lifecycle management
- **Domain:** Business Logic
- **Files:** `packages/db/prisma/schema.prisma:126-155`
- **Issue:** Challenges have `startsAt`, `endsAt`, and `status` fields but no background job transitions challenges between states. No code moves UPCOMING -> ACTIVE -> COMPLETED. No code enforces `maxEntries`.
- **Impact:** Challenges stay in whatever state they're created in forever. No automatic completion, no winner determination.
- **Fix:** Add a scheduled job (cron or Redis-based) that transitions challenge states and triggers prize distribution on completion.

### 22. Leaderboard Redis/DB inconsistency risk
- **Domain:** Data Integrity
- **Files:** `apps/api/src/sessions/sessions.router.ts:307-318`, `apps/api/src/leaderboards/leaderboard.router.ts`
- **Issue:** Score is written to Postgres first (in the transaction), then to Redis `zadd` after the transaction. If the Redis write fails, the leaderboard is stale. But the bigger issue: `zadd` uses the raw score, which means if a user submits multiple times, only their latest score is kept in Redis (not their best). The DB may show a different score than Redis.
- **Impact:** Leaderboard shows wrong rankings. Users may lose their best score in Redis.
- **Fix:** Use `zadd` with `GT` flag (only update if new score is greater). Add a periodic reconciliation job that rebuilds Redis from DB.

### 23. No Dockerfile or deployment configuration
- **Domain:** Architecture
- **Files:** Project root
- **Issue:** No Dockerfiles for API or web, no Kubernetes manifests, no CI/CD pipeline. The only deployment info is `howtorun.txt` for local development.
- **Impact:** No reproducible deployments. No automated testing pipeline. Manual deployment is error-prone.
- **Fix:** Add Dockerfiles for API and web, a production docker-compose or K8s manifests, and a CI/CD pipeline (GitHub Actions) with build -> test -> deploy stages.

### 24. PrismaClient and Redis are global singletons with no shutdown handling
- **Domain:** Architecture
- **Files:** `apps/api/src/main.ts:19-20`
- **Issue:** `prisma` and `redis` are created as module-level globals. No graceful shutdown handlers exist — on SIGTERM/SIGINT, active DB connections and Redis subscriptions are abandoned.
- **Impact:** Connection leaks, data corruption from interrupted transactions, orphaned Redis consumer group members.
- **Fix:** Add `process.on('SIGTERM', ...)` and `process.on('SIGINT', ...)` handlers that call `prisma.$disconnect()` and `redis.quit()`.

### 25. No request logging or audit trail
- **Domain:** Security / Architecture
- **Files:** `apps/api/src/main.ts`
- **Issue:** No request logging middleware (morgan, pino-http, etc.). No audit trail for sensitive operations (deposits, withdrawals, score submissions, admin actions).
- **Impact:** Cannot investigate incidents, debug production issues, or satisfy regulatory audit requirements.
- **Fix:** Add structured logging middleware. Log all financial transactions and auth events to a persistent store.

### 26. CSS is a single monolithic file
- **Domain:** UX / Code Quality
- **Files:** `apps/web/src/styles/globals.css` (15k+ tokens)
- **Issue:** All styles are in one massive CSS file. No component-level styling, no CSS modules, no Tailwind. Hard to maintain and reason about specificity conflicts.
- **Impact:** Developer velocity decreases as the app grows. Style changes have unpredictable side effects.
- **Fix:** Migrate to CSS Modules, Tailwind, or styled-components. Co-locate styles with components.

### 27. Homepage falls back to hardcoded demo games
- **Domain:** UX
- **Files:** `apps/web/src/app/page.tsx:22-71, 77-83`
- **Issue:** If the API call fails (line 82: `.catch(() => {})`), the page silently shows 8 hardcoded demo games with fake data. Users see games that don't exist and can't be played.
- **Impact:** Confusing UX. Users click "Play Now" on games that don't exist. Error is silently swallowed.
- **Fix:** Show a proper error/empty state when the API fails. Remove demo games or clearly label them as placeholders during development.

### 28. No error boundaries in React
- **Domain:** UX
- **Files:** `apps/web/src/app/layout.tsx`
- **Issue:** No React error boundaries. An uncaught error in any component crashes the entire app with a white screen.
- **Impact:** Single component failure takes down the whole UI.
- **Fix:** Add error boundaries around major sections (game feed, wallet, profile) with fallback UI.

### 29. `useWallet` hook fetches on every mount with no caching
- **Domain:** Performance
- **Files:** `apps/web/src/hooks/useWallet.ts`
- **Issue:** Every component using `useWallet()` triggers a fresh API call on mount. Multiple components on one page = multiple redundant requests.
- **Impact:** Unnecessary API load, flickering balance displays.
- **Fix:** Move wallet state into the AuthContext (or use React Query / SWR for request deduplication and caching).

### 30. Near-miss calculation has off-by-one rank display
- **Domain:** Game Mechanics
- **Files:** `apps/api/src/sessions/sessions.router.ts:387-427`
- **Issue:** `calculateNearMiss` returns `targetRank: rank` (line 414) where `rank` is the 0-based `zrevrank`. The message says "you were X% away from rank {rank}" — but `rank` here is the user's own 0-based rank, not the target rank above them. The value should be 1-based.
- **Impact:** Near-miss messages show incorrect rank numbers.
- **Fix:** Change to `targetRank: rank + 1` for 1-based display. The message should read "rank {rank}" (the position the user almost reached), not their own rank. Also guard against `rank === 0` (user is already #1).

### 31. Health check doesn't verify database or Redis connectivity
- **Domain:** Architecture
- **Files:** `apps/api/src/main.ts:32-34`
- **Issue:** The health endpoint returns `{ status: 'ok' }` unconditionally. It doesn't ping Postgres or Redis.
- **Impact:** Load balancers and monitoring see the service as healthy even when it can't reach its dependencies.
- **Fix:** Add `prisma.$queryRaw('SELECT 1')` and `redis.ping()` checks with a timeout.

---

## LOW

### 32. No TypeScript strict mode
- **Domain:** Code Quality
- **Files:** `apps/api/tsconfig.json`, `apps/web/tsconfig.json`
- **Issue:** TypeScript strict mode (`strict: true`) is likely not enabled. Heavy use of `any` types throughout the codebase (e.g., fraud engine, session router, event pipeline).
- **Impact:** Type-safety gaps. Bugs that TypeScript could catch at compile time slip through.
- **Fix:** Enable `strict: true` incrementally. Replace `any` with proper types, starting with financial and security-critical code.

### 33. No API documentation
- **Domain:** Code Quality
- **Files:** Entire API
- **Issue:** No OpenAPI/Swagger spec. No API documentation for game developers integrating the SDK.
- **Impact:** SDK integrators must read source code to understand the API. Increases onboarding friction for third-party developers.
- **Fix:** Add OpenAPI spec generation (e.g., `tsoa` or manual Swagger). Publish API docs.

### 34. No git repository initialized
- **Domain:** Architecture
- **Files:** Project root
- **Issue:** The project directory is not a git repository.
- **Impact:** No version history, no branching, no collaboration workflow.
- **Fix:** `git init`, add a proper `.gitignore` (the current one is minimal at 52 bytes), make initial commit.

### 35. `.env` file present in project root with real credentials
- **Domain:** Security
- **Files:** `.env` (370 bytes), `.gitignore` (52 bytes)
- **Issue:** A `.env` file exists with actual credentials. The `.gitignore` is only 52 bytes — it likely doesn't exclude `.env` properly.
- **Impact:** Credentials could be committed to version control.
- **Fix:** Verify `.gitignore` includes `.env`. If already committed, rotate all secrets.

### 36. Unity bridge has mock/placeholder implementations
- **Domain:** Game Mechanics
- **Files:** `games/NeonRunner/Assets/Scripts/SDK/OGHubBridge.cs:98-135`
- **Issue:** `StartSession()`, `EndSession()`, and `RequestGhostData()` are stubs with `Task.Delay` instead of real HTTP calls. `ReportEvent` only logs to console.
- **Impact:** The Unity game cannot actually communicate with the backend.
- **Fix:** Implement real HTTP calls using `UnityWebRequest` that match the API contract and SDK signing protocol.

### 37. No seed data or database seeding script
- **Domain:** Code Quality
- **Files:** `package.json:14` (references `prisma/seed.ts` but file doesn't exist)
- **Issue:** `db:seed` script references `prisma/seed.ts` but the file doesn't exist in the packages/db directory.
- **Impact:** Fresh database has no games, challenges, or test data. Onboarding new developers is manual.
- **Fix:** Create the seed script with sample games, challenges, and test users.

### 38. DoubleOrNothing component has no backend logic
- **Domain:** Game Mechanics
- **Files:** `apps/web/src/components/DoubleOrNothing.tsx`
- **Issue:** The "Double or Nothing" feature is a pure frontend component. There's no server-side logic for the coin flip, no odds calculation, no transaction recording. The `onDouble` callback is handled entirely by the parent.
- **Impact:** If implemented client-side, the outcome can be manipulated. If not implemented at all, it's dead code.
- **Fix:** Implement server-side double-or-nothing with provably fair RNG (commit-reveal scheme). Record as wallet transactions.

---

## New Feature Suggestions

### P0 — Must Have Before Launch

#### F1. Payment Gateway Integration
Integrate Stripe or similar for deposits and withdrawals. Without this, the wallet is meaningless. Implement webhook handlers for payment confirmation, idempotency, and refund flows.

#### F2. Regulatory Compliance Framework
Determine target jurisdictions. Skill-based gaming platforms face different regulations than pure gambling, but still require: age verification (KYC), responsible gaming tools (deposit limits, self-exclusion), tax reporting for prizes above thresholds, and terms of service compliant with local laws. Engage a compliance attorney before launch.

#### F3. Admin Dashboard
Build an admin panel for: reviewing fraud-flagged sessions, managing challenges, viewing financial reports, banning users, and auditing wallet transactions. The fraud engine generates a review queue but there's no UI to process it.

### P1 — High Value

#### F4. Analytics Integration
Track key metrics: DAU/MAU, session length, games per user per day, entry-to-completion rate, challenge conversion rate, ARPU, LTV, churn rate. Integrate a product analytics tool (Mixpanel, Amplitude, or PostHog). Add server-side event tracking on: registration, first deposit, first game, first challenge entry, prize payout.

#### F5. A/B Testing Infrastructure
Add feature flags (LaunchDarkly, Unleash, or a simple Redis-backed system). Priority experiments: entry fee price points, challenge duration effects on engagement, near-miss message variants, onboarding flow variations.

#### F6. Real-Time Features via WebSocket
Replace polling with WebSocket (Socket.io or native WS) for: live leaderboard updates, real winner notifications (replacing the fake ticker), live player counts, wallet balance updates after prize payouts.

#### F7. AI Fraud Detection Improvements
The current fraud engine is rule-based. Add ML-based anomaly detection: cluster users by behavioral fingerprint similarity to detect multi-accounting, train a model on validated vs. rejected sessions, add device fingerprinting (browser/device hash), and IP geolocation correlation.

### P2 — Growth

#### F8. Monetization Optimization
Dynamic entry fees based on challenge popularity and time remaining. Implement a rake structure that adjusts based on prize pool size. Add "season pass" or subscription tier for reduced platform fees. Consider cosmetic rewards (avatars, badges) as non-monetary incentives.

#### F9. Player Psychology & Engagement Loops
The near-miss system is a good start. Add: daily login rewards, streak bonuses, skill-based matchmaking (so new players aren't immediately crushed), progression system with unlockable games/challenges, social features (friend lists, challenges against friends).

#### F10. Replay Verification (Server-Side Simulation)
The deterministic simulation in NeonRunner is designed for it. Implement a Node.js or WASM port of the simulation that can replay the `inputTimeline` with the same `seed` and verify the resulting score matches what was submitted. This is the ultimate anti-cheat — it's provably correct.

---

## Summary Statistics

| Severity | Count |
|----------|-------|
| CRITICAL | 5     |
| HIGH     | 10    |
| MEDIUM   | 16    |
| LOW      | 7     |
| **Total Findings** | **38** |
| Feature Suggestions | 10 |

### Domain Distribution

| Domain | Findings |
|--------|----------|
| Security | 11 |
| Architecture | 6 |
| Business Logic | 3 |
| Data Integrity | 4 |
| Game Mechanics | 4 |
| UX / Compliance | 4 |
| Code Quality | 3 |
| Testing | 1 |
| Performance | 1 |
| Database | 1 |
