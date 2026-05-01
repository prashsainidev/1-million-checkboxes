import http from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8000;

app.get("/", (req, res) => {
  res.send("1 Million Checkboxes API");
});

wss.on("connection", (ws) => {
  console.log(
    `[Socket] New connection established. Active clients: ${wss.clients.size}`,
  );

  ws.on("close", () => {
    console.log(
      `[Socket] Connection closed. Active clients: ${wss.clients.size}`,
    );
  });
});

server.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
});
