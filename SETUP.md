# OWN Health – Setup Warteliste & Domain

Ablauf: **Supabase → Resend → Vercel Env Vars → Deploy → Cloudflare DNS**.
Dauert insgesamt ca. 30–45 Minuten.

---

## 1. Supabase (Datenbank, EU)

1. [supabase.com](https://supabase.com) → **New project**
2. **Region: `Central EU (Frankfurt)`** — wichtig für die DSGVO.
3. Warten bis das Projekt bereit ist.
4. Links **SQL Editor** → **New query** → Inhalt von `schema.sql` einfügen → **Run**.
5. **Project Settings → API** → diese zwei Werte kopieren:
   - **Project URL** → `SUPABASE_URL`
   - **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ Der `service_role`-Key umgeht alle Sicherheitsregeln. Er gehört **nur** in die
> Vercel-Umgebungsvariablen, niemals ins Frontend oder ins Git-Repo.

**AV-Vertrag:** Supabase → Organization Settings → **Legal Documents** → DPA unterschreiben.
Das brauchst du für dein Verarbeitungsverzeichnis.

**Anmeldungen ansehen:** Table Editor → `waitlist_confirmed` (nur bestätigte). Export über
`…` → *Download as CSV*.

---

## 2. Resend (Bestätigungsmails)

1. [resend.com](https://resend.com) → Account anlegen.
2. **Domains → Add Domain** → `ownhealth.eu`. Region **EU (Ireland)** wählen.
3. Resend zeigt dir DNS-Records (DKIM, SPF, ggf. DMARC). Die trägst du in Schritt 5 bei
   Cloudflare ein. Danach in Resend auf **Verify** klicken.
4. **API Keys → Create** (Permission: *Sending access*) → `RESEND_API_KEY`.

**AV-Vertrag:** Resend → Settings → *Compliance* → DPA.

---

## 3. Vercel: Umgebungsvariablen

Projekt → **Settings → Environment Variables**. Fünf Einträge, jeweils für
*Production*, *Preview* und *Development*:

| Name | Wert |
|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` |
| `RESEND_API_KEY` | `re_...` |
| `SITE_URL` | `https://ownhealth.eu` |
| `FROM_EMAIL` | `OWN Health <noreply@ownhealth.eu>` |

Danach einmal **Redeploy**, sonst greifen die Variablen nicht.

---

## 4. Deploy

```bash
git add .
git commit -m "Warteliste-Backend + Impressum"
git push
```

Vercel baut automatisch. Die Ordnerstruktur `/api/*.js` wird ohne Konfiguration als
Serverless Functions erkannt; `vercel.json` pinnt die Region auf `fra1` (Frankfurt).

**Testen:** Formular mit deiner eigenen Adresse absenden → Mail sollte in <10 s da sein →
Link klicken → „Du bist dabei". In Supabase steht dann `confirmed_at`.

Bei Fehlern: Vercel → **Deployments → Functions → Logs**.

---

## 5. Cloudflare DNS für `ownhealth.eu`

### 5a. Domain in Vercel anmelden
Vercel-Projekt → **Settings → Domains** → `ownhealth.eu` hinzufügen, dann nochmal
`www.ownhealth.eu`. Vercel zeigt dir jetzt die exakten Records an — **nimm die Werte aus
deinem Dashboard**, nicht die aus Anleitungen im Netz (die IP variiert je nach Plan).

### 5b. Records in Cloudflare anlegen
Cloudflare → `ownhealth.eu` → **DNS → Records**:

| Typ | Name | Inhalt | Proxy |
|---|---|---|---|
| A | `@` | *(IP aus dem Vercel-Dashboard, meist `76.76.21.21`)* | **DNS only** (graue Wolke) |
| CNAME | `www` | `cname.vercel-dns.com` | **DNS only** (graue Wolke) |

> ⚠️ **Proxy muss aus sein.** Mit oranger Wolke schlägt Vercels
> Zertifikatsausstellung fehl und du bekommst Redirect-Schleifen.

### 5c. SSL-Modus prüfen
Cloudflare → **SSL/TLS → Overview** → auf **Full (strict)** stellen. `Flexible` erzeugt
Endlos-Redirects.

### 5d. Resend-Records ergänzen
Die DKIM/SPF-Records aus Schritt 2 hier ebenfalls eintragen, ebenfalls **DNS only**.
Wenn du bei Cloudflare Email Routing nutzt, nicht die MX-Records überschreiben.

### 5e. Warten
DNS-Propagation: meist 5–30 Minuten. In Vercel unter *Domains* wird der Haken grün,
sobald das Zertifikat steht.

---

## 6. Danach noch zu erledigen

- [ ] **Datenschutzerklärung ergänzen:** Supabase, Resend und Vercel als Auftragsverarbeiter
      nennen, Rechtsgrundlage für die Warteliste (Art. 6 Abs. 1 lit. a DSGVO – Einwilligung),
      Speicherdauer, Widerrufsrecht.
- [ ] **AV-Verträge** mit Supabase, Resend und Vercel abschließen.
- [ ] **Abmelde-Möglichkeit:** aktuell nur per Mail an `support@ownhealth.eu`. Wenn ihr später
      Newsletter verschickt, braucht ihr einen Unsubscribe-Link.
- [ ] `hero__subtitle` in `index.html` ist unvollständig: „Sicher, " endet mitten im Satz.

---

## Dateien

| Datei | Zweck |
|---|---|
| `api/waitlist.js` | POST-Endpunkt: validiert, speichert, schickt Bestätigungsmail |
| `api/confirm.js` | GET-Endpunkt: prüft Token, setzt `confirmed_at`, zeigt Bestätigungsseite |
| `api/_lib.js` | Geteilte Helfer (Supabase-Client, Mailversand, Rate-Limit) |
| `schema.sql` | Tabelle `waitlist` + RLS + View `waitlist_confirmed` |
| `vercel.json` | Region Frankfurt, Security-Header, `cleanUrls` |
| `.env.example` | Vorlage für die Umgebungsvariablen |

Keine npm-Abhängigkeiten – alles läuft über `fetch` gegen die REST-APIs. Kein Build-Schritt.

## Eingebaute Schutzmaßnahmen

- **Double-Opt-In** – Mail wird erst nach Klick auf den Link als bestätigt gezählt.
- **Honeypot-Feld** – versteckter Input, den nur Bots ausfüllen.
- **Rate-Limit** – 5 Anmeldungen pro IP pro Minute.
- **Row Level Security** – ohne Policies, d.h. nur der Service-Key kommt an die Tabelle.
- **Token** – 256 Bit Zufall, nach Bestätigung gelöscht.
