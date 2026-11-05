(function () {
  'use strict';

  const Data = window.BankElHazData;
  const AudioFX = window.BankElHazAudio;
  const Network = window.BankElHazNetwork;
  const Ads = window.BankElHazAds;

  const {
    GAME_CONFIG,
    PLAYER_PRESETS,
    COLOR_GROUPS,
    BOARD_TILES,
    getGridCoords,
    isPurchasable,
    formatMoney
  } = Data;

  // Client UI State
  const ui = {
    myPlayerId: null,
    roomCode: null,
    state: null,
    selectedAvatarId: PLAYER_PRESETS[0].id,
    displayedPositions: {},
    animatingMoveTs: 0,
    isAnimatingMove: false,
    buyUnlockAt: 0,
    buyUnlockTimer: null,
    lastPendingBuyKey: null,
    actionInFlight: false,
    lastRollTs: 0,
    lastCardTs: 0,
    lastEliminatedTs: 0,
    lastLogId: null,
    lastChatCount: 0,
    unreadChat: 0,
    knownTradeIds: new Set(),
    editingCounterTradeId: null,
    prevPlayerCash: {},
    cashInitialized: false,
    diceSpinCycle: 0,
    openTileModalId: null,
    boardZoomed: false,
    activeLeftTab: 'log',
    activeMobileView: 'board',
    pendingSmartlinkAction: null
  };

  // DOM Elements Cache
  const els = {};
  function cacheDom() {
    const ids = [
      'connectionBadge', 'connectionText', 'headerRoomBar', 'headerRoomCode',
      'headerCopyInviteBtn', 'leaveRoomBtn', 'soundToggleBtn',
      'publicDomainBanner', 'publicDomainLink',
      'landingScreen', 'lobbyScreen', 'gameScreen',
      'inviteBanner', 'inviteBannerTitle', 'inviteBannerSub',
      'playerNameInput', 'avatarPickerGrid', 'createRoomBtn', 'joinRoomCodeInput', 'joinRoomBtn',
      'smartlinkGateBox', 'smartlinkActionBtn', 'smartlinkUnlockedBadge',
      'smartlinkModal', 'smartlinkModalConfirmBtn',
      'lobbyRoomCode', 'inviteUrlInput', 'copyInviteBtn', 'whatsappShareBtn',
      'lobbyCountText', 'addBotBtn', 'lobbyPlayersGrid',
      'startingCashSelect', 'freeParkingCheckbox', 'startGameBtn', 'lobbyWaitHint',
      'mobileMyAvatar', 'mobileMyName', 'mobileMyCash', 'mobileTurnBadge',
      'finishByWealthBtn', 'hostFinishGameSideBtn', 'boardZoomToggleBtn',
      'incomingTradeBanner',
      'drawerPlayers', 'drawerSocial', 'playersList', 'myAssetsCount', 'myAssetsList',
      'openTradeFromAssetsBtn', 'boardScrollWrapper', 'boardGrid', 'boardCenter',
      'parkingPotBadge', 'die1', 'die2', 'diceResultLabel', 'drawnCardBanner',
      'turnBanner', 'actionButtonsContainer', 'tokensLayer',
      'activeTradesBox', 'unreadChatBadge', 'eventLogs', 'chatMessages', 'chatForm', 'chatInput',
      'drawerSocialTitle', 'mobileBottomNav', 'mobTradeBadge', 'mobChatBadge',
      'tileModal', 'tileModalBody',
      'tradeModal', 'tradeModalTitle', 'tradeCounterHint',
      'tradeTargetSelect', 'tradeMyMaxCashHint', 'tradeTheirMaxCashHint',
      'tradeMyCash', 'tradeMyCards', 'tradeMyProps',
      'tradeTheirCash', 'tradeTheirCards', 'tradeTheirProps',
      'tradeNoteInput', 'submitTradeBtn',
      'winnerModal', 'winnerTitle', 'winnerSubtitle', 'winnerStandings', 'winnerExitBtn',
      'centerLiveFeed', 'underBoardArea', 'underBoardPlayers',
      'underBoardBankruptBtn', 'underBoardTradesBtn', 'underBoardProperties',
      'underPropsCount', 'underPropsList',
      'floatingActionsDock', 'floatingLogBtn', 'floatingChatBtn', 'floatingChatBadge',
      'resumeGameBox', 'resumeBoxRoomCode', 'resumeBoxPlayerName', 'resumeActiveGameBtn', 'dismissResumeGameBtn',
      'toastContainer'
    ];
    ids.forEach(function (id) {
      els[id] = document.getElementById(id);
    });
  }

  // Utilities
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function hexToRgba(hex, alpha) {
    const clean = String(hex || '').replace('#', '').trim();
    if (clean.length !== 6) return 'rgba(16, 185, 129, ' + alpha + ')';
    const r = parseInt(clean.slice(0, 2), 16) || 0;
    const g = parseInt(clean.slice(2, 4), 16) || 0;
    const b = parseInt(clean.slice(4, 6), 16) || 0;
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  function formatSignedCash(amount) {
    const n = Math.round(Number(amount) || 0);
    if (n < 0) {
      return '-$' + Math.abs(n).toLocaleString('en-US');
    }
    return formatMoney(n);
  }

  function getAvatarPreset(val) {
    if (!val) return PLAYER_PRESETS[0];
    if (typeof val === 'object' && val !== null) {
      if (val.avatarId) {
        const byId = PLAYER_PRESETS.find(function (p) { return p.id === val.avatarId; });
        if (byId) return byId;
      }
      if (val.color) {
        const byCol = PLAYER_PRESETS.find(function (p) { return p.color === val.color; });
        if (byCol) return byCol;
      }
      if (val.icon) {
        const byIcon = PLAYER_PRESETS.find(function (p) { return p.icon === val.icon; });
        if (byIcon) return byIcon;
      }
    }
    const match = PLAYER_PRESETS.find(function (p) {
      return p.id === val || p.color === val || p.icon === val;
    });
    return match || PLAYER_PRESETS[0];
  }

  function renderRichupAvatar(param, sizeClass) {
    let preset = null;
    let icon = '🦅';
    let color = '#d97706';
    let bg = 'linear-gradient(135deg, #d97706, #f59e0b)';

    if (typeof param === 'object' && param !== null) {
      preset = getAvatarPreset(param);
      icon = param.icon || preset.icon;
      color = param.color || preset.color;
      bg = preset.badgeBg || ('linear-gradient(135deg, ' + color + ', #f59e0b)');
    } else {
      preset = getAvatarPreset(param);
      icon = preset.icon;
      color = preset.color;
      bg = preset.badgeBg;
    }

    return (
      '<div class="arabian-avatar ' + (sizeClass || '') + '" style="--token-color:' + color + '; background:' + bg + ';" title="' + (preset ? preset.name : '') + '">' +
        '<span class="avatar-arabian-icon">' + icon + '</span>' +
        '<span class="avatar-gold-rim"></span>' +
      '</div>'
    );
  }

  function getCountryFlagSvg(key) {
    if (typeof BankElHazData !== 'undefined' && typeof BankElHazData.getCountryFlagSvg === 'function') {
      return BankElHazData.getCountryFlagSvg(key);
    }
    return '';
  }

  function showToast(msg, type) {
    if (!els.toastContainer) return;
    const t = document.createElement('div');
    t.className = 'toast ' + (type || 'info');
    t.textContent = msg;
    els.toastContainer.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 3600);
  }

  // ==================== Smartlink Activation & Room Gate ====================
  function isSmartlinkUnlocked() {
    if (typeof BankElHazAds !== 'undefined' && typeof BankElHazAds.isSmartlinkUnlocked === 'function') {
      return BankElHazAds.isSmartlinkUnlocked();
    }
    try {
      return sessionStorage.getItem('beh_smartlink_unlocked') === '1';
    } catch (_e) {
      return false;
    }
  }

  function updateSmartlinkGateUI() {
    const unlocked = isSmartlinkUnlocked();
    if (els.smartlinkGateBox) {
      if (els.smartlinkActionBtn) els.smartlinkActionBtn.classList.toggle('hidden', unlocked);
      if (els.smartlinkUnlockedBadge) els.smartlinkUnlockedBadge.classList.toggle('hidden', !unlocked);
      els.smartlinkGateBox.classList.toggle('is-unlocked', unlocked);
    }
  }

  function handleSmartlinkUnlockAndProceed(nextAction) {
    const url = (typeof BankElHazAds !== 'undefined' && BankElHazAds.getSmartLinkUrl && BankElHazAds.getSmartLinkUrl())
      || 'https://www.profitableratecpmnetwork.com/f4c021nfe?key=8635493de0d07bd3a015caa30635cf8f';

    try {
      window.open(url, '_blank');
    } catch (_e) { }

    if (typeof BankElHazAds !== 'undefined' && typeof BankElHazAds.unlockSmartlink === 'function') {
      BankElHazAds.unlockSmartlink();
    } else {
      try {
        sessionStorage.setItem('beh_smartlink_unlocked', '1');
      } catch (_e) { }
    }

    if (els.smartlinkModal) els.smartlinkModal.classList.add('hidden');
    updateSmartlinkGateUI();

    if (nextAction === 'create') {
      showToast('🎉 تم تفعيل اللعبة! جاري إنشاء غرفتك...', 'success');
      setTimeout(function () {
        if (typeof triggerCreateRoomAction === 'function') triggerCreateRoomAction();
      }, 250);
    } else if (nextAction === 'join') {
      showToast('🎉 تم تفعيل اللعبة! جاري الانضمام للغرفة...', 'success');
      setTimeout(function () {
        if (typeof triggerJoinRoomAction === 'function') triggerJoinRoomAction();
      }, 250);
    } else {
      showToast('🎉 تم تفعيل اللعبة بنجاح! متاح إنشاء الغرف والانضمام الآن.', 'success');
    }
  }

  // ==================== Floating Cash Delta Animations (+ Green / - Red) ====================
  let cashFxLayerEl = null;
  function ensureCashFxLayer() {
    if (cashFxLayerEl && cashFxLayerEl.parentNode) return cashFxLayerEl;
    cashFxLayerEl = document.createElement('div');
    cashFxLayerEl.className = 'cash-fx-layer';
    document.body.appendChild(cashFxLayerEl);
    return cashFxLayerEl;
  }

  function spawnBadgeAtElement(targetEl, text, isPlus) {
    if (!targetEl) return false;
    const rect = targetEl.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return false;

    // Check if within visible bounds
    if (rect.bottom < 0 || rect.top > (window.innerHeight || document.documentElement.clientHeight) ||
        rect.right < 0 || rect.left > (window.innerWidth || document.documentElement.clientWidth)) {
      return false;
    }

    const layer = ensureCashFxLayer();
    const badge = document.createElement('div');
    badge.className = 'cash-fly-badge ' + (isPlus ? 'plus' : 'minus');
    badge.textContent = text;
    // تموضع المبلغ الطائر مباشرة فوق اسم اللاعب أو قطعته
    badge.style.left = Math.round(rect.left + rect.width / 2) + 'px';
    badge.style.top = Math.round(rect.top - 8) + 'px';
    layer.appendChild(badge);

    const bumpClass = isPlus ? 'cash-bump-plus' : 'cash-bump-minus';
    targetEl.classList.remove('cash-bump-plus', 'cash-bump-minus');
    void targetEl.offsetWidth;
    targetEl.classList.add(bumpClass);

    setTimeout(function () {
      targetEl.classList.remove(bumpClass);
    }, 600);

    setTimeout(function () {
      if (badge.parentNode) badge.parentNode.removeChild(badge);
    }, 1500);
    return true;
  }

  function trackAndAnimateCashChanges(state) {
    if (!state || !Array.isArray(state.players)) return;

    if (!ui.cashInitialized || state.status === 'LOBBY') {
      ui.prevPlayerCash = {};
      state.players.forEach(function (p) {
        ui.prevPlayerCash[p.id] = p.cash;
      });
      ui.cashInitialized = state.status !== 'LOBBY';
      return;
    }

    state.players.forEach(function (p) {
      const prev = ui.prevPlayerCash[p.id];
      ui.prevPlayerCash[p.id] = p.cash;
      if (prev === undefined || prev === p.cash) return;

      const delta = p.cash - prev;
      if (delta === 0) return;

      const isPlus = delta > 0;
      const sign = isPlus ? '+ ' : '- ';
      const absStr = Math.abs(delta).toLocaleString('en-US');
      const deltaText = sign + '$' + absStr;

      // تأثير صوتي عند الإضافة (+) أو الخصم (-)
      try {
        if (isPlus) AudioFX.buy();
        else AudioFX.rent();
      } catch (_e) { }

      // 1) إظهار المبلغ الطائر مباشرة فوق اسم اللاعب في منطقة تحت اللوحة (الموبايل والكمبيوتر)
      const underNameEl = document.getElementById('underPlayerName_' + p.id);
      if (underNameEl) {
        spawnBadgeAtElement(underNameEl, deltaText, isPlus);
      }

      // 2) إظهار المبلغ الطائر فوق قطعة اللاعب المتحركة على الرقعة
      const tokenEl = document.getElementById('token_' + p.id);
      if (tokenEl) {
        spawnBadgeAtElement(tokenEl, deltaText, isPlus);
      }

      // 3) إظهار المبلغ الطائر فوق اسم اللاعب في القائمة الجانبية (شاشات الكمبيوتر)
      const pcNameEl = document.getElementById('pcName_' + p.id);
      if (pcNameEl) {
        spawnBadgeAtElement(pcNameEl, deltaText, isPlus);
      }

      // 4) بدائل احتياطية للأرصدة
      const underCashEl = document.getElementById('underPlayerCash_' + p.id);
      if (underCashEl && !underNameEl) {
        spawnBadgeAtElement(underCashEl, deltaText, isPlus);
      }
      const pcCashEl = document.getElementById('pcCash_' + p.id);
      if (pcCashEl && !pcNameEl) {
        spawnBadgeAtElement(pcCashEl, deltaText, isPlus);
      }
    });
  }

  function buildInviteUrl(code) {
    const base = window.location.href.split('?')[0].split('#')[0];
    return base + '?room=' + encodeURIComponent(code);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (_e) {
      return false;
    }
  }

  function saveSession(roomCode, playerId, sessionToken, extra) {
    try {
      const name = (els.playerNameInput && els.playerNameInput.value.trim()) || (extra && extra.playerName) || 'لاعب';
      const avatarId = ui.selectedAvatarId || (extra && extra.avatarId) || 'red';
      const sessionData = {
        roomCode: roomCode,
        playerId: playerId,
        sessionToken: sessionToken,
        playerName: name,
        avatarId: avatarId,
        timestamp: Date.now()
      };
      localStorage.setItem('beh_last_name', name);
      localStorage.setItem('beh_last_avatar', avatarId);
      localStorage.setItem('beh_last_room', roomCode);
      localStorage.setItem('beh_active_session', JSON.stringify(sessionData));
      localStorage.setItem('beh_session_' + roomCode, JSON.stringify(sessionData));
      sessionStorage.setItem('beh_session_' + roomCode, JSON.stringify(sessionData));
    } catch (_e) { }
  }

  function loadSession(roomCode) {
    try {
      if (roomCode) {
        const fromSession = sessionStorage.getItem('beh_session_' + roomCode);
        if (fromSession) return JSON.parse(fromSession);
        const fromLocal = localStorage.getItem('beh_session_' + roomCode);
        if (fromLocal) return JSON.parse(fromLocal);
        return null;
      }
      // إذا لم يُمرر كود، نقرأ المباراة النشطة من localStorage
      const rawActive = localStorage.getItem('beh_active_session');
      if (!rawActive) return null;
      const active = JSON.parse(rawActive);
      // تنتهي صلاحية الجلسة المحفوظة بعد 12 ساعة من عدم النشاط
      if (Date.now() - (active.timestamp || 0) > 12 * 60 * 60 * 1000) {
        localStorage.removeItem('beh_active_session');
        return null;
      }
      return active;
    } catch (_e) {
      return null;
    }
  }

  function clearSession(roomCode) {
    try {
      if (roomCode) {
        sessionStorage.removeItem('beh_session_' + roomCode);
        localStorage.removeItem('beh_session_' + roomCode);
        const raw = localStorage.getItem('beh_active_session');
        if (raw) {
          const act = JSON.parse(raw);
          if (act.roomCode === roomCode) {
            localStorage.removeItem('beh_active_session');
          }
        }
      } else {
        localStorage.removeItem('beh_active_session');
      }
      localStorage.removeItem('beh_last_room');

      // عند إنهاء الجيم أو استبعاد اللاعب أو الخروج، يتم قفل السمارت لينك مجدداً لطلب تفعيله عند أي مباراة جديدة
      if (typeof BankElHazAds !== 'undefined' && typeof BankElHazAds.lockSmartlink === 'function') {
        BankElHazAds.lockSmartlink();
      }
      if (typeof updateSmartlinkGateUI === 'function') {
        updateSmartlinkGateUI();
      }
    } catch (_e) { }
  }

  function setScreen(screenName) {
    ['landingScreen', 'lobbyScreen', 'gameScreen'].forEach(function (id) {
      els[id].classList.toggle('active', id === screenName + 'Screen');
    });
    const inRoom = screenName === 'lobby' || screenName === 'game';
    els.headerRoomBar.classList.toggle('hidden', !inRoom);
    if (Ads) Ads.refresh();
  }

  // ==================== Avatar Picker ====================
  function renderAvatarPicker() {
    els.avatarPickerGrid.innerHTML = PLAYER_PRESETS.map(function (pr) {
      const selected = pr.id === ui.selectedAvatarId ? 'selected' : '';
      return (
        '<div class="avatar-option ' + selected + '" data-avatar-id="' + pr.id + '">' +
        renderRichupAvatar(pr, 'sm') +
        '<span class="av-name">' + escapeHtml(pr.name) + '</span>' +
        '</div>'
      );
    }).join('');
  }

  // ==================== Board Static Construction ====================
  function buildBoardDOM() {
    Array.from(els.boardGrid.querySelectorAll('.board-tile')).forEach(function (el) {
      el.remove();
    });

    BOARD_TILES.forEach(function (tile) {
      const coords = getGridCoords(tile.id);
      const isCorner = coords.side.indexOf('corner') === 0;
      const isProp = tile.type === 'property';

      const div = document.createElement('div');
      div.className =
        'board-tile ' +
        'tile-side-' + coords.side +
        (isCorner ? ' corner-tile corner-' + coords.side : '') +
        (isProp ? ' property-tile' : '');
      div.dataset.tileId = String(tile.id);
      div.style.gridRow = String(coords.row);
      div.style.gridColumn = String(coords.col);

      let innerHtml = '';

      if (isCorner) {
        if (tile.id === 0) {
          innerHtml =
            '<div class="corner-inner corner-start">' +
            '<div class="corner-badge-top">استلم 200$</div>' +
            '<div class="corner-symbol green-arrows">⏩</div>' +
            '<div class="corner-main-title">START</div>' +
            '</div>';
        } else if (tile.id === 10) {
          innerHtml =
            '<div class="corner-inner corner-prison">' +
            '<div class="corner-symbol">⛓️</div>' +
            '<div class="corner-main-title">In Prison</div>' +
            '<div class="corner-sub-text">في السجن / زيارة</div>' +
            '</div>';
        } else if (tile.id === 20) {
          innerHtml =
            '<div class="corner-inner corner-vacation">' +
            '<div class="corner-symbol">🌴</div>' +
            '<div class="corner-main-title">Vacation</div>' +
            '<div class="corner-sub-text">عطلة واستراحة</div>' +
            '</div>';
        } else {
          innerHtml =
            '<div class="corner-inner corner-go-jail">' +
            '<div class="corner-symbol">☠️</div>' +
            '<div class="corner-main-title">Go to prison</div>' +
            '<div class="corner-sub-text">إلى السجن!</div>' +
            '</div>';
        }
      } else {
        let emblemHtml = '';
        if (isProp) {
          // علم الدولة الحقيقي بصيغة SVG فائقة النقاء لتمييز المجموعة بالكامل بدون شرائط
          const flagSvg = getCountryFlagSvg(tile.group || tile.country);
          emblemHtml =
            '<div class="tile-flag-circle" title="' + escapeHtml(tile.country || '') + '">' +
            (flagSvg || tile.flag || '🏛️') +
            '</div>';
        } else if (tile.type === 'station') {
          emblemHtml = '<div class="tile-special-icon airport-icon">✈️</div>';
        } else if (tile.type === 'utility') {
          emblemHtml = '<div class="tile-special-icon utility-icon">' + tile.icon + '</div>';
        } else if (tile.type === 'chance') {
          emblemHtml = '<div class="tile-special-icon surprise-icon">❓</div>';
        } else if (tile.type === 'community') {
          emblemHtml = '<div class="tile-special-icon treasure-icon">📦</div>';
        } else if (tile.type === 'tax') {
          emblemHtml = '<div class="tile-special-icon tax-icon">' + tile.icon + '</div>';
        } else {
          emblemHtml = '<div class="tile-special-icon">' + (tile.icon || '📍') + '</div>';
        }

        let bottomPriceHtml = '';
        if (tile.price) {
          bottomPriceHtml = '<div class="tile-price">$' + tile.price + '</div>';
        } else if (tile.taxAmount) {
          bottomPriceHtml = '<div class="tile-price">-$' + tile.taxAmount + '</div>';
        }

        // بطاقة نقية بدون شرائط ملونة: ختم المالك البارز + شارة المباني + علم الدولة + الاسم + السعر
        innerHtml =
          '<div class="tile-owner-stamp hidden" id="tileStamp_' + tile.id + '"></div>' +
          '<div class="tile-houses-tag" id="tileHouses_' + tile.id + '"></div>' +
          emblemHtml +
          '<div class="tile-name">' + escapeHtml(tile.shortName || tile.name) + '</div>' +
          bottomPriceHtml;
      }

      div.innerHTML = innerHtml;

      div.addEventListener('click', function () {
        AudioFX.click();
        openTileModal(tile.id);
      });

      els.boardGrid.insertBefore(div, els.boardCenter);
    });
  }

  // ==================== Rendering Lobby ====================
  function renderLobby(state) {
    els.lobbyRoomCode.textContent = state.code;
    els.headerRoomCode.textContent = state.code;
    els.inviteUrlInput.value = buildInviteUrl(state.code);
    els.lobbyCountText.textContent = state.players.length + '/' + GAME_CONFIG.MAX_PLAYERS;

    const isHost = state.hostId === ui.myPlayerId;
    els.startingCashSelect.disabled = !isHost;
    els.freeParkingCheckbox.disabled = !isHost;
    els.startingCashSelect.value = String(state.settings.startingCash);
    els.freeParkingCheckbox.checked = Boolean(state.settings.freeParkingPot);

    els.addBotBtn.classList.toggle('hidden', !isHost || state.players.length >= GAME_CONFIG.MAX_PLAYERS);

    let seatsHtml = '';
    for (let i = 0; i < GAME_CONFIG.MAX_PLAYERS; i++) {
      const p = state.players[i];
      if (p) {
        const tags = [];
        if (p.id === state.hostId) tags.push('👑 مضيف الغرفة');
        if (p.id === ui.myPlayerId) tags.push('أنت');
        if (p.isBot) tags.push('🤖 لاعب آلي');
        if (!p.connected) tags.push('⚠️ غير متصل');

        const canRemove = isHost && p.id !== ui.myPlayerId;
        seatsHtml +=
          '<div class="lobby-seat">' +
          '<div class="seat-left">' +
          renderRichupAvatar(p, 'sm') +
          '<div class="seat-meta">' +
          '<strong>' + escapeHtml(p.name) + '</strong>' +
          '<small>' + tags.join(' • ') + '</small>' +
          '</div>' +
          '</div>' +
          (canRemove
            ? '<button class="btn btn-danger-outline btn-xs" data-kick-id="' + p.id + '" type="button">إزالة</button>'
            : '') +
          '</div>';
      } else {
        seatsHtml +=
          '<div class="lobby-seat empty">' +
          '<span>مقعد متاح (' + (i + 1) + ') — بانتظار انضمام صديق عبر الرابط...</span>' +
          '</div>';
      }
    }
    els.lobbyPlayersGrid.innerHTML = seatsHtml;

    if (isHost) {
      els.startGameBtn.classList.remove('hidden');
      const enough = state.players.length >= GAME_CONFIG.MIN_PLAYERS;
      els.startGameBtn.disabled = !enough;
      els.lobbyWaitHint.textContent = enough
        ? 'جميع الإعدادات جاهزة! يمكنك بدء المباراة الآن أو انتظار المزيد من الأصدقاء.'
        : 'يجب وجود لاعبين اثنين (2) على الأقل لبدء المباراة (انسخ الرابط لأصدقائك أو أضف لاعباً آلياً).';
    } else {
      els.startGameBtn.classList.add('hidden');
      els.lobbyWaitHint.textContent = 'بانتظار مضيف الغرفة لبدء المباراة... استعد!';
    }
  }

  // ==================== Dice 3D Animation ====================
  const DIE_ANGLES = {
    1: [0, 0],
    2: [0, -90],
    3: [-90, 0],
    4: [90, 0],
    5: [0, 90],
    6: [0, 180]
  };

  function setDieFace(dieEl, value, spinCycle) {
    const base = DIE_ANGLES[value] || [0, 0];
    const extraX = spinCycle * 720;
    const extraY = spinCycle * 720;
    dieEl.style.transform = 'rotateX(' + (base[0] + extraX) + 'deg) rotateY(' + (base[1] + extraY) + 'deg)';
  }

  function updateDiceUI(state) {
    if (!state.lastRoll) {
      els.diceResultLabel.textContent = 'ارمِ النرد لبدء جولتك!';
      return;
    }
    const r = state.lastRoll;
    if (r.timestamp !== ui.lastRollTs) {
      ui.lastRollTs = r.timestamp;
      ui.diceSpinCycle += 1;
      AudioFX.dice();
      setDieFace(els.die1, r.d1, ui.diceSpinCycle);
      setDieFace(els.die2, r.d2, ui.diceSpinCycle);
    }
    const roller = state.players.find(function (p) { return p.id === r.rollerId; });
    const rollerName = roller ? roller.name : 'اللاعب';
    els.diceResultLabel.textContent =
      rollerName + ' رمى: ' + r.d1 + ' + ' + r.d2 + ' = ' + r.total + (r.isDoubles ? ' (دبل! 🎯)' : '');
  }

  // ==================== Smooth Token Positioning & Anti-Auto-Buy Hopping ====================
  function getTileCenterPx(tileId, slotIdx, slotTotal) {
    const tileEl = els.boardGrid.querySelector('.board-tile[data-tile-id="' + tileId + '"]');
    if (!tileEl) return { x: 0, y: 0 };

    const cx = tileEl.offsetLeft + tileEl.offsetWidth / 2;
    const cy = tileEl.offsetTop + tileEl.offsetHeight / 2;

    if (!slotTotal || slotTotal <= 1) {
      return { x: cx, y: cy };
    }
    const angle = (slotIdx / slotTotal) * Math.PI * 2;
    const radius = Math.min(tileEl.offsetWidth, tileEl.offsetHeight) * 0.22;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius
    };
  }

  function syncTokenElements(state) {
    const activeIds = new Set();
    const currentP = state.players[state.currentTurnIndex];

    state.players.forEach(function (p) {
      if (p.bankrupt) return;
      activeIds.add(p.id);
      if (ui.displayedPositions[p.id] === undefined) {
        ui.displayedPositions[p.id] = p.position;
      }
      let tokenEl = document.getElementById('token_' + p.id);
      if (!tokenEl) {
        tokenEl = document.createElement('div');
        tokenEl.id = 'token_' + p.id;
        tokenEl.className = 'board-token';
        els.tokensLayer.appendChild(tokenEl);
      }
      const preset = getAvatarPreset(p);
      tokenEl.style.background = preset.badgeBg || p.color;
      tokenEl.innerHTML =
        '<div class="arabian-token-content">' +
        '<span class="token-arabian-icon">' + (p.icon || preset.icon) + '</span>' +
        '<span class="token-gold-border"></span>' +
        '</div>';
      tokenEl.title = p.name;
      tokenEl.classList.toggle('active-player-token', Boolean(currentP && currentP.id === p.id));
    });

    Array.from(els.tokensLayer.children).forEach(function (child) {
      const pid = child.id.replace('token_', '');
      if (!activeIds.has(pid)) {
        child.remove();
      }
    });
  }

  function layoutAllTokensStatic(state) {
    if (!state) return;
    const groups = {};
    state.players.forEach(function (p) {
      if (p.bankrupt) return;
      const pos = ui.displayedPositions[p.id] !== undefined ? ui.displayedPositions[p.id] : p.position;
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(p.id);
    });

    Object.keys(groups).forEach(function (tileId) {
      const pids = groups[tileId];
      pids.forEach(function (pid, idx) {
        const el = document.getElementById('token_' + pid);
        if (!el) return;
        const pt = getTileCenterPx(Number(tileId), idx, pids.length);
        el.style.left = pt.x + 'px';
        el.style.top = pt.y + 'px';
      });
    });
  }

  function scheduleBuyButtonUnlock(delayMs) {
    ui.buyUnlockAt = Date.now() + (delayMs || 500);
    if (ui.buyUnlockTimer) clearTimeout(ui.buyUnlockTimer);
    ui.buyUnlockTimer = setTimeout(function () {
      ui.buyUnlockTimer = null;
      if (ui.state && ui.state.turnPhase === 'BUY_DECISION') {
        renderTurnHub(ui.state);
      }
    }, (delayMs || 500) + 30);
  }

  function animateMoveIfNeeded(state) {
    syncTokenElements(state);
    const mv = state.lastMove;
    if (!mv || mv.timestamp === ui.animatingMoveTs || !Array.isArray(mv.path) || mv.path.length < 2) {
      if (!ui.isAnimatingMove) {
        state.players.forEach(function (p) { ui.displayedPositions[p.id] = p.position; });
        layoutAllTokensStatic(state);
      }
      return;
    }

    ui.animatingMoveTs = mv.timestamp;
    const pid = mv.playerId;
    const tokenEl = document.getElementById('token_' + pid);
    if (!tokenEl) {
      ui.isAnimatingMove = false;
      state.players.forEach(function (p) { ui.displayedPositions[p.id] = p.position; });
      layoutAllTokensStatic(state);
      return;
    }

    ui.isAnimatingMove = true;
    const steps = mv.path.slice(1);
    let idx = 0;

    function nextHop() {
      if (idx >= steps.length) {
        tokenEl.classList.remove('hopping');
        ui.isAnimatingMove = false;
        if (ui.state) {
          ui.state.players.forEach(function (p) { ui.displayedPositions[p.id] = p.position; });
          layoutAllTokensStatic(ui.state);
          if (ui.state.turnPhase === 'BUY_DECISION') {
            scheduleBuyButtonUnlock(420);
          }
          renderTurnHub(ui.state);
        }
        return;
      }
      const nextTileId = steps[idx];
      ui.displayedPositions[pid] = nextTileId;
      const pt = getTileCenterPx(nextTileId, 0, 1);
      tokenEl.classList.add('hopping');
      tokenEl.style.left = pt.x + 'px';
      tokenEl.style.top = pt.y + 'px';
      AudioFX.step();
      idx += 1;
      setTimeout(nextHop, mv.directJump ? 220 : 120);
    }

    nextHop();
  }

  // ==================== Board Ownership Stamp & Buildings Rendering ====================
  function updateBoardTilesUI(state) {
    Object.keys(state.properties).forEach(function (tid) {
      const prop = state.properties[tid];
      const tileEl = els.boardGrid.querySelector('.board-tile[data-tile-id="' + tid + '"]');
      const stampEl = document.getElementById('tileStamp_' + tid);
      const houseSpan = document.getElementById('tileHouses_' + tid);
      if (!tileEl) return;

      tileEl.classList.toggle('is-mortgaged', Boolean(prop.mortgaged));

      const owner = prop.ownerId
        ? state.players.find(function (p) { return p.id === prop.ownerId; })
        : null;

      if (owner) {
        tileEl.classList.add('is-owned');
        tileEl.style.setProperty('--owner-color', owner.color);
        tileEl.style.setProperty('--owner-tint', hexToRgba(owner.color, 0.28));
        if (stampEl) {
          stampEl.classList.remove('hidden');
          stampEl.innerHTML = '<span class="owner-tile-dot" style="background:' + owner.color + ';box-shadow:0 0 6px ' + owner.color + '"></span>';
          stampEl.title = 'المالك: ' + owner.name;
        }
      } else {
        tileEl.classList.remove('is-owned');
        tileEl.style.removeProperty('--owner-color');
        tileEl.style.removeProperty('--owner-tint');
        if (stampEl) {
          stampEl.classList.add('hidden');
          stampEl.innerHTML = '';
        }
      }

      if (houseSpan) {
        let hText = '';
        if (prop.houses === 5) {
          hText = '🏨';
        } else if (prop.houses > 1) {
          hText = '🏠x' + prop.houses;
        } else if (prop.houses === 1) {
          hText = '🏠';
        }
        houseSpan.textContent = hText;
        houseSpan.classList.toggle('has-buildings', prop.houses > 0);
      }
    });
  }

  // ==================== Turn Controls & Action Hub ====================
  function renderTurnHub(state) {
    const current = state.players[state.currentTurnIndex];
    const me = state.players.find(function (p) { return p.id === ui.myPlayerId; });
    const isMyTurn = Boolean(current && current.id === ui.myPlayerId && !current.bankrupt);
    const isHost = state.hostId === ui.myPlayerId;

    // Host Finish-by-Wealth option (available after turn 4)
    const canHostFinish = Boolean(isHost && state.status === 'PLAYING' && state.turnNumber >= 4);
    if (els.finishByWealthBtn) els.finishByWealthBtn.classList.toggle('hidden', !canHostFinish);
    if (els.hostFinishGameSideBtn) els.hostFinishGameSideBtn.classList.toggle('hidden', !canHostFinish);

    // Parking Pot
    if (state.settings.freeParkingPot) {
      els.parkingPotBadge.classList.remove('hidden');
      els.parkingPotBadge.textContent = '☕ خزينة الاستراحة: ' + formatMoney(state.parkingPot);
    } else {
      els.parkingPotBadge.classList.add('hidden');
    }

    // Drawn Card Banner
    if (state.lastCard && state.lastCard.card) {
      els.drawnCardBanner.classList.remove('hidden');
      const deckTitle = state.lastCard.deck === 'chance' ? '🎁 بطاقة مفاجأة (فرصة)' : '⚖️ حكم صندوق المحكمة';
      els.drawnCardBanner.innerHTML =
        '<strong>' + deckTitle + ' — ' + escapeHtml(state.lastCard.card.title) + '</strong>' +
        '<p>' + escapeHtml(state.lastCard.card.text) + '</p>';
      if (state.lastCard.timestamp !== ui.lastCardTs) {
        ui.lastCardTs = state.lastCard.timestamp;
        AudioFX.card();
      }
    } else {
      els.drawnCardBanner.classList.add('hidden');
    }

    // Mobile Top Summary
    if (me) {
      els.mobileMyAvatar.innerHTML = renderRichupAvatar(me, 'xs');
      els.mobileMyAvatar.style.background = 'transparent';
      els.mobileMyName.textContent = me.name;
      els.mobileMyCash.textContent = me.bankrupt ? 'خاسر / مفلس 🏳️' : formatSignedCash(me.cash);
      els.mobileMyCash.classList.toggle('is-negative-cash', Boolean(!me.bankrupt && me.cash < 0));
    }
    els.mobileTurnBadge.textContent = current
      ? (isMyTurn ? '🎯 دورك الآن!' : ('دور: ' + current.name))
      : 'انتهت المباراة';

    if (!current || state.status === 'FINISHED') {
      els.turnBanner.textContent = '🏆 انتهت المباراة!';
      els.actionButtonsContainer.innerHTML = '';
      return;
    }

    // Prevent ghost-click auto-purchase while token is hopping to destination tile
    if (ui.isAnimatingMove && isMyTurn && state.turnPhase === 'BUY_DECISION') {
      els.turnBanner.textContent = '🚶 جاري التحرك إلى الخانة الجديدة...';
      els.actionButtonsContainer.innerHTML = '';
      return;
    }

    if (!isMyTurn) {
      els.turnBanner.innerHTML =
        'الدور الآن عند <span style="color:' + current.color + '">' + current.icon + ' ' + escapeHtml(current.name) + '</span>' +
        (current.cash < 0 ? ' <small style="color:#f87171">(مديون: ' + formatSignedCash(current.cash) + ')</small>' : '') +
        (!current.connected ? ' <small style="color:#fca5a5">(منقطع الاتصال ⚠️)</small>' : '');

      let waitBtns = '';
      if (me && !me.bankrupt) {
        waitBtns += '<button class="btn btn-outline btn-sm" id="hubOpenTradeBtn" type="button">🤝 عرض مقايضة</button>';
      }
      if (isHost && !current.connected && !current.isBot) {
        waitBtns +=
          '<button class="btn btn-danger btn-sm" id="forceDisconnectBankruptBtn" type="button">' +
          'استبعاد اللاعب المنقطع 🏳️' +
          '</button>';
      }
      els.actionButtonsContainer.innerHTML = waitBtns;
      bindHubDynamicButtons(state);
      return;
    }

    // Track new BUY_DECISION prompt to apply a brief safety lock against accidental double-taps
    const buyKey = state.turnPhase === 'BUY_DECISION'
      ? (state.turnNumber + ':' + state.pendingPurchaseTileId + ':' + (state.lastRoll ? state.lastRoll.timestamp : 0))
      : null;
    if (buyKey && buyKey !== ui.lastPendingBuyKey) {
      ui.lastPendingBuyKey = buyKey;
      scheduleBuyButtonUnlock(500);
    } else if (!buyKey) {
      ui.lastPendingBuyKey = null;
    }

    // It IS my turn!
    const phase = state.turnPhase;
    let html = '';

    if (phase === 'PRE_ROLL') {
      if (current.inJail) {
        els.turnBanner.textContent = '🔒 أنت في السجن (المحاولة ' + (current.jailTurns + 1) + ' من 3)';
        html += '<button class="btn btn-gold" id="hubRollBtn" type="button">🎲 ارمِ النرد لمحاولة الدبل</button>';
        if (current.cash >= GAME_CONFIG.JAIL_BAIL) {
          html += '<button class="btn btn-emerald btn-sm" id="hubPayBailBtn" type="button">🔓 دفع الكفالة (500 ج.م)</button>';
        }
        if (current.jailFreeCards > 0) {
          html += '<button class="btn btn-outline btn-sm" id="hubUseCardBtn" type="button">🕊️ استخدام بطاقة عفو</button>';
        }
      } else {
        els.turnBanner.textContent = state.doublesCount > 0
          ? '🎯 رمية إضافية بسبب الدبل! ارمِ النرد مرة أخرى'
          : '🎲 دورك الآن يا ' + current.name + '! ارمِ النرد للتحرك';
        html += '<button class="btn btn-gold btn-lg" id="hubRollBtn" type="button">🎲 ارمِ النرد الآن</button>';
        html += '<button class="btn btn-outline btn-sm" id="hubOpenTradeBtn" type="button">🤝 مقايضة</button>';
      }
    } else if (phase === 'BUY_DECISION' && state.pendingPurchaseTileId !== null) {
      const tile = BOARD_TILES[state.pendingPurchaseTileId];
      const canAfford = current.cash >= tile.price;
      const buyLocked = Date.now() < ui.buyUnlockAt;
      els.turnBanner.textContent = '🏛️ هل ترغب في شراء "' + tile.name + '"؟';
      html +=
        '<div class="buy-prompt-box">' +
        '<strong>' + tile.icon + ' ' + escapeHtml(tile.name) + '</strong> — السعر: <strong>' + formatMoney(tile.price) + '</strong>' +
        (!canAfford ? '<div style="color:#fca5a5;margin-top:3px">رصيدك غير كافٍ للشراء (يمكنك رهن محافظة أو تخطي الشراء)</div>' : '') +
        '</div>' +
        '<button class="btn btn-emerald" id="hubBuyBtn" type="button" ' + ((!canAfford || buyLocked) ? 'disabled' : '') + '>' +
        '🏛️ شراء (' + formatMoney(tile.price) + ')' +
        '</button>' +
        '<button class="btn btn-outline" id="hubSkipBuyBtn" type="button" ' + (buyLocked ? 'disabled' : '') + '>تخطي الشراء</button>' +
        '<button class="btn btn-outline btn-sm" data-inspect-tile="' + tile.id + '" type="button">📄 العقد</button>';
    } else if (phase === 'DEBT_RESOLUTION' || (phase === 'END_TURN' && current.cash < 0)) {
      const shortfall = Math.abs(current.cash);
      els.turnBanner.textContent = '🚨 رصيدك بالسالب! سدد المديونية قبل نهاية الدور';
      html +=
        '<div class="debt-prompt-box">' +
        'رصيدك الحالي: <strong style="direction:ltr;display:inline-block">' + formatSignedCash(current.cash) + '</strong>' +
        (current.debtReason ? ' (' + escapeHtml(current.debtReason) + ')' : '') +
        '<br/>ارهن محافظة أو بع منزلاً أو قايض الآن لاسترداد ' + formatMoney(shortfall) + ' قبل إنهاء الدور وإلا ستخسر!' +
        '</div>' +
        '<button class="btn btn-gold btn-sm" id="hubManagePropsBtn" type="button">🏛️ بيع مبانٍ / رهن محافظات</button>' +
        '<button class="btn btn-emerald btn-sm" id="hubOpenTradeBtn" type="button">🤝 صفقة مقايضة للإنقاذ</button>' +
        '<button class="btn btn-danger btn-sm" id="hubEndTurnBtn" type="button">🏳️ إنهاء الدور (إعلان الخسارة)</button>';
    } else if (phase === 'END_TURN') {
      els.turnBanner.textContent = '✅ اكتملت حركتك — يمكنك البناء أو المقايضة أو إنهاء دورك';
      html +=
        '<button class="btn btn-gold btn-lg" id="hubEndTurnBtn" type="button">⏭️ إنهاء الدور</button>' +
        '<button class="btn btn-outline btn-sm" id="hubManagePropsBtn" type="button">🏗️ إدارة وبناء</button>' +
        '<button class="btn btn-outline btn-sm" id="hubOpenTradeBtn" type="button">🤝 مقايضة</button>';
    }

    els.actionButtonsContainer.innerHTML = html;
    bindHubDynamicButtons(state);
  }

  function bindHubDynamicButtons(state) {
    const on = function (id, handler) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    };

    on('hubRollBtn', function () {
      dispatchGameAction({ type: 'ROLL_DICE' });
    });
    on('hubPayBailBtn', function () {
      dispatchGameAction({ type: 'PAY_BAIL' });
    });
    on('hubUseCardBtn', function () {
      dispatchGameAction({ type: 'USE_JAIL_CARD' });
    });
    on('hubBuyBtn', function () {
      if (Date.now() < ui.buyUnlockAt || ui.isAnimatingMove) return;
      dispatchGameAction({ type: 'BUY_PROPERTY' }).then(function (r) {
        if (r && r.ok) AudioFX.buy();
      });
    });
    on('hubSkipBuyBtn', function () {
      if (Date.now() < ui.buyUnlockAt || ui.isAnimatingMove) return;
      dispatchGameAction({ type: 'SKIP_PURCHASE' });
    });
    on('hubEndTurnBtn', function () {
      const cur = state.players[state.currentTurnIndex];
      if (cur && cur.id === ui.myPlayerId && cur.cash < 0 && cur.liquidatable <= 0) {
        if (!window.confirm('رصيدك بالسالب (' + formatSignedCash(cur.cash) + ') ولا تملك عقارات لرهنها. هل تؤكد إنهاء دورك وإعلان الخسارة؟')) {
          return;
        }
      }
      dispatchGameAction({ type: 'END_TURN' }).then(function (res) {
        if (res && res.needsLossConfirm) {
          const confirmGiveUp = window.confirm(
            res.error + '\n\nاضغط "إلغاء" للبقاء في دورك ورهن أملاكك أو المقايضة، أو "موافق" لإعلان إفلاسك وخسارتك الآن.'
          );
          if (confirmGiveUp) {
            dispatchGameAction({ type: 'END_TURN', confirmLoss: true });
          } else {
            switchToAssetsView();
          }
        }
      });
    });
    on('hubSettleDebtBtn', function () {
      dispatchGameAction({ type: 'SETTLE_DEBT' }).then(function (r) {
        if (r && r.ok) AudioFX.buy();
      });
    });
    on('forceDisconnectBankruptBtn', function () {
      const cur = state.players[state.currentTurnIndex];
      if (cur && window.confirm('هل تريد استبعاد اللاعب المنقطع "' + cur.name + '" لاستكمال المباراة؟')) {
        dispatchGameAction({ type: 'BANKRUPT', targetId: cur.id });
      }
    });
    on('hubOpenTradeBtn', function () { openTradeModal(); });
    on('hubManagePropsBtn', function () { switchToAssetsView(); });

    els.actionButtonsContainer.querySelectorAll('[data-inspect-tile]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openTileModal(Number(btn.dataset.inspectTile));
      });
    });
  }

  // ==================== Side Panels: Players & Assets ====================
  function renderPlayersPanel(state) {
    const current = state.players[state.currentTurnIndex];

    els.playersList.innerHTML = state.players.map(function (p) {
      const isTurn = current && current.id === p.id && !p.bankrupt;
      const ownedIds = Object.keys(state.properties).filter(function (tid) {
        return state.properties[tid].ownerId === p.id;
      });

      const badges = [];
      if (p.id === ui.myPlayerId) badges.push('<span class="mini-tag">أنت</span>');
      if (isTurn) badges.push('<span class="mini-tag turn">🎯 دوره الآن</span>');
      if (!p.bankrupt && p.cash < 0) badges.push('<span class="mini-tag debt">🚨 مديون بالسالب</span>');
      if (p.inJail) badges.push('<span class="mini-tag jail">🔒 في السجن</span>');
      if (p.jailFreeCards > 0) badges.push('<span class="mini-tag">🕊️ بطاقة عفو ×' + p.jailFreeCards + '</span>');
      if (p.bankrupt) badges.push('<span class="mini-tag jail">💥 خسر (مفلس)</span>');
      if (!p.connected) badges.push('<span class="mini-tag jail">⚠️ غير متصل</span>');

      const dotsHtml = ownedIds.map(function (tid) {
        const tile = BOARD_TILES[Number(tid)];
        const prop = state.properties[tid];
        const bg = tile.group ? COLOR_GROUPS[tile.group].color : (tile.type === 'station' ? '#475569' : '#0f766e');
        const txtColor = (tile.group && COLOR_GROUPS[tile.group].textColor) ? COLOR_GROUPS[tile.group].textColor : '#ffffff';
        const bldg = prop.houses === 5 ? ' 🏨' : (prop.houses > 0 ? ' 🏠' + prop.houses : '');
        const mort = prop.mortgaged ? ' (رهن)' : '';
        return (
          '<span class="prop-dot" data-tile-jump="' + tile.id + '" style="background:' + bg + ';color:' + txtColor + '">' +
          tile.icon + ' ' + escapeHtml(tile.shortName || tile.name) + bldg + mort +
          '</span>'
        );
      }).join('');

      const canTradeWith = !p.bankrupt && p.id !== ui.myPlayerId && state.players.some(function (me) {
        return me.id === ui.myPlayerId && !me.bankrupt;
      });

      const cashClass = (!p.bankrupt && p.cash < 0) ? 'pc-cash is-negative-cash' : 'pc-cash';

      return (
        '<div class="player-card ' + (isTurn ? 'active-turn ' : '') + (p.bankrupt ? 'is-bankrupt' : '') + '">' +
        '<div class="pc-top">' +
        '<div class="pc-ident">' +
        renderRichupAvatar(p, 'sm') +
        '<div>' +
        '<div class="pc-name" id="pcName_' + p.id + '">' + escapeHtml(p.name) + '</div>' +
        '<small style="color:#94a3b8;font-size:0.74rem">صافي الثروة: ' + formatSignedCash(p.netWorth) + '</small>' +
        '</div>' +
        '</div>' +
        '<div id="pcCash_' + p.id + '" class="' + cashClass + '" style="direction:ltr">' +
        (p.bankrupt ? 'خسر 🏳️' : formatSignedCash(p.cash)) +
        '</div>' +
        '</div>' +
        '<div class="pc-badges">' + badges.join('') + '</div>' +
        (dotsHtml ? '<div class="pc-props-dots">' + dotsHtml + '</div>' : '') +
        (canTradeWith
          ? '<div class="pc-actions"><button class="btn btn-outline btn-xs full-width" data-trade-target="' + p.id + '" type="button">🤝 مقايضة مع ' + escapeHtml(p.name) + '</button></div>'
          : '') +
        '</div>'
      );
    }).join('');

    if (els.underBoardPlayers) {
      els.underBoardPlayers.innerHTML = state.players.map(function (p) {
        const isTurn = current && current.id === p.id && !p.bankrupt;
        const isHost = p.id === state.hostId;
        const isMe = p.id === ui.myPlayerId;
        const cashClass = (!p.bankrupt && p.cash < 0) ? 'under-player-cash negative' : 'under-player-cash';
        const cashText = p.bankrupt ? 'خسر 🏳️' : formatSignedCash(p.cash);

        return (
          '<div class="under-player-card ' + (isTurn ? 'active-turn ' : '') + (p.bankrupt ? 'is-bankrupt' : '') + '" id="underPlayerCard_' + p.id + '">' +
          '<div class="under-player-left">' +
          renderRichupAvatar(p, 'sm') +
          '<div class="under-player-info">' +
          '<div class="under-player-name" id="underPlayerName_' + p.id + '">' +
          escapeHtml(p.name) +
          (isHost ? ' 👑' : '') +
          (isMe ? ' <span class="me-pill">أنت</span>' : '') +
          '</div>' +
          (isTurn ? '<div class="under-player-status turn">🎯 دوره الآن</div>' : '') +
          (p.inJail ? '<div class="under-player-status jail">⛓️ في السجن</div>' : '') +
          '</div>' +
          '</div>' +
          '<div class="' + cashClass + '" id="underPlayerCash_' + p.id + '" style="direction:ltr">' + cashText + '</div>' +
          '</div>'
        );
      }).join('');
    }
  }

  function renderMyAssetsPanel(state) {
    const myPropIds = Object.keys(state.properties)
      .map(Number)
      .filter(function (tid) { return state.properties[tid].ownerId === ui.myPlayerId; });

    els.myAssetsCount.textContent = String(myPropIds.length);

    if (myPropIds.length === 0) {
      els.myAssetsList.innerHTML =
        '<div style="text-align:center;color:#94a3b8;padding:24px 10px;font-size:0.9rem">' +
        'لا تملك أي محافظات أو مرافق بعد. ارمِ النرد واشترِ أول محافظة لك!' +
        '</div>';
    } else {
      const isMyTurn = state.players[state.currentTurnIndex] && state.players[state.currentTurnIndex].id === ui.myPlayerId;

      els.myAssetsList.innerHTML = myPropIds.map(function (tid) {
        const tile = BOARD_TILES[tid];
        const prop = state.properties[tid];
        const barColor = tile.group ? COLOR_GROUPS[tile.group].color : (tile.type === 'station' ? '#475569' : '#0f766e');
        const statusText = prop.mortgaged
          ? 'مرهون للبنك ⚠️'
          : (prop.houses === 5 ? 'فندق سياحي 🏨' : (prop.houses > 0 ? ('منازل: ' + prop.houses + ' 🏠') : 'أرض فضاء'));

        const baseRentInfo = tile.rent
          ? ('الإيجار الحالي: ' + formatMoney(prop.houses > 0 ? tile.rent[prop.houses] : tile.rent[0]))
          : ('السعر: ' + formatMoney(tile.price));

        let btns = '<button class="btn btn-outline btn-sm" data-tile-jump="' + tid + '" type="button">📄 تفاصيل العقد</button>';

        if (tile.type === 'property' && isMyTurn && !prop.mortgaged && prop.houses < 5) {
          btns += '<button class="btn btn-emerald btn-sm" data-build-tile="' + tid + '" type="button">+ بناء (' + tile.houseCost + ')</button>';
        }
        if (tile.type === 'property' && prop.houses > 0) {
          btns += '<button class="btn btn-danger-outline btn-sm" data-sell-tile="' + tid + '" type="button">- بيع مبنى (+' + Math.floor(tile.houseCost / 2) + ')</button>';
        }
        if (!prop.mortgaged && prop.houses === 0) {
          const mortVal = Math.floor(tile.price / 2);
          btns += '<button class="btn btn-outline btn-sm" data-mort-tile="' + tid + '" type="button">رهن (+' + mortVal + ')</button>';
        } else if (prop.mortgaged) {
          const unmortCost = Math.ceil((tile.price / 2) * 1.1);
          btns += '<button class="btn btn-gold btn-sm" data-unmort-tile="' + tid + '" type="button">فك رهن (-' + unmortCost + ')</button>';
        }

        return (
          '<div class="asset-item">' +
          '<div class="asset-bar" style="background:' + barColor + '"></div>' +
          '<div class="asset-content">' +
          '<div class="asset-head" data-tile-jump="' + tid + '">' +
          '<span>' + tile.icon + ' ' + escapeHtml(tile.name) + '</span>' +
          '<span style="color:#ffd166;font-size:0.82rem">' + statusText + '</span>' +
          '</div>' +
          '<div class="asset-sub">' + escapeHtml(baseRentInfo) + (tile.subtitle ? ' • ' + escapeHtml(tile.subtitle) : '') + '</div>' +
          '<div class="asset-btns">' + btns + '</div>' +
          '</div>' +
          '</div>'
        );
      }).join('');
    }

    if (els.underPropsList) {
      if (els.underPropsCount) els.underPropsCount.textContent = String(myPropIds.length);
      if (myPropIds.length === 0) {
        els.underPropsList.innerHTML =
          '<div style="text-align:center;color:#94a3b8;padding:12px;font-size:0.84rem">' +
          'لا تملك أي مدن بعد. ارمِ النرد واشترِ أول مدينة لك!' +
          '</div>';
      } else {
        els.underPropsList.innerHTML = myPropIds.map(function (tid) {
          const tile = BOARD_TILES[tid];
          const prop = state.properties[tid];
          const barColor = tile.group ? COLOR_GROUPS[tile.group].color : (tile.type === 'station' ? '#38bdf8' : '#0f766e');
          let houseBadge = '';
          if (prop.houses === 5) {
            houseBadge = '🏢 فندق';
          } else if (prop.houses > 0) {
            houseBadge = '🏠 × ' + prop.houses;
          } else if (prop.mortgaged) {
            houseBadge = '⚠️ مرهون';
          } else {
            houseBadge = 'أرض فضاء';
          }

          return (
            '<div class="under-prop-row" data-tile-jump="' + tid + '" style="--prop-bar-color:' + barColor + '">' +
            '<div class="under-prop-ident">' +
            '<span class="under-prop-flag">' + (tile.flag || tile.icon || '📍') + '</span>' +
            '<span>' + escapeHtml(tile.name) + '</span>' +
            '</div>' +
            '<div class="under-prop-status">' + houseBadge + '</div>' +
            '</div>'
          );
        }).join('');

        els.underPropsList.querySelectorAll('.under-prop-row').forEach(function (row) {
          row.addEventListener('click', function () {
            openTileModal(Number(row.dataset.tileJump));
          });
        });
      }
    }
  }

  // ==================== Active Trades, Counter-Offers, Logs & Chat ====================
  function describeTradeSide(side) {
    const parts = [];
    if (side.cash > 0) parts.push(formatMoney(side.cash));
    if (side.jailCards > 0) parts.push('بطاقة عفو ×' + side.jailCards);
    if (Array.isArray(side.properties) && side.properties.length > 0) {
      side.properties.forEach(function (tid) {
        const t = BOARD_TILES[tid];
        if (t) parts.push(t.icon + ' ' + t.name);
      });
    }
    return parts.length > 0 ? parts.join(' + ') : 'بدون مقابل';
  }

  function renderActiveTrades(state) {
    const myTrades = (state.trades || []).filter(function (tr) {
      return tr.toId === ui.myPlayerId || tr.fromId === ui.myPlayerId;
    });

    // Sound & Toast alert on new incoming or modified trade
    myTrades.forEach(function (tr) {
      if (!ui.knownTradeIds.has(tr.id)) {
        ui.knownTradeIds.add(tr.id);
        if (tr.toId === ui.myPlayerId) {
          AudioFX.trade();
          const sender = state.players.find(function (p) { return p.id === tr.fromId; });
          const msgPrefix = tr.isCounter ? '✏️ عدّل ' : '🤝 أرسل ';
          showToast(msgPrefix + (sender ? sender.name : 'لاعب') + ' عرض صفقة إليك!', 'success');
        }
      }
    });

    const incomingTrades = myTrades.filter(function (t) { return t.toId === ui.myPlayerId; });
    if (els.mobTradeBadge) {
      els.mobTradeBadge.classList.toggle('hidden', incomingTrades.length === 0);
    }

    // Prominent on-screen banner for incoming trades (visible on both mobile & desktop)
    if (els.incomingTradeBanner) {
      if (incomingTrades.length > 0) {
        const tr = incomingTrades[0];
        const fromP = state.players.find(function (p) { return p.id === tr.fromId; });
        els.incomingTradeBanner.classList.remove('hidden');
        els.incomingTradeBanner.innerHTML =
          '<div class="itb-info">' +
          '<strong>' + (tr.isCounter ? '✏️ صفقة معدّلة من ' : '🤝 عرض صفقة من ') + escapeHtml(fromP ? fromP.name : 'لاعب') + ':</strong> ' +
          'يعطيك (' + escapeHtml(describeTradeSide(tr.offer)) + ') مقابل (' + escapeHtml(describeTradeSide(tr.request)) + ')' +
          (tr.note ? ' — <em>"' + escapeHtml(tr.note) + '"</em>' : '') +
          '</div>' +
          '<div class="itb-actions">' +
          '<button class="btn btn-emerald btn-xs" data-accept-trade="' + tr.id + '" type="button">✅ موافقة</button>' +
          '<button class="btn btn-purple btn-xs" data-counter-trade="' + tr.id + '" type="button">✏️ تعديل الصفقة</button>' +
          '<button class="btn btn-danger-outline btn-xs" data-reject-trade="' + tr.id + '" type="button">✕ رفض</button>' +
          '</div>';
      } else {
        els.incomingTradeBanner.classList.add('hidden');
        els.incomingTradeBanner.innerHTML = '';
      }
    }

    if (myTrades.length === 0) {
      els.activeTradesBox.classList.add('hidden');
      els.activeTradesBox.innerHTML = '';
      return;
    }

    els.activeTradesBox.classList.remove('hidden');
    els.activeTradesBox.innerHTML = myTrades.map(function (tr) {
      const fromP = state.players.find(function (p) { return p.id === tr.fromId; });
      const toP = state.players.find(function (p) { return p.id === tr.toId; });
      const isIncoming = tr.toId === ui.myPlayerId;

      return (
        '<div class="trade-offer-card">' +
        '<div style="font-weight:800;color:#ffd166;margin-bottom:4px">' +
        (isIncoming
          ? ((tr.isCounter ? '✏️ عرض معدّل من ' : '🤝 عرض وارد من ') + escapeHtml(fromP ? fromP.name : ''))
          : ('⏳ عرض مرسل إلى ' + escapeHtml(toP ? toP.name : ''))) +
        '</div>' +
        '<div><strong>يعرض:</strong> ' + escapeHtml(describeTradeSide(tr.offer)) + '</div>' +
        '<div><strong>يطلب:</strong> ' + escapeHtml(describeTradeSide(tr.request)) + '</div>' +
        (tr.note ? '<div style="color:#cbd5e1;margin-top:3px;font-style:italic">💬 "' + escapeHtml(tr.note) + '"</div>' : '') +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' +
        (isIncoming
          ? '<button class="btn btn-emerald btn-xs" data-accept-trade="' + tr.id + '" type="button">✅ موافقة</button>' +
          '<button class="btn btn-purple btn-xs" data-counter-trade="' + tr.id + '" type="button">✏️ تعديل الصفقة</button>' +
          '<button class="btn btn-danger-outline btn-xs" data-reject-trade="' + tr.id + '" type="button">✕ رفض</button>'
          : '<button class="btn btn-danger-outline btn-xs" data-cancel-trade="' + tr.id + '" type="button">إلغاء العرض</button>') +
        '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderLogsAndChat(state) {
    if (state.logs && state.logs.length > 0) {
      const newest = state.logs[0];
      if (ui.lastLogId && newest.id !== ui.lastLogId) {
        if (newest.type === 'rent') AudioFX.rent();
        else if (newest.type === 'jail' || newest.type === 'bankrupt') AudioFX.jail();
      }
      ui.lastLogId = newest.id;
    }

    if (els.eventLogs) {
      const logs = state.logs || [];
      if (logs.length === 0) {
        els.eventLogs.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:24px 10px;font-size:0.86rem">لا توجد أحداث مسجلة بعد. ستبدأ التسجيلات فور رمي النرد! 📜</div>';
      } else {
        els.eventLogs.innerHTML = logs.map(function (lg) {
          const typeClass = lg.type ? escapeHtml(lg.type) : 'info';
          return '<div class="log-entry ' + typeClass + '">' + escapeHtml(lg.text) + '</div>';
        }).join('');
      }
    }

    if (els.centerLiveFeed) {
      const recent = (state.logs || []).slice(0, 8);
      if (recent.length === 0) {
        els.centerLiveFeed.innerHTML = '<div class="feed-entry" style="color:#94a3b8">📜 تبدأ الأحداث مع أول حركة على الرقعة...</div>';
      } else {
        els.centerLiveFeed.innerHTML = recent.map(function (lg) {
          const typeClass = lg.type ? (' feed-' + escapeHtml(lg.type)) : '';
          return '<div class="feed-entry' + typeClass + '">' + escapeHtml(lg.text) + '</div>';
        }).join('');
      }
    }

    const chatArr = state.chat || [];
    if (chatArr.length > ui.lastChatCount) {
      const added = chatArr.length - ui.lastChatCount;
      const latestMsg = chatArr[chatArr.length - 1];
      if (ui.lastChatCount > 0 && latestMsg && latestMsg.senderId !== ui.myPlayerId) {
        AudioFX.click();
        if (ui.activeLeftTab !== 'chat' || (window.innerWidth <= 1040 && ui.activeMobileView !== 'social' && ui.activeMobileView !== 'chat')) {
          ui.unreadChat += added;
        }
      }
      ui.lastChatCount = chatArr.length;
    }

    if (els.unreadChatBadge) {
      els.unreadChatBadge.textContent = String(ui.unreadChat);
      els.unreadChatBadge.classList.toggle('hidden', ui.unreadChat === 0);
    }
    if (els.mobChatBadge) {
      els.mobChatBadge.textContent = String(ui.unreadChat);
      els.mobChatBadge.classList.toggle('hidden', ui.unreadChat === 0);
    }
    if (els.floatingChatBadge) {
      els.floatingChatBadge.textContent = String(ui.unreadChat);
      els.floatingChatBadge.classList.toggle('hidden', ui.unreadChat === 0);
    }

    if (els.chatMessages) {
      els.chatMessages.innerHTML = chatArr.length === 0
        ? '<div style="text-align:center;color:#94a3b8;padding:18px;font-size:0.8rem">ابدأ الدردشة مع أصدقائك في الغرفة! 💬</div>'
        : chatArr.map(function (m) {
          const mine = m.senderId === ui.myPlayerId;
          return (
            '<div class="chat-bubble ' + (mine ? 'mine' : '') + '">' +
            '<div class="chat-sender" style="color:' + m.senderColor + '">' +
            m.senderIcon + ' ' + escapeHtml(m.senderName) +
            '</div>' +
            '<div>' + escapeHtml(m.text) + '</div>' +
            '</div>'
          );
        }).join('');
      els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    }
  }

  // ==================== Property Deed Modal (Enlarged & Mobile-Friendly) ====================
  function openTileModal(tileId) {
    const tile = BOARD_TILES[tileId];
    if (!tile) return;
    ui.openTileModalId = tileId;

    const state = ui.state;
    const prop = state && state.properties ? state.properties[tileId] : null;
    const owner = (prop && prop.ownerId && state)
      ? state.players.find(function (p) { return p.id === prop.ownerId; })
      : null;

    let headerBg = '#1e293b';
    let headerColor = '#ffffff';
    let groupLabel = 'خانة خاصة';

    if (tile.type === 'property' && COLOR_GROUPS[tile.group]) {
      headerBg = COLOR_GROUPS[tile.group].color;
      headerColor = COLOR_GROUPS[tile.group].textColor;
      groupLabel = 'مجموعة ' + COLOR_GROUPS[tile.group].name;
    } else if (tile.type === 'station') {
      headerBg = '#334155';
      groupLabel = 'مرفق نقل ومواصلات';
    } else if (tile.type === 'utility') {
      headerBg = '#0f766e';
      groupLabel = 'مرفق خدمات عامة';
    }

    let emblemHtml = '';
    if (tile.type === 'property') {
      const flagSvg = getCountryFlagSvg(tile.group || tile.country);
      emblemHtml = flagSvg
        ? '<div class="deed-flag-wrap">' + flagSvg + '</div>'
        : '<span class="deed-emblem">' + (tile.flag || '🏛️') + '</span>';
    } else {
      emblemHtml = '<span class="deed-emblem">' + (tile.flag || tile.icon || '📍') + '</span>';
    }

    let bodyHtml =
      '<div class="deed-header" style="background:' + headerBg + ';color:' + headerColor + '">' +
      emblemHtml +
      '<div style="font-size:0.8rem;font-weight:800;opacity:0.92">' + escapeHtml(groupLabel) + '</div>' +
      '<h3>' + escapeHtml(tile.name) + '</h3>' +
      (tile.subtitle ? '<div style="font-size:0.86rem;opacity:0.95;margin-top:2px">' + escapeHtml(tile.subtitle) + '</div>' : '') +
      '</div>';

    if (isPurchasable(tile)) {
      bodyHtml +=
        '<div class="deed-owner-pill">' +
        '<span>سعر الشراء: <strong>' + formatMoney(tile.price) + '</strong></span>' +
        '<span>المالك: <strong style="color:' + (owner ? owner.color : '#94a3b8') + '">' +
        (owner ? (renderRichupAvatar(owner, 'xs') + ' ' + escapeHtml(owner.name)) : 'البنك (متاح للشراء)') +
        '</strong></span>' +
        '</div>';

      if (tile.type === 'property') {
        const curH = prop ? prop.houses : -1;
        bodyHtml +=
          '<table class="rent-table">' +
          '<tr class="' + (curH === 0 ? 'current-tier' : '') + '"><td>إيجار الأرض الفضاء</td><td>' + formatMoney(tile.rent[0]) + '</td></tr>' +
          '<tr><td>عند امتلاك المجموعة كاملة (احتكار ×2)</td><td>' + formatMoney(tile.rent[0] * 2) + '</td></tr>' +
          '<tr class="' + (curH === 1 ? 'current-tier' : '') + '"><td>مع منزل واحد 🏠</td><td>' + formatMoney(tile.rent[1]) + '</td></tr>' +
          '<tr class="' + (curH === 2 ? 'current-tier' : '') + '"><td>مع منزلين 🏠🏠</td><td>' + formatMoney(tile.rent[2]) + '</td></tr>' +
          '<tr class="' + (curH === 3 ? 'current-tier' : '') + '"><td>مع 3 منازل 🏠🏠🏠</td><td>' + formatMoney(tile.rent[3]) + '</td></tr>' +
          '<tr class="' + (curH === 4 ? 'current-tier' : '') + '"><td>مع 4 منازل 🏠🏠🏠🏠</td><td>' + formatMoney(tile.rent[4]) + '</td></tr>' +
          '<tr class="' + (curH === 5 ? 'current-tier' : '') + '"><td>مع فندق سياحي 🏨</td><td>' + formatMoney(tile.rent[5]) + '</td></tr>' +
          '</table>' +
          '<div style="font-size:0.84rem;color:#cbd5e1;display:flex;justify-content:space-between;padding:4px 2px">' +
          '<span>تكلفة البناء: <strong>' + formatMoney(tile.houseCost) + '</strong></span>' +
          '<span>قيمة الرهن: <strong>' + formatMoney(Math.floor(tile.price / 2)) + '</strong></span>' +
          '</div>';
      } else if (tile.type === 'station') {
        bodyHtml +=
          '<table class="rent-table">' +
          '<tr><td>امتلاك مطار واحد</td><td>25$</td></tr>' +
          '<tr><td>امتلاك مطارين</td><td>50$</td></tr>' +
          '<tr><td>امتلاك 3 مطارات</td><td>100$</td></tr>' +
          '<tr><td>امتلاك الـ 4 مطارات كاملة</td><td>200$</td></tr>' +
          '</table>';
      } else if (tile.type === 'utility') {
        bodyHtml +=
          '<p style="font-size:0.9rem;line-height:1.6;color:#e2e8f0;margin:10px 0">' + escapeHtml(tile.description) + '</p>';
      }

      if (state && prop && prop.ownerId === ui.myPlayerId) {
        const isMyTurn = state.players[state.currentTurnIndex] && state.players[state.currentTurnIndex].id === ui.myPlayerId;
        bodyHtml += '<div class="deed-controls">';
        if (tile.type === 'property' && !prop.mortgaged && prop.houses < 5) {
          bodyHtml +=
            '<button class="btn btn-emerald full-width" data-build-tile="' + tile.id + '" type="button" ' + (!isMyTurn ? 'disabled' : '') + '>' +
            (prop.houses === 4 ? '🏨 تشييد فندق سياحي' : '🏠 بناء منزل جديد') + ' (' + formatMoney(tile.houseCost) + ')' +
            '</button>';
        }
        if (tile.type === 'property' && prop.houses > 0) {
          bodyHtml +=
            '<button class="btn btn-danger-outline full-width" data-sell-tile="' + tile.id + '" type="button">' +
            'بيع مبنى واسترداد ' + formatMoney(Math.floor(tile.houseCost / 2)) +
            '</button>';
        }
        if (!prop.mortgaged && prop.houses === 0) {
          bodyHtml +=
            '<button class="btn btn-outline full-width" data-mort-tile="' + tile.id + '" type="button">' +
            'رهن العقار للبنك (+' + formatMoney(Math.floor(tile.price / 2)) + ')' +
            '</button>';
        } else if (prop.mortgaged) {
          const unmortCost = Math.ceil((tile.price / 2) * 1.1);
          bodyHtml +=
            '<button class="btn btn-gold full-width" data-unmort-tile="' + tile.id + '" type="button">' +
            'فك الرهن العقاري (-' + formatMoney(unmortCost) + ')' +
            '</button>';
        }
        bodyHtml += '</div>';
      } else if (state && owner && owner.id !== ui.myPlayerId && !owner.bankrupt) {
        bodyHtml +=
          '<div class="deed-controls">' +
          '<button class="btn btn-emerald full-width" data-trade-tile-owner="' + owner.id + '" data-trade-want-tile="' + tile.id + '" type="button">' +
          '🤝 اطلب شراء "' + escapeHtml(tile.name) + '" في صفقة مع ' + escapeHtml(owner.name) +
          '</button>' +
          '</div>';
      }
    } else {
      bodyHtml +=
        '<p style="font-size:0.95rem;line-height:1.65;color:#e2e8f0;padding:8px 0">' +
        escapeHtml(tile.description || tile.subtitle || '') +
        '</p>';
    }

    els.tileModalBody.innerHTML = bodyHtml;
    els.tileModal.classList.remove('hidden');
  }

  // ==================== Trade Modal (Visual Cards + Quick Cash + Counter-Offers) ====================
  function openTradeModal(optionsOrTargetId) {
    const state = ui.state;
    if (!state || state.status !== 'PLAYING') return;

    const opts = typeof optionsOrTargetId === 'string'
      ? { targetId: optionsOrTargetId }
      : (optionsOrTargetId || {});

    const others = state.players.filter(function (p) {
      return p.id !== ui.myPlayerId && !p.bankrupt;
    });
    if (others.length === 0) {
      showToast('لا يوجد لاعبون نشطون للمقايضة معهم.', 'error');
      return;
    }

    const counterTrade = opts.counterTrade || null;
    ui.editingCounterTradeId = counterTrade ? counterTrade.id : null;

    const preTargetId = counterTrade ? counterTrade.fromId : opts.targetId;
    els.tradeTargetSelect.innerHTML = others.map(function (p) {
      const sel = p.id === preTargetId ? 'selected' : '';
      return '<option value="' + p.id + '" ' + sel + '>' + p.icon + ' ' + escapeHtml(p.name) + ' (متاح: ' + formatMoney(Math.max(0, p.cash)) + ')</option>';
    }).join('');

    if (counterTrade) {
      const sender = state.players.find(function (p) { return p.id === counterTrade.fromId; });
      els.tradeModalTitle.textContent = '✏️ تعديل شروط الصفقة وإرسال عرض مضاد';
      els.tradeCounterHint.classList.remove('hidden');
      els.tradeCounterHint.textContent =
        'تقوم الآن بتعديل الصفقة الواردة من ' + (sender ? sender.name : 'اللاعب') +
        ' — غيّر المبالغ أو أضف/أزل المحافظات ثم أرسل التعديل إليه مباشرة!';
      els.submitTradeBtn.textContent = '✏️ إرسال الصفقة المعدّلة الآن';

      // Swap sides so "ما تقدمه أنت" starts with what they requested from me, and "ما تطلبه" starts with what they offered me
      els.tradeMyCash.value = String(counterTrade.request.cash || 0);
      els.tradeMyCards.value = String(counterTrade.request.jailCards || 0);
      els.tradeTheirCash.value = String(counterTrade.offer.cash || 0);
      els.tradeTheirCards.value = String(counterTrade.offer.jailCards || 0);
      if (els.tradeNoteInput) els.tradeNoteInput.value = '';

      populateTradePropertyChecklists(counterTrade.request.properties || [], counterTrade.offer.properties || []);
    } else {
      els.tradeModalTitle.textContent = '🤝 عرض مقايضة وتبادل محافظات';
      els.tradeCounterHint.classList.add('hidden');
      els.submitTradeBtn.textContent = '🤝 إرسال عرض المقايضة الآن';

      els.tradeMyCash.value = '0';
      els.tradeMyCards.value = '0';
      els.tradeTheirCash.value = '0';
      els.tradeTheirCards.value = '0';
      if (els.tradeNoteInput) els.tradeNoteInput.value = '';

      const preWantProps = opts.wantTileId !== undefined ? [Number(opts.wantTileId)] : [];
      populateTradePropertyChecklists([], preWantProps);
    }

    els.tradeModal.classList.remove('hidden');
  }

  function renderChecklistForOwner(ownerId, inputName, selectedIds) {
    const state = ui.state;
    const selectedSet = new Set((selectedIds || []).map(Number));
    const owned = Object.keys(state.properties)
      .map(Number)
      .filter(function (tid) {
        const pr = state.properties[tid];
        return pr.ownerId === ownerId && pr.houses === 0;
      });

    if (owned.length === 0) {
      return '<div style="font-size:0.8rem;color:#94a3b8;padding:8px;grid-column:1/-1">لا توجد محافظات متاحة للمقايضة (بدون مبانٍ).</div>';
    }

    return owned.map(function (tid) {
      const tile = BOARD_TILES[tid];
      const prop = state.properties[tid];
      const barColor = tile.group ? COLOR_GROUPS[tile.group].color : (tile.type === 'station' ? '#64748b' : '#14b8a6');
      const isChecked = selectedSet.has(tid);
      return (
        '<label class="trade-prop-card' + (isChecked ? ' checked' : '') + '">' +
        '<input type="checkbox" name="' + inputName + '" value="' + tid + '" ' + (isChecked ? 'checked' : '') + ' />' +
        '<span class="tpc-bar" style="background:' + barColor + '"></span>' +
        '<span class="tpc-title">' + (tile.flag || tile.icon) + ' ' + escapeHtml(tile.name) + '</span>' +
        '<span class="tpc-price">' + formatMoney(tile.price) + (prop.mortgaged ? ' • مرهون' : '') + '</span>' +
        '</label>'
      );
    }).join('');
  }

  function updateTradeCashHints() {
    if (!ui.state) return;
    const me = ui.state.players.find(function (p) { return p.id === ui.myPlayerId; });
    const target = ui.state.players.find(function (p) { return p.id === els.tradeTargetSelect.value; });
    if (els.tradeMyMaxCashHint && me) {
      els.tradeMyMaxCashHint.textContent = 'متاح لديك: ' + formatMoney(Math.max(0, me.cash));
    }
    if (els.tradeTheirMaxCashHint && target) {
      els.tradeTheirMaxCashHint.textContent = 'متاح لديه: ' + formatMoney(Math.max(0, target.cash));
    }
  }

  function populateTradePropertyChecklists(myPreselected, theirPreselected) {
    if (!ui.state) return;
    const targetId = els.tradeTargetSelect.value;
    els.tradeMyProps.innerHTML = renderChecklistForOwner(ui.myPlayerId, 'myTradeProp', myPreselected);
    els.tradeTheirProps.innerHTML = renderChecklistForOwner(targetId, 'theirTradeProp', theirPreselected);
    updateTradeCashHints();
  }

  // ==================== Winner & Standings Screen ====================
  function renderWinnerModalIfFinished(state) {
    if (state.status !== 'FINISHED' || !state.winnerId) {
      els.winnerModal.classList.add('hidden');
      return;
    }
    const winner = state.players.find(function (p) { return p.id === state.winnerId; });
    const wasHidden = els.winnerModal.classList.contains('hidden');
    els.winnerTitle.textContent = winner
      ? ('🎉 الفائز: ' + winner.icon + ' ' + winner.name + '!')
      : 'انتهت المباراة!';
    els.winnerSubtitle.textContent = state.finishReason === 'WEALTH'
      ? 'حُسمت المباراة بأعلى صافي ثروة وعقارات في محافظات مصر!'
      : 'صمد للنهاية بعد إفلاس وخسارة جميع المنافسين وحقق لقب إمبراطور بنك الحظ!';

    const sorted = state.players.slice().sort(function (a, b) {
      if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
      return b.netWorth - a.netWorth;
    });
    els.winnerStandings.innerHTML = sorted.map(function (p, i) {
      const isWin = p.id === state.winnerId;
      return (
        '<div class="lobby-seat" style="' + (isWin ? 'border-color:#ffd166;background:rgba(245,185,66,0.14)' : '') + '">' +
        '<div class="seat-left">' +
        '<strong>' + (isWin ? '🏆 #1' : ('#' + (i + 1))) + '</strong>' +
        '<div class="seat-avatar" style="background:' + p.color + '">' + p.icon + '</div>' +
        '<div class="seat-meta">' +
        '<strong>' + escapeHtml(p.name) + '</strong>' +
        '<small>' + (isWin ? 'فائز بالمركز الأول' : (p.bankrupt ? 'خسر بإعلان الإفلاس' : 'نشط')) + '</small>' +
        '</div>' +
        '</div>' +
        '<strong style="color:' + (p.bankrupt ? '#f87171' : '#ffd166') + '">' +
        (p.bankrupt ? 'خاسر 🏳️' : formatSignedCash(p.netWorth)) +
        '</strong>' +
        '</div>'
      );
    }).join('');

    els.winnerModal.classList.remove('hidden');
    clearSession(state.code);
    if (els.resumeGameBox) els.resumeGameBox.classList.add('hidden');
    if (wasHidden) {
      AudioFX.win();
      if (Ads) Ads.refresh(els.winnerModal);
    }
  }

  // ==================== Master State Receiver ====================
  function handleRoomState(state) {
    if (!state) return;
    const prevTurnPlayer = ui.state && ui.state.players ? ui.state.players[ui.state.currentTurnIndex] : null;
    ui.state = state;
    ui.roomCode = state.code;
    els.headerRoomCode.textContent = state.code;

    // فحص حالة اللاعب في الغرفة: حفظ البيانات في حالة اللعب النشط فقط، ومسحها فوراً عند انتهاء الجيم أو الاستبعاد
    const me = state.players ? state.players.find(function (p) { return p.id === ui.myPlayerId; }) : null;
    if (state.status === 'FINISHED') {
      clearSession(state.code);
      if (els.resumeGameBox) els.resumeGameBox.classList.add('hidden');
    } else if (me && me.bankrupt) {
      clearSession(state.code);
      if (els.resumeGameBox) els.resumeGameBox.classList.add('hidden');
    } else if (ui.myPlayerId && state.players && state.players.length > 0 && !me && state.status !== 'LOBBY') {
      clearSession(state.code);
      if (els.resumeGameBox) els.resumeGameBox.classList.add('hidden');
      showToast('تم استبعادك من المباراة أو إغلاقها.', 'info');
      exitToHome();
      return;
    } else if (me && !me.bankrupt && state.status === 'PLAYING') {
      const saved = loadSession(state.code);
      saveSession(state.code, ui.myPlayerId, saved ? saved.sessionToken : null, {
        playerName: me.name,
        avatarId: me.avatarId || ui.selectedAvatarId
      });
    }

    if (state.status === 'LOBBY') {
      ui.cashInitialized = false;
      setScreen('lobby');
      renderLobby(state);
      return;
    }

    setScreen('game');

    // Alert when a player loses / is eliminated at end of turn
    if (state.lastEliminated && state.lastEliminated.timestamp !== ui.lastEliminatedTs) {
      const wasInit = ui.lastEliminatedTs !== 0;
      ui.lastEliminatedTs = state.lastEliminated.timestamp;
      if (wasInit) {
        const elim = state.lastEliminated;
        showToast(
          '💥 خسر اللاعب "' + elim.playerName + '" وأُعلن إفلاسه' +
          (elim.creditorName ? (' لصالح ' + elim.creditorName) : '') + '!',
          'error'
        );
      }
    }

    const newTurnPlayer = state.players[state.currentTurnIndex];
    if (
      newTurnPlayer &&
      newTurnPlayer.id === ui.myPlayerId &&
      (!prevTurnPlayer || prevTurnPlayer.id !== ui.myPlayerId)
    ) {
      AudioFX.turn();
      showToast('🎲 حان دورك الآن يا ' + newTurnPlayer.name + '!', 'success');
    }

    updateBoardTilesUI(state);
    updateDiceUI(state);
    animateMoveIfNeeded(state);
    renderTurnHub(state);
    renderPlayersPanel(state);
    renderMyAssetsPanel(state);
    renderActiveTrades(state);
    renderLogsAndChat(state);
    renderWinnerModalIfFinished(state);

    // Trigger green (+) / red (-) flying cash animations after DOM cash elements are rendered
    trackAndAnimateCashChanges(state);

    // Refresh open deed modal if open
    if (!els.tileModal.classList.contains('hidden') && ui.openTileModalId !== null) {
      openTileModal(ui.openTileModalId);
    }
  }

  function dispatchGameAction(payload) {
    const isCriticalTurnAction =
      payload &&
      (payload.type === 'ROLL_DICE' || payload.type === 'BUY_PROPERTY' || payload.type === 'SKIP_PURCHASE' || payload.type === 'END_TURN');

    if (isCriticalTurnAction && ui.actionInFlight) {
      return Promise.resolve({ ok: false });
    }
    if (isCriticalTurnAction) {
      ui.actionInFlight = true;
    }

    return Network.sendAction(payload).then(function (res) {
      if (isCriticalTurnAction) {
        ui.actionInFlight = false;
      }
      if (res && !res.ok && res.error && !res.needsLossConfirm) {
        showToast(res.error, 'error');
      }
      return res;
    }).catch(function () {
      if (isCriticalTurnAction) {
        ui.actionInFlight = false;
      }
      return { ok: false };
    });
  }

  // ==================== Mobile Navigation Helpers ====================
  function setMobileView(view) {
    ui.activeMobileView = view;
    if (els.mobileBottomNav) {
      els.mobileBottomNav.querySelectorAll('.mob-nav-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.mobNav === view);
      });
    }

    if (els.drawerPlayers) els.drawerPlayers.classList.remove('mobile-open');
    if (els.drawerSocial) els.drawerSocial.classList.remove('mobile-open');

    if (view === 'players') {
      if (els.drawerPlayers) els.drawerPlayers.classList.add('mobile-open');
      activateRightSubtab('players');
      if (Ads) Ads.refresh(els.drawerPlayers);
    } else if (view === 'assets') {
      if (els.drawerPlayers) els.drawerPlayers.classList.add('mobile-open');
      activateRightSubtab('assets');
      if (Ads) Ads.refresh(els.drawerPlayers);
    } else if (view === 'social' || view === 'chat') {
      if (els.drawerSocial) els.drawerSocial.classList.add('mobile-open');
      activateLeftSubtab('chat');
      if (Ads) Ads.refresh(els.drawerSocial);
    } else if (view === 'log' || view === 'events') {
      if (els.drawerSocial) els.drawerSocial.classList.add('mobile-open');
      activateLeftSubtab('log');
      if (Ads) Ads.refresh(els.drawerSocial);
    } else if (view === 'trade') {
      if (ui.state && ui.state.trades && ui.state.trades.some(function (t) { return t.toId === ui.myPlayerId; })) {
        if (els.drawerSocial) els.drawerSocial.classList.add('mobile-open');
      } else {
        openTradeModal();
      }
    }
  }

  function activateRightSubtab(tab) {
    document.querySelectorAll('[data-right-tab]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.rightTab === tab);
    });
    document.getElementById('playersTabContent').classList.toggle('active', tab === 'players');
    document.getElementById('assetsTabContent').classList.toggle('active', tab === 'assets');
  }

  function activateLeftSubtab(tab) {
    ui.activeLeftTab = tab;
    if (tab === 'chat') {
      ui.unreadChat = 0;
      if (els.unreadChatBadge) els.unreadChatBadge.classList.add('hidden');
      if (els.mobChatBadge) els.mobChatBadge.classList.add('hidden');
      if (els.floatingChatBadge) els.floatingChatBadge.classList.add('hidden');
    }
    document.querySelectorAll('[data-left-tab]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.leftTab === tab);
    });
    const logTab = document.getElementById('logTabContent');
    const chatTab = document.getElementById('chatTabContent');
    if (logTab) logTab.classList.toggle('active', tab === 'log');
    if (chatTab) chatTab.classList.toggle('active', tab === 'chat');

    if (els.drawerSocialTitle) {
      els.drawerSocialTitle.textContent = tab === 'log' ? '📜 سجل أحداث ومجريات المباراة' : '💬 المحادثة والصفقات المباشرة';
    }
  }

  function switchToAssetsView() {
    if (window.innerWidth <= 1040) {
      setMobileView('assets');
    } else {
      activateRightSubtab('assets');
    }
  }

  function handleHostFinishByWealth() {
    if (!ui.state || ui.state.hostId !== ui.myPlayerId) return;
    if (window.confirm('هل تريد حسم المباراة الآن وإعلان الفائز صاحب أعلى ثروة إجمالية؟')) {
      dispatchGameAction({ type: 'FINISH_BY_WEALTH' });
    }
  }

  // ==================== Event Listeners Binding ====================
  function bindEvents() {
    els.soundToggleBtn.textContent = AudioFX.isMuted() ? '🔇' : '🔊';
    els.soundToggleBtn.addEventListener('click', function () {
      const m = AudioFX.toggleMute();
      els.soundToggleBtn.textContent = m ? '🔇' : '🔊';
    });

    els.avatarPickerGrid.addEventListener('click', function (ev) {
      const card = ev.target.closest('[data-avatar-id]');
      if (!card) return;
      AudioFX.click();
      ui.selectedAvatarId = card.dataset.avatarId;
      renderAvatarPicker();
    });

    window.triggerCreateRoomAction = function () {
      const name = els.playerNameInput.value.trim();
      if (name.length < 2) {
        showToast('يرجى كتابة اسمك أولاً (حرفين على الأقل).', 'error');
        els.playerNameInput.focus();
        return;
      }
      try {
        localStorage.setItem('beh_last_name', name);
      } catch (_e) { }

      const origCreateText = els.createRoomBtn.textContent;
      els.createRoomBtn.disabled = true;
      els.createRoomBtn.textContent = '⏳ جاري إنشاء الغرفة...';
      Network.createRoom({
        playerName: name,
        avatarId: ui.selectedAvatarId
      }).then(function (res) {
        els.createRoomBtn.disabled = false;
        els.createRoomBtn.textContent = origCreateText;
        if (!res || !res.ok) {
          showToast((res && res.error) || 'تعذر إنشاء الغرفة.', 'error');
          return;
        }
        ui.myPlayerId = res.playerId;
        ui.roomCode = res.roomCode;
        ui.cashInitialized = false;
        saveSession(res.roomCode, res.playerId, res.sessionToken);
        window.history.replaceState({}, '', '?room=' + encodeURIComponent(res.roomCode));
        handleRoomState(res.state);
        showToast('🎉 تم إنشاء الغرفة #' + res.roomCode + '! انسخ الرابط لأصدقائك.', 'success');
      });
    };

    window.triggerJoinRoomAction = function () {
      const name = els.playerNameInput.value.trim();
      const code = els.joinRoomCodeInput.value.trim().toUpperCase();
      if (name.length < 2) {
        showToast('يرجى كتابة اسمك أولاً قبل دخول الغرفة.', 'error');
        els.playerNameInput.focus();
        return;
      }
      if (!code) {
        showToast('يرجى كتابة كود الغرفة.', 'error');
        els.joinRoomCodeInput.focus();
        return;
      }
      try {
        localStorage.setItem('beh_last_name', name);
      } catch (_e) { }

      const origJoinText = els.joinRoomBtn.textContent;
      els.joinRoomBtn.disabled = true;
      els.joinRoomBtn.textContent = '⏳ اتصال...';
      const saved = loadSession(code);
      Network.joinRoom({
        roomCode: code,
        playerName: name,
        avatarId: ui.selectedAvatarId,
        sessionToken: saved ? saved.sessionToken : null
      }).then(function (res) {
        els.joinRoomBtn.disabled = false;
        els.joinRoomBtn.textContent = origJoinText;
        if (!res || !res.ok) {
          showToast((res && res.error) || 'تعذر الانضمام للغرفة.', 'error');
          return;
        }
        ui.myPlayerId = res.playerId;
        ui.roomCode = res.roomCode;
        ui.cashInitialized = false;
        saveSession(res.roomCode, res.playerId, res.sessionToken);
        window.history.replaceState({}, '', '?room=' + encodeURIComponent(res.roomCode));
        handleRoomState(res.state);
        showToast('✅ تم الدخول إلى الغرفة #' + res.roomCode + ' بنجاح!', 'success');
      });
    };

    // Create Room
    els.createRoomBtn.addEventListener('click', function () {
      const name = els.playerNameInput.value.trim();
      if (name.length < 2) {
        showToast('يرجى كتابة اسمك أولاً (حرفين على الأقل).', 'error');
        els.playerNameInput.focus();
        return;
      }
      AudioFX.click();
      if (!isSmartlinkUnlocked()) {
        ui.pendingSmartlinkAction = 'create';
        if (els.smartlinkModal) els.smartlinkModal.classList.remove('hidden');
        return;
      }
      window.triggerCreateRoomAction();
    });

    // Join Room
    els.joinRoomBtn.addEventListener('click', function () {
      const name = els.playerNameInput.value.trim();
      const code = els.joinRoomCodeInput.value.trim().toUpperCase();
      if (name.length < 2) {
        showToast('يرجى كتابة اسمك أولاً قبل دخول الغرفة.', 'error');
        els.playerNameInput.focus();
        return;
      }
      if (!code) {
        showToast('يرجى كتابة كود الغرفة.', 'error');
        els.joinRoomCodeInput.focus();
        return;
      }
      AudioFX.click();
      if (!isSmartlinkUnlocked()) {
        ui.pendingSmartlinkAction = 'join';
        if (els.smartlinkModal) els.smartlinkModal.classList.remove('hidden');
        return;
      }
      window.triggerJoinRoomAction();
    });

    // Smartlink Gate Buttons
    if (els.smartlinkActionBtn) {
      els.smartlinkActionBtn.addEventListener('click', function () {
        AudioFX.click();
        handleSmartlinkUnlockAndProceed();
      });
    }

    if (els.smartlinkModalConfirmBtn) {
      els.smartlinkModalConfirmBtn.addEventListener('click', function () {
        AudioFX.click();
        const pending = ui.pendingSmartlinkAction;
        ui.pendingSmartlinkAction = null;
        handleSmartlinkUnlockAndProceed(pending);
      });
    }

    function handleCopyInvite() {
      if (!ui.roomCode) return;
      const url = buildInviteUrl(ui.roomCode);
      copyText(url).then(function (ok) {
        if (ok) showToast('🔗 تم نسخ رابط الدعوة! أرسله لأصدقائك الآن.', 'success');
        else showToast('انسخ الرابط يدوياً: ' + url, 'info');
      });
    }

    els.copyInviteBtn.addEventListener('click', handleCopyInvite);
    els.headerCopyInviteBtn.addEventListener('click', handleCopyInvite);

    els.whatsappShareBtn.addEventListener('click', function () {
      if (!ui.roomCode) return;
      const url = buildInviteUrl(ui.roomCode);
      const msg = '🏛️ تعال العب معايا "بنك الحظ العربي" أونلاين! ادخل الغرفة مباشرة من الرابط ده:\n' + url;
      window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener');
    });

    function exitToHome() {
      clearSession(ui.roomCode);
      if (els.resumeGameBox) els.resumeGameBox.classList.add('hidden');
      Network.leaveRoom().then(function () {
        ui.state = null;
        ui.roomCode = null;
        ui.myPlayerId = null;
        ui.displayedPositions = {};
        ui.prevPlayerCash = {};
        ui.cashInitialized = false;
        ui.isAnimatingMove = false;
        els.winnerModal.classList.add('hidden');
        window.history.replaceState({}, '', window.location.pathname);
        setScreen('landing');
        updateSmartlinkGateUI();
      });
    }

    els.leaveRoomBtn.addEventListener('click', function () {
      if (window.confirm('هل تريد مغادرة الغرفة الحالية؟')) {
        exitToHome();
      }
    });
    els.winnerExitBtn.addEventListener('click', exitToHome);

    // Lobby Controls
    els.addBotBtn.addEventListener('click', function () {
      dispatchGameAction({ type: 'ADD_BOT' });
    });

    els.lobbyPlayersGrid.addEventListener('click', function (ev) {
      const btn = ev.target.closest('[data-kick-id]');
      if (btn) {
        dispatchGameAction({ type: 'REMOVE_PLAYER', targetId: btn.dataset.kickId });
      }
    });

    els.startingCashSelect.addEventListener('change', function () {
      dispatchGameAction({
        type: 'UPDATE_SETTINGS',
        settings: { startingCash: Number(els.startingCashSelect.value) }
      });
    });

    els.freeParkingCheckbox.addEventListener('change', function () {
      dispatchGameAction({
        type: 'UPDATE_SETTINGS',
        settings: { freeParkingPot: els.freeParkingCheckbox.checked }
      });
    });

    els.startGameBtn.addEventListener('click', function () {
      dispatchGameAction({ type: 'START_GAME' });
    });

    if (els.finishByWealthBtn) {
      els.finishByWealthBtn.addEventListener('click', handleHostFinishByWealth);
    }
    if (els.hostFinishGameSideBtn) {
      els.hostFinishGameSideBtn.addEventListener('click', handleHostFinishByWealth);
    }

    // Richup Quick Action Buttons (Under Board & Floating Chat)
    if (els.underBoardBankruptBtn) {
      els.underBoardBankruptBtn.addEventListener('click', function () {
        if (!ui.state) return;
        const me = ui.state.players.find(function (p) { return p.id === ui.myPlayerId; });
        if (!me || me.bankrupt) return;
        if (window.confirm('هل أنت متأكد من إعلان إفلاسك والانسحاب من المباراة؟')) {
          AudioFX.bankrupt();
          clearSession(ui.roomCode);
          if (els.resumeGameBox) els.resumeGameBox.classList.add('hidden');
          dispatchGameAction({ type: 'BANKRUPT', targetId: ui.myPlayerId });
        }
      });
    }

    if (els.underBoardTradesBtn) {
      els.underBoardTradesBtn.addEventListener('click', function () {
        AudioFX.click();
        openTradeModal();
      });
    }

    if (els.floatingChatBtn) {
      els.floatingChatBtn.addEventListener('click', function () {
        AudioFX.click();
        if (els.drawerSocial && els.drawerSocial.classList.contains('mobile-open') && ui.activeLeftTab === 'chat') {
          setMobileView('board');
        } else {
          setMobileView('chat');
        }
      });
    }

    if (els.floatingLogBtn) {
      els.floatingLogBtn.addEventListener('click', function () {
        AudioFX.click();
        if (els.drawerSocial && els.drawerSocial.classList.contains('mobile-open') && ui.activeLeftTab === 'log') {
          setMobileView('board');
        } else {
          setMobileView('log');
        }
      });
    }

    if (els.centerLiveFeed) {
      els.centerLiveFeed.style.cursor = 'pointer';
      els.centerLiveFeed.title = 'اضغط لعرض سجل الأحداث الكامل';
      els.centerLiveFeed.addEventListener('click', function () {
        AudioFX.click();
        setMobileView('log');
      });
    }

    // Board Zoom Toggle (Mobile)
    els.boardZoomToggleBtn.addEventListener('click', function () {
      ui.boardZoomed = !ui.boardZoomed;
      els.boardScrollWrapper.classList.toggle('zoomed', ui.boardZoomed);
      els.boardZoomToggleBtn.textContent = ui.boardZoomed ? '🗕 احتواء' : '🔍 تكبير';
      setTimeout(function () { layoutAllTokensStatic(ui.state); }, 60);
    });

    // Trade Modal Quick Cash Chips & Visual Property Card Toggles
    els.tradeModal.addEventListener('change', function (ev) {
      if (ev.target && ev.target.type === 'checkbox') {
        const card = ev.target.closest('.trade-prop-card');
        if (card) card.classList.toggle('checked', ev.target.checked);
      }
    });

    els.tradeModal.addEventListener('click', function (ev) {
      const chip = ev.target.closest('.cash-chip');
      if (!chip) return;
      const group = chip.closest('[data-cash-target]');
      if (!group) return;
      const inputEl = document.getElementById(group.dataset.cashTarget);
      if (!inputEl || !ui.state) return;

      AudioFX.click();
      if (chip.dataset.cashReset) {
        inputEl.value = '0';
        return;
      }

      const ownerId = group.dataset.cashTarget === 'tradeMyCash'
        ? ui.myPlayerId
        : els.tradeTargetSelect.value;
      const ownerObj = ui.state.players.find(function (p) { return p.id === ownerId; });
      const maxAllowed = ownerObj ? Math.max(0, ownerObj.cash) : 999999;

      const curVal = Number(inputEl.value) || 0;
      const delta = Number(chip.dataset.cashDelta) || 0;
      const nextVal = Math.max(0, Math.min(maxAllowed, curVal + delta));
      inputEl.value = String(nextVal);
    });

    // Delegated Actions in Side Panels, Banners & Modals
    document.body.addEventListener('click', function (ev) {
      const closeModalBtn = ev.target.closest('[data-close-modal]');
      if (closeModalBtn) {
        document.getElementById(closeModalBtn.dataset.closeModal).classList.add('hidden');
        return;
      }
      if (ev.target.classList.contains('modal-backdrop')) {
        ev.target.classList.add('hidden');
        return;
      }

      const closeDrawer = ev.target.closest('[data-close-drawer]');
      if (closeDrawer) {
        setMobileView('board');
        return;
      }

      const tradeFromDeed = ev.target.closest('[data-trade-tile-owner]');
      if (tradeFromDeed) {
        els.tileModal.classList.add('hidden');
        openTradeModal({
          targetId: tradeFromDeed.dataset.tradeTileOwner,
          wantTileId: Number(tradeFromDeed.dataset.tradeWantTile)
        });
        return;
      }

      const jumpTile = ev.target.closest('[data-tile-jump]');
      if (jumpTile && !ev.target.closest('button:not([data-tile-jump])')) {
        openTileModal(Number(jumpTile.dataset.tileJump));
        return;
      }

      const buildBtn = ev.target.closest('[data-build-tile]');
      if (buildBtn) {
        dispatchGameAction({ type: 'BUILD_HOUSE', tileId: Number(buildBtn.dataset.buildTile) }).then(function (r) {
          if (r && r.ok) AudioFX.buy();
        });
        return;
      }

      const sellBtn = ev.target.closest('[data-sell-tile]');
      if (sellBtn) {
        dispatchGameAction({ type: 'SELL_HOUSE', tileId: Number(sellBtn.dataset.sellTile) });
        return;
      }

      const mortBtn = ev.target.closest('[data-mort-tile]');
      if (mortBtn) {
        dispatchGameAction({ type: 'MORTGAGE', tileId: Number(mortBtn.dataset.mortTile) });
        return;
      }

      const unmortBtn = ev.target.closest('[data-unmort-tile]');
      if (unmortBtn) {
        dispatchGameAction({ type: 'UNMORTGAGE', tileId: Number(unmortBtn.dataset.unmortTile) }).then(function (r) {
          if (r && r.ok) AudioFX.buy();
        });
        return;
      }

      const tradeTargetBtn = ev.target.closest('[data-trade-target]');
      if (tradeTargetBtn) {
        openTradeModal(tradeTargetBtn.dataset.tradeTarget);
        return;
      }

      const counterTrBtn = ev.target.closest('[data-counter-trade]');
      if (counterTrBtn && ui.state) {
        const tradeObj = (ui.state.trades || []).find(function (t) {
          return t.id === counterTrBtn.dataset.counterTrade;
        });
        if (tradeObj) {
          AudioFX.click();
          openTradeModal({ counterTrade: tradeObj });
        }
        return;
      }

      const acceptTr = ev.target.closest('[data-accept-trade]');
      if (acceptTr) {
        dispatchGameAction({ type: 'RESPOND_TRADE', tradeId: acceptTr.dataset.acceptTrade, accept: true }).then(function (r) {
          if (r && r.ok) AudioFX.trade();
        });
        return;
      }

      const rejectTr = ev.target.closest('[data-reject-trade]');
      if (rejectTr) {
        dispatchGameAction({ type: 'RESPOND_TRADE', tradeId: rejectTr.dataset.rejectTrade, accept: false });
        return;
      }

      const cancelTr = ev.target.closest('[data-cancel-trade]');
      if (cancelTr) {
        dispatchGameAction({ type: 'CANCEL_TRADE', tradeId: cancelTr.dataset.cancelTrade });
      }
    });

    // Subtabs
    document.querySelectorAll('[data-right-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { activateRightSubtab(btn.dataset.rightTab); });
    });
    document.querySelectorAll('[data-left-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { activateLeftSubtab(btn.dataset.leftTab); });
    });

    // Mobile Bottom Nav
    if (els.mobileBottomNav) {
      els.mobileBottomNav.addEventListener('click', function (ev) {
        const btn = ev.target.closest('[data-mob-nav]');
        if (!btn) return;
        AudioFX.click();
        setMobileView(btn.dataset.mobNav);
      });
    }

    // Trade Modal Submit
    els.openTradeFromAssetsBtn.addEventListener('click', function () { openTradeModal(); });
    els.tradeTargetSelect.addEventListener('change', function () {
      ui.editingCounterTradeId = null;
      els.tradeCounterHint.classList.add('hidden');
      els.tradeModalTitle.textContent = '🤝 عرض مقايضة وتبادل محافظات';
      els.submitTradeBtn.textContent = '🤝 إرسال عرض المقايضة الآن';
      populateTradePropertyChecklists([], []);
    });

    els.submitTradeBtn.addEventListener('click', function () {
      const toId = els.tradeTargetSelect.value;
      const myProps = Array.from(els.tradeMyProps.querySelectorAll('input:checked')).map(function (i) { return Number(i.value); });
      const theirProps = Array.from(els.tradeTheirProps.querySelectorAll('input:checked')).map(function (i) { return Number(i.value); });
      const wasCounter = Boolean(ui.editingCounterTradeId);

      dispatchGameAction({
        type: 'PROPOSE_TRADE',
        toId: toId,
        counterToTradeId: ui.editingCounterTradeId,
        isCounter: wasCounter,
        note: els.tradeNoteInput ? els.tradeNoteInput.value.trim() : '',
        offer: {
          cash: Number(els.tradeMyCash.value) || 0,
          jailCards: Number(els.tradeMyCards.value) || 0,
          properties: myProps
        },
        request: {
          cash: Number(els.tradeTheirCash.value) || 0,
          jailCards: Number(els.tradeTheirCards.value) || 0,
          properties: theirProps
        }
      }).then(function (res) {
        if (res && res.ok) {
          ui.editingCounterTradeId = null;
          els.tradeModal.classList.add('hidden');
          showToast(wasCounter ? '✏️ تم إرسال الصفقة المعدّلة بنجاح!' : '🤝 تم إرسال عرض المقايضة بنجاح!', 'success');
        }
      });
    });

    // Chat & Quick Reactions
    els.chatForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      const text = els.chatInput.value.trim();
      if (!text) return;
      els.chatInput.value = '';
      dispatchGameAction({ type: 'CHAT', text: text });
    });

    document.querySelectorAll('[data-quick-chat]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        dispatchGameAction({ type: 'CHAT', text: chip.dataset.quickChat });
      });
    });

    // صندوق العودة السريعة للمباراة الجارية (Resume Active Game Box)
    if (els.resumeActiveGameBtn) {
      els.resumeActiveGameBtn.addEventListener('click', function () {
        const active = loadSession();
        if (!active || !active.roomCode) return;
        AudioFX.click();
        els.resumeActiveGameBtn.disabled = true;
        els.resumeActiveGameBtn.textContent = '⏳ جاري العودة للمباراة...';
        Network.joinRoom({
          roomCode: active.roomCode,
          playerName: active.playerName || (els.playerNameInput && els.playerNameInput.value.trim()) || 'لاعب',
          avatarId: active.avatarId || ui.selectedAvatarId,
          sessionToken: active.sessionToken,
          playerId: active.playerId
        }).then(function (res) {
          els.resumeActiveGameBtn.disabled = false;
          els.resumeActiveGameBtn.textContent = '⚡ العودة للمباراة فوراً';
          if (res && res.ok) {
            ui.myPlayerId = res.playerId;
            ui.roomCode = res.roomCode;
            ui.cashInitialized = false;
            saveSession(res.roomCode, res.playerId, res.sessionToken, active);
            window.history.replaceState({}, '', '?room=' + encodeURIComponent(res.roomCode));
            if (els.resumeGameBox) els.resumeGameBox.classList.add('hidden');
            handleRoomState(res.state);
            showToast('⚡ مرحباً بعودتك! تم استئناف اللعب في الغرفة #' + res.roomCode, 'success');
          } else {
            showToast((res && res.error) || 'تعذر استئناف المباراة.', 'error');
            if (res && (res.error || '').indexOf('غير موجودة') !== -1) {
              clearSession(active.roomCode);
              if (els.resumeGameBox) els.resumeGameBox.classList.add('hidden');
            }
          }
        });
      });
    }

    if (els.dismissResumeGameBtn) {
      els.dismissResumeGameBtn.addEventListener('click', function () {
        AudioFX.click();
        if (els.resumeGameBox) els.resumeGameBox.classList.add('hidden');
      });
    }

    // حماية اللاعب من إغلاق التاب أو السحب بالخطأ أثناء جولة نشطة (beforeunload)
    window.addEventListener('beforeunload', function (e) {
      if (ui.state && ui.state.status === 'PLAYING') {
        const me = ui.state.players ? ui.state.players.find(function (p) { return p.id === ui.myPlayerId; }) : null;
        if (me && !me.bankrupt) {
          e.preventDefault();
          e.returnValue = 'لديك مباراة جارية حالياً! هل أنت متأكد من رغبتك في مغادرة اللعبة؟';
          return e.returnValue;
        }
      }
    });

    window.addEventListener('resize', function () {
      layoutAllTokensStatic(ui.state);
      if (Ads) Ads.refresh();
    });
  }

  // ==================== Startup & URL Invite Handling ====================
  function checkInviteUrlOnLoad() {
    try {
      const savedName = localStorage.getItem('beh_last_name');
      if (savedName && els.playerNameInput) els.playerNameInput.value = savedName;
      const savedAvatar = localStorage.getItem('beh_last_avatar');
      if (savedAvatar) {
        ui.selectedAvatarId = savedAvatar;
        renderAvatarPicker();
      }
    } catch (_e) { }

    const params = new URLSearchParams(window.location.search);
    const roomParam = (params.get('room') || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!roomParam) {
      // فحص وجود جلسة مباراة نشطة في المتصفح لعرض صندوق العودة السريعة
      const activeSession = loadSession();
      if (activeSession && activeSession.roomCode) {
        if (els.resumeGameBox && els.resumeBoxRoomCode && els.resumeBoxPlayerName) {
          els.resumeBoxRoomCode.textContent = activeSession.roomCode;
          els.resumeBoxPlayerName.textContent = activeSession.playerName || 'لاعب';
          els.resumeGameBox.classList.remove('hidden');
        }
      }
      return;
    }

    els.joinRoomCodeInput.value = roomParam;
    els.inviteBanner.classList.remove('hidden');
    els.inviteBannerTitle.textContent = '🎉 أنت مدعو للانضمام إلى الغرفة #' + roomParam;

    Network.fetchRoomPreview(roomParam).then(function (preview) {
      if (preview) {
        els.inviteBannerSub.textContent =
          'مضيف الغرفة: ' + preview.hostName + ' • اللاعبون الحاليون: ' + preview.playerCount + '/' + preview.maxPlayers + ' — اكتب اسمك واضغط انضمام!';
      }
    });

    const existingSession = loadSession(roomParam);
    if (existingSession && (existingSession.sessionToken || existingSession.playerId)) {
      setTimeout(function () {
        Network.joinRoom({
          roomCode: roomParam,
          playerName: existingSession.playerName || (els.playerNameInput && els.playerNameInput.value.trim()) || 'لاعب',
          avatarId: existingSession.avatarId || ui.selectedAvatarId,
          sessionToken: existingSession.sessionToken,
          playerId: existingSession.playerId
        }).then(function (res) {
          if (res && res.ok) {
            ui.myPlayerId = res.playerId;
            ui.roomCode = res.roomCode;
            saveSession(res.roomCode, res.playerId, res.sessionToken, existingSession);
            handleRoomState(res.state);
            if (res.reconnected) {
              showToast('🔄 تمت استعادة مقعدك ورصيدك ومتابعة المباراة بنجاح!', 'success');
            }
          }
        });
      }, 350);
    }
  }

  function initApp() {
    cacheDom();
    renderAvatarPicker();
    buildBoardDOM();
    bindEvents();
    updateSmartlinkGateUI();
    if (Ads) Ads.refresh();

    Network.onConnectionChange(function (info) {
      const isOnlineMode = info.mode === 'socket' || info.mode === 'mqtt_cloud' || info.mode === 'cloud_api';
      els.connectionBadge.className = 'conn-badge ' + (
        isOnlineMode
          ? (info.connected ? 'online' : 'offline')
          : 'local'
      );
      if (info.mode === 'socket') {
        els.connectionText.textContent = info.connected
          ? 'أونلاين (Socket.io)'
          : 'انقطع الاتصال...';
      } else if (info.mode === 'mqtt_cloud') {
        els.connectionText.textContent = info.connected
          ? 'أونلاين عالمي v4.0'
          : 'إعادة الاتصال...';
      } else if (info.mode === 'cloud_api') {
        els.connectionText.textContent = info.connected
          ? 'أونلاين سحابي v4.0'
          : 'إعادة الاتصال...';
      } else {
        els.connectionText.textContent = 'وضع محلي (بدون إنترنت)';
      }

      if (els.publicDomainBanner && els.publicDomainLink) {
        const curHost = String(window.location.hostname || '').toLowerCase();
        const prodHost = String(info.publicHost || '').toLowerCase();
        if (prodHost && curHost && curHost !== prodHost && curHost !== 'localhost' && curHost !== '127.0.0.1') {
          els.publicDomainLink.href = 'https://' + prodHost + (window.location.search || '');
          els.publicDomainBanner.classList.remove('hidden');
        } else {
          els.publicDomainBanner.classList.add('hidden');
        }
      }
    });

    Network.onState(handleRoomState);
    Network.init();
    checkInviteUrlOnLoad();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
