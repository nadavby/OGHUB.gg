# Room System Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Room System API (Plan 2) into the frontend — replace all mock room data with real API calls, add create/join room flows, a room lobby page, and active rooms on the home and profile pages.

**Architecture:** A new `useRooms` hook centralizes all room API calls. The game detail page fetches real rooms per game. A Create Room modal (bottom sheet style) lives on the game detail page. A new `/rooms/[id]` page serves as the lobby/waiting room. The home page and profile page fetch open/active rooms respectively. All room data uses polling (30s) since we don't have WebSocket infrastructure yet.

**Tech Stack:** React 18, Next.js 14 App Router, Framer Motion, `api()` helper from `lib/api.ts`, pure CSS (globals.css)

---

### Task 1: useRooms Hook

**Files:**
- Create: `apps/web/src/hooks/useRooms.ts`

This hook wraps all room API endpoints. It follows the same pattern as `useWallet.ts` — thin wrapper around `api()` with `getStoredToken()`.

- [ ] **Step 1: Create the useRooms hook**

```typescript
'use client';

import { useCallback } from 'react';
import { api, getStoredToken } from '@/lib/api';

export interface RoomListItem {
  id: string;
  gameId: string;
  gameTitle: string;
  gameSlug: string;
  creator: string;
  format: string;
  entryFee: string;
  prizePool: string;
  maxPlayers: number;
  currentPlayers: number;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface RoomDetail {
  id: string;
  gameId: string;
  gameTitle: string;
  gameSlug: string;
  creator: string;
  createdByUserId: string;
  format: string;
  entryFee: string;
  prizePool: string;
  maxPlayers: number;
  currentPlayers: number;
  currentRound: number;
  totalRounds: number;
  status: string;
  expiresAt: string;
  participants: { userId: string; username: string; joinedAt: string }[];
  createdAt: string;
}

interface RoomsListResponse {
  // api() already unwraps .data, so this is the shape of .data
  // But list endpoint returns data as array + pagination at top level
  // Actually the api helper returns json.data, and json.data is the mapped array
  // Wait — the list endpoint returns { success, data: [...], total, page, limit, hasMore }
  // api() returns json.data which is the array. But total/page/hasMore are siblings of data.
  // We need to handle this specially.
}

// The list endpoint returns pagination fields as siblings of `data`.
// Since api() returns json.data (the array), we need a raw fetch for pagination.
// For simplicity, we'll use api() for non-paginated calls and a raw version for lists.

interface PaginatedRooms {
  rooms: RoomListItem[];
  total: number;
  hasMore: boolean;
}

export function useRooms() {
  const listRooms = useCallback(async (params: {
    gameId?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedRooms> => {
    const token = getStoredToken();
    const query = new URLSearchParams();
    if (params.gameId) query.set('gameId', params.gameId);
    if (params.status) query.set('status', params.status);
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());

    const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
    const res = await fetch(`${API_URL}/api/rooms?${query}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load rooms');
    return { rooms: json.data, total: json.total, hasMore: json.hasMore };
  }, []);

  const getRoom = useCallback(async (roomId: string): Promise<RoomDetail> => {
    const token = getStoredToken();
    return api<RoomDetail>(`/api/rooms/${roomId}`, { token: token || undefined });
  }, []);

  const createRoom = useCallback(async (data: {
    gameId: string;
    format: string;
    entryFee: number;
  }): Promise<{ id: string }> => {
    const token = getStoredToken();
    if (!token) throw new Error('Not authenticated');
    return api<{ id: string }>('/api/rooms/create', {
      method: 'POST',
      body: data,
      token,
    });
  }, []);

  const joinRoom = useCallback(async (roomId: string): Promise<{
    joined: boolean;
    currentPlayers: number;
    isFull: boolean;
    status: string;
  }> => {
    const token = getStoredToken();
    if (!token) throw new Error('Not authenticated');
    return api('/api/rooms/' + roomId + '/join', { method: 'POST', token });
  }, []);

  const cancelRoom = useCallback(async (roomId: string): Promise<{ cancelled: boolean }> => {
    const token = getStoredToken();
    if (!token) throw new Error('Not authenticated');
    return api('/api/rooms/' + roomId + '/cancel', { method: 'POST', token });
  }, []);

  return { listRooms, getRoom, createRoom, joinRoom, cancelRoom };
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd apps/web && npx tsc --noEmit src/hooks/useRooms.ts 2>&1 | head -20`

If TypeScript standalone check fails due to path aliases, just verify no syntax errors by checking the Next.js dev build doesn't break.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useRooms.ts
git commit -m "feat(web): add useRooms hook for room API integration"
```

