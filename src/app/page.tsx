import NewsFeed from '@/components/NewsFeed';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div className="w-full max-w-full 2xl:max-w-[1600px] mx-auto px-2 py-4 md:p-8 lg:p-12">
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
