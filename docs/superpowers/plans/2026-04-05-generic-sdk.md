# OGHub Generic SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the OGHub SDK into a generic, engine-agnostic platform with Game Definition Protocol, Trust Tiers, WebSocket live validation, and a generic fraud engine — then migrate NeonRunner to use it.

**Architecture:** Protocol-based SDK core (TypeScript) with thin engine wrappers. Server gets a Game Registry that stores Game Definitions, a generic fraud engine that loads rules per-game, and a WebSocket endpoint for live validation. Trust Tiers (basic/standard/verified) gate prize pool limits based on validation capabilities.

**Tech Stack:** TypeScript, Express, Prisma, Redis, WebSocket (ws), Zod, Vitest, Unity C#

---

## File Structure

### New files to create

```
packages/
├── sdk-core/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # Re-exports public API
│       ├── types.ts              # All SDK types + Game Definition types
│       ├── client.ts             # OGHubSDK class (main entry)
│       ├── session.ts            # Session lifecycle management
│       ├── events.ts             # Event reporter + input recorder
│       ├── integrity.ts          # HMAC signing, hash chains, checksums
│       ├── websocket.ts          # WebSocket channel (live validation, leaderboard)
│       ├── replay.ts             # Replay recorder + builder
│       └── offline-queue.ts      # Offline submission retry queue
│
├── sdk-web/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts              # Web wrapper (thin, re-exports sdk-core with browser adapters)

apps/api/src/
├── game-registry/
│   ├── game-definition.ts        # GameDefinition type + Zod schema + parser
│   ├── game-registry.router.ts   # POST /register, PUT /definition endpoints
│   └── game-registry.test.ts     # Tests
├── anticheat/
│   ├── generic-fraud-engine.ts   # New generic fraud engine (replaces fraud-engine.ts)
│   └── generic-fraud-engine.test.ts
├── live-validation/
│   ├── live-validator.ts         # WebSocket server + snapshot validation logic
│   └── live-validator.test.ts

packages/sdk-unity/
├── package.json                  # UPM package manifest
├── Runtime/
│   ├── OGHub.cs                  # Static API facade
│   ├── OGHubClient.cs            # Core protocol implementation
│   ├── OGHubWebSocket.cs         # WebSocket handler
│   ├── OGHubIntegrity.cs         # HMAC signing + hash chains
│   └── OGHubStorage.cs           # PlayerPrefs offline queue
└── Runtime/OGHub.asmdef          # Assembly definition
```

### Existing files to modify

```
packages/shared/src/index.ts           # Add GameDefinition, TrustTier, LiveValidation types
packages/db/prisma/schema.prisma       # Add GameDefinition model, trustTier to Game
apps/api/src/common/schemas.ts         # Add gameDefinitionSchema
apps/api/src/games/games.router.ts     # Add definition registration endpoints
apps/api/src/sessions/sessions.router.ts  # Load game definition, pass to fraud engine
apps/api/src/main.ts                   # Mount new routes, start WebSocket server
games/NeonRunner/Assets/Scripts/SDK/OGHubBridge.cs  # Replace with generic SDK usage
```

---

## Task 1: Shared Types — Game Definition & Trust Tiers

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write Game Definition types**

Add these types at the end of `packages/shared/src/index.ts`:

```typescript
// ─── Game Definition Protocol ──────────────────────────────

export type TrustTier = 'basic' | 'standard' | 'verified';
export type InputType = 'action' | 'vector2' | 'vector3' | 'scalar' | 'toggle';
export type ScoringMethod = 'accumulative' | 'time_based' | 'objective_based' | 'custom';

export interface InputDefinition {
  name: string;
  type: InputType;
  metadata?: Record<string, string>;
}

export interface ScoringDefinition {
  range: [number, number];
  method: ScoringMethod;
  components?: Array<{ name: string; weight: number }>;
}

export interface SessionRules {
  maxDuration: number;    // seconds
  minDuration: number;    // seconds
  allowPause: boolean;
  lives?: number;
}

export interface AnticheatConfig {
  maxInputRate: number;          // per second
  minReactionTime: number;       // ms
  maxScorePerSecond: number;
  customRules?: Array<{
    name: string;
    condition: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

export interface ValidationConfig {
  snapshotInterval: number;      // seconds
  requiredFields: string[];
}

export interface GameDefinition {
  name: string;
  slug: string;
  version: string;
  engine: string;
  inputs: InputDefinition[];
  scoring: ScoringDefinition;
  session: SessionRules;
  anticheat: AnticheatConfig;
  trust: {
    tier: TrustTier;
    replayFormat?: string;
    replaySimulator?: string;
  };
  validation?: ValidationConfig;
}

// ─── Live Validation (WebSocket) ───────────────────────────

export interface StateSnapshot {
  [key: string]: unknown;
}

export interface ValidationRequest {
  type: 'validation_request';
  requestId: string;
  timestamp: number;
}

export interface ValidationResponse {
  type: 'validation_response';
  requestId: string;
  state: StateSnapshot;
}

export interface ScoreUpdate {
  type: 'score_update';
  score: number;
  hash: string;
  sequence: number;
}

export interface LeaderboardUpdate {
  type: 'leaderboard_update';
  entries: LeaderboardEntry[];
}

// ─── Trust Tier Limits ─────────────────────────────────────

export const TRUST_TIER_LIMITS: Record<TrustTier, { maxPrizePool: number }> = {
  basic: { maxPrizePool: 50 },
  standard: { maxPrizePool: 1000 },
  verified: { maxPrizePool: Infinity },
};
```

- [ ] **Step 2: Verify build**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat: add GameDefinition, TrustTier, and LiveValidation shared types"
```

---

## Task 2: Database Schema — GameDefinition Storage

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add GameDefinition model and trustTier to Game**

Add `trustTier` field to the `Game` model and a new `GameDefinition` model. In `schema.prisma`, after line 170 (`tags String[]`), add:

```prisma
  trustTier   String       @default("basic")    // basic | standard | verified
```

After line 181 (end of Game model), add:

```prisma
model GameDefinition {
  id            String    @id @default(cuid())
  gameId        String    @unique
  version       String
  definition    Json      // Full GameDefinition object
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  game          Game      @relation(fields: [gameId], references: [id])
}
```

Add the relation to `Game` model (after `sessions GameSession[]` on line 177):

```prisma
  definition  GameDefinition?
```

- [ ] **Step 2: Generate Prisma client**

Run: `cd packages/db && npx prisma generate`
Expected: "Generated Prisma Client"

- [ ] **Step 3: Create migration**

Run: `cd packages/db && npx prisma migrate dev --name add-game-definition`
Expected: Migration created and applied

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/
git commit -m "feat: add GameDefinition model and trustTier to Game schema"
```

---

## Task 3: Game Definition Zod Schema & Parser

**Files:**
- Create: `apps/api/src/game-registry/game-definition.ts`
- Create: `apps/api/src/game-registry/game-definition.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/game-registry/game-definition.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseGameDefinition } from './game-definition';

describe('Game Definition Parser', () => {
  const validDefinition = {
    name: 'Space Blaster',
    slug: 'space-blaster',
    version: '1.0.0',
    engine: 'unity',
    inputs: [
      { name: 'shoot', type: 'action' },
      { name: 'move', type: 'vector2' },
    ],
    scoring: {
      range: [0, 999999],
      method: 'accumulative',
      components: [{ name: 'kills', weight: 100 }],
    },
    session: {
      maxDuration: 300,
      minDuration: 10,
      allowPause: false,
      lives: 1,
    },
    anticheat: {
      maxInputRate: 30,
      minReactionTime: 50,
      maxScorePerSecond: 5000,
    },
    trust: {
      tier: 'standard',
    },
    validation: {
      snapshotInterval: 5,
      requiredFields: ['player_health', 'current_score'],
    },
  };

  it('parses a valid game definition', () => {
    const result = parseGameDefinition(validDefinition);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBe('space-blaster');
      expect(result.data.inputs).toHaveLength(2);
      expect(result.data.trust.tier).toBe('standard');
    }
  });

  it('rejects definition with invalid scoring range', () => {
    const invalid = {
      ...validDefinition,
      scoring: { ...validDefinition.scoring, range: [-1, 100] },
    };
    const result = parseGameDefinition(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects definition with unknown input type', () => {
    const invalid = {
      ...validDefinition,
      inputs: [{ name: 'shoot', type: 'laser_beam' }],
    };
    const result = parseGameDefinition(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects basic tier with validation config', () => {
    const invalid = {
      ...validDefinition,
      trust: { tier: 'basic' },
      validation: { snapshotInterval: 5, requiredFields: ['hp'] },
    };
    const result = parseGameDefinition(invalid);
    expect(result.success).toBe(false);
  });

  it('requires validation config for standard tier', () => {
    const noValidation = { ...validDefinition, validation: undefined };
    const result = parseGameDefinition(noValidation);
    expect(result.success).toBe(false);
  });

  it('rejects negative maxInputRate', () => {
    const invalid = {
      ...validDefinition,
      anticheat: { ...validDefinition.anticheat, maxInputRate: -5 },
    };
    const result = parseGameDefinition(invalid);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/game-registry/game-definition.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the parser**

Create `apps/api/src/game-registry/game-definition.ts`:

```typescript
import { z } from 'zod';
import type { GameDefinition } from '@oghub/shared';

const inputDefinitionSchema = z.object({
  name: z.string().min(1).max(50),
  type: z.enum(['action', 'vector2', 'vector3', 'scalar', 'toggle']),
  metadata: z.record(z.string()).optional(),
});

const scoringDefinitionSchema = z.object({
  range: z.tuple([z.number().min(0), z.number().min(0)]).refine(
    ([min, max]) => max > min,
    'Score range max must be greater than min',
  ),
  method: z.enum(['accumulative', 'time_based', 'objective_based', 'custom']),
  components: z.array(z.object({
    name: z.string().min(1),
    weight: z.number().positive(),
  })).optional(),
});

const sessionRulesSchema = z.object({
  maxDuration: z.number().positive().max(3600),
  minDuration: z.number().min(1).max(3600),
  allowPause: z.boolean(),
  lives: z.number().int().positive().optional(),
}).refine(
  (s) => s.maxDuration > s.minDuration,
  'maxDuration must be greater than minDuration',
);

const anticheatConfigSchema = z.object({
  maxInputRate: z.number().positive().max(1000),
  minReactionTime: z.number().min(0).max(5000),
  maxScorePerSecond: z.number().positive(),
  customRules: z.array(z.object({
    name: z.string().min(1),
    condition: z.string().min(1),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
  })).optional(),
});

