/**
 * OGHUB Platform — Failure Scenarios & Resilience Patterns
 * 
 * This module documents known failure modes, their detection,
 * and the automated handling strategies implemented.
 */

// ─── Failure Scenario Registry ──────────────────────────────

export interface FailureScenario {
  id: string;
  category: 'INFRASTRUCTURE' | 'SECURITY' | 'DATA' | 'BUSINESS_LOGIC' | 'SDK';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  scenario: string;
  impact: string;
  detection: string;
  handling: string;
  recovery: string;
}

export const FAILURE_SCENARIOS: FailureScenario[] = [

  // ═══════════════════════════════════════════════════════════
  // INFRASTRUCTURE FAILURES
  // ═══════════════════════════════════════════════════════════

  {
    id: 'INFRA-001',
    category: 'INFRASTRUCTURE',
    severity: 'CRITICAL',
    scenario: 'PostgreSQL database goes down mid-transaction',
    impact: 'Active sessions cannot save scores. Wallet transactions may be in inconsistent state. New user registrations fail.',
    detection: 'Prisma connection errors, health check failures, circuit breaker trips on DB writes.',
    handling: `
      1. Circuit breaker opens after ${10} consecutive DB failures (event-pipeline.ts)
      2. Event ingestion continues into Redis Streams (buffered up to 1M events)
      3. Session creation returns 503 with retry-after header
      4. Wallet operations fail-fast with clear error (no partial commits due to $transaction)
      5. Frontend shows "maintenance mode" banner via health endpoint
    `,
    recovery: `
      1. Circuit breaker auto-resets after 30s in HALF_OPEN state
      2. Event pipeline drain worker resumes processing buffered events
      3. Pending messages recovered via xpending/xclaim mechanism
      4. No data loss — events survive in Redis Streams
      5. Score submissions during outage are retried client-side (SDK retry logic)
    `,
  },

  {
    id: 'INFRA-002',
    category: 'INFRASTRUCTURE',
    severity: 'HIGH',
    scenario: 'Redis becomes unavailable',
    impact: 'Leaderboards stale. Event pipeline blocked. Nonce tracking disabled (replay attacks possible). Rate limiting disabled.',
    detection: 'Redis connection refused errors, ECONNREFUSED on port 6379.',
    handling: `
      1. Leaderboard reads fall back to PostgreSQL (slower but functional)
      2. Event ingestion falls back to synchronous DB writes (reduced throughput)
      3. HMAC guard skips nonce check but logs warning (temporary replay window)
      4. Rate limiting disabled — rely on application-level request throttling
      5. Near-miss calculations return null (non-critical feature)
    `,
    recovery: `
      1. Redis reconnection is automatic (ioredis built-in retry)
      2. Leaderboard data rebuilt from DB scores on reconnect
      3. Nonce tracking resumes (5-min expiry means old nonces auto-cleared)
      4. Event pipeline consumer group re-created if necessary
    `,
  },

  {
    id: 'INFRA-003',
    category: 'INFRASTRUCTURE',
    severity: 'MEDIUM',
    scenario: 'Event pipeline backpressure — stream at 90%+ capacity',
    impact: 'New event ingestion rejected with 503. Games still playable but events lost if SDK doesn\'t retry.',
    detection: 'getBackpressure() returns accept: false. Monitoring shows streamLength near MAX_STREAM_LENGTH.',
    handling: `
      1. API returns 503 with retryAfterMs: 1000
      2. SDK re-buffers rejected events and retries on next flush cycle
      3. Monitoring alert fires for ops team
      4. If sustained, scale up drain workers (add more consumer group members)
    `,
    recovery: `
      1. Adding workers: startEventDrainWorker('worker-N') in new processes
      2. Increase BATCH_SIZE for higher throughput (trade latency for throughput)
      3. Consider partitioning: shard stream by gameId for parallel processing
      4. Post-recovery: replay DLQ messages for any permanently failed events
    `,
  },

  {
    id: 'INFRA-004',
    category: 'INFRASTRUCTURE',
    severity: 'MEDIUM',
    scenario: 'Event drain worker crashes mid-batch',
    impact: 'Batch of events read but not acknowledged. Events stuck in "pending" state.',
    detection: 'xpending shows messages with high idle time (>60s) and delivery count >1.',
    handling: `
      1. recoverPendingMessages() runs every 60s on each worker
      2. Messages idle >60s are claimed by the recovery worker (xclaim)
      3. Messages with deliveryCount > 3 are moved to dead letter queue (DLQ)
      4. DLQ is preserved for manual investigation
    `,
    recovery: `
      1. Healthy workers auto-claim orphaned messages
      2. DLQ messages can be inspected via getIngestionMetrics()
      3. Manual replay: read DLQ entries and re-enqueue into the stream
      4. Monitor DLQ size — growing DLQ indicates systemic issue
    `,
  },

  // ═══════════════════════════════════════════════════════════
  // SECURITY / FRAUD FAILURES
  // ═══════════════════════════════════════════════════════════

  {
    id: 'SEC-001',
    category: 'SECURITY',
    severity: 'CRITICAL',
    scenario: 'SDK HMAC secret leaked — attacker can forge SDK requests',
    impact: 'Attacker can submit fake scores, create fraudulent sessions, drain prize pools.',
    detection: `
      - Sudden spike in sessions from unknown IPs
      - Fraud engine detects ROBOTIC_TIMING patterns
      - Multiple sessions with implausible scores from same API key
      - Nonce collision rate increases (attacker may reuse nonces)
    `,
    handling: `
      1. Immediate: deactivate compromised DeveloperApp (isActive = false)
      2. All pending sessions from that API key are invalidated
      3. Fraud review queue flagged for all recent submissions
      4. Rate limiting already caps burst damage (50 req/s per key)
      5. Nonce tracking prevents exact replay of captured requests
    `,
    recovery: `
      1. Rotate API key + secret for affected developer
      2. Audit all scores submitted during compromise window
      3. Reverse fraudulent wallet transactions
      4. Re-validate leaderboard positions
      5. Consider IP allowlisting for high-value developer apps
    `,
  },

  {
    id: 'SEC-002',
    category: 'SECURITY',
    severity: 'HIGH',
    scenario: 'Memory manipulation — player modifies game memory to inflate score',
    impact: 'Fake high scores on leaderboard, unfair prize distribution.',
    detection: `
      - SCORE_STATISTICAL_OUTLIER: z-score > 4σ from mean
      - IMPOSSIBLE_IMPROVEMENT: score 3x+ previous best
      - EMPTY_REPLAY: high score with no input data
      - MONOTONIC_SCORES: perfectly increasing score events
      - Replay simulation mismatch (if deterministic validation enabled)
    `,
    handling: `
      1. Fraud engine auto-rejects scores with fraudScore ≥ 80
      2. Scores 50-79 flagged for manual review (review queue)
      3. Session marked as REJECTED, score not added to leaderboard
      4. No prize payout for rejected scores
      5. Cumulative fraud scoring — repeated attempts trigger BAN
    `,
    recovery: `
      1. Flagged users investigated by admin panel
      2. If confirmed: account banned, all scores invalidated
      3. Leaderboard recalculated excluding banned user's scores
      4. Prize pool redistributed to legitimate players
    `,
  },

  {
    id: 'SEC-003',
    category: 'SECURITY',
    severity: 'HIGH',
    scenario: 'Bot/autoclicker submitting automated gameplay',
    impact: 'Unfair advantage, leaderboard manipulation, prize pool exploitation.',
    detection: `
      - ROBOTIC_TIMING: coefficient of variation < 0.05 (humans are ~0.3+)
      - SUPERHUMAN_REACTIONS: >10% of inputs under 80ms
      - EXCESSIVE_INPUT_RATE: sustained >25 inputs/second
      - INPUT_BURST: >40 inputs in any 1-second window
      - RATE_LIMIT_HOURLY: >30 sessions per hour (grinding)
    `,
    handling: `
      1. Real-time detection during session end validation
      2. ROBOTIC_TIMING is CRITICAL severity (50 fraud points = auto-flag)
      3. Combined with any other flag = auto-reject
      4. Cumulative scoring ensures persistent bots reach BAN threshold
      5. Session metadata logged for pattern analysis
    `,
    recovery: `
      1. Ban confirmed bot accounts
      2. Investigate IP/device clusters for multi-account bots
      3. Adjust CV threshold if false positives occur
      4. Add CAPTCHA/proof-of-work challenge for suspicious accounts
    `,
  },

  {
    id: 'SEC-004',
    category: 'SECURITY',
    severity: 'MEDIUM',
    scenario: 'Replay attack — attacker resends a captured SDK request',
    impact: 'Could duplicate event submissions or create phantom sessions.',
    detection: 'Nonce collision detected in Redis (nonce already exists with TTL).',
    handling: `
      1. enhancedHmacGuard rejects with "Duplicate request nonce — replay rejected"
      2. Each nonce stored in Redis with 5-minute TTL
      3. Even if timestamp is valid, duplicate nonce = rejection
      4. Logged for security monitoring
    `,
    recovery: `
      1. No recovery needed — attack is blocked at gateway
      2. If attacker generates new nonces, they need the HMAC secret (see SEC-001)
      3. Monitor for high nonce-collision rates as indicator of active attack
    `,
  },

  {
    id: 'SEC-005',
    category: 'SECURITY',
    severity: 'HIGH',
    scenario: 'Multi-account fraud — one person creates multiple accounts to manipulate challenges',
    impact: 'Inflate challenge participation, self-compete to guarantee prize winnings.',
    detection: `
      - Same device fingerprint across multiple accounts
      - Identical IP addresses with correlated session times
      - Similar gameplay patterns (behavioral fingerprint match)
      - Wallet deposit patterns (same payment method)
    `,
    handling: `
      1. Device fingerprint correlation (tracked via attestation)
      2. IP clustering analysis (background job, not real-time)
      3. Behavioral similarity scoring across accounts
      4. Flag related accounts for admin review
    `,
    recovery: `
      1. Link suspected accounts for investigation
      2. If confirmed: ban all linked accounts
      3. Void all challenge results involving linked accounts
      4. Redistribute prizes
    `,
  },

  // ═══════════════════════════════════════════════════════════
  // DATA INTEGRITY FAILURES
  // ═══════════════════════════════════════════════════════════

  {
    id: 'DATA-001',
    category: 'DATA',
    severity: 'CRITICAL',
    scenario: 'Wallet balance goes negative (race condition in concurrent transactions)',
    impact: 'Platform loses money, negative balance allows free play.',
    detection: 'Wallet balance < 0 in database, or entry fee deduction succeeds when it shouldn\'t.',
    handling: `
      1. All wallet operations use Prisma $transaction with serializable isolation
      2. Balance check + deduction is atomic (no TOCTOU race)
      3. Database-level CHECK constraint: balance >= 0
      4. Entry fee deducted BEFORE session creation (fail-fast)
      5. If transaction fails, session is not created
    `,
    recovery: `
      1. Identify negative-balance wallets via scheduled audit query
      2. Lock affected accounts
      3. Trace transaction history to find the race condition entry
      4. Correct balance and investigate code path
    `,
  },

  {
    id: 'DATA-002',
    category: 'DATA',
    severity: 'HIGH',
    scenario: 'Leaderboard diverges from database (Redis and Postgres disagree)',
    impact: 'Wrong rankings displayed, incorrect prize distribution.',
    detection: 'Periodic reconciliation job compares Redis ZRANGEBYSCORE with DB query.',
    handling: `
      1. Database is always the source of truth
      2. Redis leaderboard is a cache that CAN be rebuilt
      3. On score submission: write to DB first, then Redis (in that order)
      4. If Redis write fails: score is safe in DB, leaderboard updates on next rebuild
    `,
    recovery: `
      1. Run leaderboard rebuild job: query DB scores, repopulate Redis sorted set
      2. Schedule periodic reconciliation (e.g., every hour)
      3. Add monitoring for divergence detection
    `,
  },

  {
    id: 'DATA-003',
    category: 'DATA',
    severity: 'MEDIUM',
    scenario: 'Session expires after gameplay but before score submission',
    impact: 'Player plays a game but score is rejected. Player loses entry fee with no result.',
    detection: 'Session status is EXPIRED when endSession is called.',
    handling: `
      1. Sessions have 30-min expiry (generous for most skill games)
      2. SDK sends score immediately on game end (no lazy submission)
      3. Grace period: allow submission up to 5 min after expiry
      4. If truly expired: refund entry fee automatically
    `,
    recovery: `
      1. Check EventLog for proof of gameplay during valid window
      2. If events exist in valid window, accept the score (manual override)
      3. Auto-refund if no valid gameplay occurred
    `,
  },

  // ═══════════════════════════════════════════════════════════
  // SDK FAILURES
  // ═══════════════════════════════════════════════════════════

  {
    id: 'SDK-001',
    category: 'SDK',
    severity: 'MEDIUM',
    scenario: 'SDK event flush fails (network error during batch send)',
    impact: 'Events lost, incomplete replay data, anti-cheat has less signal.',
    detection: 'SDK catches flush error internally.',
    handling: `
      1. SDK re-buffers failed events: this.eventBuffer = [...events, ...this.eventBuffer]
      2. Retry on next scheduled flush (2s interval)
      3. If buffer exceeds 50 events, force immediate retry
      4. Events include sequence numbers for deduplication server-side
    `,
    recovery: `
      1. Events eventually delivered on next successful flush
      2. Server uses sequence numbers to order events correctly
      3. If game ends before events flush: endSession sends all remaining events
      4. Worst case: incomplete replay data → anti-cheat uses available signal
    `,
  },

  {
    id: 'SDK-002',
    category: 'SDK',
    severity: 'HIGH',
    scenario: 'SDK version is below minimum required version',
    impact: 'Outdated SDK may have known security vulnerabilities or bypass new anti-cheat checks.',
    detection: 'x-oghub-sdk-version header checked against MIN_SDK_VERSION in sdk-integrity.ts.',
    handling: `
      1. Server returns 426 Upgrade Required
      2. Response includes minimum required version
      3. Game developer must update SDK dependency
      4. Grace period: allow deprecated but not critically vulnerable versions
    `,
    recovery: `
      1. Developer updates SDK package
      2. No user action required (transparent to players)
    `,
  },

  {
    id: 'SDK-003',
    category: 'SDK',
    severity: 'MEDIUM',
    scenario: 'Game crashes before endSession — orphaned session',
    impact: 'Entry fee deducted but no score submitted. Session stuck in IN_PROGRESS.',
    detection: 'Session status is IN_PROGRESS past expiresAt timestamp.',
    handling: `
      1. Background job scans for expired IN_PROGRESS sessions every 5 minutes
      2. Sessions expired > 5 minutes: auto-transition to EXPIRED
      3. If entry fee was paid: auto-refund to wallet
      4. Refund logged as REFUND transaction type
    `,
    recovery: `
      1. Automatic — no manual intervention needed
      2. Player notified via push notification or next app visit
      3. If events exist: attempt to salvage partial score (generous to player)
    `,
  },

  // ═══════════════════════════════════════════════════════════
  // BUSINESS LOGIC FAILURES
  // ═══════════════════════════════════════════════════════════

  {
    id: 'BIZ-001',
    category: 'BUSINESS_LOGIC',
    severity: 'CRITICAL',
    scenario: 'Prize pool insufficient for payout (more winners than funded)',
    impact: 'Platform cannot pay winners, damages trust.',
    detection: 'Prize payout transaction fails due to insufficient platform wallet.',
    handling: `
      1. Challenge entry fees fund the prize pool (tracked per challenge)
      2. Platform takes rake BEFORE adding to prize pool
      3. Prize distribution calculated from actual collected pool
      4. Never promise more than collected - rake
      5. Guaranteed prize structure based on entry count thresholds
    `,
    recovery: `
      1. Platform reserve fund covers shortfall
      2. Alarm for finance team
      3. Challenge paused for investigation
      4. Root cause: likely a refund race condition or double-payout
    `,
  },

  {
    id: 'BIZ-002',
    category: 'BUSINESS_LOGIC',
    severity: 'MEDIUM',
    scenario: 'False positive in anti-cheat — legitimate player\'s score rejected',
    impact: 'Player frustrated, loses entry fee, potential churn.',
    detection: `
      - Player contacts support
      - Action is FLAG (not REJECT) — scored between 50-79
      - Manual review of fraud report shows no clear cheating
    `,
    handling: `
      1. FLAG action allows score to post but marks for review (not auto-reject)
      2. Only AUTO_REJECT_THRESHOLD (80+) is automatic rejection
      3. Cumulative fraud scoring decays by 10% — clean play lowers score over time
      4. Admin panel shows full fraud report with individual flag details
    `,
    recovery: `
      1. Admin reviews flagged score via fraud report
      2. If false positive: manually validate score and update leaderboard
      3. Adjust detection thresholds for the specific game if needed
      4. Refund entry fee if score was wrongly rejected
      5. Track false positive rate to tune fraud engine parameters
    `,
  },
];

// ─── Utility: Print failure matrix ──────────────────────────

export function getFailureMatrix(): string {
  const rows = FAILURE_SCENARIOS.map(s =>
    `| ${s.id} | ${s.severity} | ${s.scenario.slice(0, 60)}… | ${s.category} |`,
  );
  return [
    '| ID | Severity | Scenario | Category |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n');
}
