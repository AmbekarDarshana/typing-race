# Learning Log: Pixel Racers (Typing Race DevOps Project)

A real-time multiplayer typing game that I built, containerized, and am taking through a full DevOps pipeline.

## Project Progress

| Phase | Status |
|---|---|
| App (Node, Express, Socket.IO) | Done |
| Unit tests (`node --test`) | Done |
| Docker (Dockerfile) | Done |
| Docker Compose (app + Redis) | Done |
| App uses Redis, 2 app containers | Next |
| CI with GitHub Actions | Planned |
| Terraform, CD | Planned |
| Prometheus + Grafana | Planned |

---

## 1. The App

**Backend** (`server.js`, runs on the server): rooms, race text, progress, WPM, accuracy, results.
**Frontend** (`public/index.html`, runs in the browser): the UI, pixel sprites, track, countdown.
**Socket.IO** is the live two-way connection between them.

### In my own words
- What is a WebSocket, and how is it different from a normal HTTP request?
  > ...
- Why does `/health` exist?
  > ...
- What is the difference between `socket.emit` and `io.to(room).emit`?
  > ...

### Security habits I used
- **Never trust user input:** `cleanRoom`, `cleanName`, `cleanAvatar` and `cleanMode` check everything the browser sends.
- **XSS:** I used `textContent` instead of `innerHTML` for user names, so a name like `<script>` can't run code.
- **Secrets:** `.env` is in `.gitignore`.

---

## 2. Git and GitHub

| Command | Meaning |
|---|---|
| `git status` | What changed |
| `git add .` | Stage all changes |
| `git commit -m "..."` | Save a snapshot |
| `git push` | Upload to GitHub |
| `git log --oneline` | History |

Commit message style: `feat:` new feature, `fix:` bug fix, `test:` tests, `docs:` documentation.

### In my own words
- Why is `node_modules` in `.gitignore`?
  > ...

---

## 3. Testing

