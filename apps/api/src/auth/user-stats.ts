import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../main';

export async function getUserStats(userId: string) {
  const [totalGames, roomsPlayed, prizePayouts] = await Promise.all([
    prisma.gameSession.count({
      where: { userId, status: 'COMPLETED' },
    }),
    prisma.roomParticipant.count({
      where: { userId, room: { status: 'COMPLETED' } },
    }),
    prisma.walletTransaction.findMany({
      where: { wallet: { userId }, type: 'PRIZE_PAYOUT' },
      select: { amount: true, referenceId: true },
    }),
  ]);

  const totalEarnings = prizePayouts.reduce(
    (sum, tx) => sum.add(tx.amount),
    new Decimal(0)
  );
  const wins = new Set(prizePayouts.map(p => p.referenceId).filter(Boolean)).size;
  const winRate = roomsPlayed > 0 ? Math.round((wins / roomsPlayed) * 100) : 0;

  return { totalGames, roomsPlayed, wins, winRate, totalEarnings: totalEarnings.toFixed(2) };
}
