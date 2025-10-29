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
const activePairs = new Map(); // socketId -> partnerId

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // When a user joins (looking for a partner)
  socket.on('join', () => {
    console.log(`${socket.id} joined`);

    // Try to pair immediately
    if (waitingQueue.length > 0) {
      const partnerId = waitingQueue.shift();

      // Pair them both
      activePairs.set(socket.id, partnerId);
      activePairs.set(partnerId, socket.id);

      io.to(socket.id).emit('matched', { partnerId });
      io.to(partnerId).emit('matched', { partnerId: socket.id });

      console.log(`Paired ${socket.id} with ${partnerId}`);
    } else {
      // No one waiting — push this user to queue
      waitingQueue.push(socket.id);
      socket.emit('waiting');
      console.log(`${socket.id} added to queue`);
    }
  });

  // When someone sends WebRTC data
  socket.on('signal', ({ to, data }) => {
    if (to) io.to(to).emit('signal', { from: socket.id, data });
  });

  // When someone leaves
  socket.on('leave', () => {
    handleLeave(socket.id, 'left manually');
  });

  socket.on('disconnect', () => {
    handleLeave(socket.id, 'disconnected');
  });

  function handleLeave(id, reason) {
    console.log(`${id} ${reason}`);
    // Remove from waiting queue if still there
    const idx = waitingQueue.indexOf(id);
    if (idx !== -1) waitingQueue.splice(idx, 1);

    // Notify partner if exists
    const partnerId = activePairs.get(id);
    if (partnerId) {
      io.to(partnerId).emit('partner-left');
      activePairs.delete(partnerId);
      activePairs.delete(id);
      // requeue partner for auto-reconnect
      waitingQueue.push(partnerId);
      io.to(partnerId).emit('waiting');
    }
  }
});

app.get('/', (req, res) => {
  res.send('Connect backend running ✅');
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
