# Patch audit_logs — suppressions de compte self-service

**Date** : 2026-05-03
**Composant** : `XamIoT_Api_v2/`
**Type** : correction de gap d'audit

---

## Contexte — comment le bug a été découvert

Cherche en BDD du compte testeur `android1@xamiot.com` (créé pour la review Google Play, voir `docs/rapports/2026-05-03_mise-en-prod-google-play-android.md`) → **compte introuvable** en DEV et en PROD :

```sql
SELECT id, email FROM users WHERE email = 'android1@xamiot.com';
-- (0 rows) en DEV et en PROD
```

L'`AUTH_SIGNUP` du compte est bien tracé en PROD (`2026-04-07 20:12:25`, prénom "Android", nom "Google"), mais **aucune trace de suppression** dans `audit_logs`. Le compte a donc été supprimé par un chemin qui ne loggait pas.

---

## Cause racine

Trois chemins de suppression d'utilisateur existent dans l'API. Avant ce patch :

| Chemin | Fonction | Route | Audit avant patch |
|---|---|---|---|
| Suppression admin | `adminRoutes.js:295` | `DELETE /admin/users/:id` | ✅ tracé (`DELETE / user`) |
| Suppression self-service via email + code | `auth.js:467 confirmAccountDeletion` | `POST /auth/confirm-account-deletion` | ❌ **non tracé** |
| Suppression depuis app mobile | `auth.js:500 deleteMyAccount` | `DELETE /me` | ❌ **non tracé** |

Le compte `android1@xamiot.com` a été supprimé via l'un de ces deux derniers chemins (très probablement le flux email + code 8 caractères du portail, introduit par le commit `32d2aeb`), donc sans laisser de trace.

---

## Patch appliqué

### `XamIoT_Api_v2/src/auth.js`

**`confirmAccountDeletion(email, code)`** retourne désormais `{ ok, user_id, deleted_email }` au lieu de `{ ok }`. L'email est lu depuis `users` avant le `DELETE` pour pouvoir l'inscrire dans l'audit.

**`deleteMyAccount(userId)`** retourne désormais `{ ok, deleted_email }`. L'email est lu via un `SELECT email FROM users WHERE id=$1` avant le `DELETE`, puisque le JWT pourrait être obsolète (on prend la valeur courante en BDD).

### `XamIoT_Api_v2/src/app.js`

Les deux routes correspondantes (`POST /auth/confirm-account-deletion` et `DELETE /me`) insèrent maintenant un enregistrement `audit_logs` après suppression réussie :

```sql
INSERT INTO audit_logs (user_id, user_email, action, resource_type, resource_id, ip_address, user_agent, details)
VALUES (..., 'DELETE', 'user', ..., ..., ..., ...);
```

Le champ `details.reason` distingue les deux origines :
- `"self_service_email_code"` → suppression via portail (email + code 8 caractères)
- `"mobile_app"` → suppression via apps iOS/Android (token JWT)

L'insertion est faite en mode `fire-and-forget` (pattern existant dans le code) — un échec d'audit n'empêche pas la suppression.

---

## Couverture audit_logs après patch

| Action utilisateur | Action loggée | Reason / Notes |
|---|---|---|
| Création compte (signup public) | `AUTH_SIGNUP` | déjà tracé |
| Activation par email | `AUTH_VERIFY_EMAIL` | déjà tracé |
| Connexion (succès) | `LOGIN` | déjà tracé |
| Connexion (échec) | `LOGIN_FAILED` | déjà tracé |
| Demande reset password | `PASSWORD_RESET_REQUEST` | déjà tracé |
| Reset password complété | `PASSWORD_RESET_DONE` | déjà tracé |
| Update compte par admin | `UPDATE / user` | déjà tracé |
| Suppression compte par admin | `DELETE / user` | déjà tracé |
| **Suppression compte self-service portail** | `DELETE / user` | **nouveau** (`reason: self_service_email_code`) |
| **Suppression compte depuis app mobile** | `DELETE / user` | **nouveau** (`reason: mobile_app`) |

---

## Vérification post-déploiement

Pour vérifier que le patch fonctionne, déclencher une suppression de test puis :

```bash
ssh jeremy@192.168.1.6 "docker exec postgres psql -U xamiot_v2_user -d xamiot_v2 -c \\
\"SELECT created_at, user_email, action, resource_type, details \\
 FROM audit_logs WHERE action='DELETE' AND resource_type='user' \\
 ORDER BY created_at DESC LIMIT 5;\""
```

On doit y voir une ligne avec `details.reason` = `self_service_email_code` ou `mobile_app`.

---

## Sortie de prod

Déployé simultanément sur :
- DEV : `192.168.1.6` via `bash scripts/deploy.sh`
- PROD : `ecrimoi.com` via rsync + `docker compose -f docker-compose.ecrimoi.yml up -d --build`
