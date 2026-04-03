// src/activation-template.js
export function renderActivationPage({ ok, error }) {
  const logoUrl = "https://xamiot.com/wp-content/uploads/2025/10/Icone_any.png";
  const baseStyle = `
    <style>
      body{font-family:Arial,sans-serif;text-align:center;background-color:#f9f9f9;padding:20px;}
      .container{max-width:500px;margin:50px auto;background:white;padding:30px;border-radius:8px;box-shadow:0 0 10px rgba(0,0,0,0.1);}
      .logo{margin-bottom:20px;}
      .success{color:#27ae60;}
      .error{color:#e74c3c;}
      h1{color:#2c3e50;}
      a{color:#3498db;text-decoration:none;}
    </style>
  `;

  if (ok) {
    return `
      <!DOCTYPE html><html lang="fr"><head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Activation réussie</title>${baseStyle}
      </head><body>
        <div class="container">
          <div class="logo"><img src="${logoUrl}" alt="XamIoT Logo" style="max-width:120px;"></div>
          <h1>Activation de votre compte</h1>
          <div class="success">
            <h2>✅ Votre compte a été activé avec succès !</h2>
            <p>Vous pouvez maintenant vous <a href="https://xamiot.com/login">connecter</a>.</p>
          </div>
        </div>
      </body></html>
    `;
  } else {
    let title, message;
    switch (error) {
      case 'activation_token_expired':
        title = "⏳ Lien expiré";
        message = "Le lien d'activation a expiré. Veuillez <a href='https://xamiot.com/resend-activation'>demander un nouveau lien</a>.";
        break;
      case 'activation_token_invalid':
        title = "❌ Lien invalide";
        message = "Le lien d'activation est invalide. Veuillez vérifier l'URL ou <a href='https://xamiot.com/resend-activation'>demander un nouveau lien</a>.";
        break;
      case 'already_active_or_not_found':
        title = "⚠️ Compte déjà activé";
        message = "Ce compte est déjà activé ou n'existe pas. Si vous rencontrez des problèmes, <a href='mailto:support@xamiot.com'>contactez le support</a>.";
        break;
      default:
        title = "❌ Erreur";
        message = "Une erreur est survenue. Veuillez réessayer ou <a href='mailto:support@xamiot.com'>contacter le support</a>.";
    }
    return `
      <!DOCTYPE html><html lang="fr"><head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Erreur d'activation</title>${baseStyle}
      </head><body>
        <div class="container">
          <div class="logo"><img src="${logoUrl}" alt="XamIoT Logo" style="max-width:120px;"></div>
          <h1>${title}</h1>
          <div class="error"><p>${message}</p></div>
        </div>
      </body></html>
    `;
  }
}
