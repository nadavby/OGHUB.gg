import { redis } from '../main';

// ─── Keys ────────────────────────────────────────────────────

export const roomStateKey = (roomId: string) => `room:${roomId}:state`;
export const roomReadyKey = (roomId: string) => `room:${roomId}:ready`;
export const roomEventsChannel = (roomId: string) => `room:${roomId}:events`;
export const ROOM_TIMERS_KEY = 'room:timers';

// ─── Room State (Hash) ──────────────────────────────────────

export async function setRoomState(roomId: string, fields: Record<string, string>): Promise<void> {
  const key = roomStateKey(roomId);
  await redis.hmset(key, fields);
  await redis.expire(key, 7200); // 2 hour TTL
}

export async function getRoomState(roomId: string): Promise<Record<string, string>> {
  return redis.hgetall(roomStateKey(roomId));
}

export async function deleteRoomState(roomId: string): Promise<void> {
  await redis.del(roomStateKey(roomId), roomReadyKey(roomId));
}

// ─── Pub/Sub ────────────────────────────────────────────────

export async function publishRoomEvent(roomId: string, event: Record<string, any>): Promise<void> {
  await redis.publish(roomEventsChannel(roomId), JSON.stringify(event));
}

// ─── Ready Set ──────────────────────────────────────────────

export async function addReady(roomId: string, userId: string): Promise<number> {
  await redis.sadd(roomReadyKey(roomId), userId);
  return redis.scard(roomReadyKey(roomId));
}

export async function getReadyPlayers(roomId: string): Promise<string[]> {
  return redis.smembers(roomReadyKey(roomId));
}

export async function isPlayerReady(roomId: string, userId: string): Promise<boolean> {
  return (await redis.sismember(roomReadyKey(roomId), userId)) === 1;
}

// ─── Timers (Sorted Set) ───────────────────────────────────

export async function addTimer(timerKey: string, expiresAt: number): Promise<void> {
  await redis.zadd(ROOM_TIMERS_KEY, expiresAt, timerKey);
}

export async function removeTimer(timerKey: string): Promise<void> {
  await redis.zrem(ROOM_TIMERS_KEY, timerKey);
}

export async function getExpiredTimers(): Promise<string[]> {
  const now = Date.now();
  return redis.zrangebyscore(ROOM_TIMERS_KEY, '-inf', String(now));
}

export async function removeExpiredTimers(timerKeys: string[]): Promise<void> {
  if (timerKeys.length === 0) return;
  await redis.zrem(ROOM_TIMERS_KEY, ...timerKeys);
}

// ─── Cleanup ────────────────────────────────────────────────

export async function cleanupRoom(roomId: string): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.del(roomStateKey(roomId));
  pipeline.del(roomReadyKey(roomId));
  // Remove any timers for this room
  const timerPrefixes = ['ready_check', 'launch', 'connect_timeout', 'session_timeout'];
  for (const prefix of timerPrefixes) {
    pipeline.zrem(ROOM_TIMERS_KEY, `room:${roomId}:${prefix}`);
  }
  await pipeline.exec();
}