const validationConfigSchema = z.object({
  snapshotInterval: z.number().positive().max(60),
  requiredFields: z.array(z.string().min(1)).min(1),
});

const trustConfigSchema = z.object({
  tier: z.enum(['basic', 'standard', 'verified']),
  replayFormat: z.string().optional(),
  replaySimulator: z.string().optional(),
});

const gameDefinitionSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  engine: z.string().min(1).max(30),
  inputs: z.array(inputDefinitionSchema).min(1).max(50),
  scoring: scoringDefinitionSchema,
  session: sessionRulesSchema,
  anticheat: anticheatConfigSchema,
  trust: trustConfigSchema,
  validation: validationConfigSchema.optional(),
}).superRefine((data, ctx) => {
  // Standard and verified tiers require validation config
  if (data.trust.tier !== 'basic' && !data.validation) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Trust tier '${data.trust.tier}' requires validation config`,
      path: ['validation'],
    });
  }
  // Basic tier should NOT have validation config
  if (data.trust.tier === 'basic' && data.validation) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Basic tier does not support live validation',
      path: ['validation'],
    });
  }
  // Verified tier requires replay simulator
  if (data.trust.tier === 'verified' && !data.trust.replaySimulator) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Verified tier requires replay_simulator',
      path: ['trust', 'replaySimulator'],
    });
  }
});

export type ParseResult =
  | { success: true; data: GameDefinition }
  | { success: false; errors: string[] };

export function parseGameDefinition(input: unknown): ParseResult {
  const result = gameDefinitionSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data as GameDefinition };
  }
  return {
    success: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/game-registry/game-definition.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/game-registry/
git commit -m "feat: add GameDefinition Zod schema and parser with tests"
```

---

## Task 4: Game Registry Router

**Files:**
- Create: `apps/api/src/game-registry/game-registry.router.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Write the router**

Create `apps/api/src/game-registry/game-registry.router.ts`:

```typescript
import { Router } from 'express';
import { prisma } from '../main';
import { authGuard, AuthenticatedRequest, roleGuard } from '../common/auth';
import { AppError } from '../common/error-handler';
import { parseGameDefinition } from './game-definition';
import type { TrustTier } from '@oghub/shared';
import { TRUST_TIER_LIMITS } from '@oghub/shared';

export const gameRegistryRouter = Router();

// ─── Register / Update Game Definition ─────────────────────

gameRegistryRouter.put(
  '/:slug/definition',
  authGuard,
  roleGuard('DEVELOPER', 'ADMIN'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { slug } = req.params;

      // Verify game exists and user owns it
      const game = await prisma.game.findUnique({
        where: { slug },
        include: { developer: true },
      });
      if (!game) throw new AppError('Game not found', 404);
      if (game.developer.ownerId !== req.user!.userId) {
        throw new AppError('You do not own this game', 403);
      }

      // Parse and validate game definition
      const parsed = parseGameDefinition({ ...req.body, slug, name: game.title });
      if (!parsed.success) {
        throw new AppError(`Invalid game definition: ${parsed.errors.join('; ')}`, 400);
      }

      const definition = parsed.data;

      // Check trust tier prize pool compatibility with existing challenges
      const tierLimit = TRUST_TIER_LIMITS[definition.trust.tier as TrustTier];
      if (tierLimit.maxPrizePool !== Infinity) {
        const activeChallenges = await prisma.challenge.findMany({
          where: { gameId: game.id, status: 'ACTIVE' },
          select: { prizePool: true, title: true },
        });
        const exceeding = activeChallenges.filter(
          c => Number(c.prizePool) > tierLimit.maxPrizePool,
        );
        if (exceeding.length > 0) {
          throw new AppError(
            `Trust tier '${definition.trust.tier}' limits prize pools to $${tierLimit.maxPrizePool}. ` +
            `${exceeding.length} active challenge(s) exceed this limit.`,
            409,
          );
        }
      }

      // Upsert definition
      await prisma.$transaction([
        prisma.gameDefinition.upsert({
          where: { gameId: game.id },
          create: {
            gameId: game.id,
            version: definition.version,
            definition: definition as any,
          },
          update: {
            version: definition.version,
            definition: definition as any,
          },
        }),
        prisma.game.update({
          where: { id: game.id },
          data: { trustTier: definition.trust.tier },
        }),
      ]);

      res.json({
        success: true,
        data: {
          slug: definition.slug,
          version: definition.version,
          trustTier: definition.trust.tier,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Get Game Definition ───────────────────────────────────

gameRegistryRouter.get(
  '/:slug/definition',
  async (req, res, next) => {
    try {
      const game = await prisma.game.findUnique({
        where: { slug: req.params.slug },
        include: { definition: true },
      });
      if (!game) throw new AppError('Game not found', 404);
      if (!game.definition) throw new AppError('Game has no definition', 404);

      res.json({
        success: true,
        data: game.definition.definition,
      });
    } catch (err) {
      next(err);
    }
  },
);
```

- [ ] **Step 2: Mount the router in main.ts**

In `apps/api/src/main.ts`, add the import after line 17 (ghostsRouter import):

```typescript
import { gameRegistryRouter } from './game-registry/game-registry.router';
```

After line 86 (`app.use('/api/ghosts', ghostsRouter);`), add:

```typescript
app.use('/api/games', gameRegistryRouter);
```

- [ ] **Step 3: Verify build**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/game-registry/game-registry.router.ts apps/api/src/main.ts
git commit -m "feat: add game registry router for game definition management"
```

---

## Task 5: Generic Fraud Engine

**Files:**
- Create: `apps/api/src/anticheat/generic-fraud-engine.ts`
- Create: `apps/api/src/anticheat/generic-fraud-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/anticheat/generic-fraud-engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateSessionGeneric } from './generic-fraud-engine';
import type { GameDefinition } from '@oghub/shared';

const shooterDefinition: GameDefinition = {
  name: 'Space Blaster',
  slug: 'space-blaster',
  version: '1.0.0',
  engine: 'unity',
  inputs: [
    { name: 'shoot', type: 'action' },
    { name: 'move', type: 'vector2' },
  ],
  scoring: { range: [0, 999999], method: 'accumulative' },
  session: { maxDuration: 300, minDuration: 10, allowPause: false },
  anticheat: { maxInputRate: 30, minReactionTime: 50, maxScorePerSecond: 5000 },
  trust: { tier: 'standard' },
  validation: { snapshotInterval: 5, requiredFields: ['hp', 'score'] },
};

describe('Generic Fraud Engine — Layer 1: Universal', () => {
  it('rejects score below range', async () => {
    const result = await validateSessionGeneric(
      { id: 's1', seed: 'abc', startedAt: new Date(Date.now() - 15000), gameId: 'g1' },
      -1,
      null,
      'u1',
      shooterDefinition,
    );
    expect(result.flags.some(f => f.code === 'SCORE_BELOW_RANGE')).toBe(true);
  });

  it('rejects score above range', async () => {
    const result = await validateSessionGeneric(
      { id: 's1', seed: 'abc', startedAt: new Date(Date.now() - 15000), gameId: 'g1' },
      1_000_001,
      null,
      'u1',
      shooterDefinition,
    );
    expect(result.flags.some(f => f.code === 'SCORE_ABOVE_RANGE')).toBe(true);
  });

  it('rejects session shorter than minDuration', async () => {
    const result = await validateSessionGeneric(
      { id: 's1', seed: 'abc', startedAt: new Date(Date.now() - 3000), gameId: 'g1' },
      100,
      null,
      'u1',
      shooterDefinition,
    );
    expect(result.flags.some(f => f.code === 'SESSION_TOO_SHORT')).toBe(true);
  });

  it('rejects session longer than maxDuration', async () => {
    const result = await validateSessionGeneric(
      { id: 's1', seed: 'abc', startedAt: new Date(Date.now() - 400000), gameId: 'g1' },
      100,
      null,
      'u1',
      shooterDefinition,
    );
    expect(result.flags.some(f => f.code === 'SESSION_TOO_LONG')).toBe(true);
  });
});

describe('Generic Fraud Engine — Layer 2: Game-Configured', () => {
  it('flags input rate exceeding game limit', async () => {
    // 100 inputs in 2 seconds = 50/s, limit is 30/s
    const timeline = Array.from({ length: 100 }, (_, i) => ({
      timestamp: i * 20,
      type: 'shoot',
      data: {},
      sequence: i,
    }));
    const replay = { seed: 'abc', inputTimeline: timeline, duration: 2000 };

    const result = await validateSessionGeneric(
      { id: 's1', seed: 'abc', startedAt: new Date(Date.now() - 15000), gameId: 'g1' },
      100,
      replay,
      'u1',
      shooterDefinition,
    );
    expect(result.flags.some(f => f.code === 'EXCESSIVE_INPUT_RATE')).toBe(true);
  });

  it('flags score per second exceeding game limit', async () => {
    // Score 100000 in 5 seconds = 20000/s, limit is 5000/s
    const result = await validateSessionGeneric(
      { id: 's1', seed: 'abc', startedAt: new Date(Date.now() - 5000), gameId: 'g1' },
      100000,
      null,
      'u1',
      shooterDefinition,
    );
    expect(result.flags.some(f => f.code === 'SCORE_RATE_TOO_HIGH')).toBe(true);
  });
});

describe('Generic Fraud Engine — Layer 3: Behavioral', () => {
  it('flags robotic timing', async () => {
    const timeline = Array.from({ length: 40 }, (_, i) => ({
      timestamp: i * 100, // exactly 100ms apart
      type: 'shoot',
      data: {},
      sequence: i,
    }));
    const replay = { seed: 'abc', inputTimeline: timeline, duration: 4000 };

    const result = await validateSessionGeneric(
      { id: 's1', seed: 'abc', startedAt: new Date(Date.now() - 15000), gameId: 'g1' },
      100,
      replay,
      'u1',
      shooterDefinition,
    );
    expect(result.flags.some(f => f.code === 'ROBOTIC_TIMING')).toBe(true);
  });

  it('accepts human-like timing', async () => {
    const timestamps = [0, 230, 510, 680, 1100, 1250, 1600, 1850, 2300, 2450, 2900, 3100];
    const timeline = timestamps.map((ts, i) => ({
      timestamp: ts, type: 'shoot', data: {}, sequence: i,
    }));
    const replay = { seed: 'abc', inputTimeline: timeline, duration: 3100 };

    const result = await validateSessionGeneric(
      { id: 's1', seed: 'abc', startedAt: new Date(Date.now() - 15000), gameId: 'g1' },
      100,
      replay,
      'u1',
      shooterDefinition,
    );
    expect(result.flags.some(f => f.code === 'ROBOTIC_TIMING')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/anticheat/generic-fraud-engine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the generic fraud engine**

Create `apps/api/src/anticheat/generic-fraud-engine.ts`:

```typescript
/**
 * Generic Fraud Engine
 *
 * Loads validation rules from GameDefinition instead of hardcoded values.
 * 5 layers, activated by Trust Tier:
 *   Layer 1: Universal (always) — score range, duration, replay integrity
 *   Layer 2: Game-Configured (always) — input rate, reaction time, custom rules
 *   Layer 3: Behavioral (always) — timing patterns, robotic detection
 *   Layer 4: Live Validation (standard+) — state snapshots, hash chain
 *   Layer 5: Replay Simulation (verified) — full re-execution
 */

import crypto from 'crypto';
import { prisma, redis } from '../main';
import type { GameDefinition } from '@oghub/shared';

// ─── Types ─────────────────────────────────────────────────

export interface FraudCheckResult {
  isValid: boolean;
  fraudScore: number;
  flags: FraudFlag[];
  action: 'ACCEPT' | 'FLAG' | 'REJECT' | 'BAN';
}

export interface FraudFlag {
  code: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  data?: Record<string, unknown>;
}

// ─── Constants ─────────────────────────────────────────────

const FLAG_THRESHOLD = 50;
const AUTO_REJECT_THRESHOLD = 80;
const BAN_THRESHOLD = 200;
const MAX_SESSIONS_PER_HOUR = 30;
const COOLDOWN_BETWEEN_SESSIONS_MS = 5000;
const MAX_SESSIONS_PER_USER_PER_CHALLENGE = 50;

// ─── Main Entry Point ──────────────────────────────────────

export async function validateSessionGeneric(
  session: { id: string; seed: string; startedAt: Date | null; gameId: string },
  score: number,
  replayData: any,
  userId: string,
  definition: GameDefinition,
): Promise<FraudCheckResult> {
  const flags: FraudFlag[] = [];
  let fraudScore = 0;

  // Layer 1: Universal
  const l1 = validateUniversal(session, score, replayData, definition);
  flags.push(...l1);
  fraudScore += l1.reduce((s, f) => s + severityScore(f.severity), 0);

  // Layer 2: Game-Configured
  const l2 = validateGameConfigured(session, score, replayData, definition);
  flags.push(...l2);
  fraudScore += l2.reduce((s, f) => s + severityScore(f.severity), 0);

  // Layer 3: Behavioral
  if (replayData?.inputTimeline?.length > 1) {
    const l3 = analyzeBehavior(replayData, definition);
    flags.push(...l3);
    fraudScore += l3.reduce((s, f) => s + severityScore(f.severity), 0);
  }

  // Layer 4: Statistical (uses DB)
  const l4 = await detectStatisticalAnomalies(session, score, userId);
  flags.push(...l4);
  fraudScore += l4.reduce((s, f) => s + severityScore(f.severity), 0);

  // Layer 5: Rate limiting
  const l5 = await checkRateLimits(userId, session.gameId);
  flags.push(...l5);
  fraudScore += l5.reduce((s, f) => s + severityScore(f.severity), 0);

  // Determine action
  let action: FraudCheckResult['action'] = 'ACCEPT';
  if (fraudScore >= AUTO_REJECT_THRESHOLD) action = 'REJECT';
  else if (fraudScore >= FLAG_THRESHOLD) action = 'FLAG';

  const cumulative = await updateCumulativeFraudScore(userId, fraudScore);
  if (cumulative >= BAN_THRESHOLD) action = 'BAN';

  await storeFraudReport(session.id, userId, { fraudScore, flags, action });

  return {
    isValid: action === 'ACCEPT' || action === 'FLAG',
    fraudScore,
    flags,
    action,
  };
}

// ─── Layer 1: Universal ────────────────────────────────────

function validateUniversal(
  session: { seed: string; startedAt: Date | null },
  score: number,
  replayData: any,
  def: GameDefinition,
): FraudFlag[] {
  const flags: FraudFlag[] = [];
  const [minScore, maxScore] = def.scoring.range;

  if (score < minScore) {
    flags.push({ code: 'SCORE_BELOW_RANGE', severity: 'CRITICAL', message: `Score ${score} below minimum ${minScore}` });
  }
  if (score > maxScore) {
    flags.push({ code: 'SCORE_ABOVE_RANGE', severity: 'CRITICAL', message: `Score ${score} above maximum ${maxScore}` });
  }

  if (session.startedAt) {
    const durationSec = (Date.now() - new Date(session.startedAt).getTime()) / 1000;
    if (durationSec < def.session.minDuration) {
      flags.push({
        code: 'SESSION_TOO_SHORT', severity: 'HIGH',
        message: `Session ${durationSec.toFixed(1)}s shorter than minimum ${def.session.minDuration}s`,
      });
    }
    if (durationSec > def.session.maxDuration * 1.1) { // 10% grace
      flags.push({
        code: 'SESSION_TOO_LONG', severity: 'MEDIUM',
        message: `Session ${durationSec.toFixed(1)}s exceeds maximum ${def.session.maxDuration}s`,
      });
    }
  }

  // Replay integrity
  if (replayData) {
    if (replayData.seed && replayData.seed !== session.seed) {
      flags.push({ code: 'SEED_MISMATCH', severity: 'CRITICAL', message: 'Replay seed does not match session seed' });
    }
    if (replayData.inputTimeline) {
      const expectedChecksum = crypto
        .createHash('sha256')
        .update(JSON.stringify(replayData.inputTimeline))
        .digest('hex');
      if (replayData.checksum && replayData.checksum !== expectedChecksum) {
        flags.push({ code: 'REPLAY_TAMPERED', severity: 'CRITICAL', message: 'Replay checksum mismatch' });
      }
    }
    if ((!replayData.inputTimeline || replayData.inputTimeline.length === 0) && score > 0) {
      flags.push({ code: 'EMPTY_REPLAY', severity: 'HIGH', message: 'Non-zero score with empty replay' });
    }
  } else if (score > 0) {
    flags.push({ code: 'MISSING_REPLAY', severity: 'HIGH', message: 'Non-zero score without replay data' });
  }

  return flags;
}

// ─── Layer 2: Game-Configured ──────────────────────────────

function validateGameConfigured(
  session: { startedAt: Date | null },
  score: number,
  replayData: any,
  def: GameDefinition,
): FraudFlag[] {
  const flags: FraudFlag[] = [];

  // Input rate check
  if (replayData?.inputTimeline?.length > 0 && replayData.duration > 0) {
    const avgRate = replayData.inputTimeline.length / (replayData.duration / 1000);
    if (avgRate > def.anticheat.maxInputRate) {
      flags.push({
        code: 'EXCESSIVE_INPUT_RATE', severity: 'HIGH',
        message: `Input rate ${avgRate.toFixed(1)}/s exceeds game limit ${def.anticheat.maxInputRate}/s`,
        data: { avgRate, limit: def.anticheat.maxInputRate },
      });
    }
  }

  // Score rate check
  if (session.startedAt) {
    const durationSec = (Date.now() - new Date(session.startedAt).getTime()) / 1000;
    if (durationSec > 0) {
      const scoreRate = score / durationSec;
      if (scoreRate > def.anticheat.maxScorePerSecond) {
        flags.push({
          code: 'SCORE_RATE_TOO_HIGH', severity: 'HIGH',
          message: `Score rate ${scoreRate.toFixed(0)}/s exceeds game limit ${def.anticheat.maxScorePerSecond}/s`,
          data: { scoreRate, limit: def.anticheat.maxScorePerSecond },
        });
      }
    }
  }

  // Reaction time check
  if (replayData?.inputTimeline?.length > 1) {
    const timeline = replayData.inputTimeline;
    const intervals: number[] = [];
    for (let i = 1; i < timeline.length; i++) {
      intervals.push(timeline[i].timestamp - timeline[i - 1].timestamp);
    }
    const subHumanCount = intervals.filter((i: number) => i > 0 && i < def.anticheat.minReactionTime).length;
    const subHumanRatio = subHumanCount / intervals.length;
    if (subHumanRatio > 0.1) {
      flags.push({
        code: 'SUPERHUMAN_REACTIONS', severity: 'HIGH',
        message: `${(subHumanRatio * 100).toFixed(0)}% of inputs below ${def.anticheat.minReactionTime}ms reaction time`,
        data: { subHumanCount, total: intervals.length },
      });
    }
  }

  return flags;
}

// ─── Layer 3: Behavioral ───────────────────────────────────

function analyzeBehavior(replayData: any, def: GameDefinition): FraudFlag[] {
  const flags: FraudFlag[] = [];
  const timeline = replayData.inputTimeline;
  if (!timeline || timeline.length < 2) return flags;

  const intervals: number[] = [];
  for (let i = 1; i < timeline.length; i++) {
    intervals.push(timeline[i].timestamp - timeline[i - 1].timestamp);
  }

  // Robotic regularity
  if (intervals.length >= 10) {
    const mean = intervals.reduce((a: number, b: number) => a + b, 0) / intervals.length;
    const stdDev = Math.sqrt(
      intervals.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / intervals.length,
    );
    const cv = mean > 0 ? stdDev / mean : 0;

    if (cv < 0.05 && intervals.length > 20) {
      flags.push({
        code: 'ROBOTIC_TIMING', severity: 'CRITICAL',
        message: `Input timing CV=${cv.toFixed(3)} — extremely regular (bot-like)`,
        data: { cv, mean, stdDev, samples: intervals.length },
      });
    } else if (cv < 0.15 && intervals.length > 30) {
      flags.push({
        code: 'SUSPICIOUS_REGULARITY', severity: 'MEDIUM',
        message: `Input timing is unusually regular (CV=${cv.toFixed(3)})`,
      });
    }
  }

  // Burst detection (sliding 1s window)
  const maxBurst = def.anticheat.maxInputRate * 1.5; // 150% of rate = burst threshold
  for (let i = 0; i < timeline.length; i++) {
    const windowEnd = timeline[i].timestamp + 1000;
    let count = 0;
    for (let j = i; j < timeline.length && timeline[j].timestamp < windowEnd; j++) {
      count++;
    }
    if (count > maxBurst) {
      flags.push({
        code: 'INPUT_BURST', severity: 'MEDIUM',
        message: `${count} inputs in 1s window at t=${timeline[i].timestamp}ms`,
        data: { burstCount: count, timestamp: timeline[i].timestamp },
      });
      break;
    }
  }

  return flags;
}

// ─── Layer 4: Statistical ──────────────────────────────────

async function detectStatisticalAnomalies(
  session: { gameId: string },
  score: number,
  userId: string,
): Promise<FraudFlag[]> {
  const flags: FraudFlag[] = [];

  const userScores = await prisma.score.findMany({
    where: { userId, session: { gameId: session.gameId }, isValidated: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { value: true },
  });

  if (userScores.length >= 10) {
    const values = userScores.map(s => s.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);

    if (stdDev > 0) {
      const zScore = (score - mean) / stdDev;
      if (zScore > 4.0) {
        flags.push({
          code: 'SCORE_STATISTICAL_OUTLIER', severity: 'HIGH',
          message: `Score is ${zScore.toFixed(1)}σ above user's mean`,
          data: { zScore, mean: Math.round(mean), stdDev: Math.round(stdDev) },
        });
      }
    }

    const previousBest = Math.max(...values);
    if (previousBest > 0 && score / previousBest > 3.0) {
      flags.push({
        code: 'IMPOSSIBLE_IMPROVEMENT', severity: 'HIGH',
        message: `Score ${score} is ${(score / previousBest).toFixed(1)}x previous best (${previousBest})`,
      });
    }
  }

  return flags;
}

// ─── Layer 5: Rate Limiting ────────────────────────────────

async function checkRateLimits(userId: string, gameId: string): Promise<FraudFlag[]> {
  const flags: FraudFlag[] = [];
  const now = Date.now();

  const hourKey = `rate:sessions:${userId}:${Math.floor(now / 3600000)}`;
  const sessionsThisHour = await redis.incr(hourKey);
  await redis.expire(hourKey, 3600);

  if (sessionsThisHour > MAX_SESSIONS_PER_HOUR) {
    flags.push({
      code: 'RATE_LIMIT_HOURLY', severity: 'MEDIUM',
      message: `${sessionsThisHour} sessions this hour (limit: ${MAX_SESSIONS_PER_HOUR})`,
    });
  }

  const lastKey = `last_session:${userId}:${gameId}`;
  const last = await redis.get(lastKey);
  if (last) {
    const elapsed = now - parseInt(last, 10);
    if (elapsed < COOLDOWN_BETWEEN_SESSIONS_MS) {
      flags.push({
        code: 'COOLDOWN_VIOLATION', severity: 'LOW',
        message: `Only ${elapsed}ms since last session (minimum: ${COOLDOWN_BETWEEN_SESSIONS_MS}ms)`,
      });
    }
  }
  await redis.set(lastKey, now.toString(), 'EX', 60);

  return flags;
}

// ─── Helpers ───────────────────────────────────────────────

function severityScore(severity: FraudFlag['severity']): number {
  switch (severity) {
    case 'LOW': return 5;
    case 'MEDIUM': return 15;
    case 'HIGH': return 30;
    case 'CRITICAL': return 50;
  }
}

async function updateCumulativeFraudScore(userId: string, score: number): Promise<number> {
  const key = `fraud_cumulative:${userId}`;
  const current = await redis.get(key);
  const cumulative = (current ? parseInt(current, 10) : 0) + score;
  const decayed = Math.max(0, Math.floor(cumulative * 0.9));
  await redis.set(key, decayed.toString(), 'EX', 86400 * 30);
  return decayed;
}

async function storeFraudReport(
  sessionId: string,
  userId: string,
  report: { fraudScore: number; flags: FraudFlag[]; action: string },
): Promise<void> {
  await redis.set(
    `fraud_report:${sessionId}`,
    JSON.stringify({ ...report, userId, timestamp: Date.now() }),
    'EX', 86400 * 7,
  );
  if (report.action !== 'ACCEPT') {
    await redis.lpush('fraud:review_queue', JSON.stringify({
      sessionId, userId, action: report.action, fraudScore: report.fraudScore,
      topFlags: report.flags.slice(0, 5).map(f => f.code),
      timestamp: Date.now(),
    }));
    await redis.ltrim('fraud:review_queue', 0, 9999);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx vitest run src/anticheat/generic-fraud-engine.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/anticheat/generic-fraud-engine.ts apps/api/src/anticheat/generic-fraud-engine.test.ts
git commit -m "feat: add generic fraud engine with game-definition-driven validation rules"
```

---

## Task 6: Wire Sessions Router to Generic Fraud Engine

**Files:**
- Modify: `apps/api/src/sessions/sessions.router.ts`

- [ ] **Step 1: Update session end endpoint to load game definition and use generic fraud engine**

In `apps/api/src/sessions/sessions.router.ts`, replace the import of `validateSession` (line 9):

```typescript
import { validateSessionGeneric } from '../anticheat/generic-fraud-engine';
```

In the `/:id/end` handler (around line 264), replace the fraud validation call. The current code is:

```typescript
    const fraudResult = await validateSession(session, score, replayData, req.user!.userId);
```

Replace with:

```typescript
    // Load game definition for fraud engine
    const gameDef = await prisma.gameDefinition.findUnique({
      where: { gameId: session.gameId },
    });

    let fraudResult;
    if (gameDef) {
      // Use generic fraud engine with game-specific rules
      fraudResult = await validateSessionGeneric(
        session, score, replayData, req.user!.userId,
        gameDef.definition as any,
      );
    } else {
      // Fallback to legacy fraud engine for games without definitions
      const { validateSession } = await import('../anticheat/fraud-engine');
      fraudResult = await validateSession(session, score, replayData, req.user!.userId);
    }
```

- [ ] **Step 2: Verify build**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run all existing tests to ensure no regression**

Run: `cd apps/api && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/sessions/sessions.router.ts
git commit -m "feat: wire sessions router to generic fraud engine with game definition fallback"
```

---

## Task 7: WebSocket Live Validation Server

**Files:**
- Create: `apps/api/src/live-validation/live-validator.ts`

- [ ] **Step 1: Install ws dependency**

Run: `cd apps/api && npm install ws && npm install -D @types/ws`

- [ ] **Step 2: Write the WebSocket server**

Create `apps/api/src/live-validation/live-validator.ts`:

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { prisma, redis } from '../main';
import type { GameDefinition, ValidationRequest, StateSnapshot } from '@oghub/shared';

interface LiveSession {
  ws: WebSocket;
  sessionId: string;
  userId: string;
  definition: GameDefinition;
  scoreHashChain: string[];
  lastScore: number;
  anomalyCount: number;
  validationInterval: ReturnType<typeof setInterval> | null;
  pendingValidation: string | null; // requestId awaiting response
  pendingTimeout: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, LiveSession>();

export function attachLiveValidator(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/api/sessions/live' });

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');
    const token = url.searchParams.get('token');

    if (!sessionId || !token) {
      ws.close(4001, 'Missing sessionId or token');
      return;
    }

    // Validate session
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { game: { include: { definition: true } } },
    });

    if (!session || session.token !== token) {
      ws.close(4003, 'Invalid session');
      return;
    }

    if (!session.game.definition) {
      ws.close(4004, 'Game has no definition');
      return;
    }

    const definition = session.game.definition.definition as unknown as GameDefinition;

    // Only standard+ tiers use live validation
    if (definition.trust.tier === 'basic') {
      ws.close(4005, 'Basic tier does not support live validation');
      return;
    }

    const liveSession: LiveSession = {
      ws,
      sessionId,
      userId: session.userId,
      definition,
      scoreHashChain: [],
      lastScore: 0,
      anomalyCount: 0,
      validationInterval: null,
      pendingValidation: null,
      pendingTimeout: null,
    };

    sessions.set(sessionId, liveSession);

    // Start periodic validation requests
    const intervalMs = (definition.validation?.snapshotInterval ?? 5) * 1000;
    liveSession.validationInterval = setInterval(() => {
      sendValidationRequest(liveSession);
    }, intervalMs);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(liveSession, msg);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      cleanup(sessionId);
    });

    ws.on('error', () => {
      cleanup(sessionId);
    });

    // Send connected acknowledgment
    ws.send(JSON.stringify({ type: 'connected', sessionId }));
  });
}

function sendValidationRequest(session: LiveSession): void {
  if (session.ws.readyState !== WebSocket.OPEN) return;
  if (session.pendingValidation) {
    // Previous validation timed out — count as anomaly
    session.anomalyCount++;
    if (session.anomalyCount >= 3) {
      flagSession(session.sessionId, 'validation_timeout');
    }
  }

  const requestId = `vr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const request: ValidationRequest = {
    type: 'validation_request',
    requestId,
    timestamp: Date.now(),
  };

  session.pendingValidation = requestId;
  session.ws.send(JSON.stringify(request));

  // Timeout: 5 seconds to respond
  session.pendingTimeout = setTimeout(() => {
    if (session.pendingValidation === requestId) {
      session.anomalyCount++;
      session.pendingValidation = null;
      if (session.anomalyCount >= 3) {
        flagSession(session.sessionId, 'validation_timeout');
      }
    }
  }, 5000);
}

function handleMessage(session: LiveSession, msg: any): void {
  switch (msg.type) {
    case 'validation_response':
      handleValidationResponse(session, msg);
      break;
    case 'score_update':
      handleScoreUpdate(session, msg);
      break;
    case 'input':
      // Inputs are also sent via HTTP; WebSocket is supplementary
      break;
  }
}

function handleValidationResponse(session: LiveSession, msg: any): void {
  if (msg.requestId !== session.pendingValidation) return;

  session.pendingValidation = null;
  if (session.pendingTimeout) {
    clearTimeout(session.pendingTimeout);
    session.pendingTimeout = null;
  }

  const state: StateSnapshot = msg.state;
  if (!state) {
    session.anomalyCount++;
    return;
  }

  // Validate required fields are present
  const required = session.definition.validation?.requiredFields ?? [];
  const missing = required.filter(f => !(f in state));
  if (missing.length > 0) {
    session.anomalyCount++;
    if (session.anomalyCount >= 2) {
      flagSession(session.sessionId, `missing_fields:${missing.join(',')}`);
    }
    return;
  }

  // Cross-check score consistency
  const reportedScore = typeof state.current_score === 'number' ? state.current_score : null;
  if (reportedScore !== null && session.lastScore > 0) {
    // Score should not decrease for accumulative scoring
    if (session.definition.scoring.method === 'accumulative' && reportedScore < session.lastScore * 0.9) {
      session.anomalyCount++;
      flagSession(session.sessionId, `score_decreased:${reportedScore}<${session.lastScore}`);
    }
  }
}

function handleScoreUpdate(session: LiveSession, msg: any): void {
  const { score, hash, sequence } = msg;
  if (typeof score !== 'number' || typeof hash !== 'string') return;

  // Verify hash chain
  const expectedPayload = session.scoreHashChain.length > 0
    ? `${session.scoreHashChain[session.scoreHashChain.length - 1]}:${score}:${sequence}`
    : `${session.sessionId}:${score}:${sequence}`;

  const expectedHash = require('crypto')
    .createHash('sha256')
    .update(expectedPayload)
    .digest('hex');

  if (hash !== expectedHash) {
    session.anomalyCount += 2; // Hash chain break is serious
    flagSession(session.sessionId, 'hash_chain_broken');
  }

  session.scoreHashChain.push(hash);
  session.lastScore = score;
}

async function flagSession(sessionId: string, reason: string): Promise<void> {
  // Silent flag — store in Redis, don't tell the client
  await redis.set(
    `live_flag:${sessionId}`,
    JSON.stringify({ reason, timestamp: Date.now() }),
    'EX', 86400,
  );

  // Increase validation frequency for flagged sessions
  const session = sessions.get(sessionId);
  if (session && session.validationInterval) {
    clearInterval(session.validationInterval);
    // Double the check frequency
    const newInterval = ((session.definition.validation?.snapshotInterval ?? 5) * 1000) / 2;
    session.validationInterval = setInterval(() => {
      sendValidationRequest(session);
    }, newInterval);
  }
}

function cleanup(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    if (session.validationInterval) clearInterval(session.validationInterval);
    if (session.pendingTimeout) clearTimeout(session.pendingTimeout);
    sessions.delete(sessionId);
  }
}

// Exported for session end handler to check live flags
export async function getLiveValidationFlags(sessionId: string): Promise<string | null> {
  return redis.get(`live_flag:${sessionId}`);
}
```

- [ ] **Step 3: Mount WebSocket server in main.ts**

In `apps/api/src/main.ts`, add import after the other imports:

```typescript
import { attachLiveValidator } from './live-validation/live-validator';
```

Replace line 96-97 (the `app.listen` block):

```typescript
const server = app.listen(PORT, () => {
  console.log(`🚀 OGHUB API running on http://localhost:${PORT}`);

  // Start event pipeline drain worker
  startEventDrainWorker(process.env.WORKER_NAME || 'worker-1').catch((err) => {
    console.error('Failed to start event drain worker:', err);
  });

  // Start challenge lifecycle worker
  startChallengeLifecycleWorker();
});

// Attach WebSocket live validation server
attachLiveValidator(server);
```

- [ ] **Step 4: Verify build**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/live-validation/ apps/api/src/main.ts
git commit -m "feat: add WebSocket live validation server with state snapshots and silent flagging"
```

---

## Task 8: SDK Core Package

**Files:**
- Create: `packages/sdk-core/package.json`
- Create: `packages/sdk-core/tsconfig.json`
- Create: `packages/sdk-core/src/types.ts`
- Create: `packages/sdk-core/src/integrity.ts`
- Create: `packages/sdk-core/src/session.ts`
- Create: `packages/sdk-core/src/events.ts`
- Create: `packages/sdk-core/src/websocket.ts`
- Create: `packages/sdk-core/src/replay.ts`
- Create: `packages/sdk-core/src/client.ts`
- Create: `packages/sdk-core/src/index.ts`

- [ ] **Step 1: Create package.json**

Create `packages/sdk-core/package.json`:

```json
{
  "name": "@oghub/sdk-core",
  "version": "2.0.0",
  "description": "OGHub SDK Core — generic game platform integration",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@oghub/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/sdk-core/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create types.ts**

Create `packages/sdk-core/src/types.ts`:

```typescript
export interface SDKInitConfig {
  apiKey: string;
  apiSecret: string;
  gameSlug: string;
  apiUrl: string;
  environment?: 'production' | 'sandbox';
}

export interface CreateSessionOptions {
  challengeId?: string;
  metadata?: Record<string, unknown>;
}

export interface Session {
  id: string;
  token: string;
  seed: string;
  config: Record<string, unknown>;
  ghostData?: GhostReplay | null;
}

export interface SessionResult {
  accepted: boolean;
  score: number;
  rank?: number | null;
  nearMiss?: NearMissInfo | null;
  reason?: string;
}

export interface GameInput {
  name: string;
  data?: Record<string, unknown>;
}

export interface GameEvent {
  type: string;
  data?: Record<string, unknown>;
}

export interface GhostReplay {
  seed: string;
  inputTimeline: any[];
  duration: number;
  playerName: string;
  score: number;
}

export interface NearMissInfo {
  message: string;
  targetRank: number;
  targetScore: number;
  difference: number;
  percentile: number;
}

export interface StateSnapshot {
  [key: string]: unknown;
}

export type ValidationRequestHandler = () => StateSnapshot;
export type SessionKillHandler = (reason: string) => void;
export type LeaderboardUpdateHandler = (entries: any[]) => void;
```

- [ ] **Step 4: Create integrity.ts**

Create `packages/sdk-core/src/integrity.ts`:

```typescript
import crypto from 'crypto';

export class IntegrityGuard {
  private apiSecret: string;
  private scoreHashChain: string[] = [];
  private sessionId: string = '';

  constructor(apiSecret: string) {
    this.apiSecret = apiSecret;
  }

  setSessionId(id: string): void {
    this.sessionId = id;
    this.scoreHashChain = [];
  }

  sign(body: string): { signature: string; timestamp: string; nonce: string } {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const payload = `${timestamp}:${nonce}:${body}`;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(payload)
      .digest('hex');
    return { signature, timestamp, nonce };
  }

  computeScoreHash(score: number, sequence: number): string {
    const previousHash = this.scoreHashChain.length > 0
      ? this.scoreHashChain[this.scoreHashChain.length - 1]
      : this.sessionId;
    const payload = `${previousHash}:${score}:${sequence}`;
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    this.scoreHashChain.push(hash);
    return hash;
  }

  computeReplayChecksum(inputTimeline: any[]): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(inputTimeline))
      .digest('hex');
  }

  reset(): void {
    this.scoreHashChain = [];
    this.sessionId = '';
  }
}
```

- [ ] **Step 5: Create events.ts**

Create `packages/sdk-core/src/events.ts`:

```typescript
import type { GameInput, GameEvent } from './types';

interface RecordedInput {
  name: string;
  data?: Record<string, unknown>;
  timestamp: number;
  sequence: number;
}

interface BufferedEvent {
  eventType: string;
  payload: Record<string, unknown>;
  timestamp: number;
  sequence: number;
}

export class EventReporter {
  private eventBuffer: BufferedEvent[] = [];
  private inputTimeline: RecordedInput[] = [];
  private sequenceCounter = 0;
  private startTime = 0;
  private flushCallback: ((events: BufferedEvent[]) => Promise<void>) | null = null;
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  start(flushCallback: (events: BufferedEvent[]) => Promise<void>): void {
    this.startTime = Date.now();
    this.sequenceCounter = 0;
    this.inputTimeline = [];
    this.eventBuffer = [];
    this.flushCallback = flushCallback;

    this.flushInterval = setInterval(() => {
      this.flush();
    }, 2000);
  }

  recordInput(input: GameInput): void {
    const seq = this.sequenceCounter++;
    const timestamp = Date.now() - this.startTime;

    this.inputTimeline.push({
      name: input.name,
      data: input.data,
      timestamp,
      sequence: seq,
    });

    this.eventBuffer.push({
      eventType: `input:${input.name}`,
      payload: input.data ?? {},
      timestamp: Date.now(),
      sequence: seq,
    });

    if (this.eventBuffer.length >= 50) {
      this.flush();
    }
  }

  recordEvent(event: GameEvent): void {
    this.eventBuffer.push({
      eventType: event.type,
      payload: event.data ?? {},
      timestamp: Date.now(),
      sequence: this.sequenceCounter++,
    });
  }

  async flush(): Promise<void> {
    if (this.eventBuffer.length === 0 || !this.flushCallback) return;
    const events = [...this.eventBuffer];
    this.eventBuffer = [];
    try {
      await this.flushCallback(events);
    } catch {
      this.eventBuffer = [...events, ...this.eventBuffer];
    }
  }

  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  getInputTimeline(): RecordedInput[] {
    return [...this.inputTimeline];
  }

  getDuration(): number {
    return Date.now() - this.startTime;
  }

  reset(): void {
    this.stop();
    this.eventBuffer = [];
    this.inputTimeline = [];
    this.sequenceCounter = 0;
    this.startTime = 0;
    this.flushCallback = null;
  }
}
```

- [ ] **Step 6: Create websocket.ts**

Create `packages/sdk-core/src/websocket.ts`:

```typescript
import type { StateSnapshot, ValidationRequestHandler, LeaderboardUpdateHandler } from './types';

type MessageHandler = (msg: any) => void;

export class SDKWebSocket {
  private ws: WebSocket | null = null;
  private url: string = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private validationHandler: ValidationRequestHandler | null = null;
  private leaderboardHandler: LeaderboardUpdateHandler | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private sendQueue: string[] = [];

  connect(wsUrl: string, sessionId: string, token: string): void {
    this.url = `${wsUrl}?sessionId=${sessionId}&token=${token}`;
    this.doConnect();
  }

  private doConnect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      // Flush queued messages
      for (const msg of this.sendQueue) {
        this.ws!.send(msg);
      }
      this.sendQueue = [];
      // Start heartbeat
      this.heartbeatInterval = setInterval(() => {
        this.send({ type: 'heartbeat', timestamp: Date.now() });
      }, 15000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        this.handleMessage(msg);
      } catch {
        // Ignore malformed
      }
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.pow(2, this.reconnectAttempts) * 1000;
        setTimeout(() => this.doConnect(), delay);
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private handleMessage(msg: any): void {
    switch (msg.type) {
      case 'validation_request':
        if (this.validationHandler) {
          const state = this.validationHandler();
          this.send({
            type: 'validation_response',
            requestId: msg.requestId,
            state,
          });
        }
        break;
      case 'leaderboard_update':
        if (this.leaderboardHandler) {
          this.leaderboardHandler(msg.entries);
        }
        break;
    }
  }

  onValidationRequest(handler: ValidationRequestHandler): void {
    this.validationHandler = handler;
  }

  onLeaderboardUpdate(handler: LeaderboardUpdateHandler): void {
    this.leaderboardHandler = handler;
  }

  sendScoreUpdate(score: number, hash: string, sequence: number): void {
    this.send({ type: 'score_update', score, hash, sequence });
  }

  send(msg: any): void {
    const data = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      this.sendQueue.push(data);
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.maxReconnectAttempts = 0; // Prevent reconnect
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.sendQueue = [];
  }
}
```

- [ ] **Step 7: Create client.ts — the main SDK class**

Create `packages/sdk-core/src/client.ts`:

```typescript
import type {
  SDKInitConfig,
  CreateSessionOptions,
  Session,
  SessionResult,
  GameInput,
  GameEvent,
  GhostReplay,
  StateSnapshot,
  ValidationRequestHandler,
  LeaderboardUpdateHandler,
  SessionKillHandler,
} from './types';
import { IntegrityGuard } from './integrity';
import { EventReporter } from './events';
import { SDKWebSocket } from './websocket';

export class OGHubSDK {
  private config: SDKInitConfig | null = null;
  private integrity: IntegrityGuard | null = null;
  private events: EventReporter = new EventReporter();
  private websocket: SDKWebSocket = new SDKWebSocket();
  private session: Session | null = null;
  private scoreSequence = 0;
  private lastScore = 0;

  async init(config: SDKInitConfig): Promise<void> {
    this.config = config;
    this.integrity = new IntegrityGuard(config.apiSecret);
  }

  async createSession(options?: CreateSessionOptions): Promise<Session> {
    this.ensureInit();
    const response = await this.request('POST', '/api/sessions/create', {
      gameId: this.config!.gameSlug,
      challengeId: options?.challengeId,
    });

    this.session = {
      id: response.sessionId,
      token: response.token,
      seed: response.seed,
      config: response.modifiers ?? {},
      ghostData: null,
    };

    this.integrity!.setSessionId(this.session.id);

    // Validate session (fetches ghost data)
    const validateResponse = await this.request(
      'POST',
      `/api/sessions/${this.session.id}/validate`,
      {},
      this.session.token,
    );

    if (validateResponse.ghostData) {
      this.session.ghostData = validateResponse.ghostData;
    }

    // Connect WebSocket for live validation
    const wsUrl = this.config!.apiUrl.replace(/^http/, 'ws') + '/api/sessions/live';
    this.websocket.connect(wsUrl, this.session.id, this.session.token);

    return this.session;
  }

  startSession(): void {
    this.ensureSession();
    this.scoreSequence = 0;
    this.lastScore = 0;

    this.events.start(async (events) => {
      await this.request(
        'POST',
        `/api/sessions/${this.session!.id}/events`,
        { events },
        this.session!.token,
      );
    });
  }

  reportInput(input: GameInput): void {
    if (!this.session) return;
    this.events.recordInput(input);
  }

  reportEvent(event: GameEvent): void {
    if (!this.session) return;
    this.events.recordEvent(event);
  }

  updateScore(score: number): void {
    if (!this.session || !this.integrity) return;
    this.lastScore = score;
    const seq = this.scoreSequence++;
    const hash = this.integrity.computeScoreHash(score, seq);
    this.websocket.sendScoreUpdate(score, hash, seq);
  }

  updateState(state: Record<string, unknown>): void {
    // State is stored locally; sent when server requests validation
    // The validation handler reads this
  }

  onValidationRequest(handler: ValidationRequestHandler): void {
    this.websocket.onValidationRequest(handler);
  }

  onSessionKill(handler: SessionKillHandler): void {
    // Currently handled silently; hook provided for future use
  }

  onLeaderboardUpdate(handler: LeaderboardUpdateHandler): void {
    this.websocket.onLeaderboardUpdate(handler);
  }

  async getGhostData(challengeId: string): Promise<GhostReplay | null> {
    this.ensureInit();
    try {
      return await this.request('GET', `/api/ghosts/${challengeId}/top`);
    } catch {
      return null;
    }
  }

  async endSession(): Promise<SessionResult> {
    this.ensureSession();

    this.events.stop();
    await this.events.flush();

    const timeline = this.events.getInputTimeline();
    const duration = this.events.getDuration();
    const checksum = this.integrity!.computeReplayChecksum(timeline);

    const response = await this.request(
      'POST',
      `/api/sessions/${this.session!.id}/end`,
      {
        score: this.lastScore,
        replayData: {
          seed: this.session!.seed,
          inputTimeline: timeline,
          duration,
          checksum,
        },
      },
      this.session!.token,
    );

    this.websocket.disconnect();
    this.events.reset();
    this.integrity!.reset();
    this.session = null;

    return response as SessionResult;
  }

  // ─── Internal ──────────────────────────────────────────

  private ensureInit(): void {
    if (!this.config) throw new Error('SDK not initialized. Call init() first.');
  }

  private ensureSession(): void {
    if (!this.session) throw new Error('No active session. Call createSession() first.');
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    bearerToken?: string,
  ): Promise<any> {
    this.ensureInit();
    const url = `${this.config!.apiUrl}${path}`;
    const bodyStr = body ? JSON.stringify(body) : '{}';
    const { signature, timestamp, nonce } = this.integrity!.sign(bodyStr);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-oghub-api-key': this.config!.apiKey,
      'x-oghub-signature': signature,
      'x-oghub-timestamp': timestamp,
      'x-oghub-nonce': nonce,
      'x-oghub-sdk-version': '2.0.0',
    };

    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: method !== 'GET' ? bodyStr : undefined,
    });

    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json.error || `Request failed: ${response.status}`);
    }
    return json.data;
  }
}
```

- [ ] **Step 8: Create index.ts**

Create `packages/sdk-core/src/index.ts`:

```typescript
export { OGHubSDK } from './client';
export type {
  SDKInitConfig,
  CreateSessionOptions,
  Session,
  SessionResult,
  GameInput,
  GameEvent,
  GhostReplay,
  NearMissInfo,
  StateSnapshot,
  ValidationRequestHandler,
  SessionKillHandler,
  LeaderboardUpdateHandler,
} from './types';
```

- [ ] **Step 9: Install dependencies and verify build**

Run: `cd packages/sdk-core && npm install && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 10: Commit**

```bash
git add packages/sdk-core/
git commit -m "feat: add @oghub/sdk-core — generic protocol-based SDK with HMAC, hash chains, WebSocket, replay recording"
```

---

## Task 9: SDK Web Wrapper

**Files:**
- Create: `packages/sdk-web/package.json`
- Create: `packages/sdk-web/tsconfig.json`
- Create: `packages/sdk-web/src/index.ts`

- [ ] **Step 1: Create package.json**

Create `packages/sdk-web/package.json`:

```json
{
  "name": "@oghub/sdk",
  "version": "2.0.0",
  "description": "OGHub SDK for Web games",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@oghub/sdk-core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/sdk-web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020", "DOM"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create index.ts — thin web wrapper**

Create `packages/sdk-web/src/index.ts`:

```typescript
/**
 * @oghub/sdk — Web SDK for OGHub platform
 *
 * Thin wrapper around @oghub/sdk-core. Re-exports the core SDK
 * which uses browser-native fetch and WebSocket.
 *
 * Usage:
 *   import { OGHub } from '@oghub/sdk';
 *   const og = new OGHub({ apiKey, apiSecret, gameSlug, apiUrl });
 *   const session = await og.createSession({ challengeId });
 *   og.startSession();
 *   og.reportInput({ name: 'shoot', data: { weapon: 'laser' } });
 *   og.updateScore(1500);
 *   const result = await og.endSession();
 */

import { OGHubSDK } from '@oghub/sdk-core';
import type { SDKInitConfig } from '@oghub/sdk-core';

export class OGHub extends OGHubSDK {
  constructor(config: Omit<SDKInitConfig, 'apiUrl'> & { apiUrl?: string }) {
    super();
    this.init({
      apiUrl: config.apiUrl ?? 'https://api.oghub.gg',
      ...config,
    });
  }
}

// Re-export all types
export {
  OGHubSDK,
  type SDKInitConfig,
  type CreateSessionOptions,
  type Session,
  type SessionResult,
  type GameInput,
  type GameEvent,
  type GhostReplay,
  type NearMissInfo,
  type StateSnapshot,
  type ValidationRequestHandler,
  type SessionKillHandler,
  type LeaderboardUpdateHandler,
} from '@oghub/sdk-core';
```

- [ ] **Step 4: Install and verify**

Run: `cd packages/sdk-web && npm install && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/sdk-web/
git commit -m "feat: add @oghub/sdk web wrapper — thin re-export of sdk-core for browser"
```

---

## Task 10: SDK Unity Package

**Files:**
- Create: `packages/sdk-unity/package.json`
- Create: `packages/sdk-unity/Runtime/OGHub.asmdef`
- Create: `packages/sdk-unity/Runtime/OGHub.cs`
- Create: `packages/sdk-unity/Runtime/OGHubClient.cs`
- Create: `packages/sdk-unity/Runtime/OGHubIntegrity.cs`
- Create: `packages/sdk-unity/Runtime/OGHubWebSocket.cs`
- Create: `packages/sdk-unity/Runtime/OGHubStorage.cs`

- [ ] **Step 1: Create UPM package manifest**

Create `packages/sdk-unity/package.json`:

```json
{
  "name": "com.oghub.sdk",
  "version": "2.0.0",
  "displayName": "OGHub SDK",
  "description": "Generic OGHub platform SDK for Unity games",
  "unity": "2021.3",
  "keywords": ["oghub", "sdk", "gaming", "anticheat"],
  "author": {
    "name": "OGHub",
    "url": "https://oghub.gg"
  }
}
```

- [ ] **Step 2: Create assembly definition**

Create `packages/sdk-unity/Runtime/OGHub.asmdef`:

```json
{
  "name": "OGHub",
  "rootNamespace": "OGHub",
  "references": [],
  "includePlatforms": [],
  "excludePlatforms": [],
  "allowUnsafeCode": false,
  "overrideReferences": false,
  "precompiledReferences": [],
  "autoReferenced": true,
  "defineConstraints": [],
  "noEngineReferences": false
}
```

- [ ] **Step 3: Create OGHubIntegrity.cs — HMAC + hash chains**

Create `packages/sdk-unity/Runtime/OGHubIntegrity.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

namespace OGHub
{
    public sealed class OGHubIntegrity
    {
        private readonly string _apiSecret;
        private readonly List<string> _scoreHashChain = new();
        private string _sessionId = "";

        public OGHubIntegrity(string apiSecret)
        {
            _apiSecret = apiSecret;
        }

        public void SetSessionId(string id)
        {
            _sessionId = id;
            _scoreHashChain.Clear();
        }

        public (string signature, string timestamp, string nonce) Sign(string body)
        {
            string timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
            string nonce = Guid.NewGuid().ToString("N");
            string payload = $"{timestamp}:{nonce}:{body}";

            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_apiSecret));
            byte[] hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
            string signature = BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();

            return (signature, timestamp, nonce);
        }

        public string ComputeScoreHash(int score, int sequence)
        {
            string previous = _scoreHashChain.Count > 0
                ? _scoreHashChain[^1]
                : _sessionId;
            string payload = $"{previous}:{score}:{sequence}";

            using var sha = SHA256.Create();
            byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(payload));
            string hex = BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
            _scoreHashChain.Add(hex);
            return hex;
        }

        public string ComputeReplayChecksum(string inputTimelineJson)
        {
            using var sha = SHA256.Create();
            byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(inputTimelineJson));
            return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
        }

        public void Reset()
        {
            _scoreHashChain.Clear();
            _sessionId = "";
        }
    }
}
```

- [ ] **Step 4: Create OGHubStorage.cs — offline queue**

Create `packages/sdk-unity/Runtime/OGHubStorage.cs`:

```csharp
using UnityEngine;

