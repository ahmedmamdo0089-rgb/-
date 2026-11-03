'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const Engine = require('../public/js/shared/gameEngine');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const INDEX_HTML_TEMPLATE = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 30000,
  pingInterval: 15000
});

// In-memory state stores
const rooms = new Map(); // roomCode -> room object
const sessions = new Map(); // sessionToken -> { roomCode, playerId }
const socketBindings = new Map(); // socket.id -> { roomCode, playerId, sessionToken }
const botTimers = new Map(); // roomCode -> Timeout

function createSessionToken() {
  return crypto.randomBytes(18).toString('hex');
}

function generateUniqueRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return Date.now().toString(36).slice(-6).toUpperCase();
}

function broadcastRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit('room:state', Engine.getPublicState(room));
  scheduleBotTurnIfNeeded(roomCode);
}

function scheduleBotTurnIfNeeded(roomCode) {
  if (botTimers.has(roomCode)) {
    clearTimeout(botTimers.get(roomCode));
    botTimers.delete(roomCode);
  }
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'PLAYING') return;

  const timer = setTimeout(() => {
    botTimers.delete(roomCode);
    const activeRoom = rooms.get(roomCode);
    if (!activeRoom || activeRoom.status !== 'PLAYING') return;
    const acted = Engine.runBotStep(activeRoom);
    if (acted) {
      broadcastRoom(roomCode);
    }
  }, 1150);

  botTimers.set(roomCode, timer);
}

// Express Routes (Dynamic SEO + Static Assets)
function renderSeoIndexHtml(req) {
  const host = req.get('host') || ('localhost:' + PORT);
  const baseUrl = req.protocol + '://' + host;
  const roomQuery = String(req.query.room || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);

  let html = INDEX_HTML_TEMPLATE
    .replace(/content="assets\/og-banner\.jpg"/g, 'content="' + baseUrl + '/assets/og-banner.jpg"')
    .replace(/"image":\s*"assets\/og-banner\.jpg"/g, '"image": "' + baseUrl + '/assets/og-banner.jpg"')
    .replace('</head>', '  <link rel="canonical" href="' + baseUrl + '/" />\n  <meta property="og:url" content="' + baseUrl + (roomQuery ? '/?room=' + roomQuery : '/') + '" />\n</head>');

  if (roomQuery) {
    html = html.replace(
      'content="بنك الحظ المصري أونلاين | العب مونوبولي المحافظات مع أصدقائك مجاناً"',
      'content="🎉 دعوة للعب بنك الحظ المصري — انضم للغرفة #' + roomQuery + ' الآن!"'
    );
  }
  return html;
}

app.get('/', (req, res) => {
  res.type('html').send(renderSeoIndexHtml(req));
});

app.use(express.static(PUBLIC_DIR, { index: false }));

app.get('/sitemap.xml', (req, res) => {
  const host = req.get('host') || ('localhost:' + PORT);
  const baseUrl = req.protocol + '://' + host;
  const today = new Date().toISOString().split('T')[0];
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    '    <loc>' + baseUrl + '/</loc>',
    '    <lastmod>' + today + '</lastmod>',
    '    <changefreq>weekly</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
    '</urlset>'
  ].join('\n');
  res.type('application/xml').send(xml);
});

app.get('/room/:code', (req, res) => {
  const cleanCode = String(req.params.code || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
  res.redirect('/?room=' + encodeURIComponent(cleanCode));
});

app.get('/api/room/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();
  const room = rooms.get(code);
  if (!room) {
    return res.status(404).json({ ok: false, error: 'الغرفة غير موجودة أو انتهت صلاحيتها.' });
  }
  const host = room.players.find((p) => p.id === room.hostId);
  return res.json({
    ok: true,
    room: {
      code: room.code,
      status: room.status,
      playerCount: room.players.length,
      maxPlayers: 6,
      hostName: host ? host.name : 'المضيف'
    }
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, activeRooms: rooms.size });
});

