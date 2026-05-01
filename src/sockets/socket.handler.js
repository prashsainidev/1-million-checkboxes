import { toggleCheckbox, getAllCheckboxes } from "../services/checkbox.service.js";

export const handleSocketConnection = async (ws, wss) => {
  // send initial grid state
  const currentState = await getAllCheckboxes();
  if (currentState) {
    ws.send(JSON.stringify({ type: "INIT", data: currentState.toString("base64") }));
  }

  ws.on("message", async (message) => {
    try {
      const parsedMessage = JSON.parse(message);

      if (parsedMessage.type === "TOGGLE") {
        const { index, state } = parsedMessage;

        // save to redis
        await toggleCheckbox(index, state);

        // broadcast update to other clients
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1) { // 1 = OPEN
            client.send(JSON.stringify({ type: "UPDATE", index, state }));
          }
        });
      }
    } catch (error) {
      console.error(`[Socket] Message error: ${error.message}`);
    }
  });
};
