# Kiro Demo — Native HTTP vs Bright Data

## What is this?

This project demonstrates a fundamental limitation of standard web scraping: **native HTTP requests get blocked**. Most websites protect their data with bot detection, rate limiting, CAPTCHAs, and IP-based blocking. A plain `fetch()` call will be rejected, return garbage, or silently fail.

**Bright Data's Web Unlocker** solves this. It routes requests through a managed proxy network with automatic fingerprint rotation, CAPTCHA solving, and request retries — making blocked pages reliably accessible.

This app runs both approaches **side by side in real time**, so you can see exactly where native HTTP falls short and where Bright Data succeeds.

---

## Objective

Show developers, PMs, and clients the concrete difference between:

- A raw HTTP request (fast, cheap, unreliable — gets blocked)
- A Bright Data Web Unlocker request (slightly slower ONLY for scraping - efficient nonetheless and, consistently succeeds)

Results from both are written to an external Postgres database so you can audit, compare, and analyse query outcomes over time.

---

## Prerequisites

You need two things before running this app:

| Requirement | What it's for | Where to get it |
|---|---|---|
| `DATABASE_URL` (required) | Stores all query results persistently | Your external Postgres instance |
| `BRIGHTDATA_API_TOKEN` (optional) | Enables real Web Unlocker requests | [brightdata.com](https://brightdata.com) |

> **No Bright Data token?** The app runs in demo mode — Bright Data responses are simulated so you can explore the full UI and flow. Native HTTP still fires live and will likely get blocked.

---

## How it works

```
User submits a query
        │
        ▼
  Next.js frontend
        │
        ▼
   /api/query endpoint
        │
   Promise.all()
   ┌────┴────┐
   │         │
   ▼         ▼
Native    Bright Data
 fetch    Web Unlocker
(blocked  (succeeds,
 / fails)  returns data)
   │         │
   └────┬────┘
        │
        ▼
  Both results saved
  to Postgres DB
        │
        ▼
  UI renders side-by-side
  comparison with status,
  response time, and data
```

---

## Quick Start

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env — add DATABASE_URL and optionally BRIGHTDATA_API_TOKEN

# 2. Build and run
docker build -t kiro-demo .
docker run -p 3000:3000 --env-file .env kiro-demo

# 3. Open http://localhost:3000
```

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | required |
| `BRIGHTDATA_API_TOKEN` | Bright Data API token | demo mode if absent |
| `BRIGHTDATA_ZONE` | Web Unlocker zone name | `web_unlocker1` |
| `PORT` | Server port | `3000` |

---

## Dev Mode

```bash
npm install
npm run dev
```
