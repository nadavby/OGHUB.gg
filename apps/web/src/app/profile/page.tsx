'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  if (!user) {
    router.push('/login');
    return null;
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 className="page-title">Profile</h1>

      <motion.div
        className="auth-card"
        style={{ margin: '0 auto' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Avatar */}
        <div style={{
          width: 80, height: 80, borderRadius: '50%', margin: '0 auto 16px',
          background: 'var(--accent-gradient)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2rem', fontWeight: 800,
        }}>
          {(user.displayName || user.username)[0].toUpperCase()}
        </div>

        <h2 style={{ textAlign: 'center', fontSize: '1.25rem', fontWeight: 700, marginBottom: 4 }}>
          {user.displayName || user.username}
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 24 }}>
          @{user.username}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', padding: '12px 0',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Email</span>
            <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{user.email}</span>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', padding: '12px 0',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Role</span>
            <span className="tag">{user.role}</span>
          </div>
        </div>

        <button
          className="btn-primary"
          style={{ marginTop: 24, background: 'var(--danger)' }}
          onClick={() => { logout(); router.push('/'); }}
        >
          Sign Out
        </button>
      </motion.div>
    </div>
  );
}
