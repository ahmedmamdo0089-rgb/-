'use strict';

const crypto = require('crypto');
const Engine = require('./gameEngine');

// Persist across warm invocations on Vercel Serverless container
const globalStore = globalThis;
if (!globalStore.__BANK_EL_HAZ_STORE__) {
  globalStore.__BANK_EL_HAZ_STORE__ = {
    rooms: new Map(),     // roomCode -> room object
    sessions: new Map()   // sessionToken -> { roomCode, playerId }
  };
}

const { rooms, sessions } = globalStore.__BANK_EL_HAZ_STORE__;
const BACKUP_SECRET = process.env.BEH_SECRET || 'bank-el-haz-egypt-v1-hmac';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getQuery(req) {
  if (req.query && typeof req.query === 'object' && Object.keys(req.query).length > 0) {
    return req.query;
  }
  try {
    const parsed = new URL(req.url || '/', 'http://localhost');
    const out = {};
    parsed.searchParams.forEach((val, key) => {
      out[key] = val;
    });
    return out;
  } catch (_e) {
    return req.query || {};
  }
}

function getBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try { return Promise.resolve(JSON.parse(req.body)); } catch (_e) { return Promise.resolve({}); }
    }
    if (Buffer.isBuffer(req.body)) {
      try { return Promise.resolve(JSON.parse(req.body.toString('utf8'))); } catch (_e) { return Promise.resolve({}); }
    }
    if (typeof req.body === 'object') {
      return Promise.resolve(req.body);
    }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        try { req.destroy(); } catch (_e) {}
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (_e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function createSessionToken() {
  return crypto.randomBytes(16).toString('hex');
}

function signBackup(payloadObj) {
  const raw = JSON.stringify(payloadObj);
  const sig = crypto.createHmac('sha256', BACKUP_SECRET).update(raw).digest('hex').slice(0, 32);
  return { raw: raw, sig: sig };
}

function verifyBackup(envelope) {
  if (!envelope || typeof envelope.raw !== 'string' || typeof envelope.sig !== 'string') return null;
  const expected = crypto.createHmac('sha256', BACKUP_SECRET).update(envelope.raw).digest('hex').slice(0, 32);
  if (envelope.sig !== expected) return null;
  try {
    return JSON.parse(envelope.raw);
  } catch (_e) {
    return null;
  }
}

function makeRoomBackup(room) {
  const roomSessions = [];
  for (const [tok, info] of sessions.entries()) {
    if (info.roomCode === room.code) {
      roomSessions.push([tok, info.playerId]);
    }
  }
  return signBackup({ room: room, sessions: roomSessions });
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

function bumpVersion(room) {
  room.version = (Number(room.version) || 0) + 1;
  room.updatedAt = Date.now();
}

function cleanupExpiredRooms() {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    const idle = now - (room.updatedAt || room.createdAt || now);
    if (idle > 3 * 60 * 60 * 1000) {
      rooms.delete(code);
      for (const [tok, s] of sessions.entries()) {
        if (s.roomCode === code) sessions.delete(tok);
      }
    }
  }
}

function refreshPresenceAndBots(room, activePlayerId) {
  const now = Date.now();
  if (!room._lastSeenMap) room._lastSeenMap = {};
  if (activePlayerId) {
    room._lastSeenMap[activePlayerId] = now;
    const me = room.players.find((p) => p.id === activePlayerId);
    if (me && !me.connected) {
      me.connected = true;
      bumpVersion(room);
    }
  }

  // Mark players disconnected if silent for > 30s
  room.players.forEach((p) => {
    if (p.isBot) {
      p.connected = true;
      return;
    }
    const lastSeen = room._lastSeenMap[p.id] || room.updatedAt || now;
    if (p.connected && now - lastSeen > 30000) {
      p.connected = false;
      if (room.hostId === p.id) {
        const nextHost = room.players.find((o) => !o.isBot && o.connected && !o.bankrupt);
        if (nextHost) room.hostId = nextHost.id;
      }
      bumpVersion(room);
    }
  });

  // Advance AI bot step if due
  if (room.status === 'PLAYING' && now - (room._lastBotAt || 0) >= 950) {
    const acted = Engine.runBotStep(room);
    if (acted) {
      room._lastBotAt = now;
      bumpVersion(room);
    }
  }
}

function executeAction(room, playerId, payload) {
  const type = payload && payload.type;
  switch (type) {
    case 'ADD_BOT': return Engine.addBotPlayer(room, playerId);
    case 'REMOVE_PLAYER': return Engine.removePlayerFromLobby(room, playerId, payload.targetId);
    case 'UPDATE_SETTINGS': return Engine.updateLobbySettings(room, playerId, payload.settings || {});
    case 'UPDATE_APPEARANCE': return Engine.updatePlayerAppearance(room, playerId, payload);
    case 'START_GAME': return Engine.startGame(room, playerId);
    case 'ROLL_DICE': return Engine.rollDice(room, playerId);
    case 'PAY_BAIL': return Engine.payJailBail(room, playerId);
    case 'USE_JAIL_CARD': return Engine.useJailCard(room, playerId);
    case 'SPONSORED_JAIL_FREE': return Engine.sponsoredJailFree(room, playerId);
    case 'TAKE_BANK_LOAN': return Engine.takeBankLoan(room, playerId, Number(payload.amount));
    case 'REPAY_BANK_LOAN': return Engine.repayBankLoan(room, playerId);
    case 'CHECK_LOAN_STATUS': Engine.checkRoomLoanTimers(room); return { ok: true };
    case 'BUY_PROPERTY': return Engine.buyProperty(room, playerId);
    case 'SKIP_PURCHASE': return Engine.skipPurchase(room, playerId);
    case 'START_CHALLENGE_VOTE': return Engine.startChallengeVote(room, playerId);
    case 'SUBMIT_CUSTOM_CHALLENGE': return Engine.submitCustomChallenge(room, playerId, payload.customText);
    case 'CAST_CHALLENGE_VOTE': return Engine.castChallengeVote(room, playerId, payload.vote);
    case 'BUILD_HOUSE': return Engine.buildHouse(room, playerId, Number(payload.tileId));
    case 'SELL_HOUSE': return Engine.sellHouse(room, playerId, Number(payload.tileId));
    case 'MORTGAGE': return Engine.mortgageProperty(room, playerId, Number(payload.tileId));
    case 'UNMORTGAGE': return Engine.unmortgageProperty(room, playerId, Number(payload.tileId));
    case 'SETTLE_DEBT': return Engine.settleDebt(room, playerId);
    case 'BANKRUPT': return Engine.declareBankruptcy(room, playerId, { targetId: payload.targetId });
    case 'END_TURN': return Engine.endTurn(room, playerId, payload);
    case 'FINISH_BY_WEALTH': return Engine.finishGameByWealth(room, playerId);
    case 'PROPOSE_TRADE': return Engine.proposeTrade(room, playerId, payload);
    case 'RESPOND_TRADE': return Engine.respondTrade(room, playerId, payload);
    case 'CANCEL_TRADE': return Engine.cancelTrade(room, playerId, payload.tradeId);
    case 'CHAT': return Engine.addChatMessage(room, playerId, payload.text);
    default: return { ok: false, error: 'إجراء غير مدعوم.' };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  cleanupExpiredRooms();

  // ==================== GET: Ping / Preview / Fast Poll ====================
  if (req.method === 'GET') {
    const q = getQuery(req);
    if (q.ping) {
      return sendJson(res, 200, {
        ok: true,
        engine: 'vercel-cloud',
        rooms: rooms.size,
        publicHost: process.env.VERCEL_PROJECT_PRODUCTION_URL || null,
        vercelEnv: process.env.VERCEL_ENV || null
      });
    }

    const code = String(q.code || '').toUpperCase().trim();
    if (!code) {
      return sendJson(res, 400, { ok: false, error: 'كود الغرفة مطلوب.' });
    }

    const room = rooms.get(code);
    if (!room) {
      return sendJson(res, 404, {
        ok: false,
        code: 'ROOM_NOT_FOUND',
        error: 'لم يتم العثور على الغرفة (#' + code + '). تأكد من صحة الكود أو أنشئ غرفة جديدة.'
      });
    }

    if (q.preview) {
      const host = room.players.find((p) => p.id === room.hostId);
      return sendJson(res, 200, {
        ok: true,
        room: {
          code: room.code,
          status: room.status,
          playerCount: room.players.length,
          maxPlayers: 6,
          hostName: host ? host.name : 'المضيف'
        }
      });
    }

    let callerId = null;
    if (q.session && sessions.has(q.session)) {
      const s = sessions.get(q.session);
      if (s.roomCode === code) callerId = s.playerId;
    }

    refreshPresenceAndBots(room, callerId);
    if (Engine.checkRoomLoanTimers(room)) {
      bumpVersion(room);
    }

    const clientVersion = Number(q.v || 0);
    if (clientVersion > 0 && clientVersion === room.version) {
      return sendJson(res, 200, { ok: true, unchanged: true, v: room.version });
    }

    return sendJson(res, 200, {
      ok: true,
      v: room.version,
      state: Engine.getPublicState(room),
      backup: makeRoomBackup(room)
    });
  }

  // ==================== POST: Create / Join / Leave / Action / Hydrate ====================
  if (req.method === 'POST') {
    const body = await getBody(req);
    const op = body.op;

    // Self-heal cold serverless container from verified signed backup
    if (op === 'HYDRATE' && body.backup) {
      const verified = verifyBackup(body.backup);
      if (verified && verified.room && verified.room.code) {
        const c = verified.room.code;
        const existing = rooms.get(c);
        if (!existing || (verified.room.version || 0) > (existing.version || 0)) {
          rooms.set(c, verified.room);
          (verified.sessions || []).forEach(([tok, pid]) => {
            sessions.set(tok, { roomCode: c, playerId: pid });
          });
        }
        const active = rooms.get(c);
        return sendJson(res, 200, {
          ok: true,
          v: active.version || 1,
          state: Engine.getPublicState(active),
          backup: makeRoomBackup(active)
        });
      }
      return sendJson(res, 400, { ok: false, error: 'نسخة الاستعادة غير صالحة.' });
    }

    if (op === 'CREATE') {
      const code = generateUniqueRoomCode();
      const created = Engine.createRoom({
        roomCode: code,
        hostName: body.playerName,
        avatarId: body.avatarId,
        gameMode: body.gameMode || 'CLASSIC'
      });
      if (!created.ok) return sendJson(res, 400, created);

      const room = created.room;
      room.version = 1;
      room._lastSeenMap = { [created.player.id]: Date.now() };
      rooms.set(code, room);

      const sessionToken = createSessionToken();
      sessions.set(sessionToken, { roomCode: code, playerId: created.player.id });

      return sendJson(res, 200, {
        ok: true,
        roomCode: code,
        playerId: created.player.id,
        sessionToken: sessionToken,
        v: room.version,
        state: Engine.getPublicState(room),
        backup: makeRoomBackup(room)
      });
    }

    if (op === 'JOIN') {
      const code = String(body.roomCode || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) {
        return sendJson(res, 404, {
          ok: false,
          code: 'ROOM_NOT_FOUND',
          error: 'لم يتم العثور على الغرفة (#' + code + '). تأكد من صحة الكود وأن مضيف الغرفة على نفس رابط اللعبة.'
        });
      }

      let existingPlayerId = null;
      let sessionToken = body.sessionToken;
      if (sessionToken && sessions.has(sessionToken)) {
        const saved = sessions.get(sessionToken);
        if (saved.roomCode === code) existingPlayerId = saved.playerId;
      }
      if (!existingPlayerId && body.playerId) {
        existingPlayerId = body.playerId;
      }

      const joined = Engine.joinRoom(room, {
        playerName: body.playerName,
        avatarId: body.avatarId,
        existingPlayerId: existingPlayerId,
        playerId: body.playerId
      });
      if (!joined.ok) return sendJson(res, 400, joined);

      if (!joined.reconnected || !sessionToken) {
        sessionToken = createSessionToken();
        sessions.set(sessionToken, { roomCode: code, playerId: joined.player.id });
      }

      if (!room._lastSeenMap) room._lastSeenMap = {};
      room._lastSeenMap[joined.player.id] = Date.now();
      bumpVersion(room);

      return sendJson(res, 200, {
        ok: true,
        roomCode: code,
        playerId: joined.player.id,
        sessionToken: sessionToken,
        reconnected: Boolean(joined.reconnected),
        v: room.version,
        state: Engine.getPublicState(room),
        backup: makeRoomBackup(room)
      });
    }

    if (op === 'LEAVE') {
      const tok = body.sessionToken;
      if (tok && sessions.has(tok)) {
        const { roomCode, playerId } = sessions.get(tok);
        const room = rooms.get(roomCode);
        if (room) {
          if (room.status === 'LOBBY') {
            Engine.removePlayerFromLobby(room, playerId, playerId);
            if (room.players.length === 0) rooms.delete(roomCode);
            else bumpVersion(room);
          } else if (room.status === 'PLAYING') {
            Engine.declareBankruptcy(room, playerId);
            bumpVersion(room);
          }
        }
        sessions.delete(tok);
      }
      return sendJson(res, 200, { ok: true });
    }

    if (op === 'ACTION') {
      const tok = body.sessionToken;
      if (!tok || !sessions.has(tok)) {
        return sendJson(res, 401, { ok: false, code: 'SESSION_LOST', error: 'انتهت الجلسة، جاري إعادة المزامنة...' });
      }
      const { roomCode, playerId } = sessions.get(tok);
      const room = rooms.get(roomCode);
      if (!room) {
        return sendJson(res, 404, { ok: false, code: 'ROOM_NOT_FOUND', error: 'الغرفة لم تعد موجودة.' });
      }

      if (!room._lastSeenMap) room._lastSeenMap = {};
      room._lastSeenMap[playerId] = Date.now();

      const result = executeAction(room, playerId, body.action || {});
      if (result.ok) {
        room._lastBotAt = Date.now();
        bumpVersion(room);
      }

      return sendJson(res, 200, Object.assign({}, result, {
        v: room.version,
        state: Engine.getPublicState(room),
        backup: makeRoomBackup(room)
      }));
    }

    return sendJson(res, 400, { ok: false, error: 'عملية غير معروفة.' });
  }

  return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
};
