#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# rpi-deploy.sh — Auto-déploiement Nexus sur Raspberry Pi
#
# Vérifie si de nouveaux commits sont disponibles sur origin/main.
# Si oui : pull, npm ci (si package-lock a changé), et log.
#
# Usage crontab (toutes les 5 min) :
#   */5 * * * * /chemin/vers/nexus/scripts/rpi-deploy.sh >> /var/log/nexus-deploy.log 2>&1
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCK_FILE="/tmp/nexus-deploy.lock"
BRANCH="main"

# ── Lock : empêcher les déploiements concurrents ─────────────────────
if [ -f "${LOCK_FILE}" ]; then
  lock_pid="$(cat "${LOCK_FILE}" 2>/dev/null || true)"
  if [ -n "${lock_pid}" ] && kill -0 "${lock_pid}" 2>/dev/null; then
    echo "[$(date -Iseconds)] Déploiement déjà en cours (PID ${lock_pid}). Abandon."
    exit 0
  else
    rm -f "${LOCK_FILE}"
  fi
fi

echo $$ > "${LOCK_FILE}"
trap 'rm -f "${LOCK_FILE}"' EXIT

cd "${PROJECT_DIR}"

# ── Fetch les derniers changements ───────────────────────────────────
git fetch origin "${BRANCH}" --quiet

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "origin/${BRANCH}")"

if [ "${LOCAL_SHA}" = "${REMOTE_SHA}" ]; then
  exit 0
fi

echo "[$(date -Iseconds)] Nouveaux commits détectés (${LOCAL_SHA:0:7} → ${REMOTE_SHA:0:7})"

# ── Vérifier si package-lock.json a changé ──────────────────────────
LOCK_CHANGED="$(git diff "${LOCAL_SHA}" "${REMOTE_SHA}" --name-only -- package-lock.json)"

# ── Pull ─────────────────────────────────────────────────────────────
git pull origin "${BRANCH}" --quiet

# ── npm ci si les dépendances ont changé ─────────────────────────────
if [ -n "${LOCK_CHANGED}" ]; then
  echo "[$(date -Iseconds)] package-lock.json modifié → npm ci"
  npm ci --quiet
else
  echo "[$(date -Iseconds)] Dépendances inchangées, skip npm ci"
fi

echo "[$(date -Iseconds)] Déploiement terminé (${REMOTE_SHA:0:7})"
