(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const data = require('./gameData');
    module.exports = factory(data);
  } else {
    root.BankElHazEngine = factory(root.BankElHazData);
  }
})(typeof self !== 'undefined' ? self : this, function (Data) {
  'use strict';

  const {
    GAME_CONFIG,
    PLAYER_PRESETS,
    COLOR_GROUPS,
    BOARD_TILES,
    CHANCE_CARDS,
    COMMUNITY_CARDS,
    isPurchasable,
    getGroupTiles,
    formatMoney
  } = Data;

  let _monoStamp = 0;
  function nextStamp() {
    const now = Date.now();
    _monoStamp = now > _monoStamp ? now : _monoStamp + 1;
    return _monoStamp;
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  function shuffle(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function sanitizeText(str, maxLen) {
    const clean = String(str || '').replace(/[<>]/g, '').trim();
    return clean.slice(0, maxLen || 120);
  }

  function initPropertiesMap() {
    const map = {};
    BOARD_TILES.forEach(function (tile) {
      if (isPurchasable(tile)) {
        map[tile.id] = {
          tileId: tile.id,
          ownerId: null,
          houses: 0, // 0..4 houses, 5 = hotel
          mortgaged: false
        };
      }
    });
    return map;
  }

  function addLog(room, text, type) {
    room.logs.unshift({
      id: uid('log'),
      text: text,
      type: type || 'info',
      timestamp: Date.now()
    });
    if (room.logs.length > 80) {
      room.logs.length = 80;
    }
  }

  function pickAvailablePreset(room, preferredAvatarId) {
    const usedIds = new Set(room.players.map(function (p) { return p.avatarId; }));
    if (preferredAvatarId) {
      const exact = PLAYER_PRESETS.find(function (pr) { return pr.id === preferredAvatarId; });
      if (exact && !usedIds.has(exact.id)) return exact;
    }
    const available = PLAYER_PRESETS.find(function (pr) { return !usedIds.has(pr.id); });
    return available || PLAYER_PRESETS[room.players.length % PLAYER_PRESETS.length];
  }

  function createPlayerObject(room, opts) {
    const preset = pickAvailablePreset(room, opts.avatarId);
    return {
      id: opts.id || uid('p'),
      name: sanitizeText(opts.name, 22) || ('لاعب ' + (room.players.length + 1)),
      avatarId: preset.id,
      icon: preset.icon,
      color: preset.color,
      cash: room.settings.startingCash,
      position: 0,
      inJail: false,
      jailTurns: 0,
      jailFreeCards: 0,
      bankrupt: false,
      connected: opts.isBot ? true : true,
      isBot: Boolean(opts.isBot)
    };
  }

  function createRoom(opts) {
    const options = opts || {};
    const code = (options.roomCode || generateRoomCode()).toUpperCase();
    const room = {
      code: code,
      status: 'LOBBY',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hostId: null,
      settings: {
        startingCash: GAME_CONFIG.STARTING_CASH,
        freeParkingPot: true
      },
      players: [],
      properties: initPropertiesMap(),
      currentTurnIndex: 0,
      turnNumber: 1,
      turnPhase: 'PRE_ROLL',
      doublesCount: 0,
      lastRoll: null,
      lastMove: null,
      lastCard: null,
      pendingPurchaseTileId: null,
      pendingDebt: null,
      trades: [],
      parkingPot: 0,
      winnerId: null,
      logs: [],
      chat: [],
      _chanceDeck: shuffle(CHANCE_CARDS),
      _communityDeck: shuffle(COMMUNITY_CARDS)
    };

    const host = createPlayerObject(room, {
      id: options.hostId,
      name: options.hostName || 'المضيف',
      avatarId: options.avatarId,
      isBot: false
    });
    room.players.push(host);
    room.hostId = host.id;
    addLog(room, 'تم إنشاء الغرفة #' + code + ' بواسطة ' + host.name + ' 🎉', 'info');
    return { ok: true, room: room, player: host };
  }

  function getPlayer(room, playerId) {
    return room.players.find(function (p) { return p.id === playerId; }) || null;
  }

  function getCurrentPlayer(room) {
    return room.players[room.currentTurnIndex] || null;
  }

  function getActivePlayers(room) {
    return room.players.filter(function (p) { return !p.bankrupt; });
  }

  function calculateNetWorth(room, playerId) {
    const player = getPlayer(room, playerId);
    if (!player || player.bankrupt) return 0;
    let total = player.cash;
    Object.keys(room.properties).forEach(function (tileId) {
      const prop = room.properties[tileId];
      if (prop.ownerId === playerId) {
        const tile = BOARD_TILES[Number(tileId)];
        total += prop.mortgaged ? Math.floor(tile.price / 2) : tile.price;
        if (prop.houses > 0 && tile.houseCost) {
          total += prop.houses * Math.floor(tile.houseCost / 2);
        }
      }
    });
    return total;
  }

  function calculateLiquidatableValue(room, playerId) {
    const player = getPlayer(room, playerId);
    if (!player || player.bankrupt) return 0;
    let total = player.cash;
    Object.keys(room.properties).forEach(function (tileId) {
      const prop = room.properties[tileId];
      if (prop.ownerId === playerId) {
        const tile = BOARD_TILES[Number(tileId)];
        if (prop.houses > 0 && tile.houseCost) {
          total += prop.houses * Math.floor(tile.houseCost / 2);
        }
        if (!prop.mortgaged) {
          total += Math.floor(tile.price / 2);
        }
      }
    });
    return total;
  }

  function joinRoom(room, opts) {
    const options = opts || {};
    if (options.existingPlayerId) {
      const existing = getPlayer(room, options.existingPlayerId);
      if (existing) {
        existing.connected = true;
        room.updatedAt = Date.now();
        return { ok: true, player: existing, reconnected: true };
      }
    }

    if (room.status !== 'LOBBY') {
      return { ok: false, error: 'عفواً، بدأت المباراة بالفعل في هذه الغرفة ولا يمكن دخول لاعبين جدد.' };
    }
    if (room.players.length >= GAME_CONFIG.MAX_PLAYERS) {
      return { ok: false, error: 'عفواً، الغرفة مكتملة العدد (الحد الأقصى 6 لاعبين).' };
    }

    const player = createPlayerObject(room, {
      id: options.playerId,
      name: options.playerName,
      avatarId: options.avatarId,
      isBot: false
    });
    room.players.push(player);
    room.updatedAt = Date.now();
    addLog(room, 'انضم ' + player.name + ' (' + player.icon + ') إلى الغرفة!', 'info');
    return { ok: true, player: player, reconnected: false };
  }

  function addBotPlayer(room, actorId) {
    if (room.hostId !== actorId) {
      return { ok: false, error: 'فقط مضيف الغرفة يمكنه إضافة لاعب آلي.' };
    }
    if (room.status !== 'LOBBY') {
      return { ok: false, error: 'لا يمكن إضافة لاعبين بعد بدء المباراة.' };
    }
    if (room.players.length >= GAME_CONFIG.MAX_PLAYERS) {
      return { ok: false, error: 'الغرفة وصلت للحد الأقصى (6 لاعبين).' };
    }
    const botNames = ['المعلم زكي 🤖', 'الباشا منصور 🤖', 'الحاج عبد الغفور 🤖', 'الكابتن ماجد 🤖', 'الأستاذة سلمى 🤖'];
    const usedNames = new Set(room.players.map(function (p) { return p.name; }));
    const botName = botNames.find(function (n) { return !usedNames.has(n); }) || ('بوت ذكي ' + (room.players.length + 1));

    const bot = createPlayerObject(room, {
      name: botName,
      isBot: true
    });
    room.players.push(bot);
    room.updatedAt = Date.now();
    addLog(room, 'تمت إضافة اللاعب الآلي "' + bot.name + '" إلى الغرفة.', 'info');
    return { ok: true, player: bot };
  }

  function removePlayerFromLobby(room, actorId, targetId) {
    if (room.status !== 'LOBBY') {
      return { ok: false, error: 'المباراة قيد التشغيل بالفعل.' };
    }
    if (actorId !== room.hostId && actorId !== targetId) {
      return { ok: false, error: 'غير مسموح بهذا الإجراء.' };
    }
    const idx = room.players.findIndex(function (p) { return p.id === targetId; });
    if (idx === -1) return { ok: false, error: 'اللاعب غير موجود.' };

    const removed = room.players.splice(idx, 1)[0];
    addLog(room, 'غادر ' + removed.name + ' الغرفة.', 'info');

    if (room.players.length > 0 && room.hostId === targetId) {
      const nextHuman = room.players.find(function (p) { return !p.isBot; }) || room.players[0];
      room.hostId = nextHuman.id;
      addLog(room, 'أصبح ' + nextHuman.name + ' مضيف الغرفة الجديد.', 'info');
    }
    room.updatedAt = Date.now();
    return { ok: true };
  }

  function updateLobbySettings(room, actorId, settings) {
    if (room.status !== 'LOBBY') return { ok: false, error: 'لا يمكن تعديل الإعدادات أثناء اللعب.' };
    if (room.hostId !== actorId) return { ok: false, error: 'فقط مضيف الغرفة يمكنه تعديل الإعدادات.' };

    if (settings.startingCash) {
      const allowed = [10000, 15000, 20000, 25000];
      const val = Number(settings.startingCash);
      if (allowed.indexOf(val) !== -1) {
        room.settings.startingCash = val;
        room.players.forEach(function (p) { p.cash = val; });
      }
    }
    if (typeof settings.freeParkingPot === 'boolean') {
      room.settings.freeParkingPot = settings.freeParkingPot;
    }
    room.updatedAt = Date.now();
    return { ok: true };
  }

  function updatePlayerAppearance(room, actorId, payload) {
    if (room.status !== 'LOBBY') return { ok: false, error: 'لا يمكن التعديل بعد بدء اللعبة.' };
    const player = getPlayer(room, actorId);
    if (!player) return { ok: false, error: 'اللاعب غير موجود.' };

    if (payload.name) {
      const clean = sanitizeText(payload.name, 22);
      if (clean.length >= 2) player.name = clean;
    }
    if (payload.avatarId) {
      const conflict = room.players.find(function (p) {
        return p.id !== actorId && p.avatarId === payload.avatarId;
      });
      if (conflict) {
        return { ok: false, error: 'هذا الرمز مختار بالفعل من قبل لاعب آخر.' };
      }
      const preset = PLAYER_PRESETS.find(function (pr) { return pr.id === payload.avatarId; });
      if (preset) {
        player.avatarId = preset.id;
        player.icon = preset.icon;
        player.color = preset.color;
      }
    }
    room.updatedAt = Date.now();
    return { ok: true };
  }

  function startGame(room, actorId) {
    if (room.hostId !== actorId) {
      return { ok: false, error: 'فقط مضيف الغرفة يمكنه بدء المباراة.' };
    }
    if (room.status !== 'LOBBY') {
      return { ok: false, error: 'المباراة بدأت بالفعل.' };
    }
    if (room.players.length < GAME_CONFIG.MIN_PLAYERS) {
      return { ok: false, error: 'يجب وجود لاعبين اثنين (2) على الأقل لبدء المباراة.' };
    }
    if (room.players.length > GAME_CONFIG.MAX_PLAYERS) {
      return { ok: false, error: 'الحد الأقصى للغرفة هو 6 لاعبين.' };
    }

    room.status = 'PLAYING';
    room.properties = initPropertiesMap();
    room._chanceDeck = shuffle(CHANCE_CARDS);
    room._communityDeck = shuffle(COMMUNITY_CARDS);
    room.currentTurnIndex = 0;
    room.turnNumber = 1;
    room.turnPhase = 'PRE_ROLL';
    room.doublesCount = 0;
    room.lastRoll = null;
    room.lastMove = null;
    room.lastCard = null;
    room.pendingPurchaseTileId = null;
    room.pendingDebt = null;
    room.trades = [];
    room.parkingPot = room.settings.freeParkingPot ? 500 : 0;
    room.winnerId = null;

    room.players.forEach(function (p) {
      p.cash = room.settings.startingCash;
      p.position = 0;
      p.inJail = false;
      p.jailTurns = 0;
      p.jailFreeCards = 0;
      p.bankrupt = false;
    });

    const first = room.players[0];
    addLog(room, 'بدأت مباراة بنك الحظ المصري! الدور الأول عند ' + first.name + ' 🎲', 'info');
    room.updatedAt = Date.now();
    return { ok: true };
  }

  // Ownership & Rent Helpers
  function ownsFullGroup(room, ownerId, groupId) {
    if (!ownerId || !groupId) return false;
    const groupTiles = getGroupTiles(groupId);
    return groupTiles.every(function (t) {
      const prop = room.properties[t.id];
      return prop && prop.ownerId === ownerId;
    });
  }

  function groupHasMortgaged(room, groupId) {
    return getGroupTiles(groupId).some(function (t) {
      return room.properties[t.id] && room.properties[t.id].mortgaged;
    });
  }

  function groupHasBuildings(room, groupId) {
    return getGroupTiles(groupId).some(function (t) {
      return room.properties[t.id] && room.properties[t.id].houses > 0;
    });
  }

  function calculateRent(room, tileId, diceTotal, options) {
    const opts = options || {};
    const tile = BOARD_TILES[tileId];
    const prop = room.properties[tileId];
    if (!tile || !prop || !prop.ownerId || prop.mortgaged) return 0;

    const owner = getPlayer(room, prop.ownerId);
    if (!owner || owner.bankrupt) return 0;

    if (tile.type === 'property') {
      if (prop.houses > 0) {
        return tile.rent[prop.houses];
      }
      if (ownsFullGroup(room, prop.ownerId, tile.group) && !groupHasMortgaged(room, tile.group)) {
        return tile.rent[0] * 2;
      }
      return tile.rent[0];
    }

    if (tile.type === 'station') {
      const stations = [5, 15, 25, 35];
      const ownedCount = stations.filter(function (id) {
        return room.properties[id] && room.properties[id].ownerId === prop.ownerId && !room.properties[id].mortgaged;
      }).length;
      if (ownedCount <= 0) return 0;
      const base = GAME_CONFIG.STATION_RENTS[Math.min(ownedCount, 4) - 1];
      return opts.doubleStationRent ? base * 2 : base;
    }

    if (tile.type === 'utility') {
      const utilities = [12, 28];
      const ownedCount = utilities.filter(function (id) {
        return room.properties[id] && room.properties[id].ownerId === prop.ownerId && !room.properties[id].mortgaged;
      }).length;
      if (ownedCount <= 0) return 0;
      const mult = (opts.forceBothUtility || ownedCount >= 2)
        ? GAME_CONFIG.UTILITY_MULTIPLIERS.BOTH
        : GAME_CONFIG.UTILITY_MULTIPLIERS.SINGLE;
      return mult * (diceTotal || 7);
    }

    return 0;
  }

  function finishTurnActionPhase(room, allowExtraRoll) {
    const player = getCurrentPlayer(room);
    if (allowExtraRoll && player && !player.inJail && !player.bankrupt && room.lastRoll && room.lastRoll.isDoubles) {
      room.turnPhase = 'PRE_ROLL';
      addLog(room, 'حصل ' + player.name + ' على دبل (' + room.lastRoll.d1 + '+' + room.lastRoll.d2 + ') وله رمية إضافية! 🎯', 'info');
    } else {
      room.turnPhase = 'END_TURN';
    }
  }

  function chargePlayer(room, debtorId, creditorId, amount, reason, resumePhase, extra) {
    const debtor = getPlayer(room, debtorId);
    if (!debtor || amount <= 0) {
      finishTurnActionPhase(room, resumePhase === 'EXTRA_CHECK');
      return;
    }

    if (debtor.cash >= amount) {
      debtor.cash -= amount;
      if (creditorId === 'ALL_PLAYERS') {
        const perPlayer = (extra && extra.perPlayerAmount) || 0;
        getActivePlayers(room).forEach(function (other) {
          if (other.id !== debtorId) {
            other.cash += perPlayer;
          }
        });
      } else if (creditorId) {
        const creditor = getPlayer(room, creditorId);
        if (creditor && !creditor.bankrupt) {
          creditor.cash += amount;
        }
      } else if (room.settings.freeParkingPot) {
        room.parkingPot += amount;
      }
      finishTurnActionPhase(room, resumePhase === 'EXTRA_CHECK');
    } else {
      room.pendingDebt = {
        debtorId: debtorId,
        creditorId: creditorId || null,
        amount: amount,
        perPlayerAmount: (extra && extra.perPlayerAmount) || 0,
        reason: reason || 'مستحقات مالية',
        resumeExtraRoll: resumePhase === 'EXTRA_CHECK'
      };
      room.turnPhase = 'DEBT_RESOLUTION';
      addLog(
        room,
        '⚠️ أزمة سيولة! على ' + debtor.name + ' سداد ' + formatMoney(amount) + ' (' + reason + ') — يمكنه بيع منازل أو رهن عقارات أو المقايضة أو إعلان الإفلاس.',
        'bankrupt'
      );
    }
  }

  function buildStepPath(fromPos, toPos, clockwise) {
    const path = [fromPos];
    if (fromPos === toPos) return path;
    let cur = fromPos;
    let safety = 0;
    while (cur !== toPos && safety < 42) {
      cur = clockwise ? (cur + 1) % 40 : (cur - 1 + 40) % 40;
      path.push(cur);
      safety++;
    }
    return path;
  }

  function recordMove(room, playerId, segmentPath, opts) {
    const options = opts || {};
    if (
      options.chain &&
      room.lastMove &&
      room.lastMove.playerId === playerId &&
      Array.isArray(room.lastMove.path) &&
      room.lastMove.path.length > 0
    ) {
      room.lastMove = {
        playerId: playerId,
        path: room.lastMove.path.concat(segmentPath.slice(1)),
        directJump: Boolean(options.directJump),
        passedGo: Boolean(room.lastMove.passedGo || options.passedGo),
        timestamp: nextStamp()
      };
      return;
    }
    room.lastMove = {
      playerId: playerId,
      path: segmentPath,
      directJump: Boolean(options.directJump),
      passedGo: Boolean(options.passedGo),
      timestamp: nextStamp()
    };
  }

  function sendToJail(room, player, reasonText, chainMove) {
    const oldPos = player.position;
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    room.doublesCount = 0;
    room.pendingPurchaseTileId = null;
    recordMove(room, player.id, [oldPos, 10], { directJump: true, passedGo: false, chain: Boolean(chainMove) });
    addLog(room, reasonText || ('تم إرسال ' + player.name + ' إلى السجن! 🚓'), 'jail');
    room.turnPhase = 'END_TURN';
  }

  function drawCard(room, deckType) {
    const key = deckType === 'chance' ? '_chanceDeck' : '_communityDeck';
    const source = deckType === 'chance' ? CHANCE_CARDS : COMMUNITY_CARDS;
    if (!room[key] || room[key].length === 0) {
      room[key] = shuffle(source);
    }
    return room[key].shift();
  }

  function resolveLanding(room, player, options) {
    const opts = options || {};
    const tile = BOARD_TILES[player.position];
    const allowExtra = Boolean(opts.allowExtraRoll);

    if (!tile) {
      finishTurnActionPhase(room, allowExtra);
      return;
    }

    if (tile.type === 'go') {
      finishTurnActionPhase(room, allowExtra);
      return;
    }

    if (tile.type === 'jail') {
      addLog(room, player.name + ' يمر بالسجن في زيارة ودّية فقط.', 'info');
      finishTurnActionPhase(room, allowExtra);
      return;
    }

    if (tile.type === 'parking') {
      if (room.settings.freeParkingPot && room.parkingPot > 0) {
        const reward = room.parkingPot;
        player.cash += reward;
        room.parkingPot = 0;
        addLog(room, '🎉 حظ سعيد! وقف ' + player.name + ' في استراحة النيل وحصل على خزينة الاستراحة بقيمة ' + formatMoney(reward) + '!', 'card');
      } else {
        addLog(room, 'يأخذ ' + player.name + ' قسطاً من الراحة على كورنيش النيل ☕', 'info');
      }
      finishTurnActionPhase(room, allowExtra);
      return;
    }

    if (tile.type === 'go_to_jail') {
      sendToJail(room, player, '🚓 وقف ' + player.name + ' على خانة "اذهب إلى السجن" وتم احتجازه فوراً!', true);
      return;
    }

    if (tile.type === 'tax') {
      addLog(room, '🧾 وقف ' + player.name + ' على "' + tile.name + '" وعليه دفع ' + formatMoney(tile.taxAmount) + '.', 'rent');
      chargePlayer(room, player.id, null, tile.taxAmount, tile.name, allowExtra ? 'EXTRA_CHECK' : 'END');
      return;
    }

    if (isPurchasable(tile)) {
      const prop = room.properties[tile.id];
      if (!prop.ownerId) {
        room.pendingPurchaseTileId = tile.id;
        room.turnPhase = 'BUY_DECISION';
        addLog(room, 'وصل ' + player.name + ' إلى "' + tile.name + '" وهي متاحة للشراء مقابل ' + formatMoney(tile.price) + '.', 'info');
        return;
      }

      if (prop.ownerId === player.id) {
        addLog(room, 'وصل ' + player.name + ' إلى أملاكه في "' + tile.name + '".', 'info');
        finishTurnActionPhase(room, allowExtra);
        return;
      }

      if (prop.mortgaged) {
        const owner = getPlayer(room, prop.ownerId);
        addLog(room, 'وصل ' + player.name + ' إلى "' + tile.name + '" (ملك ' + (owner ? owner.name : '') + ') لكنها مرهونة — لا يوجد إيجار!', 'info');
        finishTurnActionPhase(room, allowExtra);
        return;
      }

      const owner = getPlayer(room, prop.ownerId);
      const diceSum = room.lastRoll ? room.lastRoll.total : 7;
      const rent = calculateRent(room, tile.id, diceSum, {
        doubleStationRent: opts.doubleStationRent,
        forceBothUtility: opts.forceBothUtility
      });

      if (rent > 0 && owner && !owner.bankrupt) {
        addLog(room, '💸 إيجار مستحق! يدفع ' + player.name + ' مبلغ ' + formatMoney(rent) + ' إلى ' + owner.name + ' مقابل المرور في "' + tile.name + '".', 'rent');
        chargePlayer(room, player.id, owner.id, rent, 'إيجار ' + tile.name, allowExtra ? 'EXTRA_CHECK' : 'END');
      } else {
        finishTurnActionPhase(room, allowExtra);
      }
      return;
    }

    if (tile.type === 'chance' || tile.type === 'community') {
      const deckType = tile.type === 'chance' ? 'chance' : 'community';
      const card = drawCard(room, deckType);
      room.lastCard = {
        deck: deckType,
        card: card,
        playerId: player.id,
        timestamp: nextStamp()
      };
      const deckLabel = deckType === 'chance' ? 'بطاقة مفاجأة 🎁' : 'حكم المحكمة ⚖️';
      addLog(room, deckLabel + ' (' + player.name + '): ' + card.text, 'card');

      executeCardEffect(room, player, card, allowExtra);
      return;
    }

    finishTurnActionPhase(room, allowExtra);
  }

  function executeCardEffect(room, player, card, allowExtra) {
    if (card.action === 'money') {
      if (card.amount >= 0) {
        player.cash += card.amount;
        finishTurnActionPhase(room, allowExtra);
      } else {
        chargePlayer(room, player.id, null, Math.abs(card.amount), card.title, allowExtra ? 'EXTRA_CHECK' : 'END');
      }
      return;
    }

    if (card.action === 'jail_free') {
      player.jailFreeCards += 1;
      finishTurnActionPhase(room, allowExtra);
      return;
    }

    if (card.action === 'go_to_jail') {
      sendToJail(room, player, '🚓 ' + card.title + ' — تم إرسال ' + player.name + ' إلى السجن!', true);
      return;
    }

    if (card.action === 'move_to') {
      const oldPos = player.position;
      const target = card.target;
      const passedGo = Boolean(card.collectGo && (target < oldPos || target === 0));
      const path = buildStepPath(oldPos, target, true);
      player.position = target;
      if (passedGo) {
        player.cash += GAME_CONFIG.GO_SALARY;
        addLog(room, 'تقاضى ' + player.name + ' مكافأة البداية ' + formatMoney(GAME_CONFIG.GO_SALARY) + '!', 'buy');
      }
      recordMove(room, player.id, path, { passedGo: passedGo, chain: true });
      resolveLanding(room, player, { allowExtraRoll: allowExtra });
      return;
    }

    if (card.action === 'move_steps') {
      const oldPos = player.position;
      const steps = card.steps || -3;
      const target = (oldPos + steps + 40) % 40;
      const path = buildStepPath(oldPos, target, steps >= 0);
      player.position = target;
      recordMove(room, player.id, path, { passedGo: false, chain: true });
      resolveLanding(room, player, { allowExtraRoll: allowExtra });
      return;
    }

    if (card.action === 'nearest_station') {
      const stations = [5, 15, 25, 35];
      const oldPos = player.position;
      let target = stations.find(function (s) { return s > oldPos; });
      if (target === undefined) target = stations[0];
      const passedGo = target < oldPos;
      const path = buildStepPath(oldPos, target, true);
      player.position = target;
      if (passedGo) {
        player.cash += GAME_CONFIG.GO_SALARY;
        addLog(room, 'مرّ ' + player.name + ' بخانة البداية وتقاضى ' + formatMoney(GAME_CONFIG.GO_SALARY) + '!', 'buy');
      }
      recordMove(room, player.id, path, { passedGo: passedGo, chain: true });
      resolveLanding(room, player, { allowExtraRoll: allowExtra, doubleStationRent: Boolean(card.doubleRent) });
      return;
    }

    if (card.action === 'nearest_utility') {
      const utilities = [12, 28];
      const oldPos = player.position;
      let target = utilities.find(function (u) { return u > oldPos; });
      if (target === undefined) target = utilities[0];
      const passedGo = target < oldPos;
      const path = buildStepPath(oldPos, target, true);
      player.position = target;
      if (passedGo) {
        player.cash += GAME_CONFIG.GO_SALARY;
        addLog(room, 'مرّ ' + player.name + ' بخانة البداية وتقاضى ' + formatMoney(GAME_CONFIG.GO_SALARY) + '!', 'buy');
      }
      recordMove(room, player.id, path, { passedGo: passedGo, chain: true });
      resolveLanding(room, player, { allowExtraRoll: allowExtra, forceBothUtility: true });
      return;
    }

    if (card.action === 'repairs') {
      let housesCount = 0;
      let hotelsCount = 0;
      Object.keys(room.properties).forEach(function (tileId) {
        const prop = room.properties[tileId];
        if (prop.ownerId === player.id) {
          if (prop.houses === 5) hotelsCount += 1;
          else if (prop.houses > 0) housesCount += prop.houses;
        }
      });
      const totalRepair = (housesCount * card.houseCost) + (hotelsCount * card.hotelCost);
      if (totalRepair > 0) {
        addLog(room, 'تكلفة ترميم عقارات ' + player.name + ' بلغت ' + formatMoney(totalRepair) + ' (' + housesCount + ' منزل، ' + hotelsCount + ' فندق).', 'rent');
        chargePlayer(room, player.id, null, totalRepair, card.title, allowExtra ? 'EXTRA_CHECK' : 'END');
      } else {
        addLog(room, 'لا يملك ' + player.name + ' أي مبانٍ حالياً — أُعفي من رسوم الصيانة!', 'info');
        finishTurnActionPhase(room, allowExtra);
      }
      return;
    }

    if (card.action === 'pay_each_player') {
      const others = getActivePlayers(room).filter(function (p) { return p.id !== player.id; });
      const total = others.length * card.amount;
      if (total > 0) {
        chargePlayer(
          room,
          player.id,
          'ALL_PLAYERS',
          total,
          card.title,
          allowExtra ? 'EXTRA_CHECK' : 'END',
          { perPlayerAmount: card.amount }
        );
      } else {
        finishTurnActionPhase(room, allowExtra);
      }
      return;
    }

    if (card.action === 'collect_each_player') {
      let collected = 0;
      getActivePlayers(room).forEach(function (other) {
        if (other.id !== player.id) {
          const paid = Math.min(other.cash, card.amount);
          other.cash -= paid;
          collected += paid;
        }
      });
      player.cash += collected;
      addLog(room, 'جمع ' + player.name + ' مبلغ ' + formatMoney(collected) + ' من باقي اللاعبين! 🎉', 'buy');
      finishTurnActionPhase(room, allowExtra);
      return;
    }

    finishTurnActionPhase(room, allowExtra);
  }

  // Turn Actions
  function payJailBail(room, actorId) {
    if (room.status !== 'PLAYING') return { ok: false, error: 'المباراة ليست نشطة.' };
    const player = getCurrentPlayer(room);
    if (!player || player.id !== actorId) return { ok: false, error: 'ليس دورك الآن.' };
    if (room.turnPhase !== 'PRE_ROLL') return { ok: false, error: 'لا يمكنك دفع الكفالة في هذه المرحلة.' };
    if (!player.inJail) return { ok: false, error: 'أنت لست محتجزاً في السجن.' };
    if (player.cash < GAME_CONFIG.JAIL_BAIL) {
      return { ok: false, error: 'رصيدك لا يكفي لدفع الكفالة (' + formatMoney(GAME_CONFIG.JAIL_BAIL) + ').' };
    }

    player.cash -= GAME_CONFIG.JAIL_BAIL;
    if (room.settings.freeParkingPot) {
      room.parkingPot += GAME_CONFIG.JAIL_BAIL;
    }
    player.inJail = false;
    player.jailTurns = 0;
    addLog(room, 'دفع ' + player.name + ' كفالة السجن (' + formatMoney(GAME_CONFIG.JAIL_BAIL) + ') وأصبح حراً! يمكنك الآن رمي النرد.', 'jail');
    room.updatedAt = Date.now();
    return { ok: true };
  }

  function useJailCard(room, actorId) {
    if (room.status !== 'PLAYING') return { ok: false, error: 'المباراة ليست نشطة.' };
    const player = getCurrentPlayer(room);
    if (!player || player.id !== actorId) return { ok: false, error: 'ليس دورك الآن.' };
    if (room.turnPhase !== 'PRE_ROLL') return { ok: false, error: 'لا يمكنك استخدام البطاقة الآن.' };
    if (!player.inJail) return { ok: false, error: 'أنت لست في السجن.' };
    if (player.jailFreeCards <= 0) return { ok: false, error: 'لا تملك بطاقة خروج من السجن.' };

    player.jailFreeCards -= 1;
    player.inJail = false;
    player.jailTurns = 0;
    addLog(room, 'استخدم ' + player.name + ' بطاقة الخروج من السجن مجاناً وأصبح حراً! 🕊️', 'jail');
    room.updatedAt = Date.now();
    return { ok: true };
  }

  function rollDice(room, actorId, forcedDice) {
    if (room.status !== 'PLAYING') return { ok: false, error: 'المباراة ليست نشطة.' };
    const player = getCurrentPlayer(room);
    if (!player || player.id !== actorId) return { ok: false, error: 'ليس دورك الآن.' };
    if (room.turnPhase !== 'PRE_ROLL') return { ok: false, error: 'لا يمكنك رمي النرد الآن.' };

    const d1 = forcedDice ? forcedDice[0] : (Math.floor(Math.random() * 6) + 1);
    const d2 = forcedDice ? forcedDice[1] : (Math.floor(Math.random() * 6) + 1);
    const total = d1 + d2;
    const isDoubles = d1 === d2;

    room.lastRoll = {
      d1: d1,
      d2: d2,
      total: total,
      isDoubles: isDoubles,
      rollerId: player.id,
      timestamp: nextStamp()
    };
    room.lastCard = null;

    // Handling Jail Roll
    if (player.inJail) {
      if (isDoubles) {
        player.inJail = false;
        player.jailTurns = 0;
        room.doublesCount = 0;
        const oldPos = player.position;
        const newPos = (oldPos + total) % 40;
        player.position = newPos;
        recordMove(room, player.id, buildStepPath(oldPos, newPos, true), { passedGo: false, chain: false });
        addLog(room, '🎲 رمى ' + player.name + ' دبل (' + d1 + ' و ' + d2 + ') وخرج من السجن متقدماً ' + total + ' خطوات!', 'jail');
        resolveLanding(room, player, { allowExtraRoll: false });
        room.updatedAt = Date.now();
        return { ok: true };
      }

      player.jailTurns += 1;
      if (player.jailTurns >= GAME_CONFIG.MAX_JAIL_TURNS) {
        player.inJail = false;
        player.jailTurns = 0;
        const oldPos = player.position;
        const newPos = (oldPos + total) % 40;
        player.position = newPos;
        recordMove(room, player.id, buildStepPath(oldPos, newPos, true), { passedGo: false, chain: false });
        addLog(room, 'انتهت مدة حجز ' + player.name + ' (3 أدوار) — يجب سداد الكفالة ' + formatMoney(GAME_CONFIG.JAIL_BAIL) + ' والتحرك ' + total + ' خطوات.', 'jail');
        if (player.cash >= GAME_CONFIG.JAIL_BAIL) {
          player.cash -= GAME_CONFIG.JAIL_BAIL;
          if (room.settings.freeParkingPot) room.parkingPot += GAME_CONFIG.JAIL_BAIL;
          resolveLanding(room, player, { allowExtraRoll: false });
        } else {
          chargePlayer(room, player.id, null, GAME_CONFIG.JAIL_BAIL, 'كفالة السجن الإلزامية', 'END');
        }
        room.updatedAt = Date.now();
        return { ok: true };
      }

      addLog(room, 'رمى ' + player.name + ' (' + d1 + ' + ' + d2 + ') ولم يحصل على دبل — يبقى في السجن (' + player.jailTurns + '/3).', 'jail');
      room.turnPhase = 'END_TURN';
      room.updatedAt = Date.now();
      return { ok: true };
    }

    // Normal Roll
    if (isDoubles) {
      room.doublesCount += 1;
      if (room.doublesCount >= 3) {
        sendToJail(room, player, '🚓 رمى ' + player.name + ' الدبل 3 مرات متتالية (سرعة جنونية!) وتم إرساله إلى السجن!', false);
        room.updatedAt = Date.now();
        return { ok: true };
      }
    } else {
      room.doublesCount = 0;
    }

    const oldPos = player.position;
    const newPos = (oldPos + total) % 40;
    const passedGo = (oldPos + total) >= 40;
    const path = buildStepPath(oldPos, newPos, true);
    player.position = newPos;

    recordMove(room, player.id, path, { passedGo: passedGo, chain: false });

    const destTile = BOARD_TILES[newPos];
    addLog(room, '🎲 رمى ' + player.name + ' (' + d1 + ' + ' + d2 + ' = ' + total + ') وتقدم إلى "' + destTile.name + '".', 'info');

    if (passedGo) {
      player.cash += GAME_CONFIG.GO_SALARY;
      addLog(room, '💰 مرّ ' + player.name + ' بخانة البداية وتقاضى ' + formatMoney(GAME_CONFIG.GO_SALARY) + '!', 'buy');
    }

    resolveLanding(room, player, { allowExtraRoll: isDoubles });
    room.updatedAt = Date.now();
    return { ok: true };
  }

  function buyProperty(room, actorId) {
    if (room.status !== 'PLAYING') return { ok: false, error: 'المباراة ليست نشطة.' };
    const player = getCurrentPlayer(room);
    if (!player || player.id !== actorId) return { ok: false, error: 'ليس دورك الآن.' };
    if (room.turnPhase !== 'BUY_DECISION' || room.pendingPurchaseTileId === null) {
      return { ok: false, error: 'لا يوجد عقار متاح للشراء حالياً.' };
    }

    const tile = BOARD_TILES[room.pendingPurchaseTileId];
    const prop = room.properties[tile.id];
    if (!tile || !prop || prop.ownerId) {
      return { ok: false, error: 'هذا العقار مملوك بالفعل.' };
    }
    if (player.cash < tile.price) {
      return { ok: false, error: 'رصيدك لا يكفي لشراء "' + tile.name + '" (' + formatMoney(tile.price) + '). يمكنك رهن عقار أو بيع منزل أولاً.' };
    }

    player.cash -= tile.price;
    prop.ownerId = player.id;
    prop.houses = 0;
    prop.mortgaged = false;
    room.pendingPurchaseTileId = null;

    const fullSet = tile.group && ownsFullGroup(room, player.id, tile.group);
    addLog(
      room,
      '🏛️ اشترى ' + player.name + ' "' + tile.name + '" مقابل ' + formatMoney(tile.price) + (fullSet ? ' وأكمل المجموعة اللونية بالكامل! 🔥' : '!'),
      'buy'
    );

    const allowExtra = Boolean(room.lastRoll && room.lastRoll.isDoubles && !player.inJail);
    finishTurnActionPhase(room, allowExtra);
    room.updatedAt = Date.now();
    return { ok: true };
  }

  function skipPurchase(room, actorId) {
    if (room.status !== 'PLAYING') return { ok: false, error: 'المباراة ليست نشطة.' };
    const player = getCurrentPlayer(room);
    if (!player || player.id !== actorId) return { ok: false, error: 'ليس دورك الآن.' };
    if (room.turnPhase !== 'BUY_DECISION') return { ok: false, error: 'لا يوجد قرار شراء معلق.' };

    const tile = BOARD_TILES[room.pendingPurchaseTileId];
    room.pendingPurchaseTileId = null;
    if (tile) {
      addLog(room, 'تخطى ' + player.name + ' شراء "' + tile.name + '".', 'info');
    }

    const allowExtra = Boolean(room.lastRoll && room.lastRoll.isDoubles && !player.inJail);
    finishTurnActionPhase(room, allowExtra);
    room.updatedAt = Date.now();
    return { ok: true };
  }

  // Property Building & Mortgaging
  function canBuildHouseCheck(room, playerId, tileId) {
    const tile = BOARD_TILES[tileId];
    const prop = room.properties[tileId];
    const player = getPlayer(room, playerId);
    if (!tile || tile.type !== 'property' || !prop || !player) {
      return { ok: false, error: 'لا يمكن البناء على هذه الخانة.' };
    }
    if (prop.ownerId !== playerId) {
      return { ok: false, error: 'أنت لا تملك هذه المحافظة.' };
    }
    if (!ownsFullGroup(room, playerId, tile.group)) {
      return { ok: false, error: 'يجب امتلاك جميع محافظات مجموعة "' + COLOR_GROUPS[tile.group].name + '" أولاً للبناء.' };
    }
    if (groupHasMortgaged(room, tile.group)) {
      return { ok: false, error: 'يجب فك الرهن عن جميع محافظات المجموعة أولاً قبل البناء.' };
    }
    if (prop.houses >= 5) {
      return { ok: false, error: 'وصلت هذه المحافظة للحد الأقصى (فندق سياحي فخم 🏨).' };
    }
    const groupTiles = getGroupTiles(tile.group);
    const minHouses = Math.min.apply(null, groupTiles.map(function (t) { return room.properties[t.id].houses; }));
    if (prop.houses > minHouses) {
      return { ok: false, error: 'قاعدة البناء المتساوي: يجب البناء في باقي محافظات المجموعة بالتساوي أولاً.' };
    }
    if (player.cash < tile.houseCost) {
      return { ok: false, error: 'رصيدك لا يكفي لتكلفة البناء (' + formatMoney(tile.houseCost) + ').' };
    }
    return { ok: true };
  }

  function buildHouse(room, actorId, tileId) {
    if (room.status !== 'PLAYING') return { ok: false, error: 'المباراة ليست نشطة.' };
    const current = getCurrentPlayer(room);
    if (!current || current.id !== actorId) {
      return { ok: false, error: 'يمكنك البناء فقط أثناء دورك.' };
    }
    const check = canBuildHouseCheck(room, actorId, tileId);
    if (!check.ok) return check;

    const tile = BOARD_TILES[tileId];
    const prop = room.properties[tileId];
    current.cash -= tile.houseCost;
    prop.houses += 1;

    if (prop.houses === 5) {
      addLog(room, '🏨 شيّد ' + current.name + ' فندقاً فاخراً في "' + tile.name + '" مقابل ' + formatMoney(tile.houseCost) + '!', 'buy');
    } else {
      addLog(room, '🏠 بنى ' + current.name + ' منزلاً (' + prop.houses + '/4) في "' + tile.name + '" مقابل ' + formatMoney(tile.houseCost) + '.', 'buy');
    }
    room.updatedAt = Date.now();
    return { ok: true };
  }

  function canSellHouseCheck(room, playerId, tileId) {
    const tile = BOARD_TILES[tileId];
    const prop = room.properties[tileId];
    if (!tile || tile.type !== 'property' || !prop || prop.ownerId !== playerId) {
      return { ok: false, error: 'أنت لا تملك هذه المحافظة.' };
    }
    if (prop.houses <= 0) {
      return { ok: false, error: 'لا توجد مبانٍ لبيعها في هذه المحافظة.' };
    }
    const groupTiles = getGroupTiles(tile.group);
    const maxHouses = Math.max.apply(null, groupTiles.map(function (t) { return room.properties[t.id].houses; }));
    if (prop.houses < maxHouses) {
      return { ok: false, error: 'يجب بيع المباني بالتساوي من المحافظة الأكثر بناءً في المجموعة أولاً.' };
    }
    return { ok: true };
  }

  function sellHouse(room, actorId, tileId) {
    if (room.status !== 'PLAYING') return { ok: false, error: 'المباراة ليست نشطة.' };
    const player = getPlayer(room, actorId);
    if (!player || player.bankrupt) return { ok: false, error: 'اللاعب غير متاح.' };

    const check = canSellHouseCheck(room, actorId, tileId);
    if (!check.ok) return check;

    const tile = BOARD_TILES[tileId];
    const prop = room.properties[tileId];
    const refund = Math.floor(tile.houseCost / 2);
    const wasHotel = prop.houses === 5;
    prop.houses -= 1;
    player.cash += refund;

    addLog(
      room,
      'باع ' + player.name + (wasHotel ? ' الفندق في "' : ' منزلاً في "') + tile.name + '" واسترد ' + formatMoney(refund) + '.',
      'info'
    );
    room.updatedAt = Date.now();
    return { ok: true };
  }

  function mortgageProperty(room, actorId, tileId) {
    if (room.status !== 'PLAYING') return { ok: false, error: 'المباراة ليست نشطة.' };
    const player = getPlayer(room, actorId);
    const tile = BOARD_TILES[tileId];
    const prop = room.properties[tileId];
    if (!player || player.bankrupt || !tile || !prop || prop.ownerId !== actorId) {
      return { ok: false, error: 'لا تملك هذا العقار.' };
    }
    if (prop.mortgaged) {
      return { ok: false, error: 'هذا العقار مرهون بالفعل.' };
    }
    if (tile.group && groupHasBuildings(room, tile.group)) {
      return { ok: false, error: 'يجب بيع جميع المنازل والفنادق في هذه المجموعة اللونية قبل الرهن.' };
    }

    const mortgageVal = Math.floor(tile.price / 2);
    prop.mortgaged = true;
    player.cash += mortgageVal;
    addLog(room, 'رهن ' + player.name + ' "' + tile.name + '" للبنك وحصل على سيولة ' + formatMoney(mortgageVal) + '.', 'info');
    room.updatedAt = Date.now();
    return { ok: true };
  }

  function unmortgageProperty(room, actorId, tileId) {
    if (room.status !== 'PLAYING') return { ok: false, error: 'المباراة ليست نشطة.' };
    const player = getPlayer(room, actorId);
    const tile = BOARD_TILES[tileId];
    const prop = room.properties[tileId];
    if (!player || player.bankrupt || !tile || !prop || prop.ownerId !== actorId) {
      return { ok: false, error: 'لا تملك هذا العقار.' };
    }
    if (!prop.mortgaged) {
      return { ok: false, error: 'هذا العقار غير مرهون.' };
    }

    const cost = Math.ceil((tile.price / 2) * 1.1);
    if (player.cash < cost) {
      return { ok: false, error: 'رصيدك لا يكفي لفك الرهن (' + formatMoney(cost) + ' شاملة 10% رسوم بنكية).' };
    }

    player.cash -= cost;
    prop.mortgaged = false;
    addLog(room, 'فكّ ' + player.name + ' رهن "' + tile.name + '" مقابل ' + formatMoney(cost) + '!', 'buy');
    room.updatedAt = Date.now();
    return { ok: true };
  }

  // Debt & Bankruptcy
  function settleDebt(room, actorId) {
    if (room.status !== 'PLAYING' || room.turnPhase !== 'DEBT_RESOLUTION' || !room.pendingDebt) {
      return { ok: false, error: 'لا توجد مديونية معلقة حالياً.' };
    }
    const debt = room.pendingDebt;
    if (debt.debtorId !== actorId) {
      return { ok: false, error: 'هذه المديونية ليست عليك.' };
    }
    const debtor = getPlayer(room, actorId);
    if (!debtor || debtor.cash < debt.amount) {
      return { ok: false, error: 'رصيدك الحالي (' + formatMoney(debtor ? debtor.cash : 0) + ') لا يزال أقل من قيمة الدين (' + formatMoney(debt.amount) + ').' };
    }

    debtor.cash -= debt.amount;
    if (debt.creditorId === 'ALL_PLAYERS') {
      getActivePlayers(room).forEach(function (other) {
        if (other.id !== debtor.id) other.cash += debt.perPlayerAmount;
      });
    } else if (debt.creditorId) {
      const creditor = getPlayer(room, debt.creditorId);
      if (creditor && !creditor.bankrupt) creditor.cash += debt.amount;
    } else if (room.settings.freeParkingPot) {
      room.parkingPot += debt.amount;
    }

    const allowExtra = Boolean(debt.resumeExtraRoll);
    room.pendingDebt = null;
    addLog(room, '✅ نجح ' + debtor.name + ' في تدبير السيولة وسداد مديونية ' + formatMoney(debt.amount) + '!', 'buy');
    finishTurnActionPhase(room, allowExtra);
    room.updatedAt = Date.now();
    return { ok: true };
  }

  function advanceToNextActivePlayer(room) {
    const active = getActivePlayers(room);
    if (active.length <= 1) {
      if (active.length === 1) {
        room.status = 'FINISHED';
        room.winnerId = active[0].id;
        room.turnPhase = 'END_TURN';
        addLog(room, '🏆 ألف مبروك! فاز ' + active[0].name + ' بلقب إمبراطور بنك الحظ المصري بعد إفلاس جميع المنافسين!', 'win');
      }
      return;
    }

    let nextIdx = room.currentTurnIndex;
    for (let i = 0; i < room.players.length; i++) {
      nextIdx = (nextIdx + 1) % room.players.length;
      if (!room.players[nextIdx].bankrupt) {
        break;
      }
    }
    room.currentTurnIndex = nextIdx;
    room.turnNumber += 1;
    room.turnPhase = 'PRE_ROLL';
    room.doublesCount = 0;
    room.pendingPurchaseTileId = null;
    room.pendingDebt = null;

    const nextPlayer = room.players[nextIdx];
    addLog(room, 'انتقل الدور الآن إلى ' + nextPlayer.name + ' (' + nextPlayer.icon + ').', 'info');
  }

  function declareBankruptcy(room, actorId, options) {
    const opts = options || {};
    if (room.status !== 'PLAYING') return { ok: false, error: 'المباراة ليست نشطة.' };

    let targetId = actorId;
    if (opts.targetId && actorId === room.hostId) {
      const targetPlayer = getPlayer(room, opts.targetId);
      if (!targetPlayer || targetPlayer.connected) {
        return { ok: false, error: 'يمكن استبعاد اللاعب فقط إذا كان منقطع الاتصال.' };
      }
      targetId = opts.targetId;
    }

    const debtor = getPlayer(room, targetId);
    if (!debtor || debtor.bankrupt) {
      return { ok: false, error: 'اللاعب مفلس بالفعل أو غير موجود.' };
    }

    // Liquidate all buildings first (50% value)
    let buildingCash = 0;
    Object.keys(room.properties).forEach(function (tileId) {
      const prop = room.properties[tileId];
      if (prop.ownerId === debtor.id && prop.houses > 0) {
        const tile = BOARD_TILES[Number(tileId)];
        buildingCash += prop.houses * Math.floor((tile.houseCost || 0) / 2);
        prop.houses = 0;
      }
    });
    debtor.cash += buildingCash;

    const debt = (room.pendingDebt && room.pendingDebt.debtorId === debtor.id) ? room.pendingDebt : null;
    const creditor = (debt && debt.creditorId && debt.creditorId !== 'ALL_PLAYERS')
      ? getPlayer(room, debt.creditorId)
      : null;

    if (creditor && !creditor.bankrupt) {
      creditor.cash += debtor.cash;
      creditor.jailFreeCards += debtor.jailFreeCards;
      Object.keys(room.properties).forEach(function (tileId) {
        const prop = room.properties[tileId];
        if (prop.ownerId === debtor.id) {
          prop.ownerId = creditor.id;
          prop.houses = 0;
        }
      });
      addLog(room, '🏳️ أعلن ' + debtor.name + ' إفلاسه لصالح ' + creditor.name + '! انتقلت جميع أملاكه وأمواله للدائن.', 'bankrupt');
    } else {
      if (debt && debt.creditorId === 'ALL_PLAYERS') {
        const others = getActivePlayers(room).filter(function (p) { return p.id !== debtor.id; });
        if (others.length > 0 && debtor.cash > 0) {
          const share = Math.floor(debtor.cash / others.length);
          others.forEach(function (o) { o.cash += share; });
        }
      }
      Object.keys(room.properties).forEach(function (tileId) {
        const prop = room.properties[tileId];
        if (prop.ownerId === debtor.id) {
          prop.ownerId = null;
          prop.houses = 0;
          prop.mortgaged = false;
        }
      });
      addLog(room, '🏳️ أعلن ' + debtor.name + ' إفلاسه! عادت جميع أملاكه إلى البنك متاحةً للشراء.', 'bankrupt');
    }

    debtor.cash = 0;
    debtor.jailFreeCards = 0;
    debtor.bankrupt = true;
    debtor.inJail = false;

    // Cancel any open trades involving this player
    room.trades = room.trades.filter(function (tr) {
      return tr.fromId !== debtor.id && tr.toId !== debtor.id;
    });

    if (debt) {
      room.pendingDebt = null;
    }

    const active = getActivePlayers(room);
    if (active.length <= 1) {
      if (active.length === 1) {
        room.status = 'FINISHED';
        room.winnerId = active[0].id;
        addLog(room, '🏆 انتهت المباراة! الفائز هو ' + active[0].name + ' بثروة قدرها ' + formatMoney(calculateNetWorth(room, active[0].id)) + '!', 'win');
      }
      room.updatedAt = Date.now();
      return { ok: true };
    }

    if (getCurrentPlayer(room) && getCurrentPlayer(room).id === debtor.id) {
      advanceToNextActivePlayer(room);
    }

    room.updatedAt = Date.now();
    return { ok: true };
  }

  function endTurn(room, actorId) {
    if (room.status !== 'PLAYING') return { ok: false, error: 'المباراة ليست نشطة.' };
    const player = getCurrentPlayer(room);
    if (!player || player.id !== actorId) return { ok: false, error: 'ليس دورك الآن.' };
    if (room.turnPhase !== 'END_TURN') {
      return { ok: false, error: 'يجب استكمال إجراء الدور الحالي أولاً قبل إنهاء الدور.' };
    }

    advanceToNextActivePlayer(room);
    room.updatedAt = Date.now();
    return { ok: true };
  }

  // Trading System (المقايضة)
  function validateTradeSide(room, player, side) {
    const cash = Math.max(0, Math.floor(Number(side.cash) || 0));
    const jailCards = Math.max(0, Math.floor(Number(side.jailCards) || 0));
    const propIds = Array.isArray(side.properties)
      ? Array.from(new Set(side.properties.map(Number)))
      : [];

    if (cash > player.cash) {
      return { ok: false, error: 'المبلغ المعروض من ' + player.name + ' يتجاوز رصيده الحالي.' };
    }
    if (jailCards > player.jailFreeCards) {
      return { ok: false, error: player.name + ' لا يملك هذا العدد من بطاقات الخروج من السجن.' };
    }
    for (let i = 0; i < propIds.length; i++) {
      const tid = propIds[i];
      const tile = BOARD_TILES[tid];
      const prop = room.properties[tid];
      if (!tile || !prop || prop.ownerId !== player.id) {
        return { ok: false, error: player.name + ' لا يملك "' + (tile ? tile.name : tid) + '".' };
      }
      if (tile.group && groupHasBuildings(room, tile.group)) {
        return { ok: false, error: 'لا يمكن مقايضة "' + tile.name + '" لوجود مبانٍ في مجموعتها اللونية (يجب بيع المباني أولاً).' };
      }
    }
    return {
      ok: true,
      normalized: { cash: cash, jailCards: jailCards, properties: propIds }
    };
  }

  function proposeTrade(room, actorId, payload) {
    if (room.status !== 'PLAYING') return { ok: false, error: 'المقايضة متاحة فقط أثناء المباراة.' };
    const fromPlayer = getPlayer(room, actorId);
    const toPlayer = getPlayer(room, payload && payload.toId);
    if (!fromPlayer || fromPlayer.bankrupt || !toPlayer || toPlayer.bankrupt) {
      return { ok: false, error: 'أحد طرفي المقايضة غير متاح.' };
    }
    if (fromPlayer.id === toPlayer.id) {
      return { ok: false, error: 'لا يمكنك المقايضة مع نفسك!' };
    }

    const offerCheck = validateTradeSide(room, fromPlayer, (payload && payload.offer) || {});
    if (!offerCheck.ok) return offerCheck;
    const requestCheck = validateTradeSide(room, toPlayer, (payload && payload.request) || {});
    if (!requestCheck.ok) return requestCheck;

    const offer = offerCheck.normalized;
    const request = requestCheck.normalized;
    const isEmptyOffer = offer.cash === 0 && offer.jailCards === 0 && offer.properties.length === 0;
    const isEmptyRequest = request.cash === 0 && request.jailCards === 0 && request.properties.length === 0;
    if (isEmptyOffer && isEmptyRequest) {
      return { ok: false, error: 'يجب تحديد عنصر واحد على الأقل (محافظة أو مبلغ مالي أو بطاقة) في المقايضة.' };
    }

    // Remove previous pending trade from same proposer
    room.trades = room.trades.filter(function (t) { return t.fromId !== fromPlayer.id; });

    const trade = {
      id: uid('trd'),
      fromId: fromPlayer.id,
      toId: toPlayer.id,
      offer: offer,
      request: request,
      note: sanitizeText(payload.note || '', 80),
      createdAt: Date.now()
    };
    room.trades.push(trade);
    addLog(room, '🤝 أرسل ' + fromPlayer.name + ' عرض مقايضة جديد إلى ' + toPlayer.name + '.', 'trade');
    room.updatedAt = Date.now();
    return { ok: true, trade: trade };
  }

  function cancelTrade(room, actorId, tradeId) {
    const idx = room.trades.findIndex(function (t) { return t.id === tradeId; });
    if (idx === -1) return { ok: false, error: 'عرض المقايضة لم يعد موجوداً.' };
    const trade = room.trades[idx];
    if (trade.fromId !== actorId && trade.toId !== actorId) {
      return { ok: false, error: 'غير مصرح لك بإلغاء هذا العرض.' };
    }
    room.trades.splice(idx, 1);
    room.updatedAt = Date.now();
    return { ok: true };
  }

  function respondTrade(room, actorId, payload) {
    const tradeId = payload && payload.tradeId;
    const accept = Boolean(payload && payload.accept);
    const idx = room.trades.findIndex(function (t) { return t.id === tradeId; });
    if (idx === -1) return { ok: false, error: 'عرض المقايضة لم يعد متاحاً.' };

    const trade = room.trades[idx];
    if (trade.toId !== actorId) {
      return { ok: false, error: 'هذا العرض ليس موجهاً إليك.' };
    }

    const fromPlayer = getPlayer(room, trade.fromId);
    const toPlayer = getPlayer(room, trade.toId);
    room.trades.splice(idx, 1);

    if (!accept) {
      addLog(room, 'رفض ' + (toPlayer ? toPlayer.name : 'اللاعب') + ' عرض المقايضة المقدم من ' + (fromPlayer ? fromPlayer.name : '') + '.', 'trade');
      room.updatedAt = Date.now();
      return { ok: true, accepted: false };
    }

    if (!fromPlayer || fromPlayer.bankrupt || !toPlayer || toPlayer.bankrupt) {
      return { ok: false, error: 'أحد الطرفين لم يعد نشطاً.' };
    }

    const offerCheck = validateTradeSide(room, fromPlayer, trade.offer);
    if (!offerCheck.ok) return offerCheck;
    const requestCheck = validateTradeSide(room, toPlayer, trade.request);
    if (!requestCheck.ok) return requestCheck;

    // Atomic Swap
    fromPlayer.cash = fromPlayer.cash - trade.offer.cash + trade.request.cash;
    toPlayer.cash = toPlayer.cash - trade.request.cash + trade.offer.cash;

    fromPlayer.jailFreeCards = fromPlayer.jailFreeCards - trade.offer.jailCards + trade.request.jailCards;
    toPlayer.jailFreeCards = toPlayer.jailFreeCards - trade.request.jailCards + trade.offer.jailCards;

    trade.offer.properties.forEach(function (tid) {
      room.properties[tid].ownerId = toPlayer.id;
    });
    trade.request.properties.forEach(function (tid) {
      room.properties[tid].ownerId = fromPlayer.id;
    });

    addLog(room, '🤝 تمت صفقة مقايضة ناجحة بين ' + fromPlayer.name + ' و ' + toPlayer.name + '!', 'trade');
    room.updatedAt = Date.now();
    return { ok: true, accepted: true };
  }

  function addChatMessage(room, actorId, text) {
    const player = getPlayer(room, actorId);
    if (!player) return { ok: false, error: 'اللاعب غير موجود.' };
    const clean = sanitizeText(text, 160);
    if (!clean) return { ok: false, error: 'الرسالة فارغة.' };

    const msg = {
      id: uid('msg'),
      senderId: player.id,
      senderName: player.name,
      senderIcon: player.icon,
      senderColor: player.color,
      text: clean,
      timestamp: Date.now()
    };
    room.chat.push(msg);
    if (room.chat.length > 60) {
      room.chat.shift();
    }
    room.updatedAt = Date.now();
    return { ok: true, message: msg };
  }

  // Smart Bot AI Logic (for solo testing or filling rooms)
  function evaluateTradeSideValue(room, side, receiverId) {
    let val = side.cash + (side.jailCards * 450);
    side.properties.forEach(function (tid) {
      const tile = BOARD_TILES[tid];
      const prop = room.properties[tid];
      if (tile) {
        let base = prop && prop.mortgaged ? tile.price * 0.55 : tile.price * 1.15;
        if (tile.group) {
          const groupTiles = getGroupTiles(tile.group);
          const receiverOwned = groupTiles.filter(function (gt) {
            return room.properties[gt.id].ownerId === receiverId;
          }).length;
          if (receiverOwned + 1 >= groupTiles.length) base *= 1.5;
        }
        val += base;
      }
    });
    return val;
  }

  function runBotStep(room) {
    if (room.status !== 'PLAYING') return false;

    // 1. Check if any bot has an incoming trade offer
    const botTrade = room.trades.find(function (t) {
      const target = getPlayer(room, t.toId);
      return target && target.isBot && !target.bankrupt;
    });
    if (botTrade) {
      const gain = evaluateTradeSideValue(room, botTrade.offer, botTrade.toId);
      const give = evaluateTradeSideValue(room, botTrade.request, botTrade.toId);
      const accept = gain >= give * 0.95 && gain > 0;
      respondTrade(room, botTrade.toId, { tradeId: botTrade.id, accept: accept });
      return true;
    }

    const current = getCurrentPlayer(room);
    if (!current || !current.isBot || current.bankrupt) return false;

    if (room.turnPhase === 'PRE_ROLL') {
      if (current.inJail) {
        if (current.jailFreeCards > 0) {
          useJailCard(room, current.id);
          return true;
        }
        if (current.cash >= GAME_CONFIG.JAIL_BAIL + 1500) {
          payJailBail(room, current.id);
          return true;
        }
      }
      rollDice(room, current.id);
      return true;
    }

    if (room.turnPhase === 'BUY_DECISION') {
      const tile = BOARD_TILES[room.pendingPurchaseTileId];
      if (tile && current.cash >= tile.price + 400) {
        buyProperty(room, current.id);
      } else if (tile && current.cash >= tile.price && Math.random() < 0.75) {
        buyProperty(room, current.id);
      } else {
        skipPurchase(room, current.id);
      }
      return true;
    }

    if (room.turnPhase === 'DEBT_RESOLUTION' && room.pendingDebt) {
      if (current.cash >= room.pendingDebt.amount) {
        settleDebt(room, current.id);
        return true;
      }
      // Try selling a house first
      const sellable = Object.keys(room.properties).find(function (tid) {
        return canSellHouseCheck(room, current.id, Number(tid)).ok;
      });
      if (sellable) {
        sellHouse(room, current.id, Number(sellable));
        return true;
      }
      // Try mortgaging an unimproved property
      const mortgageable = Object.keys(room.properties).find(function (tid) {
        const prop = room.properties[tid];
        const tile = BOARD_TILES[Number(tid)];
        return prop.ownerId === current.id && !prop.mortgaged && (!tile.group || !groupHasBuildings(room, tile.group));
      });
      if (mortgageable) {
        mortgageProperty(room, current.id, Number(mortgageable));
        return true;
      }
      declareBankruptcy(room, current.id);
      return true;
    }

    if (room.turnPhase === 'END_TURN') {
      // Unmortgage if flush with cash
      if (current.cash > 3500) {
        const mortId = Object.keys(room.properties).find(function (tid) {
          const prop = room.properties[tid];
          const tile = BOARD_TILES[Number(tid)];
          const cost = Math.ceil((tile.price / 2) * 1.1);
          return prop.ownerId === current.id && prop.mortgaged && current.cash - cost >= 1800;
        });
        if (mortId) {
          unmortgageProperty(room, current.id, Number(mortId));
          return true;
        }
      }
      // Build a house if holding monopoly and enough buffer cash
      if (current.cash > 2200) {
        const buildable = Object.keys(room.properties).find(function (tid) {
          const tile = BOARD_TILES[Number(tid)];
          return canBuildHouseCheck(room, current.id, Number(tid)).ok && (current.cash - tile.houseCost >= 1200);
        });
        if (buildable) {
          buildHouse(room, current.id, Number(buildable));
          return true;
        }
      }
      endTurn(room, current.id);
      return true;
    }

    return false;
  }

  function getPublicState(room) {
    return {
      code: room.code,
      status: room.status,
      hostId: room.hostId,
      settings: room.settings,
      players: room.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          avatarId: p.avatarId,
          icon: p.icon,
          color: p.color,
          cash: p.cash,
          netWorth: calculateNetWorth(room, p.id),
          liquidatable: calculateLiquidatableValue(room, p.id),
          position: p.position,
          inJail: p.inJail,
          jailTurns: p.jailTurns,
          jailFreeCards: p.jailFreeCards,
          bankrupt: p.bankrupt,
          connected: p.connected,
          isBot: p.isBot
        };
      }),
      properties: room.properties,
      currentTurnIndex: room.currentTurnIndex,
      turnNumber: room.turnNumber,
      turnPhase: room.turnPhase,
      doublesCount: room.doublesCount,
      lastRoll: room.lastRoll,
      lastMove: room.lastMove,
      lastCard: room.lastCard,
      pendingPurchaseTileId: room.pendingPurchaseTileId,
      pendingDebt: room.pendingDebt,
      trades: room.trades,
      parkingPot: room.parkingPot,
      winnerId: room.winnerId,
      logs: room.logs,
      chat: room.chat,
      updatedAt: room.updatedAt
    };
  }

  return {
    createRoom: createRoom,
    joinRoom: joinRoom,
    addBotPlayer: addBotPlayer,
    removePlayerFromLobby: removePlayerFromLobby,
    updateLobbySettings: updateLobbySettings,
    updatePlayerAppearance: updatePlayerAppearance,
    startGame: startGame,
    payJailBail: payJailBail,
    useJailCard: useJailCard,
    rollDice: rollDice,
    buyProperty: buyProperty,
    skipPurchase: skipPurchase,
    canBuildHouseCheck: canBuildHouseCheck,
    buildHouse: buildHouse,
    canSellHouseCheck: canSellHouseCheck,
    sellHouse: sellHouse,
    mortgageProperty: mortgageProperty,
    unmortgageProperty: unmortgageProperty,
    settleDebt: settleDebt,
    declareBankruptcy: declareBankruptcy,
    endTurn: endTurn,
    proposeTrade: proposeTrade,
    cancelTrade: cancelTrade,
    respondTrade: respondTrade,
    addChatMessage: addChatMessage,
    runBotStep: runBotStep,
    ownsFullGroup: ownsFullGroup,
    calculateRent: calculateRent,
    calculateNetWorth: calculateNetWorth,
    getPublicState: getPublicState
  };
});
