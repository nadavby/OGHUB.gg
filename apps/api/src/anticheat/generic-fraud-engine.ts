/**
 * Generic Fraud Engine
 *
 * Loads validation rules from GameDefinition instead of hardcoded values.
 * 5 layers, activated by Trust Tier:
 *   Layer 1: Universal (always) — score range, duration, replay integrity
 *   Layer 2: Game-Configured (always) — input rate, reaction time, custom rules
 *   Layer 3: Behavioral (always) — timing patterns, robotic detection
 *   Layer 4: Statistical (always, needs DB) — z-score, improvement rate
 *   Layer 5: Rate limiting (always, needs Redis) — session rate, cooldown
 */

import crypto from 'crypto';
import { prisma, redis } from '../main';
import type { GameDefinition } from '@oghub/shared';

// ─── Types ─────────────────────────────────────────────────

export interface FraudCheckResult {
  isValid: boolean;
  fraudScore: number;
  flags: FraudFlag[];
  action: 'ACCEPT' | 'FLAG' | 'REJECT' | 'BAN';
}

export interface FraudFlag {
  code: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  data?: Record<string, unknown>;
}

// ─── Constants ─────────────────────────────────────────────

const FLAG_THRESHOLD = 50;
const AUTO_REJECT_THRESHOLD = 80;
const BAN_THRESHOLD = 200;
const MAX_SESSIONS_PER_HOUR = 30;
const COOLDOWN_BETWEEN_SESSIONS_MS = 5000;

// ─── Main Entry Point ──────────────────────────────────────

export async function validateSessionGeneric(
  session: { id: string; seed: string; startedAt: Date | null; gameId: string },
  score: number,
  replayData: any,
  userId: string,
  definition: GameDefinition,
): Promise<FraudCheckResult> {
  const flags: FraudFlag[] = [];
  let fraudScore = 0;

  // Layer 1: Universal
  const l1 = validateUniversal(session, score, replayData, definition);
  flags.push(...l1);
  fraudScore += l1.reduce((s, f) => s + severityScore(f.severity), 0);

  // Layer 2: Game-Configured
  const l2 = validateGameConfigured(session, score, replayData, definition);
  flags.push(...l2);
  fraudScore += l2.reduce((s, f) => s + severityScore(f.severity), 0);

  // Layer 3: Behavioral
  if (replayData?.inputTimeline?.length > 1) {
    const l3 = analyzeBehavior(replayData, definition);
    flags.push(...l3);
    fraudScore += l3.reduce((s, f) => s + severityScore(f.severity), 0);
  }

  // Layer 4: Statistical (needs DB)
  const l4 = await detectStatisticalAnomalies(session, score, userId);
  flags.push(...l4);
  fraudScore += l4.reduce((s, f) => s + severityScore(f.severity), 0);

  // Layer 5: Rate limiting (needs Redis)
  const l5 = await checkRateLimits(userId, session.gameId);
  flags.push(...l5);
  fraudScore += l5.reduce((s, f) => s + severityScore(f.severity), 0);

  // Determine action
  let action: FraudCheckResult['action'] = 'ACCEPT';
  if (fraudScore >= AUTO_REJECT_THRESHOLD) action = 'REJECT';
  else if (fraudScore >= FLAG_THRESHOLD) action = 'FLAG';

  const cumulative = await updateCumulativeFraudScore(userId, fraudScore);
  if (cumulative >= BAN_THRESHOLD) action = 'BAN';

  await storeFraudReport(session.id, userId, { fraudScore, flags, action });

  return { isValid: action === 'ACCEPT' || action === 'FLAG', fraudScore, flags, action };
}

// ─── Layer 1: Universal (EXPORTED for testing) ─────────────

