'use client';

import { useState, useEffect } from 'react';

interface UrgencyBannerProps {
  spotsLeft?: number;
  multiplierExpiry?: number; // seconds
  playersOnline?: number;
}

export default function UrgencyBanner({ spotsLeft = 3, multiplierExpiry, playersOnline = 847 }: UrgencyBannerProps) {
  const [seconds, setSeconds] = useState(multiplierExpiry || 127);
  const [spots, setSpots] = useState(spotsLeft);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds(s => {
        if (s <= 0) return 300; // Reset for demo loop
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Randomly decrease spots for urgency feel
  useEffect(() => {
    const interval = setInterval(() => {
      setSpots(s => Math.max(1, s - (Math.random() > 0.7 ? 1 : 0)));
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {/* Limited spots */}
      <div className="urgency-banner">
        <span className="urgency-dot" />
        <span>🔥 Only <strong style={{ color: 'var(--danger)' }}>{spots}</strong> spots left in this challenge!</span>
      </div>

      {/* Multiplier expiry */}
      <div className="urgency-banner" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
        <span className="multiplier-badge">2x BONUS</span>
        <span>Expires in <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>
          {mins}:{secs.toString().padStart(2, '0')}
        </strong></span>
      </div>

      {/* Active players */}
      <div className="active-players" style={{ justifyContent: 'center' }}>
        <span className="active-dot" />
        <span>{playersOnline.toLocaleString()} players online now</span>
      </div>
    </div>
  );
}
