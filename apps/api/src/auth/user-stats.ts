import { prisma } from '../main';

export async function getUserStats(userId: string) {
  const totalGames = await prisma.gameSession.count({
    where: { userId, status: 'COMPLETED' },
  });

  const roomsPlayed = await prisma.roomParticipant.count({
    where: { userId, room: { status: 'COMPLETED' } },
  });

  const prizePayouts = await prisma.walletTransaction.findMany({
    where: { wallet: { userId }, type: 'PRIZE_PAYOUT' },
    select: { amount: true },
  });

  const totalEarnings = prizePayouts.reduce(
    (sum, tx) => sum + parseFloat(tx.amount.toString()), 0
  );
  const wins = prizePayouts.length;
  const winRate = roomsPlayed > 0 ? Math.round((wins / roomsPlayed) * 100) : 0;

  return { totalGames, roomsPlayed, wins, winRate, totalEarnings: totalEarnings.toFixed(2) };
}
