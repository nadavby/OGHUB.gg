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
import { startEventDrainWorker } from './events/event-pipeline';
import pino from 'pino';
import pinoHttp from 'pino-http';

// ─── Globals ────────────────────────────────────────────────

export const prisma = new PrismaClient();
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const app = express();
const PORT = parseInt(process.env.API_PORT || '3001', 10);

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

app.use(pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => (req as any).url === '/api/health',
  },
}));

// ─── Middleware ──────────────────────────────────────────────

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));

// ─── Health Check ───────────────────────────────────────────

app.get('/api/health', async (_req, res) => {
  try {
    await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
    ]);
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', timestamp: new Date().toISOString() });
  }
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

  // Start event pipeline drain worker
  startEventDrainWorker(process.env.WORKER_NAME || 'worker-1').catch((err) => {
    console.error('Failed to start event drain worker:', err);
  });
});

function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  prisma.$disconnect().catch(console.error);
  redis.quit().catch(console.error);
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
