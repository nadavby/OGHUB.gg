import { Decimal } from '@prisma/client/runtime/library';
import { prisma, redis } from '../main';

interface PrizeDistribution {
  userId: string;
  rank: number;
  amount: Decimal;
}

function calculatePrizeSplit(prizePool: Decimal, playerCount: number): number[] {
  if (playerCount === 0) return [];
  if (playerCount === 1) return [1.0];
  if (playerCount === 2) return [0.65, 0.35];
  return [0.50, 0.30, 0.20];
}

export async function distributeChallengePrizes(challengeId: string): Promise<PrizeDistribution[]> {
  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.prizePool.lte(0)) return [];

  const topEntries = await redis.zrevrange(
    `leaderboard:${challengeId}`, 0, 2, 'WITHSCORES',
  );

  if (topEntries.length < 2) {
    const dbScores = await prisma.score.findMany({
      where: { session: { challengeId }, isValidated: true },
      orderBy: { value: 'desc' },
      take: 3,
      select: { userId: true, value: true },
    });
    if (dbScores.length === 0) return [];
    topEntries.length = 0;
    for (const s of dbScores) {
      topEntries.push(s.userId, s.value.toString());
    }
  }

  const winners: { userId: string; score: number }[] = [];
  for (let i = 0; i < topEntries.length; i += 2) {
    winners.push({ userId: topEntries[i], score: parseInt(topEntries[i + 1], 10) });
  }

  const splits = calculatePrizeSplit(challenge.prizePool, winners.length);
  const distributions: PrizeDistribution[] = [];

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < winners.length && i < splits.length; i++) {
      const amount = challenge.prizePool.mul(new Decimal(splits[i])).toDecimalPlaces(2);
      if (amount.lte(0)) continue;

      const wallet = await tx.wallet.findUnique({ where: { userId: winners[i].userId } });
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
          description: `Rank ${i + 1} prize for ${challenge.title}`,
          referenceId: challengeId,
        },
      });
      distributions.push({ userId: winners[i].userId, rank: i + 1, amount });
    }
  }, { isolationLevel: 'Serializable' });

  console.log(`[Prize Distribution] Challenge ${challengeId}: distributed to ${distributions.length} winners`);
  return distributions;
}
