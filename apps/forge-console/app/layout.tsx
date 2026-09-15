import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import './globals.css';
import { ClientLayout } from './ClientLayout';
import { CommandPalette } from '../components/CommandPalette';
import { ErrorBoundary } from '../components/ErrorBoundary';

export const metadata: Metadata = {
  title: 'Ninja Forge Console',
  description: 'AI-powered multi-agent software construction and supervision dashboard',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className="antialiased">
      <body suppressHydrationWarning>
        <NextIntlClientProvider>
          <ErrorBoundary>
            <ClientLayout>{children}</ClientLayout>
            <CommandPalette />
          </ErrorBoundary>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
