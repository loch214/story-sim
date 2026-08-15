import type { Metadata } from 'next';
import { Fraunces, IBM_Plex_Mono, Newsreader } from 'next/font/google';
import './globals.css';

// Three faces, three jobs: naming, prose, taxonomy.
const display = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
  axes: ['SOFT', 'WONK'],
});

const body = Newsreader({
  variable: '--font-body',
  subsets: ['latin'],
  style: ['normal', 'italic'],
});

const mono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Story-sim',
  description: 'Change one rule of reality and read the world that results.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        {children}
      </body>
    </html>
  );
}
