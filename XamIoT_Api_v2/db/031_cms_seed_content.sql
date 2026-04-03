-- 031_cms_seed_content.sql
-- Contenu réel des pages CMS scraped depuis xamiot.com (2026-04-02).
-- Idempotent via ON CONFLICT DO UPDATE.

-- =============================================
-- Page Accueil — contenu scraped depuis xamiot.com
-- =============================================
UPDATE cms_page_translations
SET
  title           = 'Accueil',
  seo_title       = 'XamIoT – Le capteur intelligent du bruit',
  seo_description = 'XamIoT SoundSense : mesure sonore en temps réel, alertes push personnalisées sans micro ni caméra. Idéal pour les locations courte durée, résidences étudiantes et espaces partagés.',
  content         = '<h1>XamIoT – Le capteur intelligent du bruit</h1>
<p>Mesurez le niveau sonore de vos espaces en temps réel et recevez des alertes privées, sans microphone ni caméra. Seul un indice de niveau sonore objectif (<strong>xB</strong>, de 0 à 100) est calculé et transmis.</p>

<h2>Pourquoi XamIoT ?</h2>
<ul>
  <li>100&nbsp;% dédié à la sonométrie — aucune captation audio, aucune image</li>
  <li>Respect de la vie privée : aucune conversation enregistrée ni stockée</li>
  <li>Seuils personnalisables, alertes push, historique clair</li>
  <li>Déploiement simple : capteur USB, application iOS/Android, notifications</li>
</ul>

<h2>Comment ça marche ?</h2>
<ol>
  <li>Installez le capteur SoundSense dans la pièce (alimentation USB, position stable)</li>
  <li>Connectez-le au Wi-Fi 2,4&nbsp;GHz et associez-le à votre compte dans l''application</li>
  <li>Définissez vos seuils (ex. 50, 60, 75&nbsp;xB) et recevez une alerte à chaque dépassement</li>
</ol>

<h2>Fonctionnalités clés</h2>
<ul>
  <li><strong>Visualisation temps réel</strong> du niveau sonore et de son évolution</li>
  <li><strong>Seuils personnalisables</strong> avec cooldown anti-doublon et notifications push</li>
  <li><strong>Historique des alertes</strong> avec date, heure, appareil et valeur</li>
  <li><strong>Multi-espaces</strong> pour locations courte durée, résidences étudiantes, zones communes</li>
</ul>

<h2>Cas d''usage</h2>
<ul>
  <li>Locations courte durée (Airbnb / Booking) — prévenir les nuisances sonores</li>
  <li>Résidences étudiantes — maintenir le respect des règles de vie commune</li>
  <li>Espaces communs — surveillance objective des seuils sans atteinte à la vie privée</li>
</ul>

<h2>Prêt à démarrer ?</h2>
<p>Achetez le capteur SoundSense et suivez le guide d''installation pour être opérationnel en quelques minutes.</p>',
  updated_at      = now()
WHERE page_id = (SELECT id FROM cms_pages WHERE slug = 'home')
  AND lang = 'fr';

-- Mise à jour du statut de la page home en published
UPDATE cms_pages
SET status = 'published', published_at = COALESCE(published_at, now()), updated_at = now()
WHERE slug = 'home';

-- =============================================
-- Page Politique de confidentialité — contenu scraped depuis xamiot.com
-- =============================================
UPDATE cms_page_translations
SET
  title           = 'Politique de confidentialité',
  seo_title       = 'Politique de confidentialité — XamIoT SoundSense',
  seo_description = 'Politique de confidentialité de l''application XamIoT SoundSense : données collectées, bases légales RGPD, droits des utilisateurs et coordonnées de l''éditeur.',
  content         = '<h1>Politique de confidentialité</h1>

<h2>Éditeur</h2>
<p>XamIoT SoundSense est édité par <strong>Jérémy Fauvet – XamIoT</strong><br>
29 rue du Grand Bourgneuf, 45430 Chécy, France<br>
Contact support : <a href="mailto:support@xamiot.com">support@xamiot.com</a></p>

