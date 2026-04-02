'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { api, getStoredToken } from '@/lib/api';
import RewardAnimation from '@/components/RewardAnimation';
import DoubleOrNothing from '@/components/DoubleOrNothing';
import UrgencyBanner from '@/components/UrgencyBanner';

interface Challenge {
  id: string;
  title: string;
  description: string | null;
  entryFee: string;
  prizePool: string;
  currentEntries: number;
  maxEntries?: number;  // For rooms
  status: string;
}

interface GameDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  difficulty: number;
  tags: string[];
  challenges: Challenge[];
}

const DEMO_GAME: GameDetail = {
  id: '1', slug: 'neon-runner', title: 'Neon Runner',
  description: 'Navigate the deterministically generated cyber-tunnel. Precision makes perfect - slide under, jump over, and combo your skill dodges to climb the leaderboard!',
  difficulty: 3, tags: ['arcade', 'skill'],
  challenges: [
    { id: 'c1', title: '1v1 Duel', description: 'Winner takes all', entryFee: '2.00', prizePool: '3.80', currentEntries: 1, maxEntries: 2, status: 'ACTIVE' },
    { id: 'c2', title: '4-Player Blitz', description: 'Top score wins', entryFee: '5.00', prizePool: '18.00', currentEntries: 3, maxEntries: 4, status: 'ACTIVE' },
    { id: 'c3', title: '6-Player Royale', description: 'High stakes room', entryFee: '10.00', prizePool: '54.00', currentEntries: 5, maxEntries: 6, status: 'ACTIVE' },
  ],
};

const difficultyLabels = ['', 'Easy', 'Medium', 'Hard', 'Expert', 'Insane'];

