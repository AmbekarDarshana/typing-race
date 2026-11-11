const os = require("os");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const { cleanRoom, cleanName, countCorrect, calcWpm, calcAccuracy } = require("./logic");

const INSTANCE = os.hostname(); // inside Docker this is the container ID
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const TTL = 3600; // rooms expire from Redis after 1 hour
const GRACE_MS = 15000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// disableOfflineQueue: if Redis is down, fail fast instead of hanging
const redis = createClient({ url: REDIS_URL, disableOfflineQueue: true });
const sub = redis.duplicate();
redis.on("error", (e) => console.error("redis error:", e.message));
sub.on("error", (e) => console.error("redis sub error:", e.message));

app.use(express.static("public"));

// Health now checks the dependency too
app.get("/health", async (req, res) => {
  try {
    await redis.ping();
    res.json({ status: "ok", instance: INSTANCE, uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: "error", instance: INSTANCE, redis: "down" });
  }
});

const TEXTS = {
  easy: [
    "The cat sat on the mat.",
    "Type fast and win the race.",
    "Pixels are tiny squares of fun.",
    "A frog can jump very high.",
  ],
  normal: [
    "The quick brown fox jumps over the lazy dog.",
    "DevOps is about shipping code faster and safer.",
    "Docker containers package your app with everything it needs.",
    "Automation turns boring manual work into a pipeline.",
  ],
  devops: [
    "docker build -t typing-race .",
    "docker compose up -d --build",
    "git commit -m \"fix: update config\"",
    "kubectl get pods -n production",
    "terraform plan -out=tfplan",
    "npm ci && npm test && npm start",
    "curl -f http://localhost:3000/health",
  ],
};
const AVATARS = ["cat", "frog", "robot", "ghost"];

function randomText(mode) {
  const list = TEXTS[mode] || TEXTS.normal;
  return list[Math.floor(Math.random() * list.length)];
}
function cleanAvatar(avatar) {
  return AVATARS.includes(avatar) ? avatar : "cat";
}
function cleanMode(mode) {
  return TEXTS[mode] ? mode : "normal";
}

// If a handler throws, log it instead of crashing the whole server
const safe = (fn) => async (...args) => {
  try {
    await fn(...args);
  } catch (e) {
    console.error("handler error:", e.message);
  }
};

// ---------- Redis data layout ----------
// race:<room>     hash: text, mode, status, startTime, round, finishedCount
// players:<room>  hash: socketId -> JSON of that player
const raceKey = (room) => "race:" + room;
const playersKey = (room) => "players:" + room;

async function getRace(room) {
  const race = await redis.hGetAll(raceKey(room));
  return Object.keys(race).length ? race : null;
}

async function getPlayers(room) {
  const all = await redis.hGetAll(playersKey(room));
  return Object.values(all).map((json) => JSON.parse(json));
}

function newPlayer(id, data) {
  return {
    id,
    name: cleanName(data.name, id),
    avatar: cleanAvatar(data.avatar),
    progress: 0,
    wpm: 0,
    finished: false,
    place: null,
    timeMs: null,
    accuracy: 100,
    keys: 0,
    mistakes: 0,
    lastLen: 0,
  };
}

function resetPlayer(p) {
  return {
    ...p,
    progress: 0,
    wpm: 0,
    finished: false,
    place: null,
    timeMs: null,
    accuracy: 100,
    keys: 0,
    mistakes: 0,
    lastLen: 0,
  };
}

async function broadcast(room) {
  const race = await getRace(room);
  if (!race) return;
  io.to(room).emit("race:update", {
    status: race.status,
    mode: race.mode,
    players: await getPlayers(room),
  });
}

