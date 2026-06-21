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
  description: 'SEO site crawl and audit reports',
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

const themeInit = `(function(){try{
var v=localStorage.getItem('wp-theme');
var d=window.matchMedia('(prefers-color-scheme: dark)').matches;
var dark=v==='dark'?true:v==='light'?false:d;
if(dark)document.documentElement.classList.add('dark');
else document.documentElement.classList.remove('dark');
document.documentElement.style.colorScheme=dark?'dark':'light';
var raw=localStorage.getItem('wp-theme-custom:v1');
if(raw){
  var ct=JSON.parse(raw);
  var map=dark?ct.dark:ct.light;
  if(map&&typeof map==='object'){
    var el=document.documentElement;
    Object.keys(map).forEach(function(k){if(map[k])el.style.setProperty(k,map[k]);});
  }
}
var rp=localStorage.getItem('wp-ui-prefs:v1');
if(rp){
  var up=JSON.parse(rp);
  var rv=up.radius;
  var dv=up.density;
  var av=up.animations;
  var rl=document.documentElement;
  var RVARS={'sharp':{'--radius-sm':'0.125rem','--radius-card':'0.25rem','--radius-lg':'0.375rem','--radius-xl':'0.5rem'},'rounded':{'--radius-sm':'0.75rem','--radius-card':'1.25rem','--radius-lg':'1.75rem','--radius-xl':'2rem'},'pill':{'--radius-sm':'999px','--radius-card':'1.75rem','--radius-lg':'2.5rem','--radius-xl':'3rem'}};
  var DVARS={'compact':{'--spacing-page-x':'0.75rem','--spacing-page-y':'0.75rem','--spacing-card':'0.75rem'},'spacious':{'--spacing-page-x':'2.5rem','--spacing-page-y':'2.5rem','--spacing-card':'2rem'}};
  if(RVARS[rv]){Object.keys(RVARS[rv]).forEach(function(k){rl.style.setProperty(k,RVARS[rv][k]);});}
  if(DVARS[dv]){Object.keys(DVARS[dv]).forEach(function(k){rl.style.setProperty(k,DVARS[dv][k]);});}
  if(av===false){rl.style.setProperty('--dur-fast','0ms');rl.style.setProperty('--dur-base','1ms');rl.style.setProperty('--dur-slow','1ms');}
  var fv=up.fontSize;
  if(fv==='small')rl.style.setProperty('--font-size-base','15px');
  else if(fv==='large')rl.style.setProperty('--font-size-base','20px');
}
}catch(e){}})()`.replace(/\n/g, '');

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body
        className={`${dmSans.variable} font-sans selection:bg-[var(--accent-bg)] overflow-hidden antialiased`}
      >
        <ChunkLoadRecovery />
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
