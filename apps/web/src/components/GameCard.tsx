'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

interface GameCardProps {
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

const difficultyLabels = ['', 'Easy', 'Medium', 'Hard', 'Expert', 'Insane'];

export default function GameCard({ id, slug, title, description, thumbnailUrl, difficulty, tags, isFeatured, activeChallenges, topScore }: GameCardProps) {
  return (
    <motion.div
      className="game-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <Link href={`/games/${slug}`}>
        <div className="game-card-thumbnail">
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt={title} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--bg-tertiary), var(--bg-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>
              🎮
            </div>
          )}
          <span className={`difficulty-badge difficulty-${difficulty}`}>
            {difficultyLabels[difficulty] || 'Unknown'}
          </span>
          {isFeatured && <span className="featured-tag">⭐ Featured</span>}
        </div>

        <div className="game-card-body">
          <h3 className="game-card-title">{title}</h3>
          
          {description && (
            <p className="game-card-meta">{description.slice(0, 80)}{description.length > 80 ? '...' : ''}</p>
          )}

          <div className="game-card-stats">
            <div className="stat">
              <span className="stat-label">Challenges</span>
              <span className="stat-value">{activeChallenges}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Difficulty</span>
              <span className="stat-value">{'⭐'.repeat(difficulty)}</span>
            </div>
          </div>

          {topScore !== null && (
            <div className="top-score-row">
              <span className="crown">👑</span>
              <span>Top Score</span>
              <span className="score">{topScore.toLocaleString()}</span>
            </div>
          )}

          <div className="game-card-cta">
            ⚡ Play Now
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