namespace OGHub
{
    public static class OGHubStorage
    {
        private const string CacheSessionKey = "OGHub_CachedSessionId";
        private const string CacheBodyKey = "OGHub_CachedBody";

        public static void CacheSubmission(string sessionId, string body)
        {
            PlayerPrefs.SetString(CacheSessionKey, sessionId);
            PlayerPrefs.SetString(CacheBodyKey, body);
            PlayerPrefs.Save();
        }

        public static (string sessionId, string body)? GetCachedSubmission()
        {
            string sid = PlayerPrefs.GetString(CacheSessionKey, "");
            string body = PlayerPrefs.GetString(CacheBodyKey, "");
            if (string.IsNullOrEmpty(sid) || string.IsNullOrEmpty(body)) return null;
            return (sid, body);
        }

        public static void ClearCache()
        {
            PlayerPrefs.DeleteKey(CacheSessionKey);
            PlayerPrefs.DeleteKey(CacheBodyKey);
            PlayerPrefs.Save();
        }
    }
}
```

- [ ] **Step 5: Create OGHubWebSocket.cs**

Create `packages/sdk-unity/Runtime/OGHubWebSocket.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Net.WebSockets;
using UnityEngine;

namespace OGHub
{
    public sealed class OGHubWebSocket
    {
        private ClientWebSocket _ws;
        private CancellationTokenSource _cts;
        private readonly Queue<string> _sendQueue = new();
        private Func<Dictionary<string, object>> _validationHandler;
        private Action<string> _leaderboardHandler;
        private string _url;
        private int _reconnectAttempts;

