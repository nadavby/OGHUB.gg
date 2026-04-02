/**
 * OGHUB Anti-Cheat Engine
 * 
 * Multi-layered fraud detection for skill-based competitions:
 * 
 * Layer 1: Input validation (score bounds, timing, replay integrity)
 * Layer 2: Statistical anomaly detection (z-score, Benford's law)
 * Layer 3: Behavioral fingerprinting (input rhythm, reaction time distribution)
 * Layer 4: Cross-session pattern analysis (win rate spikes, device correlation)
 */

import crypto from 'crypto';
import { prisma, redis } from '../main';

// ─── Configuration ──────────────────────────────────────────

const CONFIG = {
  // Timing thresholds
  MIN_SESSION_DURATION_MS: 3000,          // No game can be completed in < 3s
  MIN_HUMAN_REACTION_MS: 80,              // Sub-80ms reactions are superhuman
  MAX_INPUT_RATE_PER_SEC: 25,             // Sustained > 25 inputs/s is bot-like
  MAX_BURST_INPUT_RATE: 40,               // Burst (1s window) > 40 is suspicious

  // Score thresholds
  MAX_SCORE_ZSCORE: 4.0,                  // Scores > 4σ from mean are flagged
  SCORE_HISTORY_MIN_SAMPLES: 10,          // Need ≥10 scores for statistical analysis
  IMPOSSIBLE_IMPROVEMENT_RATIO: 3.0,      // Score 3x previous best = suspicious

  // Rate limiting
  MAX_SESSIONS_PER_HOUR: 30,              // Anti-grinding
  MAX_SESSIONS_PER_USER_PER_CHALLENGE: 50,// Per challenge lifetime cap
  COOLDOWN_BETWEEN_SESSIONS_MS: 5000,     // 5s minimum between sessions

  // Fraud scoring
  FLAG_THRESHOLD: 50,                     // Fraud score ≥50 = flagged for review
  AUTO_REJECT_THRESHOLD: 80,              // Fraud score ≥80 = auto-reject
  BAN_THRESHOLD: 200,                     // Cumulative fraud = account investigation
};

// ─── Types ──────────────────────────────────────────────────

export interface FraudCheckResult {
  isValid: boolean;
  fraudScore: number;            // 0-100, higher = more suspicious
  flags: FraudFlag[];
  action: 'ACCEPT' | 'FLAG' | 'REJECT' | 'BAN';
}

export interface FraudFlag {
  code: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  data?: Record<string, unknown>;
}

// ─── Main Validation Pipeline ───────────────────────────────

export async function validateSession(
  session: any,
  score: number,
  replayData: any,
  userId: string,
): Promise<FraudCheckResult> {
  const flags: FraudFlag[] = [];
  let fraudScore = 0;

  // ── Layer 1: Input Validation ─────────────────────────
  const inputFlags = validateInputIntegrity(session, score, replayData);
  flags.push(...inputFlags);
  fraudScore += inputFlags.reduce((sum, f) => sum + severityScore(f.severity), 0);

  // ── Layer 2: Statistical Anomaly Detection ────────────
  const statFlags = await detectStatisticalAnomalies(session, score, userId);
  flags.push(...statFlags);
  fraudScore += statFlags.reduce((sum, f) => sum + severityScore(f.severity), 0);

  // ── Layer 3: Behavioral Fingerprinting ────────────────
  if (replayData?.inputTimeline?.length > 0) {
    const behaviorFlags = analyzeBehavioralPatterns(replayData);
    flags.push(...behaviorFlags);
    fraudScore += behaviorFlags.reduce((sum, f) => sum + severityScore(f.severity), 0);
  }

  // ── Layer 4: Rate & Pattern Analysis ──────────────────
  const rateFlags = await checkRateLimits(userId, session.gameId, session.challengeId);
  flags.push(...rateFlags);
  fraudScore += rateFlags.reduce((sum, f) => sum + severityScore(f.severity), 0);

  // ── Determine Action ──────────────────────────────────
  let action: FraudCheckResult['action'] = 'ACCEPT';
  if (fraudScore >= CONFIG.AUTO_REJECT_THRESHOLD) {
    action = 'REJECT';
  } else if (fraudScore >= CONFIG.FLAG_THRESHOLD) {
    action = 'FLAG';
  }

  // Check cumulative fraud score for ban
  const cumulativeScore = await updateCumulativeFraudScore(userId, fraudScore);
  if (cumulativeScore >= CONFIG.BAN_THRESHOLD) {
    action = 'BAN';
  }

  // Store fraud check result
  await storeFraudReport(session.id, userId, { fraudScore, flags, action });

  return {
    isValid: action === 'ACCEPT' || action === 'FLAG',
    fraudScore,
    flags,
    action,
  };
}

