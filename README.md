# My Parking Davy — Ghid de Configurare

## Prezentare generală

**My Parking Davy** este o aplicație web statică pentru raportarea parcărilor neregulamentare. Utilizatorii accesează site-ul și trimit sesizări instant — fără cont, fără aplicație instalată.

Stivă tehnologică: HTML + CSS + JavaScript pur, Supabase (bază de date + autentificare), găzduit pe GitHub Pages.

---

## Pasul 1 — Creează un proiect Supabase

1. Mergi la [supabase.com](https://supabase.com) și autentifică-te.
2. Click **New Project** → completează numele și parola bazei de date.
3. Așteaptă ~2 minute până se inițializează proiectul.

---

## Pasul 2 — Creează tabelele (SQL Schema)

În panoul Supabase, mergi la **SQL Editor** și rulează:

```sql
CREATE TABLE complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_type text,
  description text,
  photo_url text,
  ip_address text,
  user_agent text,
  screen_resolution text,
  language text,
  timezone text,
  submitted_at timestamp with time zone DEFAULT now(),
  is_banned boolean DEFAULT false
);

CREATE TABLE banned_ips (
  ip text PRIMARY KEY,
  banned_at timestamp with time zone DEFAULT now(),
  reason text
);
```

---

## Pasul 3 — Configurează Row Level Security (RLS)

Rulează în **SQL Editor**:

```sql
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE banned_ips ENABLE ROW LEVEL SECURITY;

-- complaints: oricine poate insera, doar adminii pot citi/modifica
CREATE POLICY "complaints_insert" ON complaints FOR INSERT WITH CHECK (true);
CREATE POLICY "complaints_select" ON complaints FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "complaints_update" ON complaints FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "complaints_delete" ON complaints FOR DELETE USING (auth.role() = 'authenticated');

-- banned_ips: oricine poate citi (pentru verificare la submit), doar adminii pot modifica
CREATE POLICY "banned_ips_select" ON banned_ips FOR SELECT USING (true);
CREATE POLICY "banned_ips_insert" ON banned_ips FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "banned_ips_delete" ON banned_ips FOR DELETE USING (auth.role() = 'authenticated');
```

---

## Pasul 4 — Creează contul de admin

> **Important:** Parola adminului NU există nicăieri în cod. Ea trăiește exclusiv în baza de date securizată Supabase Auth.

1. În panoul Supabase → **Authentication** → **Users**
2. Click **Invite user** sau **Add user**
3. Introdu email-ul și parola dorită
4. Aceasta este singura locație unde există parola

Chiar dacă cineva citește tot codul sursă public, nu poate găsi sau deduce parola — aceasta nu există în repository.

---

## Pasul 5 — Adaugă cheile Supabase în `app.js`

1. În panoul Supabase → **Settings** → **API**
2. Copiază:
   - **Project URL** → `SUPABASE_URL`
   - **anon / public key** → `SUPABASE_ANON_KEY`
3. Deschide `app.js` și înlocuiește primele două linii:

```js
const SUPABASE_URL = 'https://xxxxxxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6...';
```

### De ce este sigur să expui cheia `anon`?

Cheia `anon` este **intenționat publică** — Supabase a fost proiectat astfel. Aceasta identifică proiectul tău, dar **nu acordă acces la date**. Accesul la date este controlat exclusiv de politicile RLS definite mai sus. Fără autentificare validă, nimeni nu poate citi sesizările.

---

## Pasul 6 — Publică pe GitHub Pages

1. Creează un repository public pe GitHub
2. Încarcă fișierele: `index.html`, `style.css`, `app.js`, `README.md`
3. În repository → **Settings** → **Pages** → selectează branch-ul `main`, folderul `/ (root)`
4. Click **Save**
5. Site-ul va fi disponibil la `https://[username].github.io/[repo-name]/`

---

## Utilizare

| Acțiune | Unde |
|--------|------|
| Trimite sesizare | Pagina principală (home) |
| Vizualizare sesizări | Admin Dashboard (#admin) |
| Blocare IP | Buton „Blochează" în tabel |
| Login admin | #login |

---

## Structura fișierelor

```
my-parking-davy/
├── index.html    # Aplicația completă (o singură pagină)
├── style.css     # Design system neon alb-negru-cyan
├── app.js        # Toată logica: routing, auth, formulare, admin
└── README.md     # Acest ghid
```

---

*My Parking Davy — zero server, zero infrastructură, 100% funcțional.*
