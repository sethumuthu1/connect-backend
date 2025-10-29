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
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 4000;
const waitingQueue = [];

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join', () => {
    if (waitingQueue.length > 0) {
      const partnerId = waitingQueue.shift();
      io.to(partnerId).emit('matched', { partnerId: socket.id });
      socket.emit('matched', { partnerId });
      console.log(`Paired ${socket.id} with ${partnerId}`);
    } else {
      waitingQueue.push(socket.id);
      socket.emit('waiting');
      console.log(`${socket.id} added to queue`);
    }
  });

  socket.on('leave', () => {
    const idx = waitingQueue.indexOf(socket.id);
    if (idx !== -1) waitingQueue.splice(idx, 1);
  });

  socket.on('signal', ({ to, data }) => {
    if (!to) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected', socket.id);
    const idx = waitingQueue.indexOf(socket.id);
    if (idx !== -1) waitingQueue.splice(idx, 1);
  });
});

app.get('/', (req, res) => {
  res.send('Connect backend running');
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
