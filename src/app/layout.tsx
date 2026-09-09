import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PwaRegistration } from '@/components/pwa/PwaRegistration';

export const metadata: Metadata = {
  title: 'Child Nutrition & Education Support | India HIV/AIDS Alliance',
  description:
    'Institutional Offline-First Mobile PWA for Field Assessment of Child Nutrition and Education Support.',
  applicationName: 'Alliance Childcare PWA',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
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
      <body className="min-h-screen flex flex-col">
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
