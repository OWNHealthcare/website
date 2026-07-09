import { SITE_URL, clientIp, rateLimited, sendMail, supabase } from './_lib.js';

function welcomeMail() {
  return {
    subject: 'Du stehst auf der Warteliste 🎉',
    text:
      `Deine E-Mail ist bestätigt – du stehst jetzt offiziell auf der OWN-Health-Warteliste.\n\n` +
      `Wir melden uns bei dir, sobald es losgeht. Du musst nichts weiter tun.\n\n` +
      `Bis bald!\nDein OWN-Health-Team\n\n` +
      `OWN Health UG (haftungsbeschränkt), Altonaer Straße 21, 10555 Berlin\n` +
      `Du möchtest von der Warteliste gestrichen werden? Schreib uns an support@ownhealth.eu`,
    html: `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:0;background:#F1F1F1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F1F1;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="background:linear-gradient(160deg,#132532 0%,#1a6080 70%,#3db7ee 140%);background-color:#132532;border-radius:24px 24px 0 0;padding:36px 40px;text-align:center;">
          <span style="font-family:'Google Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;letter-spacing:-0.01em;color:#ffffff;">OWN&nbsp;Health</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:0 0 24px 24px;padding:44px 40px;font-family:'Google Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#132532;">
          <h1 style="margin:0 0 14px;font-size:26px;font-weight:500;letter-spacing:-0.01em;">Willkommen an Bord 🎉</h1>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#3d4f5c;">
            Deine E-Mail ist bestätigt – du stehst jetzt offiziell auf der Warteliste für
            <strong style="color:#132532;">OWN Health</strong>, das Konto für deine Gesundheit.
          </p>
          <p style="margin:0 0 30px;font-size:15px;line-height:1.7;color:#3d4f5c;">
            Wir melden uns bei dir, sobald es losgeht. Du musst nichts weiter tun.
          </p>
          <p style="margin:0 0 30px;font-size:15px;line-height:1.7;color:#132532;font-weight:500;">
            Bis bald!<br>Dein OWN-Health-Team
          </p>
          <hr style="border:none;border-top:1px solid #eef0f2;margin:0 0 22px;">
          <p style="margin:0;font-size:12px;line-height:1.7;color:#8a96a0;">
            OWN Health UG (haftungsbeschränkt) · Altonaer Straße 21 · 10555 Berlin<br>
            Du möchtest von der Warteliste gestrichen werden?
            <a href="mailto:support@ownhealth.eu" style="color:#8a96a0;">Schreib uns</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  };
}

function page(title, message, ok = true) {
  return `<!DOCTYPE html><html lang="de"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} – OWN Health</title>
<link rel="stylesheet" href="/legal.css">
<style>
  .confirm{max-width:520px;margin:0 auto;padding:96px 24px;text-align:center}
  .confirm__title{font-size:28px;margin:24px 0 12px}
  .confirm__text{font-size:16px;line-height:1.6;color:#4b5563;margin:0 0 32px}
  .confirm__link{display:inline-block;color:#132532;font-weight:600;text-decoration:none;border-bottom:1px solid currentColor}
</style>
</head><body>
<main class="confirm">
  <svg width="44" height="44" viewBox="0 0 46.9117 46.9117" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M7.63213 23.4559C7.63213 14.7167 14.7167 7.63213 23.4559 7.63213C32.195 7.63213 39.2482 14.5335 39.2482 23.2726C39.2482 23.7172 39.2297 24.32 39.2232 24.7743H46.8738C46.8976 24.3374 46.9117 23.8982 46.9117 23.4559C46.9106 10.5011 36.4096 0 23.4559 0C10.5022 0 0 10.5011 0 23.4559C0 36.4106 10.5011 46.9117 23.4559 46.9117C23.8191 46.9117 24.1791 46.902 24.538 46.8857V39.2417C24.1802 39.2655 23.8202 39.2796 23.4559 39.2796C14.7167 39.2796 7.63213 32.195 7.63213 23.4559Z" fill="#132532"/>
    <path d="M39.1581 24.7742H31.8621V46.9116H39.1581V24.7742Z" fill="#132532"/>
    <path d="M46.0551 39.2846V31.9886H24.6083V39.2846H46.0551Z" fill="#132532"/>
  </svg>
  <h1 class="confirm__title">${title}</h1>
  <p class="confirm__text">${message}</p>
  <a href="/" class="confirm__link">Zurück zur Startseite</a>
</main>
</body></html>`;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (rateLimited(clientIp(req), 20)) {
    return res.status(429).send(page('Zu viele Versuche', 'Bitte versuche es in einer Minute erneut.', false));
  }

  const token = req.query?.token;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).send(page('Link ungültig', 'Dieser Bestätigungslink ist nicht gültig.', false));
  }

  try {
    const rows = await supabase(`waitlist?confirm_token=eq.${token}&select=id,email,confirmed_at`);

    if (!rows.length) {
      return res
        .status(404)
        .send(page('Link ungültig', 'Dieser Bestätigungslink ist abgelaufen oder wurde bereits verwendet.', false));
    }

    if (rows[0].confirmed_at) {
      return res.status(200).send(page('Schon bestätigt', 'Du stehst bereits auf der Warteliste. Wir melden uns.'));
    }

    await supabase(`waitlist?id=eq.${rows[0].id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        confirmed_at: new Date().toISOString(),
        confirm_token: null,
        updated_at: new Date().toISOString(),
      }),
    });

    // Willkommens-Mail – Fehler hier dürfen die Bestätigung nicht blockieren.
    try {
      await sendMail({ to: rows[0].email, ...welcomeMail() });
    } catch (mailErr) {
      console.error('welcome mail error', mailErr);
    }

    return res.status(200).send(page('Du bist dabei', 'Deine E-Mail ist bestätigt. Wir melden uns, sobald es losgeht.'));
  } catch (err) {
    console.error('confirm error', err);
    return res.status(500).send(page('Etwas ist schiefgelaufen', 'Bitte versuche es später erneut.', false));
  }
}
