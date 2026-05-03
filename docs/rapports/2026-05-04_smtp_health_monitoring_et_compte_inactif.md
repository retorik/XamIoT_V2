# Surveillance SMTP réelle + UX compte non activé

**Date** : 2026-05-04
**Composants touchés** : `XamIoT_Api_v2/`, `xamiot-admin-suite_v2/`, `XamIoT_Portal_v2/`, `XamIoT_Site_v2/`

---

## Contexte — comment le bug a été découvert

Inscription du compte testeur `android1@xamiot.com` (re-création après revue Google Play). Le mail d'activation n'a pas été reçu. Diagnostic :

```
[NOTIF][EMAIL] account_created to=android1@xamiot.com ok=false
              err=Invalid login: 535 5.7.8 Authentication failed.
```

→ Le mot de passe SMTP en BDD (`smtp_config.pass`, dernière mise à jour 2026-04-04) avait été désynchronisé du compte Mailu réel. Mais **la barre de surveillance affichait SMTP en VERT**.

## Cause racine de la fausse alerte verte

`isSmtpReady()` dans `XamIoT_Api_v2/src/smtp.js` ne testait que la présence de `host` + `from_email` dans la config — **jamais** la connexion réelle ni l'auth.

```javascript
// AVANT — surveillance superficielle
export function isSmtpReady() {
  return _config !== null && !!_config.host && !!_config.from_email;
}
```

→ Tant que la config était remplie, le voyant était vert, même avec un mot de passe invalide.

---

## Patch — Option 1 + Option 2 (validées par l'utilisateur)

### Option 1 — Tracking des envois réels

`smtp.js` expose maintenant un objet `_health` mis à jour à chaque tentative d'envoi via `recordSendOutcome(ok, error)`. Tous les call sites de `transporter.sendMail()` ont été instrumentés :

| Fichier | Fonction |
|---|---|
| `auth.js` | `sendActivationEmail`, `sendResetEmail`, `sendDeletionEmail` |
| `adminRoutes.js` | `POST /admin/smtp/test`, envoi notification utilisateur |
| `notifDispatcher.js` | `sendEmailTo` (alertes auto) |
| `scheduledNotifWorker.js` | `sendEmailBatch` (notifs planifiées) |
| `sysNotifEngine.js` | `sendEmailToUser` (notifs système) |
| `ordersRouter.js` | confirmation commande Stripe |
| `app.js` | formulaire de contact |

### Option 2 — Verify périodique (24h)

Nouvelle fonction `verifySmtpConnection()` qui appelle `transporter.verify()` (test connexion + auth sans envoi). Programmée dans `app.js` :
- Une fois au démarrage (non bloquant)
- Toutes les **24 heures** ensuite (`setInterval`)
- Aussi déclenchée immédiatement après chaque `POST /admin/smtp` (changement de config)

Endpoint dédié on-demand : `POST /admin/smtp/verify` (utile dans le back-office après modification).

### Nouveaux champs exposés par `GET /admin/smtp`

```json
{
  "configured": true,
  "ready":   true,         // config remplie (ancien sens)
  "healthy": true,         // ready + dernier envoi/verify connu OK (nouveau)
  "health": {
    "last_send_ok":     true,
    "last_send_at":     "2026-05-04T08:15:23.456Z",
    "last_send_error":  null,
    "last_verify_ok":   true,
    "last_verify_at":   "2026-05-04T08:00:00.000Z",
    "last_verify_error": null
  },
  ...
}
```

### Barre de surveillance admin UI (`App.jsx`)

```javascript
if (!smtpData?.configured) next.smtp = 'unconfigured';
else if (smtpData?.healthy === false) next.smtp = 'error';
else if (smtpData?.healthy === true) next.smtp = 'ok';
else next.smtp = smtpData?.ready ? 'ok' : 'error'; // garde-fou rétro-compat
```

---

## UX compte non activé — portail et shop

### Portail client (`XamIoT_Portal_v2/app/(auth)/login/page.tsx`)

Avant : message générique "Identifiants invalides" même si le compte existait mais n'était pas activé.

Maintenant : détection de `data.error === 'account_inactive'` côté client → affichage d'un message spécifique en orange + bouton **"Renvoyer l'email d'activation"** qui appelle `POST /auth/resend-activation`.

Traductions FR / EN / ES :
- `error_inactive` : "Votre compte n'est pas encore activé. Vérifiez votre boîte mail (et vos spams) pour le lien d'activation."
- `resend_activation` : bouton "Renvoyer l'email d'activation"
- `resend_sent` : confirmation après clic

### Shop (`XamIoT_Site_v2/app/compte/page.tsx`)

Le shop avait déjà les traductions et le handler `handleResend`, mais le bouton n'était affiché que pour `status === 'verify'` (post-signup). Quand l'erreur `account_inactive` apparaissait à la connexion, `status = 'error'` cachait le bouton.

Patch : ajout d'un state `showResend` mis à `true` quand l'erreur est `account_inactive`. Le bouton apparaît désormais dans les deux contextes (post-signup ou échec login compte non activé).

---

## Vérification post-déploiement

```bash
# Logs PROD au démarrage de l'API
[SMTP] config chargée depuis DB : mail.ecrimoi.com:465 <support@xamiot.com>
[SMTP] verify OK
```

Pour tester un échec : modifier le mot de passe SMTP en BDD avec une valeur erronée → la barre passe en rouge en moins de 30s (cycle de polling de l'admin UI), puis revient en vert dès qu'un envoi ou verify réussit (changement de config corrige et déclenche un verify immédiat).

---

## Sortie de prod

Déployé simultanément sur :
- DEV : `192.168.1.6` via `bash scripts/deploy.sh` (API + Admin + Portal)
- PROD : `ecrimoi.com` via rsync + `docker compose -f docker-compose.ecrimoi.yml up -d --build`
  - API : `verify OK` confirmé dans les logs au démarrage
  - Admin UI, Portal, Site : rebuilds OK
