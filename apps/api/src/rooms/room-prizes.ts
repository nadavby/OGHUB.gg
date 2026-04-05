import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../main';

interface RoomPrizeDistribution {
  userId: string;
  rank: number;
  amount: Decimal;
}

export function calculateRoomPrizeSplit(format: string, playerCount: number): number[] {
  // 1v1 and Bo3: winner takes all
  if (format === 'ONE_V_ONE' || format === 'BEST_OF_3') {
    return [1.0];
  }
  // FFA 5: 1st 70%, 2nd 30%
  if (format === 'FFA_5') {
    return playerCount >= 2 ? [0.70, 0.30] : [1.0];
  }
  // FFA 10 and FFA 20: 1st 50%, 2nd 30%, 3rd 20%
  if (playerCount >= 3) return [0.50, 0.30, 0.20];
  if (playerCount === 2) return [0.70, 0.30];
  return [1.0];
}

export async function distributeRoomPrizes(roomId: string): Promise<RoomPrizeDistribution[]> {
  // Idempotency check
  const existing = await prisma.walletTransaction.findFirst({
    where: { type: 'PRIZE_PAYOUT', referenceId: roomId },
  });
  if (existing) return [];

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      participants: true,
      game: { select: { title: true } },
    },
  });

  if (!room || room.prizePool.lte(0)) return [];

  // Get scores for this room's participants from their sessions
  const participantSessions = room.participants
    .filter(p => p.sessionId)
    .map(p => p.sessionId!);

  const roomScores = await prisma.score.findMany({
    where: {
      sessionId: { in: participantSessions },
      isValidated: true,
    },
    orderBy: { value: 'desc' },
  });

  if (roomScores.length === 0) return [];

  const splits = calculateRoomPrizeSplit(room.format, roomScores.length);
  const distributions: RoomPrizeDistribution[] = [];

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < roomScores.length && i < splits.length; i++) {
      const amount = room.prizePool.mul(new Decimal(splits[i])).toDecimalPlaces(2);
      if (amount.lte(0)) continue;

      const wallet = await tx.wallet.findUnique({ where: { userId: roomScores[i].userId } });
      if (!wallet) continue;

      const newBalance = wallet.balance.add(amount);
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'PRIZE_PAYOUT',
          amount,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          description: `Rank ${i + 1} prize: ${room.game.title} room`,
          referenceId: roomId,
        },
      });
      distributions.push({ userId: roomScores[i].userId, rank: i + 1, amount });
    }
  }, { isolationLevel: 'Serializable' });

  return distributions;
}
