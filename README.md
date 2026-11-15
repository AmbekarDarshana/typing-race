# 🏁 Pixel Racers

![CI](https://github.com/AmbekarDarshana/typing-race/actions/workflows/ci.yml/badge.svg)

A multiplayer typing race with pixel-art racers. Create a room, share the link, and race your friends in real time.

Built as a hands-on DevOps project: the game is the practice material, the focus is on building, shipping and watching it reliably.

## Stack

- **App:** Node.js, Express, Socket.IO
- **State:** Redis (shared across app replicas)
- **Routing:** nginx load balancer in front of 2 app containers
- **Packaging:** Docker + Docker Compose
- **CI:** GitHub Actions (test, build, Trivy security scan, push to GHCR)
- **CD:** pull-based auto-deploy with health check and automatic rollback
- **IaC:** Terraform (Docker provider, local demo)
- **Monitoring:** Prometheus + Grafana

## Architecture

    Browser -> nginx (:3000) -> app-1 --+
                             -> app-2 --+-> Redis

    Prometheus (:9090) --scrapes /metrics--> app-1, app-2 (directly, not via nginx)
    Grafana    (:3001) --queries--> Prometheus

## Run it locally

You need Docker Desktop.

    docker compose up -d --build

Then open http://localhost:3000

Stop everything with `docker compose down`.

Grafana: http://localhost:3001, Prometheus: http://localhost:9090 (both bound to `127.0.0.1` only).

## CI pipeline

On every push and pull request (`.github/workflows/ci.yml`):

1. Run tests
2. Build the Docker image
3. Scan the image with **Trivy**. The pipeline fails on HIGH or CRITICAL vulnerabilities
4. Push the image to GitHub Container Registry as
   `ghcr.io/ambekardarshana/typing-race:latest` and `:<commit-sha>`

## CD: how auto-deploy works

I chose **pull-based CD**. A self-hosted GitHub runner on my own laptop was rejected on purpose: the repo is public, so anyone's pull request could run code on my machine.

Instead, a Windows Task Scheduler job (`PixelRacersCD`) runs `deploy.ps1` every 5 minutes:

1. Pull `ghcr.io/ambekardarshana/typing-race:latest`
2. Compare its image ID with the running one. If equal, log `No change` and stop
3. Otherwise redeploy using `compose.yaml` + `compose.prod.yaml`
4. Health-check `http://localhost:3000/health` (up to 12 tries, 5 s apart)
5. If healthy, log `Deploy OK`. If not, **roll back** to the previous image and remember the bad image ID, so it is not deployed again

### Rollback: tested, not assumed

I pushed a deliberately broken image (`CMD ["node", "does-not-exist.js"]`). CI was green, because the image builds fine. It only fails at runtime. From `deploy.log`:

    16:22:15  Deploying new image sha256:6599daad... (old: 1d25a8...)
    16:23:40  Health check FAILED
    16:23:46  Rolled back to sha256:1d25a8...
    16:27:12  Latest image is known-bad, skipping   (repeated every 5 min)
    16:37:15  Deploying new image sha256:dbb63a...  (after git revert)
    16:37:22  Deploy OK

The app stayed available on the previous image. After `git revert`, the fixed image was picked up automatically.

## Monitoring

The app exposes Prometheus metrics at `/metrics` (via `prom-client`):

| Metric | Type | Meaning |
|---|---|---|
| `typingrace_players_connected` | gauge | Currently connected players |
| `typingrace_races_started_total` | counter | Races started |
| `typingrace_races_finished_total` | counter | Races finished |
| `typingrace_rooms_created_total` | counter | Rooms created |
| `typingrace_http_requests_total{status}` | counter | HTTP requests by status |
| default Node.js metrics | | memory, CPU, event loop |

Design choices:
- nginx returns **404 for `/metrics`**, so metrics are not public
- Prometheus discovers both replicas through Docker DNS (`dns_sd_configs`) and scrapes each one directly. Going through nginx would return a random replica each time
- The Grafana datasource is **provisioned from a file** (`monitoring/grafana/provisioning/`)
- The dashboard is exported as `monitoring/grafana/pixel-racers-dashboard.json`

Import the dashboard: Grafana, Dashboards, New, Import, upload the JSON, choose the Prometheus datasource.

Dashboard panels: replicas up, players connected, races started (1h), memory per replica.

![Grafana dashboard](docs/grafana-dashboard.png)

![Prometheus targets](docs/prometheus-targets.png)

### Failure demo

I stopped one replica with `docker stop typing-race-app-1`. The "replicas up" panel dropped from 2 to 1 and the game kept working. After `docker start`, it went back to 2.

![Replica down](docs/grafana-replica-down.png)

## Infrastructure as code

`infra/` contains a small Terraform setup using the **Docker provider**: it pulls `nginx:alpine` and runs a container on port 8080. I ran the full cycle (`init`, `plan`, `apply`, `destroy`) locally. This is a learning exercise on the Terraform workflow and state, not a cloud deployment.

## Honest notes

- Everything runs on my **local machine**. Nothing is exposed to the internet and no cloud was used
- The CD script updates **only the app image**. Changes to `compose.yaml`, `nginx.conf` or Prometheus config need a manual `docker compose -f compose.yaml -f compose.prod.yaml up -d` (and `restart nginx` for nginx config)
- The scheduled task was found **disabled several times**. I could not find the cause. Running `.\deploy.ps1` by hand is the fallback
- Running the script by hand while the scheduled task fires can deploy twice. I saw this in `deploy.log`, both runs were OK
- Rollback only protects against failures caught by the health check at deploy time
- The Grafana dashboard lives in a Docker volume. The JSON in the repo is the backup, and it is not auto-provisioned
- Grafana has a login (admin password changed), Prometheus has none. Both listen on localhost only

## Roadmap

- [x] Docker and Compose
- [x] Redis shared state, 2 replicas behind nginx
- [x] CI: tests on every push
- [x] CI: Docker build, Trivy security scan, push to GHCR
- [x] Infrastructure as code (Terraform)
- [x] Auto-deploy on merge (pull-based CD with rollback)
- [x] Monitoring (Prometheus + Grafana)