export function validateUniversal(
  session: { seed: string; startedAt: Date | null },
  score: number,
  replayData: any,
  def: GameDefinition,
): FraudFlag[] {
  const flags: FraudFlag[] = [];
  const [minScore, maxScore] = def.scoring.range;

  if (score < minScore) {
    flags.push({ code: 'SCORE_BELOW_RANGE', severity: 'CRITICAL', message: `Score ${score} below minimum ${minScore}` });
  }
  if (score > maxScore) {
    flags.push({ code: 'SCORE_ABOVE_RANGE', severity: 'CRITICAL', message: `Score ${score} above maximum ${maxScore}` });
  }

  if (session.startedAt) {
    const durationSec = (Date.now() - new Date(session.startedAt).getTime()) / 1000;
    if (durationSec < def.session.minDuration) {
      flags.push({
        code: 'SESSION_TOO_SHORT', severity: 'HIGH',
        message: `Session ${durationSec.toFixed(1)}s shorter than minimum ${def.session.minDuration}s`,
      });
    }
    if (durationSec > def.session.maxDuration * 1.1) {
      flags.push({
        code: 'SESSION_TOO_LONG', severity: 'MEDIUM',
        message: `Session ${durationSec.toFixed(1)}s exceeds maximum ${def.session.maxDuration}s`,
      });
    }
  }

  if (replayData) {
    if (replayData.seed && replayData.seed !== session.seed) {
      flags.push({ code: 'SEED_MISMATCH', severity: 'CRITICAL', message: 'Replay seed does not match session seed' });
    }
    if (replayData.inputTimeline) {
      const expectedChecksum = crypto
        .createHash('sha256')
        .update(JSON.stringify(replayData.inputTimeline))
        .digest('hex');
      if (replayData.checksum && replayData.checksum !== expectedChecksum) {
        flags.push({ code: 'REPLAY_TAMPERED', severity: 'CRITICAL', message: 'Replay checksum mismatch' });
      }
    }
    if ((!replayData.inputTimeline || replayData.inputTimeline.length === 0) && score > 0) {
      flags.push({ code: 'EMPTY_REPLAY', severity: 'HIGH', message: 'Non-zero score with empty replay' });
    }
  } else if (score > 0) {
    flags.push({ code: 'MISSING_REPLAY', severity: 'HIGH', message: 'Non-zero score without replay data' });
  }

  return flags;
}

// ─── Layer 2: Game-Configured (EXPORTED for testing) ───────

export function validateGameConfigured(
  session: { startedAt: Date | null },
  score: number,
  replayData: any,
  def: GameDefinition,
): FraudFlag[] {
  const flags: FraudFlag[] = [];

  // Input rate check
  if (replayData?.inputTimeline?.length > 0 && replayData.duration > 0) {
    const avgRate = replayData.inputTimeline.length / (replayData.duration / 1000);
    if (avgRate > def.anticheat.maxInputRate) {
      flags.push({
        code: 'EXCESSIVE_INPUT_RATE', severity: 'HIGH',
        message: `Input rate ${avgRate.toFixed(1)}/s exceeds game limit ${def.anticheat.maxInputRate}/s`,
        data: { avgRate, limit: def.anticheat.maxInputRate },
      });
    }
  }

  // Score rate check
  if (session.startedAt) {
    const durationSec = (Date.now() - new Date(session.startedAt).getTime()) / 1000;
    if (durationSec > 0) {
      const scoreRate = score / durationSec;
      if (scoreRate > def.anticheat.maxScorePerSecond) {
        flags.push({
          code: 'SCORE_RATE_TOO_HIGH', severity: 'HIGH',
          message: `Score rate ${scoreRate.toFixed(0)}/s exceeds game limit ${def.anticheat.maxScorePerSecond}/s`,
          data: { scoreRate, limit: def.anticheat.maxScorePerSecond },
        });
      }
    }
  }

  // Reaction time check
  if (replayData?.inputTimeline?.length > 1) {
    const timeline = replayData.inputTimeline;
    const intervals: number[] = [];
    for (let i = 1; i < timeline.length; i++) {
      intervals.push(timeline[i].timestamp - timeline[i - 1].timestamp);
    }
    const subHumanCount = intervals.filter((i: number) => i > 0 && i < def.anticheat.minReactionTime).length;
    const subHumanRatio = subHumanCount / intervals.length;
    if (subHumanRatio > 0.1) {
      flags.push({
        code: 'SUPERHUMAN_REACTIONS', severity: 'HIGH',
        message: `${(subHumanRatio * 100).toFixed(0)}% of inputs below ${def.anticheat.minReactionTime}ms reaction time`,
        data: { subHumanCount, total: intervals.length },
      });
    }
  }

  return flags;
}

// ─── Layer 3: Behavioral (EXPORTED for testing) ────────────

export function analyzeBehavior(replayData: any, def: GameDefinition): FraudFlag[] {
  const flags: FraudFlag[] = [];
  const timeline = replayData.inputTimeline;
  if (!timeline || timeline.length < 2) return flags;

  const intervals: number[] = [];
  for (let i = 1; i < timeline.length; i++) {
    intervals.push(timeline[i].timestamp - timeline[i - 1].timestamp);
  }

  // Robotic regularity
  if (intervals.length >= 10) {
    const mean = intervals.reduce((a: number, b: number) => a + b, 0) / intervals.length;
    const stdDev = Math.sqrt(
      intervals.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / intervals.length,
    );
    const cv = mean > 0 ? stdDev / mean : 0;

    if (cv < 0.05 && intervals.length > 20) {
      flags.push({
        code: 'ROBOTIC_TIMING', severity: 'CRITICAL',
        message: `Input timing CV=${cv.toFixed(3)} — extremely regular (bot-like)`,
        data: { cv, mean, stdDev, samples: intervals.length },
      });
    } else if (cv < 0.15 && intervals.length > 30) {
      flags.push({
        code: 'SUSPICIOUS_REGULARITY', severity: 'MEDIUM',
        message: `Input timing is unusually regular (CV=${cv.toFixed(3)})`,
      });
    }
  }

  // Burst detection (sliding 1s window)
  const maxBurst = def.anticheat.maxInputRate * 1.5;
  for (let i = 0; i < timeline.length; i++) {
    const windowEnd = timeline[i].timestamp + 1000;
    let count = 0;
    for (let j = i; j < timeline.length && timeline[j].timestamp < windowEnd; j++) {
      count++;
    }
    if (count > maxBurst) {
      flags.push({
        code: 'INPUT_BURST', severity: 'MEDIUM',
        message: `${count} inputs in 1s window at t=${timeline[i].timestamp}ms`,
        data: { burstCount: count, timestamp: timeline[i].timestamp },
      });
      break;
    }
  }

  return flags;
}

