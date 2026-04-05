# Room System API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the user-created room system — the core competitive mechanic where users create rooms, set stakes, and compete for real money.

**Architecture:** New `Room` and `RoomParticipant` Prisma models with a dedicated Express router (`rooms.router.ts`). Room lifecycle managed by a worker that handles expiry, ready-state transitions, and prize distribution on completion. Wallet transactions use the existing `$transaction` + `Serializable` isolation pattern. Sessions are created per-participant when a room transitions to IN_PROGRESS.

**Tech Stack:** Express, Prisma (PostgreSQL), Zod validation, Redis (leaderboards), Vitest (tests)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/db/prisma/schema.prisma` | Add Room, RoomParticipant models + enums |
| `apps/api/src/common/schemas.ts` | Add room Zod validation schemas |
| `apps/api/src/rooms/rooms.router.ts` | Room CRUD + join/cancel endpoints |
| `apps/api/src/rooms/room-lifecycle.ts` | Worker: expiry, ready transition, completion, prize distribution |
| `apps/api/src/rooms/room-prizes.ts` | Prize calculation and distribution logic |
| `apps/api/src/main.ts` | Register rooms router + start lifecycle worker |
| `apps/api/src/rooms/rooms.test.ts` | Unit tests for room logic |

---

## Task 1: Prisma Schema — Room & RoomParticipant Models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1.1:** Add the Room enums and models to the Prisma schema. Insert after the `Challenge` model section (after line 244):

```prisma
// ─── ROOMS (User-Created Competition) ──────────────────────

enum RoomFormat {
  ONE_V_ONE
  BEST_OF_3
  FFA_5
  FFA_10
  FFA_20
}

enum RoomStatus {
  WAITING
  READY
  IN_PROGRESS
  COMPLETED
  EXPIRED
  CANCELLED
}

model Room {
  id              String          @id @default(cuid())
  gameId          String
  createdByUserId String
  format          RoomFormat
  entryFee        Decimal         @db.Decimal(12, 2)
  prizePool       Decimal         @default(0) @db.Decimal(12, 2)
  platformFee     Decimal         @default(0.05) @db.Decimal(4, 2)
  maxPlayers      Int
  currentRound    Int             @default(0)
  totalRounds     Int             @default(1)
  status          RoomStatus      @default(WAITING)
  expiresAt       DateTime
  readyAt         DateTime?
  startedAt       DateTime?
  completedAt     DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  game            Game            @relation(fields: [gameId], references: [id])
  createdBy       User            @relation("RoomsCreated", fields: [createdByUserId], references: [id])
  participants    RoomParticipant[]

  @@index([gameId, status])
  @@index([status, expiresAt])
  @@index([createdByUserId])
}

model RoomParticipant {
  id        String    @id @default(cuid())
  roomId    String
  userId    String
  joinedAt  DateTime  @default(now())
  sessionId String?

  room      Room      @relation(fields: [roomId], references: [id])
  user      User      @relation(fields: [userId], references: [id])

  @@unique([roomId, userId])
  @@index([userId])
}
```

- [ ] **Step 1.2:** Add the reverse relations on `User` and `Game` models.

In the `User` model (after the `reviewedPayouts` line), add:

```prisma
  roomsCreated      Room[]            @relation("RoomsCreated")
  roomParticipants  RoomParticipant[]
```

In the `Game` model (after the `definition` line), add:

```prisma
  rooms         Room[]
```

- [ ] **Step 1.3:** Run the Prisma migration:

```bash
cd packages/db && npx prisma migrate dev --name add-room-system
```

Expected: Migration creates `Room` and `RoomParticipant` tables with all columns, indexes, and foreign keys.

- [ ] **Step 1.4:** Verify the generated client has the new types:

```bash
cd packages/db && npx prisma generate
```

- [ ] **Step 1.5:** Commit:

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat(db): add Room and RoomParticipant models for user-created competition"
```

---

## Task 2: Zod Validation Schemas

**Files:**
- Modify: `apps/api/src/common/schemas.ts`

