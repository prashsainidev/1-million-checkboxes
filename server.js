import http from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

// Modules import
import { connectDB } from "./src/config/db.js";
import authRoutes from "./src/routes/auth.routes.js";
import oidcRoutes from "./src/routes/oidc.routes.js";
import { handleSocketConnection } from "./src/sockets/socket.handler.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8000;

// standard middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// serve frontend UI
app.use(express.static("public"));

// routes
app.use("/api/auth", authRoutes);
app.use("/", oidcRoutes);

app.get("/", (req, res) => {
  res.send("1 Million Checkboxes API is Running");
});

// websockets
wss.on("connection", (ws, req) => {
  console.log(`[Socket] client connected. active: ${wss.clients.size}`);

  // req ko pass karna zaroori hai taaki cookie padhi ja sake
  handleSocketConnection(ws, wss, req);

  ws.on("close", () => {
    console.log(`[Socket] client disconnected. active: ${wss.clients.size}`);
  });
});

// bootup
const startServer = async () => {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`[Server] Listening on port ${PORT}`);
  });
};

startServer();
