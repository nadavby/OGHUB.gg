'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import styles from './GameCard.module.css';

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

const difficultyClass: Record<number, string> = {
  1: styles.difficulty1,
  2: styles.difficulty2,
  3: styles.difficulty3,
  4: styles.difficulty4,
  5: styles.difficulty5,
};

export default function GameCard({ id, slug, title, description, thumbnailUrl, difficulty, tags, isFeatured, activeChallenges, topScore }: GameCardProps) {
  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <Link href={`/games/${slug}`}>
        <div className={styles.thumbnail}>
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt={title} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--bg-tertiary), var(--bg-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>
              🎮
            </div>
          )}
          <span className={`${styles.difficultyBadge} ${difficultyClass[difficulty] || ''}`}>
            {difficultyLabels[difficulty] || 'Unknown'}
          </span>
          {isFeatured && <span className={styles.featuredTag}>⭐ Featured</span>}
        </div>

        <div className={styles.body}>
          <h3 className={styles.title}>{title}</h3>

          {description && (
            <p className={styles.meta}>{description.slice(0, 80)}{description.length > 80 ? '...' : ''}</p>
          )}

          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Challenges</span>
              <span className={styles.statValue}>{activeChallenges}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Difficulty</span>
              <span className={styles.statValue}>{'⭐'.repeat(difficulty)}</span>
            </div>
          </div>

          {topScore !== null && (
            <div className={styles.topScoreRow}>
              <span className={styles.crown}>👑</span>
              <span>Top Score</span>
              <span className={styles.score}>{topScore.toLocaleString()}</span>
            </div>
          )}

          <div className={styles.cta}>
            ⚡ Play Now
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
