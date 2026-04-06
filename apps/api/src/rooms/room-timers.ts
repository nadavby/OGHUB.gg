import { prisma } from '../main';
import {
  getExpiredTimers,
  removeExpiredTimers,
  publishRoomEvent,
} from './room-redis';
import {
  transitionToCountdown,
  transitionToInProgress,
  transitionToSettling,
  cancelRoom,
  checkAllSessionsTerminal,
} from './room-state-machine';
import { settleRoom } from './room-settlement';

const TIMER_POLL_MS = 1000; // Every second
let timerInterval: ReturnType<typeof setInterval> | null = null;

export async function processExpiredTimers(): Promise<void> {
  const expired = await getExpiredTimers();
  if (expired.length === 0) return;

  await removeExpiredTimers(expired);

  for (const timerKey of expired) {
    try {
      await handleTimer(timerKey);
    } catch (err) {
      console.error(`[Room Timers] Error handling timer ${timerKey}:`, err);
    }
  }
}

async function handleTimer(timerKey: string): Promise<void> {
  // Parse timer key: "room:{roomId}:{type}"
  const parts = timerKey.split(':');
  if (parts.length < 3 || parts[0] !== 'room') return;
  const roomId = parts[1];
  const timerType = parts.slice(2).join(':');

  switch (timerType) {
    case 'ready_check':
      await handleReadyCheckTimeout(roomId);
      break;

    case 'launch':
      await handleLaunchCountdown(roomId);
      break;

    case 'connect_timeout':
      await handleConnectTimeout(roomId);
      break;

    case 'session_timeout':
      await handleSessionTimeout(roomId);
      break;
  }
}

async function handleReadyCheckTimeout(roomId: string): Promise<void> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.status !== 'READY_CHECK') return;

  console.log(`[Room Timers] Ready check timeout for room ${roomId}`);
  await cancelRoom(roomId, 'Ready check timeout');
}

async function handleLaunchCountdown(roomId: string): Promise<void> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.status !== 'COUNTDOWN') return;

  console.log(`[Room Timers] Launching game for room ${roomId}`);
  await transitionToInProgress(roomId);
}

async function handleConnectTimeout(roomId: string): Promise<void> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { participants: true },
  });
  if (!room || room.status !== 'IN_PROGRESS') return;

  // Expire sessions that are still in CREATED state (never connected)
  const sessionIds = room.participants
    .filter(p => p.sessionId)
    .map(p => p.sessionId!);

  const expired = await prisma.gameSession.updateMany({
    where: {
      id: { in: sessionIds },
      status: 'CREATED',
    },
    data: { status: 'EXPIRED' },
  });

  if (expired.count > 0) {
    console.log(`[Room Timers] Connect timeout: expired ${expired.count} sessions in room ${roomId}`);

    // Notify about disconnected players
    const expiredSessions = await prisma.gameSession.findMany({
      where: { id: { in: sessionIds }, status: 'EXPIRED' },
    });
    for (const s of expiredSessions) {
      await publishRoomEvent(roomId, { type: 'player_disconnected', userId: s.userId });
    }
  }

  // Check if all sessions are now terminal
  if (await checkAllSessionsTerminal(roomId)) {
    await transitionToSettling(roomId);
    await settleRoom(roomId);
  }
}

async function handleSessionTimeout(roomId: string): Promise<void> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { participants: true },
  });
  if (!room || room.status !== 'IN_PROGRESS') return;

  // Expire all non-terminal sessions
  const sessionIds = room.participants
    .filter(p => p.sessionId)
    .map(p => p.sessionId!);

  await prisma.gameSession.updateMany({
    where: {
      id: { in: sessionIds },
      status: { notIn: ['COMPLETED', 'REJECTED', 'EXPIRED'] },
    },
    data: { status: 'EXPIRED' },
  });

  console.log(`[Room Timers] Session timeout for room ${roomId} — settling`);
  await transitionToSettling(roomId);
  await settleRoom(roomId);
}

// ─── Worker Lifecycle ───────────────────────────────────────

export function startTimerWorker(): void {
  if (timerInterval) return;
  console.log('[Room Timers] Worker started (polling every 1s)');

  timerInterval = setInterval(async () => {
    try {
      await processExpiredTimers();
    } catch (err) {
      console.error('[Room Timers] Poll error:', err);
    }
  }, TIMER_POLL_MS);
}

export function stopTimerWorker(): void {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}
