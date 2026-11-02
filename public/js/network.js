(function (root) {
  'use strict';

  const Engine = root.BankElHazEngine;

  function createNetworkClient() {
    let mode = 'connecting'; // 'socket' | 'local'
    let socket = null;
    let stateListeners = [];
    let connListeners = [];
    let currentRoomCode = null;
    let currentPlayerId = null;
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

    // Local Fallback Storage Helpers (when Node/Socket.io server isn't running)
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
      window.addEventListener('storage', function (ev) {
        if (currentRoomCode && ev.key === 'beh_local_room_' + currentRoomCode) {
          const room = loadLocalRoom(currentRoomCode);
          if (room) notifyState(Engine.getPublicState(room));
        }
      });
      notifyConn({ mode: 'local', connected: true });
    }

    function init() {
      if (typeof root.io === 'function' && root.location.protocol !== 'file:') {
        socket = root.io({
          reconnectionAttempts: 5,
          timeout: 5000
        });

        socket.on('connect', function () {
          mode = 'socket';
          notifyConn({ mode: 'socket', connected: true });
        });

        socket.on('disconnect', function () {
          notifyConn({ mode: 'socket', connected: false });
        });

        socket.on('connect_error', function () {
          if (mode === 'connecting') {
            socket.close();
            socket = null;
            activateLocalMode();
          } else {
            notifyConn({ mode: 'socket', connected: false });
          }
        });

        socket.on('room:state', function (state) {
          if (state && state.code) {
            currentRoomCode = state.code;
          }
          notifyState(state);
        });
      } else {
        activateLocalMode();
      }
    }

    function createRoom(payload) {
      return new Promise(function (resolve) {
        if (mode === 'socket' && socket && socket.connected) {
          socket.emit('room:create', payload, function (res) {
            if (res && res.ok) {
              currentRoomCode = res.roomCode;
              currentPlayerId = res.playerId;
              notifyState(res.state);
            }
            resolve(res || { ok: false, error: 'تعذر الاتصال بالخادم.' });
          });
          return;
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
        resolve({
          ok: true,
          roomCode: res.room.code,
          playerId: res.player.id,
          sessionToken: 'local_' + res.player.id,
          state: pub
        });
      });
    }

    function joinRoom(payload) {
      return new Promise(function (resolve) {
        const code = String((payload && payload.roomCode) || '').toUpperCase().trim();
        if (!code) {
          resolve({ ok: false, error: 'يرجى إدخال كود الغرفة.' });
          return;
        }

        if (mode === 'socket' && socket && socket.connected) {
          socket.emit('room:join', payload, function (res) {
            if (res && res.ok) {
              currentRoomCode = res.roomCode;
              currentPlayerId = res.playerId;
              notifyState(res.state);
            }
            resolve(res || { ok: false, error: 'تعذر الانضمام للغرفة.' });
          });
          return;
        }

        activateLocalMode();
        const room = loadLocalRoom(code);
        if (!room) {
          resolve({
            ok: false,
            error: 'الغرفة #' + code + ' غير موجودة محلياً. للعب عبر الإنترنت مع أجهزة أخرى، شغّل خادم Node.js بالأمر npm start.'
          });
          return;
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
        if (!res.ok) {
          resolve(res);
          return;
        }

        saveLocalRoom(room);
        currentRoomCode = room.code;
        currentPlayerId = res.player.id;
        const pub = Engine.getPublicState(room);
        notifyState(pub);
        scheduleLocalBot(room.code);
        resolve({
          ok: true,
          roomCode: room.code,
          playerId: res.player.id,
          sessionToken: 'local_' + res.player.id,
          reconnected: Boolean(res.reconnected),
          state: pub
        });
      });
    }

    function leaveRoom() {
      return new Promise(function (resolve) {
        if (mode === 'socket' && socket && socket.connected) {
          socket.emit('room:leave', {}, function () {
            currentRoomCode = null;
            currentPlayerId = null;
            resolve({ ok: true });
          });
          return;
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
        resolve({ ok: true });
      });
    }

    function sendAction(actionPayload) {
      return new Promise(function (resolve) {
        if (mode === 'socket' && socket && socket.connected) {
          socket.emit('game:action', actionPayload, function (res) {
            resolve(res || { ok: false, error: 'لم يستجب الخادم.' });
          });
          return;
        }

        const room = loadLocalRoom(currentRoomCode);
        if (!room || !currentPlayerId) {
          resolve({ ok: false, error: 'الغرفة غير متصلة.' });
          return;
        }

        const t = actionPayload.type;
        let result = { ok: false, error: 'أمر غير مدعوم.' };
        switch (t) {
          case 'ADD_BOT': result = Engine.addBotPlayer(room, currentPlayerId); break;
          case 'REMOVE_PLAYER': result = Engine.removePlayerFromLobby(room, currentPlayerId, actionPayload.targetId); break;
          case 'UPDATE_SETTINGS': result = Engine.updateLobbySettings(room, currentPlayerId, actionPayload.settings || {}); break;
          case 'UPDATE_APPEARANCE': result = Engine.updatePlayerAppearance(room, currentPlayerId, actionPayload); break;
          case 'START_GAME': result = Engine.startGame(room, currentPlayerId); break;
          case 'ROLL_DICE': result = Engine.rollDice(room, currentPlayerId); break;
          case 'PAY_BAIL': result = Engine.payJailBail(room, currentPlayerId); break;
          case 'USE_JAIL_CARD': result = Engine.useJailCard(room, currentPlayerId); break;
          case 'BUY_PROPERTY': result = Engine.buyProperty(room, currentPlayerId); break;
          case 'SKIP_PURCHASE': result = Engine.skipPurchase(room, currentPlayerId); break;
          case 'BUILD_HOUSE': result = Engine.buildHouse(room, currentPlayerId, Number(actionPayload.tileId)); break;
          case 'SELL_HOUSE': result = Engine.sellHouse(room, currentPlayerId, Number(actionPayload.tileId)); break;
          case 'MORTGAGE': result = Engine.mortgageProperty(room, currentPlayerId, Number(actionPayload.tileId)); break;
          case 'UNMORTGAGE': result = Engine.unmortgageProperty(room, currentPlayerId, Number(actionPayload.tileId)); break;
          case 'SETTLE_DEBT': result = Engine.settleDebt(room, currentPlayerId); break;
          case 'BANKRUPT': result = Engine.declareBankruptcy(room, currentPlayerId, { targetId: actionPayload.targetId }); break;
          case 'END_TURN': result = Engine.endTurn(room, currentPlayerId); break;
          case 'PROPOSE_TRADE': result = Engine.proposeTrade(room, currentPlayerId, actionPayload); break;
          case 'RESPOND_TRADE': result = Engine.respondTrade(room, currentPlayerId, actionPayload); break;
          case 'CANCEL_TRADE': result = Engine.cancelTrade(room, currentPlayerId, actionPayload.tradeId); break;
          case 'CHAT': result = Engine.addChatMessage(room, currentPlayerId, actionPayload.text); break;
        }

        if (result.ok) {
          saveLocalRoom(room);
          notifyState(Engine.getPublicState(room));
          scheduleLocalBot(room.code);
        }
        resolve(result);
      });
    }

    async function fetchRoomPreview(code) {
      const clean = String(code || '').toUpperCase().trim();
      if (!clean) return null;
      if (root.location.protocol !== 'file:') {
        try {
          const res = await fetch('/api/room/' + encodeURIComponent(clean));
          if (res.ok) {
            const data = await res.json();
            if (data && data.ok) return data.room;
          }
        } catch (_e) {}
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

