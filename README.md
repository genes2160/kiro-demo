# Kiro Demo — Native HTTP vs Bright Data

Live side-by-side comparison demonstrating native HTTP failure vs Bright Data Web Unlocker success.

## Quick Start

```bash
# 1. Copy env file
cp .env.example .env
# Edit .env with your Bright Data credentials

# 2. Build & run
docker build -t kiro-demo .
docker run -p 3000:3000 --env-file .env kiro-demo

# 3. Open http://localhost:3000
```

## Without Bright Data credentials

The app runs in **demo mode** — Bright Data returns simulated realistic data so you can see the full UI and flow. Native HTTP still runs live and will likely be blocked.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `BRIGHTDATA_API_TOKEN` | Your Bright Data API token | (demo mode if absent) |
| `BRIGHTDATA_ZONE` | Your Web Unlocker zone name | `web_unlocker1` |
| `PORT` | Server port | `3000` |

## Architecture

```
User → Next.js UI → /api/query → Promise.all([native, brightdata]) → SQLite → UI
```

## Data Storage

All query results are persisted in SQLite at `/app/data/queries.db`. Mount a volume to persist across container restarts:

```bash
docker run -p 3000:3000 --env-file .env -v $(pwd)/data:/app/data kiro-demo
```

## Dev Mode

```bash
npm install
npm run dev
```
