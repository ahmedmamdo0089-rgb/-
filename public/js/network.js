(function (root) {
  'use strict';

  const Engine = root.BankElHazEngine;

  const PEER_OPTIONS = {
    secure: true,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    }
  };

  function peerIdForRoom(code) {
    return 'beh-eg-v1-' + String(code || '').toLowerCase().trim();
  }

  function randomToken(prefix) {
    return (prefix || 'tok') + '_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36).slice(-5);
  }

  function delayMs(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function executeEngineAction(room, actorId, actionPayload) {
    const t = actionPayload && actionPayload.type;
    switch (t) {
      case 'ADD_BOT': return Engine.addBotPlayer(room, actorId);
      case 'REMOVE_PLAYER': return Engine.removePlayerFromLobby(room, actorId, actionPayload.targetId);
      case 'UPDATE_SETTINGS': return Engine.updateLobbySettings(room, actorId, actionPayload.settings || {});
      case 'UPDATE_APPEARANCE': return Engine.updatePlayerAppearance(room, actorId, actionPayload);
      case 'START_GAME': return Engine.startGame(room, actorId);
      case 'ROLL_DICE': return Engine.rollDice(room, actorId);
      case 'PAY_BAIL': return Engine.payJailBail(room, actorId);
      case 'USE_JAIL_CARD': return Engine.useJailCard(room, actorId);
      case 'BUY_PROPERTY': return Engine.buyProperty(room, actorId);
      case 'SKIP_PURCHASE': return Engine.skipPurchase(room, actorId);
      case 'BUILD_HOUSE': return Engine.buildHouse(room, actorId, Number(actionPayload.tileId));
      case 'SELL_HOUSE': return Engine.sellHouse(room, actorId, Number(actionPayload.tileId));
      case 'MORTGAGE': return Engine.mortgageProperty(room, actorId, Number(actionPayload.tileId));
      case 'UNMORTGAGE': return Engine.unmortgageProperty(room, actorId, Number(actionPayload.tileId));
      case 'SETTLE_DEBT': return Engine.settleDebt(room, actorId);
      case 'BANKRUPT': return Engine.declareBankruptcy(room, actorId, { targetId: actionPayload.targetId });
      case 'END_TURN': return Engine.endTurn(room, actorId);
      case 'PROPOSE_TRADE': return Engine.proposeTrade(room, actorId, actionPayload);
      case 'RESPOND_TRADE': return Engine.respondTrade(room, actorId, actionPayload);
      case 'CANCEL_TRADE': return Engine.cancelTrade(room, actorId, actionPayload.tradeId);
      case 'CHAT': return Engine.addChatMessage(room, actorId, actionPayload.text);
      default: return { ok: false, error: 'أمر غير مدعوم.' };
    }
  }

  function createNetworkClient() {
    let mode = 'connecting'; // 'socket' | 'cloud_api' | 'p2p' | 'local'
    let initPromise = null;
    let socket = null;
    let stateListeners = [];
    let connListeners = [];
    let currentRoomCode = null;
    let currentPlayerId = null;
    let currentSessionToken = null;

    // Vercel Cloud API (/api/room) State
    let cloudVersion = 0;
    let cloudLatestBackup = null;
    let cloudPollTimer = null;
    let cloudPollInFlight = false;
    let cloudConnected = true;
    let cloudPublicInfo = { publicHost: null, vercelEnv: null };

    // P2P (Static WebRTC Fallback) State
    let p2pRole = null; // 'host' | 'guest'
    let peerInstance = null;
    let hostRoom = null;
    let hostSessions = {};
    let hostGuestConns = new Map();
    let hostBotTimer = null;
    let guestHostConn = null;
    let pendingGuestRequests = new Map();

    // Local Offline Fallback State
    let localBotTimer = null;
    let broadcastChannel = null;

    function notifyState(state) {
      stateListeners.forEach(function (fn) {
        try { fn(state); } catch (err) { console.error(err); }
      });
    }

    function notifyConn(info) {
      connListeners.forEach(function (fn) {
        try { fn(info); } catch (err) { console.error(err); }
      });
    }

    // ==================== Vercel Cloud API (/api/room over HTTPS) ====================
    function saveCloudBackup(code, backup) {
      if (!code || !backup) return;
      try {
        sessionStorage.setItem('beh_cloud_bak_' + code, JSON.stringify(backup));
      } catch (_e) {}
    }

    function loadCloudBackup(code) {
      if (!code) return null;
      try {
        const raw = sessionStorage.getItem('beh_cloud_bak_' + code);
        return raw ? JSON.parse(raw) : null;
      } catch (_e) {
        return null;
      }
    }

    function clearCloudBackup(code) {
      if (!code) return;
      try {
        sessionStorage.removeItem('beh_cloud_bak_' + code);
      } catch (_e) {}
    }

    async function fetchCloudJson(url, options, timeoutMs) {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 8000) : null;
      try {
        const fetchOpts = Object.assign({ cache: 'no-store' }, options || {});
        if (ctrl) fetchOpts.signal = ctrl.signal;
        const res = await fetch(url, fetchOpts);
        const contentType = String(res.headers.get('content-type') || '');
        if (contentType.indexOf('application/json') === -1) {
          return { ok: false, httpStatus: res.status, nonJson: true };
        }
        const data = await res.json();
        if (data && typeof data === 'object') data.httpStatus = res.status;
        return data;
      } catch (_err) {
        return { ok: false, networkError: true, error: 'تعذر الاتصال بالخادم السحابي. تحقق من الإنترنت.' };
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    function cloudGet(paramsObj, timeoutMs) {
      const qs = new URLSearchParams();
      Object.keys(paramsObj || {}).forEach(function (k) {
        if (paramsObj[k] !== undefined && paramsObj[k] !== null && paramsObj[k] !== '') {
          qs.set(k, String(paramsObj[k]));
        }
      });
      return fetchCloudJson('/api/room?' + qs.toString(), { method: 'GET' }, timeoutMs);
    }

    function cloudPost(bodyObj, timeoutMs) {
      return fetchCloudJson('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj || {})
      }, timeoutMs);
    }

    async function hydrateCloudRoomIfPossible(code) {
      const bak = cloudLatestBackup || loadCloudBackup(code);
      if (!bak) return false;
      const res = await cloudPost({ op: 'HYDRATE', backup: bak }, 6000);
      if (res && res.ok) {
        cloudVersion = res.v || cloudVersion;
        if (res.backup) {
          cloudLatestBackup = res.backup;
          saveCloudBackup(code, res.backup);
        }
        if (res.state) notifyState(res.state);
        return true;
      }
      return false;
    }

    function stopCloudPolling() {
      if (cloudPollTimer) {
        clearInterval(cloudPollTimer);
        cloudPollTimer = null;
      }
      cloudPollInFlight = false;
    }

    async function pollCloudOnce() {
      if (mode !== 'cloud_api' || !currentRoomCode || cloudPollInFlight) return;
      cloudPollInFlight = true;
      try {
        const res = await cloudGet({
          code: currentRoomCode,
          session: currentSessionToken,
          v: cloudVersion
        }, 6500);

        if (!res) return;

        if (res.code === 'ROOM_NOT_FOUND') {
          await hydrateCloudRoomIfPossible(currentRoomCode);
          return;
        }

        if (res.networkError) {
          if (cloudConnected) {
            cloudConnected = false;
            notifyConn({
              mode: 'cloud_api',
              connected: false,
              publicHost: cloudPublicInfo.publicHost,
              vercelEnv: cloudPublicInfo.vercelEnv
            });
          }
          return;
        }

        if (res.ok) {
          if (!cloudConnected) {
            cloudConnected = true;
            notifyConn({
              mode: 'cloud_api',
              connected: true,
              publicHost: cloudPublicInfo.publicHost,
              vercelEnv: cloudPublicInfo.vercelEnv
            });
          }
          if (!res.unchanged && res.state) {
            cloudVersion = res.v || cloudVersion;
            if (res.backup) {
              cloudLatestBackup = res.backup;
              saveCloudBackup(currentRoomCode, res.backup);
            }
            notifyState(res.state);
          }
        }
      } finally {
        cloudPollInFlight = false;
      }
    }

    function startCloudPolling() {
      stopCloudPolling();
      cloudPollTimer = setInterval(pollCloudOnce, 1100);
    }

    async function cloudCreateRoom(payload) {
      const res = await cloudPost({
        op: 'CREATE',
        playerName: payload.playerName,
        avatarId: payload.avatarId
      }, 9000);

      if (res && res.ok) {
        currentRoomCode = res.roomCode;
        currentPlayerId = res.playerId;
        currentSessionToken = res.sessionToken;
        cloudVersion = res.v || 1;
        cloudLatestBackup = res.backup || null;
        if (res.backup) saveCloudBackup(res.roomCode, res.backup);
        notifyState(res.state);
        startCloudPolling();
        return res;
      }
      return res || { ok: false, error: 'تعذر إنشاء الغرفة السحابية.' };
    }

    async function cloudJoinRoom(payload) {
      const code = String((payload && payload.roomCode) || '').toUpperCase().trim();
      let lastRes = null;

      // Retry briefly in case multiple serverless instances are warming
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await cloudPost({
          op: 'JOIN',
          roomCode: code,
          playerName: payload.playerName,
          avatarId: payload.avatarId,
          sessionToken: payload.sessionToken
        }, 8000);

        lastRes = res;
        if (res && res.ok) {
          currentRoomCode = res.roomCode;
          currentPlayerId = res.playerId;
          currentSessionToken = res.sessionToken;
          cloudVersion = res.v || 1;
          cloudLatestBackup = res.backup || null;
          if (res.backup) saveCloudBackup(res.roomCode, res.backup);
          notifyState(res.state);
          startCloudPolling();
          return res;
        }

        if (!res || res.code !== 'ROOM_NOT_FOUND') break;

        if (attempt === 0) {
          const restored = await hydrateCloudRoomIfPossible(code);
          if (restored) continue;
        }
        await delayMs(350);
      }

      return lastRes || { ok: false, error: 'تعذر الانضمام للغرفة #' + code + '.' };
    }

    async function cloudSendAction(actionPayload) {
      let res = await cloudPost({
        op: 'ACTION',
        sessionToken: currentSessionToken,
        action: actionPayload || {}
      }, 8500);

      if (res && (res.code === 'ROOM_NOT_FOUND' || res.code === 'SESSION_LOST') && currentRoomCode) {
        const restored = await hydrateCloudRoomIfPossible(currentRoomCode);
        if (restored) {
          res = await cloudPost({
            op: 'ACTION',
            sessionToken: currentSessionToken,
            action: actionPayload || {}
          }, 8500);
        }
      }

      if (res && res.state) {
        cloudVersion = res.v || cloudVersion;
        if (res.backup && currentRoomCode) {
          cloudLatestBackup = res.backup;
          saveCloudBackup(currentRoomCode, res.backup);
        }
        notifyState(res.state);
      }
      return res || { ok: false, error: 'لم يستجب الخادم السحابي.' };
    }

    async function cloudLeaveRoom() {
      const code = currentRoomCode;
      const tok = currentSessionToken;
      stopCloudPolling();
      clearCloudBackup(code);
      currentRoomCode = null;
      currentPlayerId = null;
      currentSessionToken = null;
      cloudLatestBackup = null;
      cloudVersion = 0;
      if (tok) {
        await cloudPost({ op: 'LEAVE', sessionToken: tok }, 4000);
      }
      return { ok: true };
    }

    // ==================== P2P Static Cloud Fallback ====================
    function persistHostSnapshot() {
      if (!hostRoom || p2pRole !== 'host') return;
      try {
        sessionStorage.setItem('beh_p2p_host_' + hostRoom.code, JSON.stringify({
          room: hostRoom,
          sessions: hostSessions,
          hostPlayerId: currentPlayerId,
          hostToken: currentSessionToken
        }));
      } catch (_e) {}
    }

    function loadHostSnapshot(code) {
      try {
        const raw = sessionStorage.getItem('beh_p2p_host_' + code);
        return raw ? JSON.parse(raw) : null;
      } catch (_e) {
        return null;
      }
    }

    function clearHostSnapshot(code) {
      try {
        if (code) sessionStorage.removeItem('beh_p2p_host_' + code);
      } catch (_e) {}
    }

    function cleanupP2P() {
      if (hostBotTimer) {
        clearTimeout(hostBotTimer);
        hostBotTimer = null;
      }
      pendingGuestRequests.forEach(function (entry) {
        clearTimeout(entry.timer);
        entry.resolve({ ok: false, error: 'تم إغلاق الاتصال.' });
      });
      pendingGuestRequests.clear();

      hostGuestConns.forEach(function (_meta, conn) {
        try { conn.close(); } catch (_e) {}
      });
      hostGuestConns.clear();

      if (guestHostConn) {
        try { guestHostConn.close(); } catch (_e) {}
        guestHostConn = null;
      }
      if (peerInstance) {
        try { peerInstance.destroy(); } catch (_e) {}
        peerInstance = null;
      }
      p2pRole = null;
      hostRoom = null;
    }

    function broadcastP2PState() {
      if (!hostRoom || p2pRole !== 'host') return;
      persistHostSnapshot();
      const pub = Engine.getPublicState(hostRoom);
      notifyState(pub);
      hostGuestConns.forEach(function (_meta, conn) {
        if (conn && conn.open) {
          try {
            conn.send({ kind: 'STATE', state: pub });
          } catch (_e) {}
        }
      });
      scheduleP2PHostBot();
    }

    function scheduleP2PHostBot() {
      if (hostBotTimer) {
        clearTimeout(hostBotTimer);
        hostBotTimer = null;
      }
      if (!hostRoom || p2pRole !== 'host' || hostRoom.status !== 'PLAYING') return;
      hostBotTimer = setTimeout(function () {
        if (!hostRoom || p2pRole !== 'host' || hostRoom.status !== 'PLAYING') return;
        const acted = Engine.runBotStep(hostRoom);
        if (acted) {
          broadcastP2PState();
        }
      }, 1150);
    }

    function attachIncomingGuestHandler(conn) {
      conn.on('data', function (msg) {
        if (!msg || !hostRoom) return;

        if (msg.kind === 'JOIN') {
          const payload = msg.payload || {};
          let existingPlayerId = null;
          let token = payload.sessionToken;
          if (token && hostSessions[token]) {
            existingPlayerId = hostSessions[token];
          }

          const res = Engine.joinRoom(hostRoom, {
            playerName: payload.playerName,
            avatarId: payload.avatarId,
            existingPlayerId: existingPlayerId
          });

          if (!res.ok) {
            try { conn.send({ kind: 'JOIN_ACK', reqId: msg.reqId, res: res }); } catch (_e) {}
            return;
          }

          if (!res.reconnected || !token) {
            token = randomToken('p2p');
            hostSessions[token] = res.player.id;
          }

          hostGuestConns.set(conn, { playerId: res.player.id, sessionToken: token });
          const pub = Engine.getPublicState(hostRoom);

          try {
            conn.send({
              kind: 'JOIN_ACK',
              reqId: msg.reqId,
              res: {
                ok: true,
                roomCode: hostRoom.code,
                playerId: res.player.id,
                sessionToken: token,
                reconnected: Boolean(res.reconnected),
                state: pub
              }
            });
          } catch (_e) {}

          broadcastP2PState();
          return;
        }

        if (msg.kind === 'LEAVE') {
          const meta = hostGuestConns.get(conn);
          if (meta && hostRoom) {
            if (hostRoom.status === 'LOBBY') {
              Engine.removePlayerFromLobby(hostRoom, meta.playerId, meta.playerId);
            } else if (hostRoom.status === 'PLAYING') {
              Engine.declareBankruptcy(hostRoom, meta.playerId);
            }
            if (meta.sessionToken) delete hostSessions[meta.sessionToken];
            hostGuestConns.delete(conn);
            broadcastP2PState();
          }
          try { conn.send({ kind: 'ACTION_ACK', reqId: msg.reqId, res: { ok: true } }); } catch (_e) {}
          return;
        }

        if (msg.kind === 'ACTION') {
          const meta = hostGuestConns.get(conn);
          if (!meta) {
            try { conn.send({ kind: 'ACTION_ACK', reqId: msg.reqId, res: { ok: false, error: 'الجلسة غير مرتبطة بالغرفة.' } }); } catch (_e) {}
            return;
          }
          const result = executeEngineAction(hostRoom, meta.playerId, msg.payload || {});
          try {
            conn.send({ kind: 'ACTION_ACK', reqId: msg.reqId, res: result });
          } catch (_e) {}
          if (result && result.ok) {
            broadcastP2PState();
          }
        }
      });

      function handleGuestDisconnect() {
        const meta = hostGuestConns.get(conn);
        hostGuestConns.delete(conn);
        if (!meta || !hostRoom) return;

        setTimeout(function () {
          const reconnectedElsewhere = Array.from(hostGuestConns.values()).some(function (m) {
            return m.playerId === meta.playerId;
          });
          if (reconnectedElsewhere || !hostRoom) return;
          const p = hostRoom.players.find(function (pl) { return pl.id === meta.playerId; });
          if (p) {
            p.connected = false;
            broadcastP2PState();
          }
        }, 3500);
      }

      conn.on('close', handleGuestDisconnect);
      conn.on('error', handleGuestDisconnect);
    }

    function openHostPeerForRoom(roomObj, hostPlayerId, hostToken, sessionsMap) {
      return new Promise(function (resolve) {
        cleanupP2P();
        const peerId = peerIdForRoom(roomObj.code);
        const peer = new root.Peer(peerId, PEER_OPTIONS);
        let settled = false;

        const timeout = setTimeout(function () {
          if (settled) return;
          settled = true;
          try { peer.destroy(); } catch (_e) {}
          resolve({ ok: false, error: 'انتهت مهلة الاتصال بخادم الغرف السحابية. تحقق من الإنترنت وحاول مجدداً.' });
        }, 12000);

        peer.on('open', function () {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);

          peerInstance = peer;
          p2pRole = 'host';
          hostRoom = roomObj;
          hostSessions = sessionsMap || {};
          currentRoomCode = roomObj.code;
          currentPlayerId = hostPlayerId;
          currentSessionToken = hostToken;

          peer.on('connection', attachIncomingGuestHandler);
          peer.on('disconnected', function () {
            notifyConn({ mode: 'p2p', connected: false });
            try { peer.reconnect(); } catch (_e) {}
          });

          notifyConn({ mode: 'p2p', connected: true });
          persistHostSnapshot();
          const pub = Engine.getPublicState(hostRoom);
          notifyState(pub);
          scheduleP2PHostBot();

          resolve({
            ok: true,
            roomCode: hostRoom.code,
            playerId: hostPlayerId,
            sessionToken: hostToken,
            state: pub
          });
        });

        peer.on('error', function (err) {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            const isTaken = err && err.type === 'unavailable-id';
            try { peer.destroy(); } catch (_e) {}
            resolve({
              ok: false,
              retryNewCode: isTaken,
              error: isTaken ? 'الكود مستخدم، جاري توليد كود آخر...' : 'تعذر فتح الغرفة السحابية (' + (err && err.type ? err.type : 'خطأ شبكة') + ').'
            });
          }
        });
      });
    }

    async function p2pCreateRoom(payload) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const created = Engine.createRoom({
          hostName: payload.playerName,
          avatarId: payload.avatarId
        });
        const hostToken = randomToken('p2phost');
        const sessionsMap = {};
        sessionsMap[hostToken] = created.player.id;

        const opened = await openHostPeerForRoom(created.room, created.player.id, hostToken, sessionsMap);
        if (opened.ok) return opened;
        if (!opened.retryNewCode) return opened;
      }
      return { ok: false, error: 'تعذر إنشاء غرفة سحابية حالياً. حاول مرة أخرى.' };
    }

    function sendGuestRequest(kind, payload, timeoutMs) {
      return new Promise(function (resolve) {
        if (!guestHostConn || !guestHostConn.open) {
          resolve({ ok: false, error: 'انقطع الاتصال بمضيف الغرفة. تأكد من أن مضيف الغرفة لم يغلق صفحته.' });
          return;
        }
        const reqId = randomToken('req');
        const timer = setTimeout(function () {
          pendingGuestRequests.delete(reqId);
          resolve({ ok: false, error: 'انتهت مهلة انتظار استجابة الغرفة.' });
        }, timeoutMs || 10000);

        pendingGuestRequests.set(reqId, { resolve: resolve, timer: timer });
        try {
          guestHostConn.send({ kind: kind, reqId: reqId, payload: payload });
        } catch (_e) {
          clearTimeout(timer);
          pendingGuestRequests.delete(reqId);
          resolve({ ok: false, error: 'تعذر إرسال الطلب إلى الغرفة.' });
        }
      });
    }

    function p2pJoinRoom(payload) {
      const code = String((payload && payload.roomCode) || '').toUpperCase().trim();
      if (!code) return Promise.resolve({ ok: false, error: 'يرجى إدخال كود الغرفة.' });

      const savedHost = loadHostSnapshot(code);
      if (savedHost && savedHost.room && payload.sessionToken && payload.sessionToken === savedHost.hostToken) {
        const hostPlayer = savedHost.room.players.find(function (p) { return p.id === savedHost.hostPlayerId; });
        if (hostPlayer) hostPlayer.connected = true;
        return openHostPeerForRoom(savedHost.room, savedHost.hostPlayerId, savedHost.hostToken, savedHost.sessions).then(function (res) {
          if (res.ok) res.reconnected = true;
          return res;
        });
      }

      return new Promise(function (resolve) {
        cleanupP2P();
        const peer = new root.Peer(PEER_OPTIONS);
        let settled = false;

        const overallTimeout = setTimeout(function () {
          if (settled) return;
          settled = true;
          cleanupP2P();
          resolve({
            ok: false,
            error: 'تعذر الوصول إلى الغرفة #' + code + '. تأكد من صحة الكود وأن مضيف الغرفة يفتح اللعبة الآن.'
          });
        }, 12000);

        peer.on('open', function () {
          peerInstance = peer;
          p2pRole = 'guest';

          const conn = peer.connect(peerIdForRoom(code), {
            reliable: true,
            serialization: 'json'
          });

          conn.on('open', function () {
            guestHostConn = conn;
            notifyConn({ mode: 'p2p', connected: true });

            sendGuestRequest('JOIN', payload, 9000).then(function (joinRes) {
              if (settled) return;
              settled = true;
              clearTimeout(overallTimeout);

              if (joinRes && joinRes.ok) {
                currentRoomCode = joinRes.roomCode;
                currentPlayerId = joinRes.playerId;
                currentSessionToken = joinRes.sessionToken;
                notifyState(joinRes.state);
              } else {
                cleanupP2P();
              }
              resolve(joinRes || { ok: false, error: 'رفضت الغرفة الاتصال.' });
            });
          });

          conn.on('data', function (msg) {
            if (!msg) return;
            if (msg.kind === 'STATE' && msg.state) {
              notifyState(msg.state);
              return;
            }
            if ((msg.kind === 'JOIN_ACK' || msg.kind === 'ACTION_ACK') && msg.reqId) {
              const pending = pendingGuestRequests.get(msg.reqId);
              if (pending) {
                clearTimeout(pending.timer);
                pendingGuestRequests.delete(msg.reqId);
                pending.resolve(msg.res);
              }
            }
          });

          conn.on('close', function () {
            notifyConn({ mode: 'p2p', connected: false });
          });

          conn.on('error', function () {
            if (!settled) {
              settled = true;
              clearTimeout(overallTimeout);
              cleanupP2P();
              resolve({ ok: false, error: 'تعذر الاتصال بالغرفة #' + code + '.' });
            }
          });
        });

        peer.on('error', function (err) {
          if (settled) return;
          settled = true;
          clearTimeout(overallTimeout);
          cleanupP2P();
          if (err && err.type === 'peer-unavailable') {
            resolve({
              ok: false,
              error: 'الغرفة #' + code + ' غير نشطة حالياً أو أن مضيف الغرفة أغلق صفحته.'
            });
          } else {
            resolve({
              ok: false,
              error: 'تعذر الاتصال بالغرفة السحابية (' + (err && err.type ? err.type : 'خطأ اتصال') + ').'
            });
          }
        });
      });
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          if (mode === 'cloud_api' && currentRoomCode) {
            pollCloudOnce();
          } else if (mode === 'p2p' && peerInstance && peerInstance.disconnected && !peerInstance.destroyed) {
            try { peerInstance.reconnect(); } catch (_e) {}
          }
        }
      });
    }

    // ==================== Local Offline Fallback (file:// without internet) ====================
    function loadLocalRoom(code) {
      try {
        const raw = localStorage.getItem('beh_local_room_' + code);
        return raw ? JSON.parse(raw) : null;
      } catch (_e) {
        return null;
      }
    }

    function saveLocalRoom(room) {
      try {
        localStorage.setItem('beh_local_room_' + room.code, JSON.stringify(room));
      } catch (_e) {}
      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage({ type: 'ROOM_UPDATED', roomCode: room.code });
        } catch (_e) {}
      }
    }

    function scheduleLocalBot(roomCode) {
      if (localBotTimer) clearTimeout(localBotTimer);
      localBotTimer = setTimeout(function () {
        const room = loadLocalRoom(roomCode);
        if (!room || room.status !== 'PLAYING') return;
        const acted = Engine.runBotStep(room);
        if (acted) {
          saveLocalRoom(room);
          if (currentRoomCode === roomCode) {
            notifyState(Engine.getPublicState(room));
          }
          scheduleLocalBot(roomCode);
        }
      }, 1100);
    }

    function activateLocalMode() {
      if (mode === 'local') return;
      mode = 'local';
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          broadcastChannel = new BroadcastChannel('bank_el_haz_local_sync');
          broadcastChannel.onmessage = function (ev) {
            if (ev.data && ev.data.type === 'ROOM_UPDATED' && ev.data.roomCode === currentRoomCode) {
              const room = loadLocalRoom(currentRoomCode);
              if (room) notifyState(Engine.getPublicState(room));
            }
          };
        } catch (_e) {}
      }
      root.addEventListener('storage', function (ev) {
        if (currentRoomCode && ev.key === 'beh_local_room_' + currentRoomCode) {
          const room = loadLocalRoom(currentRoomCode);
          if (room) notifyState(Engine.getPublicState(room));
        }
      });
      notifyConn({ mode: 'local', connected: true });
    }

    async function probeCloudOrFallback() {
      if (root.location.protocol !== 'file:') {
        const ping = await cloudGet({ ping: 1 }, 4000);
        if (ping && ping.ok && ping.engine === 'vercel-cloud') {
          mode = 'cloud_api';
          cloudConnected = true;
          cloudPublicInfo = {
            publicHost: ping.publicHost || null,
            vercelEnv: ping.vercelEnv || null
          };
          notifyConn({
            mode: 'cloud_api',
            connected: true,
            publicHost: cloudPublicInfo.publicHost,
            vercelEnv: cloudPublicInfo.vercelEnv
          });
          return mode;
        }
      }

      if (typeof root.Peer === 'function' && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        mode = 'p2p';
        notifyConn({ mode: 'p2p', connected: true });
        return mode;
      }

      activateLocalMode();
      return mode;
    }

    // ==================== Initialization ====================
    function init() {
      if (initPromise) return initPromise;

      if (typeof root.io === 'function' && root.location.protocol !== 'file:' && !root.__NO_SOCKET_IO__) {
        initPromise = new Promise(function (resolve) {
          let resolved = false;
          socket = root.io({
            reconnectionAttempts: 2,
            timeout: 3000
          });

          socket.on('connect', function () {
            mode = 'socket';
            notifyConn({ mode: 'socket', connected: true });
            if (!resolved) {
              resolved = true;
              resolve(mode);
            }
          });

          socket.on('disconnect', function () {
            if (mode === 'socket') {
              notifyConn({ mode: 'socket', connected: false });
            }
          });

          socket.on('connect_error', function () {
            if (!resolved) {
              resolved = true;
              try { socket.close(); } catch (_e) {}
              socket = null;
              probeCloudOrFallback().then(resolve);
            } else if (mode === 'socket') {
              notifyConn({ mode: 'socket', connected: false });
            }
          });

          socket.on('room:state', function (state) {
            if (state && state.code) {
              currentRoomCode = state.code;
            }
            notifyState(state);
          });
        });
        return initPromise;
      }

      initPromise = probeCloudOrFallback();
      return initPromise;
    }

    // ==================== Public API ====================
    async function createRoom(payload) {
      await init();

      if (mode === 'socket' && socket && socket.connected) {
        return new Promise(function (resolve) {
          socket.emit('room:create', payload, function (res) {
            if (res && res.ok) {
              currentRoomCode = res.roomCode;
              currentPlayerId = res.playerId;
              currentSessionToken = res.sessionToken;
              notifyState(res.state);
            }
            resolve(res || { ok: false, error: 'تعذر الاتصال بالخادم.' });
          });
        });
      }

      if (mode === 'cloud_api') {
        return cloudCreateRoom(payload);
      }

      if (mode === 'p2p') {
        return p2pCreateRoom(payload);
      }

      activateLocalMode();
      const res = Engine.createRoom({
        hostName: payload.playerName,
        avatarId: payload.avatarId
      });
      saveLocalRoom(res.room);
      currentRoomCode = res.room.code;
      currentPlayerId = res.player.id;
      const pub = Engine.getPublicState(res.room);
      notifyState(pub);
      return {
        ok: true,
        roomCode: res.room.code,
        playerId: res.player.id,
        sessionToken: 'local_' + res.player.id,
        state: pub
      };
    }

    async function joinRoom(payload) {
      const code = String((payload && payload.roomCode) || '').toUpperCase().trim();
      if (!code) {
        return { ok: false, error: 'يرجى إدخال كود الغرفة.' };
      }

      await init();

      if (mode === 'socket' && socket && socket.connected) {
        return new Promise(function (resolve) {
          socket.emit('room:join', payload, function (res) {
            if (res && res.ok) {
              currentRoomCode = res.roomCode;
              currentPlayerId = res.playerId;
              currentSessionToken = res.sessionToken;
              notifyState(res.state);
            }
            resolve(res || { ok: false, error: 'تعذر الانضمام للغرفة.' });
          });
        });
      }

      if (mode === 'cloud_api') {
        return cloudJoinRoom(payload);
      }

      if (mode === 'p2p') {
        return p2pJoinRoom(payload);
      }

      activateLocalMode();
      const room = loadLocalRoom(code);
      if (!room) {
        return {
          ok: false,
          error: 'الغرفة #' + code + ' غير موجودة محلياً. تأكد من اتصالك بالإنترنت.'
        };
      }

      let existingPlayerId = null;
      if (payload.sessionToken && payload.sessionToken.indexOf('local_') === 0) {
        existingPlayerId = payload.sessionToken.replace('local_', '');
      }

      const res = Engine.joinRoom(room, {
        playerName: payload.playerName,
        avatarId: payload.avatarId,
        existingPlayerId: existingPlayerId
      });
      if (!res.ok) return res;

      saveLocalRoom(room);
      currentRoomCode = room.code;
      currentPlayerId = res.player.id;
      const pub = Engine.getPublicState(room);
      notifyState(pub);
      scheduleLocalBot(room.code);
      return {
        ok: true,
        roomCode: room.code,
        playerId: res.player.id,
        sessionToken: 'local_' + res.player.id,
        reconnected: Boolean(res.reconnected),
        state: pub
      };
    }

    async function leaveRoom() {
      if (mode === 'socket' && socket && socket.connected) {
        return new Promise(function (resolve) {
          socket.emit('room:leave', {}, function () {
            currentRoomCode = null;
            currentPlayerId = null;
            resolve({ ok: true });
          });
        });
      }

      if (mode === 'cloud_api') {
        return cloudLeaveRoom();
      }

      if (mode === 'p2p') {
        const oldCode = currentRoomCode;
        if (p2pRole === 'host') {
          clearHostSnapshot(oldCode);
          cleanupP2P();
          currentRoomCode = null;
          currentPlayerId = null;
          return { ok: true };
        }
        if (p2pRole === 'guest' && guestHostConn && guestHostConn.open) {
          await sendGuestRequest('LEAVE', {}, 2500);
          cleanupP2P();
          currentRoomCode = null;
          currentPlayerId = null;
          return { ok: true };
        }
        cleanupP2P();
        currentRoomCode = null;
        currentPlayerId = null;
        return { ok: true };
      }

      if (currentRoomCode && currentPlayerId) {
        const room = loadLocalRoom(currentRoomCode);
        if (room) {
          if (room.status === 'LOBBY') {
            Engine.removePlayerFromLobby(room, currentPlayerId, currentPlayerId);
          } else if (room.status === 'PLAYING') {
            Engine.declareBankruptcy(room, currentPlayerId);
          }
          saveLocalRoom(room);
        }
      }
      currentRoomCode = null;
      currentPlayerId = null;
      return { ok: true };
    }

    async function sendAction(actionPayload) {
      if (mode === 'socket' && socket && socket.connected) {
        return new Promise(function (resolve) {
          socket.emit('game:action', actionPayload, function (res) {
            resolve(res || { ok: false, error: 'لم يستجب الخادم.' });
          });
        });
      }

      if (mode === 'cloud_api') {
        return cloudSendAction(actionPayload);
      }

      if (mode === 'p2p') {
        if (p2pRole === 'host' && hostRoom && currentPlayerId) {
          const result = executeEngineAction(hostRoom, currentPlayerId, actionPayload || {});
          if (result && result.ok) {
            broadcastP2PState();
          }
          return result;
        }
        if (p2pRole === 'guest') {
          return sendGuestRequest('ACTION', actionPayload || {}, 9000);
        }
        return { ok: false, error: 'أنت غير متصل بأي غرفة حالياً.' };
      }

      const room = loadLocalRoom(currentRoomCode);
      if (!room || !currentPlayerId) {
        return { ok: false, error: 'الغرفة غير متصلة.' };
      }

      const result = executeEngineAction(room, currentPlayerId, actionPayload || {});
      if (result && result.ok) {
        saveLocalRoom(room);
        notifyState(Engine.getPublicState(room));
        scheduleLocalBot(room.code);
      }
      return result;
    }

    async function fetchRoomPreview(code) {
      const clean = String(code || '').toUpperCase().trim();
      if (!clean) return null;

      await init();

      if (mode === 'socket' && root.location.protocol !== 'file:') {
        try {
          const res = await fetch('/api/room/' + encodeURIComponent(clean));
          if (res.ok) {
            const data = await res.json();
            if (data && data.ok) return data.room;
          }
        } catch (_e) {}
      }

      if (mode === 'cloud_api') {
        const res = await cloudGet({ code: clean, preview: 1 }, 4000);
        if (res && res.ok && res.room) return res.room;
      }

      const local = loadLocalRoom(clean);
      if (local) {
        const host = local.players.find(function (p) { return p.id === local.hostId; });
        return {
          code: local.code,
          status: local.status,
          playerCount: local.players.length,
          maxPlayers: 6,
          hostName: host ? host.name : 'المضيف'
        };
      }
      return null;
    }

    return {
      init: init,
      getMode: function () { return mode; },
      createRoom: createRoom,
      joinRoom: joinRoom,
      leaveRoom: leaveRoom,
      sendAction: sendAction,
      fetchRoomPreview: fetchRoomPreview,
      onState: function (fn) { stateListeners.push(fn); },
      onConnectionChange: function (fn) { connListeners.push(fn); }
    };
  }

  root.BankElHazNetwork = createNetworkClient();
})(typeof self !== 'undefined' ? self : this);
