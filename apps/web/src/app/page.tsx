'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GameCard from '@/components/GameCard';
import { api } from '@/lib/api';
import { useRooms, RoomListItem } from '@/hooks/useRooms';

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

const FORMAT_LABELS: Record<string, string> = {
  ONE_V_ONE: '1v1',
  BEST_OF_3: 'Bo3',
  FFA_5: 'FFA 5',
  FFA_10: 'FFA 10',
  FFA_20: 'FFA 20',
};

export default function HomePage() {
  const router = useRouter();
  const { listRooms } = useRooms();

  const [games, setGames] = useState<Game[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rooms, setRooms] = useState<RoomListItem[]>([]);

  const fetchData = () => {
    setError(null);
    setLoading(true);

    // Fire both fetches; rooms failure is silent
    api<Game[]>('/api/games')
      .then((data) => {
        setGames(data && data.length > 0 ? data : []);
      })
      .catch((err) => {
        setError('Failed to load games. Please try again later.');
        console.error('Games fetch error:', err);
      })
      .finally(() => setLoading(false));

    listRooms({ status: 'WAITING', limit: 5 })
      .then(({ rooms: r }) => setRooms(r))
      .catch((err) => console.error('Rooms fetch error:', err));
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            onClick={fetchData}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (<>
        {/* Open Rooms Section */}
        <section className="home-section">
          <div className="section-header">
            <h2 className="section-title">Open Rooms</h2>
          </div>

          {rooms.length === 0 ? (
            <div className="empty-state-inline">
              <p>No open rooms right now</p>
            </div>
          ) : (
            <div className="rooms-list">
              {rooms.map((room) => {
                const spotsLeft = room.maxPlayers - room.currentPlayers;
                const fillPct = Math.round((room.currentPlayers / room.maxPlayers) * 100);

                return (
                  <div
                    key={room.id}
                    className="room-card"
                    onClick={() => router.push(`/games/${room.gameSlug}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="room-card-top">
                      <div className="room-creator">
                        <div className="room-avatar" />
                        <span className="room-username">{room.gameTitle}</span>
                      </div>
                      <span className="room-format">
                        {FORMAT_LABELS[room.format] ?? room.format}
                      </span>
                    </div>

                    <div className="room-card-bottom">
                      <div className="room-money">
                        <span className="room-fee">
                          {room.entryFee > 0 ? `$${room.entryFee}` : 'Free'}
                        </span>
                        {room.prizePool > 0 && (
                          <span className="room-prize">${room.prizePool} prize</span>
                        )}
                      </div>

                      <div className="room-spots">
                        <div className="room-spots-bar">
                          <div
                            className="room-spots-fill"
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                        <span className="room-spots-text">
                          {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
