import NewsFeed from '@/components/NewsFeed';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background">
      {/* Page Header (Fixed height) */}
      <header className="flex-shrink-0 px-4 py-4 md:px-6 md:py-6 border-b border-border/40 bg-background/50 backdrop-blur-sm z-10">
        <h2 className="text-2xl font-serif font-medium text-primary tracking-tight">Le Flux</h2>
        <p className="text-xs text-muted-foreground mt-0.5">L'essentiel de l'actualité tech, en temps réel.</p>
      </header>

      {/* Main Content (Flex Grow, No Padding on container to allow full edge scroll) */}
      <main className="flex-1 overflow-hidden relative min-h-0">
        <NewsFeed />
      </main>
    </div>
  );
}
