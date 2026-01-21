wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.type === "join") {
      ws.roomId = data.roomId;
      ws.userId = data.userId;

      if (!rooms.has(ws.roomId)) {
        rooms.set(ws.roomId, new Set());
      }

      const clients = rooms.get(ws.roomId);

      // 🟢 Send existing users to the new client
      const existingUsers = [...clients].map((c) => c.userId);
      ws.send(
        JSON.stringify({
          type: "existing-users",
          users: existingUsers,
        }),
      );

      clients.add(ws);

      // Notify others
      clients.forEach((client) => {
        if (client !== ws) {
          client.send(
            JSON.stringify({
              type: "user-joined",
              userId: ws.userId,
            }),
          );
        }
      });
    }

    if (data.type === "signal") {
      rooms.get(ws.roomId)?.forEach((client) => {
        if (client.userId === data.to) {
          client.send(JSON.stringify(data));
        }
      });
    }
  });

  ws.on("close", () => {
    if (!ws.roomId) return;

    rooms.get(ws.roomId)?.delete(ws);

    rooms.get(ws.roomId)?.forEach((client) => {
      client.send(
        JSON.stringify({
          type: "user-left",
          userId: ws.userId,
        }),
      );
    });
  });
});
