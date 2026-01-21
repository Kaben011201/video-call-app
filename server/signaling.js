import { WebSocketServer } from "ws";

const wss = new WebSocketServer(
  "wss:https://video-call-app-production-b7d6.up.railway.app/",
);

wss.on("connection", (ws) => {
  console.log("🔌 Client connected");

  ws.on("message", (message) => {
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === ws.OPEN) {
        client.send(message.toString());
      }
    });
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
  });
});

console.log("🚀 Signaling server running on ws://localhost:3001");
