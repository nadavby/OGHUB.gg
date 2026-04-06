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
    <div style={{ padding: 'var(--space-md) 0' }}>
      <h1 className="page-title">Events</h1>

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
