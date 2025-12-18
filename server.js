/**
 =========================================================
  BLIND CODEBREAKER - ONLINE MULTIPLAYER SERVER (NAMED)
 =========================================================
*/

const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log("Server running on port:", PORT);

/**
 ROOM STRUCTURE
 {
   players: [socket, socket],
   names: ["", ""],
   secrets: ["", ""],
   histories: [[], []],
   turn: 0
 }
*/
const rooms = {};

// Generate 4-digit room code
function generateRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

wss.on("connection", socket => {
  console.log("New client connected");

  socket.on("message", message => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    /* ---------------- CREATE ROOM ---------------- */
    if (data.type === "create_room") {
      const roomCode = generateRoomCode();

      rooms[roomCode] = {
        players: [socket],
        names: ["", ""],
        secrets: ["", ""],
        histories: [[], []],
        turn: 0
      };

      socket.roomCode = roomCode;
      socket.playerIndex = 0;

      socket.send(JSON.stringify({
        type: "room_created",
        roomCode
      }));

      console.log("Room created:", roomCode);
    }

    /* ---------------- JOIN ROOM ---------------- */
    if (data.type === "join_room") {
      const room = rooms[data.roomCode];
      if (!room || room.players.length >= 2) return;

      room.players.push(socket);
      socket.roomCode = data.roomCode;
      socket.playerIndex = 1;

      room.players.forEach(p =>
        p.send(JSON.stringify({ type: "game_start" }))
      );

      console.log("Player joined room:", data.roomCode);
    }

    /* ---------------- SET NAME ---------------- */
    if (data.type === "set_name") {
      const room = rooms[socket.roomCode];
      if (!room) return;

      room.names[socket.playerIndex] = data.name;
    }

    /* ---------------- SET SECRET ---------------- */
    if (data.type === "set_secret") {
      const room = rooms[socket.roomCode];
      if (!room) return;

      room.secrets[socket.playerIndex] = data.secret;

      // Start game when both secrets are ready
      if (
  room.secrets[0] &&
  room.secrets[1] &&
  room.names[0] &&
  room.names[1]
) {
  room.turn = 0;

  room.players.forEach((p, index) => {
    p.send(JSON.stringify({
      type: "turn",
      activeName: room.names[room.turn],
      yourTurn: index === room.turn
    }));
  });
}

    /* ---------------- MAKE GUESS ---------------- */
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

      const result = { guess, digits, positions };
      room.histories[socket.playerIndex].push(result);

      socket.send(JSON.stringify({
        type: "feedback",
        history: room.histories[socket.playerIndex]
      }));

      if (positions === 4) {
        socket.send(JSON.stringify({ type: "win" }));
        return;
      }

      room.turn = opponentIndex;

      room.players.forEach((p, index) => {
        p.send(JSON.stringify({
          type: "turn",
          activeName: room.names[room.turn],
          yourTurn: index === room.turn
        }));
      });
    }
  });

  socket.on("close", () => {
    if (socket.roomCode && rooms[socket.roomCode]) {
      delete rooms[socket.roomCode];
      console.log("Room closed:", socket.roomCode);
    }
  });
});
