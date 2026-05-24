import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'zm-os',
  description: 'Browser-based virtual desktop POC',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
