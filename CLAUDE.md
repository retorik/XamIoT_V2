# CLAUDE.md — XamIoT v2 (Monorepo)

## Structure du monorepo

| Dossier | Composant | Stack |
|---------|-----------|-------|
| `xamiot-admin-suite_v2/` | Back-office (Admin UI) | React + Vite |
| `XamIoT_Api_v2/` | API backend | Express.js |
| `XamIoT_IoS_v2/` | App iOS | Swift / SwiftUI |
| `XamIoT_Android_v2/` | App Android | Kotlin / Jetpack Compose |
| `ESP32-C3-Sensor_v2/` | Firmware capteur | PlatformIO / ESP32-C3 |
| `XamIoT_Portal_v2/` | Portail client (suivi uniquement) | Next.js |
| `XamIoT_Site_v2/` | Site web public + boutique + auth | Next.js |
| `Mosquitto_v2/` | Broker MQTT | Mosquitto |

**Repo GitHub** : `https://github.com/retorik/XamIoT_V2`

---

## URLs par environnement

> **REGLE ABSOLUE** : Ne jamais utiliser l'IP `192.168.1.6` dans le code applicatif. Elle est reservee exclusivement aux connexions SSH. Toujours utiliser les noms de domaine ci-dessous.

### Dev (VPS holiceo.com) — SEUL environnement actif

| Service | URL |
|---------|-----|
| **Backoffice (Admin UI)** | https://xamiot.holiceo.com |
| **API** | https://apixam.holiceo.com |
| **Portail client** | https://xamcli.holiceo.com |
| **Site web** | https://xamsite.holiceo.com |
| **MQTT** | mqtt.holiceo.com:8883 (TLS) |

### Production (VPS ecrimoi.com) — deployer en meme temps que DEV (depuis 2026-04-04)

| Service | URL |
|---------|-----|
| **Backoffice (Admin UI)** | https://admin.xamiot.com |
| **API** | https://api.xamiot.com |
| **Portail client** | https://portail.xamiot.com |
| **Site web** | https://xamiot.com |
| **MQTT** | mqtt.xamiot.com:8883 (TLS) |

> Depuis le 2026-04-04 : toujours deployer DEV **et** PROD simultanement.

---

## Deploiement

### DEV — Script obligatoire

```bash
bash scripts/deploy.sh
```

Ce script fait : rsync API + Admin UI + Portail + Site → migrations DB → rebuild tous les containers.

### PROD — Procedure manuelle par composant

⚠️ La prod a une **structure de dossiers differente** du dev. Ne pas supposer que les chemins sont identiques.

#### Admin UI (composant le plus souvent mis a jour)

```bash
# 1. Rsync
rsync -avz --delete --exclude='.git/' --exclude='node_modules/' --exclude='.env.*' --exclude='dist/' \
  /Users/jeremyfauvet/Dev_Claude/XamIoT/xamiot-admin-suite_v2/ \
  jeremy@ecrimoi.com:/home/jeremy/XamIoT_v2/admin/

# 2. Rebuild
ssh jeremy@ecrimoi.com "cd /home/jeremy/XamIoT_v2/admin && docker compose -f docker-compose.ecrimoi.yml build && docker compose -f docker-compose.ecrimoi.yml up -d"
```

### Chemins VPS DEV (192.168.1.6)

| Composant | Chemin VPS | Container | Docker Compose |
|-----------|-----------|-----------|----------------|
| API | `/home/jeremy/XamIoT_v2/api/` | `xamiot-api` | `docker-compose.dev.yml` |
| Admin UI | `/home/jeremy/XamIoT_v2/admin/` | `xamiot-admin-ui` | `docker-compose.prod.yml` |
| Portail client | `/home/jeremy/XamIoT_v2/portal/` | `xamiot-portal` | `docker-compose.dev.yml` |
| Site public | `/home/jeremy/XamIoT_v2/site/` | `xamiot-site` | `docker-compose.prod.yml` |

### Chemins VPS PROD (ecrimoi.com)

> ⚠️ **REGLE ABSOLUE** : Sur ecrimoi.com, toujours utiliser `docker-compose.ecrimoi.yml` — JAMAIS `docker-compose.prod.yml`.
> `docker-compose.prod.yml` contient des labels Traefik DEV (holiceo.com) → le composant devient inaccessible en PROD si ce fichier est utilise. Erreur deja faite 2 fois (API + Site).

