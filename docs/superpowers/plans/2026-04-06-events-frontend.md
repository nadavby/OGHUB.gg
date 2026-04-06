# Events System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Challenges/Events API router and wire the frontend events page to display live, upcoming, and past challenges with entry flow, leaderboards, and prize pool info.

**Architecture:** The `Challenge` model already exists in Prisma with full lifecycle (UPCOMING/ACTIVE/COMPLETED/CANCELLED), entry fees, prize pools, and a background worker for status transitions + prize distribution. We add a read-only challenges API router (no admin CRUD — challenges are created via DB seeds/admin tools for now), then wire the frontend events page to fetch and render them with tabs, entry buttons, and inline leaderboards.

**Tech Stack:** Express.js API, Prisma, Redis (leaderboards), React 18, Next.js 14, Framer Motion, pure CSS

---

### Task 1: Challenges API Router

**Files:**
- Create: `apps/api/src/challenges/challenges.router.ts`
- Modify: `apps/api/src/main.ts` (register router)

A read-only router exposing challenges to the frontend. All endpoints require auth (authGuard).

- [ ] **Step 1: Create the challenges router**

```typescript
import { Router } from 'express';
import { prisma, redis } from '../main';
import { authGuard, AuthenticatedRequest } from '../common/auth';
import { AppError } from '../common/error-handler';

export const challengesRouter = Router();

challengesRouter.use(authGuard);

// ─── List Challenges ────────────────────────────────────────
// GET /api/challenges?status=ACTIVE&gameId=X&page=1&limit=20

challengesRouter.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const status = req.query.status as string || undefined;
    const gameId = req.query.gameId as string || undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));

    const where: any = {};
    if (status) where.status = status;
    if (gameId) where.gameId = gameId;

    const [challenges, total] = await Promise.all([
      prisma.challenge.findMany({
        where,
        include: {
          game: { select: { title: true, slug: true } },
          _count: { select: { sessions: true } },
        },
        orderBy: [
          { status: 'asc' }, // ACTIVE first, then UPCOMING, then COMPLETED
          { startsAt: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.challenge.count({ where }),
    ]);

    res.json({
      success: true,
      data: challenges.map(c => ({
        id: c.id,
        gameId: c.gameId,
        gameTitle: c.game.title,
        gameSlug: c.game.slug,
        title: c.title,
        description: c.description,
        entryFee: c.entryFee.toString(),
        prizePool: c.prizePool.toString(),
        platformFee: c.platformFee.toString(),
        maxEntries: c.maxEntries,
        entries: c._count.sessions,
        startsAt: c.startsAt?.toISOString() || null,
        endsAt: c.endsAt?.toISOString() || null,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
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

// ─── Get Challenge Detail ───────────────────────────────────
// GET /api/challenges/:id

challengesRouter.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const challenge = await prisma.challenge.findUnique({
      where: { id: req.params.id },
      include: {
        game: { select: { title: true, slug: true } },
        _count: { select: { sessions: true } },
      },
    });

    if (!challenge) throw new AppError('Challenge not found', 404);

    // Get top 10 from Redis leaderboard
    const leaderboardKey = `leaderboard:${challenge.id}`;
    const topScores = await redis.zrevrange(leaderboardKey, 0, 9, 'WITHSCORES');

    const leaderboard: { userId: string; username: string; score: number; rank: number }[] = [];
    for (let i = 0; i < topScores.length; i += 2) {
      const userId = topScores[i];
      const score = parseFloat(topScores[i + 1]);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, displayName: true },
      });
      leaderboard.push({
        userId,
        username: user?.displayName || user?.username || 'Unknown',
        score,
        rank: Math.floor(i / 2) + 1,
      });
    }

    // Check if current user has entered
    const userEntry = await prisma.gameSession.findFirst({
      where: {
        challengeId: challenge.id,
        userId: req.user!.userId,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true },
    });

    res.json({
      success: true,
      data: {
        id: challenge.id,
        gameId: challenge.gameId,
        gameTitle: challenge.game.title,
        gameSlug: challenge.game.slug,
        title: challenge.title,
        description: challenge.description,
        entryFee: challenge.entryFee.toString(),
        prizePool: challenge.prizePool.toString(),
        maxEntries: challenge.maxEntries,
        entries: challenge._count.sessions,
        startsAt: challenge.startsAt?.toISOString() || null,
        endsAt: challenge.endsAt?.toISOString() || null,
        status: challenge.status,
        leaderboard,
        userEntry: userEntry ? { sessionId: userEntry.id, status: userEntry.status } : null,
      },
    });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 2: Register in main.ts**

Add to `apps/api/src/main.ts`:

```typescript
import { challengesRouter } from './challenges/challenges.router';
// ... after other app.use() calls:
app.use('/api/challenges', challengesRouter);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/challenges/challenges.router.ts apps/api/src/main.ts
git commit -m "feat(api): add challenges router with list and detail endpoints"
```

---

### Task 2: useChallenges Hook

**Files:**
- Create: `apps/web/src/hooks/useChallenges.ts`

Follows the same pattern as `useRooms.ts` — raw fetch for paginated list, `api()` for detail.

- [ ] **Step 1: Create the hook**

```typescript
'use client';

