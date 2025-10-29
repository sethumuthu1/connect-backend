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

  // ─────────── JOIN ROOM ───────────
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

  // ─────────── WEBRTC SIGNALS ───────────
  socket.on('signal', ({ to, data }) => {
    if (to) {
      io.to(to).emit('signal', { from: socket.id, data });
      // Optional debug logs
      if (data?.type)
        console.log(`📡 Signal: ${socket.id} → ${to} (${data.type})`);
      else if (data?.candidate)
        console.log(`❄️ ICE candidate from ${socket.id} → ${to}`);
    }
  });

  // ─────────── CHAT MESSAGE ───────────
  socket.on("chat-message", ({ to, text }) => {
    const partnerId = activePairs.get(socket.id);

    // verify both partner and text
    if (!partnerId || !text) return;

    // Send message to partner
    io.to(partnerId).emit("chat-message", { from: socket.id, text });

    // (Optional) Echo back to sender for confirmation if needed:
    // socket.emit("chat-message", { from: socket.id, text });

    console.log(`💬 ${socket.id} → ${partnerId}: ${text}`);
  });

  // ─────────── MANUAL LEAVE ───────────
  socket.on('leave', () => handleLeave(socket.id, 'left manually'));

  // ─────────── DISCONNECT ───────────
  socket.on('disconnect', () => handleLeave(socket.id, 'disconnected'));

  // ─────────── CLEANUP FUNCTION ───────────
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
  res.send('✅ Connect backend is running with chat support!');
});

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
