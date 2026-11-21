# Family Planner (Next.js + Drizzle ORM + Neon Postgres)

A full-stack family organization web application built for **Vercel** and **Neon Serverless Postgres**.

## Features

- **Accounts & Households**: Built-in email/password account creation and sign-in with HTTP-only session cookies. Create a new family household or join an existing one with a shareable Family Invite Code.
- **Family & Member Management**: Add and manage adult members and child profiles (with custom avatars and color themes) from Settings or Family Manager.
- **Home Dashboard**: Real-time today timeline with a live `NOW` indicator, per-member status cards, upcoming events, recent Family Wall posts, and activity log.
- **Family Manager**: Per-child medication schedules, dose administration tracking, care profiles (allergies, doctor, emergency contacts, notes), and a **printable Caregiver Sheet** for sitters or grandparents.
- **Tasks**: Categorized household and school tasks with priorities, member assignments, recurring schedules, and linked events.
- **Events & Appointments**: Recurrence engine (`Daily`, `Weekly`, `Monthly`, `Yearly`) supporting single-occurrence overrides/exceptions and full edit audit history with reasons.
- **Family Wall**: Private household feed supporting photos, announcements, reminders, schedule changes, emoji reactions, and comments.

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router) + React 19 + TypeScript
- **Database**: [Neon Serverless Postgres](https://neon.tech/) (`@neondatabase/serverless`)
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/) + `drizzle-kit`
- **Icons**: `lucide-react`

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Neon Database (Optional for Local Preview)

Copy `.env.example` to `.env` and set your Neon connection string:

```bash
cp .env.example .env
```

> **Note:** If `DATABASE_URL` is not configured yet, the application runs with an empty in-memory store so you can create accounts and test locally immediately.

### 3. Push Schema to Neon Postgres

Once `DATABASE_URL` points to your Neon database:

```bash
npm run db:push
```

### 4. Run the Development Server

```bash
npm run dev
```

Open the app, create your first account and family household, and invite other family members using your Family Invite Code in **Settings → Family & Members**.

## Deploying to Vercel with Neon

1. Import this repository into **Vercel**.
2. In your Vercel project dashboard, go to **Storage** → **Connect Store** → **Neon Postgres** (this automatically sets `DATABASE_URL` in your Vercel environment).
3. Run `npx drizzle-kit push` locally (or add `drizzle-kit push && next build` as your build command) to create the tables in Neon.
