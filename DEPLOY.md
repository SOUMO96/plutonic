# Put PLUTONIC online for free (Vercel + Supabase)

Both have free plans that are fine for sharing a link with friends and testing. Do this once; every later `git push` updates the site by itself.

## 1. Create the Vercel project (2 minutes)
1. Go to https://vercel.com, sign in with GitHub (free "Hobby" plan).
2. **Add New -> Project** -> pick the `SOUMO96/plutonic` repository -> **Import**.
3. Leave the build settings alone (they are read from `vercel.json`).
4. **Before pressing Deploy**, open **Environment Variables** (next section).

## 2. Environment variables
Open your local `.env.local` next to the Vercel page. In Vercel you can paste the whole file into the first box and it fills the rows in for you. Keep **exactly these** (delete any others, such as the `GEMINI` and `APP_URL` lines):

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | from `.env.local` (public values) |
| `SUPABASE_URL` | same as `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | from `.env.local` (**secret**: never share it) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET` | your real admin login (see below) |
| `AUTOMATION_SECRET` | any long random text, for example 40 random letters and digits |
| `COURIER` | `simulator` (a pretend courier, so orders move through the steps; leave empty when you connect a real courier) |
| `SIM_STEP_SECONDS` | `60` |

**Admin login for the live site.** On your computer run `npm run admin:hash`, choose a long password and copy the three lines it prints into those three variables. Do not reuse the test admin from development, and do not paste your password anywhere else.

Do **not** add the Cashfree keys yet. Without them every payment is simulated (nothing is ever charged).

## 3. Deploy, then make the link public
1. Press **Deploy**. When it finishes you get a link like `https://plutonic-xxxx.vercel.app`.
2. **Production branch:** the project starts from `main`, which still holds the old site. In **Settings -> Git -> Production Branch** type `feat/design-implementation-v2` and save, then **Deployments -> Redeploy**. (Or merge the branch into `main`: ask first, because the old GitHub Pages site is built from `main`.)
3. **Settings -> Deployment Protection**: set **Vercel Authentication** to **Disabled** so people without a Vercel account can open it.
4. Add `SITE_URL` = your new link, then redeploy once more.

## 4. Tell Supabase about the link
Supabase -> **Authentication -> URL Configuration**: set **Site URL** to your Vercel link and add it under **Redirect URLs**. Keep **Confirm email** off while testing.

## 5. Keep the automation moving (free)
The free host has no per-minute scheduler, so the repo includes `.github/workflows/automation-tick.yml`, which asks the site every 5 minutes to run what is due. In GitHub -> **Settings -> Secrets and variables -> Actions** add `SITE_URL` (your link, no slash at the end) and `AUTOMATION_SECRET` (the same text as on Vercel). GitHub only runs schedules from `main`, so this starts once the file is merged to `main`. Until then the automation still runs whenever a signed-in customer places an order or sends a request.

## What "free" means here
- It is a **test shop**: payments are simulated and the courier is pretend. Do not take real money until you add Cashfree keys and a real courier.
- The free plans are fine for friends and early users. Before a real sale follow `SCALING.md`.
