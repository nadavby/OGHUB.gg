# Platform Visual Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the OGHub web platform from Neon-Noir to a clean, dark, premium competitive identity with restructured navigation and redesigned pages.

**Architecture:** Full CSS rewrite with new design tokens, component rewrites for BottomNav/GameCard/WalletBadge, page redesigns for Home/GameDetail/Wallet/Profile/Auth, deletion of off-brand components.

**Tech Stack:** Next.js 14, React 18, TypeScript, CSS Modules, Framer Motion

---

## Task 1: Design Tokens & Global Reset

**Files to modify:**
- `apps/web/src/styles/globals.css` (lines 1-200 replaced entirely)

### Steps

- [ ] **Step 1.1:** Replace lines 1-200 of `apps/web/src/styles/globals.css` with the new design tokens, reset, and foundation styles. The full replacement content is below. Everything from line 201 onward stays for now (will be cleaned up in later tasks).

**Full replacement for lines 1-200 of `apps/web/src/styles/globals.css`:**

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&family=Outfit:wght@400;500;600;700;800;900&display=swap');

/* ===================================================================
   OGHUB — CLEAN DARK PREMIUM DESIGN SYSTEM
   "Premium skill-based competition. Put your money where your mouth is."
   
   Philosophy: Clean, confident, dark. Fintech trust meets esports energy.
   No manufactured urgency. Real activity, real stakes, real results.
   =================================================================== */

/* --- Root Design Tokens ------------------------------------------ */

:root {
  /* Backgrounds */
  --bg: #0D0D0D;
  --surface: #161616;
  --surface-elevated: #1E1E1E;
  --surface-active: #252525;

  /* Borders */
  --border: rgba(255,255,255,0.08);
  --border-hover: rgba(255,255,255,0.15);

  /* Primary (Orange — Action) */
  --primary: #F97316;
  --primary-hover: #FB923C;
  --primary-dim: rgba(249,115,22,0.15);

  /* Semantic Colors */
  --win: #10B981;
  --money: #F59E0B;
  --danger: #EF4444;
  --trust: #3B82F6;

  /* Text Hierarchy */
  --text-primary: #EBEBEB;
  --text-secondary: #8A8A8A;
  --text-muted: #505050;

  /* Typography */
  --font-display: 'Outfit', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-full: 9999px;

  /* Shadows (clean, no neon glow) */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  --shadow-lg: 0 8px 30px rgba(0,0,0,0.5);

  /* Transitions */
  --transition-fast: 0.15s ease;
  --transition-normal: 0.2s ease;

  /* Z-indexes */
  --z-base: 1;
  --z-sticky: 10;
  --z-overlay: 100;
  --z-modal: 200;
  --z-toast: 300;
}

/* --- Reset & Foundation ------------------------------------------ */

*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  scroll-behavior: smooth;
}

body {
  font-family: var(--font-body);
  background: var(--bg);
  color: var(--text-primary);
  min-height: 100vh;
  min-height: 100dvh;
  overflow-x: hidden;
  line-height: 1.5;
}

/* No ambient backgrounds, no noise textures */

a {
  color: var(--primary);
  text-decoration: none;
  transition: var(--transition-fast);
}

a:hover {
  color: var(--primary-hover);
}

img {
  max-width: 100%;
  height: auto;
}

button {
  font-family: var(--font-body);
  cursor: pointer;
  border: none;
  background: none;
  color: inherit;
}

input, select, textarea {
  font-family: var(--font-body);
}

/* Hide scrollbars but keep scrolling */
::-webkit-scrollbar { width: 0; height: 0; }

::selection {
  background: rgba(249, 115, 22, 0.3);
  color: var(--text-primary);
}
```

- [ ] **Step 1.2:** Verify the file saved correctly and that lines 201+ (starting with `/* --- App Shell ---`) are still intact.

- [ ] **Step 1.3:** Commit: `refactor(web): replace design tokens with clean dark premium system`

---

## Task 2: App Shell, Header & Navigation

**Files to modify:**
- `apps/web/src/app/layout.tsx`
- `apps/web/src/components/BottomNav.tsx`
- `apps/web/src/components/WalletBadge.tsx`
- `apps/web/src/styles/globals.css` (lines 207-372: app shell, header, wallet badge, bottom nav sections)

### Steps

- [ ] **Step 2.1:** Replace `apps/web/src/app/layout.tsx` with the following content:

```tsx
import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import { AuthProvider } from '@/hooks/useAuth';
import BottomNav from '@/components/BottomNav';
import WalletBadge from '@/components/WalletBadge';
import ErrorBoundary from '@/components/ErrorBoundary';

export const metadata: Metadata = {
  title: 'OGHUB — Skill-Based Competition Platform',
  description: 'Create rooms, set stakes, compete for real money. Premium skill-based competition.',
  keywords: 'gaming, competitive, skill-based, esports, mobile games, competition',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0D0D0D',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <div className="app-shell">
            <ErrorBoundary section="header">
              <header className="app-header">
                <div className="app-header-row">
                  <span className="app-logo">
                    <span className="app-logo-o">O</span>GHUB
                  </span>
                  <div className="header-right">
                    <WalletBadge />
                    <div className="header-avatar">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                  </div>
                </div>
              </header>
            </ErrorBoundary>
            <ErrorBoundary section="main content">
              <main>{children}</main>
            </ErrorBoundary>
            <ErrorBoundary section="navigation">
              <BottomNav />
            </ErrorBoundary>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2.2:** Replace `apps/web/src/components/BottomNav.tsx` with the following content:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  {
    href: '/',
    label: 'Home',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: '/events',
    label: 'Events',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7" />
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
      </svg>
    ),
  },
  {
    href: '/wallet',
    label: 'Wallet',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </svg>
    ),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="bottom-nav">
      <div className="nav-items">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2.3:** Replace `apps/web/src/components/WalletBadge.tsx` with the following content:

```tsx
'use client';

import Link from 'next/link';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/hooks/useAuth';

export default function WalletBadge() {
  const { user } = useAuth();
  const { wallet } = useWallet();

  if (!user) {
    return (
      <Link href="/login" className="wallet-badge">
        Sign In
      </Link>
    );
  }

  return (
    <Link href="/wallet" className="wallet-badge">
      <span className="wallet-amount">${wallet ? parseFloat(wallet.balance).toFixed(2) : '0.00'}</span>
    </Link>
  );
}
```

- [ ] **Step 2.4:** Replace the App Shell, Header, Wallet Badge, and Bottom Navigation CSS sections in `apps/web/src/styles/globals.css` (lines 207-372). Remove the old content from `/* --- App Shell ---` through the end of the bottom nav section and replace with:

```css
/* --- App Shell --------------------------------------------------- */

