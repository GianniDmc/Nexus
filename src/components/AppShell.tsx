'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, usePathname } from 'next/navigation';
import {
  Settings,
  Search,
  Menu,
  X,
  Sparkles,
  Archive,
  Bookmark,
  Calendar
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

interface AppShellProps {
  children: React.ReactNode;
}

function SidebarLink({ href, icon, label, onClick }: { href: string; icon: React.ReactNode; label: string; onClick?: () => void }) {
  const searchParams = useSearchParams();
  const currentFilter = searchParams.get('filter') || 'today';
  const currentCategory = searchParams.get('category');

  // Parse target href params
  const targetUrl = new URL(href, 'http://dummy.com'); // dummy base for relative formatting
  const targetFilter = targetUrl.searchParams.get('filter');
  const targetCategory = targetUrl.searchParams.get('category');

  let isActive = false;
  if (targetCategory) {
    isActive = currentCategory === targetCategory;
  } else if (targetFilter) {
    isActive = currentFilter === targetFilter;
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${isActive
        ? 'bg-accent/10 text-accent'
        : 'text-muted-foreground hover:bg-secondary/50 hover:text-primary'
        }`}
    >
      {icon}
      {label}
    </Link>
  );
}

export function AppShell({ children }: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const isHomePage = pathname === '/';

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border/40 bg-card/30 backdrop-blur-xl h-full p-4">
        {/* Logo */}
        <div className="mb-8 px-2 flex items-center justify-between">
          <h1 className="text-xl font-serif font-medium tracking-tighter text-primary">
            Nexus<span className="text-accent">.</span>
          </h1>
          <ThemeToggle />
        </div>

        {/* Search Input */}
        <div className="mb-8 relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search className="h-3 w-3 text-muted" />
          </div>
          <input
            type="text"
            placeholder="Rechercher..."
            suppressHydrationWarning
            onChange={(e) => {
              const value = e.target.value;
              const params = new URLSearchParams(window.location.search);
              if (value) {
                params.set('search', value);
              } else {
                params.delete('search');
              }
              window.history.replaceState(null, '', `?${params.toString()}`);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const target = e.target as HTMLInputElement;
                const params = new URLSearchParams(window.location.search);
                if (target.value) params.set('search', target.value);
                else params.delete('search');
                window.location.search = params.toString();
              }
            }}
            className="w-full bg-secondary/50 border border-border/50 rounded-lg py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>

        {/* Navigation Links (Wrapped in Suspense) */}
        <nav className="flex-1 overflow-y-auto py-6 space-y-8">
          {/* TEMPS Section */}
          <div>
            <h3 className="px-2 text-[10px] font-bold uppercase tracking-widest text-muted mb-3 opacity-70">Temps</h3>
            <Suspense fallback={<div className="animate-pulse space-y-2"><div className="h-8 bg-muted/20 rounded"></div></div>}>
              <div className="space-y-1">
                <SidebarLink href="/?filter=today" icon={<Sparkles className="w-4 h-4" />} label="Aujourd'hui" />
                <SidebarLink href="/?filter=yesterday" icon={<Calendar className="w-4 h-4" />} label="Hier" />
                <SidebarLink href="/?filter=week" icon={<Calendar className="w-4 h-4" />} label="Cette semaine" />
                <SidebarLink href="/?filter=archives" icon={<Archive className="w-4 h-4" />} label="Archives" />
                <SidebarLink href="/?filter=saved" icon={<Bookmark className="w-4 h-4" />} label="Ma liste" />
              </div>
            </Suspense>
          </div>


        </nav>

        {/* Footer / Profile */}
        <div className="mt-auto pt-4 border-t border-border/40">
          {/* No auth for now */}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden overflow-x-hidden relative">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border/40 bg-background/80 backdrop-blur-md sticky top-0 z-50">
          <h1 className="text-xl font-serif font-medium tracking-tighter text-primary">
            Nexus<span className="text-accent">.</span>
          </h1>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2">
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </header>

        {/* Content Wrapper (Conditional scroll based on page) */}
        <div className={`flex-1 flex flex-col relative ${isHomePage ? 'overflow-hidden' : 'overflow-y-auto scroll-smooth'}`}>
          {children}
        </div>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="absolute inset-0 top-[61px] bg-background z-40 p-4 md:hidden">
            <div className="space-y-6">
              <nav className="space-y-2">
                <SidebarLink onClick={() => setIsMobileMenuOpen(false)} href="/?filter=recent" icon={<Sparkles className="w-5 h-5" />} label="Aujourd'hui" />
                <SidebarLink onClick={() => setIsMobileMenuOpen(false)} href="/?filter=week" icon={<Calendar className="w-5 h-5" />} label="Cette semaine" />
                <SidebarLink onClick={() => setIsMobileMenuOpen(false)} href="/?filter=archives" icon={<Archive className="w-5 h-5" />} label="Archives" />
                <SidebarLink onClick={() => setIsMobileMenuOpen(false)} href="/?filter=saved" icon={<Bookmark className="w-5 h-5" />} label="Ma liste" />
              </nav>

              <div className="pt-4 border-t border-border/40">
                <ThemeToggle />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
