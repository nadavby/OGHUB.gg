'use client';

import { motion } from 'framer-motion';

export default function LeaderboardPage() {
  const demo = [
    { rank: 1, name: 'xProPlayer', score: 15420 },
    { rank: 2, name: 'GameMaster99', score: 14200 },
    { rank: 3, name: 'SkillKing', score: 13800 },
    { rank: 4, name: 'NoobSlayer', score: 12500 },
    { rank: 5, name: 'ProGamer42', score: 11900 },
    { rank: 6, name: 'ClutchMaster', score: 11200 },
    { rank: 7, name: 'ShadowPlay', score: 10800 },
    { rank: 8, name: 'PixelWarrior', score: 10100 },
    { rank: 9, name: 'ArcadeLegend', score: 9500 },
    { rank: 10, name: 'RushQueen', score: 9200 },
  ];

  return (
    <div style={{ padding: 'var(--space-md)' }}>
      <h1 className="page-title">Leaderboard</h1>

      <div className="leaderboard-list">
        {demo.map((entry, i) => (
          <motion.div
            key={entry.rank}
            className="leaderboard-row"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <span className={`lb-rank ${entry.rank === 1 ? 'lb-rank-first' : ''}`}>
              #{entry.rank}
            </span>
            <div className="lb-avatar">{entry.name[0]}</div>
            <span className="lb-name">{entry.name}</span>
            <span className="lb-score">{entry.score.toLocaleString()}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