import { useCallback } from 'react';
import { api, getStoredToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface ChallengeListItem {
  id: string;
  gameId: string;
  gameTitle: string;
  gameSlug: string;
  title: string;
  description: string | null;
  entryFee: string;
  prizePool: string;
  maxEntries: number | null;
  entries: number;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  createdAt: string;
}

export interface ChallengeDetail extends ChallengeListItem {
  leaderboard: { userId: string; username: string; score: number; rank: number }[];
  userEntry: { sessionId: string; status: string } | null;
}

interface ChallengeListResult {
  challenges: ChallengeListItem[];
  total: number;
  hasMore: boolean;
}

export function useChallenges() {
  const listChallenges = useCallback(async (params: {
    status?: string;
    gameId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<ChallengeListResult> => {
    const token = getStoredToken();
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.gameId) query.set('gameId', params.gameId);
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());

    const url = `${API_URL}/api/challenges${query.toString() ? `?${query}` : ''}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, { method: 'GET', headers });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load challenges');
    return { challenges: json.data, total: json.total, hasMore: json.hasMore };
  }, []);

  const getChallenge = useCallback(async (id: string): Promise<ChallengeDetail> => {
    const token = getStoredToken();
    return api<ChallengeDetail>(`/api/challenges/${id}`, { token: token ?? undefined });
  }, []);

  return { listChallenges, getChallenge };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/useChallenges.ts
git commit -m "feat(web): add useChallenges hook for challenges API"
```

---

### Task 3: Events Page — Challenge List with Tabs

**Files:**
- Modify: `apps/web/src/app/events/page.tsx`
- Modify: `apps/web/src/styles/globals.css` (add event card CSS)

Replace the placeholder events page with a real implementation fetching challenges by status tab (Live/Upcoming/Past).

- [ ] **Step 1: Add event card CSS to globals.css**

Replace the existing events CSS section (`.event-featured-card` etc.) with:

```css
/* --- Events Page ------------------------------------------------- */

.events-tabs {
  display: flex;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
}

.event-card {
  padding: var(--space-md);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-sm);
  transition: border-color var(--transition-fast);
  cursor: pointer;
}

.event-card:hover {
  border-color: var(--border-hover);
}

.event-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-sm);
}

.event-title {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.event-status-badge {
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.event-status-active {
  background: rgba(16, 185, 129, 0.15);
  color: var(--win);
}

.event-status-upcoming {
  background: rgba(59, 130, 246, 0.15);
  color: var(--trust);
}

.event-status-completed {
  background: rgba(138, 138, 138, 0.15);
  color: var(--text-secondary);
}

.event-game {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-bottom: var(--space-sm);
}

.event-description {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-bottom: var(--space-sm);
  line-height: 1.4;
}

.event-stats {
  display: flex;
  gap: var(--space-md);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--border);
}

.event-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.event-stat-value {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.event-stat-value-prize {
  color: var(--money);
}

.event-stat-label {
  font-size: 0.6875rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.event-time {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: var(--space-xs);
}
```

- [ ] **Step 2: Rewrite the events page**

Replace the entire file content of `apps/web/src/app/events/page.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useChallenges, ChallengeListItem } from '@/hooks/useChallenges';

type Tab = 'ACTIVE' | 'UPCOMING' | 'COMPLETED';

const TABS: { value: Tab; label: string }[] = [
  { value: 'ACTIVE', label: 'Live' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'COMPLETED', label: 'Past' },
];

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'event-status-active',
  UPCOMING: 'event-status-upcoming',
  COMPLETED: 'event-status-completed',
  CANCELLED: 'event-status-completed',
};

function formatEventTime(startsAt: string | null, endsAt: string | null, status: string): string {
  if (status === 'ACTIVE' && endsAt) {
    const ms = new Date(endsAt).getTime() - Date.now();
    if (ms <= 0) return 'Ending soon';
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h remaining`;
    if (hours > 0) return `${hours}h ${mins}m remaining`;
    return `${mins}m remaining`;
  }
  if (status === 'UPCOMING' && startsAt) {
    const date = new Date(startsAt);
    return `Starts ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  }
  if (status === 'COMPLETED' && endsAt) {
    const date = new Date(endsAt);
    return `Ended ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  return '';
}

export default function EventsPage() {
  const router = useRouter();
  const { listChallenges } = useChallenges();
  const [tab, setTab] = useState<Tab>('ACTIVE');
  const [challenges, setChallenges] = useState<ChallengeListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listChallenges({ status: tab, limit: 20 })
      .then((result) => setChallenges(result.challenges))
      .catch(() => setChallenges([]))
      .finally(() => setLoading(false));
  }, [tab, listChallenges]);

  return (
    <div className="events-page" style={{ padding: 'var(--space-md) 0' }}>
      <h1 className="page-title">Events</h1>

      {/* Tabs */}
      <div className="events-tabs">
        {TABS.map(t => (
          <button
            key={t.value}
            className={`tag-btn ${tab === t.value ? 'tag-btn-active' : ''}`}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Challenge List */}
      {loading ? (
        <div className="empty-state-inline"><p>Loading events...</p></div>
      ) : challenges.length === 0 ? (
        <div className="empty-state">
          <p>{tab === 'ACTIVE' ? 'No live events right now' : tab === 'UPCOMING' ? 'No upcoming events' : 'No past events'}</p>
        </div>
      ) : (
        challenges.map((c, i) => (
          <motion.div
            key={c.id}
            className="event-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => router.push(`/events/${c.id}`)}
          >
            <div className="event-card-header">
              <span className="event-title">{c.title}</span>
              <span className={`event-status-badge ${STATUS_CLASS[c.status] || ''}`}>
                {c.status === 'ACTIVE' ? 'Live' : c.status}
              </span>
            </div>

            <div className="event-game">{c.gameTitle}</div>

            {c.description && (
              <div className="event-description">
                {c.description.length > 120 ? c.description.slice(0, 120) + '...' : c.description}
              </div>
            )}

            <div className="event-stats">
              <div className="event-stat">
                <span className="event-stat-value event-stat-value-prize">${c.prizePool}</span>
                <span className="event-stat-label">Prize Pool</span>
              </div>
              <div className="event-stat">
                <span className="event-stat-value">
                  {parseFloat(c.entryFee) > 0 ? `$${c.entryFee}` : 'Free'}
                </span>
                <span className="event-stat-label">Entry</span>
              </div>
              <div className="event-stat">
                <span className="event-stat-value">
                  {c.entries}{c.maxEntries ? `/${c.maxEntries}` : ''}
                </span>
                <span className="event-stat-label">Entries</span>
              </div>
            </div>

            <div className="event-time">
              {formatEventTime(c.startsAt, c.endsAt, c.status)}
            </div>
          </motion.div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/events/page.tsx apps/web/src/styles/globals.css
git commit -m "feat(web): build events page with live/upcoming/past tabs and challenge cards"
```

---

### Task 4: Event Detail Page

**Files:**
- Create: `apps/web/src/app/events/[id]/page.tsx`
- Modify: `apps/web/src/styles/globals.css` (add event detail CSS)

Shows full challenge details: description, prize pool, leaderboard, entry button (links to game with challengeId), and user's entry status.

- [ ] **Step 1: Add event detail CSS to globals.css**

Append after the event card CSS:

```css
/* --- Event Detail ------------------------------------------------ */

.event-detail-header {
  padding: var(--space-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-md);
}

.event-detail-title {
  font-family: var(--font-display);
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: var(--space-xs);
}

.event-detail-game {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: var(--space-md);
}

.event-detail-description {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: var(--space-md);
}

.event-detail-stats {
  display: flex;
  justify-content: space-between;
  padding: var(--space-md) 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.event-detail-stat {
  text-align: center;
}

.event-detail-stat-value {
  font-family: var(--font-mono);
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
}

.event-detail-stat-value-prize {
  color: var(--money);
}

.event-detail-stat-label {
  font-size: 0.6875rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-top: 2px;
}

.event-enter-btn {
  width: 100%;
  padding: 14px;
  background: var(--primary);
  border-radius: var(--radius-md);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.9375rem;
  color: white;
  margin: var(--space-md) 0;
  transition: background var(--transition-fast);
}

.event-enter-btn:hover {
  background: var(--primary-hover);
}

.event-enter-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.event-user-status {
  text-align: center;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-bottom: var(--space-md);
}

.event-user-status-entered {
  color: var(--win);
}
```

- [ ] **Step 2: Create the event detail page**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useChallenges, ChallengeDetail } from '@/hooks/useChallenges';
import { useAuth } from '@/hooks/useAuth';

function formatEventTime(startsAt: string | null, endsAt: string | null, status: string): string {
  if (status === 'ACTIVE' && endsAt) {
    const ms = new Date(endsAt).getTime() - Date.now();
    if (ms <= 0) return 'Ending soon';
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h remaining`;
    if (hours > 0) return `${hours}h ${mins}m remaining`;
    return `${mins}m remaining`;
  }
  if (status === 'UPCOMING' && startsAt) {
    const date = new Date(startsAt);
    return `Starts ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  }
  if (status === 'COMPLETED' && endsAt) {
    const date = new Date(endsAt);
    return `Ended ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  return '';
}

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { getChallenge } = useChallenges();

  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const challengeId = params.id as string;

  useEffect(() => {
    getChallenge(challengeId)
      .then(setChallenge)
      .catch((err) => setError(err.message || 'Challenge not found'))
      .finally(() => setLoading(false));
  }, [challengeId, getChallenge]);

  if (loading) return <div className="empty-state"><p>Loading event...</p></div>;
  if (!challenge) return <div className="empty-state"><p>{error || 'Event not found'}</p></div>;

  const canEnter = challenge.status === 'ACTIVE' && (!challenge.maxEntries || challenge.entries < challenge.maxEntries);
  const hasEntered = !!challenge.userEntry;
  const timeInfo = formatEventTime(challenge.startsAt, challenge.endsAt, challenge.status);

  const handleEnter = () => {
    if (!user) { router.push('/login'); return; }
    // Navigate to game page — the session create flow handles challenge entry
    router.push(`/games/${challenge.gameSlug}?challengeId=${challenge.id}`);
  };

  return (
    <div style={{ padding: 'var(--space-md) 0' }}>
      <motion.div
        className="event-detail-header"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className={`event-status-badge ${challenge.status === 'ACTIVE' ? 'event-status-active' : challenge.status === 'UPCOMING' ? 'event-status-upcoming' : 'event-status-completed'}`}>
          {challenge.status === 'ACTIVE' ? 'Live' : challenge.status}
        </span>

        <h1 className="event-detail-title">{challenge.title}</h1>
        <div className="event-detail-game">{challenge.gameTitle}</div>

        {challenge.description && (
          <div className="event-detail-description">{challenge.description}</div>
        )}

        {timeInfo && <div className="event-time">{timeInfo}</div>}

        <div className="event-detail-stats">
          <div className="event-detail-stat">
            <div className="event-detail-stat-value event-detail-stat-value-prize">${challenge.prizePool}</div>
            <div className="event-detail-stat-label">Prize Pool</div>
          </div>
          <div className="event-detail-stat">
            <div className="event-detail-stat-value">{parseFloat(challenge.entryFee) > 0 ? `$${challenge.entryFee}` : 'Free'}</div>
            <div className="event-detail-stat-label">Entry Fee</div>
          </div>
          <div className="event-detail-stat">
            <div className="event-detail-stat-value">{challenge.entries}{challenge.maxEntries ? `/${challenge.maxEntries}` : ''}</div>
            <div className="event-detail-stat-label">Entries</div>
          </div>
        </div>
      </motion.div>

      {/* Entry Status */}
      {hasEntered && (
        <div className="event-user-status event-user-status-entered">
          You've entered this event
        </div>
      )}

      {/* Enter Button */}
      {canEnter && (
        <button className="event-enter-btn" onClick={handleEnter}>
          {parseFloat(challenge.entryFee) > 0
            ? `Enter - $${challenge.entryFee}`
            : 'Enter Free'
          }
        </button>
      )}

      {challenge.status === 'UPCOMING' && (
        <div className="event-user-status">
          This event hasn't started yet
        </div>
      )}

      {/* Leaderboard */}
      <section className="game-section">
        <div className="section-header">
          <h2 className="section-title">Leaderboard</h2>
        </div>

        {challenge.leaderboard.length > 0 ? (
          <div className="leaderboard-list">
            {challenge.leaderboard.map((entry, i) => (
              <motion.div
                key={entry.userId}
                className="leaderboard-row"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.04 }}
              >
                <span className={`lb-rank ${entry.rank === 1 ? 'lb-rank-first' : ''}`}>
                  #{entry.rank}
                </span>
                <div className="lb-avatar">{entry.username[0].toUpperCase()}</div>
                <span className="lb-name">{entry.username}</span>
                <span className="lb-score">{entry.score.toLocaleString()}</span>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="empty-state-inline">
            <p>No scores yet</p>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/events/[id]/page.tsx apps/web/src/styles/globals.css
git commit -m "feat(web): add event detail page with leaderboard and entry flow"
```

---

### Task 5: Seed Sample Challenges

**Files:**
- Create: `packages/db/prisma/seed-challenges.ts`

Create a small seed script to insert sample challenges for development/testing. This ensures the events page has data to display.

- [ ] **Step 1: Create seed script**

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find or skip if no games exist
  const game = await prisma.game.findFirst({ where: { isActive: true } });
  if (!game) {
    console.log('No active games found — skipping challenge seed');
    return;
  }

  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;

  const challenges = [
    {
      gameId: game.id,
      title: 'Weekend Sprint',
      description: 'Race to the top of the leaderboard this weekend. Top 3 split the prize pool!',
      entryFee: 2.00,
      prizePool: 0,
      platformFee: 0.10,
      maxEntries: 100,
      startsAt: new Date(now.getTime() - oneDay),
      endsAt: new Date(now.getTime() + 2 * oneDay),
      status: 'ACTIVE' as const,
    },
    {
      gameId: game.id,
      title: 'High Roller Challenge',
      description: 'Higher stakes, bigger prizes. Show your skill against the best.',
      entryFee: 10.00,
      prizePool: 0,
      platformFee: 0.10,
      maxEntries: 50,
      startsAt: new Date(now.getTime() + 3 * oneDay),
      endsAt: new Date(now.getTime() + 5 * oneDay),
      status: 'UPCOMING' as const,
    },
    {
      gameId: game.id,
      title: 'Free Friday',
      description: 'Free entry — compete for bragging rights and a community prize pool.',
      entryFee: 0,
      prizePool: 50.00,
      platformFee: 0,
      maxEntries: null,
      startsAt: new Date(now.getTime() - 3 * oneDay),
      endsAt: new Date(now.getTime() - 1 * oneDay),
      status: 'COMPLETED' as const,
    },
  ];

  for (const data of challenges) {
    const existing = await prisma.challenge.findFirst({ where: { title: data.title, gameId: data.gameId } });
    if (existing) {
      console.log(`Challenge "${data.title}" already exists — skipping`);
      continue;
    }
    await prisma.challenge.create({ data });
    console.log(`Created challenge: ${data.title}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/prisma/seed-challenges.ts
git commit -m "feat(db): add challenge seed script for development"
```

---
