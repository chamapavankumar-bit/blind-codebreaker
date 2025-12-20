const WebSocket = require("ws");

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log("Server running on port", PORT);

const rooms = {};

function roomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

wss.on("connection", (ws) => {
  ws.room = null;
  ws.index = null;
  ws.name = null;

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw);

    if (msg.type === "set_name") {
      ws.name = msg.name;
      return;
    }

    if (msg.type === "create_room") {
      if (!ws.name) return;

      const code = roomCode();
      rooms[code] = {
        players: [ws],
        names: { 0: ws.name },
        secrets: {},
        histories: { 0: [], 1: [] },
        turn: 0
      };

      ws.room = code;
      ws.index = 0;

      ws.send(JSON.stringify({
        type: "room_created",
        roomCode: code
      }));
      return;
    }

    if (msg.type === "join_room") {
      if (!ws.name) return;

      const room = rooms[msg.roomCode];
      if (!room || room.players.length === 2) return;

      ws.room = msg.roomCode;
      ws.index = 1;

      room.players.push(ws);
      room.names[1] = ws.name;

      room.players.forEach(p =>
        p.send(JSON.stringify({ type: "game_start" }))
      );
      return;
    }

    if (msg.type === "set_secret") {
      const room = rooms[ws.room];
      room.secrets[ws.index] = msg.secret;

      if (room.secrets[0] && room.secrets[1]) {
        const active = room.turn;
        room.players.forEach((p, i) =>
          p.send(JSON.stringify({
            type: "turn",
            yourTurn: i === active,
            opponent: room.names[i === 0 ? 1 : 0]
          }))
        );
      }
      return;
    }

    if (msg.type === "guess") {
      const room = rooms[ws.room];
      if (room.turn !== ws.index) return;

      const opponent = ws.index === 0 ? 1 : 0;
      const secret = room.secrets[opponent];
      const guess = msg.guess;

      let digits = 0, positions = 0;
      for (let i = 0; i < 4; i++) {
        if (secret.includes(guess[i])) digits++;
        if (secret[i] === guess[i]) positions++;
      }

      room.histories[ws.index].push({ guess, digits, positions });

      ws.send(JSON.stringify({
        type: "history",
        history: room.histories[ws.index]
      }));

      if (positions === 4) {
        room.players.forEach(p =>
          p.send(JSON.stringify({
            type: "win",
            winner: ws.name
          }))
        );
        return;
      }

      room.turn = opponent;
      room.players.forEach((p, i) =>
        p.send(JSON.stringify({
          type: "turn",
          yourTurn: i === room.turn,
          opponent: room.names[i === 0 ? 1 : 0]
        }))
      );
    }
  });

  // 🔴 CRITICAL FIX: HANDLE EXIT / DISCONNECT
  ws.on("close", () => {
 console.log("Socket closed:", ws.name, ws.room); //
    if (!ws.room || !rooms[ws.room]) return;

    const room = rooms[ws.room];

    room.players.forEach(p => {
      if (p !== ws && p.readyState === WebSocket.OPEN) {
       p.send(JSON.stringify({
  type: "opponent_left",
  name: ws.name
}));

      }
    });

    delete rooms[ws.room];
  });
});
