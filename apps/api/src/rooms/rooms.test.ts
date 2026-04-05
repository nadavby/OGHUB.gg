import { describe, it, expect } from 'vitest';
import { calculateRoomPrizeSplit } from './room-prize-calc';

describe('Room Prize Distribution', () => {
  describe('calculateRoomPrizeSplit', () => {
    it('1v1: winner takes all', () => {
      expect(calculateRoomPrizeSplit('ONE_V_ONE', 2)).toEqual([1.0]);
    });

    it('Bo3: winner takes all', () => {
      expect(calculateRoomPrizeSplit('BEST_OF_3', 2)).toEqual([1.0]);
    });

    it('FFA 5 with 5 players: 70/30 split', () => {
      expect(calculateRoomPrizeSplit('FFA_5', 5)).toEqual([0.70, 0.30]);
    });

    it('FFA 5 with only 1 player: winner takes all', () => {
      expect(calculateRoomPrizeSplit('FFA_5', 1)).toEqual([1.0]);
    });

    it('FFA 10 with 10 players: 50/30/20 split', () => {
      expect(calculateRoomPrizeSplit('FFA_10', 10)).toEqual([0.50, 0.30, 0.20]);
    });

    it('FFA 20 with 20 players: 50/30/20 split', () => {
      expect(calculateRoomPrizeSplit('FFA_20', 20)).toEqual([0.50, 0.30, 0.20]);
    });

    it('FFA 10 with only 2 players: 70/30 split', () => {
      expect(calculateRoomPrizeSplit('FFA_10', 2)).toEqual([0.70, 0.30]);
    });

    it('splits sum to 1.0 for all formats', () => {
      const cases = [
        ['ONE_V_ONE', 2],
        ['BEST_OF_3', 2],
        ['FFA_5', 5],
        ['FFA_10', 10],
        ['FFA_20', 20],
      ] as const;

      for (const [format, players] of cases) {
        const splits = calculateRoomPrizeSplit(format, players);
        const total = splits.reduce((sum, s) => sum + s, 0);
        expect(total).toBeCloseTo(1.0, 10);
      }
    });
  });
});
