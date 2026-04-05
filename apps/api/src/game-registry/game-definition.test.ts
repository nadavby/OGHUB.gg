import { describe, it, expect } from 'vitest';
import { parseGameDefinition } from './game-definition';

describe('Game Definition Parser', () => {
  const validDefinition = {
    name: 'Space Blaster',
    slug: 'space-blaster',
    version: '1.0.0',
    engine: 'unity',
    inputs: [
      { name: 'shoot', type: 'action' },
      { name: 'move', type: 'vector2' },
    ],
    scoring: {
      range: [0, 999999],
      method: 'accumulative',
      components: [{ name: 'kills', weight: 100 }],
    },
    session: {
      maxDuration: 300,
      minDuration: 10,
      allowPause: false,
      lives: 1,
    },
    anticheat: {
      maxInputRate: 30,
      minReactionTime: 50,
      maxScorePerSecond: 5000,
    },
    trust: {
      tier: 'standard',
    },
    validation: {
      snapshotInterval: 5,
      requiredFields: ['player_health', 'current_score'],
    },
  };

  it('parses a valid game definition', () => {
    const result = parseGameDefinition(validDefinition);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBe('space-blaster');
      expect(result.data.inputs).toHaveLength(2);
      expect(result.data.trust.tier).toBe('standard');
    }
  });

  it('rejects definition with invalid scoring range', () => {
    const invalid = {
      ...validDefinition,
      scoring: { ...validDefinition.scoring, range: [-1, 100] },
    };
    const result = parseGameDefinition(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects definition with unknown input type', () => {
    const invalid = {
      ...validDefinition,
      inputs: [{ name: 'shoot', type: 'laser_beam' }],
    };
    const result = parseGameDefinition(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects basic tier with validation config', () => {
    const invalid = {
      ...validDefinition,
      trust: { tier: 'basic' },
      validation: { snapshotInterval: 5, requiredFields: ['hp'] },
    };
    const result = parseGameDefinition(invalid);
    expect(result.success).toBe(false);
  });

  it('requires validation config for standard tier', () => {
    const noValidation = { ...validDefinition, validation: undefined };
    const result = parseGameDefinition(noValidation);
    expect(result.success).toBe(false);
  });

  it('rejects negative maxInputRate', () => {
    const invalid = {
      ...validDefinition,
      anticheat: { ...validDefinition.anticheat, maxInputRate: -5 },
    };
    const result = parseGameDefinition(invalid);
    expect(result.success).toBe(false);
  });
});
