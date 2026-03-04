import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Swarm',
  description: 'AI-powered development swarm',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
