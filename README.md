# Polar Endurance — Meal Picker

A client-facing meal picker: pick recipes, scale portions to bodyweight/goal, build a shopping list, and log daily meals (now including common snacks, drinks and alcohol). Built with React + Vite + Tailwind, with an optional cloud sync backend so a client's data follows them between phone and laptop.

---

## How the sync backend works (read this first)

By default, **all data lives only in the browser's local storage** — nothing syncs anywhere. That's fine for single-device use, but it means a client's phone and laptop see two completely separate, empty profiles.

To fix that, this project includes an **optional sync layer**:

- A **Vercel serverless function** (`/api/sync.js`) — this runs on Vercel's servers, not in the browser, so it can safely hold a secret key
- A **Supabase Postgres database** (free tier) — a single table (`sync_data`) storing one JSON blob per "sync code"
- A **sync code** — an 8-character code (like `7HK4M2XP`) a client generates once on their first device, then types into the Setup tab on any other device to link it

There's **no password, no email, no user accounts** — the code itself *is* the key. Anyone with the code can read/write that data, so treat it like a shared PIN: fine for one person syncing their own two devices, not something to publish. If you later want real accounts (so you as the coach can see every client's data, or so losing a code doesn't mean losing data), that's a bigger step — see "Growing this into real accounts" at the bottom.

**Conflict handling is intentionally simple:** last write wins. If someone edits their order on two devices at the exact same moment, whichever save reaches the server last overwrites the other. For a solo user syncing their own phone and laptop, this is a non-issue in practice.

---

## Part 1 — Get the code onto GitHub

1. **Create a GitHub account** if you don't have one: [github.com/signup](https://github.com/signup)
2. **Create a new, empty repository** — on github.com, click the **+** in the top right → **New repository**. Give it a name (e.g. `polar-meal-picker`), leave it empty (don't add a README/gitignore there, since this project already has them), and click **Create repository**.
3. **On your own computer**, unzip this project folder, open a terminal inside it, and run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
   (GitHub will show you this exact set of commands on the empty repo's page too — you can copy them from there instead of retyping.)

You now have the project on GitHub. Any time you make changes locally, `git add .`, `git commit -m "..."`, `git push` sends the update — and once connected to Vercel (next section), every push automatically redeploys the live site.

---

## Part 2 — Set up the database (Supabase)

1. Go to [supabase.com](https://supabase.com) and sign up (free tier is plenty for this).
2. Click **New Project**. Give it a name, set a database password (save it somewhere, though you won't need it directly), pick a region close to you, and create it — takes about a minute to provision.
3. Once it's ready, go to the **SQL Editor** (left sidebar) → **New query**, and paste in the contents of `supabase/schema.sql` from this project, then click **Run**. This creates the one table the app needs.
4. Go to **Project Settings** (gear icon) → **API**. You need two values from this page:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **service_role key** (under "Project API keys" — click "Reveal" to see it). **Not** the `anon` key — the service_role key, since it needs to bypass row-level security from the server.

Keep this tab open — you'll paste both values into Vercel in the next step.

---

## Part 3 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (using your GitHub account is easiest — it'll ask permission to see your repos).
2. Click **Add New → Project**, and select the GitHub repository you pushed in Part 1.
3. Vercel auto-detects this as a Vite project. Before clicking Deploy, expand **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | the Project URL from Supabase |
   | `SUPABASE_SERVICE_KEY` | the service_role key from Supabase |

4. Click **Deploy**. After a minute or two you'll get a live URL (something like `polar-meal-picker.vercel.app`).

That's it — the frontend *and* the `/api/sync` backend function both deploy together automatically, since Vercel picks up anything in the `/api` folder as a serverless function with no extra configuration.

**From now on:** any `git push` to your `main` branch automatically redeploys. To update environment variables later, go to your project on vercel.com → **Settings → Environment Variables**.

---

## Using sync as a client

1. Open the app, go to **Setup → Sync across devices**.
2. Tap **Set up sync (new code)** — this generates a code and immediately saves the current device's data under it.
3. On the second device, open the same app, go to **Setup → Sync across devices → I have a code**, type in the code, and tap **Link**. That device pulls down the first device's data.
4. From then on, both devices push their changes to the same cloud record automatically in the background (a couple of seconds after any change, no button to press).

---

## Run it locally before deploying

```bash
npm install
npm run dev
```

The `/api/sync` function won't work in plain `npm run dev` (that only serves the frontend) — to test the backend locally too, use the Vercel CLI instead:

```bash
npm install -g vercel
vercel dev
```

This needs the same two environment variables available locally — either run `vercel env pull` after linking the project (`vercel link`), or create a `.env.local` file with:

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

---

## What's in this project

- `src/App.jsx` — the whole app (calculator, recipe browser, order builder, shopping list, daily log, gym tab, sync settings)
- `src/data.js` — every recipe plus the food database used for daily logging, now including common snacks, soft drinks, and alcoholic drinks (beer, wine, spirits, RTDs) so a full day's actual eating and drinking can be logged, not just "clean" meals
- `src/cloudSync.js` — the client-side half of the sync feature
- `api/sync.js` — the Vercel serverless function (the backend)
- `supabase/schema.sql` — the one table the backend needs

---

## On the Gousto recipe import — why that's not in here

I looked at the Gousto Recipe Finder link — it's a search tool built on top of Gousto's own recipe catalogue. Recipe names, instructions, and photos from a commercial meal-kit company are their copyrighted content, and importing their catalogue wholesale into another product (even a personal one) isn't something I can do, regardless of which site is hosting it.

What I can do instead, if useful: write more **original** recipes in that same Gousto-style register (quick, ingredient-forward, one-pan/one-tray formats) — the plan already has 200+ recipes built exactly that way. Just say which cuisines or formats you'd like more of, and I'll add them the same way as everything else in the app.

---

## Growing this into real accounts (if you want it later)

The sync-code approach above is deliberately the lightest version that actually solves "my phone and laptop show different things." If down the line you want:

- **Real login** (email/password or magic link) so a lost code doesn't mean lost data
- **You, the coach, able to see all your clients' data** in one place
- **Proper per-client permissions**

...that's a genuinely bigger step (adding Supabase Auth, a users table linking accounts to their data, and a coach-facing dashboard), but it builds directly on top of what's here — the `sync_data` table and `/api/sync` function would just get a real `user_id` instead of an anonymous code. Worth doing once you know this is being used for real, rather than building it speculatively now.
