# 🏁 Pixel Racers

![CI](https://github.com/AmbekarDarshana/typing-race/actions/workflows/ci.yml/badge.svg)

A multiplayer typing race with pixel-art racers. Create a room, share the link, and race your friends in real time.

Built as a hands-on DevOps project: the game is the practice material, the focus is on running it reliably.

## Stack

- **App:** Node.js, Express, Socket.IO
- **State:** Redis (shared across app replicas)
- **Routing:** nginx load balancer in front of 2 app containers
- **Packaging:** Docker + Docker Compose
- **CI:** GitHub Actions runs the tests on every push

## Run it locally

You need Docker Desktop.

    docker compose up -d --build

Then open http://localhost:3000

Stop everything with `docker compose down`.

## Architecture

    Browser -> nginx (:3000) -> app-1 --+
                             -> app-2 --+-> Redis

## Roadmap

- [x] Docker and Compose
- [x] Redis shared state, 2 replicas behind nginx
- [x] CI: tests on every push
- [ ] CI: Docker build and security scan
- [ ] Infrastructure as code (Terraform)
- [ ] Auto-deploy on merge
- [ ] Monitoring (Prometheus + Grafana)