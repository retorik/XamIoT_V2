# Containers XamIoT v1 — ecrimoi.com

## État au 2026-04-05

### Dossiers v1 et leurs containers

| Dossier | Container(s) | Statut | Note |
|---------|-------------|--------|------|
| `~/wordpress/xamiot/` | `xamiot-db-1`, `xamiot-wordpress-1` | Exited | v1 WordPress xamiot.com (mariadb:11.4 + wordpress:php8.2-apache) |
| `~/mosquitto/` | `mosquitto` | Exited | MQTT v1 (iegomez/mosquitto-go-auth:2.1.0) |
| `~/api/xamiot/` | `xamiot-api` v1 | Remplacé | Même container_name que v2 — inactif depuis le déploiement v2 |
| `~/api/xamiot-admin/` | `xamiot-admin-ui` v1 | Remplacé | 2 compose files, même container_name que v2 |
| `~/api/xamiot-backend/` | `xamiot-admin-frontend` | Introuvable | Jamais démarré ou déjà supprimé avant audit |
| `~/api/xamiot-admin.zip` | — | Archive | Pas un container |
| `~/Www/firmware/` | `fw-xamiot` | **Up — À CONSERVER** | Serveur OTA firmware (`fw.xamiot.com`) — redémarré le 2026-04-05 après arrêt par erreur |

### V2 actifs et opérationnels

| Container | Image |
|-----------|-------|
| `xamiot-admin-ui` | admin-xamiot-admin-ui |
| `xamiot-api` | api-xamiot-api |
| `xamiot-site` | site-xamiot-site |
| `xamiot-portal` | portal-xamiot-portal |
| `mosquitto-v2` | mosquitto_v2-mosquitto-v2 |
| `fw-xamiot` | nginx:alpine (serveur firmware OTA) |

---

## Nettoyage v1

### Par élément

| Dossier | Container(s) | Supprimer le dossier | Supprimer le container |
|---------|-------------|----------------------|------------------------|
| `~/wordpress/xamiot/` | `xamiot-db-1`, `xamiot-wordpress-1` | `ssh jeremy@ecrimoi.com "rm -rf ~/wordpress/xamiot"` | `ssh jeremy@ecrimoi.com "docker rm xamiot-db-1 xamiot-wordpress-1"` |
| `~/mosquitto/` | `mosquitto` | `ssh jeremy@ecrimoi.com "rm -rf ~/mosquitto"` | `ssh jeremy@ecrimoi.com "docker rm mosquitto"` |
| `~/api/xamiot/` | _(remplacé par v2)_ | `ssh jeremy@ecrimoi.com "rm -rf ~/api/xamiot"` | — |
| `~/api/xamiot-admin/` | _(remplacé par v2)_ | `ssh jeremy@ecrimoi.com "rm -rf ~/api/xamiot-admin"` | — |
| `~/api/xamiot-backend/` | _(jamais tourné)_ | `ssh jeremy@ecrimoi.com "rm -rf ~/api/xamiot-backend"` | — |
| `~/api/xamiot-admin.zip` | — | `ssh jeremy@ecrimoi.com "rm ~/api/xamiot-admin.zip"` | — |
| `~/Www/firmware/` | `fw-xamiot` | **À CONSERVER** | **À CONSERVER** |

### Tout en une commande

```bash
ssh jeremy@ecrimoi.com "docker rm xamiot-db-1 xamiot-wordpress-1 mosquitto && rm -rf ~/wordpress/xamiot ~/mosquitto ~/api/xamiot ~/api/xamiot-admin ~/api/xamiot-backend ~/api/xamiot-admin.zip"
```
