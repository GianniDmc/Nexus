"use client";

import { useTheme } from "next-themes";
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    ZAxis,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts";
import type { GraphData } from "./ForceGraphView";

// Custom Tooltip for the map
function MapTooltip({ active, payload }: any) {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-card/95 backdrop-blur border border-border rounded-lg shadow-xl p-3 text-sm max-w-sm pointer-events-none z-50">
                <div className="flex items-center gap-2 mb-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: data.color }} />
                    <span className="font-bold text-xs uppercase tracking-wide opacity-80">{data.category}</span>
                </div>
                <div className="font-medium mb-2 leading-snug">{data.label}</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted mt-2 border-t border-border/50 pt-2">
                    <div>
                        <span className="opacity-70">Articles:</span> <span className="text-foreground font-mono">{data.article_count}</span>
                    </div>
                    <div>
                        <span className="opacity-70">Score:</span> <span className="text-foreground font-mono">{data.score?.toFixed(1) || 'N/A'}</span>
                    </div>
                </div>
            </div>
        );
    }
    return null;
}

export default function SemanticMap({ data }: { data: GraphData | null }) {
    const { theme } = useTheme();

    if (!data || data.nodes.length === 0) {
        return <div className="text-muted text-sm italic py-12 text-center">Aucune donnée cartographique disponible</div>;
    }

    const isDark = theme === "dark";

    // Format data for Recharts
    const chartData = data.nodes.map(node => ({
        ...node,
        x: node.normX, // 0-100
        y: node.normY, // 0-100
        z: node.article_count, // size
    }));

    return (
        <div className="w-full h-[600px] border border-border rounded-lg p-2 bg-card relative">
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <XAxis
                        type="number"
                        dataKey="x"
                        domain={[0, 100]}
                        hide // Hide axes for a "map" feel
                    />
                    <YAxis
                        type="number"
                        dataKey="y"
                        domain={[0, 100]}
                        hide
                    />
                    <ZAxis
                        type="number"
                        dataKey="z"
                        range={[50, 800]} // Bubble size range
                    />
                    <Tooltip cursor={{ strokeDasharray: '3 3', stroke: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)' }} content={<MapTooltip />} />

                    <Scatter
                        name="Clusters"
                        data={chartData}
                        fill="#8884d8"
                    >
                        {chartData.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.color}
                                stroke={isDark ? "var(--color-card)" : "#ffffff"}
                                strokeWidth={2}
                                style={{
                                    opacity: 0.8,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                }}
                                className="hover:opacity-100 hover:drop-shadow-lg"
                            />
                        ))}
                    </Scatter>
                </ScatterChart>
            </ResponsiveContainer>
            <div className="absolute top-4 left-4 bg-background/50 backdrop-blur border border-border rounded px-3 py-1.5 text-xs text-muted shadow-sm pointer-events-none">
                Projection 2D (Analyse en Composantes Principales)
            </div>
        </div>
    );
}
