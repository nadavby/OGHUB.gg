import { prisma } from '../main';
import { transitionToReadyCheck, transitionToSettling, cancelRoom } from './room-state-machine';
import { settleRoom } from './room-settlement';

const RECOVERY_INTERVAL_MS = 60_000; // Every 60 seconds
let recoveryInterval: ReturnType<typeof setInterval> | null = null;

export async function runRecoveryTick(): Promise<void> {
  const now = new Date();

  // 1. FULL rooms stuck > 10s → re-trigger ready check
  const stuckFull = await prisma.room.findMany({
    where: {
      status: 'FULL',
      updatedAt: { lte: new Date(now.getTime() - 10_000) },
    },
  });
  for (const room of stuckFull) {
    try {
      console.log(`[Recovery] Re-triggering ready check for stuck FULL room ${room.id}`);
      await transitionToReadyCheck(room.id);
    } catch (err) {
      console.error(`[Recovery] Failed for FULL room ${room.id}:`, err);
    }
  }

  // 2. READY_CHECK rooms > 60s → force cancel
  const stuckReadyCheck = await prisma.room.findMany({
    where: {
      status: 'READY_CHECK',
      readyCheckAt: { lte: new Date(now.getTime() - 60_000) },
    },
  });
  for (const room of stuckReadyCheck) {
    try {
      console.log(`[Recovery] Force-cancelling stuck READY_CHECK room ${room.id}`);
      await cancelRoom(room.id, 'Recovery: ready check stuck');
    } catch (err) {
      console.error(`[Recovery] Failed for READY_CHECK room ${room.id}:`, err);
    }
  }

  // 3. COUNTDOWN rooms > 30s → cancel
  const stuckCountdown = await prisma.room.findMany({
    where: {
      status: 'COUNTDOWN',
      countdownAt: { lte: new Date(now.getTime() - 30_000) },
    },
  });
  for (const room of stuckCountdown) {
    try {
      console.log(`[Recovery] Force-cancelling stuck COUNTDOWN room ${room.id}`);
      await cancelRoom(room.id, 'Recovery: countdown stuck');
    } catch (err) {
      console.error(`[Recovery] Failed for COUNTDOWN room ${room.id}:`, err);
    }
  }

  // 4. SETTLING rooms > 60s → re-run settlement (idempotent)
  const stuckSettling = await prisma.room.findMany({
    where: {
      status: 'SETTLING',
      updatedAt: { lte: new Date(now.getTime() - 60_000) },
    },
  });
  for (const room of stuckSettling) {
    try {
      console.log(`[Recovery] Re-running settlement for stuck room ${room.id}`);
      await settleRoom(room.id);
    } catch (err) {
      console.error(`[Recovery] Failed for SETTLING room ${room.id}:`, err);
    }
  }

  // 5. WAITING rooms past expiry → expire + refund
  const expiredWaiting = await prisma.room.findMany({
    where: {
      status: 'WAITING',
      expiresAt: { lte: now },
    },
    include: {
      participants: true,
      game: { select: { title: true } },
    },
  });
  for (const room of expiredWaiting) {
    try {
      await prisma.$transaction(async (tx) => {
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
        await tx.room.update({ where: { id: room.id }, data: { status: 'EXPIRED' } });
      }, { isolationLevel: 'Serializable' });
    } catch (err) {
      console.error(`[Recovery] Failed expiry for room ${room.id}:`, err);
    }
  }
}

export function startRecoveryWorker(): void {
  if (recoveryInterval) return;
  console.log('[Recovery] Worker started (every 60s)');
  recoveryInterval = setInterval(async () => {
    try { await runRecoveryTick(); } catch (err) { console.error('[Recovery] Error:', err); }
  }, RECOVERY_INTERVAL_MS);

  // Run once on start
  runRecoveryTick().catch(console.error);
}

export function stopRecoveryWorker(): void {
  if (recoveryInterval) { clearInterval(recoveryInterval); recoveryInterval = null; }
}
