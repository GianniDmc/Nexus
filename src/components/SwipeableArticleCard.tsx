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
    onSwipeRight
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
        if (info.offset.x > 80 && onSwipeRight) {
            onSwipeRight();
        } else if (info.offset.x < -80 && onSwipeLeft) {
            onSwipeLeft();
        }
    };

    return (
        <div className="relative overflow-hidden rounded-xl">
            {/* Background Actions Layer */}
            <motion.div
                style={{ backgroundColor, opacity: backgroundOpacity }}
                className="absolute inset-0 flex items-center justify-between px-6 z-0 rounded-xl"
            >
                {/* Left Side (Save Action - appears when swiping right) */}
                <motion.div style={{ opacity: leftIconOpacity }} className="flex items-center gap-2 text-emerald-500 font-bold uppercase tracking-wider text-xs">
                    <Bookmark className="w-5 h-5" />
                    <span className="hidden sm:inline">Sauvegarder</span>
                </motion.div>

                {/* Right Side (Read Action - appears when swiping left) */}
                <motion.div style={{ opacity: rightIconOpacity }} className="flex items-center gap-2 text-blue-500 font-bold uppercase tracking-wider text-xs">
                    <span className="hidden sm:inline">Marquer lu</span>
                    <Archive className="w-5 h-5" />
                </motion.div>
            </motion.div>

            {/* Foreground Card */}
            <motion.div
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.7}
                onDragEnd={handleDragEnd}
                style={{ x }}
                className="relative z-10 bg-background" // Ensure background is solid
                whileTap={{ cursor: 'grabbing' }}
            >
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
            </motion.div>
        </div>
    );
}
