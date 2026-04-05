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
  tags: string[];
  activeRooms?: number;
  activePlayers?: number;
}

export default function GameCard({ slug, title, description, thumbnailUrl, activeRooms = 0, activePlayers = 0 }: GameCardProps) {
  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <Link href={`/games/${slug}`}>
        <div className={styles.thumbnail}>
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt={title} />
          ) : (
            <div className={styles.thumbnailPlaceholder}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M6 12h4M8 10v4" />
                <circle cx="17" cy="10" r="1" />
                <circle cx="15" cy="12" r="1" />
              </svg>
            </div>
          )}
        </div>

        <div className={styles.body}>
          <h3 className={styles.title}>{title}</h3>

          {description && (
            <p className={styles.description}>
              {description.length > 60 ? description.slice(0, 60) + '...' : description}
            </p>
          )}

          <div className={styles.footer}>
            {activeRooms > 0 && (
              <span className={styles.footerItem}>
                <span className={styles.dot} />
                {activeRooms} room{activeRooms !== 1 ? 's' : ''}
              </span>
            )}
            {activePlayers > 0 && (
              <span className={styles.footerItem}>
                {activePlayers} player{activePlayers !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
