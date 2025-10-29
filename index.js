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
    origin: "*", // Allow all origins — adjust for production if needed
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 4000;

// Keep track of waiting users and active pairs
const waitingQueue = [];
const activePairs = new Map(); // socketId -> partnerId

// ──────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🟢 Socket connected: ${socket.id}`);

  // When a user joins
  socket.on('join', () => {
    console.log(`📥 ${socket.id} requested to join`);

    // If someone’s waiting, match them
    if (waitingQueue.length > 0) {
      const partnerId = waitingQueue.shift();

      if (!partnerId || partnerId === socket.id) {
        console.warn(`⚠️ Invalid pairing attempt for ${socket.id}`);
        return;
      }

      // Store pairing
      activePairs.set(socket.id, partnerId);
      activePairs.set(partnerId, socket.id);

      // Assign initiator — the new user (socket) will create the offer
      io.to(socket.id).emit('matched', { partnerId, initiator: true });
      io.to(partnerId).emit('matched', { partnerId: socket.id, initiator: false });

      console.log(`🤝 Paired ${socket.id} (initiator) ↔ ${partnerId}`);
    } else {
      // Nobody waiting — queue this user
      waitingQueue.push(socket.id);
      socket.emit('waiting');
      console.log(`🕒 ${socket.id} added to waiting queue`);
    }
  });

  // Handle WebRTC signaling messages (offer/answer/ICE)
  socket.on('signal', ({ to, data }) => {
    if (to) {
      io.to(to).emit('signal', { from: socket.id, data });
      // Optional: add logging for debug
      if (data?.type) console.log(`📡 Signal: ${socket.id} → ${to} (${data.type})`);
      else if (data?.candidate) console.log(`❄️ ICE candidate from ${socket.id} → ${to}`);
    }
  });

  // Handle manual leave
  socket.on('leave', () => handleLeave(socket.id, 'left manually'));

  // Handle disconnect
  socket.on('disconnect', () => handleLeave(socket.id, 'disconnected'));

  // ──────────────────────────────────────────────
  function handleLeave(id, reason) {
    console.log(`🔴 ${id} ${reason}`);

    // Remove from waiting queue if present
    const idx = waitingQueue.indexOf(id);
    if (idx !== -1) {
      waitingQueue.splice(idx, 1);
      console.log(`🧹 Removed ${id} from waiting queue`);
    }

    // Notify partner if paired
    const partnerId = activePairs.get(id);
    if (partnerId) {
      io.to(partnerId).emit('partner-left');
      console.log(`⚠️ Partner ${partnerId} notified that ${id} ${reason}`);

      // Remove the pair
      activePairs.delete(id);
      activePairs.delete(partnerId);

      // Requeue the partner automatically
      waitingQueue.push(partnerId);
      io.to(partnerId).emit('waiting');
      console.log(`🔁 Partner ${partnerId} requeued`);
    }
  }
});

// ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('✅ Connect backend is running!');
});

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
