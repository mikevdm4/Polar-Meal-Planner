# Polar Endurance — Meal Picker

A client-facing meal picker: pick recipes, scale portions to bodyweight/goal, build a shopping list, and log daily meals (now including common snacks, drinks and alcohol). Built with React + Vite + Tailwind, with real accounts (via Supabase Auth) so an athlete's data follows them across devices, plus a coach dashboard.

---

## How accounts & sync work (read this first)

This app has **two account types**:

- **Athletes** sign up with email/password, optionally entering their coach's email to link their account. Once logged in, everything they do (profile, orders, daily logs) is saved to their own row in Supabase automatically — log in on a phone and a laptop with the same account and both show identical data. No manual codes to generate or share.
- **Coaches** sign up separately (choosing "coach" at sign-up) and land on a **dashboard** listing every athlete who entered their email during sign-up. Clicking an athlete shows a read-only summary: their current profile settings, their active order, and their most recent daily logs.

Security is handled by Supabase's **Row Level Security (RLS)** — see `supabase/schema.sql`. In plain terms: an athlete's browser can only ever read or write their own data, and a coach's browser can only *read* (never write) the data of athletes who linked to them at sign-up. This is enforced by the database itself, not just by the app's code, so it holds even if someone tried to call the API directly.

**This means the app's Supabase key is safe to include in the browser bundle** — unlike a typical secret API key, Supabase's anon/public key is designed to be public, precisely because RLS is what actually restricts access.

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
3. Once it's ready, go to the **SQL Editor** (left sidebar) → **New query**, and paste in the contents of `supabase/schema.sql` from this project, then click **Run**. This creates the two tables the app needs (`profiles` and `athlete_data`) with Row Level Security enabled.
4. Go to **Authentication** (left sidebar) → **Providers**, and confirm **Email** is enabled (it is by default). Optionally, under **Authentication → Settings**, you can turn off "Confirm email" if you want athletes to be able to sign up and use the app immediately without clicking a confirmation link — handy while testing, though normally worth leaving on for a real rollout.
5. Go to **Project Settings** (gear icon) → **API**. You need two values from this page:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon / public key** (under "Project API keys") — this one is fine to use in the browser, since Row Level Security is what actually restricts access, not secrecy of this key.

Keep this tab open — you'll paste both values into Vercel in the next step.

---

## Part 3 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (using your GitHub account is easiest — it'll ask permission to see your repos).
2. Click **Add New → Project**, and select the GitHub repository you pushed in Part 1.
3. Vercel auto-detects this as a Vite project. Before clicking Deploy, expand **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | the Project URL from Supabase |
   | `VITE_SUPABASE_ANON_KEY` | the anon/public key from Supabase |

4. Click **Deploy**. After a minute or two you'll get a live URL (something like `polar-meal-picker.vercel.app`).

**From now on:** any `git push` to your `main` branch automatically redeploys. To update environment variables later, go to your project on vercel.com → **Settings → Environment Variables** (and redeploy manually afterwards — env var changes need a fresh deploy to take effect, unlike ordinary code pushes).

---

## Signing up as a coach or athlete

1. Open the live app — you'll land on a sign-in screen.
2. Tap **"New here? Create an account"**.
3. Choose **Coach** or **Athlete**.
   - **Coach**: just needs a name, email and password.
   - **Athlete**: also has an optional "Your coach's email" field — entering the coach's email here is what links the athlete to that coach's dashboard. If left blank, the athlete can still use the app fully, just without a coach able to see their data.
4. From then on, logging in on any device with the same email/password shows the same data automatically — no codes, no manual linking step.

**As a coach**, your dashboard lists every athlete who entered your email at sign-up, with a summary of each one's current profile, order, and recent daily logs (read-only).

---

## Run it locally before deploying

```bash
npm install
npm run dev
```

This needs the same two environment variables available locally — create a `.env.local` file in the project root with:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## What's in this project

- `src/App.jsx` — the whole athlete-facing app (calculator, recipe browser, order builder, shopping list, daily log, gym tab) plus the top-level routing between sign-in, the athlete app, and the coach dashboard
- `src/Auth.jsx` — the sign-in/sign-up screen and the coach dashboard UI
- `src/auth.js` — sign-up/sign-in/profile-lookup functions
- `src/authSync.js` — pulls/pushes an athlete's data to their own Supabase row
- `src/supabaseClient.js` — the Supabase client setup
- `src/data.js` — every recipe plus the food database used for daily logging, now including common snacks, soft drinks, and alcoholic drinks (beer, wine, spirits, RTDs) so a full day's actual eating and drinking can be logged, not just "clean" meals
- `src/dietaryTags.js` — the gluten-free/dairy-free classification and substitution logic
- `supabase/schema.sql` — the two tables (`profiles`, `athlete_data`) and Row Level Security policies the app needs

---

## On the Gousto recipe import — why that's not in here

I looked at the Gousto Recipe Finder link — it's a search tool built on top of Gousto's own recipe catalogue. Recipe names, instructions, and photos from a commercial meal-kit company are their copyrighted content, and importing their catalogue wholesale into another product (even a personal one) isn't something I can do, regardless of which site is hosting it.

What I can do instead, if useful: write more **original** recipes in that same Gousto-style register (quick, ingredient-forward, one-pan/one-tray formats) — the plan already has 300+ recipes built exactly that way. Just say which cuisines or formats you'd like more of, and I'll add them the same way as everything else in the app.

---

## What's built vs. what a bigger version would add

This now has real accounts, proper login, and a coach dashboard — the core "athletes properly managed as a whole" foundation is in place, replacing the earlier device-code approach entirely.

Not yet built, if useful later:
- **Editing from the dashboard** — the coach view is currently read-only; a coach can see an athlete's data but not adjust it directly
- **Password reset flow** — Supabase Auth supports this out of the box, just not wired into this UI yet
- **Multiple coaches per organisation**, or an athlete having more than one coach
- **Notifications** — e.g. a coach getting notified when an athlete logs something notable

Each of these is a genuine but bounded addition on top of what's here now, rather than a re-architecture.
