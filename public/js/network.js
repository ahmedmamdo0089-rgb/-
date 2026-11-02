(function (root) {
  'use strict';

  const Engine = root.BankElHazEngine;

  // Verified global MQTT-over-WSS brokers (TCP/TLS WebSocket — bypasses 100% of mobile 4G CGNAT)
  const MQTT_BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt'
  ];

  const TOPIC_PREFIX = 'beh-egypt-v31/room/';

  function randomToken(prefix) {
    return (prefix || 'tok') + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5);
  }

  function delayMs(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // ==================== UTF-8 & Native MQTT 3.1.1 over WebSocket ====================
  const textEnc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const textDec = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

  function utf8Encode(str) {
    if (textEnc) return textEnc.encode(str);
    const unescaped = unescape(encodeURIComponent(str));
    const arr = new Uint8Array(unescaped.length);
    for (let i = 0; i < unescaped.length; i++) arr[i] = unescaped.charCodeAt(i);
    return arr;
  }

  function utf8Decode(bytes) {
    if (textDec) return textDec.decode(bytes);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(s)); } catch (_e) { return s; }
  }

  function encodeVarLength(len) {
    const out = [];
    let x = len;
    do {
      let b = x % 128;
      x = Math.floor(x / 128);
      if (x > 0) b = b | 0x80;
      out.push(b);
    } while (x > 0);
    return out;
  }

  function decodeVarLength(buf, startIdx) {
    let mult = 1;
    let val = 0;
    let idx = startIdx;
    let b = 0;
    do {
      if (idx >= buf.length) return null;
      b = buf[idx++];
      val += (b & 0x7f) * mult;
      if (mult > 128 * 128 * 128) return { error: true };
      mult *= 128;
    } while ((b & 0x80) !== 0);
    return { value: val, nextIdx: idx };
  }

  function concatUint8(a, b) {
    if (!a || a.length === 0) return b;
    const res = new Uint8Array(a.length + b.length);
    res.set(a, 0);
    res.set(b, a.length);
    return res;
  }

  function createMiniMqttClient(brokerUrl) {
    let ws = null;
    let isConnected = false;
    let closedManually = false;
    let rxBuffer = new Uint8Array(0);
    let pingTimer = null;
    let reconnectTimer = null;
    let pktCounter = 1;
    const subscribedTopics = new Set();
    const msgCallbacks = [];
    const statusCallbacks = [];
    const clientId = 'beh_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

    function nextPktId() {
      pktCounter = (pktCounter % 65000) + 1;
      return pktCounter;
    }

    function sendRaw(bytes) {
      if (ws && ws.readyState === 1) {
        try { ws.send(bytes); return true; } catch (_e) { return false; }
      }
      return false;
    }

    function buildConnectPacket() {
      const cid = utf8Encode(clientId);
      const vh = [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x3c]; // MQTT 3.1.1, CleanSession, KeepAlive 60s
      const remLen = vh.length + 2 + cid.length;
      const varBytes = encodeVarLength(remLen);
      const pkt = new Uint8Array(1 + varBytes.length + remLen);
      pkt[0] = 0x10;
      pkt.set(varBytes, 1);
      let off = 1 + varBytes.length;
      pkt.set(vh, off);
      off += vh.length;
      pkt[off++] = (cid.length >> 8) & 0xff;
      pkt[off++] = cid.length & 0xff;
      pkt.set(cid, off);
      return pkt;
    }

    function sendSubscribePacket(topic) {
      const tb = utf8Encode(topic);
      const pid = nextPktId();
      const remLen = 2 + 2 + tb.length + 1;
      const varBytes = encodeVarLength(remLen);
      const pkt = new Uint8Array(1 + varBytes.length + remLen);
      pkt[0] = 0x82;
      pkt.set(varBytes, 1);
      let off = 1 + varBytes.length;
      pkt[off++] = (pid >> 8) & 0xff;
      pkt[off++] = pid & 0xff;
      pkt[off++] = (tb.length >> 8) & 0xff;
      pkt[off++] = tb.length & 0xff;
      pkt.set(tb, off);
      off += tb.length;
      pkt[off] = 0x00; // QoS 0
      return sendRaw(pkt);
    }

    function sendUnsubscribePacket(topic) {
      const tb = utf8Encode(topic);
      const pid = nextPktId();
      const remLen = 2 + 2 + tb.length;
      const varBytes = encodeVarLength(remLen);
      const pkt = new Uint8Array(1 + varBytes.length + remLen);
      pkt[0] = 0xa2;
      pkt.set(varBytes, 1);
      let off = 1 + varBytes.length;
      pkt[off++] = (pid >> 8) & 0xff;
      pkt[off++] = pid & 0xff;
      pkt[off++] = (tb.length >> 8) & 0xff;
      pkt[off++] = tb.length & 0xff;
      pkt.set(tb, off);
      return sendRaw(pkt);
    }

    function publish(topic, objOrStr, retain) {
      const str = typeof objOrStr === 'string' ? objOrStr : JSON.stringify(objOrStr);
      const tb = utf8Encode(topic);
      const mb = utf8Encode(str);
      const remLen = 2 + tb.length + mb.length;
      const varBytes = encodeVarLength(remLen);
      const pkt = new Uint8Array(1 + varBytes.length + remLen);
      pkt[0] = retain ? 0x31 : 0x30;
      pkt.set(varBytes, 1);
      let off = 1 + varBytes.length;
      pkt[off++] = (tb.length >> 8) & 0xff;
      pkt[off++] = tb.length & 0xff;
      pkt.set(tb, off);
      off += tb.length;
      pkt.set(mb, off);
      return sendRaw(pkt);
    }

    function emitStatus(up) {
      statusCallbacks.forEach(function (fn) {
        try { fn(up); } catch (_e) {}
      });
    }

    function processIncomingBuffer() {
      while (rxBuffer.length >= 2) {
        const header = rxBuffer[0];
        const pktType = header >> 4;
        const rem = decodeVarLength(rxBuffer, 1);
        if (!rem) break;
        if (rem.error) {
          rxBuffer = new Uint8Array(0);
          break;
        }
        const pktEnd = rem.nextIdx + rem.value;
        if (rxBuffer.length < pktEnd) break;

        const body = rxBuffer.subarray(rem.nextIdx, pktEnd);
        rxBuffer = rxBuffer.slice(pktEnd);

        if (pktType === 2) {
          // CONNACK
          if (body.length >= 2 && body[1] === 0) {
            isConnected = true;
            subscribedTopics.forEach(function (t) { sendSubscribePacket(t); });
            if (pingTimer) clearInterval(pingTimer);
            pingTimer = setInterval(function () {
              sendRaw(new Uint8Array([0xc0, 0x00]));
            }, 24000);
            emitStatus(true);
          }
        } else if (pktType === 3) {
          // PUBLISH
          const qos = (header >> 1) & 0x03;
          if (body.length >= 2) {
            const tLen = (body[0] << 8) | body[1];
            if (body.length >= 2 + tLen) {
              const topic = utf8Decode(body.subarray(2, 2 + tLen));
              let pOff = 2 + tLen;
              if (qos > 0 && body.length >= pOff + 2) {
                const pid = (body[pOff] << 8) | body[pOff + 1];
                pOff += 2;
                if (qos === 1) {
                  sendRaw(new Uint8Array([0x40, 0x02, (pid >> 8) & 0xff, pid & 0xff]));
                }
              }
              const payloadStr = utf8Decode(body.subarray(pOff));
              msgCallbacks.forEach(function (fn) {
                try { fn(topic, payloadStr); } catch (_e) {}
              });
            }
          }
        }
      }
    }

    function connect(timeoutMs) {
      closedManually = false;
      if (isConnected && ws && ws.readyState === 1) {
        return Promise.resolve(true);
      }
      return new Promise(function (resolve) {
        let settled = false;
        const timer = setTimeout(function () {
          if (!settled) {
            settled = true;
            try { if (ws) ws.close(); } catch (_e) {}
            resolve(false);
          }
        }, timeoutMs || 5000);

        try {
          if (ws) {
            try { ws.onclose = null; ws.close(); } catch (_e) {}
          }
          rxBuffer = new Uint8Array(0);
          ws = new root.WebSocket(brokerUrl, 'mqtt');
          ws.binaryType = 'arraybuffer';
        } catch (_err) {
          clearTimeout(timer);
          resolve(false);
          return;
        }

        ws.onopen = function () {
          sendRaw(buildConnectPacket());
        };

        ws.onmessage = function (ev) {
          if (!ev || !ev.data) return;
          rxBuffer = concatUint8(rxBuffer, new Uint8Array(ev.data));
          const wasConnected = isConnected;
          processIncomingBuffer();
          if (!wasConnected && isConnected && !settled) {
            settled = true;
            clearTimeout(timer);
            resolve(true);
          }
        };

        ws.onerror = function () {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(false);
          }
        };

        ws.onclose = function () {
          const hadConn = isConnected;
          isConnected = false;
          if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
          }
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(false);
          }
          if (hadConn) emitStatus(false);
          if (!closedManually) {
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(function () {
              if (!closedManually) connect(5000);
            }, 1500);
          }
        };
      });
    }

    function subscribe(topic) {
      subscribedTopics.add(topic);
      if (isConnected) sendSubscribePacket(topic);
    }

    function unsubscribe(topic) {
      subscribedTopics.delete(topic);
      if (isConnected) sendUnsubscribePacket(topic);
    }

    function close() {
      closedManually = true;
      isConnected = false;
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      subscribedTopics.clear();
      if (ws) {
        try {
          sendRaw(new Uint8Array([0xe0, 0x00]));
          ws.onclose = null;
          ws.close();
        } catch (_e) {}
        ws = null;
      }
    }

    return {
      url: brokerUrl,
      clientId: clientId,
      connect: connect,
      subscribe: subscribe,
      unsubscribe: unsubscribe,
      publish: publish,
      close: close,
      isConnected: function () { return isConnected; },
      onMessage: function (fn) { msgCallbacks.push(fn); },
      onStatus: function (fn) { statusCallbacks.push(fn); }
    };
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
    let mode = 'connecting'; // 'socket' | 'mqtt_cloud' | 'cloud_api' | 'local'
    let initPromise = null;
    let socket = null;
    let stateListeners = [];
    let connListeners = [];
    let currentRoomCode = null;
    let currentPlayerId = null;
    let currentSessionToken = null;
    let publicHostInfo = { publicHost: null, vercelEnv: null };

    // ==================== Global MQTT-over-WSS Mesh State ====================
    let mqttRole = null; // 'host' | 'guest'
    let mqttClients = []; // Host mirrors across brokers; Guest uses active connected broker
    let activeGuestMqtt = null;
    let guestClientId = randomToken('gcli');
    let guestLastVersion = 0;
    let guestSyncTimer = null;
    let pendingMqttReqs = new Map(); // reqId -> { resolve, timer }

    let hostRoom = null;
    let hostRoomVersion = 1;
    let hostSessions = {}; // sessionToken -> playerId
    let hostLastSeen = {}; // playerId -> timestamp
    let hostProcessedReqIds = new Set();
    let hostBotTimer = null;
    let hostPresenceTimer = null;

    // Vercel Cloud API (/api/room) Fallback State
    let cloudVersion = 0;
    let cloudLatestBackup = null;
    let cloudPollTimer = null;
    let cloudPollInFlight = false;

    // Local Offline Fallback State
    let localBotTimer = null;
    let broadcastChannel = null;

    function notifyState(state) {
      stateListeners.forEach(function (fn) {
        try { fn(state); } catch (err) { console.error(err); }
      });
    }

    function notifyConn(info) {
      const merged = Object.assign({
        publicHost: publicHostInfo.publicHost,
        vercelEnv: publicHostInfo.vercelEnv
      }, info || {});
      connListeners.forEach(function (fn) {
        try { fn(merged); } catch (err) { console.error(err); }
      });
    }

    function roomTopic(code, sub) {
      return TOPIC_PREFIX + String(code || '').toUpperCase().trim() + '/' + sub;
    }

    // ==================== Host Snapshot Persistence (Page Refresh Recovery) ====================
    function saveHostSnapshot() {
      if (!hostRoom || mqttRole !== 'host') return;
      try {
        sessionStorage.setItem('beh_mqtt_host_' + hostRoom.code, JSON.stringify({
          room: hostRoom,
          version: hostRoomVersion,
          sessions: hostSessions,
          hostPlayerId: currentPlayerId,
          hostToken: currentSessionToken
        }));
      } catch (_e) {}
    }

    function loadHostSnapshot(code) {
      try {
        const raw = sessionStorage.getItem('beh_mqtt_host_' + code);
        return raw ? JSON.parse(raw) : null;
      } catch (_e) {
        return null;
      }
    }

    function clearHostSnapshot(code) {
      try {
        if (code) sessionStorage.removeItem('beh_mqtt_host_' + code);
      } catch (_e) {}
    }

    function cleanupMqttRoom(clearRetainedCode) {
      if (clearRetainedCode && mqttRole === 'host') {
        const stTopic = roomTopic(clearRetainedCode, 'state');
        mqttClients.forEach(function (c) {
          if (c.isConnected()) c.publish(stTopic, '', true);
        });
      }
      if (hostBotTimer) { clearTimeout(hostBotTimer); hostBotTimer = null; }
      if (hostPresenceTimer) { clearInterval(hostPresenceTimer); hostPresenceTimer = null; }
      if (guestSyncTimer) { clearInterval(guestSyncTimer); guestSyncTimer = null; }

      pendingMqttReqs.forEach(function (entry) {
        clearTimeout(entry.timer);
        entry.resolve({ ok: false, error: 'تم إنهاء الاتصال بالغرفة.' });
      });
      pendingMqttReqs.clear();

      mqttClients.forEach(function (c) {
        try { c.close(); } catch (_e) {}
      });
      mqttClients = [];
      activeGuestMqtt = null;
      mqttRole = null;
      hostRoom = null;
    }

    function broadcastMqttHostState() {
      if (!hostRoom || mqttRole !== 'host') return;
      hostRoomVersion += 1;
      saveHostSnapshot();
      const pub = Engine.getPublicState(hostRoom);
      notifyState(pub);

      const hostObj = hostRoom.players.find(function (p) { return p.id === hostRoom.hostId; });
      const envelope = {
        v: hostRoomVersion,
        state: pub,
        preview: {
          code: hostRoom.code,
          status: hostRoom.status,
          playerCount: hostRoom.players.length,
          maxPlayers: 6,
          hostName: hostObj ? hostObj.name : 'المضيف'
        },
        ts: Date.now()
      };

      const stTopic = roomTopic(hostRoom.code, 'state');
      mqttClients.forEach(function (c) {
        if (c.isConnected()) {
          c.publish(stTopic, envelope, true);
        }
      });

      scheduleMqttHostBot();
    }

    function scheduleMqttHostBot() {
      if (hostBotTimer) {
        clearTimeout(hostBotTimer);
        hostBotTimer = null;
      }
      if (!hostRoom || mqttRole !== 'host' || hostRoom.status !== 'PLAYING') return;
      hostBotTimer = setTimeout(function () {
        if (!hostRoom || mqttRole !== 'host' || hostRoom.status !== 'PLAYING') return;
        const acted = Engine.runBotStep(hostRoom);
        if (acted) {
          broadcastMqttHostState();
        }
      }, 1100);
    }

    function handleIncomingHostMessage(client, topic, payloadStr) {
      if (!hostRoom || mqttRole !== 'host' || !payloadStr) return;
      const expectedReqTopic = roomTopic(hostRoom.code, 'req');
      if (topic !== expectedReqTopic) return;

      let msg = null;
      try { msg = JSON.parse(payloadStr); } catch (_e) { return; }
      if (!msg || !msg.kind) return;

      const replyTopic = msg.clientId ? roomTopic(hostRoom.code, 'ack/' + msg.clientId) : null;

      // Sync heartbeat (idempotent, not deduplicated by reqId)
      if (msg.kind === 'SYNC') {
        if (msg.playerId) {
          hostLastSeen[msg.playerId] = Date.now();
          const pl = hostRoom.players.find(function (p) { return p.id === msg.playerId; });
          if (pl && !pl.connected) {
            pl.connected = true;
            broadcastMqttHostState();
            return;
          }
        }
        if (replyTopic && Number(msg.v || 0) < hostRoomVersion) {
          client.publish(replyTopic, {
            kind: 'SYNC_STATE',
            v: hostRoomVersion,
            state: Engine.getPublicState(hostRoom)
          }, false);
        }
        return;
      }

      if (msg.reqId) {
        if (hostProcessedReqIds.has(msg.reqId)) return;
        hostProcessedReqIds.add(msg.reqId);
        if (hostProcessedReqIds.size > 400) {
          const first = hostProcessedReqIds.values().next().value;
          hostProcessedReqIds.delete(first);
        }
      }

      if (msg.kind === 'PREVIEW') {
        if (replyTopic) {
          const hostObj = hostRoom.players.find(function (p) { return p.id === hostRoom.hostId; });
          client.publish(replyTopic, {
            reqId: msg.reqId,
            res: {
              ok: true,
              room: {
                code: hostRoom.code,
                status: hostRoom.status,
                playerCount: hostRoom.players.length,
                maxPlayers: 6,
                hostName: hostObj ? hostObj.name : 'المضيف'
              }
            }
          }, false);
        }
        return;
      }

      if (msg.kind === 'JOIN') {
        const p = msg.payload || {};
        let existingPlayerId = null;
        let token = p.sessionToken;
        if (token && hostSessions[token]) {
          existingPlayerId = hostSessions[token];
        }

        const joined = Engine.joinRoom(hostRoom, {
          playerName: p.playerName,
          avatarId: p.avatarId,
          existingPlayerId: existingPlayerId
        });

        if (!joined.ok) {
          if (replyTopic) {
            client.publish(replyTopic, { reqId: msg.reqId, res: joined }, false);
          }
          return;
        }

        if (!joined.reconnected || !token) {
          token = randomToken('mqs');
          hostSessions[token] = joined.player.id;
        }
        hostLastSeen[joined.player.id] = Date.now();

        const nextVer = hostRoomVersion + 1;
        const pub = Engine.getPublicState(hostRoom);
        if (replyTopic) {
          const ackPayload = {
            reqId: msg.reqId,
            res: {
              ok: true,
              roomCode: hostRoom.code,
              playerId: joined.player.id,
              sessionToken: token,
              reconnected: Boolean(joined.reconnected),
              v: nextVer,
              state: pub
            }
          };
          // Reply on all connected brokers to guarantee delivery
          mqttClients.forEach(function (c) {
            if (c.isConnected()) c.publish(replyTopic, ackPayload, false);
          });
        }

        broadcastMqttHostState();
        return;
      }

      if (msg.kind === 'LEAVE') {
        const tok = msg.sessionToken;
        const pid = tok ? hostSessions[tok] : null;
        if (pid && hostRoom) {
          if (hostRoom.status === 'LOBBY') {
            Engine.removePlayerFromLobby(hostRoom, pid, pid);
          } else if (hostRoom.status === 'PLAYING') {
            Engine.declareBankruptcy(hostRoom, pid);
          }
          delete hostSessions[tok];
          delete hostLastSeen[pid];
          broadcastMqttHostState();
        }
        if (replyTopic) {
          client.publish(replyTopic, { reqId: msg.reqId, res: { ok: true } }, false);
        }
        return;
      }

      if (msg.kind === 'ACTION') {
        const tok = msg.sessionToken;
        const pid = tok ? hostSessions[tok] : null;
        if (!pid) {
          if (replyTopic) {
            client.publish(replyTopic, {
              reqId: msg.reqId,
              res: { ok: false, error: 'انتهت جلسة الاتصال بالغرفة، أعد تحميل الصفحة للانضمام مجدداً.' }
            }, false);
          }
          return;
        }
        hostLastSeen[pid] = Date.now();
        const result = executeEngineAction(hostRoom, pid, msg.payload || {});
        if (result && result.ok) {
          broadcastMqttHostState();
        }
        if (replyTopic) {
          const ackMsg = {
            reqId: msg.reqId,
            res: Object.assign({}, result, {
              v: hostRoomVersion,
              state: Engine.getPublicState(hostRoom)
            })
          };
          mqttClients.forEach(function (c) {
            if (c.isConnected()) c.publish(replyTopic, ackMsg, false);
          });
        }
      }
    }

    async function startMqttHostSession(roomObj, hostPlayerId, hostToken, sessionsMap, initialVer) {
      cleanupMqttRoom(null);

      const reqTopic = roomTopic(roomObj.code, 'req');
      const clients = MQTT_BROKERS.map(function (url) {
        const c = createMiniMqttClient(url);
        c.onMessage(function (topic, payloadStr) {
          handleIncomingHostMessage(c, topic, payloadStr);
        });
        c.onStatus(function () {
          const anyUp = mqttClients.some(function (mc) { return mc.isConnected(); });
          notifyConn({ mode: 'mqtt_cloud', connected: anyUp });
          if (c.isConnected() && hostRoom && mqttRole === 'host') {
            c.subscribe(roomTopic(hostRoom.code, 'req'));
            const pub = Engine.getPublicState(hostRoom);
            const hostObj = hostRoom.players.find(function (p) { return p.id === hostRoom.hostId; });
            c.publish(roomTopic(hostRoom.code, 'state'), {
              v: hostRoomVersion,
              state: pub,
              preview: {
                code: hostRoom.code,
                status: hostRoom.status,
                playerCount: hostRoom.players.length,
                maxPlayers: 6,
                hostName: hostObj ? hostObj.name : 'المضيف'
              },
              ts: Date.now()
            }, true);
          }
        });
        return c;
      });

      mqttClients = clients;
      const results = await Promise.all(clients.map(function (c) { return c.connect(5500); }));
      const anyConnected = results.some(Boolean);
      if (!anyConnected) {
        cleanupMqttRoom(null);
        return { ok: false, mqttUnreachable: true, error: 'تعذر الاتصال بخادم الغرف السحابية.' };
      }

      mqttRole = 'host';
      hostRoom = roomObj;
      hostRoomVersion = initialVer || 1;
      hostSessions = sessionsMap || {};
      hostLastSeen = {};
      currentRoomCode = roomObj.code;
      currentPlayerId = hostPlayerId;
      currentSessionToken = hostToken;

      clients.forEach(function (c) {
        c.subscribe(reqTopic);
      });

      // Track guest presence (mark disconnected only after 35s of total silence)
      hostPresenceTimer = setInterval(function () {
        if (!hostRoom || mqttRole !== 'host') return;
        const now = Date.now();
        let changed = false;
        hostRoom.players.forEach(function (pl) {
          if (pl.isBot || pl.id === currentPlayerId) {
            if (!pl.connected) { pl.connected = true; changed = true; }
            return;
          }
          const seen = hostLastSeen[pl.id] || now;
          if (pl.connected && now - seen > 35000) {
            pl.connected = false;
            changed = true;
          }
        });
        if (changed) broadcastMqttHostState();
      }, 6000);

      notifyConn({ mode: 'mqtt_cloud', connected: true });
      broadcastMqttHostState();

      return {
        ok: true,
        roomCode: hostRoom.code,
        playerId: hostPlayerId,
        sessionToken: hostToken,
        state: Engine.getPublicState(hostRoom)
      };
    }

    async function mqttCreateRoom(payload) {
      const created = Engine.createRoom({
        hostName: payload.playerName,
        avatarId: payload.avatarId
      });
      const hostToken = randomToken('mqhost');
      const sessionsMap = {};
      sessionsMap[hostToken] = created.player.id;
      return startMqttHostSession(created.room, created.player.id, hostToken, sessionsMap, 1);
    }

    function sendMqttGuestRequest(kind, bodyFields, timeoutMs) {
      return new Promise(function (resolve) {
        if (!activeGuestMqtt || !activeGuestMqtt.isConnected() || !currentRoomCode) {
          resolve({ ok: false, error: 'جاري إعادة الاتصال بالغرفة... حاول بعد لحظة.' });
          return;
        }
        const reqId = randomToken('req');
        const timer = setTimeout(function () {
          pendingMqttReqs.delete(reqId);
          resolve({ ok: false, timeout: true, error: 'انتهت مهلة انتظار استجابة الغرفة.' });
        }, timeoutMs || 7000);

        pendingMqttReqs.set(reqId, { resolve: resolve, timer: timer });

        const packet = Object.assign({
          kind: kind,
          reqId: reqId,
          clientId: guestClientId
        }, bodyFields || {});

        activeGuestMqtt.publish(roomTopic(currentRoomCode, 'req'), packet, false);
      });
    }

    async function tryJoinOnBroker(brokerUrl, code, payload) {
      const client = createMiniMqttClient(brokerUrl);
      const ok = await client.connect(5000);
      if (!ok) {
        client.close();
        return { ok: false, brokerDown: true };
      }

      const myAckTopic = roomTopic(code, 'ack/' + guestClientId);
      const stTopic = roomTopic(code, 'state');

      client.onMessage(function (topic, payloadStr) {
        if (!payloadStr) return;
        let msg = null;
        try { msg = JSON.parse(payloadStr); } catch (_e) { return; }
        if (!msg) return;

        if (topic === stTopic && msg.state) {
          if (!msg.v || msg.v >= guestLastVersion) {
            guestLastVersion = msg.v || guestLastVersion;
            if (mqttRole === 'guest' && currentRoomCode === code) {
              notifyState(msg.state);
            }
          }
          return;
        }

        if (topic === myAckTopic) {
          if (msg.kind === 'SYNC_STATE' && msg.state) {
            guestLastVersion = msg.v || guestLastVersion;
            notifyState(msg.state);
            return;
          }
          if (msg.reqId && pendingMqttReqs.has(msg.reqId)) {
            const pending = pendingMqttReqs.get(msg.reqId);
            clearTimeout(pending.timer);
            pendingMqttReqs.delete(msg.reqId);
            pending.resolve(msg.res);
          }
        }
      });

      client.onStatus(function (up) {
        if (mqttRole === 'guest' && activeGuestMqtt === client) {
          notifyConn({ mode: 'mqtt_cloud', connected: up });
          if (up && currentRoomCode) {
            client.subscribe(roomTopic(currentRoomCode, 'ack/' + guestClientId));
            client.subscribe(roomTopic(currentRoomCode, 'state'));
            client.publish(roomTopic(currentRoomCode, 'req'), {
              kind: 'SYNC',
              clientId: guestClientId,
              playerId: currentPlayerId,
              v: guestLastVersion
            }, false);
          }
        }
      });

      client.subscribe(myAckTopic);
      client.subscribe(stTopic);
      await delayMs(120);

      // Try up to 2 JOIN sends on this broker
      for (let attempt = 0; attempt < 2; attempt++) {
        const reqId = randomToken('jreq');
        const joinRes = await new Promise(function (resolve) {
          const timer = setTimeout(function () {
            pendingMqttReqs.delete(reqId);
            resolve(null);
          }, 2800);
          pendingMqttReqs.set(reqId, { resolve: resolve, timer: timer });
          client.publish(roomTopic(code, 'req'), {
            kind: 'JOIN',
            reqId: reqId,
            clientId: guestClientId,
            payload: payload
          }, false);
        });

        if (joinRes) {
          if (joinRes.ok) {
            return { ok: true, client: client, joinRes: joinRes };
          }
          client.close();
          return { ok: false, definitiveError: joinRes.error };
        }
      }

      client.close();
      return { ok: false, noResponse: true };
    }

    async function mqttJoinRoom(payload) {
      const code = String((payload && payload.roomCode) || '').toUpperCase().trim();
      if (!code) return { ok: false, error: 'يرجى إدخال كود الغرفة.' };

      // Check if THIS browser tab is the Host refreshing their own page!
      const savedHost = loadHostSnapshot(code);
      if (savedHost && savedHost.room && payload.sessionToken && payload.sessionToken === savedHost.hostToken) {
        const hostPl = savedHost.room.players.find(function (p) { return p.id === savedHost.hostPlayerId; });
        if (hostPl) hostPl.connected = true;
        const resumed = await startMqttHostSession(
          savedHost.room,
          savedHost.hostPlayerId,
          savedHost.hostToken,
          savedHost.sessions,
          savedHost.version || 1
        );
        if (resumed.ok) resumed.reconnected = true;
        return resumed;
      }

      cleanupMqttRoom(null);

      for (let i = 0; i < MQTT_BROKERS.length; i++) {
        const attempt = await tryJoinOnBroker(MQTT_BROKERS[i], code, payload);
        if (attempt.ok) {
          const jr = attempt.joinRes;
          mqttClients = [attempt.client];
          activeGuestMqtt = attempt.client;
          mqttRole = 'guest';
          currentRoomCode = jr.roomCode;
          currentPlayerId = jr.playerId;
          currentSessionToken = jr.sessionToken;
          guestLastVersion = jr.v || 1;

          notifyConn({ mode: 'mqtt_cloud', connected: true });
          notifyState(jr.state);

          guestSyncTimer = setInterval(function () {
            if (mqttRole === 'guest' && activeGuestMqtt && activeGuestMqtt.isConnected() && currentRoomCode) {
              activeGuestMqtt.publish(roomTopic(currentRoomCode, 'req'), {
                kind: 'SYNC',
                clientId: guestClientId,
                playerId: currentPlayerId,
                v: guestLastVersion
              }, false);
            }
          }, 4500);

          return jr;
        }
        if (attempt.definitiveError) {
          return { ok: false, error: attempt.definitiveError };
        }
      }

      return {
        ok: false,
        code: 'ROOM_NOT_FOUND',
        error: 'لم يتم العثور على الغرفة #' + code + '. تأكد من صحة الكود وأن منشئ الغرفة يفتح اللعبة الآن على نفس الرابط المحدّث.'
      };
    }

    async function mqttFetchPreview(code) {
      for (let i = 0; i < MQTT_BROKERS.length; i++) {
        const c = createMiniMqttClient(MQTT_BROKERS[i]);
        const connected = await c.connect(3000);
        if (!connected) {
          c.close();
          continue;
        }
        const preview = await new Promise(function (resolve) {
          let done = false;
          const reqId = randomToken('prev');
          const ackT = roomTopic(code, 'ack/' + c.clientId);
          const stT = roomTopic(code, 'state');

          const timer = setTimeout(function () {
            if (!done) { done = true; resolve(null); }
          }, 1800);

          c.onMessage(function (topic, str) {
            if (done || !str) return;
            try {
              const obj = JSON.parse(str);
              if (topic === stT && obj && obj.preview) {
                done = true;
                clearTimeout(timer);
                resolve(obj.preview);
              } else if (topic === ackT && obj && obj.reqId === reqId && obj.res && obj.res.room) {
                done = true;
                clearTimeout(timer);
                resolve(obj.res.room);
              }
            } catch (_e) {}
          });

          c.subscribe(stT);
          c.subscribe(ackT);
          setTimeout(function () {
            if (!done) {
              c.publish(roomTopic(code, 'req'), {
                kind: 'PREVIEW',
                reqId: reqId,
                clientId: c.clientId
              }, false);
            }
          }, 90);
        });
        c.close();
        if (preview) return preview;
      }
      return null;
    }

    // ==================== Vercel Cloud API (/api/room) Secondary Fallback ====================
    async function fetchCloudJson(url, options, timeoutMs) {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 6000) : null;
      try {
        const fetchOpts = Object.assign({ cache: 'no-store' }, options || {});
        if (ctrl) fetchOpts.signal = ctrl.signal;
        const res = await fetch(url, fetchOpts);
        const ct = String(res.headers.get('content-type') || '');
        if (ct.indexOf('application/json') === -1) return { ok: false, nonJson: true };
        return await res.json();
      } catch (_err) {
        return { ok: false, networkError: true };
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

    function stopCloudPolling() {
      if (cloudPollTimer) { clearInterval(cloudPollTimer); cloudPollTimer = null; }
      cloudPollInFlight = false;
    }

    async function pollCloudOnce() {
      if (mode !== 'cloud_api' || !currentRoomCode || cloudPollInFlight) return;
      cloudPollInFlight = true;
      try {
        const res = await cloudGet({ code: currentRoomCode, session: currentSessionToken, v: cloudVersion }, 5500);
        if (res && res.code === 'ROOM_NOT_FOUND' && cloudLatestBackup) {
          await cloudPost({ op: 'HYDRATE', backup: cloudLatestBackup }, 5000);
          return;
        }
        if (res && res.ok && !res.unchanged && res.state) {
          cloudVersion = res.v || cloudVersion;
          if (res.backup) cloudLatestBackup = res.backup;
          notifyState(res.state);
        }
      } finally {
        cloudPollInFlight = false;
      }
    }

    // ==================== Local Offline Fallback (file:// without internet) ====================
    function loadLocalRoom(code) {
      try {
        const raw = localStorage.getItem('beh_local_room_' + code);
        return raw ? JSON.parse(raw) : null;
      } catch (_e) { return null; }
    }

    function saveLocalRoom(room) {
      try { localStorage.setItem('beh_local_room_' + room.code, JSON.stringify(room)); } catch (_e) {}
      if (broadcastChannel) {
        try { broadcastChannel.postMessage({ type: 'ROOM_UPDATED', roomCode: room.code }); } catch (_e) {}
      }
    }

    function scheduleLocalBot(roomCode) {
      if (localBotTimer) clearTimeout(localBotTimer);
      localBotTimer = setTimeout(function () {
        const room = loadLocalRoom(roomCode);
        if (!room || room.status !== 'PLAYING') return;
        if (Engine.runBotStep(room)) {
          saveLocalRoom(room);
          if (currentRoomCode === roomCode) notifyState(Engine.getPublicState(room));
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

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          if (mode === 'mqtt_cloud') {
            if (mqttRole === 'host' && hostRoom) {
              mqttClients.forEach(function (c) {
                if (!c.isConnected()) c.connect(4000);
              });
              broadcastMqttHostState();
            } else if (mqttRole === 'guest' && activeGuestMqtt) {
              if (!activeGuestMqtt.isConnected()) {
                activeGuestMqtt.connect(4000);
              } else if (currentRoomCode) {
                activeGuestMqtt.publish(roomTopic(currentRoomCode, 'req'), {
                  kind: 'SYNC',
                  clientId: guestClientId,
                  playerId: currentPlayerId,
                  v: guestLastVersion
                }, false);
              }
            }
          } else if (mode === 'cloud_api' && currentRoomCode) {
            pollCloudOnce();
          }
        }
      });
    }

    async function probeGlobalTransport() {
      // Background check for Vercel public production domain (non-blocking)
      if (root.location.protocol !== 'file:') {
        cloudGet({ ping: 1 }, 3500).then(function (ping) {
          if (ping && ping.ok && ping.publicHost) {
            publicHostInfo = {
              publicHost: ping.publicHost || null,
              vercelEnv: ping.vercelEnv || null
            };
            notifyConn({ mode: mode, connected: true });
          }
        });
      }

      // 1) Test Global MQTT-over-WSS Mesh (works across ALL 4G/5G/Wi-Fi networks worldwide!)
      if (typeof root.WebSocket === 'function' && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        for (let i = 0; i < MQTT_BROKERS.length; i++) {
          const probe = createMiniMqttClient(MQTT_BROKERS[i]);
          const reachable = await probe.connect(4000);
          probe.close();
          if (reachable) {
            mode = 'mqtt_cloud';
            notifyConn({ mode: 'mqtt_cloud', connected: true });
            return mode;
          }
        }
      }

      // 2) Fallback to Vercel HTTPS /api/room if WebSockets on 8084/8884 are blocked
      if (root.location.protocol !== 'file:') {
        const ping = await cloudGet({ ping: 1 }, 3500);
        if (ping && ping.ok && ping.engine === 'vercel-cloud') {
          mode = 'cloud_api';
          publicHostInfo = {
            publicHost: ping.publicHost || null,
            vercelEnv: ping.vercelEnv || null
          };
          notifyConn({ mode: 'cloud_api', connected: true });
          return mode;
        }
      }

      // 3) Offline local mode
      activateLocalMode();
      return mode;
    }

    // ==================== Initialization ====================
    function init() {
      if (initPromise) return initPromise;

      if (typeof root.io === 'function' && root.location.protocol !== 'file:' && !root.__NO_SOCKET_IO__) {
        initPromise = new Promise(function (resolve) {
          let resolved = false;
          socket = root.io({ reconnectionAttempts: 2, timeout: 2500 });

          socket.on('connect', function () {
            mode = 'socket';
            notifyConn({ mode: 'socket', connected: true });
            if (!resolved) { resolved = true; resolve(mode); }
          });

          socket.on('disconnect', function () {
            if (mode === 'socket') notifyConn({ mode: 'socket', connected: false });
          });

          socket.on('connect_error', function () {
            if (!resolved) {
              resolved = true;
              try { socket.close(); } catch (_e) {}
              socket = null;
              probeGlobalTransport().then(resolve);
            } else if (mode === 'socket') {
              notifyConn({ mode: 'socket', connected: false });
            }
          });

          socket.on('room:state', function (state) {
            if (state && state.code) currentRoomCode = state.code;
            notifyState(state);
          });
        });
        return initPromise;
      }

      initPromise = probeGlobalTransport();
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

      if (mode === 'mqtt_cloud') {
        const mqRes = await mqttCreateRoom(payload);
        if (mqRes.ok || !mqRes.mqttUnreachable) return mqRes;
      }

      if (mode === 'cloud_api') {
        const res = await cloudPost({ op: 'CREATE', playerName: payload.playerName, avatarId: payload.avatarId }, 8000);
        if (res && res.ok) {
          currentRoomCode = res.roomCode;
          currentPlayerId = res.playerId;
          currentSessionToken = res.sessionToken;
          cloudVersion = res.v || 1;
          cloudLatestBackup = res.backup || null;
          notifyState(res.state);
          stopCloudPolling();
          cloudPollTimer = setInterval(pollCloudOnce, 1100);
          return res;
        }
        return res || { ok: false, error: 'تعذر إنشاء الغرفة السحابية.' };
      }

      activateLocalMode();
      const res = Engine.createRoom({ hostName: payload.playerName, avatarId: payload.avatarId });
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
      if (!code) return { ok: false, error: 'يرجى إدخال كود الغرفة.' };

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

      if (mode === 'mqtt_cloud') {
        return mqttJoinRoom(payload);
      }

      if (mode === 'cloud_api') {
        const res = await cloudPost({
          op: 'JOIN',
          roomCode: code,
          playerName: payload.playerName,
          avatarId: payload.avatarId,
          sessionToken: payload.sessionToken
        }, 8000);
        if (res && res.ok) {
          currentRoomCode = res.roomCode;
          currentPlayerId = res.playerId;
          currentSessionToken = res.sessionToken;
          cloudVersion = res.v || 1;
          cloudLatestBackup = res.backup || null;
          notifyState(res.state);
          stopCloudPolling();
          cloudPollTimer = setInterval(pollCloudOnce, 1100);
          return res;
        }
        return res || { ok: false, error: 'تعذر الانضمام للغرفة #' + code + '.' };
      }

      activateLocalMode();
      const room = loadLocalRoom(code);
      if (!room) {
        return { ok: false, error: 'الغرفة #' + code + ' غير موجودة محلياً. تأكد من اتصالك بالإنترنت.' };
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

      if (mode === 'mqtt_cloud') {
        const oldCode = currentRoomCode;
        if (mqttRole === 'host') {
          clearHostSnapshot(oldCode);
          cleanupMqttRoom(oldCode);
        } else if (mqttRole === 'guest') {
          await sendMqttGuestRequest('LEAVE', { sessionToken: currentSessionToken }, 2000);
          cleanupMqttRoom(null);
        }
        currentRoomCode = null;
        currentPlayerId = null;
        currentSessionToken = null;
        return { ok: true };
      }

      if (mode === 'cloud_api') {
        const tok = currentSessionToken;
        stopCloudPolling();
        currentRoomCode = null;
        currentPlayerId = null;
        currentSessionToken = null;
        if (tok) await cloudPost({ op: 'LEAVE', sessionToken: tok }, 3500);
        return { ok: true };
      }

      if (currentRoomCode && currentPlayerId) {
        const room = loadLocalRoom(currentRoomCode);
        if (room) {
          if (room.status === 'LOBBY') Engine.removePlayerFromLobby(room, currentPlayerId, currentPlayerId);
          else if (room.status === 'PLAYING') Engine.declareBankruptcy(room, currentPlayerId);
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

      if (mode === 'mqtt_cloud') {
        if (mqttRole === 'host' && hostRoom && currentPlayerId) {
          const result = executeEngineAction(hostRoom, currentPlayerId, actionPayload || {});
          if (result && result.ok) {
            broadcastMqttHostState();
          }
          return result;
        }
        if (mqttRole === 'guest') {
          const ack = await sendMqttGuestRequest('ACTION', {
            sessionToken: currentSessionToken,
            payload: actionPayload || {}
          }, 7500);
          if (ack && ack.state) {
            guestLastVersion = ack.v || guestLastVersion;
            notifyState(ack.state);
          }
          return ack || { ok: false, error: 'لم تستجب الغرفة.' };
        }
        return { ok: false, error: 'أنت غير متصل بأي غرفة حالياً.' };
      }

      if (mode === 'cloud_api') {
        let res = await cloudPost({
          op: 'ACTION',
          sessionToken: currentSessionToken,
          action: actionPayload || {}
        }, 8000);
        if (res && (res.code === 'ROOM_NOT_FOUND' || res.code === 'SESSION_LOST') && cloudLatestBackup) {
          await cloudPost({ op: 'HYDRATE', backup: cloudLatestBackup }, 5000);
          res = await cloudPost({
            op: 'ACTION',
            sessionToken: currentSessionToken,
            action: actionPayload || {}
          }, 8000);
        }
        if (res && res.state) {
          cloudVersion = res.v || cloudVersion;
          if (res.backup) cloudLatestBackup = res.backup;
          notifyState(res.state);
        }
        return res || { ok: false, error: 'لم يستجب الخادم السحابي.' };
      }

      const room = loadLocalRoom(currentRoomCode);
      if (!room || !currentPlayerId) return { ok: false, error: 'الغرفة غير متصلة.' };
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

      if (mode === 'mqtt_cloud') {
        return mqttFetchPreview(clean);
      }

      if (mode === 'cloud_api') {
        const res = await cloudGet({ code: clean, preview: 1 }, 3500);
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
