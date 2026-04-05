import { prisma } from '../main';
import { Decimal } from '@prisma/client/runtime/library';
import { distributeRoomPrizes } from './room-prizes';

const LIFECYCLE_INTERVAL_MS = 15_000; // Check every 15 seconds

export async function runRoomLifecycleTick(): Promise<{
  expired: number;
  completed: number;
}> {
  const now = new Date();

  // 1. Expire rooms that passed their expiry time while still WAITING
  const expiredRooms = await prisma.room.findMany({
    where: {
      status: 'WAITING',
      expiresAt: { lte: now },
    },
    include: {
      participants: true,
      game: { select: { title: true } },
    },
  });

  for (const room of expiredRooms) {
    try {
      await prisma.$transaction(async (tx) => {
        // Refund all participants
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
              description: `Room expired: ${room.game.title}`,
              referenceId: room.id,
            },
          });
        }

        await tx.room.update({
          where: { id: room.id },
          data: { status: 'EXPIRED' },
        });
      }, { isolationLevel: 'Serializable' });
    } catch (err) {
      console.error(`[Room Lifecycle] Expiry failed for room ${room.id}:`, err);
    }
  }

  // 2. Check for IN_PROGRESS rooms where all participants have completed sessions
  const inProgressRooms = await prisma.room.findMany({
    where: { status: 'IN_PROGRESS' },
    include: { participants: true },
  });

  let completedCount = 0;
  for (const room of inProgressRooms) {
    const sessionIds = room.participants
      .filter(p => p.sessionId)
      .map(p => p.sessionId!);

    if (sessionIds.length === 0) continue;

    // Check if all sessions are in a terminal state
    const completedSessions = await prisma.gameSession.count({
      where: {
        id: { in: sessionIds },
        status: { in: ['COMPLETED', 'REJECTED', 'EXPIRED'] },
      },
    });

    if (completedSessions >= room.participants.length) {
      try {
        await prisma.room.update({
          where: { id: room.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        await distributeRoomPrizes(room.id);
        completedCount++;
      } catch (err) {
        console.error(`[Room Lifecycle] Completion failed for room ${room.id}:`, err);
      }
    }
  }

  return { expired: expiredRooms.length, completed: completedCount };
}

let lifecycleTimer: ReturnType<typeof setInterval> | null = null;

export function startRoomLifecycleWorker(): void {
  if (lifecycleTimer) return;
  console.log('[Room Lifecycle] Worker started');

  lifecycleTimer = setInterval(async () => {
    try {
      const result = await runRoomLifecycleTick();
      if (result.expired > 0 || result.completed > 0) {
        console.log(`[Room Lifecycle] Expired: ${result.expired}, Completed: ${result.completed}`);
      }
    } catch (err) {
      console.error('[Room Lifecycle] Error:', err);
    }
  }, LIFECYCLE_INTERVAL_MS);

  runRoomLifecycleTick().catch(console.error);
}

export function stopRoomLifecycleWorker(): void {
  if (lifecycleTimer) { clearInterval(lifecycleTimer); lifecycleTimer = null; }
}
