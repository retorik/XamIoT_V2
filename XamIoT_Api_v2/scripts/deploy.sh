#!/usr/bin/env bash
# scripts/deploy.sh
# Déploie XamIoT v2 (API + Admin UI) sur le VPS 192.168.1.6
# Usage: ./scripts/deploy.sh
# Pré-requis: accès SSH sans mot de passe configuré pour jeremy@192.168.1.6

set -euo pipefail

# ─────────────────────────────────────────────
# Variables
# ─────────────────────────────────────────────
VPS_HOST="192.168.1.6"
VPS_USER="jeremy"
SSH_TARGET="${VPS_USER}@${VPS_HOST}"

LOCAL_API_DIR="/Users/jeremyfauvet/Dev_Claude/XamIoT/XamIoT_Api_v2/"
LOCAL_ADMIN_DIR="/Users/jeremyfauvet/Dev_Claude/XamIoT/xamiot-admin-suite_v2/"
LOCAL_SITE_DIR="/Users/jeremyfauvet/Dev_Claude/XamIoT/XamIoT_Site_v2/"

VPS_API_DIR="/home/jeremy/XamIoT_v2/api/"
VPS_ADMIN_DIR="/home/jeremy/XamIoT_v2/admin/"
VPS_SITE_DIR="/home/jeremy/XamIoT_v2/site/"

DB_CONTAINER="postgres"
DB_NAME="xamiot_v2"
DB_USER="xamiot_v2_user"
DB_ADMIN_USER="postgres"   # owner des tables — requis pour les ALTER TABLE

# ─────────────────────────────────────────────
# Fonctions utilitaires
# ─────────────────────────────────────────────
log_step() {
  echo ""
  echo "══════════════════════════════════════════════════════"
  echo "  $1"
  echo "══════════════════════════════════════════════════════"
}

log_info() {
  echo "  → $1"
}

log_success() {
  echo "  ✓ $1"
}

# ─────────────────────────────────────────────
# Étape 1 : Rsync API source → VPS
# ─────────────────────────────────────────────
log_step "1/5  Synchronisation API source → VPS"
log_info "Source : ${LOCAL_API_DIR}"
log_info "Dest   : ${SSH_TARGET}:${VPS_API_DIR}"

rsync -avz --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.env.*' \
  --exclude='firebase-service-account.json' \
  --exclude='*.log' \
  "${LOCAL_API_DIR}" "${SSH_TARGET}:${VPS_API_DIR}"

log_success "API synchronisée."

# ─────────────────────────────────────────────
# Étape 2 : Rsync Admin UI source → VPS
# ─────────────────────────────────────────────
log_step "2/5  Synchronisation Admin UI source → VPS"
log_info "Source : ${LOCAL_ADMIN_DIR}"
log_info "Dest   : ${SSH_TARGET}:${VPS_ADMIN_DIR}"

rsync -avz --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.env.*' \
  --exclude='dist/' \
  --exclude='build/' \
  --exclude='*.log' \
  "${LOCAL_ADMIN_DIR}" "${SSH_TARGET}:${VPS_ADMIN_DIR}"

log_success "Admin UI synchronisée."

# ─────────────────────────────────────────────
# Étape 2b : Rsync Site public source → VPS
# ─────────────────────────────────────────────
log_step "2b/5  Synchronisation Site public source → VPS"
log_info "Source : ${LOCAL_SITE_DIR}"
log_info "Dest   : ${SSH_TARGET}:${VPS_SITE_DIR}"

rsync -avz --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.env.*' \
  --exclude='.next/' \
  --exclude='*.log' \
  "${LOCAL_SITE_DIR}" "${SSH_TARGET}:${VPS_SITE_DIR}"

log_success "Site public synchronisé."

# ─────────────────────────────────────────────
# Étape 3 : Opérations sur le VPS (migrations + rebuild containers)
# ─────────────────────────────────────────────
log_step "3/5  Opérations sur le VPS"

ssh "${SSH_TARGET}" bash <<ENDSSH
set -eo pipefail

# ── Fonctions locales VPS ──
log_info()    { echo "  → \$1"; }
log_success() { echo "  ✓ \$1"; }

# ── 3a : Migrations DB ──
echo ""
echo "  --- Migrations DB ---"

