'use client';

import { motion } from 'framer-motion';

export default function LeaderboardPage() {
  const demo = [
    { rank: 1, name: 'xProPlayer', score: 15420, avatar: '🥇' },
    { rank: 2, name: 'GameMaster99', score: 14200, avatar: '🥈' },
    { rank: 3, name: 'SkillKing', score: 13800, avatar: '🥉' },
    { rank: 4, name: 'NoobSlayer', score: 12500, avatar: 'N' },
    { rank: 5, name: 'ProGamer42', score: 11900, avatar: 'P' },
    { rank: 6, name: 'ClutchMaster', score: 11200, avatar: 'C' },
    { rank: 7, name: 'ShadowPlay', score: 10800, avatar: 'S' },
    { rank: 8, name: 'PixelWarrior', score: 10100, avatar: 'P' },
    { rank: 9, name: 'ArcadeLegend', score: 9500, avatar: 'A' },
    { rank: 10, name: 'RushQueen', score: 9200, avatar: 'R' },
  ];

  const top3 = demo.slice(0, 3);

  return (
    <div className="leaderboard">
      <h1 className="page-title">🏆 Leaderboard</h1>

      {/* Podium */}
      <div className="leaderboard-podium">
        {/* 2nd place */}
        <motion.div
          className="podium-entry silver"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="podium-avatar">{top3[1].avatar}</div>
          <div className="podium-name">{top3[1].name}</div>
          <div className="podium-score">{top3[1].score.toLocaleString()}</div>
        </motion.div>

        {/* 1st place */}
        <motion.div
          className="podium-entry gold"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="podium-avatar">{top3[0].avatar}</div>
          <div className="podium-name">{top3[0].name}</div>
          <div className="podium-score">{top3[0].score.toLocaleString()}</div>
        </motion.div>

        {/* 3rd place */}
        <motion.div
          className="podium-entry bronze"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="podium-avatar">{top3[2].avatar}</div>
          <div className="podium-name">{top3[2].name}</div>
          <div className="podium-score">{top3[2].score.toLocaleString()}</div>
        </motion.div>
      </div>

      {/* Full List */}
      <div className="leaderboard-list">
        {demo.slice(3).map((entry, i) => (
          <motion.div
            key={entry.rank}
            className="leaderboard-row"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + i * 0.05 }}
          >
            <div className="rank">#{entry.rank}</div>
            <div className="avatar">{entry.avatar}</div>
            <div className="player-info">
              <div className="player-name">{entry.name}</div>
            </div>
            <div className="player-score">{entry.score.toLocaleString()}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
