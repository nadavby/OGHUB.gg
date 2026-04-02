'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import GameCard from '@/components/GameCard';
import LiveWinnersTicker from '@/components/LiveWinnersTicker';
import { api } from '@/lib/api';

interface Game {
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

const DEMO_GAMES: Game[] = [
  {
    id: '1', slug: 'stack-tower', title: 'Stack Tower',
    description: 'Stack blocks as high as you can! Perfect timing is everything.',
    thumbnailUrl: null, difficulty: 2, tags: ['arcade', 'timing'],
    isFeatured: true, activeChallenges: 3, topScore: 15420,
  },
  {
    id: '2', slug: 'color-match', title: 'Color Match Rush',
    description: 'Match colors at lightning speed. Beat the clock!',
    thumbnailUrl: null, difficulty: 1, tags: ['puzzle', 'speed'],
    isFeatured: true, activeChallenges: 2, topScore: 8930,
  },
  {
    id: '3', slug: 'rhythm-dash', title: 'Rhythm Dash',
    description: 'Tap to the beat and dodge obstacles in this rhythm runner.',
    thumbnailUrl: null, difficulty: 3, tags: ['rhythm', 'runner'],
    isFeatured: false, activeChallenges: 5, topScore: 22100,
  },
  {
    id: '4', slug: 'bubble-pop', title: 'Bubble Pop Blitz',
    description: 'Pop bubbles in chains for massive combos and multipliers.',
    thumbnailUrl: null, difficulty: 1, tags: ['casual', 'combo'],
    isFeatured: false, activeChallenges: 1, topScore: 45600,
  },
  {
    id: '5', slug: 'gravity-flip', title: 'Gravity Flip',
    description: 'Navigate through impossible gravity-defying obstacle courses.',
    thumbnailUrl: null, difficulty: 4, tags: ['platformer', 'hard'],
    isFeatured: true, activeChallenges: 4, topScore: 3200,
  },
  {
    id: '6', slug: 'word-blitz', title: 'Word Blitz',
    description: 'Find words faster than anyone else. Every second counts!',
    thumbnailUrl: null, difficulty: 2, tags: ['word', 'speed'],
    isFeatured: false, activeChallenges: 2, topScore: 12800,
  },
  {
    id: '7', slug: 'sniper-shot', title: 'Sniper Shot',
    description: 'Precision shooting challenges. One shot, one kill.',
    thumbnailUrl: null, difficulty: 3, tags: ['aim', 'precision'],
    isFeatured: false, activeChallenges: 3, topScore: 9999,
  },
  {
    id: '8', slug: 'maze-runner', title: 'Maze Runner Pro',
    description: 'Solve randomly generated mazes before time runs out.',
    thumbnailUrl: null, difficulty: 5, tags: ['puzzle', 'maze'],
    isFeatured: false, activeChallenges: 1, topScore: 1850,
  },
];

export default function HomePage() {
  const [games, setGames] = useState<Game[]>(DEMO_GAMES);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    api('/api/games')
      .then((data: Game[]) => {
        if (data && data.length > 0) setGames(data);
      })
      .catch(() => {});
  }, []);

  const filteredGames = activeTag
    ? games.filter(g => g.tags.includes(activeTag))
    : games;

  const featured = filteredGames.filter(g => g.isFeatured);
  const allGames = filteredGames.filter(g => !g.isFeatured);
  const allTags = [...new Set(games.flatMap(g => g.tags))];

  return (
    <div className="game-feed">
      {/* Live Winners Ticker — Social Proof */}
      <div style={{ margin: '0 -16px 16px -16px' }}>
        <LiveWinnersTicker />
      </div>

      {/* Urgency: Active players + multiplier */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="active-players">
          <span className="active-dot" />
          <span>847 playing now</span>
        </div>
        <span className="multiplier-badge">🔥 2x BONUS ACTIVE</span>
      </div>

      {/* Category Tags */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none' }}>
        <button
          className="tag"
          style={{
            background: !activeTag ? 'var(--neon-purple)' : undefined,
            color: !activeTag ? 'white' : undefined,
            borderColor: !activeTag ? 'var(--neon-purple)' : undefined,
            boxShadow: !activeTag ? '0 0 12px var(--neon-purple-glow)' : undefined,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onClick={() => setActiveTag(null)}
        >
          All Games
        </button>
        {allTags.map(tag => (
          <button
            key={tag}
            className="tag"
            style={{
              background: activeTag === tag ? 'var(--neon-purple)' : undefined,
              color: activeTag === tag ? 'white' : undefined,
              borderColor: activeTag === tag ? 'var(--neon-purple)' : undefined,
              boxShadow: activeTag === tag ? '0 0 12px var(--neon-purple-glow)' : undefined,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              textTransform: 'capitalize',
            }}
            onClick={() => setActiveTag(tag)}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Featured — Hot Games */}
      {featured.length > 0 && (
        <div className="featured-section">
          <h2 className="section-title">🔥 Hot Right Now</h2>
          {featured.map((game) => (
            <div key={game.id} style={{ marginBottom: 16 }}>
              <GameCard {...game} />
            </div>
          ))}
        </div>
      )}

      {/* Urgency: Limited spots */}
      <div className="urgency-banner" style={{ marginBottom: 16 }}>
        <span className="urgency-dot" />
        <span>🏆 Weekend Showdown — <strong style={{ color: 'var(--gold)' }}>$5,000</strong> prize pool filling fast!</span>
      </div>

      {/* All Games */}
      <h2 className="section-title">⚡ All Games</h2>
      {allGames.map((game) => (
        <GameCard key={game.id} {...game} />
      ))}

      {filteredGames.length === 0 && (
        <div className="empty-state">
          <span className="icon">🎮</span>
          <p>No games found</p>
        </div>
      )}
    </div>
  );
}