.app-shell {
  position: relative;
  z-index: var(--z-base);
  min-height: 100vh;
  min-height: 100dvh;
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

.app-shell > main {
  flex: 1;
  padding-bottom: 80px;
  padding-top: 60px;
}

/* --- Header ------------------------------------------------------ */

.app-header {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  z-index: var(--z-sticky);
  background: rgba(13, 13, 13, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
}

.app-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px var(--space-md);
  height: 56px;
}

.app-logo {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--text-primary);
}

.app-logo-o {
  position: relative;
}

.app-logo-o::after {
  content: '';
  position: absolute;
  top: 2px;
  right: -1px;
  width: 5px;
  height: 5px;
  background: var(--primary);
  border-radius: 50%;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.header-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: var(--transition-fast);
}

.header-avatar:hover {
  border-color: var(--border-hover);
  color: var(--text-secondary);
}

/* --- Wallet Badge (Header) --------------------------------------- */

.wallet-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--money);
  text-decoration: none;
  transition: var(--transition-fast);
}

.wallet-badge:hover {
  border-color: var(--border-hover);
  color: var(--money);
}

.wallet-amount {
  font-variant-numeric: tabular-nums;
}

/* --- Bottom Navigation ------------------------------------------- */

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  z-index: var(--z-sticky);
  background: rgba(13, 13, 13, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid var(--border);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.nav-items {
  display: flex;
  justify-content: space-around;
  padding: 8px 0 6px;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--text-muted);
  text-decoration: none;
  padding: 4px 12px;
  transition: var(--transition-fast);
  position: relative;
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
}

.nav-label {
  font-family: var(--font-body);
}

.nav-item:hover {
  color: var(--text-secondary);
}

.nav-item.active {
  color: var(--primary);
}

.nav-item.active::before {
  content: '';
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  width: 24px;
  height: 2px;
  background: var(--primary);
  border-radius: var(--radius-full);
}
```

- [ ] **Step 2.5:** Commit: `refactor(web): redesign header, bottom nav with SVG icons and orange active state`

---

## Task 3: Delete Off-Brand Components

**Files to delete:**
- `apps/web/src/components/DoubleOrNothing.tsx`
- `apps/web/src/components/UrgencyBanner.tsx`
- `apps/web/src/components/LiveWinnersTicker.tsx`
- `apps/web/src/components/RewardAnimation.tsx`

**Files to modify:**
- `apps/web/src/app/games/[id]/page.tsx` (remove imports and usage — full rewrite in Task 6)

### Steps

- [ ] **Step 3.1:** Delete the following files:
  - `apps/web/src/components/DoubleOrNothing.tsx`
  - `apps/web/src/components/UrgencyBanner.tsx`
  - `apps/web/src/components/LiveWinnersTicker.tsx`
  - `apps/web/src/components/RewardAnimation.tsx`

- [ ] **Step 3.2:** Create a temporary minimal fix for `apps/web/src/app/games/[id]/page.tsx` so it compiles without the deleted imports. Replace the entire file with a temporary placeholder (the full redesign happens in Task 6):

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

interface GameDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  difficulty: number;
  tags: string[];
  challenges: any[];
}

const DEMO_GAME: GameDetail = {
  id: '1', slug: 'neon-runner', title: 'Neon Runner',
  description: 'Navigate the deterministically generated cyber-tunnel. Precision makes perfect.',
  difficulty: 3, tags: ['arcade', 'skill'],
  challenges: [],
};

export default function GameDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const [game, setGame] = useState<GameDetail>(DEMO_GAME);

  useEffect(() => {
    api(`/api/games/${params.id}`)
      .then((data: GameDetail) => setGame(data))
      .catch(() => {});
  }, [params.id]);

  return (
    <div style={{ padding: 16 }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)', marginBottom: 8 }}>
          {game.title}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
          {game.description}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Full redesign coming in Task 6.
        </p>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 3.3:** Remove the related CSS from `apps/web/src/styles/globals.css`. Delete the following sections entirely:
  - `/* --- Reward Animation Overlay ---` section (lines ~1160-1210)
  - `/* --- Near-Miss Toast ---` section (lines ~1212-1236)
  - `/* GAMBLING PSYCHOLOGY COMPONENTS` comment block (line ~1260)
  - `/* --- Live Winners Ticker ---` section (lines ~1264-1332)
  - `/* --- Urgency Banner ---` section (lines ~1334-1366)
  - `/* --- VIP / Whale Status ---` section (lines ~1368-1408)
  - `/* --- Bet Slider ---` section (lines ~1410-1500)
  - `/* --- Double or Nothing Modal ---` section (lines ~1502-1616)
  - `/* --- Multiplier Badge ---` section (lines ~1626-1646)
  - `/* --- Active Players Indicator ---` section (lines ~1648-1670)
  - `/* --- Win Streak Flame ---` section (lines ~1672-1695)

- [ ] **Step 3.4:** Commit: `chore(web): delete off-brand gambling components and related CSS`

---

## Task 4: Redesign GameCard Component

**Files to modify:**
- `apps/web/src/components/GameCard.tsx`
- `apps/web/src/components/GameCard.module.css`

### Steps

- [ ] **Step 4.1:** Replace `apps/web/src/components/GameCard.tsx` with the following content:

```tsx
'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import styles from './GameCard.module.css';

interface GameCardProps {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  tags: string[];
  activeRooms?: number;
  activePlayers?: number;
}

export default function GameCard({ slug, title, description, thumbnailUrl, activeRooms = 0, activePlayers = 0 }: GameCardProps) {
  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <Link href={`/games/${slug}`}>
        <div className={styles.thumbnail}>
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt={title} />
          ) : (
            <div className={styles.thumbnailPlaceholder}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M6 12h4M8 10v4" />
                <circle cx="17" cy="10" r="1" />
                <circle cx="15" cy="12" r="1" />
              </svg>
            </div>
          )}
        </div>

        <div className={styles.body}>
          <h3 className={styles.title}>{title}</h3>

          {description && (
            <p className={styles.description}>
              {description.length > 60 ? description.slice(0, 60) + '...' : description}
            </p>
          )}

          <div className={styles.footer}>
            {activeRooms > 0 && (
              <span className={styles.footerItem}>
                <span className={styles.dot} />
                {activeRooms} room{activeRooms !== 1 ? 's' : ''}
              </span>
            )}
            {activePlayers > 0 && (
              <span className={styles.footerItem}>
                {activePlayers} player{activePlayers !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
```

- [ ] **Step 4.2:** Replace `apps/web/src/components/GameCard.module.css` with the following content:

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color var(--transition-fast), transform var(--transition-fast);
}

.card:hover {
  border-color: var(--border-hover);
  transform: translateY(-1px);
}

.card a {
  text-decoration: none;
  color: inherit;
  display: block;
}

.thumbnail {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--surface-active);
}

.thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumbnailPlaceholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-elevated);
}

.body {
  padding: var(--space-md);
}

.title {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  letter-spacing: -0.01em;
}

.description {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.4;
  margin-bottom: var(--space-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.footer {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  font-size: 0.75rem;
  color: var(--text-muted);
}

.footerItem {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
}
```

- [ ] **Step 4.3:** Commit: `refactor(web): redesign GameCard with clean minimal style`

---

## Task 5: Redesign Home Page

**Files to modify:**
- `apps/web/src/app/page.tsx`
- `apps/web/src/styles/globals.css` (game feed, featured section, tags CSS)

### Steps

- [ ] **Step 5.1:** Replace `apps/web/src/app/page.tsx` with the following content:

```tsx
'use client';

import { useState, useEffect } from 'react';
import GameCard from '@/components/GameCard';
import { api } from '@/lib/api';

interface Game {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  difficulty: number;
  tags: string[];
  isFeatured: boolean;
  activeChallenges: number;
  topScore: number | null;
}

export default function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Game[]>('/api/games')
      .then((data) => {
        setGames(data && data.length > 0 ? data : []);
      })
      .catch((err) => {
        setError('Failed to load games. Please try again later.');
        console.error('Games fetch error:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredGames = activeTag
    ? games.filter(g => g.tags.includes(activeTag))
    : games;

  const allTags = [...new Set(games.flatMap(g => g.tags))];

  return (
    <div className="home-page">
      {loading && (
        <div className="empty-state">
          <p>Loading games...</p>
        </div>
      )}

      {error && (
        <div className="empty-state">
          <p>{error}</p>
          <button
            className="tag-btn tag-btn-active"
            style={{ marginTop: 12 }}
            onClick={() => {
              setError(null);
              setLoading(true);
              api<Game[]>('/api/games')
                .then((data) => setGames(data && data.length > 0 ? data : []))
                .catch((err) => {
                  setError('Failed to load games. Please try again later.');
                  console.error('Games fetch error:', err);
                })
                .finally(() => setLoading(false));
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (<>
        {/* Open Rooms Placeholder */}
        <section className="home-section">
          <div className="section-header">
            <h2 className="section-title">Open Rooms</h2>
          </div>
          <div className="empty-state-inline">
            <p>No open rooms right now</p>
          </div>
        </section>

        {/* Games Section */}
        <section className="home-section">
          <div className="section-header">
            <h2 className="section-title">Games</h2>
          </div>

          {/* Tag Filter */}
          <div className="tag-filter">
            <button
              className={`tag-btn ${!activeTag ? 'tag-btn-active' : ''}`}
              onClick={() => setActiveTag(null)}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                className={`tag-btn ${activeTag === tag ? 'tag-btn-active' : ''}`}
                onClick={() => setActiveTag(tag)}
              >
                {tag.charAt(0).toUpperCase() + tag.slice(1)}
              </button>
            ))}
          </div>

          {/* Games Grid */}
          <div className="games-grid">
            {filteredGames.map((game) => (
              <GameCard
                key={game.id}
                id={game.id}
                slug={game.slug}
                title={game.title}
                description={game.description}
                thumbnailUrl={game.thumbnailUrl}
                tags={game.tags}
                activeRooms={game.activeChallenges}
                activePlayers={0}
              />
            ))}
          </div>

          {filteredGames.length === 0 && (
            <div className="empty-state">
              <p>No games found</p>
            </div>
          )}
        </section>
      </>)}
    </div>
  );
}
```

- [ ] **Step 5.2:** Replace the Game Feed, Featured Section, Section Titles, and Tags CSS in `apps/web/src/styles/globals.css`. Remove the old `.game-feed`, `.featured-section`, `.section-title`, `.page-title`, and `.tag` blocks and replace with:

```css
/* --- Page Layout ------------------------------------------------- */

