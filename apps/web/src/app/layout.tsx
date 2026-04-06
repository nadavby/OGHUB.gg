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
                    <HeaderAvatar />
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
