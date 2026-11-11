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

io.on("connection", (socket) => {
  console.log("player connected:", socket.id);
  console.log("players online:", io.engine.clientsCount);

  socket.on("disconnect", () => {
    console.log("player left:", socket.id);
    console.log("players online:", io.engine.clientsCount);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});