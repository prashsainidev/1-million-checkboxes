import http from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

// Modules import
import { connectDB } from "./src/config/db.js";
import authRoutes from "./src/routes/auth.routes.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
app.use("/api/auth", authRoutes);

app.get("/", (req, res) => {
  res.send("1 Million Checkboxes API is Running");
});

// WebSocket Handler
wss.on("connection", (ws) => {
  console.log(`[Socket] New connection established. Active clients: ${wss.clients.size}`);
  ws.on("close", () => {
    console.log(`[Socket] Connection closed. Active clients: ${wss.clients.size}`);
  });
});

// Start Server Safely (DB first)
const startServer = async () => {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`[Server] Listening on port ${PORT}`);
  });
};

startServer();
