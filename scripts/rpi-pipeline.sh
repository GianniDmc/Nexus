#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# rpi-pipeline.sh — Orchestration du pipeline Nexus sur Raspberry Pi
#
# Reproduit la logique du workflow GHA cron-process.yml (mode ingest_then_process)
# Exécute : ingest → embedding → clustering → scoring → rewriting
#
# Usage crontab (toutes les 30 min) :
#   */30 * * * * /chemin/vers/nexus/scripts/rpi-pipeline.sh >> /var/log/nexus-pipeline.log 2>&1
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCK_FILE="/tmp/nexus-pipeline.lock"
PROFILE="rpi"

# ── Lock : empêcher les exécutions concurrentes ──────────────────────
if [ -f "${LOCK_FILE}" ]; then
  lock_pid="$(cat "${LOCK_FILE}" 2>/dev/null || true)"
  if [ -n "${lock_pid}" ] && kill -0 "${lock_pid}" 2>/dev/null; then
    echo "[$(date -Iseconds)] Pipeline déjà en cours (PID ${lock_pid}). Abandon."
    exit 0
  else
    echo "[$(date -Iseconds)] Lock périmé trouvé (PID ${lock_pid}). Nettoyage."
    rm -f "${LOCK_FILE}"
  fi
fi

echo $$ > "${LOCK_FILE}"
trap 'rm -f "${LOCK_FILE}"' EXIT

echo "================================================================"
echo "[$(date -Iseconds)] Démarrage pipeline Nexus (profil: ${PROFILE})"
echo "================================================================"

cd "${PROJECT_DIR}"

# ── Helper : extraire le JSON __CRON_JSON__ de la sortie ─────────────
extract_json() {
  local output="$1"
  local json_line
  json_line="$(printf '%s\n' "${output}" | sed -n 's/.*__CRON_JSON__//p' | tail -n 1)"
  if [ -z "${json_line}" ]; then
    json_line="$(printf '%s\n' "${output}" | sed -n '/^[[:space:]]*{.*}[[:space:]]*$/p' | tail -n 1)"
  fi
  printf '%s' "${json_line}"
}

# ── Helper : extraire une valeur numérique du JSON ───────────────────
json_num() {
  local raw="$1" path="$2" fallback="${3:-0}"
  node -e "
    const raw = process.argv[1] || '';
    const path = process.argv[2];
    let value = ${fallback};
    try {
      const data = JSON.parse(raw);
      const parts = path.split('.');
      let current = data;
      for (const p of parts) { current = current?.[p]; }
      const n = Number(current ?? ${fallback});
      value = Number.isFinite(n) ? n : ${fallback};
    } catch {}
    process.stdout.write(String(Math.max(0, Math.trunc(value))));
  " "${raw}" "${path}"
}

# ── Helper : extraire une valeur booléenne du JSON ───────────────────
json_bool() {
  local raw="$1" path="$2"
  node -e "
    const raw = process.argv[1] || '';
    const path = process.argv[2];
    let value = false;
    try {
      const data = JSON.parse(raw);
      const parts = path.split('.');
      let current = data;
      for (const p of parts) { current = current?.[p]; }
      value = !!current;
    } catch {}
    process.stdout.write(value ? 'true' : 'false');
  " "${raw}" "${path}"
}

# ── Étape 1 : Ingestion ─────────────────────────────────────────────
echo ""
echo "── Ingestion ──────────────────────────────────────────────────"
ingest_output="$(EXECUTION_PROFILE="${PROFILE}" npx tsx scripts/cron-ingest.ts 2>&1)" || true
echo "${ingest_output}"

ingest_json="$(extract_json "${ingest_output}")"
articles_ingested="$(json_num "${ingest_json}" "articlesIngested" "0")"
echo "Articles ingérés : ${articles_ingested}"

# ── Décision : faut-il processer ? ───────────────────────────────────
if [ "${articles_ingested}" -eq 0 ]; then
  echo ""
  echo "── Vérification backlog ────────────────────────────────────────"
  precheck_output="$(npx tsx scripts/cron-should-process.ts 2>&1)" || true
  precheck_json="$(extract_json "${precheck_output}")"
  should_process="$(json_bool "${precheck_json}" "shouldProcess")"

  if [ "${should_process}" != "true" ]; then
    echo "Aucun article ingéré et pas de backlog. Rien à faire."
    echo "[$(date -Iseconds)] Pipeline terminé (rien à processer)."
    exit 0
  fi
  echo "Backlog détecté, lancement du processing."
fi

# ── Étape 2 : Processing séquentiel (embedding → clustering → scoring → rewriting)
echo ""
GLOBAL_START=$(date +%s)
MAX_GLOBAL_SEC=3600  # 1h max de sécurité

for step in embedding clustering scoring rewriting; do
  now=$(date +%s)
  elapsed=$((now - GLOBAL_START))
  remaining=$((MAX_GLOBAL_SEC - elapsed))

  if [ "${remaining}" -le 0 ]; then
    echo "Budget temps global atteint (${MAX_GLOBAL_SEC}s). Arrêt."
    break
  fi

  remaining_ms=$((remaining * 1000))
  echo "── Processing : ${step} (temps restant : ${remaining}s) ────────"

  step_output="$(QUIET_LOGS=1 EXECUTION_PROFILE="${PROFILE}" PROCESS_STEP="${step}" MAX_EXECUTION_MS="${remaining_ms}" npx tsx scripts/cron-process.ts 2>&1)" || true
  echo "${step_output}"

  step_json="$(extract_json "${step_output}")"

  # Extraire les métriques clés
  stat_key="${step}"
  case "${step}" in
    embedding)  stat_key="embeddings" ;;
    clustering) stat_key="clustered" ;;
    scoring)    stat_key="scored" ;;
    rewriting)  stat_key="rewritten" ;;
  esac

  processed="$(json_num "${step_json}" "processed.${stat_key}" "0")"
  success="$(json_bool "${step_json}" "success")"
  retry_after="$(json_num "${step_json}" "retryAfter" "0")"
  time_budget_reached="$(json_bool "${step_json}" "timeBudgetReached")"
  elapsed_ms="$(json_num "${step_json}" "elapsedMs" "0")"

  echo "  → ${step}: processed=${processed} success=${success} retryAfter=${retry_after}s budgetReached=${time_budget_reached} elapsed=$((elapsed_ms / 1000))s"

  # Rate limit → arrêter, reprendre au prochain cron
  if [ "${success}" != "true" ] && [ "${retry_after}" -gt 0 ]; then
    echo "Rate limit détecté (retryAfter=${retry_after}s). Arrêt, reprise au prochain cron."
    break
  fi

  # Budget temps atteint → pas la peine de continuer
  if [ "${time_budget_reached}" = "true" ]; then
    echo "Budget temps atteint sur l'étape ${step}. Arrêt."
    break
  fi
done

echo ""
total_elapsed=$(( $(date +%s) - GLOBAL_START ))
echo "================================================================"
echo "[$(date -Iseconds)] Pipeline terminé en ${total_elapsed}s."
echo "================================================================"
