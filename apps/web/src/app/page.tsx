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

  const allTags = [...new Set(games.flatMap(g => g.tags))];

  return (
    <div className="home-page">
      {loading && (
        <div className="empty-state">
          <p>Loading games...</p>
        </div>
      )}

      {error && (
        <div className="empty-state">
          <p>{error}</p>
          <button
            className="tag-btn tag-btn-active"
            style={{ marginTop: 12 }}
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
        {/* Open Rooms Placeholder */}
        <section className="home-section">
          <div className="section-header">
            <h2 className="section-title">Open Rooms</h2>
          </div>
          <div className="empty-state-inline">
            <p>No open rooms right now</p>
          </div>
        </section>

        {/* Games Section */}
        <section className="home-section">
          <div className="section-header">
            <h2 className="section-title">Games</h2>
          </div>

          {/* Tag Filter */}
          <div className="tag-filter">
            <button
              className={`tag-btn ${!activeTag ? 'tag-btn-active' : ''}`}
              onClick={() => setActiveTag(null)}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                className={`tag-btn ${activeTag === tag ? 'tag-btn-active' : ''}`}
                onClick={() => setActiveTag(tag)}
              >
                {tag.charAt(0).toUpperCase() + tag.slice(1)}
              </button>
            ))}
          </div>

          {/* Games Grid */}
          <div className="games-grid">
            {filteredGames.map((game) => (
              <GameCard
                key={game.id}
                id={game.id}
                slug={game.slug}
                title={game.title}
                description={game.description}
                thumbnailUrl={game.thumbnailUrl}
                tags={game.tags}
                activeRooms={game.activeChallenges}
                activePlayers={0}
              />
            ))}
          </div>

          {filteredGames.length === 0 && (
            <div className="empty-state">
              <p>No games found</p>
            </div>
          )}
        </section>
      </>)}
    </div>
  );
}