function standings(players) {
  return players.sort((a, b) => {
    if (a.finished && b.finished) return a.place - b.place;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
}

async function finishRace(room, round) {
  const race = await getRace(room);
  if (!race || Number(race.round) !== round || race.status !== "running") return;

  // Two containers might try to finish the same race at once.
  // hSetNX ("set if not exists") is atomic, so only ONE of them wins.
  const won = await redis.hSetNX(raceKey(room), "ended:" + round, "1");
  if (!won) return;

  await redis.hSet(raceKey(room), "status", "finished");
  await broadcast(room);
  const players = standings(await getPlayers(room));
  io.to(room).emit("race:results", { mode: race.mode, players });
}

async function leaveRoom(socket) {
  const room = socket.data.room;
  if (!room) return;
  socket.data.room = null;
  socket.leave(room);

  await redis.hDel(playersKey(room), socket.id);
  if ((await redis.hLen(playersKey(room))) === 0) {
    await redis.del([raceKey(room), playersKey(room)]);
    return;
  }
  await broadcast(room);

  const race = await getRace(room);
  if (race && race.status === "running") {
    const players = await getPlayers(room);
    if (players.every((p) => p.finished)) await finishRace(room, Number(race.round));
  }
}

async function handleProgress(socket, typed) {
  const room = socket.data.room;
  if (!room || typeof typed !== "string") return;

  const [status, text, startTime, round] = await redis.hmGet(raceKey(room), [
    "status",
    "text",
    "startTime",
    "round",
  ]);
  if (status !== "running" || !text) return;
  if (typed.length > text.length + 50) return;

  const raw = await redis.hGet(playersKey(room), socket.id);
  if (!raw) return;
  const player = JSON.parse(raw);
  if (player.finished) return;

  for (let i = player.lastLen; i < typed.length; i++) {
    player.keys++;
    if (typed[i] !== text[i]) player.mistakes++;
  }
  player.lastLen = typed.length;
  player.accuracy = calcAccuracy(player.keys, player.mistakes);

  const correct = countCorrect(typed, text);
  const elapsed = Date.now() - Number(startTime);
  player.progress = Math.round((correct / text.length) * 100);
  player.wpm = calcWpm(correct, elapsed);

  if (correct === text.length) {
    player.finished = true;
    player.timeMs = elapsed;
    // hIncrBy is atomic, so two finishers can never get the same place
    player.place = await redis.hIncrBy(raceKey(room), "finishedCount", 1);
    if (player.place === 1) {
      setTimeout(safe(() => finishRace(room, Number(round))), GRACE_MS);
    }
  }

  await redis.hSet(playersKey(room), socket.id, JSON.stringify(player));
  await broadcast(room);

  if (player.finished) {
    const players = await getPlayers(room);
    if (players.every((p) => p.finished)) await finishRace(room, Number(round));
  }
}

io.on("connection", (socket) => {
  console.log(`[${INSTANCE}] player connected:`, socket.id);
  socket.emit("server:info", INSTANCE);

  socket.on(
    "race:join",
    safe(async (data) => {
      const room = cleanRoom(data && data.room);
      if (!room) return;

      await leaveRoom(socket);

      if (!(await redis.exists(raceKey(room)))) {
        await redis.hSet(raceKey(room), {
          text: randomText("normal"),
          mode: "normal",
          status: "waiting",
          startTime: "0",
          round: "0",
          finishedCount: "0",
        });
      }

      socket.data.room = room;
      await socket.join(room);
      await redis.hSet(playersKey(room), socket.id, JSON.stringify(newPlayer(socket.id, data)));
      await redis.expire(raceKey(room), TTL);
      await redis.expire(playersKey(room), TTL);

      socket.emit("race:joined", { room });
      socket.emit("race:text", await redis.hGet(raceKey(room), "text"));
      await broadcast(room);
    })
  );

  socket.on(
    "race:start",
    safe(async (mode) => {
      const room = socket.data.room;
      if (!room) return;
      const race = await getRace(room);
      if (!race || race.status === "countdown" || race.status === "running") return;

      const round = Number(race.round) + 1;
      const chosen = cleanMode(mode);
      const text = randomText(chosen);

      await redis.hSet(raceKey(room), {
        round: String(round),
        mode: chosen,
        text,
        status: "countdown",
        startTime: "0",
        finishedCount: "0",
      });
      for (const p of await getPlayers(room)) {
        await redis.hSet(playersKey(room), p.id, JSON.stringify(resetPlayer(p)));
      }

      io.to(room).emit("race:text", text);
      io.to(room).emit("race:countdown");
      await broadcast(room);

      setTimeout(
        safe(async () => {
          const current = await getRace(room);
          if (!current || Number(current.round) !== round) return;
          await redis.hSet(raceKey(room), {
            status: "running",
            startTime: String(Date.now()),
          });
          io.to(room).emit("race:go");
          await broadcast(room);
        }),
        3000
      );
    })
  );

  // Handle one progress event at a time per player, so two quick keystrokes
  // can't read the same old data and overwrite each other
  let chain = Promise.resolve();
  socket.on("race:progress", (typed) => {
    chain = chain.then(() => handleProgress(socket, typed)).catch((e) => console.error(e.message));
  });

  socket.on(
    "disconnect",
    safe(async () => {
      console.log(`[${INSTANCE}] player left:`, socket.id);
      await leaveRoom(socket);
    })
  );
});

// Docker sends SIGTERM on `docker stop`
process.on("SIGTERM", () => {
  console.log(`[${INSTANCE}] SIGTERM received, shutting down`);
  process.exit(0);
});

async function main() {
  await Promise.all([redis.connect(), sub.connect()]);
  io.adapter(createAdapter(redis, sub));

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`[${INSTANCE}] Server is running on port ${PORT}`));
}

main().catch((e) => {
  console.error("startup failed:", e.message);
  process.exit(1);
});