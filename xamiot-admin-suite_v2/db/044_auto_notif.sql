-- 037_auto_notif.sql
-- Système 2 : Notifications transactionnelles automatiques (events métier)
-- Totalement indépendant de alert_rules / alert_log (périphériques utilisateur)

-- =============================================
-- Templates par type d'événement
-- =============================================
CREATE TABLE IF NOT EXISTS auto_notif_templates (
  event_key         TEXT PRIMARY KEY,
  label             TEXT NOT NULL,
  description       TEXT,
  category          TEXT NOT NULL CHECK (category IN ('account','device','order','ticket','rma','ota')),

  -- Canaux
  push_enabled      BOOLEAN NOT NULL DEFAULT false,
  email_enabled     BOOLEAN NOT NULL DEFAULT true,

  -- Contenu push (court)
  push_title_tpl    TEXT,
  push_body_tpl     TEXT,

  -- Contenu email
  email_subject_tpl TEXT,
  email_html_tpl    TEXT,                -- corps HTML complet (éditeur TipTap)

  -- Variables disponibles (metadata pour l'UI)
  available_vars    JSONB NOT NULL DEFAULT '[]',

  -- Audit
  updated_at        TIMESTAMPTZ DEFAULT now(),
  updated_by        TEXT                 -- email de l'admin qui a modifié
);

-- =============================================
-- Journal des envois automatiques (transactionnels)
-- =============================================
CREATE TABLE IF NOT EXISTS auto_notif_log (
  id            BIGSERIAL PRIMARY KEY,
  event_key     TEXT NOT NULL,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  resource_type TEXT,                    -- 'order' | 'ticket' | 'rma' | 'esp_device' | 'mobile_device' | 'ota'
  resource_id   TEXT,                    -- UUID ou identifiant de la ressource
  channel       TEXT NOT NULL,           -- 'push_apns' | 'push_fcm' | 'email'
  recipient     TEXT,                    -- token APNS/FCM ou adresse email
  status        TEXT NOT NULL CHECK (status IN (
    'sent', 'failed', 'skipped_disabled', 'skipped_no_channel',
    'skipped_no_recipient', 'skipped_smtp_off'
  )),
  push_result   JSONB,                   -- réponse complète APNS ou FCM
  error         TEXT,
  vars_used     JSONB,                   -- snapshot des variables substituées
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_notif_log_event ON auto_notif_log(event_key);
CREATE INDEX IF NOT EXISTS idx_auto_notif_log_user  ON auto_notif_log(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_notif_log_sent  ON auto_notif_log(sent_at DESC);

-- =============================================
-- Seed — catalogue des événements (désactivés par défaut)
-- =============================================
INSERT INTO auto_notif_templates (event_key, label, description, category, push_enabled, email_enabled, push_title_tpl, push_body_tpl, email_subject_tpl, email_html_tpl, available_vars)
VALUES

-- Compte
('account_created', 'Création de compte', 'Envoyé lors de l''inscription d''un nouvel utilisateur', 'account',
  false, true,
  'Bienvenue {first_name} !',
  'Votre compte XamIoT a été créé. Vérifiez votre email pour l''activer.',
  'Activez votre compte XamIoT',
  '<p>Bonjour {first_name},</p><p>Merci d''avoir créé un compte XamIoT. Cliquez ci-dessous pour activer votre compte :</p><p><a href="{activation_url}" style="background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">Activer mon compte</a></p>',
  '[{"key":"first_name","desc":"Prénom"},{"key":"last_name","desc":"Nom"},{"key":"email","desc":"Email"},{"key":"activation_url","desc":"Lien d''activation"}]'
),

('account_activated', 'Compte activé', 'Envoyé quand l''utilisateur confirme son email', 'account',
  false, true,
  'Compte activé !',
  'Votre compte XamIoT est maintenant actif.',
  'Votre compte XamIoT est actif',
  '<p>Bonjour {first_name},</p><p>Votre compte XamIoT est maintenant actif. Vous pouvez vous connecter.</p>',
  '[{"key":"first_name","desc":"Prénom"},{"key":"email","desc":"Email"},{"key":"login_url","desc":"URL de connexion"}]'
),

('password_reset', 'Réinitialisation mot de passe', 'Envoyé lors d''une demande de réinitialisation', 'account',
  false, true,
  'Réinitialisation mot de passe',
  'Cliquez sur le lien dans l''email pour réinitialiser votre mot de passe.',
  'Réinitialisation de votre mot de passe XamIoT',
  '<p>Bonjour {first_name},</p><p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez ci-dessous (lien valable {expires_in}) :</p><p><a href="{reset_url}" style="background:#059669;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">Réinitialiser</a></p>',
  '[{"key":"first_name","desc":"Prénom"},{"key":"email","desc":"Email"},{"key":"reset_url","desc":"Lien de réinitialisation"},{"key":"expires_in","desc":"Délai d''expiration"}]'
),

('password_changed', 'Mot de passe modifié', 'Confirmation après réinitialisation réussie', 'account',
  false, true,
  'Mot de passe modifié',
  'Votre mot de passe XamIoT a bien été modifié.',
  'Votre mot de passe XamIoT a été modifié',
  '<p>Bonjour {first_name},</p><p>Votre mot de passe a été modifié avec succès. Si vous n''êtes pas à l''origine de cette action, contactez-nous immédiatement.</p>',
  '[{"key":"first_name","desc":"Prénom"},{"key":"email","desc":"Email"}]'
),

-- Devices
('mobile_enrolled', 'Nouveau mobile enregistré', 'Envoyé quand un mobile est ajouté à un compte', 'device',
  false, true,
  'Nouveau mobile enregistré',
  '{device_name} ({platform}) ajouté à votre compte.',
  'Nouveau mobile enregistré sur votre compte XamIoT',
  '<p>Bonjour {first_name},</p><p>Un nouvel appareil mobile a été enregistré sur votre compte :</p><ul><li>Nom : {device_name}</li><li>Plateforme : {platform}</li><li>Modèle : {model}</li></ul>',
  '[{"key":"first_name","desc":"Prénom"},{"key":"device_name","desc":"Nom du mobile"},{"key":"platform","desc":"iOS ou Android"},{"key":"model","desc":"Modèle"},{"key":"app_version","desc":"Version app"}]'
),

('esp_enrolled', 'Nouveau périphérique enrôlé', 'Envoyé lors de l''ajout d''un périphérique ESP', 'device',
  false, true,
  'Nouveau périphérique enrôlé',
  '{esp_name} ({esp_uid}) ajouté à votre compte.',
  'Nouveau périphérique enregistré sur votre compte XamIoT',
  '<p>Bonjour {first_name},</p><p>Un nouveau périphérique a été enregistré :</p><ul><li>Nom : {esp_name}</li><li>UID : {esp_uid}</li><li>Type : {device_type}</li></ul>',
  '[{"key":"first_name","desc":"Prénom"},{"key":"esp_name","desc":"Nom du périphérique"},{"key":"esp_uid","desc":"UID ESP"},{"key":"device_type","desc":"Type de périphérique"}]'
),

-- Commandes
('order_confirmed', 'Confirmation commande', 'Envoyé après paiement Stripe validé', 'order',
  false, true,
  'Commande confirmée !',
  'Votre commande {order_num} est confirmée. Total : {total}.',
  'Confirmation de votre commande XamIoT — {order_num}',
  '<p>Bonjour {first_name},</p><p>Votre commande a bien été reçue et votre paiement validé.</p><p><strong>Commande :</strong> {order_num}<br><strong>Total :</strong> {total}</p>',
  '[{"key":"first_name","desc":"Prénom"},{"key":"order_num","desc":"Numéro commande"},{"key":"total","desc":"Montant total"},{"key":"items_count","desc":"Nb articles"}]'
),

('order_status_changed', 'Changement statut commande', 'Envoyé à chaque changement de statut', 'order',
  false, true,
  'Commande {order_num} mise à jour',
  'Statut : {status_label}.',
  'Mise à jour de votre commande XamIoT — {order_num}',
  '<p>Bonjour {first_name},</p><p>Le statut de votre commande <strong>{order_num}</strong> a été mis à jour : <strong>{status_label}</strong>.</p>',
  '[{"key":"first_name","desc":"Prénom"},{"key":"order_num","desc":"Numéro commande"},{"key":"old_status","desc":"Ancien statut"},{"key":"new_status","desc":"Nouveau statut"},{"key":"status_label","desc":"Libellé statut"}]'
),

('order_shipped', 'Commande expédiée', 'Envoyé quand le statut passe à shipped', 'order',
  true, true,
  'Commande expédiée !',
  'Votre commande {order_num} est en route.',
  'Votre commande XamIoT est expédiée — {order_num}',
  '<p>Bonjour {first_name},</p><p>Votre commande <strong>{order_num}</strong> a été expédiée !</p>',
  '[{"key":"first_name","desc":"Prénom"},{"key":"order_num","desc":"Numéro commande"},{"key":"tracking_number","desc":"Numéro de suivi"},{"key":"carrier","desc":"Transporteur"}]'
),

-- Tickets
('ticket_created', 'Nouveau ticket support (admin)', 'Envoyé aux admins quand un utilisateur ouvre un ticket', 'ticket',
  false, true,
  'Nouveau ticket : {ticket_subject}',
  'De : {user_email} — Catégorie : {category}',
  '[Admin] Nouveau ticket support : {ticket_subject}',
  '<p>Un nouvel ticket a été ouvert.</p><ul><li>Sujet : {ticket_subject}</li><li>De : {user_email}</li><li>Catégorie : {category}</li><li>Priorité : {priority}</li></ul>',
  '[{"key":"ticket_subject","desc":"Sujet du ticket"},{"key":"user_email","desc":"Email utilisateur"},{"key":"category","desc":"Catégorie"},{"key":"priority","desc":"Priorité"},{"key":"ticket_id","desc":"ID ticket"}]'
),

('ticket_replied_by_admin', 'Réponse admin sur ticket', 'Envoyé à l''utilisateur quand l''admin répond', 'ticket',
  true, true,
  'Réponse à votre ticket',
  'L''équipe a répondu à votre ticket : {ticket_subject}',
  'Réponse à votre ticket XamIoT — {ticket_subject}',
  '<p>Bonjour {first_name},</p><p>L''équipe XamIoT a répondu à votre ticket <strong>{ticket_subject}</strong> :</p><blockquote>{reply_preview}</blockquote>',
  '[{"key":"first_name","desc":"Prénom"},{"key":"ticket_subject","desc":"Sujet du ticket"},{"key":"reply_preview","desc":"Aperçu de la réponse"},{"key":"ticket_url","desc":"URL du ticket"}]'
),

('ticket_status_changed', 'Changement statut ticket', 'Envoyé à l''utilisateur quand le statut change', 'ticket',
  true, true,
  'Ticket mis à jour',
  'Votre ticket "{ticket_subject}" : {status_label}',
  'Mise à jour de votre ticket XamIoT — {ticket_subject}',
  '<p>Bonjour {first_name},</p><p>Le statut de votre ticket <strong>{ticket_subject}</strong> a changé : <strong>{status_label}</strong>.</p>',
  '[{"key":"first_name","desc":"Prénom"},{"key":"ticket_subject","desc":"Sujet"},{"key":"old_status","desc":"Ancien statut"},{"key":"new_status","desc":"Nouveau statut"},{"key":"status_label","desc":"Libellé statut"}]'
),

-- RMA
('rma_created', 'Nouveau RMA (admin)', 'Envoyé aux admins quand une demande RMA est créée', 'rma',
  false, true,
  'Nouveau RMA : {product_sku}',
  'De : {user_email}',
  '[Admin] Nouvelle demande RMA : {product_sku}',
  '<p>Nouvelle demande RMA reçue.</p><ul><li>Produit : {product_sku}</li><li>De : {user_email}</li><li>Motif : {reason}</li></ul>',
  '[{"key":"product_sku","desc":"SKU produit"},{"key":"user_email","desc":"Email utilisateur"},{"key":"reason","desc":"Motif"},{"key":"rma_id","desc":"ID RMA"}]'
),

('rma_status_changed', 'Changement statut RMA', 'Envoyé à l''utilisateur quand le statut RMA change', 'rma',
  true, true,
  'RMA mis à jour',
  'Votre demande RMA ({product_sku}) : {status_label}',
  'Mise à jour de votre demande RMA XamIoT',
  '<p>Bonjour {first_name},</p><p>Votre demande RMA pour le produit <strong>{product_sku}</strong> a été mise à jour : <strong>{status_label}</strong>.</p>',
  '[{"key":"first_name","desc":"Prénom"},{"key":"product_sku","desc":"SKU produit"},{"key":"old_status","desc":"Ancien statut"},{"key":"new_status","desc":"Nouveau statut"},{"key":"status_label","desc":"Libellé statut"}]'
),

-- OTA
('ota_available', 'Firmware disponible', 'Envoyé aux utilisateurs ciblés quand une OTA est créée', 'ota',
  true, true,
  'Mise à jour disponible',
  'Firmware v{fw_version} disponible pour {device_name}.',
  'Mise à jour firmware disponible — {device_name}',
  '<p>Bonjour {first_name},</p><p>Une mise à jour firmware est disponible pour votre périphérique <strong>{device_name}</strong>.</p><p>Version : <strong>v{fw_version}</strong></p>',
  '[{"key":"first_name","desc":"Prénom"},{"key":"device_name","desc":"Nom du périphérique"},{"key":"fw_version","desc":"Nouvelle version"},{"key":"fw_version_before","desc":"Version actuelle"},{"key":"release_notes","desc":"Notes de version"}]'
),

('ota_triggered', 'OTA déclenchée', 'Envoyé quand la mise à jour est envoyée au périphérique', 'ota',
  true, false,
  'Mise à jour en cours',
  'Firmware v{fw_version} en cours d''installation sur {device_name}.',
  'Mise à jour en cours — {device_name}',
  '<p>Bonjour {first_name},</p><p>La mise à jour firmware v<strong>{fw_version}</strong> a été déclenchée sur <strong>{device_name}</strong>.</p>',
  '[{"key":"first_name","desc":"Prénom"},{"key":"device_name","desc":"Nom du périphérique"},{"key":"fw_version","desc":"Version"},{"key":"esp_uid","desc":"UID périphérique"}]'
),

('ota_success', 'OTA réussie', 'Envoyé quand le périphérique confirme la mise à jour', 'ota',
  true, false,
  'Mise à jour réussie !',
  '{device_name} est maintenant en v{fw_version}.',
  'Mise à jour réussie — {device_name}',
  '<p>Bonjour {first_name},</p><p>La mise à jour de <strong>{device_name}</strong> a réussi. Version installée : <strong>v{fw_version}</strong>.</p>',
  '[{"key":"first_name","desc":"Prénom"},{"key":"device_name","desc":"Nom du périphérique"},{"key":"fw_version","desc":"Nouvelle version"},{"key":"fw_version_before","desc":"Ancienne version"},{"key":"esp_uid","desc":"UID périphérique"}]'
),

('ota_failed', 'OTA échouée', 'Envoyé quand la mise à jour échoue définitivement', 'ota',
  true, true,
  'Échec mise à jour',
  'La mise à jour de {device_name} a échoué.',
  'Échec de la mise à jour — {device_name}',
  '<p>Bonjour {first_name},</p><p>La mise à jour firmware de <strong>{device_name}</strong> a échoué.</p><p>Erreur : {error}</p>',
  '[{"key":"first_name","desc":"Prénom"},{"key":"device_name","desc":"Nom du périphérique"},{"key":"fw_version","desc":"Version cible"},{"key":"error","desc":"Message d''erreur"},{"key":"esp_uid","desc":"UID périphérique"}]'
)

ON CONFLICT (event_key) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('044') ON CONFLICT DO NOTHING;