export default function GameDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [game, setGame] = useState<GameDetail>(DEMO_GAME);
  const [selectedChallenge, setSelectedChallenge] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [showReward, setShowReward] = useState(false);
  const [showDoubleOrNothing, setShowDoubleOrNothing] = useState(false);
  const [showConsolation, setShowConsolation] = useState(false);
  const [winnings, setWinnings] = useState(0);
  const [isWin, setIsWin] = useState(true);

  useEffect(() => {
    api(`/api/games/${params.id}`)
      .then((data: GameDetail) => setGame(data))
      .catch(() => {});
  }, [params.id]);

  const handlePlay = async (challengeId?: string) => {
    if (!user) {
      router.push('/login');
      return;
    }
    setLaunching(true);
    try {
      const token = getStoredToken();
      // 1. Create a secure session on the backend
      const response = await api('/api/sessions/create', {
        method: 'POST',
        body: { gameId: game.id, challengeId },
        token: token!,
      });
      
      const sessionToken = response.token;
      const seed = response.seed;

      // 2. Fire the Deep Link to open the Android/iOS app
      // Format: neonrunner://session?token=abc&seed=123&challengeId=c1
      const deepLinkUrl = `${game.slug}://session?token=${sessionToken}&seed=${seed}&challengeId=${challengeId}`;
      
      alert(`Launching Native App:\n${deepLinkUrl}`); // For demo visibility
      window.location.href = deepLinkUrl;

      // Mock game complete logic after they return (in production, they return via deep link back)
      setTimeout(() => {
        const didWin = Math.random() > 0.4;
        setIsWin(didWin);
        setShowReward(true);
        setLaunching(false);
      }, 5000);
    } catch (err: any) {
      alert(err.message || 'Failed to create session');
      setLaunching(false);
    }
  };

  const handleRewardClose = useCallback(() => {
    setShowReward(false);
    if (isWin) {
      setWinnings(15.00);
      setShowDoubleOrNothing(true);
    } else {
      setShowConsolation(true);
    }
  }, [isWin]);

  const handleDouble = useCallback(() => {
    setWinnings(prev => prev * 2);
    // 50% chance to win demo
    if (Math.random() > 0.5) {
      setShowDoubleOrNothing(false);
      setShowReward(true);
    } else {
      setShowDoubleOrNothing(false);
      alert('Bust! Better luck next time 💔');
    }
  }, []);

  const handleCollect = useCallback(() => {
    setShowDoubleOrNothing(false);
  }, []);

  return (
    <div style={{ padding: 16 }}>
      {/* Game Hero */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{
          width: '100%', aspectRatio: '16/9', borderRadius: 'var(--radius-lg)',
          background: 'linear-gradient(135deg, var(--depth), var(--surface))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '4rem', marginBottom: 16, overflow: 'hidden',
          border: '1px solid var(--border-subtle)',
          position: 'relative',
        }}>
          🎮
          {/* Glowing overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle at 50% 80%, var(--neon-purple-glow), transparent 60%)',
            pointerEvents: 'none',
          }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, fontFamily: 'var(--font-display)' }}>
            {game.title}
          </h1>
          <span className="vip-badge diamond">💎 VIP</span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <span className={`difficulty-badge difficulty-${game.difficulty}`} style={{ position: 'static' }}>
            {difficultyLabels[game.difficulty]}
          </span>
          {game.tags.map(tag => (
            <span key={tag} className="tag">{tag}</span>
          ))}
          <span className="streak-badge">
            <span className="streak-flame">🔥</span> 7 Win Streak
          </span>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 20 }}>
          {game.description}
        </p>
      </motion.div>

      {/* Urgency Banners */}
      <UrgencyBanner spotsLeft={3} multiplierExpiry={127} playersOnline={847} />

      {/* Challenges */}
      <h2 className="section-title" style={{ marginBottom: 12 }}>⚔️ Active Challenges</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {game.challenges.map((challenge, i) => (
          <motion.div
            key={challenge.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.1 }}
            style={{
              padding: 16, background: 'var(--surface)',
              border: `1px solid ${selectedChallenge === challenge.id ? 'var(--neon-purple)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-lg)', cursor: 'pointer',
              transition: 'var(--transition-fast)',
              boxShadow: selectedChallenge === challenge.id ? 'var(--shadow-neon)' : 'none',
            }}
            onClick={() => setSelectedChallenge(challenge.id)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ fontWeight: 800, fontSize: '0.95rem', fontFamily: 'var(--font-display)' }}>{challenge.title}</h3>
                  {parseFloat(challenge.prizePool) >= 100 && (
                    <span className="multiplier-badge">HOT</span>
                  )}
                </div>
                {challenge.description && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 2 }}>
                    {challenge.description}
                  </p>
                )}
              </div>
              {parseFloat(challenge.prizePool) > 0 && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontWeight: 900,
                  color: 'var(--gold)', fontSize: '1rem',
                  textShadow: '0 0 10px var(--gold-glow)',
                }}>
                  ${challenge.prizePool}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <div className="stat">
                  <span className="stat-label">Entry</span>
                  <span className="stat-value" style={{ color: parseFloat(challenge.entryFee) > 0 ? 'var(--burnout-orange)' : 'var(--toxic-green)' }}>
                    {parseFloat(challenge.entryFee) > 0 ? `$${challenge.entryFee}` : 'FREE'}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Players</span>
                  <span className="stat-value">
                    {challenge.currentEntries} {challenge.maxEntries ? `/ ${challenge.maxEntries}` : ''}
                  </span>
                </div>
              </div>

              <motion.button
                className="game-card-cta"
                style={{ width: 'auto', marginTop: 0, padding: '10px 24px', fontSize: '0.85rem' }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => { e.stopPropagation(); handlePlay(challenge.id); }}
                disabled={launching}
              >
                {launching ? '⏳' : '⚡ Play'}
              </motion.button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Ghost Race */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} style={{ marginTop: 24 }}>
        <button className="ghost-btn" style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
          👻 Race the #1 Player's Ghost
        </button>
      </motion.div>

      {/* Leaderboard Preview */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>🏆 Top Players</h2>
        <div className="leaderboard-list">
          {[
            { rank: 1, name: 'xProPlayer', score: 15420, medal: '🥇', tier: 'diamond' },
            { rank: 2, name: 'GameMaster99', score: 14200, medal: '🥈', tier: 'gold-tier' },
            { rank: 3, name: 'SkillKing', score: 13800, medal: '🥉', tier: 'silver' },
          ].map((entry, i) => (
            <motion.div
              key={entry.rank}
              className="leaderboard-row"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 + i * 0.1 }}
            >
              <div className="rank">{entry.medal}</div>
              <div className="avatar">{entry.name[0]}</div>
              <div className="player-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="player-name">{entry.name}</span>
                  <span className={`vip-badge ${entry.tier}`} style={{ fontSize: '0.5rem', padding: '1px 6px' }}>VIP</span>
                </div>
              </div>
              <div className="player-score">{entry.score.toLocaleString()}</div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Reward Animation */}
      {showReward && (
        <RewardAnimation 
          score={isWin ? 15420 : 14980} 
          rank={isWin ? 1 : 2} 
          reward={isWin ? "15.00" : undefined} 
          isWin={isWin}
          onClose={handleRewardClose} 
        />
      )}

      {/* Double or Nothing */}
      {showDoubleOrNothing && (
        <DoubleOrNothing currentWinnings={winnings} onDouble={handleDouble} onCollect={handleCollect} />
      )}

      {/* Consolation Near-Miss Flow */}
      {showConsolation && (
        <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <motion.div className="modal-card" style={{ background: 'linear-gradient(180deg, var(--surface) 0%, #1a1005 100%)', border: '1px solid var(--burnout-orange)', textAlign: 'center' }}>
            <h2 style={{ fontSize: '2rem', color: 'var(--burnout-orange)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>SO CLOSE! 😱</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
              You were only <strong style={{ color: 'white' }}>440 points</strong> away from taking the entire pot! Your near-misses were fantastic.
            </p>
            <div style={{ background: '#000', padding: 16, borderRadius: 8, marginBottom: 20 }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--gold)', fontWeight: 'bold' }}>🎁 Claim your Consolation Spin!</p>
              <p style={{ fontSize: '0.8rem', color: '#888' }}>Every close call earns you a free spin on the Wheel of Fortune.</p>
            </div>
            <button className="game-card-cta" onClick={() => setShowConsolation(false)} style={{ width: '100%' }}>Spin Now!</button>
            <button className="text-btn" onClick={() => setShowConsolation(false)} style={{ marginTop: 12, color: '#888' }}>Skip</button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
