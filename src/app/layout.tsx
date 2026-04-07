import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kiro Demo — Bright Data vs Native HTTP',
  description: 'Live side-by-side comparison of native HTTP vs Bright Data Web Unlocker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
