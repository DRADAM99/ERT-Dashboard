import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AuthContextProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { NotificationProvider } from './context/NotificationContext';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "ניהול אירוע חירום",
  description: "מערכת ניהול אירועי חירום",
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ]
  },
  manifest: '/manifest.json',
  themeColor: '#1b3a78',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ERT Dashboard'
  }
};

/** Next.js 15+: viewport must be a separate export (metadata.viewport is ignored). */
export const viewport = {
  width: "device-width",
  initialScale: 1,
  // Keep existing PWA preference; search inputs also use ≥16px to avoid iOS zoom.
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1b3a78",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" dir="rtl">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthContextProvider>
          <DataProvider>
            <NotificationProvider>
              {children}
              <Toaster />
            </NotificationProvider>
          </DataProvider>
        </AuthContextProvider>
      </body>
    </html>
  );
}