- Logic lives in `logic.js`, and tests live in `logic.test.js`.
- `npm test` runs `node --test` (Node's built-in test runner).
- **Break-it test:** changing `/ 5 /` to `/ 4 /` in `calcWpm` made a test fail. This is what CI will catch on every push.

### In my own words
- Why did I move the logic out of `server.js` before writing tests?
  > ...

---

## 4. Docker

**Image** = a packaged blueprint (code + Node + dependencies).
**Container** = a running copy of an image.

| Command | Meaning |
|---|---|
| `docker build -t name:tag .` | Build an image from the Dockerfile |
| `docker images` | List images |
| `docker run -d --name x -p 3000:3000 img` | Start a container |
| `docker ps` / `docker ps -a` | Running / all containers |
| `docker logs x` | App output |
| `docker stop x` / `docker start x` | Stop / start |
| `docker rm -f x` | Delete |

### Dockerfile decisions
- `COPY package*.json` and `npm ci` **before** `COPY . .`, so Docker's layer cache skips the slow install when only code changes.
- `USER node`, so the app doesn't run as root.
- `HEALTHCHECK` pings `/health`.
- `.dockerignore` keeps `node_modules` and `.env` out of the image.
- `-p 3000:3000` is `host_port:container_port`.

### In my own words
- Image vs container:
  > ...
- Why copy `package.json` before the rest of the code?
  > ...

### Experiment: two containers, two brains
I ran two copies on ports 3000 and 3001. A room created on one did not exist on the other, because each container keeps race state in its own memory. **This is why Redis is needed.**

---

## 5. Docker Compose

`compose.yaml` describes the whole stack, and `docker compose up -d --build` starts it.

| Command | Meaning |
|---|---|
| `docker compose up -d --build` | Build and start everything |
| `docker compose ps` | Status |
| `docker compose logs -f app` | Live logs |
| `docker compose exec redis redis-cli ping` | Run a command inside a container |
| `docker compose stop redis` / `start redis` | Control one service |
| `docker compose down` | Remove containers and network (**volumes stay**) |

### Key ideas
- Services reach each other **by service name** (`redis://redis:6379`), not `localhost`.
- Redis has **no `ports:`**, so only containers on the private network can reach it (least privilege).
- `depends_on` with `service_healthy` starts the app only after Redis answers.
- The `redis-data` volume keeps data after the container is deleted.
- `restart: unless-stopped` restarts crashed containers.

### In my own words
- Why does Redis have no `ports:`?
  > ...
- What does `docker compose down` remove, and what does it keep?
  > ...
- Why is `localhost` inside a container not my laptop?
  > ...

---

## 6. Bugs I Hit and How I Fixed Them

| Problem | Cause | Fix | Lesson |
|---|---|---|---|
| `Cannot GET /health` | The route wasn't in `server.js` (or the file was unsaved) | Added the route, saved, restarted | Always save and restart Node after changes |
| `ReferenceError: races is not defined` | The `const races = {}` line was missing | Added it above `io.on("connection")` | Read the first error line and the line number |
| `localhost refused to connect` | The server had stopped (prompt came back) | Restarted it | A blinking cursor means running, a prompt means stopped |
| Git showed 963 changes | `node_modules` wasn't ignored | Added `.gitignore` | Never commit dependencies |
| `.gitignore` inside `app/` | Created in the wrong folder | Moved it to the repo root | Folder location matters |
| Raw CSS shown on the page | CSS pasted outside `<style>` | Moved it inside the tag | Check what is inside what |
| `tests 0` | `logic.js` and `logic.test.js` were outside `app/` | Moved them into `app/` | `./` means the same folder, and the test runner only looks where you run it |
| `localhost` doesn't work on a friend's device | `localhost` means "this device" | Needs the LAN IP, a tunnel, or real deployment | This is the problem deployment solves |

### My own bugs (add new ones here)
- ...

---

## 7. Interview Answers (practice out loud)

**"Tell me about this project."**
> I built a real-time multiplayer typing game with a Node.js and Socket.IO backend, then containerized it with Docker, orchestrated it with Docker Compose and Redis, and am adding CI/CD, infrastructure as code, and monitoring.

**"Why Docker?"**
> ...

**"Why Redis?"**
> ...

**"What does a health check do?"**
> ...

**"What would you do if a container keeps crashing?"**
> (Hint: `docker ps -a`, `docker logs`, the health status, then the restart policy.)
> ...

---

## 8. Still Confusing (ask about these)
- ...
## Steps 13-15: Redis, nginx, resilience tests, CI

### Bugs I hit and how I fixed them

| Problem | Cause | Fix |
|---|---|---|
| `SplattingNotPermitted` on `npm install` | `@` is special in PowerShell | Put the package name in quotes: `"@socket.io/redis-adapter"` |
| npm tried to clone a GitHub repo | I typed `socket.io/redis-adapter` without `@`, npm read it as a GitHub shorthand | Use the full name with `@`, in quotes |
| Endless `redis error:` lines with `npm start` | App now needs Redis, but I ran it outside Docker | Run the app only with `docker compose up` |
| `ngnix.conf` not found | Typo in the file name, and file was in the wrong folder | Rename to `nginx.conf` and move to `nginx/` |
| `not a directory` mount error | `compose up` ran before the file existed, so Docker created a folder named `nginx.conf` | Delete the folder, put the real file there, run `up` again |
| `ENOENT package.json` | Ran `npm start` in the repo root, but `package.json` is in `app/` | Check the folder first (`pwd`, `ls`) |
| `docker composer`, `curl.exxe` | Typos | Copy-paste commands, use the up arrow to edit old ones |

Habit I learned: before running a fix command, run `ls` or `docker compose ps` to see the real current state.

### What I learned from breaking things on purpose

- **Stopped Redis:** `/health` returned 503, rooms could not be created. When Redis came back, everything recovered by itself.
- **Stopped one app container:** the other one kept serving and the browser reconnected. No data was lost because the data lives in Redis, not in the app.
- **Page still loaded with Redis down:** `index.html` is a static file. Only actions that need Redis failed. This is a partial failure (degraded mode).
- **`unhealthy` does not restart a container.** Only a crash triggers `restart: unless-stopped`.
- **Redis is a single point of failure.** App copies are replaceable.
- **Known limitation:** if an app container dies, its players stay in Redis until the TTL expires (1 hour). A heartbeat would fix this.

### CI with GitHub Actions

- Every push runs `npm ci` and `npm test` on a fresh Linux machine.
- I broke a test on purpose and CI went red (run #2), then I removed it and CI went green (run #3).
- README has a CI badge that shows the live status.

## Step 16-19: CI scan, GHCR, Terraform

### Bugs and fixes

| Problem | Reason | Fix / Lesson |
|---|---|---|
| `Unable to resolve action trivy-action@0.28.0` | Wo version tag exist hi nahi karta tha | Version pin karne se pehle tags page check karo, guess mat karo |
| Trivy green tick, par 6 HIGH CVEs the | `exit-code "0"` ka matlab scan fail hone par bhi build pass | Green tick != secure. Gate ke liye `exit-code "1"` |
| CVEs `brace-expansion` aur `undici` | Wo app ke nahi, base image ke **npm** ke andar the (`/usr/local/lib/node_modules/npm`) | Runtime image se npm hata diya (`rm -rf ...npm`). Runtime ko npm chahiye hi nahi |
| Trivy `Total:` line nahi dikhi | Trivy `Total:` tab hi print karta hai jab kuch mile | Line ka na hona = kuch nahi mila |
| CI #12 red | `ci.yml` mein YAML indentation galat thi | Khud fix kiya. YAML mein spaces ka matlab hota hai |
| `Hashicrop.Terraform` not found | Typo (`Hashicorp`) | Commands copy-paste karo |
| `terraform apply` cancelled | `y` type kiya, Terraform ko poora `yes` chahiye | Safety feature hai |
| `terraform destroy` image delete nahi kar paaya | Wahi `nginx:alpine` image `typing-race-nginx-1` bhi use kar raha tha | `terraform state rm docker_image.nginx` (sirf state se hatata hai). Demo ke liye alag image behtar hoti |
| `git add .` ne `.terraform/` utha liya | `.gitignore` mein `.env.terraform/` ek hi line ban gayi (newline missing) | Har entry alag line par. `git add .` se pehle `git status`. `git reset` se unstage |

### Concepts
- **Pipeline order:** test -> build -> Trivy scan -> (sirf push event par) GHCR push. Scan fail to push nahi hota.
- **Tags:** image `:sha` (exact commit) aur `:latest` dono tags se push hoti hai.
- **Image apne aap update nahi hoti:** code badalne ke baad `docker compose up -d --build` chahiye. CI wali image sirf build check aur registry ke liye hai, wo chalti nahi.
- **Terraform:** config file batati hai "kya hona chahiye". `plan` = sirf dikhata hai, `apply` = karta hai, `destroy` = hatata hai.
- **State file (`terraform.tfstate`):** Terraform ki memory. Git mein kabhi nahi. `.terraform.lock.hcl` Git mein jaati hai (provider version pin, `requirements.txt` jaisa).
- **Idempotent:** dobara `plan` chalao to `No changes`.
- **Drift:** `docker rm -f` ke baad `plan` ne `1 to add` dikhaya. `apply` ne sirf missing container banaya.