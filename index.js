const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const path = require('path');

const cors = require('cors');
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST']
}));

app.use(express.static(path.join(__dirname, 'public')));



app.use(express.static(path.join(__dirname, '../client')));

let rooms = {};
  io.on('connection', (socket) => {
      console.log('A user connected:', socket.id);

      socket.on('joinRoom', (roomCode) => {
          // Verificar si el usuario ya está en la sala
          if (rooms[roomCode] && rooms[roomCode].players.includes(socket.id)) {
              return;
          }

          socket.join(roomCode);
        
          if (!rooms[roomCode]) {
              rooms[roomCode] = {
                  players: [],
                  currentPlayerIndex: 0
              };
          }

          // Verificar si la sala ya está llena
          if (rooms[roomCode].players.length >= 2) {
              socket.emit('roomFull');
              return;
          }

          rooms[roomCode].players.push(socket.id);
          console.log(`User ${socket.id} joined room ${roomCode}`);

          console.log(rooms[roomCode].players)
        
          // Solo iniciar el juego cuando hay exactamente 2 jugadores
          if (rooms[roomCode].players.length === 2) {
              console.log(rooms[roomCode].players[rooms[roomCode].currentPlayerIndex]);   
              io.to(roomCode).emit('gameStart', rooms[roomCode].players[rooms[roomCode].currentPlayerIndex]);
          }
      });

      socket.on('ballLaunched', (data) => {
          const roomCode = Array.from(socket.rooms)[1];
          socket.to(roomCode).emit('ballLaunched', data);
      });

      socket.on('endTurn', () => {
          const roomCode = Array.from(socket.rooms)[1];
          if (rooms[roomCode]) {
              rooms[roomCode].currentPlayerIndex = (rooms[roomCode].currentPlayerIndex + 1) % rooms[roomCode].players.length;
              io.to(roomCode).emit('turnChange', rooms[roomCode].players[rooms[roomCode].currentPlayerIndex]);
          }
      });

      socket.on('disconnect', () => {
          console.log('User disconnected:', socket.id);
          for (let roomCode in rooms) {
              rooms[roomCode].players = rooms[roomCode].players.filter(id => id !== socket.id);
              if (rooms[roomCode].players.length === 0) {
                  delete rooms[roomCode];
              } else {
                  rooms[roomCode].currentPlayerIndex = 0;
              }
          }
      });
  });

  const PORT = process.env.PORT || 5050;
  http.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
  });