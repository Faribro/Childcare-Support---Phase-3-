import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Child Nutrition & Education Support | India HIV/AIDS Alliance',
  description:
    'Institutional Offline-First Mobile PWA for Field Assessment of Child Nutrition and Education Support.',
  applicationName: 'Alliance Childcare PWA',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Alliance Childcare',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#1E3A8A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-surface-canvas text-ink-900 antialiased">
      <body className="min-h-screen flex flex-col safe-padding-top safe-padding-bottom">
        {children}
      </body>
    </html>
  );
}
