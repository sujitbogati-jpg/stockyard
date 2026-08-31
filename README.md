# Stockyard — Central Warehouse 1117

A standalone version of the warehouse app, rebuilt as a real web app with
persistent data (nothing resets on refresh, and your whole team can use it
from one shared link).

## What's in this project

- **Next.js + React** — the app itself (`pages/`, `components/`)
- **Supabase** — the database (Postgres) that stores stock, movements, and
  picking lists. Schema is in `supabase/schema.sql`.
- A simple shared-password gate (`pages/login.js`) — basic protection so it
  isn't wide open on the internet.

Everything you already have — Goods Receipt/Transfer/Issue, FIFO batch
picking with SKU pooling, picking lists with sequential PL/01, PL/02...
numbers, the migrate-to-Goods-Transfer review screen, your exact Goods
Transfer Note and picking list paper formats, boxes-to-pick calculation,
Movement Log with per-entry undo, and the Import/Fix-a-Mistake tools — is
carried over. Also added in this round:

- **Low-stock reorder alerts** — set a threshold per item (in Stock &
  Batches), and it flags on the Dashboard once total quantity drops below it.
- **Excel exports** — a stock report and a movement report, each one click
  from Stock & Batches / Movement Log.
- **Who-did-what tracking** — logging in now asks for a name, and every
  receipt, transfer, issue, and picking list records who posted it. This is
  self-reported, not secured per-person login — good enough for
  accountability, not for restricting who can do what (that would need real
  per-user accounts, a bigger upgrade).
- **Stock Take** — a new tab to run a physical count: pick a zone (or all),
  enter what's actually counted per item, and completing it posts stock
  adjustments for anything that doesn't match the system quantity.
- **Forecast** — start a monthly forecast cycle, download a blank request
  template to send each project site, paste each site's reply back in (matched
  to SKU, same as picking lists), and see consolidated demand vs current
  stock. Anything short gets a downloadable/exportable purchase requirement
  list — what to buy and how much.

## Before you can run it

You need two free accounts:

1. **[supabase.com](https://supabase.com)** — create a project, then in the
   SQL Editor paste and run everything in `supabase/schema.sql`. This
   creates all the tables the app needs.
2. Copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — found
     in your Supabase project under **Settings → API**.
   - `NEXT_PUBLIC_APP_PASSWORD` — any password you choose for your team.

## Running it locally (to test before going live)

```
npm install
npm run dev
```

Then open `http://localhost:3000`, log in with your app password, and go to
**Import Stock File** to upload your Stock.xlsx.

## Going live on the internet

That's the next step — I'll walk you through it (Vercel hosting, connecting
your GitHub, entering the same environment variables there) whenever you're
ready to follow up.
