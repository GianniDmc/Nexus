import { createClient } from '@supabase/supabase-js';
import { ArrowLeft, ExternalLink, Calendar, Zap, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: article } = await supabase.from('articles').select('*').eq('id', id).single();
  if (!article) return notFound();

  const summary = article.summary_short ? JSON.parse(article.summary_short) : null;

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-accent/30">
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-muted hover:text-primary transition-colors text-[11px] font-bold uppercase tracking-widest">
            <ArrowLeft className="w-4 h-4" /> Retour
          </Link>
          <div className="flex items-center gap-3">
             <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Nexus Editorial</span>
             <div className={`w-1.5 h-1.5 rounded-full ${summary?.isFullSynthesis ? 'bg-accent animate-pulse' : 'bg-muted'}`} />
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 pt-40 pb-40">
        <header className="mb-20">
          <div className="flex items-center gap-3 mb-8">
            <span className="text-accent text-[10px] font-bold uppercase tracking-[0.2em]">
              {article.category || 'Stratégie'}
            </span>
            <span className="text-muted text-[10px]">•</span>
            <span className="text-muted text-[10px] font-bold uppercase tracking-[0.2em]">
              {new Date(article.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>

          <h1 className="text-4xl md:text-6xl font-serif font-medium leading-[1.1] text-primary mb-12">
            {article.title}
          </h1>
          
          <p className="text-xl md:text-2xl font-serif text-muted leading-relaxed italic border-l-2 border-accent/30 pl-8 py-2">
            {summary?.tldr || "Analyse en cours de rédaction..."}
          </p>
        </header>

        <article className="prose prose-slate prose-lg max-w-none prose-serif dark:prose-invert">
          {summary?.isFullSynthesis ? (
            <div className="space-y-12 text-primary/90">
               <div className="font-serif text-xl leading-[1.8] whitespace-pre-wrap first-letter:text-5xl first-letter:font-bold first-letter:mr-3 first-letter:float-left">
                  {summary.full}
               </div>
               
               <div className="mt-20 p-10 bg-card border border-border rounded-[2rem] shadow-sm">
                  <div className="flex items-center gap-3 mb-6 text-accent">
                     <Zap className="w-5 h-5 fill-accent" />
                     <h3 className="text-xs font-bold uppercase tracking-[0.2em]">L'Analyse Stratégique</h3>
                  </div>
                  <p className="text-xl leading-relaxed m-0 font-serif italic text-primary">{summary.analysis}</p>
               </div>
            </div>
          ) : (
            <div className="text-primary/90 leading-[1.8] whitespace-pre-wrap font-serif text-xl">
               {article.content?.replace(/<[^>]*>/g, '') || "Contenu original en attente d'analyse."}
            </div>
          )}
        </article>
        
        <footer className="mt-32 pt-12 border-t border-border/40">
           <div className="flex flex-col items-center gap-8">
              <div className="text-center">
                 <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted mb-4">Sources consultées</p>
                 <a href={article.source_url} target="_blank" className="text-sm text-primary border-b border-accent/30 pb-1 hover:text-accent transition-colors">
                    {article.source_name} <ExternalLink className="inline w-3 h-3 ml-1" />
                 </a>
              </div>
              <div className="w-px h-12 bg-border/40" />
              <Link href="/" className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted hover:text-accent transition-colors">
                Nexus Intelligence
              </Link>
           </div>
        </footer>
      </main>
    </div>
  );
}
