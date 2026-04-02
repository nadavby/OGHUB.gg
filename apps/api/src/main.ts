import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import { validateEnv } from './common/env';
validateEnv();

import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

import { authRouter } from './auth/auth.router';
import { walletRouter } from './wallet/wallet.router';
import { gamesRouter } from './games/games.router';
import { sessionsRouter } from './sessions/sessions.router';
import { leaderboardRouter } from './leaderboards/leaderboard.router';
import { ghostsRouter } from './ghosts/ghosts.router';
import { errorHandler } from './common/error-handler';

// ─── Globals ────────────────────────────────────────────────

export const prisma = new PrismaClient();
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const app = express();
const PORT = parseInt(process.env.API_PORT || '3001', 10);

// ─── Middleware ──────────────────────────────────────────────

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));

// ─── Health Check ───────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ─────────────────────────────────────────────────

app.use('/api/auth', authRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/games', gamesRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/leaderboards', leaderboardRouter);
app.use('/api/ghosts', ghostsRouter);

// ─── Error Handler ──────────────────────────────────────────

app.use(errorHandler);

// ─── Start ──────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 OGHUB API running on http://localhost:${PORT}`);
});

export default app;
