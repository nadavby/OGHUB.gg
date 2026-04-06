# Competitive Room Lifecycle Design

## Goal

Design the full lifecycle of a competitive room — from creation through ready check, game launch, result validation, and prize distribution. Handle all edge cases: no-show, disconnection, cheating, ties. Production-grade architecture with Redis Pub/Sub for stateless horizontal scaling.

## Decisions

| Question | Decision | Reasoning |
|----------|----------|-----------|
| What happens after room fills? | Ready check → auto-launch (no Play button) | Once you click Ready, you're committed |
| Ready check timeout | 30 seconds | You paid to join, you know you're playing |
| Not ready in time | Full refund to all, room cancelled | No one played yet — unfair to punish |
| Ready but didn't connect to game | Auto-lose after connect timeout | You committed by clicking Ready |
| Cheating detected | Cheater loses, opponent wins | Fraud engine is 4-layer, high confidence |
| Tie (equal scores) | Full refund including platform fee | No winner = platform doesn't profit |
| FFA with cheaters | Remove cheaters from ranking, rank remaining | Cheater's entry fee stays in pool as bonus |
| Auto-launch countdown | 5 seconds | Enough to prepare, not enough to feel slow |
| Real-time sync | WebSocket via Redis Pub/Sub | Already have ws + Redis. Stateless, scalable |
| Game session timeout | Per-game configurable (Game model) | Different games have different durations |

---

## Room State Machine

```
WAITING → FULL → READY_CHECK → COUNTDOWN → IN_PROGRESS → SETTLING → COMPLETED
  │                  │                          │
  ↓                  ↓                          ↓
EXPIRED          CANCELLED                  COMPLETED
(30min timeout)  (not all ready)           (all sessions terminal)
```

### States

| State | Description | Next Trigger |
|-------|-------------|-------------|
| `WAITING` | Waiting for players to join | Last player joins → `FULL` |
| `FULL` | All players in room | Immediate → `READY_CHECK` |
| `READY_CHECK` | Waiting for all to click Ready (30s) | All ready → `COUNTDOWN` / timeout → `CANCELLED` |
| `COUNTDOWN` | 5-second pre-launch countdown | Timer done → `IN_PROGRESS` |
| `IN_PROGRESS` | Games running | All sessions terminal → `SETTLING` |
| `SETTLING` | Validating results, distributing prizes | Done → `COMPLETED` |
| `COMPLETED` | Final, prizes distributed | Terminal |
| `EXPIRED` | WAITING timeout (30 min) | Terminal, refund all |
| `CANCELLED` | Ready check failed or creator cancelled | Terminal, refund all |

### Transition Rules

- Every state transition persists to DB AND publishes event to Redis channel `room:{roomId}:events`
- Timers managed in Redis Sorted Set `room:timers` — not in-memory
- Any WebSocket server instance subscribes to Redis and forwards events to connected clients
- Source of truth: DB (Postgres). Redis is cache + messaging layer. On Redis failure, fall back to DB reads.

---

## Redis Architecture

### Keys & Channels

| Key/Channel | Type | Purpose |
|-------------|------|---------|
| `room:{roomId}:state` | Hash | Current state: status, players, readyPlayers |
| `room:{roomId}:events` | Pub/Sub channel | Real-time events to all participants |
| `room:{roomId}:ready` | Set | Set of userIds who clicked Ready |
| `room:timers` | Sorted Set | All active timers (score = expiry timestamp) |

### Event Types

```typescript
// Player events
{ type: 'player_joined', userId, displayName, slot }
{ type: 'player_left', userId }

// Ready check
{ type: 'ready_check_started', expiresAt }
{ type: 'player_ready', userId }
{ type: 'ready_check_failed', reason: 'timeout', notReadyPlayers: string[] }

// Countdown & Launch
{ type: 'countdown_started', launchAt }
{ type: 'countdown_tick', remaining: number }
{ type: 'game_launching', sessions: Record<userId, { token, seed }> }

// In-game
{ type: 'player_finished', userId, score }
{ type: 'player_disconnected', userId }

// Settlement
{ type: 'settling' }
{ type: 'room_completed', winners: { userId, rank, prize }[] }
{ type: 'room_cancelled', reason, refunds: { userId, amount }[] }
```