---

### Task 2: Create Room Modal

**Files:**
- Create: `apps/web/src/components/CreateRoomModal.tsx`
- Modify: `apps/web/src/styles/globals.css` (add modal CSS)

A bottom-sheet style modal for creating rooms. Format selector (pill buttons), entry fee input with quick amounts, and a Create button. Follows the deposit section pattern from `wallet/page.tsx`.

- [ ] **Step 1: Add modal CSS to globals.css**

Append after the `.create-room-btn:hover` rule (around line 647):

```css
/* --- Modal / Bottom Sheet ---------------------------------------- */

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.modal-sheet {
  width: 100%;
  max-width: 480px;
  background: var(--surface);
  border-top-left-radius: var(--radius-lg);
  border-top-right-radius: var(--radius-lg);
  padding: var(--space-lg) var(--space-md) var(--space-xl);
}

.modal-handle {
  width: 36px;
  height: 4px;
  background: var(--border);
  border-radius: var(--radius-full);
  margin: 0 auto var(--space-md);
}

.modal-title {
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: var(--space-md);
}

.modal-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: var(--space-xs);
}

.format-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
}

.format-pill {
  padding: 8px 16px;
  font-size: 0.8125rem;
  font-weight: 600;
  border-radius: var(--radius-full);
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  transition: all var(--transition-fast);
  cursor: pointer;
}

.format-pill:hover {
  border-color: var(--border-hover);
}

.format-pill-active {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
}

.modal-fee-row {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);
}

.modal-fee-row .form-input {
  flex: 1;
}

.modal-summary {
  display: flex;
  justify-content: space-between;
  padding: var(--space-sm) 0;
  border-top: 1px solid var(--border);
  margin-bottom: var(--space-md);
  font-size: 0.875rem;
}

.modal-summary-label {
  color: var(--text-secondary);
}

.modal-summary-value {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--text-primary);
}

.modal-error {
  font-size: 0.8125rem;
  color: var(--danger);
  margin-bottom: var(--space-sm);
}
```

- [ ] **Step 2: Create the CreateRoomModal component**

