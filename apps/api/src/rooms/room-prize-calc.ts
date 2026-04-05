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
