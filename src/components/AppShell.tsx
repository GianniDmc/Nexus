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

import { MobileNav } from '@/components/MobileNav';

// ... (keep SidebarLink)

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
        <div className="mb-8 relative" suppressHydrationWarning>
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
            className="w-full bg-secondary/50 border border-border/50 rounded-lg py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>

        {/* Navigation Links (Desktop) */}
        <nav className="flex-1 overflow-y-auto py-6 space-y-8">
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
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden overflow-x-hidden relative pb-16 md:pb-0">
        {/* Mobile Header (Minimal) */}
        <header className="md:hidden flex items-center justify-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] border-b border-border/40 bg-background/80 backdrop-blur-md sticky top-0 z-40">
          <h1 className="text-xl font-serif font-medium tracking-tighter text-primary">
            Nexus<span className="text-accent">.</span>
          </h1>
        </header>

        {/* Content Wrapper */}
        <div className={`flex-1 flex flex-col relative ${isHomePage ? 'overflow-hidden' : 'overflow-y-auto scroll-smooth'}`}>
          {children}
        </div>

        {/* Mobile Navigation Bar */}
        <MobileNav onMenuClick={() => setIsMobileMenuOpen(true)} />

        {/* Mobile "More" Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl p-6 md:hidden animate-in slide-in-from-bottom-10 fade-in">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-lg font-serif font-medium">Menu</h2>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 bg-secondary/50 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Search in Menu */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher dans les archives..."
                  className="w-full bg-secondary/50 border border-border/50 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-accent"
                  onChange={(e) => {
                    const value = e.target.value;
                    const params = new URLSearchParams(window.location.search);
                    if (value) params.set('search', value);
                    else params.delete('search');
                    window.history.replaceState(null, '', `?${params.toString()}`);
                  }}
                />
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Navigation</h3>
                <Suspense fallback={<div className="h-8 bg-muted/20 rounded animate-pulse" />}>
                  <SidebarLink onClick={() => setIsMobileMenuOpen(false)} href="/?filter=archives" icon={<Archive className="w-5 h-5" />} label="Archives" />
                </Suspense>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <span className="text-sm font-medium">Apparence</span>
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
