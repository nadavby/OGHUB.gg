'use client';

import { useEffect, useState, useRef } from 'react';

const FAKE_WINNERS = [
  { name: 'xProPlayer', amount: '$125.00', game: 'Stack Tower' },
  { name: 'LuckyShot', amount: '$89.50', game: 'Color Match' },
  { name: 'CashKing22', amount: '$340.00', game: 'Rhythm Dash' },
  { name: 'NoobMaster', amount: '$52.00', game: 'Gravity Flip' },
  { name: 'QueenBee', amount: '$210.00', game: 'Word Blitz' },
  { name: 'DarkHorse', amount: '$95.00', game: 'Sniper Shot' },
  { name: 'Ace777', amount: '$445.00', game: 'Maze Runner' },
  { name: 'RushPro', amount: '$178.00', game: 'Bubble Pop' },
  { name: 'GoldDigger', amount: '$560.00', game: 'Stack Tower' },
  { name: 'PhantomX', amount: '$67.00', game: 'Color Match' },
  { name: 'BlitzKrieg', amount: '$290.00', game: 'Rhythm Dash' },
  { name: 'HighRoller', amount: '$720.00', game: 'Gravity Flip' },
];

export default function LiveWinnersTicker() {
  return (
    <div className="winners-ticker">
      <div className="ticker-track">
        {/* Duplicate for seamless loop */}
        {[...FAKE_WINNERS, ...FAKE_WINNERS].map((w, i) => (
          <div key={i} className="ticker-item">
            <span style={{ color: 'var(--toxic-green)' }}>🏆</span>
            <span className="ticker-name">{w.name}</span>
            <span className="ticker-amount">won {w.amount}</span>
            <span className="ticker-game">in {w.game}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
