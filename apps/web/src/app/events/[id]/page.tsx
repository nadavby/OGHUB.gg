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

      {hasEntered && (
        <div className="event-user-status event-user-status-entered">
          You've entered this event
        </div>
      )}

      {canEnter && !hasEntered && (
        <button className="event-enter-btn" onClick={handleEnter}>
          {parseFloat(challenge.entryFee) > 0 ? `Enter - $${challenge.entryFee}` : 'Enter Free'}
        </button>
      )}

      {challenge.status === 'UPCOMING' && (
        <div className="event-user-status">This event hasn't started yet</div>
      )}

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
                <div className="lb-avatar">{(entry.username ?? '?')[0].toUpperCase()}</div>
                <span className="lb-name">{entry.username ?? 'Unknown'}</span>
                <span className="lb-score">{entry.score.toLocaleString()}</span>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="empty-state-inline"><p>No scores yet</p></div>
        )}
      </section>
    </div>
  );
}
