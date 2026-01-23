'use client';

import NewsFeed from '@/components/NewsFeed';

export default function Home() {
  return (
    <div className="w-full max-w-[1200px] mx-auto p-6 md:p-12">
      {/* Page Header */}
      <header className="mb-12">
        <h2 className="text-3xl font-serif font-medium text-primary">Le Flux</h2>
        <p className="text-sm text-muted mt-1">L'essentiel de l'actualité tech, sans bruit.</p>
      </header>

      {/* Main Grid Content */}
      <main>
        <NewsFeed />
      </main>
    </div>
  );
}