| Composant | Chemin VPS | Container | Docker Compose PROD |
|-----------|-----------|-----------|---------------------|
| API | `/home/jeremy/XamIoT_v2/api/` | `xamiot-api` | `docker-compose.ecrimoi.yml` |
| Admin UI | `/home/jeremy/XamIoT_v2/admin/` | `xamiot-admin-ui` | `docker-compose.ecrimoi.yml` |
| Portail client | `/home/jeremy/XamIoT_v2/portal/` | `xamiot-portal` | `docker-compose.ecrimoi.yml` |
| Site public | `/home/jeremy/XamIoT_v2/site/` | `xamiot-site` | `docker-compose.ecrimoi.yml` |

### Postgres sur ecrimoi.com
- Container : `xamiot-postgres`, superuser : `xamiot` (pas `postgres`)
- `docker exec xamiot-postgres psql -U xamiot -d xamiot_v2 -c "..."`

### Variables d'environnement

| Environnement | Fichier env |
|---------------|------------|
| VPS Dev (holiceo.com) | `.env.dev` |
| VPS Prod (ecrimoi.com) | `.env.prod` |
| Local Mac | `.env.local` |

---

## Verification post-deploiement

```bash
# Containers actifs
ssh jeremy@192.168.1.6 "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep xamiot"

# Reponse HTTP
curl -sk https://xamiot.holiceo.com/ | head -3
curl -sk https://apixam.holiceo.com/health
```

---

## Tests

```bash
cd XamIoT_Api_v2 && npm test
```

Runner : `node --test` (Node.js natif). Fichiers : `src/__tests__/*.test.js`.

---

## Portail client — Internationalisation (i18n)

### Système de langue
- Cookie `lang` (valeurs : `fr`, `en`, `es`) — lu côté client via `useLang()` (`XamIoT_Portal_v2/lib/useLang.ts`)
- Changement de langue : `LangSelector` écrit le cookie **et** dispatch `window.dispatchEvent(new Event('langchange'))`
- Toutes les pages écoutent cet event via `useLang()` → mise à jour instantanée sans rechargement

### Pattern de traduction
```ts
const T = { fr: { title: '...' }, en: { title: '...' }, es: { title: '...' } }
const lang = useLang()
const t = T[lang]
const dateLocale = lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'fr-FR'
```

### LangSelector (`XamIoT_Portal_v2/components/LangSelector.tsx`)
Props disponibles :
- `dropUp?: boolean` (défaut `true`) — dropdown vers le haut (sidebar) ou vers le bas (login)
- `large?: boolean` (défaut `false`) — version grande pour la page de login

### Pages traduites (FR/EN/ES)
- `/login` — page d'authentification (labels, messages d'erreur, reset password)
- `/devices` — liste des appareils
- `/devices/[id]` — détail appareil (onglets, métriques, règles, config)
- `/notifications` — gestion alertes
- `/alertes` — historique des alertes
- `/support` — tickets support (liste, création, détail, thread)
- `/commandes` — suivi commandes (stepper, timeline, tracking)
- `/adresses` — gestion adresses (formulaire, types, pays)

---

## Back-office CMS — Structure API pages

L'API CMS pages utilise un tableau `translations[]`, pas des champs plats :
- **GET** `/admin/cms/pages` → retourne uniquement les titres (pas le contenu)
- **GET** `/admin/cms/pages/:id` → retourne `{ translations: [{lang, title, content, content_after, seo_title, seo_description, menu_label}] }`
- **POST** `/admin/cms/pages` → attend `{ slug, status, translations: [...] }`

⚠️ Pour dupliquer une page, toujours fetcher le détail par ID avant de poster — la liste ne contient pas le contenu.

---

## Architecture boutique

- **Auth** (login/signup/verify-email) : sur le site public (`/compte`), pas le portail
- **Panier** : localStorage côté client (site public)
- **Checkout** : tunnel sur le site public (`/checkout`) — adresses + calcul frais + Stripe
- **Portail client** : suivi commandes uniquement, PAS de boutique/panier
- **Pays** : table `countries` (249 pays ISO 3166-1), config livraison/taxes/douanes par pays
- **Adresses** : table `user_addresses`, multi-adresses (livraison + facturation) par utilisateur
