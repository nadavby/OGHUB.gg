'use client';

import { useState, useEffect } from 'react';
import GameCard from '@/components/GameCard';
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

export default function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Game[]>('/api/games')
      .then((data) => {
        setGames(data && data.length > 0 ? data : []);
      })
      .catch((err) => {
        setError('Failed to load games. Please try again later.');
        console.error('Games fetch error:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredGames = activeTag
    ? games.filter(g => g.tags.includes(activeTag))
    : games;

  const featured = filteredGames.filter(g => g.isFeatured);
  const allGames = filteredGames.filter(g => !g.isFeatured);
  const allTags = [...new Set(games.flatMap(g => g.tags))];

  return (
    <div className="game-feed">
      {loading && (
        <div className="empty-state">
          <p>Loading games...</p>
        </div>
      )}

      {error && (
        <div className="empty-state">
          <span className="icon">⚠️</span>
          <p>{error}</p>
          <button
            className="tag"
            style={{ cursor: 'pointer', marginTop: 12 }}
            onClick={() => {
              setError(null);
              setLoading(true);
              api<Game[]>('/api/games')
                .then((data) => setGames(data && data.length > 0 ? data : []))
                .catch((err) => {
                  setError('Failed to load games. Please try again later.');
                  console.error('Games fetch error:', err);
                })
                .finally(() => setLoading(false));
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (<>
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

        {/* Featured Games */}
        {featured.length > 0 && (
          <div className="featured-section">
            <h2 className="section-title">Featured</h2>
            {featured.map((game) => (
              <div key={game.id} style={{ marginBottom: 16 }}>
                <GameCard {...game} />
              </div>
            ))}
          </div>
        )}

        {/* All Games */}
        <h2 className="section-title">All Games</h2>
        {allGames.map((game) => (
          <GameCard key={game.id} {...game} />
        ))}

        {filteredGames.length === 0 && (
          <div className="empty-state">
            <span className="icon">🎮</span>
            <p>No games found</p>
          </div>
        )}
      </>)}
    </div>
  );
}
