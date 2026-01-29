'use client';

import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Check, Newspaper, Sparkles, Bookmark, Archive } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface SwipeableArticleCardProps {
    article: any;
    index: number;
    isSelected: boolean;
    isRead: boolean;
    isSaved: boolean;
    sortBy: string;
    onClick: () => void;
    onSwipeLeft?: () => void; // Action: Mark as Read
    onSwipeRight?: () => void; // Action: Save / Bookmark
    variant?: 'standard' | 'compact' | 'hero';
}

export function SwipeableArticleCard({
    article,
    index,
    isSelected,
    isRead,
    isSaved,
    sortBy,
    onClick,
    onSwipeLeft,
    onSwipeRight,
    variant = 'standard'
}: SwipeableArticleCardProps) {
    const x = useMotionValue(0);
    const backgroundOpacity = useTransform(x, [-100, 0, 100], [1, 0, 1]);

    // Swipe Right (Positive X) -> Save (Green/Emerald)
    // Swipe Left (Negative X) -> Read (Blue)
    const backgroundColor = useTransform(
        x,
        [-100, 0, 100],
        ['rgba(59, 130, 246, 0.2)', 'rgba(0,0,0,0)', 'rgba(16, 185, 129, 0.2)']
    );

    // Icon Opacity
    const leftIconOpacity = useTransform(x, [0, 50], [0, 1]); // Save Icon (appears when dragging right)
    const rightIconOpacity = useTransform(x, [-50, 0], [1, 0]); // Read Icon (appears when dragging left)

    const handleDragEnd = (_: any, info: PanInfo) => {
        if (info.offset.x > 60 && onSwipeRight) {
            onSwipeRight();
        } else if (info.offset.x < -60 && onSwipeLeft) {
            onSwipeLeft();
        }
    };

    return (
        <div className={`relative overflow-hidden rounded-xl ${variant === 'hero' ? 'md:col-span-2 h-full' : ''}`}>
            {/* Background Actions Layer */}
            <motion.div
                style={{ backgroundColor, opacity: backgroundOpacity }}
                className="absolute inset-0 flex items-center justify-between px-6 z-0 rounded-xl"
            >
                {/* Left Side (Save Action) */}
                <motion.div style={{ opacity: leftIconOpacity }} className="flex items-center gap-2 text-emerald-500 font-bold uppercase tracking-wider text-xs">
                    <Bookmark className="w-5 h-5" />
                    <span className="hidden sm:inline">{isSaved ? 'Retirer' : 'Sauvegarder'}</span>
                </motion.div>

                {/* Right Side (Read Action) */}
                <motion.div style={{ opacity: rightIconOpacity }} className="flex items-center gap-2 text-blue-500 font-bold uppercase tracking-wider text-xs">
                    <span className="hidden sm:inline">{isRead ? 'Non lu' : 'Marquer lu'}</span>
                    <Archive className="w-5 h-5" />
                </motion.div>
            </motion.div>

            {/* Foreground Card */}
            <motion.div
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.7}
                dragDirectionLock
                onDragEnd={handleDragEnd}
                style={{ x, touchAction: 'pan-y' }}
                className={`relative z-10 bg-background h-full`}
                whileTap={{ cursor: 'grabbing' }}
            >
                {variant === 'hero' ? (
                    <div
                        onClick={onClick}
                        className={`group cursor-pointer relative overflow-hidden rounded-2xl border transition-all duration-300 h-full ${isSelected ? 'ring-2 ring-accent' : 'hover:border-accent/50'} ${isRead ? 'opacity-70 grayscale-[0.5]' : ''}`}
                    >
                        <div className="absolute inset-0 z-0">
                            {article.image_url ? (
                                <img src={article.image_url} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-accent/20 to-background" />
                            )}
                            <div className="absolute inset-0 bg-black/40" />
                            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/90 via-30% to-transparent" />
                        </div>

                        <div className="relative z-10 p-5 flex flex-col justify-end h-full min-h-[220px]">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="bg-accent text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm">
                                    {article.category}
                                </span>
                                {article.source_count > 1 && (
                                    <span className="bg-white/90 backdrop-blur text-black px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 shadow-sm">
                                        <Newspaper className="w-3 h-3" /> {article.source_count} sources
                                    </span>
                                )}
                                <span className="text-[10px] font-medium text-white/90 bg-black/30 backdrop-blur px-2 py-0.5 rounded shadow-sm">
                                    {formatDistanceToNow(new Date(article.published_at), { locale: fr, addSuffix: true })}
                                </span>
                                {isRead && <Check className="w-4 h-4 text-green-400 bg-black/50 rounded-full p-0.5" />}
                            </div>
                            <h2 className="text-xl font-serif font-bold text-foreground leading-tight mb-2 group-hover:text-accent transition-colors drop-shadow-md">
                                {article.title}
                            </h2>
                            <p className="text-xs text-foreground/90 line-clamp-2 max-w-xl drop-shadow-sm font-medium">
                                {JSON.parse(article.summary_short).tldr}
                            </p>
                        </div>
                    </div>
                ) : variant === 'compact' ? (
                    <div
                        onClick={onClick}
                        className={`group cursor-pointer p-3 rounded-xl border bg-card/40 hover:bg-card transition-all h-full flex flex-col ${isSelected ? 'border-accent ring-1 ring-accent/20' : 'border-border/40 hover:border-border'} ${isRead ? 'opacity-60' : ''}`}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-accent">{article.category}</span>
                            <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                                {article.source_count > 1 && <span className="flex items-center gap-1"><Newspaper className="w-3 h-3" /> {article.source_count}</span>}
                                {isRead && <Check className="w-3 h-3 text-green-500" />}
                                <span>{formatDistanceToNow(new Date(article.published_at), { locale: fr, addSuffix: true })}</span>
                            </div>
                        </div>
                        <h3 className="font-medium text-sm leading-snug group-hover:text-primary transition-colors line-clamp-3 mb-1">
                            {article.title}
                        </h3>
                    </div>
                ) : (
                    // Standard List Layout
                    <div
                        onClick={onClick}
                        className={`cursor-pointer p-3 rounded-xl border transition-all duration-200 relative ${isSelected
                            ? 'bg-accent/5 border-accent/60 shadow-md ring-1 ring-accent/10'
                            : isRead
                                ? 'bg-card/30 border-border/20 opacity-60'
                                : 'bg-card/60 border-border/40 hover:bg-card hover:border-border'
                            }`}
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex flex-col items-center gap-1 mt-0.5">
                                <div className={`text-[10px] font-mono leading-none ${isSelected ? 'text-accent font-bold' : 'text-muted/40'}`}>
                                    {(index + 1).toString().padStart(2, '0')}
                                </div>
                                {isRead && <Check className="w-3 h-3 text-green-500/50" />}
                                {isSaved && <Bookmark className="w-3 h-3 text-emerald-500/80 fill-current mt-1" />}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground truncate max-w-[100px]">{article.category}</span>
                                    <span className="text-[9px] text-muted whitespace-nowrap">• {formatDistanceToNow(new Date(article.published_at), { locale: fr, addSuffix: true })}</span>

                                    {/* Source Count Indicator */}
                                    {article.source_count > 1 && (
                                        <span className="flex items-center gap-1 text-[9px] text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded-full">
                                            <Newspaper className="w-3 h-3" />
                                            {article.source_count}
                                        </span>
                                    )}

                                    {/* Score Display (only when sorting by score) */}
                                    {sortBy === 'score' && article.final_score !== null && (
                                        <span className="text-[9px] font-bold text-accent">
                                            {article.final_score}
                                        </span>
                                    )}

                                    {article.final_score > 7 && (
                                        <Sparkles className="w-2 h-2 text-accent" />
                                    )}
                                </div>
                                <h4 className={`text-sm font-medium leading-snug line-clamp-2 ${isRead ? 'text-primary/60' : isSelected ? 'text-primary' : 'text-primary/90'}`}>
                                    {article.title}
                                </h4>
                            </div>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