# Créer la table schema_migrations si elle n'existe pas encore (owner: xamiot_v2_user)
docker exec ${DB_CONTAINER} psql -U ${DB_ADMIN_USER} -d ${DB_NAME} -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(255) PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
GRANT ALL ON schema_migrations TO ${DB_USER};
" > /dev/null 2>&1

log_info "Table schema_migrations prête."

# Appliquer chaque migration numérotée (0XX_*.sql) non encore appliquée
# DDL (ALTER TABLE...) exécuté en tant que DB_ADMIN_USER (postgres), owner des tables
MIGRATIONS_DIR="${VPS_API_DIR}db"
APPLIED=0
SKIPPED=0

for migration_file in "\${MIGRATIONS_DIR}"/0*.sql; do
  [ -f "\${migration_file}" ] || continue
  version=\$(basename "\${migration_file}" .sql)

  already_applied=\$(docker exec ${DB_CONTAINER} psql -U ${DB_ADMIN_USER} -d ${DB_NAME} -tAc "
    SELECT COUNT(*) FROM schema_migrations WHERE version = '\${version}';
  " 2>/dev/null || echo "0")

  if [ "\${already_applied}" = "0" ]; then
    log_info "Application de \${version}..."
    docker exec -i ${DB_CONTAINER} psql -U ${DB_ADMIN_USER} -d ${DB_NAME} < "\${migration_file}"
    docker exec ${DB_CONTAINER} psql -U ${DB_ADMIN_USER} -d ${DB_NAME} -c "
      INSERT INTO schema_migrations (version) VALUES ('\${version}');
    " > /dev/null
    log_success "\${version} appliquée."
    APPLIED=\$((APPLIED + 1))
  else
    SKIPPED=\$((SKIPPED + 1))
  fi
done

echo "  Migrations : \${APPLIED} appliquée(s), \${SKIPPED} déjà en place."

# ── 3b : Rebuild + redémarrage container API ──
echo ""
echo "  --- Container API (xamiot-api) ---"
log_info "Rebuild et redémarrage..."
cd ${VPS_API_DIR}
docker compose -f docker-compose.prod.yml up -d --build
log_success "Container API redémarré."

# ── 3c : Rebuild + redémarrage container Admin UI ──
# --no-cache obligatoire : Vite SPA — Docker ne détecte pas les changements JSX/JS
# sans invalider le cache explicitement. Sans ça, le container tourne sur l'ancien code.
echo ""
echo "  --- Container Admin UI (xamiot-admin-ui) ---"
log_info "Rebuild forcé (--no-cache) et redémarrage..."
cd ${VPS_ADMIN_DIR}
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
log_success "Container Admin UI redémarré."

# ── 3d : Rebuild + redémarrage container Site public ──
echo ""
echo "  --- Container Site public (xamiot-site) ---"
log_info "Rebuild et redémarrage..."
cd ${VPS_SITE_DIR}
docker compose -f docker-compose.prod.yml up -d --build
log_success "Container Site public redémarré."

ENDSSH

log_success "Opérations VPS terminées."

# ─────────────────────────────────────────────
# Étape 4 : Logs de démarrage
# ─────────────────────────────────────────────
log_step "4/5  Logs de démarrage (30 dernières lignes)"

echo ""
echo "  --- Logs API (xamiot-api) ---"
ssh "${SSH_TARGET}" "docker logs --tail 30 xamiot-api 2>&1" || true

echo ""
echo "  --- Logs Admin UI (xamiot-admin-ui) ---"
ssh "${SSH_TARGET}" "docker logs --tail 30 xamiot-admin-ui 2>&1" || true

echo ""
echo "  --- Logs Site public (xamiot-site) ---"
ssh "${SSH_TARGET}" "docker logs --tail 20 xamiot-site 2>&1" || true

# ─────────────────────────────────────────────
# Étape 5 : Rapport de déploiement
# ─────────────────────────────────────────────
log_step "5/5  Vérification post-déploiement"

echo ""
echo "  Containers actifs :"
ssh "${SSH_TARGET}" "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep xamiot" || true

echo ""
echo "══════════════════════════════════════════════════════"
echo "  Déploiement XamIoT v2 terminé avec succès."
echo "══════════════════════════════════════════════════════"
echo ""
