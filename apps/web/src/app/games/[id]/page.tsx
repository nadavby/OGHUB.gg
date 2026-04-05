'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

interface GameDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  difficulty: number;
  tags: string[];
  challenges: any[];
}

const DEMO_GAME: GameDetail = {
  id: '1', slug: 'neon-runner', title: 'Neon Runner',
  description: 'Navigate the deterministically generated cyber-tunnel. Precision makes perfect.',
  difficulty: 3, tags: ['arcade', 'skill'],
  challenges: [],
};

export default function GameDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const [game, setGame] = useState<GameDetail>(DEMO_GAME);

  useEffect(() => {
    api(`/api/games/${params.id}`)
      .then((data: GameDetail) => setGame(data))
      .catch(() => {});
  }, [params.id]);

  return (
    <div style={{ padding: 16 }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)', marginBottom: 8 }}>
          {game.title}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
          {game.description}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Full redesign coming in Task 6.
        </p>
      </motion.div>
    </div>
  );
}
