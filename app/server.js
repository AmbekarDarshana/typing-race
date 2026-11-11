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

const TEXTS = [
  "The quick brown fox jumps over the lazy dog.",
  "DevOps is about shipping code faster and safer.",
  "Docker containers package your app with everything it needs.",
  "Automation turns boring manual work into a pipeline.",
];

function randomText() {
  return TEXTS[Math.floor(Math.random() * TEXTS.length)];
}

// room name -> { text, status, startTime, players }
// status: waiting | countdown | running | finished
const races = {};

function broadcast(room) {
  const race = races[room];
  if (!race) return;
  const players = Object.values(race.players);
  io.to(room).emit("race:update", { status: race.status, players });
}

io.on("connection", (socket) => {
  console.log("player connected:", socket.id);

  socket.on("race:join", (room) => {
    if (!room) return;
    if (!races[room]) {
      races[room] = {
        text: randomText(),
        status: "waiting",
        startTime: null,
        players: {},
      };
    }
    const race = races[room];
    socket.data.room = room;
    socket.join(room);
    race.players[socket.id] = {
      name: "Player " + socket.id.slice(0, 4),
      progress: 0,
      wpm: 0,
      finished: false,
    };
    socket.emit("race:text", race.text);
    broadcast(room);
  });

  socket.on("race:start", () => {
    const room = socket.data.room;
    const race = races[room];
    if (!race || race.status === "countdown" || race.status === "running") return;

    race.text = randomText();
    race.status = "countdown";
    for (const p of Object.values(race.players)) {
      p.progress = 0;
      p.wpm = 0;
      p.finished = false;
    }
    io.to(room).emit("race:text", race.text);
    broadcast(room);

    setTimeout(() => {
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

    const player = race.players[socket.id];
    if (!player || player.finished) return;

    let correct = 0;
    while (correct < typed.length && typed[correct] === race.text[correct]) {
      correct++;
    }

    const minutes = Math.max((Date.now() - race.startTime) / 60000, 0.001);
    player.progress = Math.round((correct / race.text.length) * 100);
    player.wpm = Math.round(correct / 5 / minutes);

    if (correct === race.text.length) player.finished = true;
    if (Object.values(race.players).every((p) => p.finished)) {
      race.status = "finished";
    }
    broadcast(room);
  });

  socket.on("disconnect", () => {
    console.log("player left:", socket.id);
    const room = socket.data.room;
    const race = races[room];
    if (!race) return;
    delete race.players[socket.id];
    if (Object.keys(race.players).length === 0) {
      delete races[room];
    } else {
      broadcast(room);
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});