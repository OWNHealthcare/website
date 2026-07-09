import {
  SITE_URL,
  clientIp,
  isValidEmail,
  makeToken,
  normalizeEmail,
  rateLimited,
  sendMail,
  supabase,
} from './_lib.js';

function confirmMail(token) {
  const url = `${SITE_URL}/api/confirm?token=${token}`;
  return {
    subject: 'Bitte bestätige deine E-Mail-Adresse',
    text:
      `Danke für dein Interesse an OWN Health.\n\n` +
      `Bitte bestätige deine Anmeldung zur Warteliste über diesen Link:\n${url}\n\n` +
      `Wenn du dich nicht angemeldet hast, ignoriere diese E-Mail einfach.\n\n` +
      `OWN Health UG (haftungsbeschränkt), Altonaer Straße 21, 10555 Berlin`,
    html: `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:0;background:#F1F1F1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F1F1;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="background:linear-gradient(160deg,#132532 0%,#1a6080 70%,#3db7ee 140%);background-color:#132532;border-radius:24px 24px 0 0;padding:36px 40px;text-align:center;">
          <span style="font-family:'Google Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;letter-spacing:-0.01em;color:#ffffff;">OWN&nbsp;Health</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:0 0 24px 24px;padding:44px 40px;font-family:'Google Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#132532;">
          <h1 style="margin:0 0 14px;font-size:26px;font-weight:500;letter-spacing:-0.01em;">Fast geschafft</h1>
          <p style="margin:0 0 30px;font-size:15px;line-height:1.7;color:#3d4f5c;">
            Danke für dein Interesse an OWN Health – dem Konto für deine Gesundheit.
            Bitte bestätige noch kurz deine Anmeldung zur Warteliste.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 30px;"><tr><td style="border-radius:100px;background:#132532;">
            <a href="${url}" style="display:inline-block;padding:16px 38px;font-family:'Google Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:100px;">E-Mail bestätigen</a>
          </td></tr></table>
          <p style="margin:0 0 26px;font-size:12px;line-height:1.6;color:#8a96a0;text-align:center;">
            Falls der Button nicht funktioniert:<br>
            <a href="${url}" style="color:#8a96a0;word-break:break-all;">${url}</a>
          </p>
          <hr style="border:none;border-top:1px solid #eef0f2;margin:0 0 22px;">
          <p style="margin:0;font-size:12px;line-height:1.7;color:#8a96a0;">
            Wenn du dich nicht angemeldet hast, ignoriere diese E-Mail einfach.<br>
            OWN Health UG (haftungsbeschränkt) · Altonaer Straße 21 · 10555 Berlin
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (rateLimited(clientIp(req))) {
    return res.status(429).json({ error: 'Zu viele Versuche. Bitte kurz warten.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  // Honeypot: Bots füllen versteckte Felder aus. Wir tun so, als wäre alles gut.
  if (body.website) return res.status(200).json({ ok: true });

  if (!isValidEmail(body.email)) {
    return res.status(400).json({ error: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
  }

  const email = normalizeEmail(body.email);
  const token = makeToken();

  try {
    const existing = await supabase(
      `waitlist?email=eq.${encodeURIComponent(email)}&select=id,confirmed_at`
    );

    if (existing.length && existing[0].confirmed_at) {
      return res.status(200).json({ ok: true, status: 'already_confirmed' });
    }

    if (existing.length) {
      // Noch nicht bestätigt: neuen Token setzen und Mail erneut schicken.
      await supabase(`waitlist?id=eq.${existing[0].id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ confirm_token: token, updated_at: new Date().toISOString() }),
      });
    } else {
      await supabase('waitlist', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ email, confirm_token: token }),
      });
    }

    const mail = confirmMail(token);
    await sendMail({ to: email, ...mail });

    return res.status(200).json({ ok: true, status: 'confirmation_sent' });
  } catch (err) {
    console.error('waitlist error', err);
    return res.status(500).json({ error: 'Da ist etwas schiefgelaufen. Bitte später erneut versuchen.' });
  }
}
