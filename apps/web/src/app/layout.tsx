import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import { AuthProvider } from '@/hooks/useAuth';
import BottomNav from '@/components/BottomNav';
import WalletBadge from '@/components/WalletBadge';
import ErrorBoundary from '@/components/ErrorBoundary';

export const metadata: Metadata = {
  title: 'OGHUB — Skill-Based Gaming Hub',
  description: 'Discover, compete, and earn in the ultimate skill-based gaming platform.',
  keywords: 'gaming, competitive, skill-based, esports, mobile games',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0b14',
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
                  <span className="app-logo">OGHUB</span>
                  <WalletBadge />
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
