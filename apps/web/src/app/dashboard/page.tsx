'use client';

import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import Link from 'next/link';

export default function DashboardPage() {
  const { user } = useAuth();
  const { wallet } = useWallet();

  if (!user) {
    return (
      <div className="auth-page">
        <div className="empty-state">
          <span className="icon">🔒</span>
          <p>Sign in to view your dashboard</p>
          <Link href="/login" className="btn-primary" style={{ marginTop: 16, display: 'inline-block', padding: '12px 32px' }}>
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  const stats = [
    { icon: '🎮', value: '24', label: 'Games Played' },
    { icon: '🏆', value: '5', label: 'Top 10 Finishes' },
    { icon: '🔥', value: '7', label: 'Win Streak' },
    { icon: '💰', value: wallet ? `$${parseFloat(wallet.balance).toFixed(0)}` : '$0', label: 'Balance' },
  ];

  return (
    <div className="dashboard">
      <h1 className="page-title">
        Hey, {user.displayName || user.username} 👋
      </h1>

      <div className="stats-grid">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <div className="stat-icon">{stat.icon}</div>
            <div className="stat-value">{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Recent Activity */}
      <h2 className="section-title" style={{ marginBottom: 12 }}>📋 Recent Activity</h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { game: 'Stack Tower', score: 15420, rank: 3, time: '2m ago', won: true },
          { game: 'Color Match Rush', score: 8930, rank: 12, time: '1h ago', won: false },
          { game: 'Rhythm Dash', score: 22100, rank: 1, time: '3h ago', won: true },
        ].map((activity, i) => (
          <motion.div
            key={i}
            className="leaderboard-row"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.1 }}
          >
            <div className="rank" style={{ color: activity.won ? 'var(--success)' : 'var(--text-muted)' }}>
              #{activity.rank}
            </div>
            <div className="player-info">
              <div className="player-name">{activity.game}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{activity.time}</div>
            </div>
            <div className="player-score" style={{ color: activity.won ? 'var(--success)' : 'var(--accent-secondary)' }}>
              {activity.score.toLocaleString()}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Play */}
      <motion.div
        style={{ marginTop: 24 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Link href="/" className="btn-primary" style={{ display: 'block', textAlign: 'center', padding: 16 }}>
          ⚡ Quick Play
        </Link>
      </motion.div>
    </div>
  );
}
