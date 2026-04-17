# Cahier des charges — CMS Admin générique

> Document de spécification technique et fonctionnelle.  
> À utiliser comme prompt de départ pour la construction d'un back-office CMS complet,
> indépendant de tout domaine métier.

---

## 1. Objectif

Construire un back-office CMS complet, moderne et autonome, permettant de gérer :
- Le contenu éditorial multilingue d'un site web public
- La médiathèque (images, PDF, vidéos, documents)
- Le style et les templates graphiques du site
- Les formulaires de contact et d'inscription membres
- Les campagnes emailing et la gestion des abonnés
- Les paiements (Stripe)
- La configuration globale (SMTP, DeepL, Stripe, langues, etc.)

Le back-office est une SPA découplée du site public. Il communique avec une API REST ou via des routes Next.js API selon l'architecture choisie.

---

## 2. Stack technique

### 2.1 Framework & langage
- **Next.js 14+ (App Router)** + **TypeScript**
- Rendu : SSR pour les pages publiques, SPA pour le back-office
- Runtime : Node.js 20 LTS

### 2.2 ORM & base de données
- **ORM : à définir** — Prisma recommandé (schéma typé, migrations, studio intégré) ou Drizzle (plus léger)
- **Base de données : à définir** — PostgreSQL recommandé (JSON natif, Full-Text Search, robustesse)
- Migrations versionnées, jamais de modification directe en prod

### 2.3 UI & styling
- **shadcn/ui** (composants accessibles, non opinionnés)
- **Tailwind CSS** (utilitaire, cohérent avec shadcn)
- Thème clair/sombre natif via CSS variables

### 2.4 Authentification
- **Auth.js v5 (NextAuth)** — sessions JWT ou base de données
- Providers : credentials (email + mot de passe) en premier lieu
- Support 2FA (TOTP) optionnel

### 2.5 Éditeur de contenu
- **TipTap** (voir section 7 pour le détail complet des extensions)

### 2.6 Stockage médias
- **Local filesystem** par défaut (dossier `/uploads`)
- Abstraction storage permettant de basculer sur **S3 / Cloudflare R2** sans changer le code applicatif
- Interface unique `StorageAdapter` avec méthodes `upload()`, `delete()`, `getUrl()`

### 2.7 Emailing
- **Nodemailer** pour l'envoi transactionnel (SMTP configurable)
- **Bull / BullMQ** pour la file d'attente des campagnes (envoi asynchrone avec retry)

### 2.8 Paiement
- **Stripe** (SDK officiel Node.js)
- Webhooks vérifiés par signature

