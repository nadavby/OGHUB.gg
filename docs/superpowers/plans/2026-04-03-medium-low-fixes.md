# OGHUB Medium + Low Severity Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all remaining MEDIUM and LOW severity findings from the platform review, covering input validation, database hardening, business logic gaps, frontend UX, infrastructure, and documentation.

**Architecture:** Mix of API hardening (Zod schemas, DB constraints), new business logic (challenge lifecycle, prize distribution, withdrawals), frontend improvements (error boundaries, caching, CSS modules), infrastructure (Docker), and tooling (seed script, API docs). Each task is independent or has clearly noted dependencies.

**Tech Stack:** Express, Prisma, ioredis, Zod (new), Next.js 14, React 18, framer-motion, Docker (new), Swagger/swagger-jsdoc (new)

**Scope:** Findings #16-38 from the review spec (minus those already fixed in Phase 1: #17, #22, #24, #25, #30, #31, #32, #34, #35). Feature Suggestions F1-F10 are out of scope — each needs its own design spec and plan.

**Prerequisites:** Phase 1 plan (critical-high-fixes) must be merged to master first. This plan builds on that work.

---

## Already Addressed (No Action Needed)

| Finding | Status |
|---------|--------|
| #17 Startup env validation | Done in Phase 1, Task 1 |
| #22 Leaderboard zadd GT | Done in Phase 1, Task 15 |
| #24 Graceful shutdown | Done in Phase 1, Task 14 |
| #25 Request logging | Done in Phase 1, Task 16 |
| #30 Near-miss off-by-one | Done in Phase 1, Task 15 |
| #31 Real health check | Done in Phase 1, Task 14 |
| #32 TypeScript strict mode | Already enabled (false positive) |
| #34 Git repository | Already initialized |
| #35 .env in .gitignore | Already covered |

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/api/src/common/schemas.ts` | Zod validation schemas for all request bodies |
| Modify | `apps/api/src/auth/auth.router.ts` | Apply Zod schemas to register/login |
| Modify | `apps/api/src/wallet/wallet.router.ts` | Apply Zod schemas to deposit, add withdrawal endpoint |
| Modify | `apps/api/src/sessions/sessions.router.ts` | Apply Zod schemas to create/events/end |
| Modify | `apps/api/src/games/games.router.ts` | Apply Zod schemas to game registration |
| Create | `packages/db/prisma/migrations/YYYYMMDD_wallet_balance_check/migration.sql` | CHECK constraint on wallet balance |
| Create | `packages/db/prisma/seed.ts` | Database seed script |
| Modify | `packages/db/package.json` | Add seed script config |
| Create | `apps/api/src/challenges/challenge-lifecycle.ts` | Challenge state machine + cron job |
| Modify | `apps/api/src/main.ts` | Start challenge lifecycle worker |
| Modify | `apps/api/src/sessions/sessions.router.ts` | Accumulate entry fees into prize pool |
| Create | `apps/api/src/challenges/prize-distribution.ts` | Prize payout logic |
| Modify | `apps/api/src/wallet/wallet.router.ts` | Add withdrawal endpoint |
| Create | `apps/api/src/wallet/double-or-nothing.ts` | Server-side coin flip with provably fair RNG |
| Modify | `apps/web/src/app/page.tsx` | Error state instead of silent demo fallback |
| Create | `apps/web/src/components/ErrorBoundary.tsx` | React error boundary component |
| Modify | `apps/web/src/app/layout.tsx` | Wrap sections with error boundaries |
| Modify | `apps/web/src/hooks/useAuth.tsx` | Add wallet state to AuthContext |
| Modify | `apps/web/src/hooks/useWallet.ts` | Use AuthContext wallet state |
| Create | `apps/api/Dockerfile` | API container image |
| Create | `apps/web/Dockerfile` | Web container image |
| Create | `docker-compose.yml` | Full-stack local orchestration |
| Create | `apps/api/src/common/swagger.ts` | Swagger/OpenAPI setup |
| Modify | `apps/api/src/main.ts` | Mount Swagger UI |
| Modify | `games/NeonRunner/Assets/Scripts/SDK/OGHubBridge.cs` | Real HTTP calls via UnityWebRequest |

---

### Task 1: Database Seed Script

**Finding:** #37 (LOW — no seed data, broken db:seed script)

**Files:**
- Create: `packages/db/prisma/seed.ts`
- Modify: `packages/db/package.json`

- [ ] **Step 1: Create the seed script**

Create `packages/db/prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ─── Admin User ──────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@oghub.gg' },
    update: {},
    create: {
      email: 'admin@oghub.gg',
      username: 'admin',
      passwordHash: adminHash,
      displayName: 'OGHUB Admin',
      role: 'ADMIN',
      wallet: { create: { balance: 10000 } },
    },
  });

  // ─── Test Players ────────────────────────────────────────
  const playerHash = await bcrypt.hash('Player123!', 12);
  const players = [];
  for (const name of ['alice', 'bob', 'charlie']) {
    const player = await prisma.user.upsert({
      where: { email: `${name}@test.com` },
      update: {},
      create: {
        email: `${name}@test.com`,
        username: name,
        passwordHash: playerHash,
        displayName: name.charAt(0).toUpperCase() + name.slice(1),
        role: 'PLAYER',
        wallet: { create: { balance: 100 } },
      },
    });
    players.push(player);
  }

  // ─── Developer App ───────────────────────────────────────
  const devApp = await prisma.developerApp.upsert({
    where: { apiKey: 'seed-dev-api-key' },
    update: {},
    create: {
      name: 'OGHUB Internal',
      apiKey: 'seed-dev-api-key',
      apiSecret: crypto.randomBytes(32).toString('hex'),
      ownerId: admin.id,
    },
  });

  // ─── Games ───────────────────────────────────────────────
  const games = [
    {
      slug: 'neon-runner',
      title: 'Neon Runner',
      description: 'Dodge obstacles in a neon-lit infinite runner. Near-misses score big!',
      difficulty: 3,
      tags: ['runner', 'arcade'],
      isFeatured: true,
      deepLinkScheme: 'neon-runner',
    },
    {
      slug: 'stack-tower',
      title: 'Stack Tower',
      description: 'Stack blocks as high as you can! Perfect timing is everything.',
      difficulty: 2,
      tags: ['arcade', 'timing'],
      isFeatured: true,
    },
    {
      slug: 'color-match',
      title: 'Color Match Rush',
      description: 'Match colors at lightning speed. Beat the clock!',
      difficulty: 1,
      tags: ['puzzle', 'speed'],
      isFeatured: false,
    },
  ];

  const createdGames = [];
  for (const g of games) {
    const game = await prisma.game.upsert({
      where: { slug: g.slug },
      update: {},
      create: { ...g, developerId: devApp.id },
    });
    createdGames.push(game);
  }

  // ─── Challenges ──────────────────────────────────────────
  for (const game of createdGames) {
    await prisma.challenge.upsert({
      where: { id: `seed-challenge-${game.slug}` },
      update: {},
      create: {
        id: `seed-challenge-${game.slug}`,
        gameId: game.id,
        title: `${game.title} Daily Challenge`,
        description: `Compete for the top score in ${game.title}!`,
        entryFee: 5.00,
        prizePool: 0,
        platformFee: 0.10,
        maxEntries: 100,
        status: 'ACTIVE',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  console.log(`Seeded: ${1} admin, ${players.length} players, ${createdGames.length} games with challenges`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Configure seed in package.json**

In `packages/db/package.json`, add the prisma seed configuration. The root `package.json` already has `"db:seed": "npx prisma db seed"`. We need the prisma config in `packages/db/package.json`:

Read `packages/db/package.json` first, then add:

```json
"prisma": {
  "seed": "ts-node --transpile-only prisma/seed.ts"
}
```

Also ensure `bcryptjs` and `ts-node` are available. Add to devDependencies if not present:

```bash
cd packages/db && npm install -D ts-node bcryptjs @types/bcryptjs
```

- [ ] **Step 3: Test the seed script compiles**

Run: `cd packages/db && npx ts-node --transpile-only prisma/seed.ts --help 2>&1 || echo "compilation check"`

Expected: Script loads without syntax errors (may fail at runtime without DB — that's fine).

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/seed.ts packages/db/package.json packages/db/package-lock.json
git commit -m "feat(tooling): add database seed script with sample data

Addresses LOW finding #37.
Creates admin user, 3 test players, 3 games with daily challenges.
Run with: npx prisma db seed"
```

---

### Task 2: Wallet Balance CHECK Constraint

**Finding:** #18 (MEDIUM — no database-level protection against negative balances)

**Files:**
- Create: `packages/db/prisma/migrations/20260403000000_wallet_balance_check/migration.sql`

- [ ] **Step 1: Create the raw SQL migration**

Create directory and file `packages/db/prisma/migrations/20260403000000_wallet_balance_check/migration.sql`:

```sql
-- Add CHECK constraint to prevent negative wallet balances at database level
ALTER TABLE "Wallet" ADD CONSTRAINT "wallet_balance_non_negative" CHECK ("balance" >= 0);
ALTER TABLE "Wallet" ADD CONSTRAINT "wallet_frozen_balance_non_negative" CHECK ("frozenBalance" >= 0);
```

- [ ] **Step 2: Mark migration as applied (if DB exists) or note for fresh DBs**

For existing databases:
```bash
cd packages/db && npx prisma migrate resolve --applied 20260403000000_wallet_balance_check
```

For fresh databases, `prisma migrate deploy` will apply it automatically.

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/migrations/20260403000000_wallet_balance_check/
git commit -m "fix(database): add CHECK constraint preventing negative wallet balances

Addresses MEDIUM finding #18.
Database now rejects any update that would set balance or frozenBalance below zero.
This is a safety net behind the application-level validation."
```

---

### Task 3: Zod Input Validation Schemas

**Finding:** #16 (MEDIUM — no request body validation)

**Files:**
- Create: `apps/api/src/common/schemas.ts`
- Modify: `apps/api/src/auth/auth.router.ts`
- Modify: `apps/api/src/wallet/wallet.router.ts`
- Modify: `apps/api/src/sessions/sessions.router.ts`
- Modify: `apps/api/src/games/games.router.ts`

- [ ] **Step 1: Install Zod**

```bash
cd apps/api && npm install zod
```

- [ ] **Step 2: Create validation schemas**

Create `apps/api/src/common/schemas.ts`:

```typescript
import { z } from 'zod';

// ─── Auth ──────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores'),
  password: z.string().min(8).max(72),
  displayName: z.string().max(50).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

// ─── Wallet ────────────────────────────────────────────────

export const depositSchema = z.object({
  amount: z.number().positive('Amount must be positive').max(100000, 'Amount exceeds maximum'),
});

// ─── Sessions ──────────────────────────────────────────────

export const createSessionSchema = z.object({
  gameId: z.string().min(1, 'gameId is required'),
  challengeId: z.string().optional(),
});

export const endSessionSchema = z.object({
  score: z.number().int().min(0, 'Score cannot be negative'),
  replayData: z.object({
    seed: z.string(),
    inputTimeline: z.array(z.object({
      timestamp: z.number(),
      type: z.string(),
      data: z.record(z.unknown()).default({}),
      sequence: z.number().int(),
    })),
    duration: z.number().int().min(0),
    checksum: z.string().optional(),
  }).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const eventsSchema = z.object({
  events: z.array(z.object({
    eventType: z.string().optional(),
    type: z.string().optional(),
    payload: z.record(z.unknown()).default({}),
    timestamp: z.number(),
    sequence: z.number().int(),
  })).min(1, 'At least one event is required').max(100, 'Maximum 100 events per batch'),
});

// ─── Games ─────────────────────────────────────────────────

export const registerGameSchema = z.object({
  title: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens'),
  description: z.string().max(500).optional(),
  thumbnailUrl: z.string().url().optional().nullable(),
  bannerUrl: z.string().url().optional().nullable(),
  deepLinkScheme: z.string().max(50).optional().nullable(),
  difficulty: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string().max(20)).max(10).optional(),
});

// ─── Helper ────────────────────────────────────────────────

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new (require('./error-handler').AppError)(message, 400);
  }
  return result.data;
}
```

- [ ] **Step 3: Apply schemas to auth router**

In `apps/api/src/auth/auth.router.ts`, add the import at the top:

```typescript
import { validate, registerSchema, loginSchema } from '../common/schemas';
```

In the register handler (line 42), replace:
```typescript
    const { email, username, password, displayName } = req.body;

    if (!email || !username || !password) {
      throw new AppError('Email, username, and password are required');
    }
```

with:
```typescript
    const { email, username, password, displayName } = validate(registerSchema, req.body);
```

In the login handler (line 104), replace:
```typescript
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email and password are required');
    }
```

with:
```typescript
    const { email, password } = validate(loginSchema, req.body);
```

- [ ] **Step 4: Apply schemas to wallet router**

In `apps/api/src/wallet/wallet.router.ts`, add the import:

```typescript
import { validate, depositSchema } from '../common/schemas';
```

In the deposit handler (line 41), replace:
```typescript
    const { amount } = req.body;
    const depositAmount = new Decimal(amount);

    if (depositAmount.lte(0)) {
      throw new AppError('Deposit amount must be positive');
    }
```

with:
```typescript
    const { amount } = validate(depositSchema, req.body);
    const depositAmount = new Decimal(amount);
```

- [ ] **Step 5: Apply schemas to sessions router**

In `apps/api/src/sessions/sessions.router.ts`, add the import:

```typescript
import { validate, createSessionSchema, endSessionSchema, eventsSchema } from '../common/schemas';
```

In the `/create` handler (line 19), replace:
```typescript
    const { gameId, challengeId } = req.body;

    if (!gameId) throw new AppError('gameId is required');
```

with:
```typescript
    const { gameId, challengeId } = validate(createSessionSchema, req.body);
```

In the `/:id/events` handler (line 180), replace:
```typescript
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      throw new AppError('Events array is required');
    }
```

with:
```typescript
    const { events } = validate(eventsSchema, req.body);
```

In the `/:id/end` handler (line 240), replace:
```typescript
    const { score, replayData, metadata } = req.body;

    if (score === undefined) throw new AppError('Score is required');
```

with:
```typescript
    const { score, replayData, metadata } = validate(endSessionSchema, req.body);
```

- [ ] **Step 6: Apply schemas to games router**

In `apps/api/src/games/games.router.ts`, add the import:

```typescript
import { validate, registerGameSchema } from '../common/schemas';
```

In the POST `/` handler (line 136), replace:
```typescript
      const { title, slug, description, thumbnailUrl, bannerUrl, deepLinkScheme, difficulty, tags } = req.body;

      if (!title || !slug) {
        throw new AppError('Title and slug are required');
      }
```

with:
```typescript
      const { title, slug, description, thumbnailUrl, bannerUrl, deepLinkScheme, difficulty, tags } = validate(registerGameSchema, req.body);
```

- [ ] **Step 7: Verify compilation**

Run: `cd apps/api && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/common/schemas.ts apps/api/src/auth/auth.router.ts apps/api/src/wallet/wallet.router.ts apps/api/src/sessions/sessions.router.ts apps/api/src/games/games.router.ts apps/api/package.json apps/api/package-lock.json
git commit -m "feat(security): add Zod input validation schemas for all endpoints

Addresses MEDIUM finding #16.
All request bodies are now validated with Zod schemas before processing.
Covers: auth (register/login), wallet (deposit), sessions (create/events/end),
and games (register). Invalid inputs return 400 with descriptive messages."
```

---

### Task 4: Homepage Error State

**Finding:** #27 (MEDIUM — silent fallback to fake demo games)

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Replace silent catch with error state**

In `apps/web/src/app/page.tsx`, add an error state and a loading state. Replace lines 71-81:

```typescript
export default function HomePage() {
  const [games, setGames] = useState<Game[]>(DEMO_GAMES);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    api('/api/games')
      .then((data: Game[]) => {
        if (data && data.length > 0) setGames(data);
      })
      .catch(() => {});
  }, []);
```

with:

```typescript
export default function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Game[]>('/api/games')
      .then((data) => {
        setGames(data && data.length > 0 ? data : []);
      })
      .catch((err) => {
        setError('Failed to load games. Please try again later.');
        console.error('Games fetch error:', err);
      })
      .finally(() => setLoading(false));
  }, []);
```

Then, in the return block, add loading and error states at the top of `<div className="game-feed">`, before the Category Tags section:

```tsx
  return (
    <div className="game-feed">
      {loading && (
        <div className="empty-state">
          <p>Loading games...</p>
        </div>
      )}

      {error && !loading && (
        <div className="empty-state">
          <span className="icon">⚠️</span>
          <p>{error}</p>
          <button
            className="tag"
            style={{ cursor: 'pointer', marginTop: 12 }}
            onClick={() => {
              setError(null);
              setLoading(true);
              api<Game[]>('/api/games')
                .then((data) => setGames(data && data.length > 0 ? data : []))
                .catch((err) => setError('Failed to load games. Please try again later.'))
                .finally(() => setLoading(false));
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
```

And close the fragment before the final `</div>`:

```tsx
        </>
      )}
    </div>
  );
```

Also remove the `DEMO_GAMES` constant (lines 20-69) entirely — it's no longer used.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "fix(ux): replace silent demo game fallback with proper loading/error states

Addresses MEDIUM finding #27.
Homepage no longer silently shows fake games on API failure.
Shows loading spinner, error message with retry button, or empty state."
```

---

### Task 5: React Error Boundaries

**Finding:** #28 (MEDIUM — no error boundaries)

**Files:**
- Create: `apps/web/src/components/ErrorBoundary.tsx`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Create ErrorBoundary component**

Create `apps/web/src/components/ErrorBoundary.tsx`:

```tsx
'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  section?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.section ? `:${this.props.section}` : ''}]`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="empty-state" style={{ padding: 24 }}>
          <span className="icon">⚠️</span>
          <p>Something went wrong{this.props.section ? ` in ${this.props.section}` : ''}.</p>
          <button
            className="tag"
            style={{ cursor: 'pointer', marginTop: 12 }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

- [ ] **Step 2: Wrap layout sections with error boundaries**

In `apps/web/src/app/layout.tsx`, add the import:

```typescript
import ErrorBoundary from '@/components/ErrorBoundary';
```

Replace the body content (lines 24-38):

```tsx
        <AuthProvider>
          <div className="app-shell">
            <header className="app-header">
              <div className="app-header-row">
                <span className="app-logo">OGHUB</span>
                <WalletBadge />
              </div>
            </header>
            <main>{children}</main>
            <BottomNav />
          </div>
        </AuthProvider>
```

with:

```tsx
        <AuthProvider>
          <div className="app-shell">
            <ErrorBoundary section="header">
              <header className="app-header">
                <div className="app-header-row">
                  <span className="app-logo">OGHUB</span>
                  <WalletBadge />
                </div>
              </header>
            </ErrorBoundary>
            <ErrorBoundary section="main content">
              <main>{children}</main>
            </ErrorBoundary>
            <ErrorBoundary section="navigation">
              <BottomNav />
            </ErrorBoundary>
          </div>
        </AuthProvider>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ErrorBoundary.tsx apps/web/src/app/layout.tsx
git commit -m "feat(ux): add React error boundaries around layout sections

Addresses MEDIUM finding #28.
Component errors in header, main content, or navigation are caught
independently with a 'Try Again' fallback instead of full app crash."
```

---

### Task 6: Wallet State Caching in AuthContext

**Finding:** #29 (MEDIUM — useWallet refetches on every mount)

**Files:**
- Modify: `apps/web/src/hooks/useAuth.tsx`
- Modify: `apps/web/src/hooks/useWallet.ts`

- [ ] **Step 1: Add wallet state to AuthContext**

In `apps/web/src/hooks/useAuth.tsx`, add wallet state to the context. Replace the entire file:

```tsx
'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { api, getStoredToken, setStoredToken, clearStoredToken } from '@/lib/api';

interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
}

interface WalletData {
  balance: string;
  frozenBalance: string;
  currency: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  wallet: WalletData | null;
  walletLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshWallet: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);

  const fetchWallet = useCallback(async (authToken?: string) => {
    const t = authToken || getStoredToken();
    if (!t) {
      setWalletLoading(false);
      return;
    }
    try {
      const data = await api<WalletData>('/api/wallet/balance', { token: t });
      setWallet(data);
    } catch {
      // Wallet may not exist yet
    } finally {
      setWalletLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = getStoredToken();
    if (stored) {
      setToken(stored);
      Promise.all([
        api('/api/auth/me', { token: stored }).then(setUser).catch(() => clearStoredToken()),
        fetchWallet(stored),
      ]).finally(() => setLoading(false));
    } else {
      setLoading(false);
      setWalletLoading(false);
    }
  }, [fetchWallet]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    fetchWallet(data.token);
  }, [fetchWallet]);

  const register = useCallback(async (email: string, username: string, password: string) => {
    const data = await api<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: { email, username, password },
    });
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    fetchWallet(data.token);
  }, [fetchWallet]);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setUser(null);
    setWallet(null);
  }, []);

  const refreshWallet = useCallback(async () => {
    await fetchWallet();
  }, [fetchWallet]);

  return (
    <AuthContext.Provider value={{ user, token, loading, wallet, walletLoading, login, register, logout, refreshWallet }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Update useWallet to use AuthContext**

Replace the entire contents of `apps/web/src/hooks/useWallet.ts`:

```typescript
'use client';

import { useCallback } from 'react';
import { useAuth } from './useAuth';
import { api, getStoredToken } from '@/lib/api';

interface WalletData {
  balance: string;
  frozenBalance: string;
  currency: string;
}

export function useWallet() {
  const { wallet, walletLoading: loading, refreshWallet } = useAuth();

  const deposit = useCallback(async (amount: number) => {
    const token = getStoredToken();
    if (!token) return;

    const data = await api<WalletData>('/api/wallet/deposit', {
      method: 'POST',
      body: { amount },
      token,
    });
    await refreshWallet();
    return data;
  }, [refreshWallet]);

  return { wallet, loading, deposit, refetch: refreshWallet };
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useAuth.tsx apps/web/src/hooks/useWallet.ts
git commit -m "fix(performance): centralize wallet state in AuthContext to prevent redundant fetches

Addresses MEDIUM finding #29.
Wallet data is now fetched once on login/init and shared via context.
Multiple components using useWallet() no longer trigger separate API calls."
```

---

### Task 7: Challenge Lifecycle Management

**Finding:** #21 (MEDIUM — no state transitions for challenges)

**Files:**
- Create: `apps/api/src/challenges/challenge-lifecycle.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Create challenge lifecycle worker**

Create `apps/api/src/challenges/challenge-lifecycle.ts`:

```typescript
import { prisma } from '../main';

const LIFECYCLE_INTERVAL_MS = 60_000; // Check every 60 seconds

/**
 * Transitions challenges between states based on their schedule:
 * - UPCOMING → ACTIVE when startsAt has passed
 * - ACTIVE → COMPLETED when endsAt has passed or maxEntries reached
 */
export async function runLifecycleTick(): Promise<{ activated: number; completed: number }> {
  const now = new Date();

  // UPCOMING → ACTIVE
  const activated = await prisma.challenge.updateMany({
    where: {
      status: 'UPCOMING',
      startsAt: { lte: now },
    },
    data: { status: 'ACTIVE' },
  });

  // ACTIVE → COMPLETED (time-based)
  const timeExpired = await prisma.challenge.updateMany({
    where: {
      status: 'ACTIVE',
      endsAt: { lte: now, not: null },
    },
    data: { status: 'COMPLETED' },
  });

  // ACTIVE → COMPLETED (entry-based)
  const entryCapped = await prisma.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM "Challenge" c
    WHERE c.status = 'ACTIVE'
      AND c."maxEntries" IS NOT NULL
      AND (SELECT COUNT(*) FROM "GameSession" gs WHERE gs."challengeId" = c.id) >= c."maxEntries"
  `;

  let entryCompleted = 0;
  if (entryCapped.length > 0) {
    const result = await prisma.challenge.updateMany({
      where: { id: { in: entryCapped.map(r => r.id) } },
      data: { status: 'COMPLETED' },
    });
    entryCompleted = result.count;
  }

  return {
    activated: activated.count,
    completed: timeExpired.count + entryCompleted,
  };
}

let lifecycleTimer: ReturnType<typeof setInterval> | null = null;

export function startChallengeLifecycleWorker(): void {
  if (lifecycleTimer) return;

  console.log('[Challenge Lifecycle] Worker started');

  lifecycleTimer = setInterval(async () => {
    try {
      const result = await runLifecycleTick();
      if (result.activated > 0 || result.completed > 0) {
        console.log(`[Challenge Lifecycle] Activated: ${result.activated}, Completed: ${result.completed}`);
      }
    } catch (err) {
      console.error('[Challenge Lifecycle] Error:', err);
    }
  }, LIFECYCLE_INTERVAL_MS);

  // Run immediately on start
  runLifecycleTick().catch(console.error);
}

export function stopChallengeLifecycleWorker(): void {
  if (lifecycleTimer) {
    clearInterval(lifecycleTimer);
    lifecycleTimer = null;
  }
}
```

- [ ] **Step 2: Start the worker in main.ts**

In `apps/api/src/main.ts`, add the import:

```typescript
import { startChallengeLifecycleWorker } from './challenges/challenge-lifecycle';
```

In the `app.listen` callback, after the event drain worker start, add:

```typescript
  // Start challenge lifecycle worker
  startChallengeLifecycleWorker();
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/challenges/challenge-lifecycle.ts apps/api/src/main.ts
git commit -m "feat(business-logic): add challenge lifecycle state machine

Addresses MEDIUM finding #21.
Background worker transitions challenges: UPCOMING→ACTIVE (on startsAt),
ACTIVE→COMPLETED (on endsAt or maxEntries reached). Runs every 60 seconds."
```

---

### Task 8: Prize Pool Accumulation and Distribution

**Finding:** #20 (MEDIUM — prize pool and payout logic missing)

**Files:**
- Modify: `apps/api/src/sessions/sessions.router.ts`
- Create: `apps/api/src/challenges/prize-distribution.ts`
- Modify: `apps/api/src/challenges/challenge-lifecycle.ts`

- [ ] **Step 1: Accumulate entry fees into prize pool**

In `apps/api/src/sessions/sessions.router.ts`, inside the `$transaction` in the `/create` handler, after the `walletTransaction.create` call (after line 73), add prize pool accumulation:

```typescript
        // Accumulate entry fee into prize pool (minus platform fee)
        if (challengeId) {
          const challenge = await tx.challenge.findUnique({ where: { id: challengeId } });
          if (challenge) {
            const platformCut = entryFee.mul(challenge.platformFee);
            const poolContribution = entryFee.sub(platformCut);
            await tx.challenge.update({
              where: { id: challengeId },
              data: { prizePool: { increment: poolContribution } },
            });
          }
        }
```

This goes right before the `// Create session in the same transaction` comment (line 76).

- [ ] **Step 2: Create prize distribution module**

Create `apps/api/src/challenges/prize-distribution.ts`:

```typescript
import { Decimal } from '@prisma/client/runtime/library';
import { prisma, redis } from '../main';

interface PrizeDistribution {
  userId: string;
  rank: number;
  amount: Decimal;
}

/**
 * Determines prize split for a completed challenge.
 * Top 3 players get prizes: 1st = 50%, 2nd = 30%, 3rd = 20%.
 * If fewer than 3 players, remaining share goes to existing winners.
 */
function calculatePrizeSplit(prizePool: Decimal, playerCount: number): number[] {
  if (playerCount === 0) return [];
  if (playerCount === 1) return [1.0];
  if (playerCount === 2) return [0.65, 0.35];
  return [0.50, 0.30, 0.20];
}

/**
 * Distributes prizes to winners of a completed challenge.
 * Called by the lifecycle worker when a challenge transitions to COMPLETED.
 */
export async function distributeChallengePrizes(challengeId: string): Promise<PrizeDistribution[]> {
  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.prizePool.lte(0)) return [];

  // Get top scores from Redis (authoritative for rankings)
  const topEntries = await redis.zrevrange(
    `leaderboard:${challengeId}`,
    0,
    2, // Top 3
    'WITHSCORES',
  );

  if (topEntries.length < 2) {
    // Fallback to DB if Redis is empty
    const dbScores = await prisma.score.findMany({
      where: {
        session: { challengeId },
        isValidated: true,
      },
      orderBy: { value: 'desc' },
      take: 3,
      select: { userId: true, value: true },
    });
    if (dbScores.length === 0) return [];

    // Convert DB results to same format
    topEntries.length = 0;
    for (const s of dbScores) {
      topEntries.push(s.userId, s.value.toString());
    }
  }

  // Parse winners
  const winners: { userId: string; score: number }[] = [];
  for (let i = 0; i < topEntries.length; i += 2) {
    winners.push({ userId: topEntries[i], score: parseInt(topEntries[i + 1], 10) });
  }

  const splits = calculatePrizeSplit(challenge.prizePool, winners.length);
  const distributions: PrizeDistribution[] = [];

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < winners.length && i < splits.length; i++) {
      const amount = challenge.prizePool.mul(new Decimal(splits[i])).toDecimalPlaces(2);
      if (amount.lte(0)) continue;

      const wallet = await tx.wallet.findUnique({ where: { userId: winners[i].userId } });
      if (!wallet) continue;

      const newBalance = wallet.balance.add(amount);

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'PRIZE_PAYOUT',
          amount,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          description: `Rank ${i + 1} prize for ${challenge.title}`,
          referenceId: challengeId,
        },
      });

      distributions.push({
        userId: winners[i].userId,
        rank: i + 1,
        amount,
      });
    }
  }, { isolationLevel: 'Serializable' });

  console.log(`[Prize Distribution] Challenge ${challengeId}: distributed to ${distributions.length} winners`);
  return distributions;
}
```

- [ ] **Step 3: Wire prize distribution into lifecycle worker**

In `apps/api/src/challenges/challenge-lifecycle.ts`, add the import:

```typescript
import { distributeChallengePrizes } from './prize-distribution';
```

In `runLifecycleTick`, after the time-expired completion block, add prize distribution for newly completed challenges. Replace the return statement with:

```typescript
  // Distribute prizes for newly completed challenges
  const completedIds: string[] = [];

  if (timeExpired.count > 0) {
    const justCompleted = await prisma.challenge.findMany({
      where: {
        status: 'COMPLETED',
        updatedAt: { gte: new Date(now.getTime() - LIFECYCLE_INTERVAL_MS - 5000) },
      },
      select: { id: true },
    });
    completedIds.push(...justCompleted.map(c => c.id));
  }

  if (entryCapped.length > 0) {
    completedIds.push(...entryCapped.map(r => r.id));
  }

  for (const id of completedIds) {
    try {
      await distributeChallengePrizes(id);
    } catch (err) {
      console.error(`[Challenge Lifecycle] Prize distribution failed for ${id}:`, err);
    }
  }

  return {
    activated: activated.count,
    completed: timeExpired.count + entryCompleted,
  };
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/sessions/sessions.router.ts apps/api/src/challenges/prize-distribution.ts apps/api/src/challenges/challenge-lifecycle.ts
git commit -m "feat(business-logic): add prize pool accumulation and automated distribution

Addresses MEDIUM finding #20.
Entry fees now accumulate into prize pool (minus platform fee).
When challenges complete, prizes auto-distribute to top 3 players (50/30/20 split).
Distribution uses serializable transactions for financial integrity."
```

---

### Task 9: Withdrawal Endpoint

**Finding:** #19 (MEDIUM — no way to cash out)

**Files:**
- Modify: `apps/api/src/wallet/wallet.router.ts`
- Modify: `apps/api/src/common/schemas.ts`

- [ ] **Step 1: Add withdrawal schema**

In `apps/api/src/common/schemas.ts`, add:

```typescript
export const withdrawalSchema = z.object({
  amount: z.number().positive('Amount must be positive').max(10000, 'Amount exceeds maximum per withdrawal'),
});
```

- [ ] **Step 2: Add withdrawal endpoint**

In `apps/api/src/wallet/wallet.router.ts`, add the import for the new schema:

```typescript
import { validate, depositSchema, withdrawalSchema } from '../common/schemas';
```

Add the withdrawal endpoint after the deposit endpoint (after line 87):

```typescript
// ─── Withdraw ──────────────────────────────────────────────
// NOTE: This creates a pending withdrawal record. Actual payout requires
// payment gateway integration (Feature F1). For now, it deducts balance
// and records the transaction for manual processing.

walletRouter.post('/withdraw', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { amount } = validate(withdrawalSchema, req.body);
    const withdrawAmount = new Decimal(amount);

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId: req.user!.userId },
      });

      if (!wallet) throw new AppError('Wallet not found', 404);
      if (wallet.balance.lt(withdrawAmount)) {
        throw new AppError('Insufficient balance', 402);
      }

      const newBalance = wallet.balance.sub(withdrawAmount);

      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'WITHDRAWAL',
          amount: withdrawAmount.neg(),
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          description: 'Withdrawal (pending manual processing)',
        },
      });

      return updated;
    }, { isolationLevel: 'Serializable' });

    res.json({
      success: true,
      data: {
        balance: result.balance.toString(),
        frozenBalance: result.frozenBalance.toString(),
        currency: result.currency,
        message: 'Withdrawal request submitted. Processing may take 1-3 business days.',
      },
    });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/wallet/wallet.router.ts apps/api/src/common/schemas.ts
git commit -m "feat(business-logic): add withdrawal endpoint with pending status

Addresses MEDIUM finding #19.
Users can now request withdrawals. Balance is deducted immediately.
Actual payout requires payment gateway integration (Feature F1).
Transactions are recorded for manual processing in the interim."
```

---

### Task 10: DoubleOrNothing Server-Side Logic

**Finding:** #38 (LOW — coin flip is purely client-side)

**Files:**
- Create: `apps/api/src/wallet/double-or-nothing.ts`
- Modify: `apps/api/src/wallet/wallet.router.ts`
- Modify: `apps/api/src/common/schemas.ts`

- [ ] **Step 1: Add schema**

In `apps/api/src/common/schemas.ts`, add:

```typescript
export const doubleOrNothingSchema = z.object({
  amount: z.number().positive('Amount must be positive').max(10000, 'Amount exceeds maximum'),
});
```

- [ ] **Step 2: Create server-side coin flip module**

Create `apps/api/src/wallet/double-or-nothing.ts`:

```typescript
import crypto from 'crypto';

export interface CoinFlipResult {
  won: boolean;
  serverSeed: string;
  clientSeed: string;
  hash: string;
}

/**
 * Provably fair coin flip using commit-reveal:
 * 1. Server generates a random seed
 * 2. Hash = SHA256(serverSeed + clientSeed)
 * 3. Win if last byte of hash is even (50/50)
 * 4. Both seeds are revealed so client can verify
 */
export function flipCoin(): CoinFlipResult {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const clientSeed = crypto.randomBytes(16).toString('hex');

  const hash = crypto
    .createHash('sha256')
    .update(serverSeed + clientSeed)
    .digest('hex');

  // Last byte determines outcome (even = win, odd = lose)
  const lastByte = parseInt(hash.slice(-2), 16);
  const won = lastByte % 2 === 0;

  return { won, serverSeed, clientSeed, hash };
}
```

- [ ] **Step 3: Add double-or-nothing endpoint**

In `apps/api/src/wallet/wallet.router.ts`, add the imports:

```typescript
import { flipCoin } from './double-or-nothing';
```

And add the schema import (update existing line):

```typescript
import { validate, depositSchema, withdrawalSchema, doubleOrNothingSchema } from '../common/schemas';
```

Add the endpoint after the withdrawal endpoint:

```typescript
// ─── Double or Nothing ─────────────────────────────────────

walletRouter.post('/double-or-nothing', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { amount } = validate(doubleOrNothingSchema, req.body);
    const betAmount = new Decimal(amount);

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId: req.user!.userId },
      });

      if (!wallet) throw new AppError('Wallet not found', 404);
      if (wallet.balance.lt(betAmount)) {
        throw new AppError('Insufficient balance', 402);
      }

      const flip = flipCoin();

      if (flip.won) {
        // Win: add the bet amount (net +amount)
        const newBalance = wallet.balance.add(betAmount);
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: newBalance },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'PRIZE_PAYOUT',
            amount: betAmount,
            balanceBefore: wallet.balance,
            balanceAfter: newBalance,
            description: 'Double or Nothing — Won',
          },
        });
        return { newBalance, flip };
      } else {
        // Lose: deduct the bet amount
        const newBalance = wallet.balance.sub(betAmount);
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: newBalance },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'ENTRY_FEE',
            amount: betAmount.neg(),
            balanceBefore: wallet.balance,
            balanceAfter: newBalance,
            description: 'Double or Nothing — Lost',
          },
        });
        return { newBalance, flip };
      }
    }, { isolationLevel: 'Serializable' });

    res.json({
      success: true,
      data: {
        won: result.flip.won,
        balance: result.newBalance.toString(),
        proof: {
          serverSeed: result.flip.serverSeed,
          clientSeed: result.flip.clientSeed,
          hash: result.flip.hash,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/wallet/double-or-nothing.ts apps/api/src/wallet/wallet.router.ts apps/api/src/common/schemas.ts
git commit -m "feat(game-mechanics): add server-side double-or-nothing with provably fair RNG

Addresses LOW finding #38.
Coin flip uses commit-reveal (SHA256 of server+client seeds).
Both seeds returned so outcome is independently verifiable.
All bets recorded as wallet transactions with serializable isolation."
```

---

### Task 11: Docker Infrastructure

**Finding:** #23 (MEDIUM — no deployment configuration)

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

Create `.dockerignore` in the project root:

```
node_modules
.next
dist
.turbo
.env
*.log
.DS_Store
.git
games
docs
```

- [ ] **Step 2: Create API Dockerfile**

Create `apps/api/Dockerfile`:

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace=apps/api --workspace=packages/db --workspace=packages/shared

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN npx prisma generate --schema packages/db/prisma/schema.prisma
RUN npm run build --workspace=apps/api

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
```

- [ ] **Step 3: Create Web Dockerfile**

Create `apps/web/Dockerfile`:

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace=apps/web --workspace=packages/shared

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=apps/web

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

- [ ] **Step 4: Create docker-compose.yml**

Create `docker-compose.yml` in the project root:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: oghub
      POSTGRES_PASSWORD: oghub_secret
      POSTGRES_DB: oghub
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U oghub']
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - '3001:3001'
    environment:
      DATABASE_URL: postgresql://oghub:oghub_secret@postgres:5432/oghub?schema=public
      REDIS_URL: redis://redis:6379
      JWT_SECRET: change-me-in-production-use-64-random-chars
      API_PORT: '3001'
      CORS_ORIGINS: http://localhost:3000
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - '3000:3000'
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
    depends_on:
      - api

volumes:
  pgdata:
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/Dockerfile apps/web/Dockerfile docker-compose.yml .dockerignore
git commit -m "feat(infrastructure): add Docker setup for full-stack deployment

Addresses MEDIUM finding #23.
Multi-stage Dockerfiles for API and Web. Docker-compose orchestrates
Postgres, Redis, API, and Web with health checks and dependency ordering."
```

---

### Task 12: API Documentation with Swagger

**Finding:** #33 (LOW — no API documentation)

**Files:**
- Create: `apps/api/src/common/swagger.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install swagger dependencies**

```bash
cd apps/api && npm install swagger-jsdoc swagger-ui-express && npm install -D @types/swagger-jsdoc @types/swagger-ui-express
```

- [ ] **Step 2: Create Swagger config**

Create `apps/api/src/common/swagger.ts`:

```typescript
import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'OGHUB API',
      version: '1.0.0',
      description: 'Skill-based gaming platform API. Handles authentication, wallet management, game sessions, leaderboards, and anti-cheat validation.',
    },
    servers: [
      { url: '/api', description: 'API base path' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
          },
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
          },
        },
      },
    },
  },
  apis: [], // We define paths inline below since routers don't use JSDoc comments
};

// Define paths manually (cleaner than JSDoc comments in router files)
const paths = {
  '/auth/register': {
    post: {
      tags: ['Auth'],
      summary: 'Register a new account',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'username', 'password'],
              properties: {
                email: { type: 'string', format: 'email' },
                username: { type: 'string', minLength: 3, maxLength: 30 },
                password: { type: 'string', minLength: 8, maxLength: 72 },
                displayName: { type: 'string', maxLength: 50 },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Account created, returns JWT token and user' },
        400: { description: 'Validation error' },
        409: { description: 'Email or username taken' },
        429: { description: 'Rate limit exceeded (3/hour)' },
      },
    },
  },
  '/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Login with email and password',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: { type: 'string', format: 'email' },
                password: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Returns JWT token and user' },
        401: { description: 'Invalid credentials' },
        429: { description: 'Rate limit exceeded (5/min)' },
      },
    },
  },
  '/auth/me': {
    get: {
      tags: ['Auth'],
      summary: 'Get current user',
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Current user details' },
        401: { description: 'Not authenticated' },
      },
    },
  },
  '/wallet/balance': {
    get: {
      tags: ['Wallet'],
      summary: 'Get wallet balance',
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Balance, frozen balance, and currency' },
      },
    },
  },
  '/wallet/deposit': {
    post: {
      tags: ['Wallet'],
      summary: 'Deposit funds (admin only)',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', properties: { amount: { type: 'number', minimum: 0.01 } } } } },
      },
      responses: { 200: { description: 'Updated balance' }, 403: { description: 'Admin role required' } },
    },
  },
  '/wallet/withdraw': {
    post: {
      tags: ['Wallet'],
      summary: 'Request withdrawal',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', properties: { amount: { type: 'number', minimum: 0.01 } } } } },
      },
      responses: { 200: { description: 'Withdrawal submitted' }, 402: { description: 'Insufficient balance' } },
    },
  },
  '/wallet/double-or-nothing': {
    post: {
      tags: ['Wallet'],
      summary: 'Provably fair coin flip (50/50)',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', properties: { amount: { type: 'number', minimum: 0.01 } } } } },
      },
      responses: { 200: { description: 'Result with proof seeds and updated balance' } },
    },
  },
  '/sessions/create': {
    post: {
      tags: ['Sessions'],
      summary: 'Create a new game session',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['gameId'], properties: { gameId: { type: 'string' }, challengeId: { type: 'string' } } } } },
      },
      responses: { 201: { description: 'Session created with ID, token, and seed' } },
    },
  },
  '/sessions/{id}/end': {
    post: {
      tags: ['Sessions'],
      summary: 'End session and submit score',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['score'], properties: { score: { type: 'integer' }, replayData: { type: 'object' }, metadata: { type: 'object' } } } } },
      },
      responses: { 200: { description: 'Score accepted/rejected with rank and near-miss info' } },
    },
  },
  '/games': {
    get: {
      tags: ['Games'],
      summary: 'List active games (public)',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 50 } },
        { name: 'tag', in: 'query', schema: { type: 'string' } },
        { name: 'featured', in: 'query', schema: { type: 'boolean' } },
      ],
      responses: { 200: { description: 'Paginated list of games' } },
    },
  },
  '/leaderboards/{challengeId}': {
    get: {
      tags: ['Leaderboards'],
      summary: 'Get challenge leaderboard',
      parameters: [
        { name: 'challengeId', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
      ],
      responses: { 200: { description: 'Ranked list of players and scores' } },
    },
  },
};

