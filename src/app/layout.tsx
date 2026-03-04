import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Swarm',
  description: 'AI-powered development swarm',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#121220', color: '#e4e4e7', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <nav style={{
          display: 'flex',
          gap: '1.5rem',
          padding: '0.75rem 1.5rem',
          background: '#1a1a2e',
          borderBottom: '1px solid #2e2e3e',
          fontSize: '0.9rem',
        }}>
          <a href="/" style={{ color: '#a5b4fc', textDecoration: 'none' }}>Home</a>
          <a href="/usage" style={{ color: '#a5b4fc', textDecoration: 'none' }}>Usage</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
