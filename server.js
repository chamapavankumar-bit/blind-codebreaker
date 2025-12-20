const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log("Server running on port", PORT);

const rooms = {};

function roomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    /* SET NAME */
    if (data.type === "set_name") {
      ws.name = data.name;
      return;
    }

    /* CREATE ROOM */
    if (data.type === "create_room") {
      const code = roomCode();
      rooms[code] = {
        players: [ws],
        secrets: {},
        turn: 0,
      };
      ws.room = code;
      ws.index = 0;

      ws.send(JSON.stringify({
        type: "room_created",
        roomCode: code
      }));
      return;
    }

    /* JOIN ROOM */
    if (data.type === "join_room") {
      const room = rooms[data.roomCode];
      if (!room || room.players.length === 2) return;

      room.players.push(ws);
      ws.room = data.roomCode;
      ws.index = 1;

      room.players.forEach(p =>
        p.send(JSON.stringify({ type: "game_start" }))
      );
      return;
    }

    /* SET SECRET */
    if (data.type === "set_secret") {
      const room = rooms[ws.room];
      room.secrets[ws.index] = data.secret;

      if (room.secrets[0] && room.secrets[1]) {
        room.players.forEach((p, i) =>
          p.send(JSON.stringify({
            type: "turn",
            yourTurn: i === room.turn,
            activeName: room.players[room.turn].name
          }))
        );
      }
      return;
    }

    /* GUESS */
    if (data.type === "guess") {
      const room = rooms[ws.room];
      if (room.turn !== ws.index) return;

      const opp = ws.index === 0 ? 1 : 0;
      const secret = room.secrets[opp];
      const guess = data.guess;

      let d = 0, p = 0;
      for (let i = 0; i < 4; i++) {
        if (secret.includes(guess[i])) d++;
        if (secret[i] === guess[i]) p++;
      }

      ws.send(JSON.stringify({
        type: "feedback",
        guess,
        digits: d,
        positions: p
      }));

      if (p === 4) {
        room.players.forEach(pl =>
          pl.send(JSON.stringify({
            type: "game_over",
            winner: ws.name
          }))
        );
        return;
      }

      room.turn = opp;
      room.players.forEach((p, i) =>
        p.send(JSON.stringify({
          type: "turn",
          yourTurn: i === room.turn,
          activeName: room.players[room.turn].name
        }))
      );
    }
  });
});