        public async Task Connect(string wsUrl, string sessionId, string token)
        {
            _url = $"{wsUrl}?sessionId={sessionId}&token={token}";
            _cts = new CancellationTokenSource();
            await DoConnect();
        }

        private async Task DoConnect()
        {
            _ws = new ClientWebSocket();
            try
            {
                await _ws.ConnectAsync(new Uri(_url), _cts.Token);
                _reconnectAttempts = 0;
                // Flush queued messages
                while (_sendQueue.Count > 0)
                    await SendRaw(_sendQueue.Dequeue());
                _ = ReceiveLoop();
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[OGHub WS] Connect failed: {e.Message}");
                await TryReconnect();
            }
        }

        private async Task ReceiveLoop()
        {
            var buffer = new byte[4096];
            try
            {
                while (_ws.State == WebSocketState.Open && !_cts.IsCancellationRequested)
                {
                    var result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), _cts.Token);
                    if (result.MessageType == WebSocketMessageType.Close) break;

                    string msg = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    HandleMessage(msg);
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception e)
            {
                Debug.LogWarning($"[OGHub WS] Receive error: {e.Message}");
            }
            await TryReconnect();
        }

        private void HandleMessage(string raw)
        {
            try
            {
                // Simple JSON parsing for known message types
                if (raw.Contains("\"validation_request\"") && _validationHandler != null)
                {
                    var state = _validationHandler();
                    string requestId = ExtractField(raw, "requestId");
                    string response = $"{{\"type\":\"validation_response\",\"requestId\":\"{requestId}\",\"state\":{JsonUtility.ToJson(new JsonWrapper(state))}}}";
                    Send(response);
                }
                else if (raw.Contains("\"leaderboard_update\""))
                {
                    _leaderboardHandler?.Invoke(raw);
                }
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[OGHub WS] Message handling error: {e.Message}");
            }
        }

