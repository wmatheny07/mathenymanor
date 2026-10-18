# Matheny Manor

Personal home platform combining AI-powered tools, health data ingestion, media serving, and smart home automation — all self-hosted and accessible remotely via Cloudflare.

---

## What's Here

| Domain | What it does |
|---|---|
| **AI Agents** | Claude-powered web portal for specialized writing and productivity tasks |
| **Health Ingestion** | Receives Apple Health exports and stores them in MinIO for analytics |
| **Media** | Plex media server + WebDAV remote access to the NAS |
| **Home Automation** | Homebridge bridges smart home devices into Apple HomeKit |
| **Tunneling** | Cloudflare tunnel exposes local services externally via mathenymanor.com |

---

## Stack Layout

```
agent_api/      Flask API — AI agent backends (Claude)
agent_web/      React frontend — agent portal UI
health-api/     FastAPI — Apple Health data ingestion endpoint
health-app/     FastAPI — placeholder for future health features
health-data-db/ Postgres setup for health data (planned, not active)
cloudflared/    Cloudflare tunnel configuration
plex/           (managed via host volume at /opt/plex/config)
volumes/        Persistent data (Homebridge config)
logs/           Application logs
```

---

## Services

### AI Agents

**`agent_api`** — Flask backend (port 8000)

Two Claude-powered agents exposed as REST endpoints:

| Agent | Route | Purpose |
|---|---|---|
| CaringBridge Blog Assistant | `/api/agents/blogpost` | Transforms medical notes into compassionate blog posts and companion Facebook content |
| Prompt Assistant | `/api/agents/promptassist` | Helps compose and refine ChatGPT prompts with configurable persona, tone, and constraints |

Responses stream in chunks stored in Redis (7-day session TTL). The frontend polls for results until completion.

**`agent_web`** — React + Vite frontend (port 3000)

Single-page portal routing between the two agents. Built with Tailwind CSS, served via Nginx in a multi-stage Docker build.

**Local dev:**
```bash
cd agent_web
npm install
npm run dev
```

**Docker build:**
```bash
docker build --build-arg VITE_API_URL=http://localhost:8000 -t agent-web .
```

**`redis`** — Session state store for agent workflows.

---

### Health Data

**`health-api`** — FastAPI service (port 8088)

Receives Apple Health data from the [AutoExportHealth](https://github.com/Lybron/health-auto-export) iOS app and writes it to MinIO.

```
POST /health/{category}/json/{person}   # JSON uploads (workouts, metrics)
POST /health/{category}/csv/{person}    # CSV uploads
```

- Authenticated via `X-API-Key` header
- Strips AutoExportHealth header/footer lines from CSV exports before storage
- Writes to MinIO bucket `health-data/{category}/{type}/{person}/` with timestamp-based object names
- Connects to MinIO via `core_data_net` (shared with the PPD stack)

Supported people: `wes`, `amanda`
Supported categories: `workouts`, `metrics`

Once in MinIO, data flows into the PPD analytics pipeline via Airbyte → Postgres → dbt.

---

### Media

**`plex`** — Plex Media Server (host network)

Serves photos, music, movies, and home videos from the NAS. Uses host networking for Plex discovery to work correctly on the local network.

- Media root: `/media/nasdrive/plexmedia`
- Config: `/opt/plex/config`

**`rclone`** — WebDAV server (port 8090)

Exposes the NAS media drive as a WebDAV endpoint for remote file access. Full VFS caching (50GB, 12-hour cache age) for performance.

- Mount: `/media/nasdrive/plexmedia`
- Auth: username + password (from runtime env)

---

### Home Automation

**`homebridge`** — HomeKit bridge (host network)

Integrates smart home devices that don't natively support HomeKit into the Apple Home ecosystem. Config and plugin state persisted at `./volumes/homebridge`.

**`homeassistant`** — Home Assistant Core (host network, port 8123)

Central smart home hub for device automations, dashboards, and integrations. Runs with `network_mode: host` and `privileged: true` for mDNS/SSDP device discovery (HomeKit, Sonos, Chromecast, etc.) and local Bluetooth access (`/run/dbus` mounted read-only). Config persisted at `./volumes/homeassistant`.

Reachable externally at `homeassistant.mathenymanor.com` via nginx/Cloudflare, same mTLS pattern as `homebridge` and `plex`.

---

### Networking

**`cloudflared`** — Cloudflare tunnel

Provides secure external access to local services without opening ports. Tunnels traffic from `mathenymanor.com` (Cloudflare DNS) into the local Docker network.

**Networks:**

| Network | Used by | Purpose |
|---|---|---|
| `mathenymanor.docker` | agent_api, agent_web, redis, rclone | Internal service mesh |
| `core_data_net` | health-api | Access to shared MinIO instance |

---

## Data Flows

```
Apple Health (iOS)
    │
    └── AutoExportHealth app
            │
            ▼
        health-api  ──────────────────────► MinIO (health-data bucket)
                                                    │
                                              Airbyte sync
                                                    │
                                             PPD Postgres
                                                    │
                                              dbt build
                                                    │
                                          Superset / Metabase
```

```
User (browser)
    │
    └── agent_web (React)
            │
            ▼
        agent_api (Flask)
            │
            ├── Anthropic Claude API
            │
            └── Redis (session chunks)
                    │
                agent_web polls until done
```

---

## Deployment

Deploy with `/opt/util/stack.sh -f docker-compose.mathenymanor.yml -e /opt/config/runtime/.env.all -p mathenymanor up`. On each run, `stack.sh` pulls secrets from 1Password by running `op inject` on the template `/opt/config/project/.env.all` and writes the result to `/opt/config/runtime/.env.all`. The runtime file is cleared on `down`, so it's normal for it to be empty between runs. To add or change a secret, edit its `op://` reference in `/opt/config/project/.env.all`.

`docker_compose_op.sh` is legacy and shouldn't be used. It overwrites `/opt/config/.env` with only `OPENAI`, then deletes it.

Key environment variables:

| Variable | Used by |
|---|---|
| `ANTHROPIC_API_KEY` | agent_api |
| `HEALTH_API_KEY` | health-api (API authentication) |
| `MINIO_ROOT_USER / PASSWORD` | health-api |
| `PLEX_CLAIM` | plex |
| `RCLONE_PASS` | rclone |
| `FRONTEND_ORIGIN` | agent_api CORS |
