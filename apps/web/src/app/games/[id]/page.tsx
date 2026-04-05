'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

interface Room {
  id: string;
  creator: string;
  format: string;
  entryFee: string;
  prizePool: string;
  currentPlayers: number;
  maxPlayers: number;
  status: string;
}

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
  challenges: any[];
}

const DEMO_GAME: GameDetail = {
  id: '1', slug: 'neon-runner', title: 'Neon Runner',
  description: 'Navigate the deterministically generated cyber-tunnel. Precision makes perfect - slide under, jump over, and combo your skill dodges to climb the leaderboard.',
  tags: ['arcade', 'skill'],
  challenges: [],
};

const MOCK_ROOMS: Room[] = [
  { id: 'r1', creator: 'xProPlayer', format: '1v1', entryFee: '5.00', prizePool: '9.50', currentPlayers: 1, maxPlayers: 2, status: 'WAITING' },
  { id: 'r2', creator: 'GameMaster99', format: 'FFA 10', entryFee: '2.00', prizePool: '19.00', currentPlayers: 7, maxPlayers: 10, status: 'WAITING' },
  { id: 'r3', creator: 'SkillKing', format: '1v1 Bo3', entryFee: '10.00', prizePool: '19.00', currentPlayers: 1, maxPlayers: 2, status: 'WAITING' },
];

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, username: 'xProPlayer', score: 15420 },
  { rank: 2, username: 'GameMaster99', score: 14200 },
  { rank: 3, username: 'SkillKing', score: 13800 },
  { rank: 4, username: 'NoobSlayer', score: 12500 },
  { rank: 5, username: 'ProGamer42', score: 11900 },
];

export default function GameDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [game, setGame] = useState<GameDetail>(DEMO_GAME);

  useEffect(() => {
    api(`/api/games/${params.id}`)
      .then((data: GameDetail) => setGame(data))
      .catch(() => {});
  }, [params.id]);

  return (
    <div className="game-detail">
      {/* Banner */}
      <motion.div
        className="game-banner"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
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
        {/* Description */}
        <p className="game-description">{game.description}</p>

        {/* Tags */}
        <div className="game-tags">
          {game.tags.map(tag => (
            <span key={tag} className="game-tag">{tag}</span>
          ))}
        </div>

        {/* Open Rooms */}
        <section className="game-section">
          <div className="section-header">
            <h2 className="section-title">Open Rooms</h2>
          </div>

          <div className="rooms-list">
            {MOCK_ROOMS.map((room, i) => (
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
                  <span className="room-format">{room.format}</span>
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

                <button className="room-join-btn">Join</button>
              </motion.div>
            ))}
          </div>

          {MOCK_ROOMS.length === 0 && (
            <div className="empty-state-inline">
              <p>No open rooms yet</p>
            </div>
          )}
        </section>

        {/* Create Room Button */}
        <button className="create-room-btn">
          Create Room
        </button>

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

        {/* Game Stats Footer */}
        <div className="game-stats-footer">
          1,240 games played  &middot;  $12,450 paid out  &middot;  89 active players
        </div>
      </div>
    </div>
  );
}