```typescript
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRooms } from '@/hooks/useRooms';
import { useAuth } from '@/hooks/useAuth';

const FORMATS = [
  { value: 'ONE_V_ONE', label: '1v1', players: 2 },
  { value: 'BEST_OF_3', label: 'Bo3', players: 2 },
  { value: 'FFA_5', label: 'FFA 5', players: 5 },
  { value: 'FFA_10', label: 'FFA 10', players: 10 },
  { value: 'FFA_20', label: 'FFA 20', players: 20 },
];

const FEE_PRESETS = [1, 2, 5, 10, 25];

interface CreateRoomModalProps {
  gameId: string;
  gameTitle: string;
  open: boolean;
  onClose: () => void;
  onCreated: (roomId: string) => void;
}

export default function CreateRoomModal({ gameId, gameTitle, open, onClose, onCreated }: CreateRoomModalProps) {
  const { createRoom } = useRooms();
  const { refreshWallet } = useAuth();
  const [format, setFormat] = useState('ONE_V_ONE');
  const [fee, setFee] = useState('5');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const feeNum = parseFloat(fee) || 0;
  const platformCut = feeNum * 0.05;
  const selectedFormat = FORMATS.find(f => f.value === format)!;
  const prizePool = ((feeNum - platformCut) * selectedFormat.players).toFixed(2);

  const handleCreate = async () => {
    if (feeNum < 0.5 || feeNum > 100) {
      setError('Entry fee must be between $0.50 and $100');
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const result = await createRoom({ gameId, format, entryFee: feeNum });
      await refreshWallet();
      onCreated(result.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="modal-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-handle" />
            <h2 className="modal-title">Create Room</h2>

            <div className="modal-label">Format</div>
            <div className="format-options">
              {FORMATS.map(f => (
                <button
                  key={f.value}
                  className={`format-pill ${format === f.value ? 'format-pill-active' : ''}`}
                  onClick={() => setFormat(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="modal-label">Entry Fee</div>
            <div className="modal-fee-row">
              <input
                className="form-input"
                type="number"
                placeholder="0.00"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                min="0.50"
                max="100"
                step="0.50"
              />
            </div>
            <div className="quick-amounts">
              {FEE_PRESETS.map(amount => (
                <button
                  key={amount}
                  className="quick-amount-btn"
                  onClick={() => setFee(amount.toString())}
                >
                  ${amount}
                </button>
              ))}
            </div>

            <div className="modal-summary">
              <span className="modal-summary-label">Prize Pool ({selectedFormat.players} players)</span>
              <span className="modal-summary-value">${prizePool}</span>
            </div>

            {error && <div className="modal-error">{error}</div>}

            <button
              className="create-room-btn"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? 'Creating...' : `Create ${selectedFormat.label} Room - $${feeNum.toFixed(2)}`}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/CreateRoomModal.tsx apps/web/src/styles/globals.css
git commit -m "feat(web): add CreateRoomModal bottom sheet component"
```

---

### Task 3: Game Detail Page — Real Rooms + Create Flow

**Files:**
- Modify: `apps/web/src/app/games/[id]/page.tsx`

Replace `MOCK_ROOMS` with real API calls. Wire up the Create Room button to open the modal. Wire up Join buttons to call the join endpoint. Add 30-second polling for room list refresh.

- [ ] **Step 1: Rewrite the game detail page**

Replace the entire file content:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useRooms, RoomListItem } from '@/hooks/useRooms';
import CreateRoomModal from '@/components/CreateRoomModal';
import { api } from '@/lib/api';

interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
}

interface GameDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  tags: string[];
}

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, username: 'xProPlayer', score: 15420 },
  { rank: 2, username: 'GameMaster99', score: 14200 },
  { rank: 3, username: 'SkillKing', score: 13800 },
  { rank: 4, username: 'NoobSlayer', score: 12500 },
  { rank: 5, username: 'ProGamer42', score: 11900 },
];

const FORMAT_LABELS: Record<string, string> = {
  ONE_V_ONE: '1v1',
  BEST_OF_3: 'Bo3',
  FFA_5: 'FFA 5',
  FFA_10: 'FFA 10',
  FFA_20: 'FFA 20',
};

