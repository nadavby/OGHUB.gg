'use client';

interface UrgencyBannerProps {
  spotsLeft?: number;
  playersOnline?: number;
}

export default function UrgencyBanner({ spotsLeft, playersOnline }: UrgencyBannerProps) {
  // Only render if we have real data passed from the parent
  if (!spotsLeft && !playersOnline) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {spotsLeft !== undefined && spotsLeft > 0 && (
        <div className="urgency-banner">
          <span className="urgency-dot" />
          <span><strong>{spotsLeft}</strong> spots remaining in this challenge</span>
        </div>
      )}

      {playersOnline !== undefined && (
        <div className="active-players" style={{ justifyContent: 'center' }}>
          <span className="active-dot" />
          <span>{playersOnline.toLocaleString()} players online</span>
        </div>
      )}
    </div>
  );
}
