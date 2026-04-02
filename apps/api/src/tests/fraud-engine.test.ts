import { describe, it, expect } from 'vitest';

// Import the functions we can unit test without DB/Redis
// We test the pure functions: validateInputIntegrity, analyzeBehavioralPatterns

// Since these are not exported, we'll test via the public interface
// For now, test the severity scoring and behavioral analysis logic

describe('Fraud Engine — Input Validation', () => {
  it('rejects negative scores', async () => {
    const { validateSession } = await import('../anticheat/fraud-engine');

    const mockSession = {
      id: 'test-session',
      gameId: 'test-game',
      seed: 'test-seed',
      startedAt: new Date(Date.now() - 10000), // 10 seconds ago
    };

    const result = await validateSession(mockSession, -1, null, 'test-user');
    const hasNegativeFlag = result.flags.some(f => f.code === 'NEGATIVE_SCORE');
    expect(hasNegativeFlag).toBe(true);
    expect(result.fraudScore).toBeGreaterThanOrEqual(50); // CRITICAL = 50 points
  });

  it('rejects scores exceeding maximum', async () => {
    const { validateSession } = await import('../anticheat/fraud-engine');

    const mockSession = {
      id: 'test-session',
      gameId: 'test-game',
      seed: 'test-seed',
      startedAt: new Date(Date.now() - 10000),
    };

    const result = await validateSession(mockSession, 1_000_000_000, null, 'test-user');
    const hasOverflowFlag = result.flags.some(f => f.code === 'SCORE_OVERFLOW');
    expect(hasOverflowFlag).toBe(true);
  });

  it('flags sessions completed too quickly', async () => {
    const { validateSession } = await import('../anticheat/fraud-engine');

    const mockSession = {
      id: 'test-session',
      gameId: 'test-game',
      seed: 'test-seed',
      startedAt: new Date(Date.now() - 500), // 500ms ago — too fast
    };

    const result = await validateSession(mockSession, 100, null, 'test-user');
    const hasTooShortFlag = result.flags.some(f => f.code === 'SESSION_TOO_SHORT');
    expect(hasTooShortFlag).toBe(true);
  });

  it('flags seed mismatch in replay data', async () => {
    const { validateSession } = await import('../anticheat/fraud-engine');

    const mockSession = {
      id: 'test-session',
      gameId: 'test-game',
      seed: 'correct-seed',
      startedAt: new Date(Date.now() - 10000),
    };

    const replayData = {
      seed: 'wrong-seed',
      inputTimeline: [{ timestamp: 0, type: 'jump', data: {}, sequence: 0 }],
      duration: 10000,
    };

    const result = await validateSession(mockSession, 100, replayData, 'test-user');
    const hasMismatchFlag = result.flags.some(f => f.code === 'SEED_MISMATCH');
    expect(hasMismatchFlag).toBe(true);
  });

  it('flags non-zero score with no replay data', async () => {
    const { validateSession } = await import('../anticheat/fraud-engine');

    const mockSession = {
      id: 'test-session',
      gameId: 'test-game',
      seed: 'test-seed',
      startedAt: new Date(Date.now() - 10000),
    };

    const result = await validateSession(mockSession, 500, null, 'test-user');
    const hasMissingReplayFlag = result.flags.some(f => f.code === 'MISSING_REPLAY');
    expect(hasMissingReplayFlag).toBe(true);
  });
});

describe('Fraud Engine — Behavioral Analysis', () => {
  it('flags robotic timing (low coefficient of variation)', async () => {
    const { validateSession } = await import('../anticheat/fraud-engine');

    // Generate 30 inputs with near-identical intervals (bot-like)
    const inputTimeline = Array.from({ length: 30 }, (_, i) => ({
      timestamp: i * 100, // exactly 100ms apart — CV near 0
      type: 'tap',
      data: {},
      sequence: i,
    }));

    const mockSession = {
      id: 'test-session',
      gameId: 'test-game',
      seed: 'test-seed',
      startedAt: new Date(Date.now() - 5000),
    };

    const replayData = {
      seed: 'test-seed',
      inputTimeline,
      duration: 3000,
    };

    const result = await validateSession(mockSession, 100, replayData, 'test-user');
    const hasRoboticFlag = result.flags.some(f => f.code === 'ROBOTIC_TIMING');
    expect(hasRoboticFlag).toBe(true);
  });

  it('accepts human-like timing (high coefficient of variation)', async () => {
    const { validateSession } = await import('../anticheat/fraud-engine');

    // Generate inputs with varied human-like intervals
    const timestamps = [0, 230, 510, 680, 1100, 1250, 1600, 1850, 2300, 2450, 2900, 3100];
    const inputTimeline = timestamps.map((ts, i) => ({
      timestamp: ts,
      type: 'tap',
      data: {},
      sequence: i,
    }));

    const mockSession = {
      id: 'test-session',
      gameId: 'test-game',
      seed: 'test-seed',
      startedAt: new Date(Date.now() - 5000),
    };

    const replayData = {
      seed: 'test-seed',
      inputTimeline,
      duration: 3100,
    };

    const result = await validateSession(mockSession, 100, replayData, 'test-user');
    const hasRoboticFlag = result.flags.some(f => f.code === 'ROBOTIC_TIMING');
    expect(hasRoboticFlag).toBe(false);
  });
});
