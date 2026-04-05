import { z } from 'zod';
import type { GameDefinition } from '@oghub/shared';

const inputDefinitionSchema = z.object({
  name: z.string().min(1).max(50),
  type: z.enum(['action', 'vector2', 'vector3', 'scalar', 'toggle']),
  metadata: z.record(z.string(), z.string()).optional(),
});

const scoringDefinitionSchema = z.object({
  range: z.tuple([z.number().min(0), z.number().min(0)]).refine(
    ([min, max]) => max > min,
    'Score range max must be greater than min',
  ),
  method: z.enum(['accumulative', 'time_based', 'objective_based', 'custom']),
  components: z.array(z.object({
    name: z.string().min(1),
    weight: z.number().positive(),
  })).optional(),
});

const sessionRulesSchema = z.object({
  maxDuration: z.number().positive().max(3600),
  minDuration: z.number().min(1).max(3600),
  allowPause: z.boolean(),
  lives: z.number().int().positive().optional(),
}).refine(
  (s) => s.maxDuration > s.minDuration,
  'maxDuration must be greater than minDuration',
);

const anticheatConfigSchema = z.object({
  maxInputRate: z.number().positive().max(1000),
  minReactionTime: z.number().min(0).max(5000),
  maxScorePerSecond: z.number().positive(),
  customRules: z.array(z.object({
    name: z.string().min(1),
    condition: z.string().min(1),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
  })).optional(),
});

const validationConfigSchema = z.object({
  snapshotInterval: z.number().positive().max(60),
  requiredFields: z.array(z.string().min(1)).min(1),
});

const trustConfigSchema = z.object({
  tier: z.enum(['basic', 'standard', 'verified']),
  replayFormat: z.string().optional(),
  replaySimulator: z.string().optional(),
});

const gameDefinitionSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  engine: z.string().min(1).max(30),
  inputs: z.array(inputDefinitionSchema).min(1).max(50),
  scoring: scoringDefinitionSchema,
  session: sessionRulesSchema,
  anticheat: anticheatConfigSchema,
  trust: trustConfigSchema,
  validation: validationConfigSchema.optional(),
}).superRefine((data, ctx) => {
  // Standard and verified tiers require validation config
  if (data.trust.tier !== 'basic' && !data.validation) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Trust tier '${data.trust.tier}' requires validation config`,
      path: ['validation'],
    });
  }
  // Basic tier should NOT have validation config
  if (data.trust.tier === 'basic' && data.validation) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Basic tier does not support live validation',
      path: ['validation'],
    });
  }
  // Verified tier requires replay simulator
  if (data.trust.tier === 'verified' && !data.trust.replaySimulator) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Verified tier requires replay_simulator',
      path: ['trust', 'replaySimulator'],
    });
  }
});

export type ParseResult =
  | { success: true; data: GameDefinition }
  | { success: false; errors: string[] };

export function parseGameDefinition(input: unknown): ParseResult {
  const result = gameDefinitionSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data as GameDefinition };
  }
  return {
    success: false,
    errors: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}
