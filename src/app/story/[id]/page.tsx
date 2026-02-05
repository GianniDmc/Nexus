import { createClient } from '@supabase/supabase-js';
import { ArrowLeft, ExternalLink, Zap, Sparkles, Share2 } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Metadata } from 'next';

type Props = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id } = await params;
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const { data: cluster } = await supabase
        .from('clusters')
        .select(`*, summaries (*)`)
        .eq('id', id)
        .single();

    if (!cluster || !cluster.summaries) {
        return {
            title: 'Nexus Curation',
            description: 'Veille technologique intelligente par Nexus.'
        };
    }

    const summary = Array.isArray(cluster.summaries) ? cluster.summaries[0] : cluster.summaries;
    const title = summary.title || cluster.label;
    const description = summary.content_tldr || "Découvrez cette synthèse sur Nexus Curation.";
    const imageUrl = summary.image_url || cluster.image_url || null;

    return {
        title: `${title} | Nexus`,
        description: description,
        openGraph: {
            title: title,
            description: description,
            url: `/story/${id}`,
            type: 'article',
            images: imageUrl ? [{ url: imageUrl }] : [],
            siteName: 'Nexus Curation'
        },
        twitter: {
            card: 'summary_large_image',
            title: title,
            description: description,
            images: imageUrl ? [imageUrl] : [],
        }
    };
}

export default async function StoryPage({ params }: Props) {
    const { id } = await params;
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Fetch cluster with its summary and source articles
    const { data: cluster } = await supabase
        .from('clusters')
        .select(`
      *,
      summaries (*),
      articles:articles!articles_cluster_id_fkey (id, title, source_name, source_url, published_at)
    `)
        .eq('id', id)
        .eq('is_published', true)
        .single();

    if (!cluster || !cluster.summaries) return notFound();

    const summary = Array.isArray(cluster.summaries) ? cluster.summaries[0] : cluster.summaries;
    const sources = cluster.articles || [];

    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-accent/30">
            <nav className="sticky top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border/40">
                <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 text-muted hover:text-primary transition-colors text-[11px] font-bold uppercase tracking-widest">
                        <ArrowLeft className="w-4 h-4" /> Retour
                    </Link>
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Nexus Synthesis</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    </div>
                </div>
            </nav>

            <main className="max-w-2xl mx-auto px-6 pt-12 pb-40">
                <header className="mb-20">
                    <div className="flex items-center gap-3 mb-8">
                        <span className="text-accent text-[10px] font-bold uppercase tracking-[0.2em]">
                            {cluster.category || 'Général'}
                        </span>
                        <span className="text-muted text-[10px]">•</span>
                        <span className="text-muted text-[10px] font-bold uppercase tracking-[0.2em]">
                            {new Date(cluster.published_on || cluster.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                        {sources.length > 1 && (
                            <>
                                <span className="text-muted text-[10px]">•</span>
                                <span className="text-accent/80 text-[10px] font-bold uppercase tracking-[0.2em]">
                                    {sources.length} sources
                                </span>
                            </>
                        )}
                    </div>

                    <h1 className="text-4xl md:text-6xl font-serif font-medium leading-[1.1] text-primary mb-12">
                        {summary.title || cluster.label}
                    </h1>

                    <p className="text-xl md:text-2xl font-serif text-muted leading-relaxed italic border-l-2 border-accent/30 pl-8 py-2">
                        {summary.content_tldr || "Synthèse en cours..."}
                    </p>
                </header>

                <article className="prose prose-slate prose-lg max-w-none prose-serif dark:prose-invert">
                    <div className="space-y-12 text-primary/90">
                        <div className="font-serif text-xl leading-[1.8] whitespace-pre-wrap first-letter:text-5xl first-letter:font-bold first-letter:mr-3 first-letter:float-left">
                            {summary.content_full}
                        </div>

                        {summary.content_analysis && (
                            <div className="mt-20 p-10 bg-card border border-border rounded-[2rem] shadow-sm">
                                <div className="flex items-center gap-3 mb-6 text-accent">
                                    <Zap className="w-5 h-5 fill-accent" />
                                    <h3 className="text-xs font-bold uppercase tracking-[0.2em]">L'Analyse Stratégique</h3>
                                </div>
                                <p className="text-xl leading-relaxed m-0 font-serif italic text-primary">{summary.content_analysis}</p>
                            </div>
                        )}
                    </div>
                </article>

                {/* Sources Section */}
                {sources.length > 0 && (
                    <footer className="mt-32 pt-12 border-t border-border/40">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted mb-8 text-center">
                            Sources consultées ({sources.length})
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {sources.map((article: any) => (
                                <a
                                    key={article.id}
                                    href={article.source_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group block bg-card/40 hover:bg-secondary/30 p-4 rounded-xl border border-border/40 hover:border-accent/40 transition-all"
                                >
                                    <h4 className="text-sm font-medium text-foreground/90 group-hover:text-primary leading-snug mb-2 line-clamp-2">
                                        {article.title}
                                    </h4>
                                    <div className="flex items-center justify-between mt-3">
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-accent">
                                            {article.source_name}
                                        </span>
                                        <ExternalLink className="w-3 h-3 text-muted-foreground/40 group-hover:text-accent transition-colors" />
                                    </div>
                                </a>
                            ))}
                        </div>

                        <div className="mt-16 flex flex-col items-center gap-8">
                            <div className="w-px h-12 bg-border/40" />
                            <Link href="/" className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted hover:text-accent transition-colors">
                                Nexus Curation
                            </Link>
                        </div>
                    </footer>
                )}
            </main>
        </div>
    );
}