- [ ] **Step 2.1:** Add room validation schemas to the end of `apps/api/src/common/schemas.ts` (before the `validate` function):

```typescript
export const createRoomSchema = z.object({
  gameId: z.string().min(1, 'gameId is required'),
  format: z.enum(['ONE_V_ONE', 'BEST_OF_3', 'FFA_5', 'FFA_10', 'FFA_20']),
  entryFee: z.number().min(0.50, 'Minimum entry fee is $0.50').max(100, 'Maximum entry fee is $100'),
});

export const listRoomsSchema = z.object({
  gameId: z.string().optional(),
  status: z.enum(['WAITING', 'READY', 'IN_PROGRESS', 'COMPLETED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
```

- [ ] **Step 2.2:** Commit:

```bash
git add apps/api/src/common/schemas.ts
git commit -m "feat(api): add Zod schemas for room creation and listing"
```

---

## Task 3: Room Router — Create, List, Get, Join, Cancel

**Files:**
- Create: `apps/api/src/rooms/rooms.router.ts`

- [ ] **Step 3.1:** Create the rooms router file at `apps/api/src/rooms/rooms.router.ts`:

```typescript
import { Router } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../main';
import { authGuard, AuthenticatedRequest } from '../common/auth';
import { AppError } from '../common/error-handler';
import { validate, createRoomSchema, listRoomsSchema } from '../common/schemas';

export const roomsRouter = Router();

roomsRouter.use(authGuard);

const FORMAT_MAX_PLAYERS: Record<string, number> = {
  ONE_V_ONE: 2,
  BEST_OF_3: 2,
  FFA_5: 5,
  FFA_10: 10,
  FFA_20: 20,
};

const FORMAT_TOTAL_ROUNDS: Record<string, number> = {
  ONE_V_ONE: 1,
  BEST_OF_3: 3,
  FFA_5: 1,
  FFA_10: 1,
  FFA_20: 1,
};

const MAX_ACTIVE_ROOMS = 3;
const ROOM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const PLATFORM_FEE_RATE = new Decimal('0.05'); // 5%

// ─── Create Room ────────────────────────────────────────────

roomsRouter.post('/create', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { gameId, format, entryFee } = validate(createRoomSchema, req.body);
    const userId = req.user!.userId;

    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game || !game.isActive) throw new AppError('Game not found', 404);

    // Check active room limit
    const activeCount = await prisma.roomParticipant.count({
      where: {
        userId,
        room: { status: { in: ['WAITING', 'READY', 'IN_PROGRESS'] } },
      },
    });
    if (activeCount >= MAX_ACTIVE_ROOMS) {
      throw new AppError(`You can only be in ${MAX_ACTIVE_ROOMS} active rooms at a time`, 429);
    }

    const fee = new Decimal(entryFee);
    const maxPlayers = FORMAT_MAX_PLAYERS[format];
    const totalRounds = FORMAT_TOTAL_ROUNDS[format];

    const room = await prisma.$transaction(async (tx) => {
      // Deduct entry fee from creator
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new AppError('Wallet not found', 404);
      if (wallet.balance.lt(fee)) {
        throw new AppError('Insufficient balance', 402);
      }

      const newBalance = wallet.balance.sub(fee);
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ENTRY_FEE',
          amount: fee.neg(),
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          description: `Room entry: ${game.title} (${format})`,
        },
      });

      // Calculate initial prize pool contribution
      const platformCut = fee.mul(PLATFORM_FEE_RATE);
      const poolContribution = fee.sub(platformCut);

      // Create room
      const created = await tx.room.create({
        data: {
          gameId,
          createdByUserId: userId,
          format,
          entryFee: fee,
          prizePool: poolContribution,
          platformFee: PLATFORM_FEE_RATE,
          maxPlayers,
          totalRounds,
          status: 'WAITING',
          expiresAt: new Date(Date.now() + ROOM_EXPIRY_MS),
        },
      });

      // Auto-enter creator as first participant
      await tx.roomParticipant.create({
        data: { roomId: created.id, userId },
      });

      return created;
    }, { isolationLevel: 'Serializable' });

    res.status(201).json({
      success: true,
      data: {
        id: room.id,
        gameId: room.gameId,
        format: room.format,
        entryFee: room.entryFee.toString(),
        prizePool: room.prizePool.toString(),
        maxPlayers: room.maxPlayers,
        currentPlayers: 1,
        status: room.status,
        expiresAt: room.expiresAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── List Rooms ─────────────────────────────────────────────

roomsRouter.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { gameId, status, page, limit } = validate(listRoomsSchema, req.query);

    const where: any = {};
    if (gameId) where.gameId = gameId;
    if (status) {
      where.status = status;
    } else {
      where.status = 'WAITING'; // Default: show rooms waiting for players
    }

    const [rooms, total] = await Promise.all([
      prisma.room.findMany({
        where,
        include: {
          game: { select: { title: true, slug: true } },
          createdBy: { select: { username: true, displayName: true } },
          _count: { select: { participants: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.room.count({ where }),
    ]);

    res.json({
      success: true,
      data: rooms.map(r => ({
        id: r.id,
        gameId: r.gameId,
        gameTitle: r.game.title,
        gameSlug: r.game.slug,
        creator: r.createdBy.displayName || r.createdBy.username,
        format: r.format,
        entryFee: r.entryFee.toString(),
        prizePool: r.prizePool.toString(),
        maxPlayers: r.maxPlayers,
        currentPlayers: r._count.participants,
        status: r.status,
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Get Room Detail ────────────────────────────────────────

roomsRouter.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const room = await prisma.room.findUnique({
      where: { id: req.params.id },
      include: {
        game: { select: { title: true, slug: true } },
        createdBy: { select: { username: true, displayName: true } },
        participants: {
          include: { user: { select: { username: true, displayName: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!room) throw new AppError('Room not found', 404);

    res.json({
      success: true,
      data: {
        id: room.id,
        gameId: room.gameId,
        gameTitle: room.game.title,
        gameSlug: room.game.slug,
        creator: room.createdBy.displayName || room.createdBy.username,
        createdByUserId: room.createdByUserId,
        format: room.format,
        entryFee: room.entryFee.toString(),
        prizePool: room.prizePool.toString(),
        maxPlayers: room.maxPlayers,
        currentPlayers: room.participants.length,
        currentRound: room.currentRound,
        totalRounds: room.totalRounds,
        status: room.status,
        expiresAt: room.expiresAt.toISOString(),
        participants: room.participants.map(p => ({
          userId: p.userId,
          username: p.user.displayName || p.user.username,
          joinedAt: p.joinedAt.toISOString(),
        })),
        createdAt: room.createdAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Join Room ──────────────────────────────────────────────

roomsRouter.post('/:id/join', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const roomId = req.params.id;

    // Check active room limit
    const activeCount = await prisma.roomParticipant.count({
      where: {
        userId,
        room: { status: { in: ['WAITING', 'READY', 'IN_PROGRESS'] } },
      },
    });
    if (activeCount >= MAX_ACTIVE_ROOMS) {
      throw new AppError(`You can only be in ${MAX_ACTIVE_ROOMS} active rooms at a time`, 429);
    }

    const result = await prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: {
          _count: { select: { participants: true } },
          game: { select: { title: true } },
        },
      });

      if (!room) throw new AppError('Room not found', 404);
      if (room.status !== 'WAITING') {
        throw new AppError('Room is no longer accepting players', 400);
      }

      // Check if already joined
      const existing = await tx.roomParticipant.findUnique({
        where: { roomId_userId: { roomId, userId } },
      });
      if (existing) throw new AppError('You are already in this room', 400);

      // Check if room is full
      if (room._count.participants >= room.maxPlayers) {
        throw new AppError('Room is full', 400);
      }

      // Deduct entry fee
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new AppError('Wallet not found', 404);
      if (wallet.balance.lt(room.entryFee)) {
        throw new AppError('Insufficient balance', 402);
      }

      const newBalance = wallet.balance.sub(room.entryFee);
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ENTRY_FEE',
          amount: room.entryFee.neg(),
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          description: `Room entry: ${room.game.title} (${room.format})`,
          referenceId: roomId,
        },
      });

      // Add to prize pool
      const platformCut = room.entryFee.mul(room.platformFee);
      const poolContribution = room.entryFee.sub(platformCut);

      // Add participant
      await tx.roomParticipant.create({
        data: { roomId, userId },
      });

      const newPlayerCount = room._count.participants + 1;
      const isFull = newPlayerCount >= room.maxPlayers;

      // Update room
      await tx.room.update({
        where: { id: roomId },
        data: {
          prizePool: { increment: poolContribution },
          ...(isFull ? { status: 'READY', readyAt: new Date() } : {}),
        },
      });

      return { isFull, newPlayerCount };
    }, { isolationLevel: 'Serializable' });

    res.json({
      success: true,
      data: {
        joined: true,
        roomId,
        currentPlayers: result.newPlayerCount,
        isFull: result.isFull,
        status: result.isFull ? 'READY' : 'WAITING',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Cancel Room (creator only, before anyone else joins) ───

roomsRouter.post('/:id/cancel', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const roomId = req.params.id;

    const result = await prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: {
          participants: true,
          game: { select: { title: true } },
        },
      });

      if (!room) throw new AppError('Room not found', 404);
      if (room.createdByUserId !== userId) {
        throw new AppError('Only the room creator can cancel', 403);
      }
      if (room.status !== 'WAITING') {
        throw new AppError('Room can only be cancelled while waiting', 400);
      }
      if (room.participants.length > 1) {
        throw new AppError('Cannot cancel room after other players have joined', 400);
      }

      // Refund creator's entry fee
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (wallet) {
        const newBalance = wallet.balance.add(room.entryFee);
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'REFUND',
            amount: room.entryFee,
            balanceBefore: wallet.balance,
            balanceAfter: newBalance,
            description: `Room cancelled: ${room.game.title}`,
            referenceId: roomId,
          },
        });
      }

      // Remove participant and cancel room
      await tx.roomParticipant.deleteMany({ where: { roomId } });
      await tx.room.update({
        where: { id: roomId },
        data: { status: 'CANCELLED', prizePool: 0 },
      });

      return true;
    }, { isolationLevel: 'Serializable' });

    res.json({ success: true, data: { cancelled: true } });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 3.2:** Commit:

```bash
git add apps/api/src/rooms/rooms.router.ts
git commit -m "feat(api): add rooms router with create, list, get, join, cancel endpoints"
```

---

## Task 4: Room Lifecycle Worker — Expiry & Prize Distribution

**Files:**
- Create: `apps/api/src/rooms/room-prizes.ts`
- Create: `apps/api/src/rooms/room-lifecycle.ts`

- [ ] **Step 4.1:** Create the prize calculation module at `apps/api/src/rooms/room-prizes.ts`:

```typescript
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../main';

