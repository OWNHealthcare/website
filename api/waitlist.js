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
    html: `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:32px;background:#f6f7f8;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#232729;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
    <h1 style="font-size:20px;margin:0 0 16px;">Fast geschafft</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">
      Danke für dein Interesse an OWN Health. Bitte bestätige deine Anmeldung zur Warteliste.
    </p>
    <p style="margin:0 0 24px;">
      <a href="${url}" style="display:inline-block;background:#132532;color:#fff;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:14px;font-weight:600;">E-Mail bestätigen</a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0 0 24px;">
      Falls der Button nicht funktioniert: <a href="${url}" style="color:#6b7280;">${url}</a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0;">
      Wenn du dich nicht angemeldet hast, ignoriere diese E-Mail einfach.<br><br>
      OWN Health UG (haftungsbeschränkt)<br>Altonaer Straße 21, 10555 Berlin
    </p>
  </div>
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
