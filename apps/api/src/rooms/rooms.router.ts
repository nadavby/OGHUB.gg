import { Router } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../main';
import { authGuard, AuthenticatedRequest } from '../common/auth';
import { AppError } from '../common/error-handler';
import { validate, createRoomSchema, listRoomsSchema } from '../common/schemas';

export const roomsRouter = Router();

roomsRouter.use(authGuard);

const FORMAT_MAX_PLAYERS: Record<string, number> = {
  ONE_V_ONE: 2,
  BEST_OF_3: 2,
  FFA_5: 5,
  FFA_10: 10,
  FFA_20: 20,
};

const FORMAT_TOTAL_ROUNDS: Record<string, number> = {
  ONE_V_ONE: 1,
  BEST_OF_3: 3,
  FFA_5: 1,
  FFA_10: 1,
  FFA_20: 1,
};

const MAX_ACTIVE_ROOMS = 3;
const ROOM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const PLATFORM_FEE_RATE = new Decimal('0.05'); // 5%

// ─── Create Room ────────────────────────────────────────────

roomsRouter.post('/create', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { gameId, format, entryFee } = validate(createRoomSchema, req.body);
    const userId = req.user!.userId;

    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game || !game.isActive) throw new AppError('Game not found', 404);

    const fee = new Decimal(entryFee);
    const maxPlayers = FORMAT_MAX_PLAYERS[format];
    const totalRounds = FORMAT_TOTAL_ROUNDS[format];

    const room = await prisma.$transaction(async (tx) => {
      // Check active room limit inside transaction to prevent race conditions
      const activeCount = await tx.roomParticipant.count({
        where: {
          userId,
          room: { status: { in: ['WAITING', 'FULL', 'READY_CHECK', 'COUNTDOWN', 'IN_PROGRESS', 'SETTLING'] } },
        },
      });
      if (activeCount >= MAX_ACTIVE_ROOMS) {
        throw new AppError(`You can only be in ${MAX_ACTIVE_ROOMS} active rooms at a time`, 429);
      }

      // Deduct entry fee from creator
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new AppError('Wallet not found', 404);
      if (wallet.balance.lt(fee)) {
        throw new AppError('Insufficient balance', 402);
      }

      const newBalance = wallet.balance.sub(fee);
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });

      // Calculate initial prize pool contribution
      const platformCut = fee.mul(PLATFORM_FEE_RATE);
      const poolContribution = fee.sub(platformCut);

      // Create room
      const created = await tx.room.create({
        data: {
          gameId,
          createdByUserId: userId,
          format,
          entryFee: fee,
          prizePool: poolContribution,
          platformFee: PLATFORM_FEE_RATE,
          maxPlayers,
          totalRounds,
          status: 'WAITING',
          expiresAt: new Date(Date.now() + ROOM_EXPIRY_MS),
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ENTRY_FEE',
          amount: fee.neg(),
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          description: `Room entry: ${game.title} (${format})`,
          referenceId: created.id,
        },
      });

      // Auto-enter creator as first participant
      await tx.roomParticipant.create({
        data: { roomId: created.id, userId },
      });

      return created;
    }, { isolationLevel: 'Serializable' });

    res.status(201).json({
      success: true,
      data: {
        id: room.id,
        gameId: room.gameId,
        format: room.format,
        entryFee: room.entryFee.toString(),
        prizePool: room.prizePool.toString(),
        maxPlayers: room.maxPlayers,
        currentPlayers: 1,
        status: room.status,
        expiresAt: room.expiresAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── List Rooms ─────────────────────────────────────────────

roomsRouter.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { gameId, status, page, limit } = validate(listRoomsSchema, req.query);

    const mine = req.query.mine === 'true';
    const where: any = {};
    if (gameId) where.gameId = gameId;
    if (status) {
      where.status = status;
    } else if (!mine) {
      where.status = 'WAITING'; // Default for public lobby; mine=true shows all statuses
    }
    if (mine) {
      const userId = req.user!.userId;
      where.participants = { some: { userId } };
    }

    const [rooms, total] = await Promise.all([
      prisma.room.findMany({
        where,
        include: {
          game: { select: { title: true, slug: true } },
          createdBy: { select: { username: true, displayName: true } },
          _count: { select: { participants: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.room.count({ where }),
    ]);

    res.json({
      success: true,
      data: rooms.map(r => ({
        id: r.id,
        gameId: r.gameId,
        gameTitle: r.game.title,
        gameSlug: r.game.slug,
        creator: r.createdBy.displayName || r.createdBy.username,
        format: r.format,
        entryFee: r.entryFee.toString(),
        prizePool: r.prizePool.toString(),
        maxPlayers: r.maxPlayers,
        currentPlayers: r._count.participants,
        status: r.status,
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Get Room Detail ────────────────────────────────────────

roomsRouter.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const room = await prisma.room.findUnique({
      where: { id: (req.params.id as string) },
      include: {
        game: { select: { title: true, slug: true } },
        createdBy: { select: { username: true, displayName: true } },
        participants: {
          include: { user: { select: { username: true, displayName: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!room) throw new AppError('Room not found', 404);

    res.json({
      success: true,
      data: {
        id: room.id,
        gameId: room.gameId,
        gameTitle: room.game.title,
        gameSlug: room.game.slug,
        creator: room.createdBy.displayName || room.createdBy.username,
        createdByUserId: room.createdByUserId,
        format: room.format,
        entryFee: room.entryFee.toString(),
        prizePool: room.prizePool.toString(),
        maxPlayers: room.maxPlayers,
        currentPlayers: room.participants.length,
        currentRound: room.currentRound,
        totalRounds: room.totalRounds,
        status: room.status,
        expiresAt: room.expiresAt.toISOString(),
        participants: room.participants.map(p => ({
          userId: p.userId,
          username: p.user.displayName || p.user.username,
          joinedAt: p.joinedAt.toISOString(),
        })),
        createdAt: room.createdAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Join Room ──────────────────────────────────────────────

roomsRouter.post('/:id/join', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const roomId = (req.params.id as string);

    const result = await prisma.$transaction(async (tx) => {
      // Check active room limit inside transaction to prevent race conditions
      const activeCount = await tx.roomParticipant.count({
        where: {
          userId,
          room: { status: { in: ['WAITING', 'FULL', 'READY_CHECK', 'COUNTDOWN', 'IN_PROGRESS', 'SETTLING'] } },
        },
      });
      if (activeCount >= MAX_ACTIVE_ROOMS) {
        throw new AppError(`You can only be in ${MAX_ACTIVE_ROOMS} active rooms at a time`, 429);
      }

      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: {
          _count: { select: { participants: true } },
          game: { select: { title: true } },
        },
      });

      if (!room) throw new AppError('Room not found', 404);
      if (room.status !== 'WAITING') {
        throw new AppError('Room is no longer accepting players', 400);
      }

      // Check if already joined
      const existing = await tx.roomParticipant.findUnique({
        where: { roomId_userId: { roomId, userId } },
      });
      if (existing) throw new AppError('You are already in this room', 400);

      // Check if room is full
      if (room._count.participants >= room.maxPlayers) {
        throw new AppError('Room is full', 400);
      }

      // Deduct entry fee
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new AppError('Wallet not found', 404);
      if (wallet.balance.lt(room.entryFee)) {
        throw new AppError('Insufficient balance', 402);
      }

      const newBalance = wallet.balance.sub(room.entryFee);
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ENTRY_FEE',
          amount: room.entryFee.neg(),
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          description: `Room entry: ${room.game.title} (${room.format})`,
          referenceId: roomId,
        },
      });

      // Add to prize pool
      const platformCut = room.entryFee.mul(room.platformFee);
      const poolContribution = room.entryFee.sub(platformCut);

      // Add participant
      await tx.roomParticipant.create({
        data: { roomId, userId },
      });

      const newPlayerCount = room._count.participants + 1;
      const isFull = newPlayerCount >= room.maxPlayers;

      // Update room
      await tx.room.update({
        where: { id: roomId },
        data: {
          prizePool: { increment: poolContribution },
          ...(isFull ? { status: 'FULL' as const } : {}),
        },
      });

      return { isFull, newPlayerCount };
    }, { isolationLevel: 'Serializable' });

    // Publish join event + trigger ready check if full (outside transaction)
    const { publishRoomEvent } = await import('./room-redis');
    const joiner = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, displayName: true },
    });
    await publishRoomEvent(roomId, {
      type: 'player_joined',
      userId,
      displayName: joiner?.displayName || joiner?.username || userId,
      slot: result.newPlayerCount,
    });

    if (result.isFull) {
      const { transitionToReadyCheck } = await import('./room-state-machine');
      await transitionToReadyCheck(roomId);
    }

    res.json({
      success: true,
      data: {
        joined: true,
        roomId,
        currentPlayers: result.newPlayerCount,
        isFull: result.isFull,
        status: result.isFull ? 'FULL' : 'WAITING',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Cancel Room (creator only, before anyone else joins) ───

roomsRouter.post('/:id/cancel', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const roomId = (req.params.id as string);

    const result = await prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: {
          participants: true,
          game: { select: { title: true } },
        },
      });

      if (!room) throw new AppError('Room not found', 404);
      if (room.createdByUserId !== userId) {
        throw new AppError('Only the room creator can cancel', 403);
      }
      if (room.status !== 'WAITING') {
        throw new AppError('Room can only be cancelled while waiting', 400);
      }
      if (room.participants.length > 1) {
        throw new AppError('Cannot cancel room after other players have joined', 400);
      }

      // Refund creator's entry fee
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (wallet) {
        const newBalance = wallet.balance.add(room.entryFee);
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'REFUND',
            amount: room.entryFee,
            balanceBefore: wallet.balance,
            balanceAfter: newBalance,
            description: `Room cancelled: ${room.game.title}`,
            referenceId: roomId,
          },
        });
      }

      // Remove participant and cancel room
      await tx.roomParticipant.deleteMany({ where: { roomId } });
      await tx.room.update({
        where: { id: roomId },
        data: { status: 'CANCELLED', prizePool: 0 },
      });

      return true;
    }, { isolationLevel: 'Serializable' });

    res.json({ success: true, data: { cancelled: true } });
  } catch (err) {
    next(err);
  }
});

// ─── Ready Up ─────────────────────────────────────────────────

roomsRouter.post('/:id/ready', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const roomId = (req.params.id as string);

    // Verify room is in READY_CHECK
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { game: true },
    });
    if (!room) throw new AppError('Room not found', 404);
    if (room.status !== 'READY_CHECK') {
      throw new AppError('Room is not in ready check phase', 400);
    }

    // Verify user is participant
    const participant = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!participant) throw new AppError('You are not in this room', 403);

    // Add to ready set (idempotent)
    const { addReady, publishRoomEvent } = await import('./room-redis');
    const readyCount = await addReady(roomId, userId);

    // Update DB
    await prisma.roomParticipant.update({
      where: { id: participant.id },
      data: { isReady: true, readyAt: new Date() },
    });

    await publishRoomEvent(roomId, { type: 'player_ready', userId });

    // Check if all ready
    if (readyCount >= room.maxPlayers) {
      const { transitionToCountdown } = await import('./room-state-machine');
      await transitionToCountdown(roomId);
    }

    res.json({ success: true, data: { ready: true, readyCount } });
  } catch (err) {
    next(err);
  }
});
