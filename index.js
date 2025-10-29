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

  socket.on('join', () => {
    console.log(`${socket.id} requested join`);
    if (waitingQueue.length > 0) {
      const partnerId = waitingQueue.shift();

      // create pair
      activePairs.set(socket.id, partnerId);
      activePairs.set(partnerId, socket.id);

      // Decide initiator: the `socket` (the new joiner) will be initiator (creates offer)
      io.to(socket.id).emit('matched', { partnerId, initiator: true });
      io.to(partnerId).emit('matched', { partnerId: socket.id, initiator: false });

      console.log(`Paired ${socket.id} (initiator) ↔ ${partnerId}`);
    } else {
      waitingQueue.push(socket.id);
      socket.emit('waiting');
      console.log(`${socket.id} added to waiting queue`);
    }
  });

  socket.on('signal', ({ to, data }) => {
    if (to) {
      io.to(to).emit('signal', { from: socket.id, data });
    }
  });

  socket.on('leave', () => handleLeave(socket.id, 'manual leave'));
  socket.on('disconnect', () => handleLeave(socket.id, 'disconnect'));

  function handleLeave(id, reason) {
    console.log(`${id} ${reason}`);
    const idx = waitingQueue.indexOf(id);
    if (idx !== -1) waitingQueue.splice(idx, 1);

    const partnerId = activePairs.get(id);
    if (partnerId) {
      // notify partner
      io.to(partnerId).emit('partner-left');
      // remove pair
      activePairs.delete(partnerId);
      activePairs.delete(id);
      // put remaining partner back into queue
      waitingQueue.push(partnerId);
      io.to(partnerId).emit('waiting');
      console.log(`Partner ${partnerId} requeued after ${id} left`);
    }
  }
});

app.get('/', (req, res) => res.send('Connect backend running ✅'));

server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
