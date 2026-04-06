# Profile & Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all mock data on the profile page with real stats, add profile editing (display name), real match history, and a "my rooms" filter. Make the profile a live, data-driven page.

**Architecture:** Add a `PATCH /api/auth/me` endpoint for profile updates, a `GET /api/users/me/stats` endpoint for aggregated stats, a `GET /api/users/me/history` endpoint for match history, and add `mine=true` query param to the existing rooms router. Frontend gets a profile edit modal and real data throughout.

**Tech Stack:** Express.js API, Prisma, React 18, Next.js 14, Framer Motion, pure CSS

---

### Task 1: Profile Update API Endpoint

**Files:**
- Modify: `apps/api/src/auth/auth.router.ts`
- Modify: `apps/api/src/common/schemas.ts`

Add `PATCH /api/auth/me` to update displayName (and avatarUrl for future use).

- [ ] **Step 1: Add updateProfileSchema to schemas.ts**

Add after the existing schemas:

```typescript
export const updateProfileSchema = z.object({
  displayName: z.string().max(50).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});
```

- [ ] **Step 2: Add PATCH /api/auth/me endpoint to auth.router.ts**

Read `apps/api/src/auth/auth.router.ts` first. Add after the existing `GET /api/auth/me` endpoint:

```typescript
// ─── Update Profile ─────────────────────────────────────────

authRouter.patch('/me', authGuard, async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = validate(updateProfileSchema, req.body);

    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data,
      select: { id: true, email: true, username: true, displayName: true, avatarUrl: true, role: true, createdAt: true },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/auth/auth.router.ts apps/api/src/common/schemas.ts
git commit -m "feat(api): add PATCH /api/auth/me for profile updates"
```

---

### Task 2: User Stats API Endpoint

**Files:**
- Create: `apps/api/src/auth/user-stats.ts`
- Modify: `apps/api/src/auth/auth.router.ts`

Aggregate real stats: total games played, win count, win rate, total earnings from prize payouts.

- [ ] **Step 1: Create user-stats.ts**

```typescript
import { prisma } from '../main';

export async function getUserStats(userId: string) {
  // Total game sessions completed
  const totalGames = await prisma.gameSession.count({
    where: { userId, status: 'COMPLETED' },
  });

  // Total room participations completed (rooms with status COMPLETED)
  const roomsPlayed = await prisma.roomParticipant.count({
    where: {
      userId,
      room: { status: 'COMPLETED' },
    },
  });

  // Prize payouts (wins)
  const prizePayouts = await prisma.walletTransaction.findMany({
    where: {
      wallet: { userId },
      type: 'PRIZE_PAYOUT',
    },
    select: { amount: true },
  });

  const totalEarnings = prizePayouts.reduce(
    (sum, tx) => sum + parseFloat(tx.amount.toString()),
    0
  );
  const wins = prizePayouts.length;

  // Win rate from rooms (wins / rooms played)
  const winRate = roomsPlayed > 0 ? Math.round((wins / roomsPlayed) * 100) : 0;

  return {
    totalGames,
    roomsPlayed,
    wins,
    winRate,
    totalEarnings: totalEarnings.toFixed(2),
  };
}
```

- [ ] **Step 2: Add GET /api/auth/me/stats to auth.router.ts**

```typescript
import { getUserStats } from './user-stats';

// ─── User Stats ─────────────────────────────────────────────

authRouter.get('/me/stats', authGuard, async (req: AuthenticatedRequest, res, next) => {
  try {
    const stats = await getUserStats(req.user!.userId);
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/auth/user-stats.ts apps/api/src/auth/auth.router.ts
git commit -m "feat(api): add GET /api/auth/me/stats for user stats aggregation"
```

---

### Task 3: Match History API Endpoint

**Files:**
- Modify: `apps/api/src/auth/auth.router.ts`

Return the user's recent completed room participations with scores and earnings.

- [ ] **Step 1: Add GET /api/auth/me/history**

```typescript
// ─── Match History ──────────────────────────────────────────

authRouter.get('/me/history', authGuard, async (req: AuthenticatedRequest, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));

    const [participations, total] = await Promise.all([
      prisma.roomParticipant.findMany({
        where: {
          userId: req.user!.userId,
          room: { status: 'COMPLETED' },
        },
        include: {
          room: {
            include: {
              game: { select: { title: true } },
              _count: { select: { participants: true } },
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.roomParticipant.count({
        where: {
          userId: req.user!.userId,
          room: { status: 'COMPLETED' },
        },
      }),
    ]);

    // Check which rooms had prize payouts for this user
    const roomIds = participations.map(p => p.roomId);
    const payouts = await prisma.walletTransaction.findMany({
      where: {
        wallet: { userId: req.user!.userId },
        type: 'PRIZE_PAYOUT',
        referenceId: { in: roomIds },
      },
      select: { referenceId: true, amount: true },
    });
    const payoutMap = new Map(payouts.map(p => [p.referenceId, p.amount.toString()]));

    res.json({
      success: true,
      data: participations.map(p => ({
        roomId: p.roomId,
        game: p.room.game.title,
        format: p.room.format,
        entryFee: p.room.entryFee.toString(),
        players: p.room._count.participants,
        result: payoutMap.has(p.roomId) ? 'W' : 'L',
        earnings: payoutMap.get(p.roomId) || null,
        date: p.room.completedAt?.toISOString() || p.joinedAt.toISOString(),
      })),
      total,
      page,
      hasMore: page * limit < total,
    });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/auth/auth.router.ts
git commit -m "feat(api): add GET /api/auth/me/history for match history"
```

