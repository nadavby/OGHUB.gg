'use client';

import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

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

      {/* Active Rooms (placeholder) */}
      <section className="profile-section">
        <div className="section-header">
          <h2 className="section-title">Your Active Rooms</h2>
        </div>
        <div className="empty-state-inline">
          <p>No active rooms</p>
        </div>
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