### 2.9 Traduction automatique
- **DeepL API** (REST, clé configurable dans l'interface)

### 2.10 Tests
- **Vitest** ou **Jest** — tests unitaires (validations, logique métier)
- **Playwright** — tests E2E (formulaires, authentification, upload)
- Couverture minimale : auth, soumissions formulaires, envoi email, paiement

### 2.11 Docker
- `docker-compose.dev.yml` : app + DB locale, ports exposés
- `docker-compose.prod.yml` : app uniquement, réseaux externes `proxy` + `backend`, labels Traefik

---

## 3. Configuration générale

Page `/admin/configuration` — accessible uniquement aux super admins.

### 3.1 Identité du site
- **Nom du site** (utilisé dans les emails, titres de page, etc.)
- **Logo principal** (light) — upload depuis la médiathèque
- **Logo alternatif** (dark) — optionnel
- **Favicon** — `.ico` ou `.png` 32×32
- **URL du site public** — utilisée pour les liens dans les emails et redirections

### 3.2 Langues actives
- Liste dynamique des langues (pas limitée à 3)
- Chaque langue : code ISO 639-1 (ex. `fr`, `en`, `es`, `de`, `it`), libellé, drapeau optionnel
- **Langue par défaut** — obligatoire, 1 seule
- Ajout / suppression de langues sans perte de données (les traductions existantes sont conservées)
- Ordre d'affichage dans le sélecteur de langue configurable

### 3.3 SMTP (envoi d'emails)
- Hôte, port, sécurité (TLS / STARTTLS / none)
- Identifiants (login, mot de passe — stockés chiffrés)
- **Nom expéditeur** et **email expéditeur**
- Bouton **Tester la configuration** — envoie un email de test à l'admin connecté
- Statut de connexion visible (vert / rouge)

### 3.4 DeepL (traduction automatique)
- Clé API DeepL (Free ou Pro)
- Langues source et cible disponibles affichées après validation de la clé
- Quota restant affiché (requête à l'API DeepL)
- Bouton **Tester la connexion**
- Utilisé dans l'éditeur de contenu : bouton "Traduire automatiquement" sur chaque champ de traduction

### 3.5 Stripe
- **Clé publique** (`pk_live_...` ou `pk_test_...`)
- **Clé secrète** (`sk_live_...` — masquée après saisie)
- **Webhook secret** (`whsec_...`)
- Mode test / live — switch explicite avec avertissement visuel en mode test
- Bouton **Tester la connexion** — vérifie la clé via `stripe.accounts.retrieve()`
- URL du webhook à copier-coller dans le dashboard Stripe

### 3.6 Autres paramètres globaux
- **Fuseau horaire** — liste déroulante (format IANA, ex. `Europe/Paris`)
- **Format de date** — `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`
- **Email de contact** — destinataire des soumissions de formulaires de contact (distinct de l'email SMTP)
- **Mentions légales** — URL ou texte court (affiché dans les emails transactionnels)

---

## 4. Médiathèque

Page `/admin/medias` — gestion complète des fichiers uploadés.

### 4.1 Organisation par dossiers
- Arborescence illimitée (dossiers et sous-dossiers)
- Actions : créer, renommer, déplacer, supprimer (avec confirmation si non vide)
- Dossier racine toujours présent et non supprimable
- Fil d'Ariane pour naviguer dans l'arborescence
- Déplacement de fichiers entre dossiers par drag & drop

### 4.2 Upload
- **Drag & drop** sur la zone principale — survol avec indicateur visuel
- **Ouverture du finder** (input file classique) — multi-sélection native
- **Upload multiple** simultané avec barre de progression par fichier
- **Types acceptés** (configurables globalement) :
  - Images : `jpg`, `jpeg`, `png`, `webp`, `gif`, `svg`, `avif`
  - Documents : `pdf`, `doc`, `docx`, `xls`, `xlsx`, `csv`
  - Vidéos : `mp4`, `webm`, `mov`
  - Autres : `zip`, extension personnalisée possible
- **Taille maximale** par fichier — configurable (défaut : 20 Mo)
- **Génération automatique de thumbnails** pour les images (3 tailles : small, medium, large)
- Détection et blocage des doublons (hash MD5 du fichier)

### 4.3 Vue et recherche
- Affichage grille (défaut pour les images) ou liste (défaut pour les autres)
- **Recherche** par nom, type, dossier
- **Filtres** : type de fichier, date d'upload, taille
- **Tri** : nom, date, taille

### 4.4 Fiche média
- Preview (image, PDF viewer, icône pour les autres)
- **Métadonnées éditables** : nom, texte alternatif (alt), légende, titre
- URL publique avec bouton copier
- Informations : taille, dimensions (images), type MIME, date d'upload
- **Remplacement** — uploader une nouvelle version sans changer l'URL (si même nom et type)
- Suppression avec détection d'usage (avertir si le fichier est utilisé dans une page)

### 4.5 Sélecteur de média
- Composant réutilisable utilisable depuis l'éditeur de pages, les formulaires, les produits, etc.
- Modale avec navigation dans les dossiers, recherche, upload inline
- Sélection simple ou multiple selon le contexte

---

## 5. Style & Templates

Page `/admin/style` — personnalisation visuelle du site public.

### 5.1 Sélecteur de template
- Liste des templates disponibles (au moins 2–3 au départ)
- Chaque template : nom, preview screenshot, description
- **Activation** d'un template sans perte des personnalisations (les overrides CSS sont conservés)
- Les templates définissent la structure HTML/CSS de base du site public
- Possibilité d'ajouter de nouveaux templates sans modifier le code back-office (convention de dossiers)

### 5.2 Couleurs de marque
- **Palette principale** : couleur primaire, secondaire, accent
- **Texte** : couleur normale, au survol, désactivé
- **Fond** : couleur principale, alternative, cards
- **Liens** : couleur normale, au survol, visité
- **Alertes** : succès, erreur, avertissement, info
- Chaque couleur : color picker + input hex manuel
- Preview en temps réel dans un mini aperçu du site
- Export des couleurs en CSS variables (`:root { --color-primary: #... }`)

### 5.3 Typographie
- **Police principale** (corps de texte) — picker Google Fonts ou upload de fonte custom
- **Police des titres** — idem
- **Tailles** : base, sm, lg, xl, headings H1–H6
- **Graisse** : normale, bold
- **Interligne** (line-height)
- Preview des typographies en temps réel

### 5.4 Éditeur CSS custom
- Éditeur de code **Monaco** (VS Code in the browser) ou **CodeMirror**
- Coloration syntaxique CSS, autocomplétion, lint
- Les règles CSS custom sont appliquées après le CSS du template (surcharge propre)
- Bouton **Réinitialiser** (supprime les overrides CSS uniquement, sans toucher aux couleurs/typo)
- **Historique** des 10 dernières versions sauvegardées (restauration possible)
- Les variables CSS de la palette (§5.2) sont disponibles via `var(--color-primary)` etc.

---

## 6. Pages CMS

Page `/admin/pages` — gestion des pages du site public.

### 6.1 Liste des pages
- Tableau : titre (langue par défaut), slug, statut, date de modification, actions
- Filtres : statut (brouillon, publié, archivé), langue
- Recherche fulltext sur les titres
- **Duplication** d'une page (copie toutes les traductions + contenu)
- Tri par drag & drop pour l'ordre de navigation (si applicable)

### 6.2 Édition d'une page
- **Slug** — éditable, unique, généré automatiquement depuis le titre
- **Statut** — brouillon / publié / archivé
- **Onglets de langue** — un onglet par langue active (ajoutés automatiquement quand une langue est créée dans la config)
- Par langue : titre, contenu (TipTap), titre SEO, meta-description, meta OG image
- **Bouton "Traduire automatiquement"** (DeepL) — traduit depuis la langue par défaut vers la langue courante
- **Contenu avant / contenu après** — deux zones TipTap si nécessaire (ex. contenu principal + notes bas de page)
- **Étiquette de menu** — texte affiché dans la navigation (peut différer du titre)
- Sauvegarde automatique (autosave) toutes les 60 secondes
- **Historique des versions** — liste des X dernières versions, restauration possible

---

## 7. Éditeur TipTap — spécification complète

L'éditeur TipTap est utilisé partout où du contenu riche est nécessaire (pages, emails, descriptions, formulaires...).

### 7.1 Extensions activées

| Extension | Package | Notes d'implémentation |
|-----------|---------|----------------------|
| `StarterKit` | `@tiptap/starter-kit` | Inclut : Bold, Italic, Strike, Code, Heading, BulletList, OrderedList, Blockquote, HardBreak, History |
| `Underline` | `@tiptap/extension-underline` | |
| `TextAlign` | `@tiptap/extension-text-align` | Types : `['heading', 'paragraph']` |
| `TextStyle` | `@tiptap/extension-text-style` | Requis pour Color et FontFamily |
| `Color` | `@tiptap/extension-color` | Couleur du texte |
| `Highlight` | `@tiptap/extension-highlight` | `multicolor: true` — couleur de fond |
| `FontFamily` | `@tiptap/extension-font-family` | |
| `Link` | `@tiptap/extension-link` | `openOnClick: false`, `autolink: true`, `linkOnPaste: true`. **⚠️ Toujours setter `target` à `'_self'` par défaut, jamais `null`** — un `null` provoque des comportements incohérents selon les navigateurs |
| `Image` | `@tiptap/extension-image` | Upload inline via endpoint `/api/media/upload`. Intégration avec le sélecteur de médiathèque |
| `Table` | `@tiptap/extension-table` | Avec `TableRow`, `TableHeader`, `TableCell`. Extension `ResizableColumns` pour redimensionnement |
| `TaskList` | `@tiptap/extension-task-list` | Avec `TaskItem` |
| `CodeBlockLowlight` | `@tiptap/extension-code-block-lowlight` | Coloration syntaxique via `lowlight`. Langages : js, ts, python, bash, sql, json, html, css |
| `HorizontalRule` | inclus dans StarterKit | |
| `Youtube` | `@tiptap/extension-youtube` | Embed YouTube par URL |
| `Placeholder` | `@tiptap/extension-placeholder` | Message vide configurable par champ |
| `CharacterCount` | `@tiptap/extension-character-count` | Compteur de caractères/mots (utile pour les meta-descriptions) |

### 7.2 Toolbar
Barre d'outils organisée en groupes logiques :
- **Texte** : Gras, Italique, Souligné, Barré, Code inline
- **Structure** : Paragraphe, H1–H4, Liste à puces, Liste numérotée, Liste de tâches, Blockquote, Séparateur horizontal
- **Alignement** : Gauche, Centre, Droite, Justifié
- **Enrichissement** : Couleur texte, Couleur fond (Highlight), Famille de police
- **Médias** : Insérer image (médiathèque ou upload), Insérer YouTube
- **Tableau** : Insérer tableau, options colonnes/lignes (contextuel)
- **Lien** : Insérer/éditer lien (modale avec URL, texte, target, rel nofollow)
- **Code** : Bloc de code avec sélecteur de langage
- **Historique** : Annuler, Rétablir
- **Source HTML** : bascule éditeur ↔ HTML brut (pour les utilisateurs avancés)

### 7.3 Comportement copier-coller
- **Depuis Word / Google Docs** : nettoyage automatique des styles inline parasites (via PasteRule custom)
- Conserver : gras, italique, liens, listes, titres
- Supprimer : `font-*`, `color`, `background`, `margin`, `padding`, `class` Word-specific
- **Depuis une page web** : idem — conserver la structure sémantique, supprimer le CSS inline

### 7.4 Liens — règles d'implémentation
```ts
// ✅ Correct
editor.commands.setLink({ href: url, target: '_self' })

// ❌ Jamais faire
editor.commands.setLink({ href: url, target: null })
editor.commands.setLink({ href: url }) // target omis = null = bug
```
- La modale d'édition de lien doit toujours proposer `_self` (même page) et `_blank` (nouvel onglet)
- En DB : nettoyer les ancres `target=null` existantes via migration SQL si upgrade depuis une version antérieure

---

## 8. Mailing / Newsletter

Page `/admin/mailing` — gestion complète des campagnes email.

### 8.1 Listes de contacts
- Création de listes nommées (ex. "Newsletter FR", "Clients Pro", "Beta testeurs")
- Un contact peut appartenir à plusieurs listes
- **Champs par contact** : email (obligatoire), prénom, nom, langue, tags libres, date d'abonnement, statut
- **Statuts** : actif, désabonné, bounced, spam
- Recherche, filtres, tri, pagination
- Export CSV de la liste filtrée

### 8.2 Import de contacts
- **Formats supportés** : CSV, XLS, XLSX
- Upload du fichier → prévisualisation des 5 premières lignes
- **Mapping dynamique de colonnes** : associer chaque colonne du fichier à un champ contact (drag & drop ou select)
- Champs reconnus automatiquement si les en-têtes correspondent (email, prenom, nom, etc.)
- **Gestion des doublons** : ignorer / mettre à jour / demander
- Rapport d'import : X importés, Y mis à jour, Z ignorés (doublons), W erreurs

### 8.3 Désabonnement
- **Lien de désabonnement** automatique dans chaque email (token unique par contact)
- Page de désabonnement publique avec confirmation
- Double opt-out optionnel (email de confirmation)
- Le contact passe en statut `désabonné` — jamais supprimé (traçabilité RGPD)
- Vue admin des désabonnements avec date et motif (si renseigné)

### 8.4 Double opt-in
- Configurable par liste
- À l'inscription : email de confirmation envoyé → le contact est `en attente` jusqu'à confirmation
- Email de confirmation : sujet et corps personnalisables (TipTap)
- Expiration du token configurable (défaut : 72h)

### 8.5 Campagnes
- Création : nom interne, liste(s) cible(s), sujet de l'email, corps (TipTap)
- **Variables de personnalisation** dans le sujet et le corps : `{{prenom}}`, `{{nom}}`, `{{email}}`, `{{lien_desabonnement}}`
- **Email de test** — envoi à une adresse spécifique avant la campagne
- **Planification** — envoyer maintenant ou à une date/heure précise
- Envoi asynchrone via file d'attente (pas de timeout HTTP)
- **Statistiques** par campagne : envoyé, délivré, ouvert (pixel tracking), cliqué (lien tracking), désabonné, bounced

### 8.6 Templates d'email
- Bibliothèque de templates réutilisables (HTML + variables)
- Éditeur visuel (TipTap) ou HTML brut
- Preview en rendu email (iframe)

---

## 9. Formulaires de contact

Page `/admin/formulaires` — builder visuel de formulaires.

### 9.1 Builder de formulaires
- Création par drag & drop de champs depuis une palette
- **Types de champs disponibles** :
  - Texte court (input)
  - Texte long (textarea)
  - Email
  - Téléphone
  - Nombre (avec min/max/step)
  - Date
  - Heure
  - Date + heure
  - Case à cocher (checkbox unique)
  - Groupe de cases à cocher (multi-select)
  - Boutons radio (single select)
  - Liste déroulante (select)
  - Liste déroulante multiple
  - Upload de fichier (types et taille max configurables)
  - Séparateur visuel (hr)
  - Texte statique / HTML (paragraphe d'instructions)
  - Champ caché (valeur fixe ou dynamique)
  - Note / évaluation (étoiles)
  - Honeypot anti-spam (champ invisible, caché en CSS, pas en HTML)

### 9.2 Configuration par champ
- Libellé, placeholder, texte d'aide (sous le champ)
- Obligatoire / optionnel
- Validation : longueur min/max, regex custom, format (email, URL, etc.)
- Valeur par défaut
- Largeur : pleine largeur, 1/2, 1/3 (grille responsive)

### 9.3 Conditional Fields
- Règle d'affichage/masquage sur chaque champ
- Conditions : `si [champ X] [est égal à / contient / est rempli / est vide] [valeur]`
- Opérateur logique : ET / OU entre plusieurs conditions
- Exemple : afficher le champ "Précisez" si la valeur de "Type de demande" est "Autre"
- Les champs masqués sont exclus de la validation et de la soumission

### 9.4 Configuration du formulaire
- Nom interne (pour l'admin)
- **Email de notification** — un ou plusieurs destinataires (séparés par virgule)
- **Sujet du mail de notification** — avec variables `{{nom_champ}}`
- **Email de confirmation** à l'expéditeur — optionnel, sujet et corps personnalisables (TipTap)
- **Message de succès** — texte affiché après soumission (TipTap)
- **Redirection après soumission** — URL optionnelle (ex. page de remerciement)
- **Limite de soumissions** — par IP (rate limit configurable)
- **Période d'ouverture** — optionnel : date d'ouverture / fermeture du formulaire

### 9.5 Soumissions (CFDB7-like)
- Tableau de toutes les soumissions par formulaire
- Colonnes : date, email (si champ présent), statut (lu / non lu), résumé
- Vue détaillée de chaque soumission : tous les champs et valeurs
- **Marquer comme lu/non lu**
- **Note interne** (commentaire admin sur la soumission)
- **Statut de traitement** : nouveau, en cours, traité, spam
- Recherche fulltext, filtres par date et statut
- Export CSV des soumissions filtrées
- Suppression manuelle ou automatique après N jours (configurable, RGPD)

### 9.6 Intégration dans les pages
- Shortcode `[formulaire id="xxx"]` insérable depuis TipTap (bouton dédié)
- Le composant public rend le formulaire en client-side React
- Soumission via `POST /api/forms/[id]/submit` avec protection CSRF

---

## 10. Formulaires d'inscription membres

Page `/admin/inscriptions` — gestion des formulaires multi-étapes avec paiement.

### 10.1 Builder multi-étapes
- Le formulaire est découpé en **étapes** (wizard)
- Chaque étape a : titre, description, liste de champs (même builder que §9)
- Navigation entre étapes : boutons Précédent / Suivant
- Validation de chaque étape avant de passer à la suivante
- Barre de progression visuelle (étapes numérotées ou pourcentage)
- **Sauvegarde de progression** — si l'utilisateur quitte, il peut reprendre depuis où il était (token de session)

### 10.2 Champs spécifiques membres
En plus des champs standard (§9.1), types dédiés à l'inscription :
- **Photo de profil** — upload avec recadrage (crop)
- **Upload de document** — avec libellé du document attendu (ex. "Certificat médical", "Justificatif de domicile")
- **Signature électronique** — canvas tactile + souris
- **Consentement RGPD** — checkbox obligatoire avec lien vers la politique de confidentialité
- **Récapitulatif** — étape finale affichant toutes les données saisies avant validation

### 10.3 Workflow de validation admin
- À la soumission, la demande passe en statut **"En attente de validation"**
- Notification email à l'admin
- Vue admin : liste des demandes avec filtres (statut, date, type)
- Fiche détaillée : toutes les informations, documents uploadés, actions
- **Actions** : Valider, Refuser (avec motif), Demander un complément
- Email automatique envoyé au membre selon l'action
- Statuts : En attente / Validé / Refusé / Incomplet / Expiré

### 10.4 Paiement lié à l'inscription
- Étape de paiement intégrée dans le wizard (après la saisie des informations)
- **Stripe** : paiement unique (licence annuelle) ou abonnement récurrent
- Montant fixe ou calculé selon les champs du formulaire (ex. tarif jeune / adulte / senior)
- Paiement optionnel ou obligatoire selon la configuration du formulaire
- **Validation de l'inscription après paiement** (webhook Stripe `payment_intent.succeeded`)
- Reçu de paiement envoyé par email

### 10.5 Gestion des membres
- Liste de tous les membres avec filtres (statut, date, type d'inscription)
- Fiche membre : informations personnelles, historique des inscriptions, paiements
- **Renouvellement** — alerte automatique N jours avant expiration + email de rappel
- Export CSV / Excel de la liste filtrée
- Import de membres existants (CSV avec mapping de colonnes)
- Accès membre : espace personnel sur le site public (consulter/modifier son profil, télécharger ses documents)

---

## 11. Suivi des paiements

Page `/admin/paiements`.

### 11.1 Liste des transactions
- Tableau : date, montant, devise, statut, client, description, source (formulaire, produit, etc.)
- Statuts Stripe : `succeeded`, `pending`, `failed`, `refunded`, `disputed`
- Lien vers le dashboard Stripe pour chaque transaction
- Filtres : statut, montant min/max, date, source

### 11.2 Remboursements
- Initier un remboursement partiel ou total depuis l'interface (via API Stripe)
- Confirmation avec saisie du montant et du motif
- Email automatique au client

### 11.3 Abonnements
- Liste des abonnements actifs, annulés, en retard de paiement
- Actions : annuler, mettre en pause, modifier le montant (si applicable)
- Historique des paiements par abonnement

### 11.4 Factures PDF
- Génération automatique à chaque paiement réussi
- Template personnalisable (logo, coordonnées, mentions légales)
- Envoi automatique par email au client
- Téléchargement depuis l'espace membre

---

## 12. Utilisateurs back-office

Page `/admin/utilisateurs`.

### 12.1 Rôles
| Rôle | Permissions |
|------|------------|
| **Super Admin** | Tout, y compris la configuration globale et la gestion des rôles |
| **Admin** | Tout sauf la configuration globale |
| **Éditeur** | Pages CMS, médias, formulaires (soumissions en lecture) |
| **Viewer** | Lecture seule — statistiques, soumissions |

### 12.2 Gestion des comptes
- Invitation par email (lien d'activation)
- Changement de mot de passe forcé à la première connexion
- Désactivation sans suppression (traçabilité)
- **2FA (TOTP)** — optionnel, activable par l'utilisateur ou forcé par le super admin

### 12.3 Journal d'activité (Audit Log)
- Enregistrement de toutes les actions significatives : connexion, modification de page, suppression, changement de configuration, paiement, etc.
- Colonnes : date, utilisateur, action, ressource, IP
- Filtres et recherche
- Rétention configurable (défaut : 1 an)
- Non supprimable par les admins (seulement par les super admins)

---

## 13. Architecture & conventions de code

### 13.1 Structure des dossiers (Next.js App Router)
```
/app
  /(admin)          ← Back-office (layout avec sidebar)
    /configuration
    /medias
    /style
    /pages
    /formulaires
    /inscriptions
    /mailing
    /paiements
    /utilisateurs
  /(public)         ← Site public rendu par le CMS
  /api              ← Routes API REST
/components
  /ui               ← shadcn/ui + composants génériques
  /admin            ← Composants spécifiques au back-office
  /editor           ← TipTap et ses extensions
/lib
  /db.ts            ← Client Prisma (ou ORM choisi)
  /storage.ts       ← StorageAdapter abstrait
  /mailer.ts        ← Nodemailer
  /stripe.ts        ← Stripe SDK
  /deepl.ts         ← DeepL API
/prisma
  /schema.prisma
  /migrations/
```

### 13.2 Variables d'environnement obligatoires
```env
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Optionnels (configurés via l'UI si absent)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
DEEPL_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=
STORAGE_TYPE=local          # local | s3
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

### 13.3 Règles de développement
- Toutes les mutations DB passent par des Server Actions ou des routes `/api`
- Validation des entrées : **Zod** côté serveur (jamais faire confiance au client)
- Pas de secrets dans le code — uniquement via variables d'environnement
- Les fichiers uploadés sont validés : type MIME réel (magic bytes), pas seulement l'extension
- Rate limiting sur toutes les routes publiques (formulaires, auth)
- CSRF sur toutes les mutations publiques

---

## 14. Internationalisation du back-office lui-même

- L'interface du back-office est disponible en **français** et **anglais** au minimum
- Bibliothèque : `next-intl` ou `react-i18next`
- La langue de l'interface est distincte des langues du site géré

---

## 15. Idées complémentaires à considérer

| Idée | Valeur ajoutée |
|------|---------------|
| **Éditeur de navigation** | Gérer les menus du site (ordre, liens, sous-menus) via drag & drop |
| **Blocs réutilisables** | Créer des blocs de contenu (FAQ, CTA, équipe...) réutilisables dans plusieurs pages |
| **A/B testing** | Deux versions d'une page, mesure du taux de conversion |
| **Webhooks sortants** | Notifier un système externe (Slack, Zapier, n8n) à chaque soumission de formulaire |
| **Recherche fulltext** | Moteur de recherche sur le site public (PostgreSQL Full-Text Search ou Algolia) |
| **Statistiques de trafic** | Intégration Plausible ou Umami (analytics sans cookies) |
| **Gestion des redirections** | Table de redirections 301/302 gérée via l'interface |
| **Sauvegarde automatique de la DB** | Export dump quotidien vers S3 |
| **Mode maintenance** | Activer une page de maintenance sur le site public depuis le back-office |