---

### Task 4: My Rooms Filter on Rooms Router

**Files:**
- Modify: `apps/api/src/rooms/rooms.router.ts`

Add `mine=true` query parameter to the rooms list endpoint to filter rooms where the current user is a participant.

- [ ] **Step 1: Add mine filter to GET /api/rooms**

Read the rooms router. In the list endpoint, after building the `where` object, add:

```typescript
const mine = req.query.mine === 'true';
if (mine) {
  where.participants = { some: { userId } };
}
```

Make sure `userId` is available — it comes from `req.user!.userId`.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/rooms/rooms.router.ts
git commit -m "feat(api): add mine=true filter to rooms list endpoint"
```

---

### Task 5: Frontend Profile Edit + Real Data

**Files:**
- Modify: `apps/web/src/hooks/useAuth.tsx` (add updateProfile + refreshUser)
- Modify: `apps/web/src/app/profile/page.tsx` (real stats, history, edit, my rooms)
- Modify: `apps/web/src/styles/globals.css` (add edit profile CSS)

Wire everything together: profile edit modal, real stats, real match history, real active rooms.

- [ ] **Step 1: Add updateProfile and refreshUser to useAuth**

In `apps/web/src/hooks/useAuth.tsx`, add to the `AuthContextType` interface:

```typescript
updateProfile: (data: { displayName?: string }) => Promise<void>;
```

Add the implementation inside `AuthProvider`:

```typescript
const updateProfile = useCallback(async (data: { displayName?: string }) => {
  const t = getStoredToken();
  if (!t) throw new Error('Not authenticated');
  const updated = await api<User>('/api/auth/me', { method: 'PATCH', body: data, token: t });
  setUser(updated);
}, []);
```

Add `updateProfile` to the context Provider value.

- [ ] **Step 2: Add profile edit CSS to globals.css**

Append after the settings CSS:

```css
/* --- Profile Edit ------------------------------------------------ */

.profile-edit-form {
  padding: var(--space-md);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-md);
}

.profile-edit-row {
  margin-bottom: var(--space-md);
}

.profile-edit-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: var(--space-xs);
  display: block;
}

.profile-edit-actions {
  display: flex;
  gap: var(--space-sm);
}

.profile-save-btn {
  padding: 10px 24px;
  background: var(--primary);
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.875rem;
  color: white;
  transition: background var(--transition-fast);
}

.profile-save-btn:hover {
  background: var(--primary-hover);
}

