import crypto from 'crypto';
import { prisma } from '../main';
import { AppError } from '../common/error-handler';
import {
  setRoomState,
  publishRoomEvent,
  addTimer,
  removeTimer,
  cleanupRoom,
  getReadyPlayers,
} from './room-redis';

// ─── Valid Transitions ──────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  WAITING: ['FULL', 'EXPIRED', 'CANCELLED'],
  FULL: ['READY_CHECK'],
  READY_CHECK: ['COUNTDOWN', 'CANCELLED'],
  COUNTDOWN: ['IN_PROGRESS'],
  IN_PROGRESS: ['SETTLING'],
  SETTLING: ['COMPLETED'],
};

function assertTransition(from: string, to: string): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new AppError(`Invalid room transition: ${from} → ${to}`, 400);
  }
}

// ─── WAITING → FULL → READY_CHECK ──────────────────────────

export async function transitionToReadyCheck(roomId: string): Promise<void> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      game: { select: { readyTimeout: true } },
      participants: {
        include: { user: { select: { username: true, displayName: true } } },
      },
    },
  });
  if (!room) throw new AppError('Room not found', 404);

  // FULL is a transient state — go straight to READY_CHECK
  const readyTimeout = room.game.readyTimeout * 1000; // seconds → ms
  const expiresAt = Date.now() + readyTimeout;

  await prisma.room.update({
    where: { id: roomId },
    data: { status: 'READY_CHECK', readyCheckAt: new Date() },
  });

  const players = room.participants.map(p => ({
    userId: p.userId,
    displayName: p.user.displayName || p.user.username,
  }));

  await setRoomState(roomId, {
    status: 'READY_CHECK',
    players: JSON.stringify(players),
    readyPlayers: '[]',
    maxPlayers: String(room.maxPlayers),
  });

  await addTimer(`room:${roomId}:ready_check`, expiresAt);

  await publishRoomEvent(roomId, {
    type: 'ready_check_started',
    expiresAt,
    players,
  });
}

// ─── READY_CHECK → COUNTDOWN ────────────────────────────────

export async function transitionToCountdown(roomId: string): Promise<void> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { game: { select: { countdownDuration: true } } },
  });
  if (!room) return;
  assertTransition(room.status, 'COUNTDOWN');

  const countdownMs = room.game.countdownDuration * 1000;
  const launchAt = Date.now() + countdownMs;

  await prisma.room.update({
    where: { id: roomId },
    data: { status: 'COUNTDOWN', countdownAt: new Date() },
  });

  await removeTimer(`room:${roomId}:ready_check`);
  await addTimer(`room:${roomId}:launch`, launchAt);

  await setRoomState(roomId, { status: 'COUNTDOWN', launchAt: String(launchAt) });

  await publishRoomEvent(roomId, {
    type: 'countdown_started',
    launchAt,
  });
}

// ─── COUNTDOWN → IN_PROGRESS (Launch) ──────────────────────

export async function transitionToInProgress(roomId: string): Promise<void> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      participants: true,
      game: {
        select: {
          id: true,
          maxSessionDuration: true,
          connectTimeout: true,
          deepLinkScheme: true,
        },
      },
    },
  });
  if (!room) return;
  assertTransition(room.status, 'IN_PROGRESS');

  // Generate shared seed
  const seed = crypto.randomBytes(16).toString('hex');
  const now = new Date();
  const sessionExpiry = new Date(now.getTime() + room.game.maxSessionDuration * 1000);

  // Create GameSession per participant + update RoomParticipant.sessionId
  const sessionsMap: Record<string, { token: string; seed: string }> = {};

  await prisma.$transaction(async (tx) => {
    for (const participant of room.participants) {
      const token = crypto.randomBytes(32).toString('hex');
      const session = await tx.gameSession.create({
        data: {
          userId: participant.userId,
          gameId: room.game.id,
          seed,
          token,
          status: 'CREATED',
          expiresAt: sessionExpiry,
          config: { seed, roomId },
        },
      });
      await tx.roomParticipant.update({
        where: { id: participant.id },
        data: { sessionId: session.id },
      });
      sessionsMap[participant.userId] = { token, seed };
    }

    await tx.room.update({
      where: { id: roomId },
      data: { status: 'IN_PROGRESS', startedAt: now },
    });
  });

  // Set timers
  const connectDeadline = Date.now() + room.game.connectTimeout * 1000;
  const sessionDeadline = Date.now() + room.game.maxSessionDuration * 1000;
  await removeTimer(`room:${roomId}:launch`);
  await addTimer(`room:${roomId}:connect_timeout`, connectDeadline);
  await addTimer(`room:${roomId}:session_timeout`, sessionDeadline);

  await setRoomState(roomId, { status: 'IN_PROGRESS' });

  await publishRoomEvent(roomId, {
    type: 'game_launching',
    sessions: sessionsMap,
    deepLinkScheme: room.game.deepLinkScheme,
  });
}

// ─── IN_PROGRESS → SETTLING ─────────────────────────────────

export async function transitionToSettling(roomId: string): Promise<void> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.status !== 'IN_PROGRESS') return;

  await prisma.room.update({
    where: { id: roomId },
    data: { status: 'SETTLING' },
  });

  await removeTimer(`room:${roomId}:connect_timeout`);
  await removeTimer(`room:${roomId}:session_timeout`);

  await setRoomState(roomId, { status: 'SETTLING' });
  await publishRoomEvent(roomId, { type: 'settling' });
}

// ─── Cancel Room (ready check failed / refund) ─────────────

export async function cancelRoom(roomId: string, reason: string): Promise<void> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      participants: true,
      game: { select: { title: true } },
    },
  });
  if (!room) return;

  const readyPlayers = await getReadyPlayers(roomId);

  await prisma.$transaction(async (tx) => {
    // Refund ALL participants (full entry fee — platform waives fee)
    const refunds: { userId: string; amount: string }[] = [];
    for (const participant of room.participants) {
      const wallet = await tx.wallet.findUnique({ where: { userId: participant.userId } });
      if (!wallet) continue;

      const newBalance = wallet.balance.add(room.entryFee);
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'REFUND',
          amount: room.entryFee,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          description: `Room cancelled: ${room.game.title} (${reason})`,
          referenceId: roomId,
        },
      });

      // Set participant outcome
      const isReady = readyPlayers.includes(participant.userId);
      await tx.roomParticipant.update({
        where: { id: participant.id },
        data: { outcome: isReady ? 'NOT_READY' : 'NOT_READY' },
      });

      refunds.push({ userId: participant.userId, amount: room.entryFee.toString() });
    }

    await tx.room.update({
      where: { id: roomId },
      data: { status: 'CANCELLED' },
    });
  }, { isolationLevel: 'Serializable' });

  const notReadyPlayers = room.participants
    .filter(p => !readyPlayers.includes(p.userId))
    .map(p => p.userId);

  await publishRoomEvent(roomId, {
    type: 'ready_check_failed',
    reason,
    notReadyPlayers,
  });

  await cleanupRoom(roomId);
}

// ─── Check if all sessions are terminal ─────────────────────

export async function checkAllSessionsTerminal(roomId: string): Promise<boolean> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { participants: true },
  });
  if (!room) return false;

  const sessionIds = room.participants
    .filter(p => p.sessionId)
    .map(p => p.sessionId!);

  if (sessionIds.length === 0) return false;

  const terminalCount = await prisma.gameSession.count({
    where: {
      id: { in: sessionIds },
      status: { in: ['COMPLETED', 'REJECTED', 'EXPIRED'] },
    },
  });

  return terminalCount >= room.participants.length;
}