.home-page {
  padding: var(--space-md);
}

.home-section {
  margin-bottom: var(--space-xl);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.section-title {
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.section-link {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  transition: var(--transition-fast);
}

.section-link:hover {
  color: var(--primary);
}

.page-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: var(--space-lg);
}

/* --- Tag Filter -------------------------------------------------- */

.tag-filter {
  display: flex;
  gap: var(--space-sm);
  overflow-x: auto;
  padding-bottom: var(--space-md);
  scrollbar-width: none;
}

.tag-filter::-webkit-scrollbar {
  display: none;
}

.tag-btn {
  padding: 6px 14px;
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: var(--transition-fast);
}

.tag-btn:hover {
  border-color: var(--border-hover);
  color: var(--text-primary);
}

.tag-btn-active {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
}

.tag-btn-active:hover {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
  color: white;
}

/* --- Games Grid -------------------------------------------------- */

.games-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

/* --- Empty States ------------------------------------------------ */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xl);
  text-align: center;
}

.empty-state p {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.empty-state-inline {
  padding: var(--space-lg) var(--space-md);
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.empty-state-inline p {
  color: var(--text-muted);
  font-size: 0.8125rem;
}
```

- [ ] **Step 5.3:** Commit: `refactor(web): redesign home page with tag filter and games grid`

---

## Task 6: Redesign Game Detail Page

**Files to modify:**
- `apps/web/src/app/games/[id]/page.tsx`

### Steps

- [ ] **Step 6.1:** Replace `apps/web/src/app/games/[id]/page.tsx` with the following content:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { api, getStoredToken } from '@/lib/api';

interface Room {
  id: string;
  creator: string;
  format: string;
  entryFee: string;
  prizePool: string;
  currentPlayers: number;
  maxPlayers: number;
  status: string;
}

interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
}

interface GameDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  tags: string[];
  challenges: any[];
}

const DEMO_GAME: GameDetail = {
  id: '1', slug: 'neon-runner', title: 'Neon Runner',
  description: 'Navigate the deterministically generated cyber-tunnel. Precision makes perfect - slide under, jump over, and combo your skill dodges to climb the leaderboard.',
  tags: ['arcade', 'skill'],
  challenges: [],
};

const MOCK_ROOMS: Room[] = [
  { id: 'r1', creator: 'xProPlayer', format: '1v1', entryFee: '5.00', prizePool: '9.50', currentPlayers: 1, maxPlayers: 2, status: 'WAITING' },
  { id: 'r2', creator: 'GameMaster99', format: 'FFA 10', entryFee: '2.00', prizePool: '19.00', currentPlayers: 7, maxPlayers: 10, status: 'WAITING' },
  { id: 'r3', creator: 'SkillKing', format: '1v1 Bo3', entryFee: '10.00', prizePool: '19.00', currentPlayers: 1, maxPlayers: 2, status: 'WAITING' },
];

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, username: 'xProPlayer', score: 15420 },
  { rank: 2, username: 'GameMaster99', score: 14200 },
  { rank: 3, username: 'SkillKing', score: 13800 },
  { rank: 4, username: 'NoobSlayer', score: 12500 },
  { rank: 5, username: 'ProGamer42', score: 11900 },
];

export default function GameDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [game, setGame] = useState<GameDetail>(DEMO_GAME);

  useEffect(() => {
    api(`/api/games/${params.id}`)
      .then((data: GameDetail) => setGame(data))
      .catch(() => {});
  }, [params.id]);

  return (
    <div className="game-detail">
      {/* Banner */}
      <motion.div
        className="game-banner"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="game-banner-image">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M6 12h4M8 10v4" />
            <circle cx="17" cy="10" r="1" />
            <circle cx="15" cy="12" r="1" />
          </svg>
        </div>
        <h1 className="game-banner-title">{game.title}</h1>
      </motion.div>

      <div className="game-detail-content">
        {/* Description */}
        <p className="game-description">{game.description}</p>

        {/* Tags */}
        <div className="game-tags">
          {game.tags.map(tag => (
            <span key={tag} className="game-tag">{tag}</span>
          ))}
        </div>

        {/* Open Rooms */}
        <section className="game-section">
          <div className="section-header">
            <h2 className="section-title">Open Rooms</h2>
          </div>

          <div className="rooms-list">
            {MOCK_ROOMS.map((room, i) => (
              <motion.div
                key={room.id}
                className="room-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <div className="room-card-top">
                  <div className="room-creator">
                    <div className="room-avatar">{room.creator[0]}</div>
                    <span className="room-username">@{room.creator}</span>
                  </div>
                  <span className="room-format">{room.format}</span>
                </div>

                <div className="room-card-bottom">
                  <div className="room-money">
                    <span className="room-fee">${room.entryFee}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)' }}>
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                    <span className="room-prize">${room.prizePool}</span>
                  </div>
                  <div className="room-spots">
                    <div className="room-spots-bar">
                      <div className="room-spots-fill" style={{ width: `${(room.currentPlayers / room.maxPlayers) * 100}%` }} />
                    </div>
                    <span className="room-spots-text">{room.currentPlayers}/{room.maxPlayers}</span>
                  </div>
                </div>

                <button className="room-join-btn">Join</button>
              </motion.div>
            ))}
          </div>

          {MOCK_ROOMS.length === 0 && (
            <div className="empty-state-inline">
              <p>No open rooms yet</p>
            </div>
          )}
        </section>

        {/* Create Room Button */}
        <button className="create-room-btn">
          Create Room
        </button>

        {/* Leaderboard Preview */}
        <section className="game-section">
          <div className="section-header">
            <h2 className="section-title">All-Time Top Players</h2>
            <span className="section-link">See All</span>
          </div>

          <div className="leaderboard-list">
            {MOCK_LEADERBOARD.map((entry, i) => (
              <motion.div
                key={entry.rank}
                className="leaderboard-row"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.04 }}
              >
                <span className={`lb-rank ${entry.rank === 1 ? 'lb-rank-first' : ''}`}>
                  #{entry.rank}
                </span>
                <div className="lb-avatar">{entry.username[0]}</div>
                <span className="lb-name">{entry.username}</span>
                <span className="lb-score">{entry.score.toLocaleString()}</span>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Game Stats Footer */}
        <div className="game-stats-footer">
          1,240 games played  &middot;  $12,450 paid out  &middot;  89 active players
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6.2:** Add the Game Detail CSS to `apps/web/src/styles/globals.css`. Append after the games grid section:

```css
/* --- Game Detail Page -------------------------------------------- */

.game-detail {
  /* no padding — banner is full-width */
}

.game-banner {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.game-banner-image {
  display: flex;
  align-items: center;
  justify-content: center;
}

.game-banner-title {
  position: absolute;
  bottom: var(--space-md);
  left: var(--space-md);
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  text-shadow: 0 2px 8px rgba(0,0,0,0.6);
}

.game-detail-content {
  padding: var(--space-md);
}

.game-description {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: var(--space-md);
}

.game-tags {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.game-tag {
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: capitalize;
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  color: var(--text-secondary);
}

.game-section {
  margin-bottom: var(--space-lg);
}

/* --- Room Cards -------------------------------------------------- */

.rooms-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.room-card {
  padding: var(--space-md);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: border-color var(--transition-fast);
}

.room-card:hover {
  border-color: var(--border-hover);
}

.room-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-sm);
}

.room-creator {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.room-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.room-username {
  font-size: 0.875rem;
  color: var(--text-primary);
}

.room-format {
  padding: 3px 10px;
  font-size: 0.6875rem;
  font-weight: 600;
  background: var(--surface-elevated);
  border-radius: var(--radius-full);
  color: var(--text-secondary);
}

.room-card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-sm);
}

.room-money {
  display: flex;
  align-items: center;
  gap: 6px;
}

.room-fee {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--money);
}