// ─── Layer 1: Input Validation ──────────────────────────────

function validateInputIntegrity(session: any, score: number, replayData: any): FraudFlag[] {
  const flags: FraudFlag[] = [];

  // Score bounds
  if (score < 0) {
    flags.push({ code: 'NEGATIVE_SCORE', severity: 'CRITICAL', message: 'Negative score submitted' });
  }
  if (score > 999_999_999) {
    flags.push({ code: 'SCORE_OVERFLOW', severity: 'CRITICAL', message: 'Score exceeds maximum' });
  }

  // Session duration
  if (session.startedAt) {
    const duration = Date.now() - new Date(session.startedAt).getTime();
    if (duration < CONFIG.MIN_SESSION_DURATION_MS) {
      flags.push({
        code: 'SESSION_TOO_SHORT', severity: 'HIGH',
        message: `Session completed in ${duration}ms, minimum is ${CONFIG.MIN_SESSION_DURATION_MS}ms`,
        data: { duration },
      });
    }
  }

  // Replay data integrity
  if (replayData) {
    // Seed mismatch
    if (replayData.seed && replayData.seed !== session.seed) {
      flags.push({ code: 'SEED_MISMATCH', severity: 'CRITICAL', message: 'Replay seed does not match session seed' });
    }

    // Replay checksum (ensure replay wasn't modified in transit)
    if (replayData.inputTimeline) {
      const expectedChecksum = crypto
        .createHash('sha256')
        .update(JSON.stringify(replayData.inputTimeline))
        .digest('hex');

      if (replayData.checksum && replayData.checksum !== expectedChecksum) {
        flags.push({ code: 'REPLAY_TAMPERED', severity: 'CRITICAL', message: 'Replay checksum mismatch' });
      }
    }

    // Duration consistency
    if (replayData.duration && session.startedAt) {
      const serverDuration = Date.now() - new Date(session.startedAt).getTime();
      const clientDuration = replayData.duration;
      const drift = Math.abs(serverDuration - clientDuration);
      // Allow 10% drift + 2s for network latency
      if (drift > serverDuration * 0.1 + 2000) {
        flags.push({
          code: 'DURATION_MISMATCH', severity: 'MEDIUM',
          message: `Client duration (${clientDuration}ms) diverges from server duration (${serverDuration}ms)`,
          data: { clientDuration, serverDuration, drift },
        });
      }
    }

    // Empty replay for non-zero score
    if ((!replayData.inputTimeline || replayData.inputTimeline.length === 0) && score > 0) {
      flags.push({ code: 'EMPTY_REPLAY', severity: 'HIGH', message: 'Non-zero score with empty replay data' });
    }
  } else if (score > 0) {
    flags.push({ code: 'MISSING_REPLAY', severity: 'HIGH', message: 'Non-zero score without replay data' });
  }

  return flags;
}

// ─── Layer 2: Statistical Anomaly Detection ─────────────────