.profile-cancel-btn {
  padding: 10px 24px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.profile-cancel-btn:hover {
  border-color: var(--border-hover);
}
```

- [ ] **Step 3: Rewrite the profile page**

Replace the entire content of `apps/web/src/app/profile/page.tsx`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { useRooms, RoomListItem } from '@/hooks/useRooms';
import { api, getStoredToken } from '@/lib/api';

interface UserStats {
  totalGames: number;
  roomsPlayed: number;
  wins: number;
  winRate: number;
  totalEarnings: string;
}

interface MatchHistoryItem {
  roomId: string;
  game: string;
  format: string;
  entryFee: string;
  players: number;
  result: 'W' | 'L';
  earnings: string | null;
  date: string;
}

const FORMAT_LABELS: Record<string, string> = {
  ONE_V_ONE: '1v1',
  BEST_OF_3: 'Bo3',
  FFA_5: 'FFA 5',
  FFA_10: 'FFA 10',
  FFA_20: 'FFA 20',
};

const MOCK_ACHIEVEMENTS = [
  { label: '10 Wins', earned: true },
  { label: 'First $100', earned: true },
  { label: '5 Win Streak', earned: true },
  { label: 'Event Winner', earned: false },
  { label: '100 Games', earned: false },
  { label: 'Top 3 Monthly', earned: false },
];

export default function ProfilePage() {
  const { user, logout, updateProfile } = useAuth();
  const { wallet } = useWallet();
  const { listRooms } = useRooms();
  const router = useRouter();

  const [stats, setStats] = useState<UserStats | null>(null);
  const [history, setHistory] = useState<MatchHistoryItem[]>([]);
  const [activeRooms, setActiveRooms] = useState<RoomListItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;

    // Fetch stats, history, and active rooms in parallel
    const [statsData, historyData, roomsData] = await Promise.allSettled([
      api<UserStats>('/api/auth/me/stats', { token }),
      api<MatchHistoryItem[]>('/api/auth/me/history', { token }),
      listRooms({ status: 'WAITING', limit: 50 }),
    ]);

    if (statsData.status === 'fulfilled') setStats(statsData.value);
    if (historyData.status === 'fulfilled') setHistory(historyData.value);
    if (roomsData.status === 'fulfilled') setActiveRooms(roomsData.value.rooms);
  }, [listRooms]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  if (!user) {
    router.push('/login');
    return null;
  }

  const handleEdit = () => {
    setEditName(user.displayName || '');
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ displayName: editName || undefined });
      setEditing(false);
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="profile-page">
      {/* Player Card */}
      <motion.div
        className="player-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="player-card-header">
          <div className="player-avatar-lg">
            {(user.displayName || user.username)[0].toUpperCase()}
          </div>
          <div className="player-identity">
            <h1 className="player-display-name">{user.displayName || user.username}</h1>
            <p className="player-username">@{user.username}</p>
          </div>
        </div>

        <div className="player-stats">
          <div className="player-stat">
            <span className="player-stat-value">{stats?.totalGames ?? '-'}</span>
            <span className="player-stat-label">Played</span>
          </div>
          <div className="player-stat">
            <span className="player-stat-value">{stats ? `${stats.winRate}%` : '-'}</span>
            <span className="player-stat-label">Win Rate</span>
          </div>
          <div className="player-stat">
            <span className="player-stat-value player-stat-earnings">
              {stats ? `$${stats.totalEarnings}` : '-'}
            </span>
            <span className="player-stat-label">Earnings</span>
          </div>
        </div>
      </motion.div>

      {/* Edit Profile */}
      {editing ? (
        <div className="profile-edit-form">
          <div className="profile-edit-row">
            <label className="profile-edit-label">Display Name</label>
            <input
              className="form-input"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={50}
              placeholder="Enter display name"
            />
          </div>
          <div className="profile-edit-actions">
            <button className="profile-save-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="profile-cancel-btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <section className="profile-section">
          <button className="settings-row" onClick={handleEdit}>
            <span>Edit Profile</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </section>
      )}

      {/* Active Rooms */}
      <section className="profile-section">
        <div className="section-header">
          <h2 className="section-title">Your Active Rooms</h2>
        </div>
        {activeRooms.length > 0 ? (
          <div className="rooms-list">
            {activeRooms.map((room, i) => (
              <motion.div
                key={room.id}
                className="room-card"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => router.push(`/rooms/${room.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div className="room-card-top">
                  <div className="room-creator">
                    <div className="room-avatar">{room.gameTitle[0]}</div>
                    <span className="room-username">{room.gameTitle}</span>
                  </div>
                  <span className="room-format">{FORMAT_LABELS[room.format] || room.format}</span>
                </div>
                <div className="room-card-bottom">
                  <div className="room-money">
                    <span className="room-fee">${room.entryFee}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)' }}>
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                    <span className="room-prize">${room.prizePool}</span>
                  </div>
                  <div className="room-spots">
                    <div className="room-spots-bar">
                      <div className="room-spots-fill" style={{ width: `${(room.currentPlayers / room.maxPlayers) * 100}%` }} />
                    </div>
                    <span className="room-spots-text">{room.currentPlayers}/{room.maxPlayers}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="empty-state-inline">
            <p>No active rooms</p>
          </div>
        )}
      </section>

      {/* Match History */}
      <section className="profile-section">
        <div className="section-header">
          <h2 className="section-title">Match History</h2>
        </div>
        {history.length > 0 ? (
          <div className="match-history">
            {history.map((match, i) => (
              <motion.div
                key={match.roomId}
                className="match-row"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <div className={`match-result ${match.result === 'W' ? 'match-win' : 'match-loss'}`}>
                  {match.result}
                </div>
                <div className="match-info">
                  <div className="match-game">{match.game}</div>
                  <div className="match-meta">{FORMAT_LABELS[match.format] || match.format} &middot; {match.players} players &middot; {formatDate(match.date)}</div>
                </div>
                <div className="match-right">
                  <div className="match-score">${match.entryFee}</div>
                  <div className={`match-money ${match.result === 'W' ? 'money-positive' : 'money-negative'}`}>
                    {match.result === 'W' && match.earnings ? `+$${match.earnings}` : `-$${match.entryFee}`}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="empty-state-inline">
            <p>No matches yet</p>
          </div>
        )}
      </section>

      {/* Achievements (still mock — no backend model yet) */}
      <section className="profile-section">
        <div className="section-header">
          <h2 className="section-title">Achievements</h2>
        </div>
        <div className="achievements-scroll">
          {MOCK_ACHIEVEMENTS.map((achievement, i) => (
            <div
              key={i}
              className={`achievement-badge ${achievement.earned ? 'achievement-earned' : 'achievement-locked'}`}
            >
              {achievement.label}
            </div>
          ))}
        </div>
      </section>

      {/* Settings */}
      <section className="profile-section">
        <div className="settings-list">
          <button className="settings-row">
            <span>Notifications</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <button className="settings-row settings-row-danger" onClick={() => { logout(); router.push('/'); }}>
            <span>Sign Out</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/useAuth.tsx apps/web/src/app/profile/page.tsx apps/web/src/styles/globals.css
git commit -m "feat(web): wire profile page with real stats, history, edit, and active rooms"
```

---
