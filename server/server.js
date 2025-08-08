const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const BattleManager = require('./game_logic/battleManager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;
const battleManager = new BattleManager(io);

// Initialize server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);

  // Handle matchmaking request
  socket.on('findMatch', (playerData) => {
    console.log(`Player ${socket.id} is looking for a match`);
    battleManager.matchPlayers(socket, playerData);
  });

  // Handle player move
  socket.on('playerMove', (moveData) => {
    battleManager.handlePlayerMove(socket, moveData);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    battleManager.handlePlayerDisconnect(socket);
  });
});

// Simple status endpoint
app.get('/status', (req, res) => {
  res.json({ status: 'Server is running' });
});