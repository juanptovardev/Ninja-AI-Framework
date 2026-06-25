import type { Metadata } from 'next';
import './globals.css';
import { ClientLayout } from './ClientLayout';
import { CommandPalette } from '../components/CommandPalette';

export const metadata: Metadata = {
  title: 'Ninja Forge Console',
  description: 'AI-powered multi-agent software construction and supervision dashboard',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      <body suppressHydrationWarning>
        <ClientLayout>{children}</ClientLayout>
        <CommandPalette />
      </body>
    </html>
  );
}
