# Traefik Integration — XamIoT V2 sur ecrimoi.com
> Rédigé le 2026-04-04

---

## 1. Configuration Traefik existante (référence)

| Paramètre | Valeur |
|-----------|--------|
| Image | `traefik:v3.6.7` |
| Entrypoints | `web:80`, `websecure:443`, `mqtts:8883` |
| Certresolver | `le` (TLS-ALPN-01, Let's Encrypt) |
| Réseau Docker | `proxy` (external) |
| Dashboard | `127.0.0.1:8080` (non exposé) |

### Labels Traefik V1 en place

| Service V1 | Domaine | Router | Entrypoint |
|------------|---------|--------|------------|
| API V1 | `api.xamiot.com` | `api-xamiot` | `websecure` |
| Admin UI V1 | `admin.xamiot.com` | `xamiot-admin-ui` | `websecure` |
| Mosquitto V1 | `mqtt.xamiot.com` | `mqtt-xamiot` (TCP) | `mqtts` |

---

## 2. Labels Traefik V2 — Nouveaux services

### 2.1 API V2 — `api.xamiot.com`

```yaml
labels:
  - traefik.enable=true
  - traefik.docker.network=proxy
  - traefik.http.routers.xamiot-api-v2.rule=Host(`api.xamiot.com`)
  - traefik.http.routers.xamiot-api-v2.entrypoints=websecure
  - traefik.http.routers.xamiot-api-v2.tls.certresolver=le
  - traefik.http.services.xamiot-api-v2.loadbalancer.server.port=3000
```

### 2.2 Admin UI V2 — `admin.xamiot.com`

```yaml
labels:
  - traefik.enable=true
  - traefik.docker.network=proxy
  - traefik.http.routers.xamiot-admin-v2.rule=Host(`admin.xamiot.com`)
  - traefik.http.routers.xamiot-admin-v2.entrypoints=websecure
  - traefik.http.routers.xamiot-admin-v2.tls.certresolver=le
  - traefik.http.services.xamiot-admin-v2.loadbalancer.server.port=80
```

### 2.3 Portal client V2 — `portail.xamiot.com` (nouveau)

```yaml
labels:
  - traefik.enable=true
  - traefik.docker.network=proxy
  - traefik.http.routers.xamiot-portal-v2.rule=Host(`portail.xamiot.com`)
  - traefik.http.routers.xamiot-portal-v2.entrypoints=websecure
  - traefik.http.routers.xamiot-portal-v2.tls.certresolver=le
  - traefik.http.services.xamiot-portal-v2.loadbalancer.server.port=3002
```

### 2.4 Site public V2 — `xamiot.com` + `www.xamiot.com` (nouveaux)

```yaml
labels:
  - traefik.enable=true
  - traefik.docker.network=proxy
  - traefik.http.routers.xamiot-site-v2.rule=Host(`xamiot.com`) || Host(`www.xamiot.com`)
  - traefik.http.routers.xamiot-site-v2.entrypoints=websecure
  - traefik.http.routers.xamiot-site-v2.tls.certresolver=le
  - traefik.http.services.xamiot-site-v2.loadbalancer.server.port=3001
```

### 2.5 Mosquitto V2 — `mqtt.xamiot.com:8883` (TCP)

```yaml
labels:
  - traefik.enable=true
  - traefik.docker.network=proxy
  - traefik.tcp.routers.xamiot-mqtt-v2.rule=HostSNI(`mqtt.xamiot.com`)
  - traefik.tcp.routers.xamiot-mqtt-v2.entrypoints=mqtts
  - traefik.tcp.routers.xamiot-mqtt-v2.tls=true
  - traefik.tcp.routers.xamiot-mqtt-v2.tls.certresolver=le
  - traefik.tcp.services.xamiot-mqtt-v2.loadbalancer.server.port=1883
```

---

## 3. Stratégie de bascule

### Phase 1 — Pré-bascule (V1 actif, V2 en préparation)

V1 et V2 utilisent des noms de router différents → pas de conflit Traefik.

| Router V1 | Router V2 |
|-----------|-----------|
| `api-xamiot` | `xamiot-api-v2` |
| `xamiot-admin-ui` | `xamiot-admin-v2` |
| `mqtt-xamiot` | `xamiot-mqtt-v2` |

**Pendant la phase de test**, V2 peut tourner en parallèle avec des domaines de test (non nécessaire ici).

### Phase 2 — Bascule (Étape 9)

L'ordre garantit zéro downtime maximum :

1. Démarrer containers V2 (ils obtiennent les routes V2)
2. Stopper containers V1 (Traefik retire automatiquement les routes V1)
3. Traefik route `api.xamiot.com` vers le container V2 actif

> ⚠️ **Pendant l'intervalle de bascule**, les domaines `api.xamiot.com` et `admin.xamiot.com` pointent vers les deux containers si les deux sont actifs en même temps. L'ordre exact est : démarrer V2 → vérifier → stopper V1.

---

## 4. Certificats TLS

Traefik gère les certificats Let's Encrypt via TLS-ALPN-01. Les domaines suivants doivent être correctement résolus vers l'IP de ecrimoi.com **avant** le premier démarrage des containers V2 :

| Domaine | Statut actuel |
|---------|---------------|
| `api.xamiot.com` | ✅ Déjà résolu (V1 actif) |
| `admin.xamiot.com` | ✅ Déjà résolu (V1 actif) |
| `mqtt.xamiot.com` | ✅ Déjà résolu (V1 actif) |
| `portail.xamiot.com` | ⚠️ À vérifier — n'existait pas en V1 |
| `xamiot.com` | ⚠️ À vérifier — n'existait pas en V1 |
| `www.xamiot.com` | ⚠️ À vérifier — n'existait pas en V1 |

> Les 3 domaines marqués ⚠️ doivent être configurés en DNS **avant la bascule**. Traefik demandera automatiquement les certificats Let's Encrypt au premier démarrage du container.

---

## 5. Réseaux Docker par service

| Service | Réseaux requis |
|---------|---------------|
| `xamiot-api` | `proxy`, `backend`, `xamiot_v2_net` |
| `xamiot-admin-ui` | `proxy` |
| `xamiot-portal` | `proxy` |
| `xamiot-site` | `proxy` |
| `mosquitto-v2` | `proxy`, `backend`, `xamiot_v2_net` |

| Réseau | Type | Rôle |
|--------|------|------|
| `proxy` | external | Traefik — exposition HTTP/TCP |
| `backend` | external | PostgreSQL partagé (`xamiot-postgres`) |
| `xamiot_v2_net` | external (créé Étape 5) | Communication interne API ↔ Mosquitto V2 |

---

## 6. Checklist DNS pré-bascule

```
[ ] portail.xamiot.com  → A record → IP ecrimoi.com
[ ] xamiot.com          → A record → IP ecrimoi.com
[ ] www.xamiot.com      → CNAME xamiot.com  (ou A record)
```

*Rédigé le 2026-04-04 — Traefik integration XamIoT V2 ecrimoi.com*
