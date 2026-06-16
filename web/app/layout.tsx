import { DM_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import ChunkLoadRecovery from './chunk-load-recovery';
import ClientProviders from './client-providers';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata = {
  title: 'Site Audit',
  description: 'Technical SEO site crawl and audit reports',
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

const themeInit = `(function(){try{var v=localStorage.getItem('wp-theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=v==='dark'?true:v==='light'?false:d;if(dark)document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme=dark?'dark':'light';}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body
        className={`${dmSans.variable} font-sans selection:bg-blue-500/30 overflow-hidden antialiased`}
      >
        <ChunkLoadRecovery />
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
