// Room lifecycle is now managed by dedicated workers
export { startTimerWorker as startRoomTimerWorker, stopTimerWorker as stopRoomTimerWorker } from './room-timers';
export { startRecoveryWorker as startRoomRecoveryWorker, stopRecoveryWorker as stopRoomRecoveryWorker } from './room-recovery';

// Legacy export for backward compatibility with main.ts
export function startRoomLifecycleWorker(): void {
  const { startTimerWorker } = require('./room-timers');
  const { startRecoveryWorker } = require('./room-recovery');
  startTimerWorker();
  startRecoveryWorker();
}

export function stopRoomLifecycleWorker(): void {
  const { stopTimerWorker } = require('./room-timers');
  const { stopRecoveryWorker } = require('./room-recovery');
  stopTimerWorker();
  stopRecoveryWorker();
}