### Timer Architecture

Redis Sorted Set instead of in-memory setTimeout:

```
ZADD room:timers <expiry_timestamp> "room:{id}:ready_check"
ZADD room:timers <expiry_timestamp> "room:{id}:launch"
ZADD room:timers <expiry_timestamp> "room:{id}:session_timeout"
```

**Timer Worker** runs every second:
```
ZRANGEBYSCORE room:timers -inf <now>
```
Picks up expired timers, executes corresponding action, removes from sorted set.

---

## Room Lifecycle Flow

### Phase 1: Room Creation + Joining (existing, minor changes)

Last player joins triggers transition:

```
POST /api/rooms/:id/join (last player)
  Transaction:
    1. Deduct entry fee
    2. Add RoomParticipant
    3. Room.status = FULL
    4. Redis: SET room:{id}:state { status: FULL, players: [...] }
    5. Redis: PUBLISH room:{id}:events { type: 'player_joined' }
    6. Immediately trigger Ready Check
```

### Phase 2: Ready Check (30 seconds)

```
FULL → READY_CHECK:
  1. DB: Room.status = READY_CHECK, Room.readyCheckAt = now
  2. Redis: HSET room:{id}:state status READY_CHECK
  3. Redis: ZADD room:timers <now+30s> "room:{id}:ready_check"
  4. Redis: PUBLISH { type: 'ready_check_started', expiresAt }

Player clicks Ready:
  POST /api/rooms/:id/ready
    1. Validate room status = READY_CHECK
    2. Redis: SADD room:{id}:ready <userId>
    3. Redis: PUBLISH { type: 'player_ready', userId }
    4. SCARD room:{id}:ready == maxPlayers?
       → Yes: ZREM timer, transition to COUNTDOWN
       → No: Wait

Timer expires (not all ready):
  Timer Worker:
    1. DB: Room.status = CANCELLED
    2. Refund ALL participants (full entry fee, platform waives fee)
    3. Redis: PUBLISH { type: 'ready_check_failed', notReadyPlayers }
    4. Cleanup Redis keys
```

### Phase 3: Countdown (5 seconds)

```
All ready → COUNTDOWN:
  1. DB: Room.status = COUNTDOWN, Room.countdownAt = now
  2. Generate shared seed + per-player session tokens
  3. Redis: ZADD room:timers <now+5s> "room:{id}:launch"
  4. Redis: PUBLISH { type: 'countdown_started', launchAt }

Timer Worker ticks every second:
  PUBLISH { type: 'countdown_tick', remaining }

Timer expires → Launch:
  1. DB: Create GameSession per participant (seed, token, config)
     Room.status = IN_PROGRESS, Room.startedAt = now
  2. Redis: PUBLISH { type: 'game_launching', sessions: { [userId]: { token, seed } } }
  3. Redis: ZADD room:timers <now+connectTimeout> "room:{id}:connect_timeout"
  4. Redis: ZADD room:timers <now+maxSessionDuration> "room:{id}:session_timeout"
```

### Phase 4: In-Progress

```
Each player's game:
  → SDK connects to live-validation WebSocket (existing)
  → Events stream via Redis pipeline (existing)
  → Score updates via WebSocket hash chain (existing)

Player finishes:
  POST /api/sessions/:id/end
    1. Fraud engine validates (4 layers, existing)
    2. Session.status = COMPLETED or REJECTED
    3. Redis: PUBLISH { type: 'player_finished', userId, score }
    4. Check all sessions terminal → transition to SETTLING

Player doesn't connect (connect timeout):
  Timer Worker:
    1. Any sessions still CREATED → status = EXPIRED
    2. Redis: PUBLISH { type: 'player_disconnected', userId }
    3. Check all sessions terminal → SETTLING

Room session timeout (maxSessionDuration):
  Timer Worker:
    1. Any non-terminal sessions → EXPIRED
    2. Transition to SETTLING
```

### Phase 5: Settlement

