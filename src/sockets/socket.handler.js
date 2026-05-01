import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import {
  toggleCheckbox,
  getAllCheckboxes,
} from "../services/checkbox.service.js";
import { checkRateLimit } from "../middlewares/rateLimiter.js";
import { publisher, subscriber } from "../config/redis.js";

let pubSubInitialized = false;

export const handleSocketConnection = async (ws, wss, req) => {
  // init pub/sub listener once per server instance
  if (!pubSubInitialized) {
    subscriber.subscribe("checkbox_updates");
    subscriber.on("message", (channel, message) => {
      if (channel === "checkbox_updates") {
        const parsed = JSON.parse(message);
        wss.clients.forEach((client) => {
          if (parsed.type === "RESET" && client.readyState === 1) {
            client.send(JSON.stringify({ type: "RESET" }));
            return;
          }

          if (client.id !== parsed.senderId && client.readyState === 1) {
            client.send(
              JSON.stringify({
                type: "UPDATE",
                index: parsed.index,
                state: parsed.state,
              }),
            );
          }
        });
      }
    });
    pubSubInitialized = true;
  }

  // verify jwt from cookies
  let isAuthenticated = false;
  let userId = null;

  try {
    const cookies = req.headers.cookie || "";
    const tokenMatch = cookies.match(/token=([^;]+)/);
    if (tokenMatch) {
      const decoded = jwt.verify(tokenMatch[1], process.env.JWT_SECRET);
      isAuthenticated = true;
      userId = decoded.sub;
    }
  } catch (err) {
    // silent fail for bad tokens
  }

  // assign real user id if logged in, else random uuid
  ws.id = isAuthenticated ? userId : crypto.randomUUID();
  ws.isAuthenticated = isAuthenticated;

  // send initial state
  const currentState = await getAllCheckboxes();
  if (currentState) {
    ws.send(
      JSON.stringify({ type: "INIT", data: currentState.toString("base64") }),
    );
  }

  ws.on("message", async (message) => {
    try {
      const parsed = JSON.parse(message);

      if (parsed.type === "TOGGLE") {
        const { index, state } = parsed;

        // block anonymous clicks
        if (!ws.isAuthenticated) {
          ws.send(
            JSON.stringify({
              type: "ERROR",
              message: "Login required to click!",
              index,
              state,
            }),
          );
          return;
        }

        // rate limit check
        const isAllowed = await checkRateLimit(ws.id);
        if (!isAllowed) {
          ws.send(
            JSON.stringify({
              type: "ERROR",
              message: "Cooldown active! Wait 10 seconds.",
              index,
              state,
            }),
          );
          return;
        }

        // save and broadcast
        await toggleCheckbox(index, state);

        const updatePayload = JSON.stringify({ index, state, senderId: ws.id });
        await publisher.publish("checkbox_updates", updatePayload);
      }
    } catch (err) {
      console.error(`[Socket] parse error:`, err.message);
    }
  });
};
