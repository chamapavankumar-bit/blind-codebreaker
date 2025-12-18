/**
 =========================================================
  BLIND CODEBREAKER - ONLINE MULTIPLAYER SERVER
 =========================================================

 STEP-BY-STEP USAGE (READ ONCE):

 1. Create a folder:
    mkdir blind-codebreaker
    cd blind-codebreaker

 2. Create this file:
    server.js   (paste EVERYTHING from this file)

 3. Create package.json (very small):
    {
      "name": "blind-codebreaker",
      "version": "1.0.0",
      "main": "server.js",
      "scripts": { "start": "node server.js" },
      "dependencies": { "ws": "^8.15.0" }
    }

 4. Install dependencies:
    npm install

 5. Test locally:
    node server.js
    → Server runs on ws://localhost:8080

 6. Push to GitHub:
    git init
    git add .
    git commit -m "Blind Codebreaker multiplayer server"
    git branch -M main
    git remote add origin https://github.com/YOUR_NAME/blind-codebreaker.git
    git push -u origin main

 7. Deploy on Render:
    - New → Web Service
    - Runtime: Node
    - Start command: npm start
    - Done 🎉

 8. Frontend connects using:
    wss://YOUR-APP.onrender.com

 =========================================================
*/

const WebSocket = require("ws");

// Render provides PORT automatically
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log("Server running on port:", PORT);

/**
 ROOM STRUCTURE
 {
   players: [socket, socket],
   secrets: ["", ""],
   histories: [[], []],
   turn: 0
 }
*/
const rooms = {};

// Utility: generate 4-digit room code
function generateRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Core WebSocket handling
wss.on("connection", socket => {
  console.log("New client connected");

  socket.on("message", message => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    /**
     -------------------------
     CREATE ROOM
     -------------------------
     */
    if (data.type === "create_room") {
      const roomCode = generateRoomCode();

      rooms[roomCode] = {
        players: [socket],
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

    /**
     -------------------------
     JOIN ROOM
     -------------------------
     */
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

    /**
     -------------------------
     SET SECRET
     -------------------------
     */
   if (data.type === "set_secret") {
  const room = rooms[socket.roomCode];
  if (!room) return;

  room.secrets[socket.playerIndex] = data.secret;

  // ✅ CHECK IF BOTH SECRETS ARE SET
  if (room.secrets[0] && room.secrets[1]) {
    room.turn = 0; // Player 1 starts

    room.players.forEach((p, index) => {
      p.send(JSON.stringify({
        type: "turn",
        player: room.turn,
        yourTurn: index === room.turn
      }));
    });
  }
}


    /**
     -------------------------
     MAKE GUESS
     -------------------------
     */
    if (data.type === "guess") {
      const room = rooms[socket.roomCode];
      if (!room) return;

      // Enforce turns
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

      // Send feedback ONLY to current player
      socket.send(JSON.stringify({
        type: "feedback",
        history: room.histories[socket.playerIndex],
        digits,
        positions
      }));

      // Win condition
      if (positions === 4) {
        socket.send(JSON.stringify({ type: "win" }));
        return;
      }

      // Switch turn
      room.turn = opponentIndex;

      room.players.forEach((p, index) => {
        p.send(JSON.stringify({
          type: "turn",
          player: room.turn,
          yourTurn: index === room.turn
        }));
      });
    }
  });

  socket.on("close", () => {
    console.log("Client disconnected");

    // Cleanup room if player leaves
    if (socket.roomCode && rooms[socket.roomCode]) {
      delete rooms[socket.roomCode];
      console.log("Room closed:", socket.roomCode);
    }
  });
});