interface RoomPrizeDistribution {
  userId: string;
  rank: number;
  amount: Decimal;
}

export function calculateRoomPrizeSplit(format: string, playerCount: number): number[] {
  // 1v1 and Bo3: winner takes all
  if (format === 'ONE_V_ONE' || format === 'BEST_OF_3') {
    return [1.0];
  }
  // FFA 5: 1st 70%, 2nd 30%
  if (format === 'FFA_5') {
    return playerCount >= 2 ? [0.70, 0.30] : [1.0];
  }
  // FFA 10 and FFA 20: 1st 50%, 2nd 30%, 3rd 20%
  if (playerCount >= 3) return [0.50, 0.30, 0.20];
  if (playerCount === 2) return [0.70, 0.30];
  return [1.0];
}

export async function distributeRoomPrizes(roomId: string): Promise<RoomPrizeDistribution[]> {
  // Idempotency check
  const existing = await prisma.walletTransaction.findFirst({
    where: { type: 'PRIZE_PAYOUT', referenceId: roomId },
  });
  if (existing) return [];

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      participants: true,
      game: { select: { title: true } },
    },
  });

  if (!room || room.prizePool.lte(0)) return [];

  // Get scores for this room's participants from their sessions
  const participantUserIds = room.participants.map(p => p.userId);
  const scores = await prisma.score.findMany({
    where: {
      userId: { in: participantUserIds },
      session: { challengeId: null },
      isValidated: true,
    },
    orderBy: { value: 'desc' },
  });

  // For rooms, we need to match scores to room participants by sessionId
  // Get sessions linked to room participants
  const participantSessions = room.participants
    .filter(p => p.sessionId)
    .map(p => p.sessionId!);

  const roomScores = await prisma.score.findMany({
    where: {
      sessionId: { in: participantSessions },
      isValidated: true,
    },
    orderBy: { value: 'desc' },
  });

  if (roomScores.length === 0) return [];

  const splits = calculateRoomPrizeSplit(room.format, roomScores.length);
  const distributions: RoomPrizeDistribution[] = [];

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < roomScores.length && i < splits.length; i++) {
      const amount = room.prizePool.mul(new Decimal(splits[i])).toDecimalPlaces(2);
      if (amount.lte(0)) continue;

      const wallet = await tx.wallet.findUnique({ where: { userId: roomScores[i].userId } });
      if (!wallet) continue;

      const newBalance = wallet.balance.add(amount);
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'PRIZE_PAYOUT',
          amount,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          description: `Rank ${i + 1} prize: ${room.game.title} room`,
          referenceId: roomId,
        },
      });
      distributions.push({ userId: roomScores[i].userId, rank: i + 1, amount });
    }
  }, { isolationLevel: 'Serializable' });

  return distributions;
}
```

- [ ] **Step 4.2:** Create the lifecycle worker at `apps/api/src/rooms/room-lifecycle.ts`:

```typescript
import { prisma } from '../main';
import { Decimal } from '@prisma/client/runtime/library';
import { distributeRoomPrizes } from './room-prizes';

