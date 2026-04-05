import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores'),
  password: z.string().min(8).max(72),
  displayName: z.string().max(50).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const depositSchema = z.object({
  amount: z.number().positive('Amount must be positive').max(100000, 'Amount exceeds maximum'),
});

export const createSessionSchema = z.object({
  gameId: z.string().min(1, 'gameId is required'),
  challengeId: z.string().optional(),
});

export const endSessionSchema = z.object({
  score: z.number().int().min(0, 'Score cannot be negative'),
  replayData: z.object({
    seed: z.string(),
    inputTimeline: z.array(z.object({
      timestamp: z.number(),
      type: z.string(),
      data: z.any().optional(),
      sequence: z.number().int(),
    })),
    duration: z.number().int().min(0),
    checksum: z.string().optional(),
  }).nullable().optional(),
  metadata: z.any().optional(),
});

export const eventsSchema = z.object({
  events: z.array(z.object({
    eventType: z.string().optional(),
    type: z.string().optional(),
    payload: z.any().optional(),
    timestamp: z.number(),
    sequence: z.number().int(),
  })).min(1, 'At least one event is required').max(100, 'Maximum 100 events per batch'),
});

export const registerGameSchema = z.object({
  title: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens'),
  description: z.string().max(500).optional(),
  thumbnailUrl: z.string().url().optional().nullable(),
  bannerUrl: z.string().url().optional().nullable(),
  deepLinkScheme: z.string().max(50).optional().nullable(),
  difficulty: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string().max(20)).max(10).optional(),
});

export const createRoomSchema = z.object({
  gameId: z.string().min(1, 'gameId is required'),
  format: z.enum(['ONE_V_ONE', 'BEST_OF_3', 'FFA_5', 'FFA_10', 'FFA_20']),
  entryFee: z.number().min(0.50, 'Minimum entry fee is $0.50').max(100, 'Maximum entry fee is $100'),
});

export const listRoomsSchema = z.object({
  gameId: z.string().optional(),
  status: z.enum(['WAITING', 'READY', 'IN_PROGRESS', 'COMPLETED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const withdrawalSchema = z.object({
  amount: z.number().positive('Amount must be positive').max(10000, 'Amount exceeds maximum per withdrawal'),
});

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new (require('./error-handler').AppError)(message, 400);
  }
  return result.data;
}