.room-prize {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-primary);
}

.room-spots {
  display: flex;
  align-items: center;
  gap: 6px;
}

.room-spots-bar {
  width: 48px;
  height: 4px;
  background: var(--surface-active);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.room-spots-fill {
  height: 100%;
  background: var(--primary);
  border-radius: var(--radius-full);
  transition: width var(--transition-normal);
}

.room-spots-text {
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--text-muted);
}

.room-join-btn {
  width: 100%;
  padding: 10px;
  background: var(--primary);
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.875rem;
  color: white;
  transition: background var(--transition-fast);
}

.room-join-btn:hover {
  background: var(--primary-hover);
}

/* --- Create Room Button ------------------------------------------ */

.create-room-btn {
  width: 100%;
  padding: 14px;
  background: var(--primary);
  border-radius: var(--radius-md);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.9375rem;
  color: white;
  margin-bottom: var(--space-lg);
  transition: background var(--transition-fast);
}

.create-room-btn:hover {
  background: var(--primary-hover);
}

/* --- Leaderboard ------------------------------------------------- */

.leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.leaderboard-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: border-color var(--transition-fast);
}

.leaderboard-row:hover {
  border-color: var(--border-hover);
}

.lb-rank {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.8125rem;
  min-width: 32px;
  color: var(--text-muted);
}