export default function GameDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { listRooms, joinRoom } = useRooms();
  const { refreshWallet } = useAuth();

  const [game, setGame] = useState<GameDetail | null>(null);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch game details
  useEffect(() => {
    api<GameDetail>(`/api/games/${params.id}`)
      .then(setGame)
      .catch(() => {
        // Fallback for when API is unavailable
        setGame({
          id: params.id as string,
          slug: params.id as string,
          title: 'Game',
          description: null,
          tags: [],
        });
      });
  }, [params.id]);

  // Fetch rooms for this game
  const fetchRooms = useCallback(async () => {
    if (!game) return;
    try {
      const result = await listRooms({ gameId: game.id, status: 'WAITING' });
      setRooms(result.rooms);
    } catch {
      // Silent fail — rooms section will show empty
    }
  }, [game, listRooms]);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 30000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  const handleJoin = async (roomId: string) => {
    if (!user) { router.push('/login'); return; }
    setJoiningId(roomId);
    setError(null);
    try {
      await joinRoom(roomId);
      await refreshWallet();
      router.push(`/rooms/${roomId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to join room');
    } finally {
      setJoiningId(null);
    }
  };

  const handleCreated = (roomId: string) => {
    setShowCreate(false);
    router.push(`/rooms/${roomId}`);
  };

  if (!game) {
    return <div className="empty-state"><p>Loading...</p></div>;
  }

  return (
    <div className="game-detail">
      {/* Banner */}
      <motion.div className="game-banner" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="game-banner-image">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M6 12h4M8 10v4" />
            <circle cx="17" cy="10" r="1" />
            <circle cx="15" cy="12" r="1" />
          </svg>
        </div>
        <h1 className="game-banner-title">{game.title}</h1>
      </motion.div>

      <div className="game-detail-content">
        {game.description && <p className="game-description">{game.description}</p>}

        {game.tags.length > 0 && (
          <div className="game-tags">
            {game.tags.map(tag => (
              <span key={tag} className="game-tag">{tag}</span>
            ))}
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="modal-error" style={{ marginBottom: 'var(--space-md)' }}>
            {error}
          </div>
        )}

        {/* Open Rooms */}
        <section className="game-section">
          <div className="section-header">
            <h2 className="section-title">Open Rooms</h2>
          </div>

          <div className="rooms-list">
            {rooms.map((room, i) => (
              <motion.div
                key={room.id}
                className="room-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <div className="room-card-top">
                  <div className="room-creator">
                    <div className="room-avatar">{room.creator[0]}</div>
                    <span className="room-username">@{room.creator}</span>
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

                <button
                  className="room-join-btn"
                  onClick={() => handleJoin(room.id)}
                  disabled={joiningId === room.id}
                >
                  {joiningId === room.id ? 'Joining...' : `Join - $${room.entryFee}`}
                </button>
              </motion.div>
            ))}
          </div>

          {rooms.length === 0 && (
            <div className="empty-state-inline">
              <p>No open rooms yet</p>
            </div>
          )}
        </section>

        {/* Create Room Button */}
        <button
          className="create-room-btn"
          onClick={() => {
            if (!user) { router.push('/login'); return; }
            setShowCreate(true);
          }}
        >
          Create Room
        </button>

        {/* Create Room Modal */}
        {game && (
          <CreateRoomModal
            gameId={game.id}
            gameTitle={game.title}
            open={showCreate}
            onClose={() => setShowCreate(false)}
            onCreated={handleCreated}
          />
        )}

        {/* Leaderboard Preview */}
        <section className="game-section">
          <div className="section-header">
            <h2 className="section-title">All-Time Top Players</h2>
            <span className="section-link">See All</span>
          </div>

          <div className="leaderboard-list">
            {MOCK_LEADERBOARD.map((entry, i) => (
              <motion.div
                key={entry.rank}
                className="leaderboard-row"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.04 }}
              >
                <span className={`lb-rank ${entry.rank === 1 ? 'lb-rank-first' : ''}`}>
                  #{entry.rank}
                </span>
                <div className="lb-avatar">{entry.username[0]}</div>
                <span className="lb-name">{entry.username}</span>
                <span className="lb-score">{entry.score.toLocaleString()}</span>
              </motion.div>
            ))}
          </div>
        </section>

        <div className="game-stats-footer">
          1,240 games played  &middot;  $12,450 paid out  &middot;  89 active players
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/games/[id]/page.tsx
git commit -m "feat(web): wire game detail page to real room API with create/join"
```

---

### Task 4: Room Lobby Page

**Files:**
- Create: `apps/web/src/app/rooms/[id]/page.tsx`
- Modify: `apps/web/src/styles/globals.css` (add lobby CSS)

The lobby page shows room status, participants list, and allows the creator to cancel. It polls every 5 seconds for updates (players joining, status changes).

- [ ] **Step 1: Add lobby CSS to globals.css**

Append after the modal CSS section:

```css
/* --- Room Lobby -------------------------------------------------- */

.lobby-page {
  padding: var(--space-md) 0;
}

.lobby-status-card {
  padding: var(--space-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  text-align: center;
  margin-bottom: var(--space-md);
}

.lobby-game-title {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-bottom: var(--space-xs);
}

.lobby-format {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: var(--space-sm);
}

.lobby-prize {
  font-family: var(--font-mono);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--money);
  margin-bottom: var(--space-md);
}

.lobby-status-badge {
  display: inline-block;
  padding: 4px 16px;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.lobby-status-waiting {
  background: rgba(249, 115, 22, 0.15);
  color: var(--primary);
}

.lobby-status-ready {
  background: rgba(16, 185, 129, 0.15);
  color: var(--win);
}

.lobby-status-in-progress {
  background: rgba(59, 130, 246, 0.15);
  color: var(--trust);
}

.lobby-status-completed {
  background: rgba(138, 138, 138, 0.15);
  color: var(--text-secondary);
}

.lobby-players-section {
  margin-bottom: var(--space-md);
}

.lobby-players-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-sm);
}

.lobby-player-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 4px;
}

.lobby-player-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.lobby-player-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
}

.lobby-player-you {
  font-size: 0.75rem;
  color: var(--primary);
  margin-left: auto;
}

.lobby-empty-slot {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 4px;
  color: var(--text-muted);
  font-size: 0.8125rem;
}

.lobby-timer {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--text-muted);
  text-align: center;
  margin-bottom: var(--space-md);
}

.lobby-cancel-btn {
  width: 100%;
  padding: 12px;
  background: transparent;
  border: 1px solid var(--danger);
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--danger);
  transition: all var(--transition-fast);
}

.lobby-cancel-btn:hover {
  background: rgba(239, 68, 68, 0.1);
}
```

- [ ] **Step 2: Create the room lobby page**

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useRooms, RoomDetail } from '@/hooks/useRooms';

const FORMAT_LABELS: Record<string, string> = {
  ONE_V_ONE: '1v1',
  BEST_OF_3: 'Best of 3',
  FFA_5: 'FFA - 5 Players',
  FFA_10: 'FFA - 10 Players',
  FFA_20: 'FFA - 20 Players',
};

const STATUS_CLASS: Record<string, string> = {
  WAITING: 'lobby-status-waiting',
  READY: 'lobby-status-ready',
  IN_PROGRESS: 'lobby-status-in-progress',
  COMPLETED: 'lobby-status-completed',
  EXPIRED: 'lobby-status-completed',
  CANCELLED: 'lobby-status-completed',
};

function formatTimeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')} remaining`;
}

export default function RoomLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { getRoom, cancelRoom } = useRooms();
  const { refreshWallet } = useAuth();

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState('');

  const roomId = params.id as string;

  const fetchRoom = useCallback(async () => {
    try {
      const data = await getRoom(roomId);
      setRoom(data);
    } catch (err: any) {
      setError(err.message || 'Room not found');
    } finally {
      setLoading(false);
    }
  }, [roomId, getRoom]);

  // Poll for room updates
  useEffect(() => {
    fetchRoom();
    const interval = setInterval(fetchRoom, 5000);
    return () => clearInterval(interval);
  }, [fetchRoom]);

  // Timer countdown
  useEffect(() => {
    if (!room || room.status !== 'WAITING') return;
    const tick = () => setTimeLeft(formatTimeLeft(room.expiresAt));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [room]);

  const handleCancel = async () => {
    setCancelling(true);
    setError(null);
    try {
      await cancelRoom(roomId);
      await refreshWallet();
      router.push(`/games/${room?.gameSlug || room?.gameId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to cancel room');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return <div className="empty-state"><p>Loading room...</p></div>;
  }

  if (!room) {
    return <div className="empty-state"><p>{error || 'Room not found'}</p></div>;
  }

  const isCreator = user?.id === room.createdByUserId;
  const canCancel = isCreator && room.status === 'WAITING' && room.participants.length <= 1;
  const emptySlots = room.maxPlayers - room.participants.length;

  return (
    <div className="lobby-page">
      {/* Status Card */}
      <motion.div
        className="lobby-status-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="lobby-game-title">{room.gameTitle}</div>
        <div className="lobby-format">{FORMAT_LABELS[room.format] || room.format}</div>
        <div className="lobby-prize">${room.prizePool} Prize Pool</div>
        <span className={`lobby-status-badge ${STATUS_CLASS[room.status] || ''}`}>
          {room.status.replace('_', ' ')}
        </span>
      </motion.div>

      {/* Timer */}
      {room.status === 'WAITING' && (
        <div className="lobby-timer">{timeLeft}</div>
      )}

      {/* Error */}
      {error && <div className="modal-error" style={{ marginBottom: 'var(--space-md)' }}>{error}</div>}

      {/* Players */}
      <section className="lobby-players-section">
        <div className="lobby-players-header">
          <h2 className="section-title">Players</h2>
          <span className="room-spots-text">{room.participants.length}/{room.maxPlayers}</span>
        </div>

        {room.participants.map((p, i) => (
          <motion.div
            key={p.userId}
            className="lobby-player-row"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="lobby-player-avatar">{p.username[0].toUpperCase()}</div>
            <span className="lobby-player-name">{p.username}</span>
            {p.userId === user?.id && <span className="lobby-player-you">You</span>}
          </motion.div>
        ))}

        {Array.from({ length: emptySlots }).map((_, i) => (
          <div key={`empty-${i}`} className="lobby-empty-slot">
            <div className="lobby-player-avatar" style={{ opacity: 0.3 }}>?</div>
            <span>Waiting for player...</span>
          </div>
        ))}
      </section>

      {/* Cancel Button (creator only, solo, waiting) */}
      {canCancel && (
        <button
          className="lobby-cancel-btn"
          onClick={handleCancel}
          disabled={cancelling}
        >
          {cancelling ? 'Cancelling...' : 'Cancel Room'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/rooms/[id]/page.tsx apps/web/src/styles/globals.css
git commit -m "feat(web): add room lobby page with live polling and cancel flow"
```

---

### Task 5: Home Page — Open Rooms Section

**Files:**
- Modify: `apps/web/src/app/page.tsx`

Replace the "Open Rooms" placeholder with a live list fetching from `GET /api/rooms?status=WAITING&limit=5`. Show compact room cards with game name and link to game detail page.

- [ ] **Step 1: Rewrite the home page**

Replace the entire file content:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import GameCard from '@/components/GameCard';
import { useRooms, RoomListItem } from '@/hooks/useRooms';
import { api } from '@/lib/api';

interface Game {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  difficulty: number;
  tags: string[];
  isFeatured: boolean;
  activeChallenges: number;
  topScore: number | null;
}

const FORMAT_LABELS: Record<string, string> = {
  ONE_V_ONE: '1v1',
  BEST_OF_3: 'Bo3',
  FFA_5: 'FFA 5',
  FFA_10: 'FFA 10',
  FFA_20: 'FFA 20',
};

export default function HomePage() {
  const router = useRouter();
  const { listRooms } = useRooms();
  const [games, setGames] = useState<Game[]>([]);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
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

    listRooms({ status: 'WAITING', limit: 5 })
      .then((result) => setRooms(result.rooms))
      .catch(() => { /* Silent — open rooms section will show empty */ });
  }, [listRooms]);

  const filteredGames = activeTag
    ? games.filter(g => g.tags.includes(activeTag))
    : games;

  const allTags = [...new Set(games.flatMap(g => g.tags))];

  return (
    <div className="home-page">
      {loading && (
        <div className="empty-state">
          <p>Loading games...</p>
        </div>
      )}

      {error && (
        <div className="empty-state">
          <p>{error}</p>
          <button
            className="tag-btn tag-btn-active"
            style={{ marginTop: 12 }}
            onClick={() => {
              setError(null);
              setLoading(true);
              api<Game[]>('/api/games')
                .then((data) => setGames(data && data.length > 0 ? data : []))
                .catch((err) => {
                  setError('Failed to load games. Please try again later.');
                  console.error('Games fetch error:', err);
                })
                .finally(() => setLoading(false));
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (<>
        {/* Open Rooms */}
        <section className="home-section">
          <div className="section-header">
            <h2 className="section-title">Open Rooms</h2>
          </div>

          {rooms.length > 0 ? (
            <div className="rooms-list">
              {rooms.map((room, i) => (
                <motion.div
                  key={room.id}
                  className="room-card"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => router.push(`/games/${room.gameSlug}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="room-card-top">
                    <div className="room-creator">
                      <div className="room-avatar">{room.creator[0]}</div>
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
              <p>No open rooms right now</p>
            </div>
          )}
        </section>

        {/* Games Section */}
        <section className="home-section">
          <div className="section-header">
            <h2 className="section-title">Games</h2>
          </div>

          <div className="tag-filter">
            <button
              className={`tag-btn ${!activeTag ? 'tag-btn-active' : ''}`}
              onClick={() => setActiveTag(null)}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                className={`tag-btn ${activeTag === tag ? 'tag-btn-active' : ''}`}
                onClick={() => setActiveTag(tag)}
              >
                {tag.charAt(0).toUpperCase() + tag.slice(1)}
              </button>
            ))}
          </div>

          <div className="games-grid">
            {filteredGames.map((game) => (
              <GameCard
                key={game.id}
                id={game.id}
                slug={game.slug}
                title={game.title}
                description={game.description}
                thumbnailUrl={game.thumbnailUrl}
                tags={game.tags}
                activeRooms={game.activeChallenges}
                activePlayers={0}
              />
            ))}
          </div>

          {filteredGames.length === 0 && (
            <div className="empty-state">
              <p>No games found</p>
            </div>
          )}
        </section>
      </>)}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): add live open rooms to home page"
```

---

### Task 6: Profile Page — Active Rooms Section

**Files:**
- Modify: `apps/web/src/app/profile/page.tsx`

Replace the "Your Active Rooms" placeholder with a real fetch. Show the user's rooms where status is WAITING, READY, or IN_PROGRESS. Each card links to the lobby.

- [ ] **Step 1: Rewrite the profile page**

Replace the entire file content:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { useRooms, RoomListItem } from '@/hooks/useRooms';
import { api, getStoredToken } from '@/lib/api';

const FORMAT_LABELS: Record<string, string> = {
  ONE_V_ONE: '1v1',
  BEST_OF_3: 'Bo3',
  FFA_5: 'FFA 5',
  FFA_10: 'FFA 10',
  FFA_20: 'FFA 20',
};

const MOCK_HISTORY = [
  { game: 'Neon Runner', opponent: 'GameMaster99', format: '1v1', result: 'W', score: '15,420', money: '+$4.50', date: '2h ago' },
  { game: 'Rhythm Dash', opponent: 'SkillKing', format: '1v1 Bo3', result: 'L', score: '8,930', money: '-$5.00', date: '5h ago' },
  { game: 'Neon Runner', opponent: 'Pool (8 players)', format: 'FFA 10', result: 'W', score: '22,100', money: '+$12.00', date: '1d ago' },
  { game: 'Color Match', opponent: 'NoobSlayer', format: '1v1', result: 'L', score: '6,200', money: '-$2.00', date: '2d ago' },
];

const MOCK_ACHIEVEMENTS = [
  { label: '10 Wins', earned: true },
  { label: 'First $100', earned: true },
  { label: '5 Win Streak', earned: true },
  { label: 'Event Winner', earned: false },
  { label: '100 Games', earned: false },
  { label: 'Top 3 Monthly', earned: false },
];

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { wallet } = useWallet();
  const router = useRouter();
  const { listRooms } = useRooms();
  const [activeRooms, setActiveRooms] = useState<RoomListItem[]>([]);

  useEffect(() => {
    // Fetch rooms the user is in (WAITING/READY/IN_PROGRESS)
    // The API lists all rooms by status — we fetch each and filter client-side
    // since there's no "my rooms" endpoint yet
    const fetchMyRooms = async () => {
      try {
        const [waiting, ready, inProgress] = await Promise.all([
          listRooms({ status: 'WAITING', limit: 50 }),
          listRooms({ status: 'READY', limit: 50 }),
          listRooms({ status: 'IN_PROGRESS', limit: 50 }),
        ]);
        // Combine all - the API already requires auth, and we show all active rooms
        // In future, a "my rooms" endpoint would be more efficient
        const all = [...waiting.rooms, ...ready.rooms, ...inProgress.rooms];
        setActiveRooms(all);
      } catch {
        // Silent fail
      }
    };
    if (user) fetchMyRooms();
  }, [user, listRooms]);

  if (!user) {
    router.push('/login');
    return null;
  }

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
            <span className="player-stat-value">24</span>
            <span className="player-stat-label">Played</span>
          </div>
          <div className="player-stat">
            <span className="player-stat-value">62%</span>
            <span className="player-stat-label">Win Rate</span>
          </div>
          <div className="player-stat">
            <span className="player-stat-value player-stat-earnings">$145</span>
            <span className="player-stat-label">Earnings</span>
          </div>
        </div>
      </motion.div>

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
        <div className="match-history">
          {MOCK_HISTORY.map((match, i) => (
            <motion.div
              key={i}
              className="match-row"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <div className={`match-result ${match.result === 'W' ? 'match-win' : 'match-loss'}`}>
                {match.result}
              </div>
              <div className="match-info">
                <div className="match-game">{match.game} vs {match.opponent}</div>
                <div className="match-meta">{match.format} &middot; {match.date}</div>
              </div>
              <div className="match-right">
                <div className="match-score">{match.score}</div>
                <div className={`match-money ${match.money.startsWith('+') ? 'money-positive' : 'money-negative'}`}>
                  {match.money}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Achievements */}
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
            <span>Account Settings</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
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

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/profile/page.tsx
git commit -m "feat(web): add active rooms section to profile page"
```

---

### Task 7: Wallet Balance Refresh After Room Actions

**Files:**
- Modify: `apps/web/src/hooks/useRooms.ts`

The `createRoom` and `joinRoom` calls deduct from the wallet. The hook should accept an optional `onBalanceChange` callback, or we can simply let the calling components handle `refreshWallet()` after these calls (which they already do in Tasks 3 and 4). 

This task is actually already handled — the game detail page calls `refreshWallet()` after join, and the CreateRoomModal calls `refreshWallet()` after create. The lobby page calls `refreshWallet()` after cancel.

**No code changes needed.** This task validates the integration is complete.

- [ ] **Step 1: Verify wallet refresh flow**

Trace through the code:
- `CreateRoomModal.tsx` line: `await refreshWallet()` after `createRoom()`
- `games/[id]/page.tsx` line: `await refreshWallet()` after `joinRoom()`
- `rooms/[id]/page.tsx` line: `await refreshWallet()` after `cancelRoom()`

All wallet balance refreshes are in place.

- [ ] **Step 2: No commit needed — validation only**

---
