import { describe, it, expect } from 'vitest';

// Import the pure validation functions directly (no DB/Redis needed)
import {
  validateUniversal,
  validateGameConfigured,
  analyzeBehavior,
} from './generic-fraud-engine';

import type { GameDefinition } from '@oghub/shared';

const shooterDef: GameDefinition = {
  name: 'Space Blaster',
  slug: 'space-blaster',
  version: '1.0.0',
  engine: 'unity',
  inputs: [
    { name: 'shoot', type: 'action' },
    { name: 'move', type: 'vector2' },
  ],
  scoring: { range: [0, 999999], method: 'accumulative' },
  session: { maxDuration: 300, minDuration: 10, allowPause: false },
  anticheat: { maxInputRate: 30, minReactionTime: 50, maxScorePerSecond: 5000 },
  trust: { tier: 'standard' },
  validation: { snapshotInterval: 5, requiredFields: ['hp', 'score'] },
};

describe('Generic Fraud Engine — Layer 1: Universal', () => {
  it('rejects score below range', () => {
    const flags = validateUniversal(
      { seed: 'abc', startedAt: new Date(Date.now() - 15000) },
      -1, null, shooterDef,
    );
    expect(flags.some(f => f.code === 'SCORE_BELOW_RANGE')).toBe(true);
  });

  it('rejects score above range', () => {
    const flags = validateUniversal(
      { seed: 'abc', startedAt: new Date(Date.now() - 15000) },
      1_000_001, null, shooterDef,
    );
    expect(flags.some(f => f.code === 'SCORE_ABOVE_RANGE')).toBe(true);
  });

  it('rejects session shorter than minDuration', () => {
    const flags = validateUniversal(
      { seed: 'abc', startedAt: new Date(Date.now() - 3000) },
      100, null, shooterDef,
    );
    expect(flags.some(f => f.code === 'SESSION_TOO_SHORT')).toBe(true);
  });

  it('rejects session longer than maxDuration', () => {
    const flags = validateUniversal(
      { seed: 'abc', startedAt: new Date(Date.now() - 400000) },
      100, null, shooterDef,
    );
    expect(flags.some(f => f.code === 'SESSION_TOO_LONG')).toBe(true);
  });

  it('flags seed mismatch', () => {
    const flags = validateUniversal(
      { seed: 'correct-seed', startedAt: new Date(Date.now() - 15000) },
      100,
      { seed: 'wrong-seed', inputTimeline: [{ timestamp: 0, type: 'x', data: {}, sequence: 0 }], duration: 10000 },
      shooterDef,
    );
    expect(flags.some(f => f.code === 'SEED_MISMATCH')).toBe(true);
  });

  it('flags missing replay for non-zero score', () => {
    const flags = validateUniversal(
      { seed: 'abc', startedAt: new Date(Date.now() - 15000) },
      500, null, shooterDef,
    );
    expect(flags.some(f => f.code === 'MISSING_REPLAY')).toBe(true);
  });
});

describe('Generic Fraud Engine — Layer 2: Game-Configured', () => {
  it('flags input rate exceeding game limit', () => {
    // 100 inputs in 2 seconds = 50/s, limit is 30/s
    const timeline = Array.from({ length: 100 }, (_, i) => ({
      timestamp: i * 20, type: 'shoot', data: {}, sequence: i,
    }));
    const replay = { seed: 'abc', inputTimeline: timeline, duration: 2000 };

    const flags = validateGameConfigured(
      { startedAt: new Date(Date.now() - 15000) },
      100, replay, shooterDef,
    );
    expect(flags.some(f => f.code === 'EXCESSIVE_INPUT_RATE')).toBe(true);
  });

  it('flags score per second exceeding game limit', () => {
    // Score 100000 in 5 seconds = 20000/s, limit is 5000/s
    const flags = validateGameConfigured(
      { startedAt: new Date(Date.now() - 5000) },
      100000, null, shooterDef,
    );
    expect(flags.some(f => f.code === 'SCORE_RATE_TOO_HIGH')).toBe(true);
  });

  it('flags superhuman reaction times', () => {
    // Inputs 10ms apart, limit is 50ms
    const timeline = Array.from({ length: 30 }, (_, i) => ({
      timestamp: i * 10, type: 'shoot', data: {}, sequence: i,
    }));
    const replay = { seed: 'abc', inputTimeline: timeline, duration: 300 };

    const flags = validateGameConfigured(
      { startedAt: new Date(Date.now() - 15000) },
      100, replay, shooterDef,
    );
    expect(flags.some(f => f.code === 'SUPERHUMAN_REACTIONS')).toBe(true);
  });
});

describe('Generic Fraud Engine — Layer 3: Behavioral', () => {
  it('flags robotic timing', () => {
    const timeline = Array.from({ length: 40 }, (_, i) => ({
      timestamp: i * 100, type: 'shoot', data: {}, sequence: i,
    }));
    const replay = { seed: 'abc', inputTimeline: timeline, duration: 4000 };

    const flags = analyzeBehavior(replay, shooterDef);
    expect(flags.some(f => f.code === 'ROBOTIC_TIMING')).toBe(true);
  });

  it('accepts human-like timing', () => {
    const timestamps = [0, 230, 510, 680, 1100, 1250, 1600, 1850, 2300, 2450, 2900, 3100];
    const timeline = timestamps.map((ts, i) => ({
      timestamp: ts, type: 'shoot', data: {}, sequence: i,
    }));
    const replay = { seed: 'abc', inputTimeline: timeline, duration: 3100 };

    const flags = analyzeBehavior(replay, shooterDef);
    expect(flags.some(f => f.code === 'ROBOTIC_TIMING')).toBe(false);
  });
});
