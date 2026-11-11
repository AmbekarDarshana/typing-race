const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
const TEXTS = [
  "The quick brown fox jumps over the lazy dog.",
  "DevOps is about shipping code faster and safer.",
  "Docker containers package your app with everything it needs.",
  "Kubernetes orchestrates your containers at scale.",
  "Continuous integration and continuous deployment are key practices.",
  "Monitoring and logging help you understand your system's behavior.",
];

function randomText() {
  return TEXTS[Math.floor(Math.random() * TEXTS.length)];
}
io.on("connection", (socket) => {
  console.log("player connected:", socket.id);
  console.log("players online:", io.engine.clientsCount);
  socket.emit("race:text", randomText());

  socket.on("disconnect", () => {
    console.log("player left:", socket.id);
    console.log("players online:", io.engine.clientsCount);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});