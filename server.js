const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log("Server running on port:", PORT);

/*
Room structure:
{
  players: [socket, socket],
  names: ["", ""],
  secrets: ["", ""],
  histories: [[], []],
  turn: 0
}
*/
const rooms = {};

function generateRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

wss.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    /* ---------- CREATE ROOM ---------- */
    if (data.type === "create_room") {
      const roomCode = generateRoomCode();

      rooms[roomCode] = {
        players: [socket],
        names: ["", ""],
        secrets: ["", ""],
        histories: [[], []],
        turn: 0,
      };

      socket.roomCode = roomCode;
      socket.playerIndex = 0;

      socket.send(
        JSON.stringify({
          type: "room_created",
          roomCode,
        })
      );
      return;
    }

    /* ---------- JOIN ROOM ---------- */
    if (data.type === "join_room") {
      const room = rooms[data.roomCode];
      if (!room || room.players.length >= 2) return;

      room.players.push(socket);
      socket.roomCode = data.roomCode;
      socket.playerIndex = 1;

      room.players.forEach((p) =>
        p.send(JSON.stringify({ type: "game_start" }))
      );
      return;
    }

    /* ---------- SET NAME ---------- */
    if (data.type === "set_name") {
      const room = rooms[socket.roomCode];
      if (!room) return;

      room.names[socket.playerIndex] = data.name;
      return;
    }

    /* ---------- SET SECRET ---------- */
    if (data.type === "set_secret") {
      const room = rooms[socket.roomCode];
      if (!room) return;

      room.secrets[socket.playerIndex] = data.secret;

      // Start only when both secrets & names exist
      if (
        room.secrets[0] &&
        room.secrets[1] &&
        room.names[0] &&
        room.names[1]
      ) {
        room.turn = 0;

        room.players.forEach((p, index) => {
          p.send(
            JSON.stringify({
              type: "turn",
              yourTurn: index === room.turn,
              activeName: room.names[room.turn],
            })
          );
        });
      }
      return;
    }

    /* ---------- GUESS ---------- */
    if (data.type === "guess") {
      const room = rooms[socket.roomCode];
      if (!room) return;

      if (room.turn !== socket.playerIndex) return;

      const opponentIndex = socket.playerIndex === 0 ? 1 : 0;
      const secret = room.secrets[opponentIndex];
      const guess = data.guess;

      let digits = 0;
      let positions = 0;

      for (let i = 0; i < 4; i++) {
        if (secret.includes(guess[i])) digits++;
        if (secret[i] === guess[i]) positions++;
      }

      room.histories[socket.playerIndex].push({
        guess,
        digits,
        positions,
      });

      socket.send(
        JSON.stringify({
          type: "feedback",
          history: room.histories[socket.playerIndex],
        })
      );

      // 🎉 GAME OVER
      if (positions === 4) {
        room.players.forEach((p) => {
          p.send(
            JSON.stringify({
              type: "game_over",
              winnerIndex: socket.playerIndex,
              winnerName: room.names[socket.playerIndex],
            })
          );
        });
        return;
      }

      // Next turn
      room.turn = opponentIndex;

      room.players.forEach((p, index) => {
        p.send(
          JSON.stringify({
            type: "turn",
            yourTurn: index === room.turn,
            activeName: room.names[room.turn],
          })
        );
      });
    }
  });

  socket.on("close", () => {
    if (socket.roomCode && rooms[socket.roomCode]) {
      delete rooms[socket.roomCode];
    }
  });
});
