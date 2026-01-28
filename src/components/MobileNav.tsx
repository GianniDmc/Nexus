'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Sparkles, Calendar, Bookmark, Menu, Clock } from 'lucide-react';

interface MobileNavProps {
    onMenuClick: () => void;
}

export function MobileNav({ onMenuClick }: MobileNavProps) {
    const searchParams = useSearchParams();
    const currentFilter = searchParams.get('filter') || 'today';

    const NavItem = ({ href, icon: Icon, label, filterValue, isAction = false }: any) => {
        const isActive = !isAction && currentFilter === filterValue;

        if (isAction) {
            return (
                <button
                    onClick={onMenuClick}
                    className="flex flex-col items-center justify-center w-full h-full space-y-1 text-muted-foreground active:scale-95 transition-transform"
                >
                    <Icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium">{label}</span>
                </button>
            );
        }

        return (
            <Link
                href={href}
                className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${isActive
                        ? 'text-accent'
                        : 'text-muted-foreground hover:text-primary'
                    }`}
            >
                <Icon className={`w-5 h-5 ${isActive ? 'fill-current' : ''}`} />
                <span className="text-[10px] font-medium">{label}</span>
            </Link>
        );
    };

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-xl border-t border-border/40 pb-safe z-50">
            <div className="grid grid-cols-5 h-full max-w-lg mx-auto">
                <NavItem
                    href="/?filter=today"
                    icon={Sparkles}
                    label="Auj."
                    filterValue="today"
                />
                <NavItem
                    href="/?filter=yesterday"
                    icon={Clock}
                    label="Hier"
                    filterValue="yesterday"
                />
                <NavItem
                    href="/?filter=week"
                    icon={Calendar}
                    label="Sem."
                    filterValue="week"
                />
                <NavItem
                    href="/?filter=saved"
                    icon={Bookmark}
                    label="Ma liste"
                    filterValue="saved"
                />
                <NavItem
                    icon={Menu}
                    label="Menu"
                    isAction
                    onMenuClick={onMenuClick}
                />
            </div>
        </nav>
    );
}