        public void OnValidationRequest(Func<Dictionary<string, object>> handler)
        {
            _validationHandler = handler;
        }

        public void OnLeaderboardUpdate(Action<string> handler)
        {
            _leaderboardHandler = handler;
        }

        public void SendScoreUpdate(int score, string hash, int sequence)
        {
            Send($"{{\"type\":\"score_update\",\"score\":{score},\"hash\":\"{hash}\",\"sequence\":{sequence}}}");
        }

        public void Send(string json)
        {
            if (_ws != null && _ws.State == WebSocketState.Open)
                _ = SendRaw(json);
            else
                _sendQueue.Enqueue(json);
        }

        private async Task SendRaw(string json)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            await _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, _cts.Token);
        }

        private async Task TryReconnect()
        {
            if (_reconnectAttempts >= 5 || _cts.IsCancellationRequested) return;
            _reconnectAttempts++;
            int delay = (int)Math.Pow(2, _reconnectAttempts) * 1000;
            await Task.Delay(delay);
            if (!_cts.IsCancellationRequested) await DoConnect();
        }

        public async Task Disconnect()
        {
            _cts?.Cancel();
            if (_ws?.State == WebSocketState.Open)
            {
                try { await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None); }
                catch { }
            }
            _ws?.Dispose();
        }

        private static string ExtractField(string json, string field)
        {
            int start = json.IndexOf($"\"{field}\"") + field.Length + 3;
            if (json[start] == '"') { start++; int end = json.IndexOf('"', start); return json[start..end]; }
            int endNum = json.IndexOfAny(new[] { ',', '}' }, start);
            return json[start..endNum];
        }

        [Serializable]
        private class JsonWrapper
        {
            public string json;
            public JsonWrapper(Dictionary<string, object> dict) { json = DictToJson(dict); }
            private static string DictToJson(Dictionary<string, object> dict)
            {
                var sb = new StringBuilder("{");
                bool first = true;
                foreach (var kv in dict)
                {
                    if (!first) sb.Append(',');
                    first = false;
                    sb.Append($"\"{kv.Key}\":");
                    if (kv.Value is string s) sb.Append($"\"{s}\"");
                    else if (kv.Value is bool b) sb.Append(b ? "true" : "false");
                    else sb.Append(kv.Value);
                }
                sb.Append('}');
                return sb.ToString();
            }
        }
    }
}
```

- [ ] **Step 6: Create OGHubClient.cs — core protocol**

Create `packages/sdk-unity/Runtime/OGHubClient.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace OGHub
{
    [Serializable]
    public class OGHubConfig
    {
        public string apiKey;
        public string apiSecret;
        public string gameSlug;
        public string apiUrl;
    }

    [Serializable]
    public class OGHubSession
    {
        public string id;
        public string token;
        public string seed;
        public string config;
        public string ghostDataJson;
    }

    [Serializable]
    public class OGHubSessionResult
    {
        public bool accepted;
        public int score;
        public int rank;
        public string nearMissJson;
    }

    public sealed class OGHubClient
    {
        private OGHubConfig _config;
        private OGHubIntegrity _integrity;
        private OGHubWebSocket _websocket;
        private OGHubSession _session;
        private List<string> _inputTimeline = new();
        private int _sequenceCounter;
        private long _startTimeMs;
        private int _lastScore;
        private int _scoreSequence;
        private List<Dictionary<string, object>> _eventBuffer = new();

        public async Task Init(OGHubConfig config)
        {
            _config = config;
            _integrity = new OGHubIntegrity(config.apiSecret);
            _websocket = new OGHubWebSocket();
        }

        public async Task<OGHubSession> CreateSession(string challengeId = null)
        {
            var body = new Dictionary<string, object> { { "gameId", _config.gameSlug } };
            if (challengeId != null) body["challengeId"] = challengeId;

            string response = await PostRequest("/api/sessions/create", DictToJson(body));
            var createResult = JsonUtility.FromJson<CreateResponse>(response);

            _session = new OGHubSession
            {
                id = createResult.sessionId,
                token = createResult.token,
                seed = createResult.seed,
            };
            _integrity.SetSessionId(_session.id);

            // Validate
            string validateResponse = await PostRequest(
                $"/api/sessions/{_session.id}/validate", "{}",
                _session.token
            );

            // Connect WebSocket
            string wsUrl = _config.apiUrl.Replace("http", "ws") + "/api/sessions/live";
            await _websocket.Connect(wsUrl, _session.id, _session.token);

            return _session;
        }

        public void StartSession()
        {
            _startTimeMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            _sequenceCounter = 0;
            _scoreSequence = 0;
            _lastScore = 0;
            _inputTimeline.Clear();
            _eventBuffer.Clear();
        }

        public void ReportInput(string name, Dictionary<string, object> data = null)
        {
            int seq = _sequenceCounter++;
            long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - _startTimeMs;

            string dataJson = data != null ? DictToJson(data) : "{}";
            _inputTimeline.Add($"{{\"name\":\"{name}\",\"data\":{dataJson},\"timestamp\":{timestamp},\"sequence\":{seq}}}");

            _eventBuffer.Add(new Dictionary<string, object>
            {
                { "eventType", $"input:{name}" },
                { "payload", data ?? new Dictionary<string, object>() },
                { "timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() },
                { "sequence", seq },
            });

            if (_eventBuffer.Count >= 50) _ = FlushEvents();
        }

        public void UpdateScore(int score)
        {
            _lastScore = score;
            int seq = _scoreSequence++;
            string hash = _integrity.ComputeScoreHash(score, seq);
            _websocket.SendScoreUpdate(score, hash, seq);
        }

        public void OnValidationRequest(Func<Dictionary<string, object>> handler)
        {
            _websocket.OnValidationRequest(handler);
        }

        public async Task<OGHubSessionResult> EndSession()
        {
            await FlushEvents();

            string timeline = "[" + string.Join(",", _inputTimeline) + "]";
            long duration = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - _startTimeMs;
            string checksum = _integrity.ComputeReplayChecksum(timeline);

            string body = $"{{\"score\":{_lastScore},\"replayData\":{{\"seed\":\"{_session.seed}\",\"inputTimeline\":{timeline},\"duration\":{duration},\"checksum\":\"{checksum}\"}}}}";

            string response = await PostRequest(
                $"/api/sessions/{_session.id}/end", body, _session.token
            );

            await _websocket.Disconnect();
            _integrity.Reset();

            if (response == null)
            {
                OGHubStorage.CacheSubmission(_session.id, body);
                return null;
            }

            return JsonUtility.FromJson<OGHubSessionResult>(response);
        }

        private async Task FlushEvents()
        {
            if (_eventBuffer.Count == 0 || _session == null) return;
            var events = new List<Dictionary<string, object>>(_eventBuffer);
            _eventBuffer.Clear();

            try
            {
                var sb = new StringBuilder("{\"events\":[");
                for (int i = 0; i < events.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    sb.Append(DictToJson(events[i]));
                }
                sb.Append("]}");

                await PostRequest($"/api/sessions/{_session.id}/events", sb.ToString(), _session.token);
            }
            catch
            {
                _eventBuffer.InsertRange(0, events);
            }
        }

        private async Task<string> PostRequest(string path, string body, string bearerToken = null)
        {
            string url = _config.apiUrl + path;
            var (signature, timestamp, nonce) = _integrity.Sign(body);

            using var request = new UnityWebRequest(url, "POST");
            byte[] bodyBytes = Encoding.UTF8.GetBytes(body);
            request.uploadHandler = new UploadHandlerRaw(bodyBytes);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("x-oghub-api-key", _config.apiKey);
            request.SetRequestHeader("x-oghub-signature", signature);
            request.SetRequestHeader("x-oghub-timestamp", timestamp);
            request.SetRequestHeader("x-oghub-nonce", nonce);
            request.SetRequestHeader("x-oghub-sdk-version", "2.0.0");
            if (bearerToken != null) request.SetRequestHeader("Authorization", $"Bearer {bearerToken}");
            request.timeout = 10;

            var op = request.SendWebRequest();
            while (!op.isDone) await Task.Yield();

            if (request.result == UnityWebRequest.Result.Success)
                return request.downloadHandler.text;

            Debug.LogWarning($"[OGHub] HTTP {request.responseCode}: {request.error}");
            return null;
        }

        private static string DictToJson(Dictionary<string, object> dict)
        {
            var sb = new StringBuilder("{");
            bool first = true;
            foreach (var kv in dict)
            {
                if (!first) sb.Append(',');
                first = false;
                sb.Append($"\"{kv.Key}\":");
                if (kv.Value is string s) sb.Append($"\"{s}\"");
                else if (kv.Value is bool b) sb.Append(b ? "true" : "false");
                else if (kv.Value is Dictionary<string, object> nested) sb.Append(DictToJson(nested));
                else sb.Append(kv.Value);
            }
            sb.Append('}');
            return sb.ToString();
        }

        [Serializable] private class CreateResponse
        {
            public string sessionId;
            public string token;
            public string seed;
        }
    }
}
```

- [ ] **Step 7: Create OGHub.cs — static facade**

Create `packages/sdk-unity/Runtime/OGHub.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace OGHub
{
    /// <summary>
    /// Static facade for OGHub SDK. Plug-and-play integration.
    /// 
    /// Usage:
    ///   await OGHub.SDK.Init(config);
    ///   var session = await OGHub.SDK.CreateSession(challengeId);
    ///   OGHub.SDK.StartSession();
    ///   OGHub.SDK.ReportInput("shoot", new() { { "weapon", "laser" } });
    ///   OGHub.SDK.UpdateScore(1500);
    ///   var result = await OGHub.SDK.EndSession();
    /// </summary>
    public static class OGHubSDK
    {
        private static readonly OGHubClient _client = new();

        public static Task Init(OGHubConfig config) => _client.Init(config);

        public static Task<OGHubSession> CreateSession(string challengeId = null)
            => _client.CreateSession(challengeId);

        public static void StartSession() => _client.StartSession();

        public static void ReportInput(string name, Dictionary<string, object> data = null)
            => _client.ReportInput(name, data);

        public static void UpdateScore(int score) => _client.UpdateScore(score);

        public static void OnValidationRequest(Func<Dictionary<string, object>> handler)
            => _client.OnValidationRequest(handler);

        public static Task<OGHubSessionResult> EndSession() => _client.EndSession();
    }
}
```

- [ ] **Step 8: Commit**

```bash
git add packages/sdk-unity/
git commit -m "feat: add com.oghub.sdk Unity package — generic SDK with HMAC, WebSocket, hash chains"
```

---

## Task 11: NeonRunner Migration

**Files:**
- Modify: `games/NeonRunner/Assets/Scripts/SDK/OGHubBridge.cs`
- Modify: `games/NeonRunner/Assets/Scripts/Game/GameManager.cs`

- [ ] **Step 1: Replace OGHubBridge.cs with thin adapter**

Replace the entire content of `games/NeonRunner/Assets/Scripts/SDK/OGHubBridge.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;
using NeonRunner.Core;
using NeonRunner.Game;
using OGHub;

namespace NeonRunner.SDK
{
    /// <summary>
    /// NeonRunner adapter for generic OGHub SDK.
    /// Handles deep links and translates NeonRunner-specific types to generic SDK calls.
    /// </summary>
    public sealed class OGHubBridge : MonoBehaviour
    {
        [SerializeField] private string _apiKey = "";
        [SerializeField] private string _apiSecret = "";
        [SerializeField] private string _apiEndpoint = "http://10.0.0.24:3001/api";

        public bool IsCompetitive { get; private set; }
        public OGHubSession Session { get; private set; }
        public GameConfig CurrentConfig { get; private set; } = GameConfig.Default;

        private void Awake()
        {
            ServiceLocator.Register(this);
            DontDestroyOnLoad(gameObject);
            Application.deepLinkActivated += OnDeepLinkActivated;
        }

        private void Start()
        {
            if (!string.IsNullOrEmpty(Application.absoluteURL))
                OnDeepLinkActivated(Application.absoluteURL);
        }

        private async void OnDeepLinkActivated(string url)
        {
            try
            {
                var uri = new Uri(url);
                var q = ParseQuery(uri.Query);

                string challengeId = q.GetValueOrDefault("challengeId");
                if (string.IsNullOrEmpty(challengeId)) return;

                // Initialize SDK
                await OGHubSDK.Init(new OGHubConfig
                {
                    apiKey = _apiKey,
                    apiSecret = _apiSecret,
                    gameSlug = "neon-runner",
                    apiUrl = _apiEndpoint,
                });

                Session = await OGHubSDK.CreateSession(challengeId);
                IsCompetitive = true;

                // Set up live validation
                OGHubSDK.OnValidationRequest(() => new Dictionary<string, object>
                {
                    { "current_score", GameManager.Instance?.Score ?? 0 },
                    { "current_lane", GameManager.Instance?.CurrentLane ?? 1 },
                    { "player_alive", GameManager.Instance?.IsAlive ?? false },
                    { "current_tick", GameManager.Instance?.CurrentTick ?? 0 },
                });

                // Parse seed into game config
                if (long.TryParse(Session.seed, out long seed))
                {
                    CurrentConfig = new GameConfig
                    {
                        Seed = seed,
                        Modifiers = GameModifiers.None,
                        StartingLives = 3,
                        TimeLimitSeconds = Fixed.Zero,
                    };
                }

                var scene = ServiceLocator.Get<SceneController>();
                scene?.LoadScene("GameplayScene");
            }
            catch (Exception e)
            {
                Debug.LogError($"[OGHubBridge] Deep link failed: {e.Message}");
            }
        }

        public void StartGameplay()
        {
            if (!IsCompetitive) return;
            OGHubSDK.StartSession();
        }

        public void ReportInput(InputAction action)
        {
            if (!IsCompetitive) return;
            string name = action switch
            {
                InputAction.LaneLeft => "lane_left",
                InputAction.LaneRight => "lane_right",
                InputAction.Jump => "jump",
                InputAction.Slide => "slide",
                _ => "none",
            };
            OGHubSDK.ReportInput(name);
        }

        public void UpdateScore(int score)
        {
            if (!IsCompetitive) return;
            OGHubSDK.UpdateScore(score);
        }

        public async Task<OGHubSessionResult> SubmitFinalScore()
        {
            if (!IsCompetitive) return null;
            var result = await OGHubSDK.EndSession();
            IsCompetitive = false;
            Session = null;
            return result;
        }

        public void Reset()
        {
            IsCompetitive = false;
            Session = null;
            CurrentConfig = GameConfig.Default;
        }

        private Dictionary<string, string> ParseQuery(string query)
        {
            var result = new Dictionary<string, string>();
            if (string.IsNullOrEmpty(query)) return result;
            query = query.TrimStart('?');
            foreach (var pair in query.Split('&'))
            {
                var kv = pair.Split('=');
                if (kv.Length == 2)
                    result[Uri.UnescapeDataString(kv[0])] = Uri.UnescapeDataString(kv[1]);
            }
            return result;
        }

        private void OnDestroy()
        {
            Application.deepLinkActivated -= OnDeepLinkActivated;
            ServiceLocator.Unregister<OGHubBridge>();
        }
    }
}
```

- [ ] **Step 2: Create NeonRunner game definition file**

Create `games/NeonRunner/oghub.game.yaml`:

```yaml
name: "Neon Runner"
slug: "neon-runner"
version: "1.0.0"
engine: unity

inputs:
  - name: lane_left
    type: action
  - name: lane_right
    type: action
  - name: jump
    type: action
  - name: slide
    type: action

scoring:
  range: [0, 999999999]
  method: accumulative
  components:
    - name: distance
      weight: 1
    - name: near_miss
      weight: 100
    - name: perfect_dodge
      weight: 200
    - name: skill_gate
      weight: 500

session:
  maxDuration: 600
  minDuration: 5
  allowPause: false

anticheat:
  maxInputRate: 10
  minReactionTime: 80
  maxScorePerSecond: 2000

trust:
  tier: verified
  replaySimulator: native

validation:
  snapshotInterval: 3
  requiredFields:
    - current_score
    - current_lane
    - player_alive
    - current_tick
```

- [ ] **Step 3: Add UPM reference to NeonRunner manifest**

In `games/NeonRunner/Packages/manifest.json`, add the SDK dependency (pointing to local path during development):

```json
"com.oghub.sdk": "file:../../../packages/sdk-unity"
```

- [ ] **Step 4: Commit**

```bash
git add games/NeonRunner/Assets/Scripts/SDK/OGHubBridge.cs games/NeonRunner/oghub.game.yaml games/NeonRunner/Packages/manifest.json
git commit -m "feat: migrate NeonRunner to generic OGHub SDK — replace 400-line bridge with thin adapter"
```

---

## Task 12: Integration Verification

- [ ] **Step 1: Run all API tests**

Run: `cd apps/api && npx vitest run`
Expected: All tests PASS (existing + new)

- [ ] **Step 2: Verify TypeScript builds**

Run: `cd packages/sdk-core && npx tsc --noEmit && cd ../sdk-web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify Prisma schema**

Run: `cd packages/db && npx prisma validate`
Expected: Schema is valid

- [ ] **Step 4: Run full monorepo build**

Run: `npx turbo build`
Expected: All packages build successfully

- [ ] **Step 5: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: integration fixups after generic SDK implementation"
```
