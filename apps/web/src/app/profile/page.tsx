'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { useRooms, RoomListItem } from '@/hooks/useRooms';
import { api, getStoredToken } from '@/lib/api';
import { useToast } from '@/components/Toast';

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
  const { showToast } = useToast();

  const [stats, setStats] = useState<UserStats | null>(null);
  const [history, setHistory] = useState<MatchHistoryItem[]>([]);
  const [activeRooms, setActiveRooms] = useState<RoomListItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;

    const [statsResult, historyResult, roomsResult] = await Promise.allSettled([
      api<UserStats>('/api/auth/me/stats', { token }),
      api<MatchHistoryItem[]>('/api/auth/me/history', { token }),
      listRooms({ mine: true, limit: 50 }),
    ]);

    if (statsResult.status === 'fulfilled') setStats(statsResult.value);
    if (historyResult.status === 'fulfilled') setHistory(historyResult.value);
    if (roomsResult.status === 'fulfilled') {
      setActiveRooms(roomsResult.value.rooms.filter(r =>
        !['EXPIRED', 'CANCELLED', 'COMPLETED'].includes(r.status)
      ));
    }
  }, [listRooms]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  useEffect(() => {
    if (!user) router.push('/login?redirect=%2Fprofile');
  }, [user, router]);

  if (!user) return null;

  const handleEdit = () => {
    setEditName(user.displayName || '');
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ displayName: editName || undefined });
      setEditing(false);
      showToast('Profile updated', 'success');
    } catch (err) {
      console.error('Failed to update profile:', err);
      showToast((err as any)?.message || 'Failed to update profile', 'error');
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
      <motion.div className="player-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
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
            <span className="player-stat-value player-stat-earnings">{stats ? `$${stats.totalEarnings}` : '-'}</span>
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
            <button className="profile-cancel-btn" onClick={() => setEditing(false)}>Cancel</button>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)' }}><path d="M5 12h14M12 5l7 7-7 7" /></svg>
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
          <div className="empty-state-inline"><p>No active rooms</p></div>
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
          <div className="empty-state-inline"><p>No matches yet</p></div>
        )}
      </section>

      {/* Achievements (mock — no backend model) */}
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
