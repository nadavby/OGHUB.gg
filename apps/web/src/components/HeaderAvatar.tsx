'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

export default function HeaderAvatar() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Link href="/login" className="header-avatar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </Link>
    );
  }

  return (
    <Link href="/profile" className="header-avatar header-avatar-active">
      {(user.displayName || user.username)[0].toUpperCase()}
    </Link>
  );
}