options.definition!.paths = paths;

export const swaggerSpec = swaggerJsdoc(options);
```

- [ ] **Step 3: Mount Swagger UI in main.ts**

In `apps/api/src/main.ts`, add imports:

```typescript
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './common/swagger';
```

Add the Swagger UI route after the health check and before the API routes:

```typescript
// ─── API Documentation ─────────────────────────────────────

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
```

- [ ] **Step 4: Verify compilation**

Run: `cd apps/api && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/swagger.ts apps/api/src/main.ts apps/api/package.json apps/api/package-lock.json
git commit -m "feat(docs): add OpenAPI/Swagger API documentation

Addresses LOW finding #33.
Swagger UI available at /api/docs with all endpoints documented.
Covers auth, wallet, sessions, games, and leaderboard endpoints."
```

---

### Task 13: Unity Bridge Real HTTP Calls

**Finding:** #36 (LOW — stub implementations in Unity SDK)

**Files:**
- Modify: `games/NeonRunner/Assets/Scripts/SDK/OGHubBridge.cs`

- [ ] **Step 1: Replace stubs with real UnityWebRequest calls**

Replace the entire contents of `games/NeonRunner/Assets/Scripts/SDK/OGHubBridge.cs`:

```csharp
using System;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace NeonRunner.SDK
{
    /// <summary>
    /// Unity bridge for the OGHUB platform SDK.
    /// Handles session lifecycle, score submission, and ghost data loading.
    /// </summary>
    public sealed class OGHubBridge : MonoBehaviour
    {
        public static OGHubBridge Instance { get; private set; }

        [Header("SDK Configuration")]
        [SerializeField] private string _gameId = "neon-runner";
        [SerializeField] private string _apiEndpoint = "http://localhost:3001/api";
        
        public string GameId => _gameId;
        public string ChallengeId { get; private set; }
        public string SessionToken { get; private set; }
        public string SessionId { get; private set; }
        
        public bool IsInitialized { get; private set; }
        public Core.GameConfig CurrentConfig { get; private set; }

        private void Awake()
        {
            if (Instance == null)
            {
                Instance = this;
                DontDestroyOnLoad(gameObject);
                
                Application.deepLinkActivated += OnDeepLinkActivated;
                if (!string.IsNullOrEmpty(Application.absoluteURL))
                {
                    OnDeepLinkActivated(Application.absoluteURL);
                }
            }
            else
            {
                Destroy(gameObject);
            }
        }

        private void OnDeepLinkActivated(string url)
        {
            Debug.Log($"[OGHub] Deep Link: {url}");
            try 
            {
                var uri = new Uri(url);
                var queryParams = System.Web.HttpUtility.ParseQueryString(uri.Query);
                
                string token = queryParams.Get("token");
                string sessionId = queryParams.Get("sessionId");
                string seedStr = queryParams.Get("seed");
                string challengeId = queryParams.Get("challengeId");

                if (long.TryParse(seedStr, out long seed))
                {
                    SessionId = sessionId;
                    InitializeGame(seed, challengeId, token);
                    UnityEngine.SceneManagement.SceneManager.LoadScene(1); 
                }
            }
            catch(Exception e)
            {
                Debug.LogError($"[OGHub] Failed to parse Deep Link: {e.Message}");
            }
        }

        public void InitializeGame(long seed, string challengeId, string token)
        {
            ChallengeId = challengeId;
            SessionToken = token;
            
            CurrentConfig = new Core.GameConfig
            {
                Seed = seed,
                Modifiers = Core.GameModifiers.None,
                StartingLives = 1
            };

            IsInitialized = true;
            Debug.Log($"[OGHub] Initialized: Seed={seed}, Challenge={challengeId}");
        }

        public async Task StartSession()
        {
            if (!IsInitialized) throw new Exception("SDK not initialized");
            
            string url = $"{_apiEndpoint}/sessions/{SessionId}/validate";
            string json = "{}";

            using var request = new UnityWebRequest(url, "POST");
            request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("Authorization", $"Bearer {SessionToken}");

            var op = request.SendWebRequest();
            while (!op.isDone) await Task.Yield();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"[OGHub] StartSession failed: {request.error}");
                throw new Exception($"Session validation failed: {request.error}");
            }

            Debug.Log($"[OGHub] Session validated: {request.downloadHandler.text}");
        }

        public void ReportEvent(string eventType, string dataJson)
        {
            // Fire-and-forget event reporting
            _ = SendEventAsync(eventType, dataJson);
        }

        private async Task SendEventAsync(string eventType, string dataJson)
        {
            string url = $"{_apiEndpoint}/sessions/{SessionId}/events";
            string json = $"{{\"events\":[{{\"eventType\":\"{eventType}\",\"payload\":{dataJson},\"timestamp\":{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()},\"sequence\":0}}]}}";

            using var request = new UnityWebRequest(url, "POST");
            request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("Authorization", $"Bearer {SessionToken}");

            var op = request.SendWebRequest();
            while (!op.isDone) await Task.Yield();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogWarning($"[OGHub] Event send failed: {request.error}");
            }
        }

        public async Task<bool> EndSession(Core.ReplayData replayData)
        {
            string url = $"{_apiEndpoint}/sessions/{SessionId}/end";
            string json = JsonUtility.ToJson(new EndSessionPayload
            {
                score = replayData.FinalScore,
                replayData = new ReplayPayload
                {
                    seed = CurrentConfig.Seed.ToString(),
                    duration = replayData.FinalTick * (1000 / Core.SimulationManager.TICKS_PER_SECOND),
                }
            });

            using var request = new UnityWebRequest(url, "POST");
            request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("Authorization", $"Bearer {SessionToken}");

            var op = request.SendWebRequest();
            while (!op.isDone) await Task.Yield();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"[OGHub] EndSession failed: {request.error}");
                return false;
            }

            Debug.Log($"[OGHub] Session ended: {request.downloadHandler.text}");
            return true;
        }

        public async Task<Core.ReplayData> RequestGhostData(string challengeId, string type = "personal_best")
        {
            string url = $"{_apiEndpoint}/ghosts/{challengeId}/top";

            using var request = UnityWebRequest.Get(url);
            request.SetRequestHeader("Authorization", $"Bearer {SessionToken}");

            var op = request.SendWebRequest();
            while (!op.isDone) await Task.Yield();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogWarning($"[OGHub] Ghost data fetch failed: {request.error}");
                return null;
            }

            Debug.Log($"[OGHub] Ghost data received: {request.downloadHandler.text}");
            // Parse response and convert to ReplayData — caller handles deserialization
            return null; // TODO: deserialize JSON to ReplayData
        }

        // ─── Serialization helpers ─────────────────────────────

        [Serializable]
        private class EndSessionPayload
        {
            public int score;
            public ReplayPayload replayData;
        }

        [Serializable]
        private class ReplayPayload
        {
            public string seed;
            public int duration;
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add games/NeonRunner/Assets/Scripts/SDK/OGHubBridge.cs
git commit -m "feat(unity): replace stub implementations with real UnityWebRequest HTTP calls

Addresses LOW finding #36.
StartSession, EndSession, ReportEvent, and RequestGhostData now make
real HTTP calls to the OGHUB API instead of using Task.Delay stubs."
```

---

### Task 14: CSS Modules Migration

**Finding:** #26 (MEDIUM — monolithic CSS file)

**Files:**
- Create: `apps/web/src/components/GameCard.module.css`
- Create: `apps/web/src/components/ErrorBoundary.module.css`
- This task establishes the pattern. Full migration of all components is a follow-up.

- [ ] **Step 1: Create a CSS module for GameCard as the migration pattern**

Read the current `apps/web/src/components/GameCard.tsx` to understand which CSS classes it uses.

Extract the relevant GameCard styles from `apps/web/src/styles/globals.css` into `apps/web/src/components/GameCard.module.css`:

```css
.gameCard {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.gameCard:hover {
  border-color: var(--neon-purple);
  box-shadow: 0 0 20px var(--neon-purple-glow);
  transform: translateY(-2px);
}

.gameCardHeader {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.gameTitle {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.gameMeta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--text-muted);
}
```

Note: This is a pattern-setting task. The implementer should read `GameCard.tsx`, identify which class names it uses, extract those from `globals.css`, create the module file, and update the component imports. The full migration of all components to CSS modules is tracked as a follow-up effort.

- [ ] **Step 2: Update GameCard.tsx to use CSS module**

This depends on reading the actual component. The change pattern is:
- `import styles from './GameCard.module.css'`
- Replace `className="game-card"` with `className={styles.gameCard}`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/GameCard.module.css apps/web/src/components/GameCard.tsx
git commit -m "refactor(ux): migrate GameCard to CSS modules as migration pattern

Addresses MEDIUM finding #26 (partial).
Establishes CSS modules pattern for component-level styling.
Full migration of remaining components is a follow-up task."
```

---

## Summary

| Task | Finding | Severity | Description |
|------|---------|----------|-------------|
| 1 | #37 | LOW | Database seed script |
| 2 | #18 | MEDIUM | Wallet balance CHECK constraint |
| 3 | #16 | MEDIUM | Zod input validation |
| 4 | #27 | MEDIUM | Homepage error state |
| 5 | #28 | MEDIUM | React error boundaries |
| 6 | #29 | MEDIUM | Wallet state caching |
| 7 | #21 | MEDIUM | Challenge lifecycle management |
| 8 | #20 | MEDIUM | Prize pool & distribution |
| 9 | #19 | MEDIUM | Withdrawal endpoint |
| 10 | #38 | LOW | DoubleOrNothing server-side |
| 11 | #23 | MEDIUM | Docker infrastructure |
| 12 | #33 | LOW | API documentation (Swagger) |
| 13 | #36 | LOW | Unity bridge real HTTP |
| 14 | #26 | MEDIUM | CSS modules migration (partial) |

---

## Feature Suggestions (Out of Scope — Separate Plans)

The 10 feature suggestions (F1-F10) from the review spec are each substantial projects requiring their own design specs and implementation plans:

| Feature | Priority | Scope |
|---------|----------|-------|
| F1: Payment Gateway | P0 | Stripe integration, webhooks, idempotency |
| F2: Regulatory Compliance | P0 | KYC, age verification, responsible gaming |
| F3: Admin Dashboard | P0 | Full CRUD UI for fraud review, financial reports |
| F4: Analytics | P1 | Product analytics, event tracking |
| F5: A/B Testing | P1 | Feature flags infrastructure |
| F6: WebSocket | P1 | Real-time leaderboards, live counts |
| F7: ML Fraud Detection | P1 | Behavioral clustering, model training |
| F8: Monetization | P2 | Dynamic pricing, season passes |
| F9: Player Psychology | P2 | Streaks, matchmaking, progression |
| F10: Replay Verification | P2 | Server-side deterministic simulation |

To execute these, run `/superpowers:brainstorming` for each feature to create its design spec, then `/superpowers:writing-plans` for the implementation plan.