const LIFECYCLE_INTERVAL_MS = 15_000; // Check every 15 seconds (rooms are more time-sensitive)

export async function runRoomLifecycleTick(): Promise<{
  expired: number;
  completed: number;
}> {
  const now = new Date();

  // 1. Expire rooms that passed their expiry time while still WAITING
  const expiredRooms = await prisma.room.findMany({
    where: {
      status: 'WAITING',
      expiresAt: { lte: now },
    },
    include: {
      participants: true,
      game: { select: { title: true } },
    },
  });

  for (const room of expiredRooms) {
    try {
      await prisma.$transaction(async (tx) => {
        // Refund all participants
        for (const participant of room.participants) {
          const wallet = await tx.wallet.findUnique({ where: { userId: participant.userId } });
          if (!wallet) continue;

          const newBalance = wallet.balance.add(room.entryFee);
          await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: 'REFUND',
              amount: room.entryFee,
              balanceBefore: wallet.balance,
              balanceAfter: newBalance,
              description: `Room expired: ${room.game.title}`,
              referenceId: room.id,
            },
          });
        }

        await tx.room.update({
          where: { id: room.id },
          data: { status: 'EXPIRED' },
        });
      }, { isolationLevel: 'Serializable' });
    } catch (err) {
      console.error(`[Room Lifecycle] Expiry failed for room ${room.id}:`, err);
    }
  }

  // 2. Check for IN_PROGRESS rooms where all participants have completed sessions
  const inProgressRooms = await prisma.room.findMany({
    where: { status: 'IN_PROGRESS' },
    include: { participants: true },
  });

  let completedCount = 0;
  for (const room of inProgressRooms) {
    const sessionIds = room.participants
      .filter(p => p.sessionId)
      .map(p => p.sessionId!);

    if (sessionIds.length === 0) continue;

    // Check if all sessions are in a terminal state
    const completedSessions = await prisma.gameSession.count({
      where: {
        id: { in: sessionIds },
        status: { in: ['COMPLETED', 'REJECTED', 'EXPIRED'] },
      },
    });

    if (completedSessions >= room.participants.length) {
      try {
        await prisma.room.update({
          where: { id: room.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        await distributeRoomPrizes(room.id);
        completedCount++;
      } catch (err) {
        console.error(`[Room Lifecycle] Completion failed for room ${room.id}:`, err);
      }
    }
  }

  return { expired: expiredRooms.length, completed: completedCount };
}

let lifecycleTimer: ReturnType<typeof setInterval> | null = null;

export function startRoomLifecycleWorker(): void {
  if (lifecycleTimer) return;
  console.log('[Room Lifecycle] Worker started');

  lifecycleTimer = setInterval(async () => {
    try {
      const result = await runRoomLifecycleTick();
      if (result.expired > 0 || result.completed > 0) {
        console.log(`[Room Lifecycle] Expired: ${result.expired}, Completed: ${result.completed}`);
      }
    } catch (err) {
      console.error('[Room Lifecycle] Error:', err);
    }
  }, LIFECYCLE_INTERVAL_MS);

  runRoomLifecycleTick().catch(console.error);
}

export function stopRoomLifecycleWorker(): void {
  if (lifecycleTimer) { clearInterval(lifecycleTimer); lifecycleTimer = null; }
}
```

- [ ] **Step 4.3:** Commit:

```bash
git add apps/api/src/rooms/room-prizes.ts apps/api/src/rooms/room-lifecycle.ts
git commit -m "feat(api): add room lifecycle worker with expiry refunds and prize distribution"
```

---

## Task 5: Register Routes & Start Worker in main.ts

**Files:**
- Modify: `apps/api/src/main.ts`

- [ ] **Step 5.1:** Add the rooms router import. After the `ghostsRouter` import (line 16), add:

```typescript
import { roomsRouter } from './rooms/rooms.router';
```

- [ ] **Step 5.2:** Add the room lifecycle worker import. After the `startChallengeLifecycleWorker` import (line 23), add:

```typescript
import { startRoomLifecycleWorker } from './rooms/room-lifecycle';
```

- [ ] **Step 5.3:** Register the rooms router. After the ghosts route registration (line 90 `app.use('/api/ghosts', ghostsRouter);`), add:

```typescript
app.use('/api/rooms', roomsRouter);
```

- [ ] **Step 5.4:** Start the room lifecycle worker. After `startChallengeLifecycleWorker();` (line 108), add:

```typescript
  // Start room lifecycle worker
  startRoomLifecycleWorker();
```

- [ ] **Step 5.5:** Commit:

```bash
git add apps/api/src/main.ts
git commit -m "feat(api): register rooms router and start room lifecycle worker"
```

---

## Task 6: Unit Tests for Room Prize Calculation

**Files:**
- Create: `apps/api/src/rooms/rooms.test.ts`

- [ ] **Step 6.1:** Create the test file at `apps/api/src/rooms/rooms.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateRoomPrizeSplit } from './room-prizes';

describe('Room Prize Distribution', () => {
  describe('calculateRoomPrizeSplit', () => {
    it('1v1: winner takes all', () => {
      expect(calculateRoomPrizeSplit('ONE_V_ONE', 2)).toEqual([1.0]);
    });

    it('Bo3: winner takes all', () => {
      expect(calculateRoomPrizeSplit('BEST_OF_3', 2)).toEqual([1.0]);
    });

    it('FFA 5 with 5 players: 70/30 split', () => {
      expect(calculateRoomPrizeSplit('FFA_5', 5)).toEqual([0.70, 0.30]);
    });

    it('FFA 5 with only 1 player: winner takes all', () => {
      expect(calculateRoomPrizeSplit('FFA_5', 1)).toEqual([1.0]);
    });

    it('FFA 10 with 10 players: 50/30/20 split', () => {
      expect(calculateRoomPrizeSplit('FFA_10', 10)).toEqual([0.50, 0.30, 0.20]);
    });

    it('FFA 20 with 20 players: 50/30/20 split', () => {
      expect(calculateRoomPrizeSplit('FFA_20', 20)).toEqual([0.50, 0.30, 0.20]);
    });

    it('FFA 10 with only 2 players: 70/30 split', () => {
      expect(calculateRoomPrizeSplit('FFA_10', 2)).toEqual([0.70, 0.30]);
    });

    it('splits sum to 1.0 for all formats', () => {
      const cases = [
        ['ONE_V_ONE', 2],
        ['BEST_OF_3', 2],
        ['FFA_5', 5],
        ['FFA_10', 10],
        ['FFA_20', 20],
      ] as const;

      for (const [format, players] of cases) {
        const splits = calculateRoomPrizeSplit(format, players);
        const total = splits.reduce((sum, s) => sum + s, 0);
        expect(total).toBeCloseTo(1.0, 10);
      }
    });
  });
});
```

- [ ] **Step 6.2:** Run the tests:

```bash
cd apps/api && npx vitest run src/rooms/rooms.test.ts
```

Expected: All 8 tests pass.

- [ ] **Step 6.3:** Commit:

```bash
git add apps/api/src/rooms/rooms.test.ts
git commit -m "test(api): add unit tests for room prize calculation"
```

---

## Task 7: Remove Double-or-Nothing (Off-Brand)

**Files:**
- Modify: `apps/api/src/wallet/wallet.router.ts` (remove double-or-nothing endpoint)
- Delete: `apps/api/src/wallet/double-or-nothing.ts`
- Modify: `apps/api/src/common/schemas.ts` (remove doubleOrNothingSchema)

- [ ] **Step 7.1:** Read `apps/api/src/wallet/wallet.router.ts` and remove the double-or-nothing route. Find the `POST /double-or-nothing` handler and delete the entire route handler block. Also remove the import of `doubleOrNothingSchema` if it references the file, and any import of the `double-or-nothing.ts` module.

- [ ] **Step 7.2:** Delete the file `apps/api/src/wallet/double-or-nothing.ts`:

```bash
rm apps/api/src/wallet/double-or-nothing.ts
```

- [ ] **Step 7.3:** Remove `doubleOrNothingSchema` from `apps/api/src/common/schemas.ts`. Delete these lines:

```typescript
export const doubleOrNothingSchema = z.object({
  amount: z.number().positive('Amount must be positive').max(10000, 'Amount exceeds maximum'),
});
```

- [ ] **Step 7.4:** Verify tests still pass:

```bash
cd apps/api && npx vitest run
```

- [ ] **Step 7.5:** Commit:

```bash
git add -A
git commit -m "chore(api): remove double-or-nothing endpoint (off-brand)"
```

---

## Summary of All Files Changed

### New files:
- `apps/api/src/rooms/rooms.router.ts` — Room CRUD + join/cancel endpoints
- `apps/api/src/rooms/room-lifecycle.ts` — Expiry, completion detection, worker
- `apps/api/src/rooms/room-prizes.ts` — Prize split calculation and distribution
- `apps/api/src/rooms/rooms.test.ts` — Unit tests for prize calculation
- `packages/db/prisma/migrations/*/` — Room system migration

### Modified files:
- `packages/db/prisma/schema.prisma` — Room, RoomParticipant models + enums
- `apps/api/src/common/schemas.ts` — Add room schemas, remove doubleOrNothing
- `apps/api/src/main.ts` — Register rooms router, start lifecycle worker

### Deleted files:
- `apps/api/src/wallet/double-or-nothing.ts` — Off-brand gambling feature

### API Endpoints Created:
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/rooms/create` | Create a room (deducts entry fee, auto-enters creator) |
| GET | `/api/rooms` | List rooms (filterable by gameId, status, paginated) |
| GET | `/api/rooms/:id` | Room detail with participants |
| POST | `/api/rooms/:id/join` | Join a room (deducts entry fee, transitions to READY when full) |
| POST | `/api/rooms/:id/cancel` | Cancel room (creator only, before others join, full refund) |
