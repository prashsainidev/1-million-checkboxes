import crypto from "node:crypto";
import { toggleCheckbox, getAllCheckboxes } from "../services/checkbox.service.js";
import { checkRateLimit } from "../middlewares/rateLimiter.js";

export const handleSocketConnection = async (ws, wss) => {
  // assign a unique ID to every new browser tab that connects
  ws.id = crypto.randomUUID();

  // send initial grid state
  const currentState = await getAllCheckboxes();
  if (currentState) {
    ws.send(JSON.stringify({ type: "INIT", data: currentState.toString("base64") }));
  }

  ws.on("message", async (message) => {
    try {
      const parsed = JSON.parse(message);

      if (parsed.type === "TOGGLE") {
        const { index, state } = parsed;

        // check if user is allowed to click (10 sec cooldown)
        const isAllowed = await checkRateLimit(ws.id);

        if (!isAllowed) {
          // send error back to UI so frontend can show an alert message
          ws.send(JSON.stringify({ type: "ERROR", message: "Cooldown active! Wait 10 seconds." }));
          return; // stop process here, don't update redis
        }

        // save to redis
        await toggleCheckbox(index, state);

        // broadcast update to other clients
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1) { // 1 = OPEN
            client.send(JSON.stringify({ type: "UPDATE", index, state }));
          }
        });
      }
    } catch (err) {
      console.error(`[Socket] failed to parse message:`, err.message);
    }
  });
};
