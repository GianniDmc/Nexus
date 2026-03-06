# Déploiement Nexus sur Raspberry Pi 3B+

## Prérequis

- Raspberry Pi 3B+ sous Raspberry Pi OS (64-bit recommandé)
- Node.js 20+ (via [fnm](https://github.com/Schniz/fnm) ou [nvm](https://github.com/nvm-sh/nvm))
- Git

### Installer Node.js

```bash
curl -fsSL https://fnm.vercel.app/install | bash
source ~/.bashrc
fnm install 20
fnm default 20
```

## Installation

```bash
git clone <url-du-repo> ~/nexus
cd ~/nexus
npm ci
```

## Configuration

Créer le fichier `.env.local` à la racine du projet :

```bash
cp .env.local.example .env.local  # si disponible, sinon créer manuellement
```

Variables requises dans `.env.local` :

```env
# Supabase (obligatoire)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# AI — au moins une clé par tier
# Embeddings (VECTOR tier)
GOOGLE_API_KEY=AIza...
# ou
PAID_GOOGLE_API_KEY=AIza...

# Scoring (FAST tier) — au moins une :
PAID_OPENAI_API_KEY=sk-...
PAID_ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...

# Rewriting (SMART tier) — au moins une :
# (mêmes clés que ci-dessus, le système choisit automatiquement)
```

## Crontab

```bash
crontab -e
```

Ajouter les lignes suivantes :

```cron
# Auto-déploiement (git pull toutes les 5 min)
*/5 * * * * /home/pi/nexus/scripts/rpi-deploy.sh >> /var/log/nexus-deploy.log 2>&1

# Pipeline éditorial (toutes les 30 min)
*/30 * * * * /home/pi/nexus/scripts/rpi-pipeline.sh >> /var/log/nexus-pipeline.log 2>&1
```

> Adapter le chemin `/home/pi/nexus` selon l'emplacement réel du projet.

### Créer les fichiers de log

```bash
sudo touch /var/log/nexus-pipeline.log /var/log/nexus-deploy.log
sudo chown $USER:$USER /var/log/nexus-pipeline.log /var/log/nexus-deploy.log
```

## Rotation des logs

Créer `/etc/logrotate.d/nexus` :

```
/var/log/nexus-pipeline.log /var/log/nexus-deploy.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
}
```

## Vérification

Lancer manuellement pour tester :

```bash
cd ~/nexus
bash scripts/rpi-pipeline.sh
```

Vérifier les logs :

```bash
tail -f /var/log/nexus-pipeline.log
```

## Profil d'exécution

Le script utilise le profil `rpi` qui est optimisé pour les contraintes du Pi :
- Concurrence réduite (4 sources au lieu de 14)
- Batch plus petits (8 au lieu de 24)
- Délais LLM plus longs pour éviter la surcharge CPU/RAM
- Pas de limite de temps stricte (1h max de sécurité)

## Désactiver GitHub Actions

Une fois le Pi opérationnel, désactiver le workflow GHA :

1. GitHub → Settings → Actions → cocher "Disable Actions for this repository"
2. Ou commenter le schedule dans `.github/workflows/cron-process.yml`