.lb-rank-first {
  color: var(--primary);
}

.lb-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.lb-name {
  flex: 1;
  font-weight: 600;
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lb-score {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

/* --- Game Stats Footer ------------------------------------------- */

.game-stats-footer {
  padding: var(--space-md) 0;
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
  margin-top: var(--space-md);
}
```

- [ ] **Step 6.3:** Commit: `refactor(web): redesign game detail page with rooms, leaderboard, clean layout`

---

## Task 7: Redesign Wallet Page

**Files to modify:**
- `apps/web/src/app/wallet/page.tsx`
- `apps/web/src/styles/globals.css` (wallet section CSS)

### Steps

- [ ] **Step 7.1:** Replace `apps/web/src/app/wallet/page.tsx` with the following content:

```tsx
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import Link from 'next/link';

export default function WalletPage() {
  const { user } = useAuth();
  const { wallet, deposit, loading } = useWallet();
  const [depositAmount, setDepositAmount] = useState('');
  const [depositing, setDepositing] = useState(false);

  if (!user) {
    return (
      <div className="auth-page">
        <div className="empty-state">
          <p>Sign in to manage your wallet</p>
          <Link href="/login" className="btn-primary" style={{ marginTop: 16, display: 'inline-block', padding: '12px 32px' }}>
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) return;
    setDepositing(true);
    try {
      await deposit(amount);
      setDepositAmount('');
    } catch (err) {
      console.error(err);
    } finally {
      setDepositing(false);
    }
  };

  const transactions = [
    { type: 'deposit', amount: '+$50.00', desc: 'Wallet deposit', date: 'Today', positive: true },
    { type: 'entry', amount: '-$2.00', desc: 'Neon Runner entry', date: 'Today', positive: false },
    { type: 'prize', amount: '+$15.00', desc: 'Room winner', date: 'Yesterday', positive: true },
    { type: 'entry', amount: '-$5.00', desc: 'Rhythm Dash entry', date: 'Yesterday', positive: false },
    { type: 'deposit', amount: '+$100.00', desc: 'Wallet deposit', date: '3 days ago', positive: true },
  ];

  const txIcons: Record<string, React.ReactNode> = {
    deposit: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    ),
    entry: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    ),
    prize: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    ),
    withdrawal: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    ),
  };

  return (
    <div className="wallet-page">
      <h1 className="page-title">Wallet</h1>

      {/* Balance Card */}
      <motion.div
        className="wallet-balance-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="wallet-balance-amount">
          ${wallet ? parseFloat(wallet.balance).toFixed(2) : '0.00'}
        </div>
        <div className="wallet-balance-label">Available Balance</div>

        <div className="wallet-actions">
          <button className="wallet-btn wallet-btn-deposit" onClick={() => document.getElementById('deposit-input')?.focus()}>
            Deposit
          </button>
          <button className="wallet-btn wallet-btn-withdraw">
            Withdraw
          </button>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <motion.div
        className="wallet-stats"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="wallet-stat">
          <span className="wallet-stat-value">$250.00</span>
          <span className="wallet-stat-label">Deposited</span>
        </div>
        <div className="wallet-stat">
          <span className="wallet-stat-value wallet-stat-win">$145.00</span>
          <span className="wallet-stat-label">Won</span>
        </div>
        <div className="wallet-stat">
          <span className="wallet-stat-value">$50.00</span>
          <span className="wallet-stat-label">Withdrawn</span>
        </div>
      </motion.div>

      {/* Deposit */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{ marginBottom: var(--space-lg) }}
        className="deposit-section"
      >
        <div className="deposit-row">
          <input
            id="deposit-input"
            className="form-input"
            type="number"
            placeholder="Amount"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            min="1"
            step="0.01"
          />
          <button
            className="wallet-btn wallet-btn-deposit"
            onClick={handleDeposit}
            disabled={depositing}
          >
            {depositing ? 'Processing...' : 'Deposit'}
          </button>
        </div>

        <div className="quick-amounts">
          {[10, 25, 50, 100].map(amount => (
            <button
              key={amount}
              className="quick-amount-btn"
              onClick={() => setDepositAmount(amount.toString())}
            >
              ${amount}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Transaction History */}
      <section>
        <div className="section-header">
          <h2 className="section-title">Transactions</h2>
        </div>
        <div className="transaction-list">
          {transactions.map((tx, i) => (
            <motion.div
              key={i}
              className="transaction-item"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.03 }}
            >
              <div className={`transaction-icon ${tx.positive ? 'tx-positive' : 'tx-negative'}`}>
                {txIcons[tx.type]}
              </div>
              <div className="transaction-info">
                <div className="transaction-desc">{tx.desc}</div>
                <div className="transaction-date">{tx.date}</div>
              </div>
              <div className={`transaction-amount ${tx.positive ? 'tx-amount-positive' : 'tx-amount-negative'}`}>
                {tx.amount}
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 7.2:** Replace the wallet CSS section in `apps/web/src/styles/globals.css`. Remove all old wallet styles (`.wallet-page` through `.transaction-amount.negative`) and replace with:

```css
/* --- Wallet Page ------------------------------------------------- */

.wallet-page {
  padding: var(--space-md);
}

.wallet-balance-card {
  padding: var(--space-xl) var(--space-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  text-align: center;
  margin-bottom: var(--space-md);
}

.wallet-balance-amount {
  font-family: var(--font-mono);
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--money);
  letter-spacing: -0.02em;
  margin-bottom: 4px;
}

.wallet-balance-label {
  font-size: 0.6875rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: var(--space-lg);
}

.wallet-actions {
  display: flex;
  gap: var(--space-sm);
}

.wallet-btn {
  flex: 1;
  padding: 12px;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.875rem;
  transition: var(--transition-fast);
}

.wallet-btn-deposit {
  background: var(--trust);
  color: white;
}

.wallet-btn-deposit:hover {
  background: #4B92F7;
}

.wallet-btn-deposit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wallet-btn-withdraw {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.wallet-btn-withdraw:hover {
  border-color: var(--border-hover);
}

/* --- Wallet Stats ------------------------------------------------ */

.wallet-stats {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.wallet-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-md) var(--space-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.wallet-stat-value {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.wallet-stat-win {
  color: var(--win);
}

.wallet-stat-label {
  font-size: 0.6875rem;
  color: var(--text-muted);
}

/* --- Deposit Section --------------------------------------------- */

.deposit-section {
  margin-bottom: var(--space-lg);
}

.deposit-row {
  display: flex;
  gap: var(--space-sm);
}

.deposit-row .form-input {
  flex: 1;
}

.deposit-row .wallet-btn {
  flex: none;
  padding: 12px 24px;
  white-space: nowrap;
}

.quick-amounts {
  display: flex;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
}

.quick-amount-btn {
  flex: 1;
  padding: 8px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: var(--transition-fast);
}

.quick-amount-btn:hover {
  border-color: var(--border-hover);
  color: var(--text-primary);
}

/* --- Transactions ------------------------------------------------ */

.transaction-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.transaction-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: border-color var(--transition-fast);
}

.transaction-item:hover {
  border-color: var(--border-hover);
}

.transaction-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tx-positive {
  background: rgba(16, 185, 129, 0.1);
  color: var(--win);
}

.tx-negative {
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger);
}

.transaction-info {
  flex: 1;
  min-width: 0;
}

.transaction-desc {
  font-weight: 500;
  font-size: 0.875rem;
}

.transaction-date {
  font-size: 0.6875rem;
  color: var(--text-muted);
}

.transaction-amount {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.875rem;
}

.tx-amount-positive {
  color: var(--win);
}

.tx-amount-negative {
  color: var(--danger);
}
```

- [ ] **Step 7.3:** Fix a syntax issue in wallet/page.tsx. The inline style `style={{ marginBottom: var(--space-lg) }}` is invalid JSX. The motion.div for the deposit section should not use that inline style. Instead, it uses the `deposit-section` className which already handles margin via CSS. Remove the inline style attribute entirely from that motion.div.

- [ ] **Step 7.4:** Commit: `refactor(web): redesign wallet page with fintech-grade clean layout`

---

## Task 8: Redesign Profile Page (merge Dashboard into Profile)

**Files to modify:**
- `apps/web/src/app/profile/page.tsx`
- `apps/web/src/app/dashboard/page.tsx` (redirect to profile)

### Steps

- [ ] **Step 8.1:** Replace `apps/web/src/app/profile/page.tsx` with the following content:

```tsx
'use client';

import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

const MOCK_HISTORY = [
  { game: 'Neon Runner', opponent: 'GameMaster99', format: '1v1', result: 'W', score: '15,420', money: '+$4.50', date: '2h ago' },
  { game: 'Rhythm Dash', opponent: 'SkillKing', format: '1v1 Bo3', result: 'L', score: '8,930', money: '-$5.00', date: '5h ago' },
  { game: 'Neon Runner', opponent: 'Pool (8 players)', format: 'FFA 10', result: 'W', score: '22,100', money: '+$12.00', date: '1d ago' },
  { game: 'Color Match', opponent: 'NoobSlayer', format: '1v1', result: 'L', score: '6,200', money: '-$2.00', date: '2d ago' },
];

const MOCK_ACHIEVEMENTS = [
  { label: '10 Wins', earned: true },
  { label: 'First $100', earned: true },
  { label: '5 Win Streak', earned: true },
  { label: 'Event Winner', earned: false },
  { label: '100 Games', earned: false },
  { label: 'Top 3 Monthly', earned: false },
];

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { wallet } = useWallet();
  const router = useRouter();

  if (!user) {
    router.push('/login');
    return null;
  }

  return (
    <div className="profile-page">
      {/* Player Card */}
      <motion.div
        className="player-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="player-card-header">
          <div className="player-avatar-lg">
            {(user.displayName || user.username)[0].toUpperCase()}
          </div>
          <div className="player-identity">
            <h1 className="player-display-name">{user.displayName || user.username}</h1>
            <p className="player-username">@{user.username}</p>
          </div>
        </div>

        <div className="player-stats">
          <div className="player-stat">
            <span className="player-stat-value">24</span>
            <span className="player-stat-label">Played</span>
          </div>
          <div className="player-stat">
            <span className="player-stat-value">62%</span>
            <span className="player-stat-label">Win Rate</span>
          </div>
          <div className="player-stat">
            <span className="player-stat-value player-stat-earnings">$145</span>
            <span className="player-stat-label">Earnings</span>
          </div>
        </div>
      </motion.div>

      {/* Active Rooms (placeholder) */}
      <section className="profile-section">
        <div className="section-header">
          <h2 className="section-title">Your Active Rooms</h2>
        </div>
        <div className="empty-state-inline">
          <p>No active rooms</p>
        </div>
      </section>

      {/* Match History */}
      <section className="profile-section">
        <div className="section-header">
          <h2 className="section-title">Match History</h2>
        </div>
        <div className="match-history">
          {MOCK_HISTORY.map((match, i) => (
            <motion.div
              key={i}
              className="match-row"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <div className={`match-result ${match.result === 'W' ? 'match-win' : 'match-loss'}`}>
                {match.result}
              </div>
              <div className="match-info">
                <div className="match-game">{match.game} vs {match.opponent}</div>
                <div className="match-meta">{match.format} &middot; {match.date}</div>
              </div>
              <div className="match-right">
                <div className="match-score">{match.score}</div>
                <div className={`match-money ${match.money.startsWith('+') ? 'money-positive' : 'money-negative'}`}>
                  {match.money}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Achievements */}
      <section className="profile-section">
        <div className="section-header">
          <h2 className="section-title">Achievements</h2>
        </div>
        <div className="achievements-scroll">
          {MOCK_ACHIEVEMENTS.map((achievement, i) => (
            <div
              key={i}
              className={`achievement-badge ${achievement.earned ? 'achievement-earned' : 'achievement-locked'}`}
            >
              <span className="achievement-label">{achievement.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Settings */}
      <section className="profile-section">
        <div className="settings-list">
          <button className="settings-row">
            <span>Account Settings</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <button className="settings-row">
            <span>Notifications</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <button className="settings-row settings-row-danger" onClick={() => { logout(); router.push('/'); }}>
            <span>Sign Out</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 8.2:** Replace `apps/web/src/app/dashboard/page.tsx` with a redirect to profile:

```tsx
import { redirect } from 'next/navigation';

export default function DashboardPage() {
  redirect('/profile');
}
```

- [ ] **Step 8.3:** Add Profile page CSS to `apps/web/src/styles/globals.css`. Remove old `.dashboard` and `.stats-grid`/`.stat-card` CSS and replace with:

```css
/* --- Profile Page ------------------------------------------------ */

.profile-page {
  padding: var(--space-md);
}

.profile-section {
  margin-bottom: var(--space-lg);
}

/* --- Player Card ------------------------------------------------- */

.player-card {
  padding: var(--space-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-lg);
}

.player-card-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.player-avatar-lg {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--surface-elevated);
  border: 2px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.player-identity {
  min-width: 0;
}

.player-display-name {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
}

.player-username {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.player-stats {
  display: flex;
  gap: var(--space-sm);
}

.player-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-sm) 0;
}

.player-stat-value {
  font-family: var(--font-mono);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
}

.player-stat-earnings {
  color: var(--money);
}

.player-stat-label {
  font-size: 0.6875rem;
  color: var(--text-muted);
  margin-top: 2px;
}

/* --- Match History ----------------------------------------------- */

.match-history {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.match-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.match-result {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.75rem;
  flex-shrink: 0;
}

.match-win {
  background: rgba(16, 185, 129, 0.15);
  color: var(--win);
}

.match-loss {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}

.match-info {
  flex: 1;
  min-width: 0;
}

.match-game {
  font-weight: 500;
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.match-meta {
  font-size: 0.6875rem;
  color: var(--text-muted);
}

.match-right {
  text-align: right;
  flex-shrink: 0;
}

.match-score {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.match-money {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 700;
}

.money-positive {
  color: var(--win);
}

.money-negative {
  color: var(--danger);
}

/* --- Achievements ------------------------------------------------ */

.achievements-scroll {
  display: flex;
  gap: var(--space-sm);
  overflow-x: auto;
  padding-bottom: var(--space-sm);
  scrollbar-width: none;
}

.achievements-scroll::-webkit-scrollbar {
  display: none;
}

.achievement-badge {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.achievement-earned {
  background: var(--primary-dim);
  border: 1px solid var(--primary);
  color: var(--primary);
}

.achievement-locked {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
}

/* --- Settings List ----------------------------------------------- */

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px var(--space-md);
  font-size: 0.875rem;
  color: var(--text-primary);
  transition: background var(--transition-fast);
  text-align: left;
  width: 100%;
}

.settings-row:hover {
  background: var(--surface-elevated);
}

.settings-row svg {
  color: var(--text-muted);
}

.settings-row-danger {
  color: var(--danger);
}

.settings-row-danger svg {
  color: var(--danger);
}
```

- [ ] **Step 8.4:** Commit: `refactor(web): redesign profile page with player card, match history, achievements`

---

## Task 9: Restyle Auth Pages

**Files to modify:**
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/app/register/page.tsx`
- `apps/web/src/styles/globals.css` (auth page CSS)

### Steps

- [ ] **Step 9.1:** Replace `apps/web/src/app/login/page.tsx` with the following content:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <h1 className="auth-title">Welcome Back</h1>
        <p className="auth-subtitle">Sign in to your account</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="form-error"
            >
              {error}
            </motion.p>
          )}

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <p className="auth-link">
          Don&apos;t have an account? <Link href="/register">Sign Up</Link>
        </p>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 9.2:** Replace `apps/web/src/app/register/page.tsx` with the following content:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await register(email, username, password);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <h1 className="auth-title">Join OGHUB</h1>
        <p className="auth-subtitle">Create your competitive account</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              className="form-input"
              type="text"
              placeholder="Choose a username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder="8+ characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="form-error"
            >
              {error}
            </motion.p>
          )}

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p className="auth-link">
          Already have an account? <Link href="/login">Sign In</Link>
        </p>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 9.3:** Replace the auth pages and form elements CSS in `apps/web/src/styles/globals.css`. Remove old `.auth-page` through `.ghost-btn:hover` and replace with:

```css
/* --- Auth Pages -------------------------------------------------- */

.auth-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 140px);
  padding: var(--space-md);
}

.auth-card {
  width: 100%;
  max-width: 400px;
  padding: var(--space-xl);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.auth-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 4px;
  color: var(--text-primary);
}

.auth-subtitle {
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin-bottom: var(--space-xl);
}

.auth-link {
  text-align: center;
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-top: var(--space-lg);
}

.auth-link a {
  color: var(--primary);
  font-weight: 600;
}

.auth-link a:hover {
  color: var(--primary-hover);
}

/* --- Form Elements ----------------------------------------------- */

.form-group {
  margin-bottom: var(--space-md);
}

.form-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 12px var(--space-md);
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 0.875rem;
  transition: var(--transition-fast);
  outline: none;
}

.form-input::placeholder {
  color: var(--text-muted);
}

.form-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
}

.form-error {
  color: var(--danger);
  font-size: 0.8125rem;
  margin-bottom: var(--space-md);
}

/* --- Buttons ----------------------------------------------------- */

.btn-primary {
  display: block;
  width: 100%;
  padding: 14px;
  background: var(--primary);
  border: none;
  border-radius: var(--radius-md);
  color: white;
  font-family: var(--font-display);
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.btn-primary:hover {
  background: var(--primary-hover);
}

.btn-primary:active {
  transform: translateY(1px);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
```

- [ ] **Step 9.4:** Commit: `refactor(web): restyle auth pages with clean forms and orange CTA`

---

## Task 10: Global CSS Cleanup & Polish

**Files to modify:**
- `apps/web/src/styles/globals.css` (full pass)
- `apps/web/src/app/leaderboard/[id]/page.tsx`

### Steps

- [ ] **Step 10.1:** Create the Events placeholder page at `apps/web/src/app/events/page.tsx`:

```tsx
'use client';

import { motion } from 'framer-motion';

export default function EventsPage() {
  return (
    <div style={{ padding: 'var(--space-md)' }}>
      <h1 className="page-title">Events</h1>

      {/* Featured Event Placeholder */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="event-featured-card"
      >
        <div className="event-featured-image">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
        </div>
        <div className="event-featured-info">
          <h2 className="event-featured-title">Coming Soon</h2>
          <p className="event-featured-desc">Platform-run tournaments with real prizes. Stay tuned.</p>
        </div>
      </motion.div>

      {/* Event Tabs */}
      <div className="tag-filter" style={{ marginTop: 'var(--space-lg)' }}>
        <button className="tag-btn tag-btn-active">Live</button>
        <button className="tag-btn">Upcoming</button>
        <button className="tag-btn">Past</button>
      </div>

      <div className="empty-state">
        <p>No events yet. Check back soon.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.2:** Restyle the leaderboard page. Replace `apps/web/src/app/leaderboard/[id]/page.tsx` with:

```tsx
'use client';

import { motion } from 'framer-motion';

export default function LeaderboardPage() {
  const demo = [
    { rank: 1, name: 'xProPlayer', score: 15420 },
    { rank: 2, name: 'GameMaster99', score: 14200 },
    { rank: 3, name: 'SkillKing', score: 13800 },
    { rank: 4, name: 'NoobSlayer', score: 12500 },
    { rank: 5, name: 'ProGamer42', score: 11900 },
    { rank: 6, name: 'ClutchMaster', score: 11200 },
    { rank: 7, name: 'ShadowPlay', score: 10800 },
    { rank: 8, name: 'PixelWarrior', score: 10100 },
    { rank: 9, name: 'ArcadeLegend', score: 9500 },
    { rank: 10, name: 'RushQueen', score: 9200 },
  ];

  return (
    <div style={{ padding: 'var(--space-md)' }}>
      <h1 className="page-title">Leaderboard</h1>

      <div className="leaderboard-list">
        {demo.map((entry, i) => (
          <motion.div
            key={entry.rank}
            className="leaderboard-row"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <span className={`lb-rank ${entry.rank === 1 ? 'lb-rank-first' : ''}`}>
              #{entry.rank}
            </span>
            <div className="lb-avatar">{entry.name[0]}</div>
            <span className="lb-name">{entry.name}</span>
            <span className="lb-score">{entry.score.toLocaleString()}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 10.3:** Do a final pass on `apps/web/src/styles/globals.css` to remove all remaining old CSS sections that are no longer used. Specifically, remove:
  - Old `.game-card` class styles (not the CSS module ones — the globals.css duplicates at lines ~373-592)
  - Old `.game-card-cta` and shimmer keyframes
  - Old `.stat` / `.stat-label` / `.stat-value` classes (replaced by more specific classes)
  - Old `.top-score-row` styles
  - Old `.difficulty-badge` and `.difficulty-*` classes
  - Old `.featured-tag` and `@keyframes pulse-glow`
  - Old `.game-feed` and `.featured-section`
  - Old `.dashboard` and `.stats-grid` / `.stat-card` styles
  - Old `.leaderboard` base class (the page padding class)
  - Old `.leaderboard-podium`, `.podium-entry`, `.podium-avatar`, `.podium-name`, `.podium-score` classes
  - Old `.wallet-balance-card::after` shimmer
  - Old `.wallet-action-btn` styles
  - Old `.vip-badge` styles
  - Old `.bet-slider` styles
  - Old `.don-*` (Double or Nothing) styles
  - Old `.multiplier-badge` styles
  - Old `.active-players` / `.active-dot` styles
  - Old `.streak-badge` / `.streak-flame` styles
  - Old `.winners-ticker` / `.ticker-*` styles
  - Old `.urgency-banner` / `.urgency-dot` styles
  - Old `.reward-overlay` / `.reward-amount` / `.rank-badge` / `.coin-particle` styles
  - Old `.near-miss-toast` styles
  - Any remaining `@keyframes` for removed effects (shimmer, pulse-glow, ticker-scroll, urgency-pulse, blink, diamond-glow, multiplier-pulse, active-pulse, flame)
  - Old `.ghost-btn` styles

  After removal, ensure the globals.css file contains only:
  1. Font import
  2. New design tokens (`:root`)
  3. Reset & foundation
  4. App shell, header, wallet badge, bottom nav
  5. Page layout (home-page, section-header, section-title, page-title)
  6. Tag filter
  7. Games grid
  8. Empty states
  9. Game detail page (game-banner, game-detail-content, room-card, leaderboard, game-stats-footer)
  10. Wallet page styles
  11. Profile page styles
  12. Auth pages and form elements
  13. Buttons (btn-primary)
  14. Events page styles (if any needed)

- [ ] **Step 10.4:** Add events page CSS to `apps/web/src/styles/globals.css`:

```css
/* --- Events Page ------------------------------------------------- */

.event-featured-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.event-featured-image {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--surface-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
}

.event-featured-info {
  padding: var(--space-md);
}

.event-featured-title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.event-featured-desc {
  font-size: 0.875rem;
  color: var(--text-secondary);
}
```

- [ ] **Step 10.5:** Write out the final complete `apps/web/src/styles/globals.css` file to ensure it is clean and has no orphaned styles. The final file should contain all the CSS sections defined in Tasks 1-9 plus the events CSS from this task, in the order listed in Step 10.3, with no old Neon-Noir styles remaining.

- [ ] **Step 10.6:** Commit: `refactor(web): final CSS cleanup, events placeholder, leaderboard restyle`

---

## Summary of All Files Changed

### New files:
- `apps/web/src/app/events/page.tsx`

### Modified files:
- `apps/web/src/styles/globals.css` (full rewrite)
- `apps/web/src/app/layout.tsx`
- `apps/web/src/components/BottomNav.tsx`
- `apps/web/src/components/WalletBadge.tsx`
- `apps/web/src/components/GameCard.tsx`
- `apps/web/src/components/GameCard.module.css`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/games/[id]/page.tsx`
- `apps/web/src/app/wallet/page.tsx`
- `apps/web/src/app/profile/page.tsx`
- `apps/web/src/app/dashboard/page.tsx` (redirect)
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/app/register/page.tsx`
- `apps/web/src/app/leaderboard/[id]/page.tsx`

### Deleted files:
- `apps/web/src/components/DoubleOrNothing.tsx`
- `apps/web/src/components/UrgencyBanner.tsx`
- `apps/web/src/components/LiveWinnersTicker.tsx`
- `apps/web/src/components/RewardAnimation.tsx`

### Files intentionally NOT modified:
- `apps/web/src/components/ErrorBoundary.tsx` (kept as-is)
- `apps/web/src/components/NearMissToast.tsx` (kept for now, rethink later per spec)
- `apps/web/src/hooks/useAuth.tsx` (no changes needed)
- `apps/web/src/hooks/useWallet.ts` (no changes needed)
- `apps/web/src/lib/api.ts` (no changes needed)
