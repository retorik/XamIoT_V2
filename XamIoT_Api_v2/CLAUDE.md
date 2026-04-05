# CLAUDE.md — XamIoT v2 (API + Admin UI)

## Repository GitHub

**Repo unique** : `retorik/XamIoT_V2`
- Tous les commits et push doivent cibler ce repository exclusivement.

## Déploiement VPS DEV

**VPS DEV** : `192.168.1.6` (réseau local)

### URLs DEV
- API : `https://apixam.holiceo.com`
- Backoffice / Admin UI : `https://xamiot.holiceo.com`

### Commande de déploiement
Toujours utiliser le script de déploiement — ne jamais déployer manuellement :

```bash
bash scripts/deploy.sh
```

Ce script :
1. **Rsync** les sources locales vers le VPS (API + Admin UI + Portail, sans node_modules, .env.*, dist/)
2. **Migrations DB** — applique les fichiers `db/0*.sql` non encore appliqués (idempotent via `schema_migrations`)
3. **Rebuild Docker** — API (`docker-compose.dev.yml`), Admin UI (`docker-compose.prod.yml`), Portail (`docker-compose.dev.yml`)
4. **Logs** — affiche les 30 dernières lignes de chaque container

### ⚠️ Règles de déploiement VPS — OBLIGATOIRE

**Problème récurrent** : le heredoc SSH du script peut échouer silencieusement après les migrations, sans lancer le rebuild Docker. Le container tourne alors sur l'ancien code.

**Procédure obligatoire après chaque déploiement** :
1. Lancer `bash scripts/deploy.sh` en **agent background** (pour ne pas bloquer les autres tâches)
2. Vérifier **explicitement** dans les logs que :
   - Le rebuild Docker a bien eu lieu (`Container xamiot-api Recreated / Started`)
   - Les nouveaux logs contiennent le comportement attendu (ex : `[AUTO-TYPE]`, nouveau message de log, etc.)
   - Aucune erreur `column does not exist` ou `ERR worker` n'apparaît
3. **Signaler le résultat** à l'utilisateur (succès ou échec) avec les preuves dans les logs

**Si le rebuild Docker n'apparaît pas dans la sortie du script**, le relancer manuellement :
```bash
ssh jeremy@192.168.1.6 "cd /home/jeremy/XamIoT_v2/api && docker compose -f docker-compose.dev.yml up -d --build"
ssh jeremy@192.168.1.6 "docker logs --tail 20 xamiot-api 2>&1"
```

**⚠️ Rebuild obligatoire du backoffice Admin UI** : le backoffice est une SPA compilée par Vite. Un simple rsync des sources ne suffit pas — il faut **toujours rebuilder le container** pour que les changements JSX/JS soient pris en compte :
```bash
ssh jeremy@192.168.1.6 "cd /home/jeremy/XamIoT_v2/admin && docker compose -f docker-compose.prod.yml up -d --build"
ssh jeremy@192.168.1.6 "docker logs --tail 5 xamiot-admin-ui 2>&1"
```
Vérifier que la ligne `✓ built in Xs` apparaît dans les logs Vite, sinon le code source n'a pas été recompilé.

**Si une migration ne s'applique pas via le script**, l'appliquer manuellement :
```bash
ssh jeremy@192.168.1.6 "docker exec -i postgres psql -U postgres -d xamiot_v2 < /home/jeremy/XamIoT_v2/api/db/0XX_nom.sql"
```

### Chemins VPS
- API : `/home/jeremy/XamIoT_v2/api/` → `xamiot-api`
- Admin UI : `/home/jeremy/XamIoT_v2/admin/` → `xamiot-admin-ui`
- Portail : `/home/jeremy/XamIoT_v2/portal/` → `xamiot-portal`

### Redémarrage / rebuild API — à faire soi-même

**Ne jamais demander à l'utilisateur de redémarrer ou rebuilder l'API. C'est à Claude de le faire.**

- **Toujours faire un rebuild complet** (restart seul ne recharge pas le code) :
```bash
ssh jeremy@192.168.1.6 "cd /home/jeremy/XamIoT_v2/api && docker compose -f docker-compose.dev.yml up -d --build 2>&1"
ssh jeremy@192.168.1.6 "docker logs --tail 5 xamiot-api 2>&1"
```

### Note
Le script `set -eo pipefail` est utilisé dans le heredoc SSH (pas `-u` pour éviter les faux positifs sur variables non définies).

---

## Architecture

Voir `README.md` pour l'architecture complète.

## Déploiement VPS PROD (ecrimoi.com)

### ⚠️ Fichier compose obligatoire sur ecrimoi.com

Sur ecrimoi.com, **toujours utiliser `docker-compose.ecrimoi.yml`** — PAS `docker-compose.prod.yml`.

`docker-compose.prod.yml` contient des labels Traefik DEV (`apixam.holiceo.com`) → l'API devient inaccessible sur PROD si ce fichier est utilisé.

```bash
# API PROD
rsync -avz --delete --exclude='.git/' --exclude='node_modules/' --exclude='.env.*' --exclude='dist/' \
  /Users/jeremyfauvet/Dev_Claude/XamIoT/XamIoT_Api_v2/ \
  jeremy@ecrimoi.com:/home/jeremy/XamIoT_v2/api/
ssh jeremy@ecrimoi.com "cd /home/jeremy/XamIoT_v2/api && docker compose -f docker-compose.ecrimoi.yml up -d --build"

# Admin UI PROD
rsync -avz --delete --exclude='.git/' --exclude='node_modules/' --exclude='.env.*' --exclude='dist/' \
  /Users/jeremyfauvet/Dev_Claude/XamIoT/xamiot-admin-suite_v2/ \
  jeremy@ecrimoi.com:/home/jeremy/XamIoT_v2/admin/
ssh jeremy@ecrimoi.com "cd /home/jeremy/XamIoT_v2/admin && docker compose -f docker-compose.ecrimoi.yml up -d --build"
```

### Postgres sur ecrimoi.com
- Container : `xamiot-postgres`
- Superuser : `xamiot` (pas `postgres`)
- Commande : `docker exec xamiot-postgres psql -U xamiot -d xamiot_v2 -c "..."`

---

## Variables d'environnement

Voir `.env.example` pour la liste des variables.

| Fichier | Environnement | Usage |
|---------|--------------|-------|
| `.env.local` | Dev local Mac | Non commité |
| `.env.dev` | VPS dev (holiceo.com) | Non commité, utilisé par `docker-compose.dev.yml` |
| `.env.prod` | VPS prod (ecrimoi.com) | Jamais commité, utilisé par `docker-compose.ecrimoi.yml` |
