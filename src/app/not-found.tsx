import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
            <FileQuestion className="w-16 h-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Page introuvable</h2>
            <p className="text-muted-foreground mb-6">Désolé, cette page n'existe pas ou a été déplacée.</p>
            <Link
                href="/"
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
                Retour à l'accueil
            </Link>
        </div>
    );
}