<h2>Prérequis important</h2>
<p>L''application nécessite la possession d''un capteur XamIoT SoundSense connecté à Internet via Wi-Fi 2,4&nbsp;GHz. L''utilisation de l''application est actuellement gratuite, sans abonnement requis.</p>

<h2>Périmètre</h2>
<p>Cette politique couvre l''application mobile, l''API associée, le service MQTT et les notifications push. Elle ne couvre pas les sites tiers ni les produits tiers.</p>

<h2>Données traitées</h2>
<ul>
  <li><strong>Informations de compte</strong> : email, mot de passe haché, nom et numéro de téléphone (optionnels)</li>
  <li><strong>Informations appareil</strong> : numéro de série, nom, topic MQTT, statut, version firmware</li>
  <li><strong>Mesures</strong> : indice de niveau sonore (0–100) avec horodatage uniquement — aucun audio ni image captés</li>
  <li><strong>Règles et alertes</strong> : seuils configurés et historiques de déclenchement</li>
  <li><strong>Données techniques</strong> : logs serveur, adresses IP, identifiants de notification</li>
  <li><strong>Données support</strong> : échanges avec le service client</li>
</ul>

<h2>Point clé sur la vie privée</h2>
<p>SoundSense <strong>ne capte ni n''enregistre l''audio</strong>. Le système mesure uniquement un indice de niveau sonore — aucune conversation n''est captée ni stockée.</p>

<h2>Bases légales (RGPD)</h2>
<p>Les traitements reposent sur : l''exécution du contrat, les intérêts légitimes de l''entreprise, les obligations de support client, le consentement aux notifications et la conformité légale.</p>

<h2>Destinataires des données</h2>
<ul>
  <li>Hébergement / bases de données : Iliad (France)</li>
  <li>Notifications : Apple APNs</li>
  <li>Support : <a href="mailto:support@xamiot.com">support@xamiot.com</a></li>
</ul>

<h2>Durées de conservation</h2>
<ul>
  <li>Données de compte : 36 mois après la dernière connexion</li>
  <li>Historique des alertes : 100 dernières alertes, maximum 12 mois</li>
  <li>Données support : 12 mois</li>
</ul>

<h2>Droits des utilisateurs</h2>
<p>Vous disposez d''un droit d''accès, de rectification, d''effacement, de limitation, d''opposition et de portabilité. Pour exercer ces droits, écrivez à <a href="mailto:support@xamiot.com">support@xamiot.com</a>. Vous pouvez également introduire une réclamation auprès de la CNIL.</p>

<h2>Sécurité</h2>
<p>Les données sont transmises de manière chiffrée. Des contrôles d''accès, des sauvegardes chiffrées et des mises à jour de sécurité sont mis en place. Les utilisateurs sont responsables de la confidentialité de leurs identifiants et de l''accès physique à leurs appareils.</p>

<h2>Mineurs et information des occupants</h2>
<p>Le service est destiné aux adultes. Lorsque le capteur est installé dans un espace partagé, les occupants doivent être informés de la présence d''un dispositif de surveillance du niveau sonore.</p>

<h2>Cookies</h2>
<p>L''application mobile n''utilise pas de cookies. Le site web peut utiliser des cookies techniques ou analytiques avec le consentement approprié.</p>',
  updated_at      = now()
WHERE page_id = (SELECT id FROM cms_pages WHERE slug = 'politique-de-confidentialite')
  AND lang = 'fr';

-- Mise à jour du statut en published
UPDATE cms_pages
SET status = 'published', published_at = COALESCE(published_at, now()), updated_at = now()
WHERE slug = 'politique-de-confidentialite';

-- =============================================
-- Page Contact — s'assurer qu'elle existe et est published
-- =============================================
UPDATE cms_pages
SET status = 'published', published_at = COALESCE(published_at, now()), updated_at = now()
WHERE slug = 'contact';

INSERT INTO schema_migrations (version) VALUES ('031') ON CONFLICT DO NOTHING;