// Socket.io Real-time Handlers
io.on('connection', (socket) => {
  function attachSocketToPlayer(roomCode, playerId, sessionToken) {
    const prev = socketBindings.get(socket.id);
    if (prev && prev.roomCode && prev.roomCode !== roomCode) {
      socket.leave(prev.roomCode);
    }
    socket.join(roomCode);
    socketBindings.set(socket.id, { roomCode, playerId, sessionToken });
  }

  function getBoundContext() {
    const binding = socketBindings.get(socket.id);
    if (!binding) return null;
    const room = rooms.get(binding.roomCode);
    if (!room) return null;
    return { room, roomCode: binding.roomCode, playerId: binding.playerId };
  }

  // Create a new room
  socket.on('room:create', (payload, ack) => {
    const respond = typeof ack === 'function' ? ack : () => {};
    const code = generateUniqueRoomCode();
    const res = Engine.createRoom({
      roomCode: code,
      hostName: payload && payload.playerName,
      avatarId: payload && payload.avatarId
    });

    if (!res.ok) return respond(res);

    rooms.set(code, res.room);
    const sessionToken = createSessionToken();
    sessions.set(sessionToken, { roomCode: code, playerId: res.player.id });
    attachSocketToPlayer(code, res.player.id, sessionToken);

    respond({
      ok: true,
      roomCode: code,
      playerId: res.player.id,
      sessionToken,
      state: Engine.getPublicState(res.room)
    });
  });

  // Join or reconnect to an existing room
  socket.on('room:join', (payload, ack) => {
    const respond = typeof ack === 'function' ? ack : () => {};
    const code = String((payload && payload.roomCode) || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) {
      return respond({ ok: false, error: 'لم يتم العثور على الغرفة (#' + code + '). تأكد من صحة رابط الدعوة أو الكود.' });
    }

    let existingPlayerId = null;
    let sessionToken = payload && payload.sessionToken;
    if (sessionToken && sessions.has(sessionToken)) {
      const saved = sessions.get(sessionToken);
      if (saved.roomCode === code) {
        existingPlayerId = saved.playerId;
      }
    }

    const res = Engine.joinRoom(room, {
      playerName: payload && payload.playerName,
      avatarId: payload && payload.avatarId,
      existingPlayerId
    });

    if (!res.ok) return respond(res);

    if (!res.reconnected || !sessionToken) {
      sessionToken = createSessionToken();
      sessions.set(sessionToken, { roomCode: code, playerId: res.player.id });
    }

    attachSocketToPlayer(code, res.player.id, sessionToken);
    broadcastRoom(code);

    respond({
      ok: true,
      roomCode: code,
      playerId: res.player.id,
      sessionToken,
      reconnected: Boolean(res.reconnected),
      state: Engine.getPublicState(room)
    });
  });

  // Leave room explicitly
  socket.on('room:leave', (_payload, ack) => {
    const respond = typeof ack === 'function' ? ack : () => {};
    const ctx = getBoundContext();
    if (!ctx) return respond({ ok: true });

    const { room, roomCode, playerId } = ctx;
    if (room.status === 'LOBBY') {
      Engine.removePlayerFromLobby(room, playerId, playerId);
      if (room.players.length === 0) {
        rooms.delete(roomCode);
      } else {
        broadcastRoom(roomCode);
      }
    } else if (room.status === 'PLAYING') {
      Engine.declareBankruptcy(room, playerId);
      broadcastRoom(roomCode);
    }

    socket.leave(roomCode);
    const binding = socketBindings.get(socket.id);
    if (binding && binding.sessionToken) {
      sessions.delete(binding.sessionToken);
    }
    socketBindings.delete(socket.id);
    respond({ ok: true });
  });

  // Generic Game Action Dispatcher
  socket.on('game:action', (payload, ack) => {
    const respond = typeof ack === 'function' ? ack : () => {};
    const ctx = getBoundContext();
    if (!ctx) {
      return respond({ ok: false, error: 'أنت غير متصل بأي غرفة حالياً.' });
    }

    const { room, roomCode, playerId } = ctx;
    const type = payload && payload.type;
    let result = { ok: false, error: 'أمر غير معروف.' };

    switch (type) {
      case 'ADD_BOT':
        result = Engine.addBotPlayer(room, playerId);
        break;
      case 'REMOVE_PLAYER':
        result = Engine.removePlayerFromLobby(room, playerId, payload.targetId);
        break;
      case 'UPDATE_SETTINGS':
        result = Engine.updateLobbySettings(room, playerId, payload.settings || {});
        break;
      case 'UPDATE_APPEARANCE':
        result = Engine.updatePlayerAppearance(room, playerId, payload);
        break;
      case 'START_GAME':
        result = Engine.startGame(room, playerId);
        break;
      case 'ROLL_DICE':
        result = Engine.rollDice(room, playerId);
        break;
      case 'PAY_BAIL':
        result = Engine.payJailBail(room, playerId);
        break;
      case 'USE_JAIL_CARD':
        result = Engine.useJailCard(room, playerId);
        break;
      case 'BUY_PROPERTY':
        result = Engine.buyProperty(room, playerId);
        break;
      case 'SKIP_PURCHASE':
        result = Engine.skipPurchase(room, playerId);
        break;
      case 'BUILD_HOUSE':
        result = Engine.buildHouse(room, playerId, Number(payload.tileId));
        break;
      case 'SELL_HOUSE':
        result = Engine.sellHouse(room, playerId, Number(payload.tileId));
        break;
      case 'MORTGAGE':
        result = Engine.mortgageProperty(room, playerId, Number(payload.tileId));
        break;
      case 'UNMORTGAGE':
        result = Engine.unmortgageProperty(room, playerId, Number(payload.tileId));
        break;
      case 'SETTLE_DEBT':
        result = Engine.settleDebt(room, playerId);
        break;
      case 'BANKRUPT':
        result = Engine.declareBankruptcy(room, playerId, { targetId: payload.targetId });
        break;
      case 'END_TURN':
        result = Engine.endTurn(room, playerId, payload);
        break;
      case 'FINISH_BY_WEALTH':
        result = Engine.finishGameByWealth(room, playerId);
        break;
      case 'PROPOSE_TRADE':
        result = Engine.proposeTrade(room, playerId, payload);
        break;
      case 'RESPOND_TRADE':
        result = Engine.respondTrade(room, playerId, payload);
        break;
      case 'CANCEL_TRADE':
        result = Engine.cancelTrade(room, playerId, payload.tradeId);
        break;
      case 'CHAT':
        result = Engine.addChatMessage(room, playerId, payload.text);
        break;
      default:
        result = { ok: false, error: 'إجراء غير مدعوم.' };
    }

    if (result.ok) {
      broadcastRoom(roomCode);
    }
    respond(result);
  });

  socket.on('disconnect', () => {
    const binding = socketBindings.get(socket.id);
    socketBindings.delete(socket.id);
    if (!binding) return;

    const { roomCode, playerId } = binding;
    // Short grace period so page refresh doesn't flash disconnected state
    setTimeout(() => {
      const stillConnected = Array.from(socketBindings.values()).some(
        (b) => b.roomCode === roomCode && b.playerId === playerId
      );
      if (stillConnected) return;

      const room = rooms.get(roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.id === playerId);
      if (player) {
        player.connected = false;
        // Transfer host if current host disconnected and another connected human exists
        if (room.hostId === player.id) {
          const nextHost = room.players.find((p) => !p.isBot && p.connected && !p.bankrupt);
          if (nextHost) {
            room.hostId = nextHost.id;
          }
        }
        broadcastRoom(roomCode);
      }
    }, 3000);
  });
});

// Periodic cleanup of abandoned rooms (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    const anyHumanConnected = room.players.some((p) => !p.isBot && p.connected);
    const idleMs = now - (room.updatedAt || room.createdAt);
    if ((!anyHumanConnected && idleMs > 20 * 60 * 1000) || idleMs > 6 * 60 * 60 * 1000) {
      rooms.delete(code);
      if (botTimers.has(code)) {
        clearTimeout(botTimers.get(code));
        botTimers.delete(code);
      }
    }
  }
}, 10 * 60 * 1000);

server.listen(PORT, () => {
  console.log('====================================================');
  console.log('🏛️  خادم لعبة بنك الحظ المصري يعمل الآن بنجاح!');
  console.log(`🌐  الرابط المحلي: http://localhost:${PORT}`);
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach((name) => {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`📱  رابط الشبكة للهواتف (Wi-Fi): http://${net.address}:${PORT}`);
      }
    }
  });
  console.log('====================================================');
});