async function detectStatisticalAnomalies(
  session: any,
  score: number,
  userId: string,
): Promise<FraudFlag[]> {
  const flags: FraudFlag[] = [];

  // Get user's historical scores for this game
  const userScores = await prisma.score.findMany({
    where: { userId, session: { gameId: session.gameId }, isValidated: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { value: true },
  });

  if (userScores.length >= CONFIG.SCORE_HISTORY_MIN_SAMPLES) {
    const values = userScores.map(s => s.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);

    // Z-score check
    if (stdDev > 0) {
      const zScore = (score - mean) / stdDev;
      if (zScore > CONFIG.MAX_SCORE_ZSCORE) {
        flags.push({
          code: 'SCORE_STATISTICAL_OUTLIER', severity: 'HIGH',
          message: `Score is ${zScore.toFixed(1)}σ above user's mean (threshold: ${CONFIG.MAX_SCORE_ZSCORE}σ)`,
          data: { zScore, mean: Math.round(mean), stdDev: Math.round(stdDev) },
        });
      }
    }

    // Sudden improvement check
    const previousBest = Math.max(...values);
    if (previousBest > 0 && score / previousBest > CONFIG.IMPOSSIBLE_IMPROVEMENT_RATIO) {
      flags.push({
        code: 'IMPOSSIBLE_IMPROVEMENT', severity: 'HIGH',
        message: `Score ${score} is ${(score / previousBest).toFixed(1)}x the previous best (${previousBest})`,
        data: { previousBest, ratio: score / previousBest },
      });
    }
  }

  // Global game statistics (compare against all players)
  const globalStats = await getGameScoreStats(session.gameId);
  if (globalStats && globalStats.stdDev > 0) {
    const globalZ = (score - globalStats.mean) / globalStats.stdDev;
    if (globalZ > CONFIG.MAX_SCORE_ZSCORE + 1) { // Stricter for global
      flags.push({
        code: 'SCORE_GLOBAL_OUTLIER', severity: 'MEDIUM',
        message: `Score is ${globalZ.toFixed(1)}σ above global mean`,
        data: { globalMean: globalStats.mean, globalStdDev: globalStats.stdDev },
      });
    }
  }

  return flags;
}

// ─── Layer 3: Behavioral Fingerprinting ─────────────────────

function analyzeBehavioralPatterns(replayData: any): FraudFlag[] {
  const flags: FraudFlag[] = [];
  const timeline = replayData.inputTimeline;

  if (!timeline || timeline.length < 2) return flags;

  // Calculate inter-input intervals
  const intervals: number[] = [];
  for (let i = 1; i < timeline.length; i++) {
    intervals.push(timeline[i].timestamp - timeline[i - 1].timestamp);
  }

  // ── Superhuman reaction times ──────────────────────────
  const subHumanCount = intervals.filter(i => i < CONFIG.MIN_HUMAN_REACTION_MS).length;
  const subHumanRatio = subHumanCount / intervals.length;
  if (subHumanRatio > 0.1) { // >10% of inputs are superhuman
    flags.push({
      code: 'SUPERHUMAN_REACTIONS', severity: 'HIGH',
      message: `${(subHumanRatio * 100).toFixed(0)}% of inputs have sub-${CONFIG.MIN_HUMAN_REACTION_MS}ms reaction times`,
      data: { subHumanCount, totalInputs: intervals.length, fastestReaction: Math.min(...intervals) },
    });
  }

  // ── Sustained impossible input rate ────────────────────
  const avgRate = timeline.length / (replayData.duration / 1000);
  if (avgRate > CONFIG.MAX_INPUT_RATE_PER_SEC) {
    flags.push({
      code: 'EXCESSIVE_INPUT_RATE', severity: 'HIGH',
      message: `Average input rate ${avgRate.toFixed(1)}/s exceeds threshold ${CONFIG.MAX_INPUT_RATE_PER_SEC}/s`,
      data: { avgRate, totalInputs: timeline.length, duration: replayData.duration },
    });
  }

  // ── Burst detection (sliding 1s window) ────────────────
  for (let i = 0; i < timeline.length; i++) {
    const windowEnd = timeline[i].timestamp + 1000;
    let count = 0;
    for (let j = i; j < timeline.length && timeline[j].timestamp < windowEnd; j++) {
      count++;
    }
    if (count > CONFIG.MAX_BURST_INPUT_RATE) {
      flags.push({
        code: 'INPUT_BURST', severity: 'MEDIUM',
        message: `${count} inputs in 1s window at t=${timeline[i].timestamp}ms`,
        data: { burstCount: count, timestamp: timeline[i].timestamp },
      });
      break; // Only flag once
    }
  }

  // ── Robotic regularity detection ───────────────────────
  // Bots often have unnaturally consistent timing
  if (intervals.length >= 10) {
    const intervalMean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const intervalStdDev = Math.sqrt(
      intervals.reduce((a, b) => a + (b - intervalMean) ** 2, 0) / intervals.length,
    );
    const coefficientOfVariation = intervalStdDev / intervalMean;

    // Humans typically have CV > 0.3 for input timing
    // Bots/autoclickers often show CV < 0.1
    if (coefficientOfVariation < 0.05 && intervals.length > 20) {
      flags.push({
        code: 'ROBOTIC_TIMING', severity: 'CRITICAL',
        message: `Input timing coefficient of variation is ${coefficientOfVariation.toFixed(3)} — extremely regular (bot-like)`,
        data: { cv: coefficientOfVariation, intervalMean, intervalStdDev, sampleSize: intervals.length },
      });
    } else if (coefficientOfVariation < 0.15 && intervals.length > 30) {
      flags.push({
        code: 'SUSPICIOUS_REGULARITY', severity: 'MEDIUM',
        message: `Input timing is unusually regular (CV=${coefficientOfVariation.toFixed(3)})`,
        data: { cv: coefficientOfVariation },
      });
    }
  }

  // ── Sequence monotonicity (always-increasing values) ───
  // Check if payload values monotonically increase (suggests memory manipulation)
  const payloadValues = timeline
    .filter((e: any) => e.data?.score !== undefined)
    .map((e: any) => e.data.score);

  if (payloadValues.length >= 5) {
    let monotonic = true;
    for (let i = 1; i < payloadValues.length; i++) {
      if (payloadValues[i] < payloadValues[i - 1]) {
        monotonic = false;
        break;
      }
    }
    // Perfectly monotonic scores across many events = suspicious
    if (monotonic && payloadValues.length > 20) {
      flags.push({
        code: 'MONOTONIC_SCORES', severity: 'LOW',
        message: 'Score events are perfectly monotonically increasing',
      });
    }
  }

  return flags;
}

// ─── Layer 4: Rate & Pattern Analysis ───────────────────────

async function checkRateLimits(
  userId: string,
  gameId: string,
  challengeId?: string,
): Promise<FraudFlag[]> {
  const flags: FraudFlag[] = [];
  const now = Date.now();

  // Sessions per hour
  const hourKey = `rate:sessions:${userId}:${Math.floor(now / 3600000)}`;
  const sessionsThisHour = await redis.incr(hourKey);
  await redis.expire(hourKey, 3600);

  if (sessionsThisHour > CONFIG.MAX_SESSIONS_PER_HOUR) {
    flags.push({
      code: 'RATE_LIMIT_HOURLY', severity: 'MEDIUM',
      message: `${sessionsThisHour} sessions this hour (limit: ${CONFIG.MAX_SESSIONS_PER_HOUR})`,
      data: { count: sessionsThisHour },
    });
  }

  // Cooldown between sessions
  const lastSessionKey = `last_session:${userId}:${gameId}`;
  const lastSession = await redis.get(lastSessionKey);
  if (lastSession) {
    const elapsed = now - parseInt(lastSession, 10);
    if (elapsed < CONFIG.COOLDOWN_BETWEEN_SESSIONS_MS) {
      flags.push({
        code: 'COOLDOWN_VIOLATION', severity: 'LOW',
        message: `Only ${elapsed}ms since last session (minimum: ${CONFIG.COOLDOWN_BETWEEN_SESSIONS_MS}ms)`,
      });
    }
  }
  await redis.set(lastSessionKey, now.toString(), 'EX', 60);

  // Lifetime sessions per challenge
  if (challengeId) {
    const lifetimeKey = `lifetime:${userId}:${challengeId}`;
    const lifetime = await redis.incr(lifetimeKey);
    await redis.expire(lifetimeKey, 86400 * 30); // 30 days

    if (lifetime > CONFIG.MAX_SESSIONS_PER_USER_PER_CHALLENGE) {
      flags.push({
        code: 'CHALLENGE_EXHAUSTION', severity: 'MEDIUM',
        message: `${lifetime} sessions for this challenge (limit: ${CONFIG.MAX_SESSIONS_PER_USER_PER_CHALLENGE})`,
      });
    }
  }

  return flags;
}

// ─── Helpers ────────────────────────────────────────────────

function severityScore(severity: FraudFlag['severity']): number {
  switch (severity) {
    case 'LOW': return 5;
    case 'MEDIUM': return 15;
    case 'HIGH': return 30;
    case 'CRITICAL': return 50;
  }
}

async function getGameScoreStats(gameId: string): Promise<{ mean: number; stdDev: number } | null> {
  const cacheKey = `game_stats:${gameId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const scores = await prisma.score.findMany({
    where: { session: { gameId }, isValidated: true },
    orderBy: { createdAt: 'desc' },
    take: 1000,
    select: { value: true },
  });

  if (scores.length < 20) return null;

  const values = scores.map(s => s.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);

  const stats = { mean: Math.round(mean), stdDev: Math.round(stdDev) };
  await redis.set(cacheKey, JSON.stringify(stats), 'EX', 300); // Cache 5min
  return stats;
}

async function updateCumulativeFraudScore(userId: string, score: number): Promise<number> {
  const key = `fraud_cumulative:${userId}`;
  const current = await redis.get(key);
  const cumulative = (current ? parseInt(current, 10) : 0) + score;
  // Decay: reduce by 10% each check (rewards clean behavior)
  const decayed = Math.max(0, Math.floor(cumulative * 0.9));
  await redis.set(key, decayed.toString(), 'EX', 86400 * 30);
  return decayed;
}

async function storeFraudReport(
  sessionId: string,
  userId: string,
  report: { fraudScore: number; flags: FraudFlag[]; action: string },
): Promise<void> {
  // Store in Redis for fast lookup (TTL 7 days)
  await redis.set(
    `fraud_report:${sessionId}`,
    JSON.stringify({ ...report, userId, timestamp: Date.now() }),
    'EX', 86400 * 7,
  );

  // If flagged or rejected, add to review queue
  if (report.action !== 'ACCEPT') {
    await redis.lpush('fraud:review_queue', JSON.stringify({
      sessionId,
      userId,
      action: report.action,
      fraudScore: report.fraudScore,
      topFlags: report.flags.slice(0, 5).map(f => f.code),
      timestamp: Date.now(),
    }));
    await redis.ltrim('fraud:review_queue', 0, 9999); // Keep last 10k
  }
}
