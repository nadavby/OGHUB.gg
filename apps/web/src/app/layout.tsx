import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import { AuthProvider } from '@/hooks/useAuth';
import { ToastProvider } from '@/components/Toast';
import BottomNav from '@/components/BottomNav';
import WalletBadge from '@/components/WalletBadge';
import ErrorBoundary from '@/components/ErrorBoundary';
import HeaderAvatar from '@/components/HeaderAvatar';

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
          <ToastProvider>
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
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
