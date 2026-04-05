# CHANGELOG — XamIoT v2

## [Unreleased]

### 2026-04-05

#### Admin UI

**Médiathèque**
- Dossiers virtuels : création, navigation, déplacement d'images entre dossiers
- Drag & drop upload depuis le bureau directement dans la médiathèque
- Renommer un dossier (met à jour tous les fichiers en DB)
- Supprimer un dossier avec choix : déplacer les fichiers dans un autre dossier ou tout supprimer
- Picker image (PageEditor, ProductEditor, Settings) : navigation par dossiers synchronisée avec la médiathèque

**PageEditor (éditeur de pages CMS)**
- Alignement des images dans l'éditeur (gauche / centre / droite via float/margin-auto)
- Support des ancres in-page (mark `<a id="...">` avec affichage ⚓ en édition)
- Couleurs de liens par section : header, body, footer — couleur de base et survol séparées
- Message de confirmation inline après enregistrement (vert ✓ / rouge ✕ à côté du bouton)
- Fix : case "Ouvrir dans un nouvel onglet" toujours recochée
  - Cause : `HTMLAttributes: { target: '_blank' }` de TipTap fusionné dans chaque lien rendu
  - Fix : override `HTMLAttributes` + `addAttributes.target` avec `default: null` et `parseHTML` explicite
  - Fix DB PROD : 6 pages avec `target="_blank"` en dur nettoyées par `regexp_replace`

**Utilisateurs**
- En-tête de tableau fond noir, texte blanc
- Tri par clic sur n'importe quelle colonne (↑/↓), tri initial sur "Créé" descendant
- Alternance légère des lignes (blanc / gris très clair)
- Hover bleu doux (`#e0e7ff`)

#### API

- `mobile_enrolled` : email envoyé uniquement sur enregistrement d'un **nouveau** token mobile (détection via `xmax = 0` dans `RETURNING`)
- `sysNotifEngine.js` : fix bug `syntax error at or near "WHERE"` — double clause `WHERE` dans `getDevicesForScope()` quand un filtre de scope était actif
- `PATCH /admin/cms/media/:id` : mise à jour partielle indépendante de `alt_text` et `folder` (ne réinitialise pas les champs non envoyés)

---

## [0.1.0] — 2026-03-31

- Déploiement initial VPS dev (holiceo.com) : API + Admin UI + Mosquitto
- DB `xamiot_v2` créée sur VPS avec user `xamiot_v2_user`
- API live sur `https://apixam.holiceo.com`
- Admin UI live sur `https://xamiot.holiceo.com`
- Compte admin `support@xamiot.com` créé et activé
