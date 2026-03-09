"use client";

import { useEffect, useRef, useState } from "react";
import ForceGraph2D, { ForceGraphMethods } from "react-force-graph-2d";
import { useTheme } from "next-themes";
import { buildScoreTooltip } from "@/lib/score-tooltip";

export interface GraphData {
    nodes: Array<{
        id: string;
        label: string;
        category: string;
        is_published: boolean;
        score: number | null;
        scoring_details: unknown | null;
        article_count: number;
        val?: number; // Size for ForceGraph
        color?: string; // Color for ForceGraph
        normX?: number; // PCA coordinate X
        normY?: number; // PCA coordinate Y
        vx?: number;
        vy?: number;
    }>;
    links: Array<{
        source: string;
        target: string;
        similarity: number;
    }>;
}

interface ForceGraphViewProps {
    data: GraphData | null;
}

// Map logical categories to consistent colors
const CATEGORY_COLORS: Record<string, string> = {
    'Mobile': '#3b82f6',     // blue-500
    'Computing': '#a855f7',  // purple-500
    'Software': '#10b981',   // emerald-500
    'Général': '#64748b',    // slate-500
    'Tech': '#f59e0b',       // amber-500
    'AI': '#ec4899',         // pink-500
    'Gaming': '#ef4444',     // red-500
};

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export default function ForceGraphView({ data }: ForceGraphViewProps) {
    const { theme } = useTheme();
    const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
    const [containerWidth, setContainerWidth] = useState(800);
    const containerRef = useRef<HTMLDivElement>(null);

    // Initial Processing
    useEffect(() => {
        if (!data) return;
        // Inject color and sizing properties for ForceGraph
        data.nodes.forEach(node => {
            node.color = CATEGORY_COLORS[node.category] || CATEGORY_COLORS['Général'];
            // Size mapping based on article count (val determines node radius)
            node.val = Math.max(1, Math.min(10, Math.sqrt(node.article_count) * 2));
        });
    }, [data]);

    // Responsive Sizing
    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            if (entries[0] && entries[0].contentRect.width > 0) {
                setContainerWidth(entries[0].contentRect.width);
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Setup Forces
    useEffect(() => {
        if (fgRef.current) {
            // Apply push-apart force to prevent clumping
            fgRef.current.d3Force('charge')?.strength(-100);

            // Link distance roughly based on similarity (higher sim = shorter link)
            fgRef.current.d3Force('link')?.distance((link: any) => {
                return link.similarity ? Math.max(20, 100 * (1 - link.similarity)) : 50;
            });

            // Re-heat simulation
            fgRef.current.d3ReheatSimulation();
        }
    }, [data, containerWidth]);

    if (!data || data.nodes.length === 0) {
        return <div className="text-muted text-sm italic py-12 text-center">Aucune donnée de graphe disponible</div>;
    }

    const isDark = theme === 'dark';
    const bgColor = isDark ? '#020617' : '#f8fafc'; // slate-950 or slate-50
    const textColor = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)';
    const linkColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';

    return (
        <div ref={containerRef} className="w-full h-[600px] border border-border rounded-lg overflow-hidden relative cursor-grab active:cursor-grabbing">
            <ForceGraph2D
                ref={fgRef}
                width={containerWidth}
                height={600}
                graphData={data}
                backgroundColor={bgColor}
                // Node styling
                nodeRelSize={4}
                nodeColor={node => (node as any).color}
                // Link styling
                linkColor={() => linkColor}
                linkWidth={(link) => {
                    // Stronger similarity = thicker link
                    const sim = (link as any).similarity;
                    return sim > 0.85 ? 3 : sim > 0.80 ? 1.5 : 0.5;
                }}
                nodeLabel={(node: any) => `
                    <div style="background: rgba(0,0,0,0.8); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; pointer-events: none;">
                        <strong>${escapeHtml(String(node.label || ''))}</strong><br/>
                        ${node.article_count} articles • Score: ${node.score?.toFixed(1) || 'N/A'}<br/>
                        <span style="color: ${node.color}">${escapeHtml(String(node.category || ''))}</span><br/>
                        <span style="opacity:0.8; font-size: 11px; white-space: pre-line;">${escapeHtml(buildScoreTooltip(node.score, node.scoring_details))}</span>
                    </div>
                `}
                // Labels on canvas
                nodeCanvasObject={(node: any, ctx, globalScale) => {
                    const label = node.label;
                    const fontSize = 12 / globalScale;
                    ctx.font = `${Math.max(fontSize, 4)}px Sans-Serif`;
                    const textWidth = ctx.measureText(label).width;
                    const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

                    // Draw node
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false);
                    ctx.fillStyle = node.color;
                    ctx.fill();

                    // Draw label if zoomed in enough or if node is large
                    if (globalScale > 1.2 || node.val > 5) {
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = textColor;
                        // Shorten long labels
                        const displayLabel = label.length > 30 ? label.substring(0, 30) + '...' : label;
                        ctx.fillText(displayLabel, node.x, node.y + node.val + 4);
                    }
                }}
            />
            {/* Legend / Overlay */}
            <div className="absolute top-4 right-4 bg-card/80 backdrop-blur border border-border rounded p-3 text-xs shadow-sm pointer-events-none">
                <div className="font-bold mb-2">Catégories</div>
                <div className="space-y-1">
                    {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                        <div key={cat} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                            <span>{cat}</span>
                        </div>
                    ))}
                </div>
                <div className="mt-3 pt-3 border-t border-border/50 text-muted">
                    Zoom: Molette (scroll)<br />
                    Pan: Drag map<br />
                    Highlight: Hover node
                </div>
            </div>
        </div>
    );
}
