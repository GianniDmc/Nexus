"use client";

import { useState, useEffect } from "react";
import { Loader2, AlertCircle, Map, Network } from "lucide-react";
import dynamic from "next/dynamic";
import type { GraphData } from "./ForceGraphView";
import SemanticMap from "./SemanticMap";

// Dynamic import for ForceGraph since it relies on window/canvas (no SSR)
const ForceGraphView = dynamic(() => import("./ForceGraphView"), {
    ssr: false,
    loading: () => (
        <div className="w-full h-[600px] border border-border rounded-lg bg-muted/10 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
    )
});

type ViewMode = '2d' | 'network';

export default function ClusterMapTab() {
    const [data, setData] = useState<GraphData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('2d');

    useEffect(() => {
        let isMounted = true;

        async function fetchMapData() {
            try {
                setIsLoading(true);
                setError(null);

                const response = await fetch('/api/admin/cluster-map');
                if (!response.ok) {
                    throw new Error(`Erreur réseau: ${response.status}`);
                }

                const result = await response.json();

                if (result.error) {
                    throw new Error(result.error);
                }

                if (isMounted) {
                    setData(result);
                }
            } catch (err: any) {
                if (isMounted) {
                    setError(err.message || "Impossible de charger la cartographie.");
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        fetchMapData();
        return () => { isMounted = false; };
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        Cartographie des Sujets
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Visualisation sémantique des 150 clusters les plus récents en 2D ou en réseau.
                    </p>
                </div>

                {data && !isLoading && (
                    <div className="flex bg-muted p-1 rounded-lg">
                        <button
                            onClick={() => setViewMode('2d')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === '2d'
                                ? 'bg-background shadow-sm text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <Map className="h-4 w-4" />
                            Carte Sémantique (PCA)
                        </button>
                        <button
                            onClick={() => setViewMode('network')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'network'
                                ? 'bg-background shadow-sm text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <Network className="h-4 w-4" />
                            Réseau de Similarité
                        </button>
                    </div>
                )}
            </div>

            {error && (
                <div className="bg-destructive/15 text-destructive border border-destructive/20 p-4 rounded-lg flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <div className="text-sm">{error}</div>
                </div>
            )}

            {isLoading ? (
                <div className="w-full h-[600px] border border-border rounded-lg bg-card flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <div className="text-sm text-muted-foreground font-medium animate-pulse">
                        Calcul de la projection PCA et des relations sémantiques...
                    </div>
                </div>
            ) : (
                <div className="animate-in fade-in duration-500">
                    {viewMode === '2d' ? (
                        <SemanticMap data={data} />
                    ) : (
                        <ForceGraphView data={data} />
                    )}
                </div>
            )}

            {!isLoading && data && (
                <div className="text-xs text-muted-foreground text-center">
                    {data.nodes.length} clusters affichés • {data.links.length} liaisons de similarité forte détectées
                </div>
            )}
        </div>
    );
}
