import { prisma } from '../main';
import { distributeChallengePrizes } from './prize-distribution';

const LIFECYCLE_INTERVAL_MS = 60_000;

export async function runLifecycleTick(): Promise<{ activated: number; completed: number }> {
  const now = new Date();

  const activated = await prisma.challenge.updateMany({
    where: { status: 'UPCOMING', startsAt: { lte: now } },
    data: { status: 'ACTIVE' },
  });

  const timeExpired = await prisma.challenge.updateMany({
    where: { status: 'ACTIVE', endsAt: { lte: now, not: null } },
    data: { status: 'COMPLETED' },
  });

  const entryCapped = await prisma.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM "Challenge" c
    WHERE c.status = 'ACTIVE'
      AND c."maxEntries" IS NOT NULL
      AND (SELECT COUNT(*) FROM "GameSession" gs WHERE gs."challengeId" = c.id) >= c."maxEntries"
  `;

  let entryCompleted = 0;
  if (entryCapped.length > 0) {
    const result = await prisma.challenge.updateMany({
      where: { id: { in: entryCapped.map(r => r.id) } },
      data: { status: 'COMPLETED' },
    });
    entryCompleted = result.count;
  }

  const completedIds: string[] = [];
  if (timeExpired.count > 0) {
    const justCompleted = await prisma.challenge.findMany({
      where: {
        status: 'COMPLETED',
        updatedAt: { gte: new Date(now.getTime() - LIFECYCLE_INTERVAL_MS - 5000) },
      },
      select: { id: true },
    });
    completedIds.push(...justCompleted.map(c => c.id));
  }
  if (entryCapped.length > 0) {
    completedIds.push(...entryCapped.map(r => r.id));
  }
  for (const id of completedIds) {
    try {
      await distributeChallengePrizes(id);
    } catch (err) {
      console.error(`[Challenge Lifecycle] Prize distribution failed for ${id}:`, err);
    }
  }

  return { activated: activated.count, completed: timeExpired.count + entryCompleted };
}

let lifecycleTimer: ReturnType<typeof setInterval> | null = null;

export function startChallengeLifecycleWorker(): void {
  if (lifecycleTimer) return;
  console.log('[Challenge Lifecycle] Worker started');

  lifecycleTimer = setInterval(async () => {
    try {
      const result = await runLifecycleTick();
      if (result.activated > 0 || result.completed > 0) {
        console.log(`[Challenge Lifecycle] Activated: ${result.activated}, Completed: ${result.completed}`);
      }
    } catch (err) {
      console.error('[Challenge Lifecycle] Error:', err);
    }
  }, LIFECYCLE_INTERVAL_MS);

  runLifecycleTick().catch(console.error);
}

export function stopChallengeLifecycleWorker(): void {
  if (lifecycleTimer) { clearInterval(lifecycleTimer); lifecycleTimer = null; }
}