// ─── Layer 4: Statistical (needs DB) ───────────────────────

async function detectStatisticalAnomalies(
  session: { gameId: string },
  score: number,
  userId: string,
): Promise<FraudFlag[]> {
  const flags: FraudFlag[] = [];

  const userScores = await prisma.score.findMany({
    where: { userId, session: { gameId: session.gameId }, isValidated: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { value: true },
  });

  if (userScores.length >= 10) {
    const values = userScores.map(s => s.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);

    if (stdDev > 0) {
      const zScore = (score - mean) / stdDev;
      if (zScore > 4.0) {
        flags.push({
          code: 'SCORE_STATISTICAL_OUTLIER', severity: 'HIGH',
          message: `Score is ${zScore.toFixed(1)}σ above user's mean`,
          data: { zScore, mean: Math.round(mean), stdDev: Math.round(stdDev) },
        });
      }
    }

    const previousBest = Math.max(...values);
    if (previousBest > 0 && score / previousBest > 3.0) {
      flags.push({
        code: 'IMPOSSIBLE_IMPROVEMENT', severity: 'HIGH',
        message: `Score ${score} is ${(score / previousBest).toFixed(1)}x previous best (${previousBest})`,
      });
    }
  }

  return flags;
}

// ─── Layer 5: Rate Limiting (needs Redis) ──────────────────

async function checkRateLimits(userId: string, gameId: string): Promise<FraudFlag[]> {
  const flags: FraudFlag[] = [];
  const now = Date.now();

  const hourKey = `rate:sessions:${userId}:${Math.floor(now / 3600000)}`;
  const sessionsThisHour = await redis.incr(hourKey);
  await redis.expire(hourKey, 3600);

  if (sessionsThisHour > MAX_SESSIONS_PER_HOUR) {
    flags.push({
      code: 'RATE_LIMIT_HOURLY', severity: 'MEDIUM',
      message: `${sessionsThisHour} sessions this hour (limit: ${MAX_SESSIONS_PER_HOUR})`,
    });
  }

  const lastKey = `last_session:${userId}:${gameId}`;
  const last = await redis.get(lastKey);
  if (last) {
    const elapsed = now - parseInt(last, 10);
    if (elapsed < COOLDOWN_BETWEEN_SESSIONS_MS) {
      flags.push({
        code: 'COOLDOWN_VIOLATION', severity: 'LOW',
        message: `Only ${elapsed}ms since last session (minimum: ${COOLDOWN_BETWEEN_SESSIONS_MS}ms)`,
      });
    }
  }
  await redis.set(lastKey, now.toString(), 'EX', 60);

  return flags;
}

// ─── Helpers ───────────────────────────────────────────────

function severityScore(severity: FraudFlag['severity']): number {
  switch (severity) {
    case 'LOW': return 5;
    case 'MEDIUM': return 15;
    case 'HIGH': return 30;
    case 'CRITICAL': return 50;
  }
}

async function updateCumulativeFraudScore(userId: string, score: number): Promise<number> {
  const key = `fraud_cumulative:${userId}`;
  const current = await redis.get(key);
  const cumulative = (current ? parseInt(current, 10) : 0) + score;
  const decayed = Math.max(0, Math.floor(cumulative * 0.9));
  await redis.set(key, decayed.toString(), 'EX', 86400 * 30);
  return decayed;
}

async function storeFraudReport(
  sessionId: string,
  userId: string,
  report: { fraudScore: number; flags: FraudFlag[]; action: string },
): Promise<void> {
  await redis.set(
    `fraud_report:${sessionId}`,
    JSON.stringify({ ...report, userId, timestamp: Date.now() }),
    'EX', 86400 * 7,
  );
  if (report.action !== 'ACCEPT') {
    await redis.lpush('fraud:review_queue', JSON.stringify({
      sessionId, userId, action: report.action, fraudScore: report.fraudScore,
      topFlags: report.flags.slice(0, 5).map(f => f.code),
      timestamp: Date.now(),
    }));
    await redis.ltrim('fraud:review_queue', 0, 9999);
  }
}
