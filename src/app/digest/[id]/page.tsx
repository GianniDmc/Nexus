import { createClient } from '@supabase/supabase-js';
import { ArrowLeft, Sparkles, Coffee, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function DigestPage({ params }: { params: { id: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Note: params est une promesse dans les versions récentes de Next.js
  const id = (await params).id;

  const { data: digest } = await supabase
    .from('digests')
    .select('*')
    .eq('id', id)
    .single();

  if (!digest) return notFound();

  const content = digest.content_json;

  return (
    <div className="min-h-screen bg-slate-900 text-white selection:bg-accent selection:text-primary transition-colors duration-300">
      <nav className="p-6">
        <Link href="/" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm font-medium">
          <ArrowLeft className="w-4 h-4" />
          Retour au flux
        </Link>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-12 md:py-24">
        <header className="mb-16 text-center">
          <div className="flex items-center justify-center gap-2 mb-6 text-accent">
            <Coffee className="w-6 h-6" />
            <span className="text-xs font-bold uppercase tracking-[0.3em]">Le Digest de Nexus</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-serif font-medium leading-tight mb-8">
            {digest.title}
          </h1>
          <p className="text-xl text-white/70 font-light leading-relaxed max-w-lg mx-auto italic">
            "{content.intro}"
          </p>
        </header>

        <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 md:p-12 backdrop-blur-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Sparkles className="w-32 h-32" />
          </div>

          <h2 className="text-sm font-bold uppercase tracking-widest text-accent mb-10 flex items-center gap-3">
            <span className="w-8 h-[1px] bg-accent" />
            L'Essentiel du Jour
          </h2>

          <div className="space-y-8">
            {content.essentials?.map((item: string, i: number) => (
              <div key={i} className="flex gap-6 group">
                <div className="flex-shrink-0 w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-xs font-bold text-accent group-hover:bg-accent group-hover:text-primary transition-all duration-300">
                  {i + 1}
                </div>
                <p className="text-lg text-white/90 leading-relaxed font-light pt-0.5 text-left">
                  {item}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-16 pt-10 border-t border-white/10 flex flex-col items-center">
            <CheckCircle2 className="w-8 h-8 text-accent mb-4 opacity-50" />
            <p className="text-white/40 text-xs tracking-widest uppercase">Vous êtes à jour.</p>
          </div>
        </div>

        <footer className="mt-20 text-center pb-12">
           <Link href="/" className="px-8 py-4 bg-accent text-primary font-bold rounded-2xl hover:bg-white transition-all shadow-xl shadow-accent/10">
            Retourner à la veille complète
          </Link>
        </footer>
      </main>
    </div>
  );
}
