(function (root) {
  'use strict';

  /**
   * ============================================================================
   * 💰 نظام إدارة الإعلانات والأرباح المفعّل — بنك الحظ العربي (Ads Manager v5.5)
   * ============================================================================
   * تم ربط وتفعيل الوحدات الإعلانية الخاصة بك بنجاح:
   *  1) بانر عريض للكمبيوتر والتابلت (728×90): 71b51a1973d418aab7666f5c38587bc9
   *  2) بانر مستطيل للموبايل والقائمة الجانبية والفوز (300×250): b6ea58cccfaf6daac0213b20606aefb4
   *  3) الرابط المباشر الذكي (Direct Smartlink):
   *     https://www.profitableratecpmnetwork.com/eb1s6shc?key=79594509f41396d2b2075326c6ab797c
   * ============================================================================
   */
  const AD_CONFIG = {
    enabled: true,

    // الرابط المباشر للربح الإضافي (يفتح في نافذة جديدة عند التفعيل لفتح الغرف)
    directSmartLink: 'https://www.profitableratecpmnetwork.com/f4c021nfe?key=8635493de0d07bd3a015caa30635cf8f',

    // وحدات البانر المفعّلة (Adsterra / HighRevenueFormat)
    units: {
      banner_728x90: {
        key: '71b51a1973d418aab7666f5c38587bc9',
        width: 728,
        height: 90,
        invokeSrc: 'https://www.highrevenueformat.com/71b51a1973d418aab7666f5c38587bc9/invoke.js'
      },
      banner_300x250: {
        key: 'b6ea58cccfaf6daac0213b20606aefb4',
        width: 300,
        height: 250,
        invokeSrc: 'https://www.highrevenueformat.com/b6ea58cccfaf6daac0213b20606aefb4/invoke.js'
      }
    },

    // توزيع الوحدات تلقائياً حسب الشاشة والمكان لتحقيق أعلى أرباح بدون إزعاج اللاعب
    slots: {
      landing_banner: {
        desktopUnit: 'banner_728x90',
        mobileUnit: 'banner_300x250',
        showSmartLinkBar: true,
        smartLinkLabel: '🎁 عروض ومكافآت برعاية شركائنا — اضغط للاستكشاف'
      },
      lobby_banner: {
        desktopUnit: 'banner_728x90',
        mobileUnit: 'banner_300x250',
        showSmartLinkBar: false
      },
      sidebar_box: {
        desktopUnit: 'banner_300x250',
        mobileUnit: 'banner_300x250',
        showSmartLinkBar: true,
        smartLinkLabel: '🔥 ادعم استمرار اللعبة مجاناً — تصفح عرض الراعي'
      },
      winner_banner: {
        desktopUnit: 'banner_300x250',
        mobileUnit: 'banner_300x250',
        showSmartLinkBar: true,
        smartLinkLabel: '🏆 جوائز وعروض مميزة من الراعي الرسمي'
      }
    }
  };

  function isContainerVisible(el) {
    if (!el || el.classList.contains('hidden')) return false;
    if (typeof root.getComputedStyle === 'function') {
      const st = root.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0;
  }

  function pickUnitForSlot(slotCfg) {
    const isWide = (root.innerWidth || 1024) >= 760;
    const unitName = isWide ? slotCfg.desktopUnit : slotCfg.mobileUnit;
    return AD_CONFIG.units[unitName] || AD_CONFIG.units.banner_300x250;
  }

  function mountAdsterraIframe(wrapperEl, unit) {
    if (!wrapperEl || !unit) return;

    const iframe = document.createElement('iframe');
    iframe.width = String(unit.width);
    iframe.height = String(unit.height);
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('marginwidth', '0');
    iframe.setAttribute('marginheight', '0');
    iframe.setAttribute('title', 'إعلان ممول');
    iframe.className = 'ad-unit-iframe';
    iframe.style.width = unit.width + 'px';
    iframe.style.height = unit.height + 'px';
    iframe.style.maxWidth = '100%';
    iframe.style.border = '0';
    iframe.style.overflow = 'hidden';
    iframe.style.display = 'block';
    iframe.style.margin = '0 auto';

    wrapperEl.appendChild(iframe);

    const baseHref = (root.location && root.location.origin && root.location.origin !== 'null')
      ? (root.location.origin + '/')
      : 'https://vercel.app/';

    const htmlDoc =
      '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<base href="' + baseHref + '" target="_blank">' +
      '<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent;display:flex;align-items:center;justify-content:center;}</style>' +
      '</head><body>' +
      '<scr' + 'ipt type="text/javascript">' +
      'window.atOptions = {' +
      "'key' : '" + unit.key + "'," +
      "'format' : 'iframe'," +
      "'height' : " + unit.height + ',' +
      "'width' : " + unit.width + ',' +
      "'params' : {}" +
      '};' +
      '</scr' + 'ipt>' +
      '<scr' + 'ipt type="text/javascript" src="' + unit.invokeSrc + '"></scr' + 'ipt>' +
      '</body></html>';

    try {
      const doc = iframe.contentWindow && iframe.contentWindow.document;
      if (doc) {
        doc.open();
        doc.write(htmlDoc);
        doc.close();
      } else {
        iframe.srcdoc = htmlDoc;
      }
    } catch (_err) {
      iframe.srcdoc = htmlDoc;
    }
  }

  function renderSlot(container, force) {
    if (!container) return;
    const slotKey = container.getAttribute('data-ad-slot-key');
    const slotCfg = (slotKey && AD_CONFIG.slots[slotKey]) || null;

    if (!AD_CONFIG.enabled || !slotCfg) {
      container.classList.add('hidden');
      container.innerHTML = '';
      return;
    }

    container.classList.remove('hidden');

    // الانتظار حتى تصبح الحاوية مرئية فعلياً على الشاشة لضمان احتساب المشاهدات وتحميل البانر بنجاح
    if (!isContainerVisible(container)) {
      return;
    }

    const chosenUnit = pickUnitForSlot(slotCfg);
    const renderedKey = container.getAttribute('data-ad-rendered-unit');
    if (!force && renderedKey === chosenUnit.key) {
      return;
    }

    container.setAttribute('data-ad-rendered-unit', chosenUnit.key);
    container.innerHTML = '';

    const badge = document.createElement('div');
    badge.className = 'ad-slot-badge';
    badge.textContent = 'إعلان';
    container.appendChild(badge);

    const frameWrap = document.createElement('div');
    frameWrap.className = 'ad-iframe-wrap';
    container.appendChild(frameWrap);

    mountAdsterraIframe(frameWrap, chosenUnit);

    if (slotCfg.showSmartLinkBar && AD_CONFIG.directSmartLink) {
      const link = document.createElement('a');
      link.className = 'ad-smartlink-bar';
      link.href = AD_CONFIG.directSmartLink;
      link.target = '_blank';
      link.rel = 'noopener noreferrer sponsored';
      link.textContent = slotCfg.smartLinkLabel || '🎁 عرض مميز من الراعي — اضغط هنا';
      container.appendChild(link);
    }
  }

  // ==================== حلقة التحديث التلقائي الصامت (Silent Ad Refresh) ====================
  let autoRefreshTimer = null;
  const AUTO_REFRESH_INTERVAL_MS = 50000; // 50 ثانية

  function startAutoRefreshLoop() {
    if (autoRefreshTimer || typeof window === 'undefined') return;
    autoRefreshTimer = setInterval(function () {
      if (!AD_CONFIG.enabled) return;
      if (typeof document !== 'undefined' && document.visibilityState && document.visibilityState !== 'visible') {
        return; // لا تحدّث الإعلانات إذا كان التاب غير نشط توفيراً للموارد
      }
      const containers = document.querySelectorAll('[data-ad-slot-key]');
      containers.forEach(function (c) {
        if (isContainerVisible(c)) {
          renderSlot(c, true);
        }
      });
    }, AUTO_REFRESH_INTERVAL_MS);
  }

  function refreshAllAds(scopeEl) {
    if (typeof document === 'undefined') return;
    const rootNode = scopeEl || document;
    const containers = rootNode.querySelectorAll('[data-ad-slot-key]');
    containers.forEach(function (c) { renderSlot(c, false); });
    startAutoRefreshLoop();
  }

  function isSmartlinkUnlocked() {
    try {
      if (typeof window !== 'undefined') {
        const s = window.sessionStorage && window.sessionStorage.getItem('beh_smartlink_unlocked');
        if (s === '1' || s === 'true') return true;
      }
    } catch (_e) { }
    return false;
  }

  function unlockSmartlink() {
    try {
      if (typeof window !== 'undefined') {
        if (window.sessionStorage) window.sessionStorage.setItem('beh_smartlink_unlocked', '1');
      }
    } catch (_e) { }
  }

  function lockSmartlink() {
    try {
      if (typeof window !== 'undefined') {
        if (window.sessionStorage) window.sessionStorage.removeItem('beh_smartlink_unlocked');
        if (window.localStorage) window.localStorage.removeItem('beh_smartlink_unlocked_time');
      }
    } catch (_e) { }
  }

  // فحص وفتح الشخصيات الملكية (VIP Avatars)
  function isVipUnlocked() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem('beh_vip_avatars_unlocked') === '1';
      }
    } catch (_e) { }
    return false;
  }

  function unlockVipAvatars() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('beh_vip_avatars_unlocked', '1');
      }
    } catch (_e) { }
  }

  // بوب أندر مقيّد بنهاية المباراة لمرة واحدة كل 24 ساعة (Strict Post-Game Popunder)
  function triggerPostGamePopunder() {
    try {
      if (typeof window === 'undefined') return;
      const last = window.localStorage ? window.localStorage.getItem('beh_last_popunder') : null;
      const now = Date.now();
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      if (last && (now - Number(last)) < ONE_DAY_MS) {
        return; // تم عرضه بالفعل خلال الـ 24 ساعة الماضية
      }
      if (window.localStorage) {
        window.localStorage.setItem('beh_last_popunder', String(now));
      }
      const url = AD_CONFIG.directSmartLink;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (_e) { }
  }

  // تشغيل مكافأة السمارت لينك التفاعلية مع تنفيذ الإجراء الداخلي
  function triggerRewardedSmartLink(onComplete) {
    const url = AD_CONFIG.directSmartLink;
    try {
      if (url && typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (_e) { }
    unlockSmartlink();
    if (typeof onComplete === 'function') {
      setTimeout(onComplete, 300);
    }
  }

  root.BankElHazAds = {
    config: AD_CONFIG,
    refresh: refreshAllAds,
    isSmartlinkUnlocked: isSmartlinkUnlocked,
    unlockSmartlink: unlockSmartlink,
    lockSmartlink: lockSmartlink,
    isVipUnlocked: isVipUnlocked,
    unlockVipAvatars: unlockVipAvatars,
    triggerPostGamePopunder: triggerPostGamePopunder,
    triggerRewardedSmartLink: triggerRewardedSmartLink,
    getSmartLinkUrl: function () {
      return AD_CONFIG.directSmartLink;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
