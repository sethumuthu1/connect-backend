// connect-backend/index.js
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 4000;

const waitingQueue = [];
const activePairs = new Map(); // socket.id => partner.id

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // user joins queue
  socket.on('join', () => {
    if (waitingQueue.length > 0) {
      const partnerId = waitingQueue.shift();
      if (partnerId === socket.id) return; // sanity check

      // link both users
      activePairs.set(socket.id, partnerId);
      activePairs.set(partnerId, socket.id);

      io.to(socket.id).emit('matched', { partnerId });
      io.to(partnerId).emit('matched', { partnerId: socket.id });
      console.log(`Paired ${socket.id} ↔ ${partnerId}`);
    } else {
      waitingQueue.push(socket.id);
      socket.emit('waiting');
      console.log(`${socket.id} added to waiting queue`);
    }
  });

  socket.on('signal', ({ to, data }) => {
    if (to) io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('leave', () => handleLeave(socket.id, 'manual leave'));
  socket.on('disconnect', () => handleLeave(socket.id, 'disconnected'));

  function handleLeave(id, reason) {
    console.log(`${id} ${reason}`);
    const idx = waitingQueue.indexOf(id);
    if (idx !== -1) waitingQueue.splice(idx, 1);

    const partnerId = activePairs.get(id);
    if (partnerId) {
      io.to(partnerId).emit('partner-left');
      activePairs.delete(id);
      activePairs.delete(partnerId);

      // Requeue the remaining partner automatically
      waitingQueue.push(partnerId);
      io.to(partnerId).emit('waiting');
    }
  }
});

app.get('/', (req, res) => res.send('✅ Connect backend running'));

server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
