const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
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
const GRACE_MS = 15000; // race ends this long after the first finisher

function randomText(mode) {
  const list = TEXTS[mode] || TEXTS.normal;
  return list[Math.floor(Math.random() * list.length)];
}

function cleanRoom(room) {
  return String(room || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 20);
}

function cleanName(name, socketId) {
  return String(name || "").trim().slice(0, 16) || "Player " + socketId.slice(0, 4);
}

function cleanAvatar(avatar) {
  return AVATARS.includes(avatar) ? avatar : "cat";
}

function cleanMode(mode) {
  return TEXTS[mode] ? mode : "normal";
}

// room name -> { text, mode, status, startTime, round, players }
// status: waiting | countdown | running | finished
const races = {};

function newPlayer(socket, data) {
  return {
    id: socket.id,
    name: cleanName(data.name, socket.id),
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
  p.progress = 0;
  p.wpm = 0;
  p.finished = false;
  p.place = null;
  p.timeMs = null;
  p.accuracy = 100;
  p.keys = 0;
  p.mistakes = 0;
  p.lastLen = 0;
}

function broadcast(room) {
  const race = races[room];
  if (!race) return;
  io.to(room).emit("race:update", {
    status: race.status,
    mode: race.mode,
    players: Object.values(race.players),
  });
}

// finished players first (by place), then the rest by progress
function standings(race) {
  return Object.values(race.players).sort((a, b) => {
    if (a.finished && b.finished) return a.place - b.place;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
}

// "round" stops an old timer from ending a newer race
function finishRace(room, round) {
  const race = races[room];
  if (!race || race.round !== round || race.status !== "running") return;
  race.status = "finished";
  broadcast(room);
  io.to(room).emit("race:results", { mode: race.mode, players: standings(race) });
}

function leaveRoom(socket) {
  const room = socket.data.room;
  if (!room) return;
  socket.leave(room);
  socket.data.room = null;

  const race = races[room];
  if (!race) return;
  delete race.players[socket.id];

  if (Object.keys(race.players).length === 0) {
    delete races[room];
    return;
  }
  broadcast(room);
  if (race.status === "running" && Object.values(race.players).every((p) => p.finished)) {
    finishRace(room, race.round);
  }
}

io.on("connection", (socket) => {
  console.log("player connected:", socket.id);

  socket.on("race:join", (data) => {
    const room = cleanRoom(data && data.room);
    if (!room) return;

    leaveRoom(socket);

    if (!races[room]) {
      races[room] = {
        text: randomText("normal"),
        mode: "normal",
        status: "waiting",
        startTime: null,
        round: 0,
        players: {},
      };
    }
    const race = races[room];

    socket.data.room = room;
    socket.join(room);
    race.players[socket.id] = newPlayer(socket, data);

    socket.emit("race:joined", { room });
    socket.emit("race:text", race.text);
    broadcast(room);
  });

  socket.on("race:start", (mode) => {
    const room = socket.data.room;
    const race = races[room];
    if (!race || race.status === "countdown" || race.status === "running") return;

    race.round++;
    const round = race.round;
    race.mode = cleanMode(mode);
    race.text = randomText(race.mode);
    race.status = "countdown";
    Object.values(race.players).forEach(resetPlayer);

    io.to(room).emit("race:text", race.text);
    io.to(room).emit("race:countdown");
    broadcast(room);

    setTimeout(() => {
      if (races[room] !== race || race.round !== round) return;
      race.status = "running";
      race.startTime = Date.now();
      io.to(room).emit("race:go");
      broadcast(room);
    }, 3000);
  });

  socket.on("race:progress", (typed) => {
    const room = socket.data.room;
    const race = races[room];
    if (!race || race.status !== "running" || typeof typed !== "string") return;
    if (typed.length > race.text.length + 50) return;

    const player = race.players[socket.id];
    if (!player || player.finished) return;

    // accuracy: count every NEW character typed, and whether it was wrong
    for (let i = player.lastLen; i < typed.length; i++) {
      player.keys++;
      if (typed[i] !== race.text[i]) player.mistakes++;
    }
    player.lastLen = typed.length;
    player.accuracy = player.keys
      ? Math.round(((player.keys - player.mistakes) / player.keys) * 100)
      : 100;

    let correct = 0;
    while (correct < typed.length && typed[correct] === race.text[correct]) {
      correct++;
    }

    const elapsed = Date.now() - race.startTime;
    const minutes = Math.max(elapsed / 60000, 0.001);
    player.progress = Math.round((correct / race.text.length) * 100);
    player.wpm = Math.round(correct / 5 / minutes);

    if (correct === race.text.length) {
      player.finished = true;
      player.timeMs = elapsed;
      player.place = Object.values(race.players).filter((p) => p.finished).length;
      if (player.place === 1) {
        const round = race.round;
        setTimeout(() => finishRace(room, round), GRACE_MS);
      }
    }

    broadcast(room);
    if (Object.values(race.players).every((p) => p.finished)) {
      finishRace(room, race.round);
    }
  });

  socket.on("disconnect", () => {
    console.log("player left:", socket.id);
    leaveRoom(socket);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});