```
IN_PROGRESS → SETTLING:
  1. DB: Room.status = SETTLING
  2. Redis: PUBLISH { type: 'settling' }
  3. Gather all sessions + scores
  4. Run settlement logic (see Financial Math section)
  5. DB: Room.status = COMPLETED, Room.settledAt = now
  6. Redis: PUBLISH { type: 'room_completed', winners, prizes }
  7. Cleanup all Redis keys
```

---

## Settlement Engine — Financial Math

All financial operations run inside Prisma `$transaction` with `isolationLevel: 'Serializable'`.

### Prize Pool

```
netPerPlayer = entryFee × (1 - platformFee)
prizePool = netPerPlayer × playerCount

1v1:   2 × $5.00 × 0.95 = $9.50
FFA_5: 5 × $5.00 × 0.95 = $23.75
```

### Prize Splits

| Format | 1st | 2nd | 3rd |
|--------|-----|-----|-----|
| ONE_V_ONE | 100% | — | — |
| BEST_OF_3 | 100% | — | — |
| FFA_5 | 70% | 30% | — |
| FFA_10 | 50% | 30% | 20% |
| FFA_20 | 50% | 30% | 20% |

### Settlement Cases

**Normal win:** Rank valid sessions by score DESC. Distribute prizes per split table.

**Tie:** Full refund to all tied players including platform fee. Platform doesn't profit from ties.

**Cheater detected (session REJECTED):** Remove from ranking. Rank remaining legitimate players. Cheater gets nothing — entry fee stays in pool as bonus for legit players.

**No-show (session EXPIRED, never connected):** Same as cheater — removed from ranking, gets nothing.

**All sessions invalid (all REJECTED or all EXPIRED):** Full refund to all.

**One legitimate player remaining:** Wins 100% of prize pool.

**FFA mixed results:** Remove all cheaters/no-shows first. Rank remaining by score. Apply prize split to remaining players. Cheaters'/no-shows' entry fees stay in pool.

### Refund Math

```
refundAmount = entryFee  // Original amount paid, NOT netPerPlayer
```
Platform returns what player paid, including the fee. Platform doesn't profit from no-result games.

### Idempotency

```typescript
const updated = await tx.room.updateMany({
  where: { id: roomId, status: 'SETTLING' },
  data: { status: 'COMPLETED', settledAt: new Date() }
});
if (updated.count === 0) return; // Already settled
```

---

## WebSocket Protocol

### Connection

```
WS /api/rooms/live?roomId=X&token=JWT

Server:
  1. Verify JWT → userId
  2. Verify user is RoomParticipant
  3. Subscribe to Redis channel room:{roomId}:events
  4. Send state_sync: { type: 'state_sync', room: { status, players, readyPlayers, countdown? } }
```

### Reconnection

Client can disconnect at any time. On reconnect:
1. Same endpoint, same JWT
2. Server sends full `state_sync` with current room state from Redis/DB
3. Client catches up to current phase

**WS disconnect ≠ player left.** Player who disconnects from WS is still in the room. Only timer expiry (not ready, not connected to game, session timeout) causes loss.

### Heartbeat

```
Server → Client: { type: 'ping' }  every 15s
Client → Server: { type: 'pong' }
No pong for 45s → mark disconnected (but don't affect room state)
```

### Fan-Out Architecture

```
Client ←WS→ API Server ←Subscribe→ Redis Pub/Sub ←Publish← Room Service
```

Any API server instance can serve any client. State lives in Redis + DB, not in server memory.

---

## Game Definition Extensions

```prisma
model Game {
  // existing fields...
  maxSessionDuration  Int  @default(600)   // seconds
  connectTimeout      Int  @default(60)    // seconds — time to connect after launch
  readyTimeout        Int  @default(30)    // seconds — time to click Ready
  countdownDuration   Int  @default(5)     // seconds — pre-launch countdown
}
```

Each game configures its own timeouts. NeonRunner: `maxSessionDuration: 180`. Another game might be 600.

---

## DB Schema Changes

### New RoomStatus values

```prisma
enum RoomStatus {
  WAITING
  FULL
  READY_CHECK
  COUNTDOWN
  IN_PROGRESS
  SETTLING
  COMPLETED
  EXPIRED
  CANCELLED
}
```

### New Room fields

```prisma
model Room {
  // existing fields...
  readyCheckAt  DateTime?
  countdownAt   DateTime?
  settledAt     DateTime?
}
```

### New RoomParticipant fields

```prisma
model RoomParticipant {
  // existing fields...
  isReady       Boolean             @default(false)
  readyAt       DateTime?
  finalScore    Int?
  finalRank     Int?
  prizeAmount   Decimal?            @db.Decimal(12, 2)
  outcome       ParticipantOutcome?
}

enum ParticipantOutcome {
  WIN
  LOSE
  TIE_REFUND
  CHEAT_DISQUALIFIED
  NO_SHOW
  NOT_READY
}
```

---

## Security & Edge Cases

### Race Conditions

| Scenario | Protection |
|----------|-----------|
| Two players click Ready simultaneously | Redis SADD atomic, SCARD check after each |
| Settlement runs twice | Serializable transaction + conditional update |
| Ready click after timer expired | Server validates room status = READY_CHECK |
| Join after room is FULL | DB transaction: check count < maxPlayers |
| Webhook + session end arrive together | Settlement checks all sessions terminal |

### Fraud Edge Cases

| Scenario | Protection |
|----------|-----------|
| Score submitted via API without playing | HMAC hash chain must be continuous |
| Seed manipulation | Server generates seed, replay must match |
| Replay from another player | Checksum includes sessionId + userId |
| Cross-room session end | Session token validated against roomId |
| MITM score modification | WebSocket scores HMAC signed |

### Connection Edge Cases

| Scenario | Handling |
|----------|---------|
| Ready then WS disconnect | Ready persisted in Redis, not revoked |
| Disconnect during countdown | Countdown continues, game launches, connect timeout applies |
| Server crash during ready check | Timer in Redis survives, another instance picks it up |
| Server crash during settlement | Recovery worker: SETTLING > 60s → re-run (idempotent) |
| Redis down | Fallback to DB as source of truth |

### Recovery Worker (every 60 seconds)

1. Rooms in READY_CHECK > 60s → force cancel + refund
2. Rooms in COUNTDOWN > 30s → re-trigger launch or cancel
3. Rooms in IN_PROGRESS > maxSessionDuration + 120s → force settle
4. Rooms in SETTLING > 60s → re-run settlement
5. Rooms in FULL > 10s → re-trigger ready check

### Rate Limiting

| Action | Limit |
|--------|-------|
| Join room | 1 per room per user (unique constraint) |
| Click Ready | Idempotent, multiple clicks ignored |
| Create room | Max 3 active rooms per user |
| WS connections | Max 5 per user across all rooms |

---

## New Files

```
apps/api/src/rooms/
  ├── room-state-machine.ts    — State transitions + validation
  ├── room-redis.ts            — Redis state, pub/sub, timers
  ├── room-ws.ts               — WebSocket handler for room events
  ├── room-settlement.ts       — Settlement engine
  ├── room-timers.ts           — Timer worker
  └── room-recovery.ts         — Recovery worker for stuck rooms

apps/web/src/hooks/
  └── useRoomSocket.ts         — WebSocket hook

apps/web/src/components/
  ├── RoomReadyCheck.tsx
  ├── RoomCountdown.tsx
  ├── RoomSettling.tsx
  └── RoomResults.tsx
```

## Files to Modify

```
packages/db/prisma/schema.prisma      — New statuses, fields, enums
apps/api/src/rooms/rooms.router.ts    — Add /ready endpoint, WS integration
apps/api/src/rooms/room-lifecycle.ts  — Replace with timer + recovery workers
apps/api/src/rooms/room-prizes.ts     — Replace with room-settlement.ts
apps/web/src/app/rooms/[id]/page.tsx  — Rewrite with WebSocket + all states
```

## Unchanged

- Deposit/withdrawal flow
- Challenge mode
- Fraud engine (reused as-is)
- Event pipeline (reused as-is)
- Live validation WebSocket (separate from room WS)
- Unity SDK (game doesn't know about room lifecycle)
