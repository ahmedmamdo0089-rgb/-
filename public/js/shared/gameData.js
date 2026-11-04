(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BankElHazData = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * ============================================================================
   * 🗺️ بيانات بنك الحظ العربي — تصميم Richup.io العربي الأصيل (v5.0)
   * ============================================================================
   * 40 خانة كاملة مطابقة لتصميم وهندسة Richup.io:
   * - 8 مجموعات دول عربية ومحافظاتها (عُمان، المغرب، الأردن، الكويت، قطر، الإمارات، السعودية، مصر)
   * - 4 مطارات دولية كبرى (القاهرة، الرياض، دبي، الدوحة)
   * - شركتان للمرافق العامة (الكهرباء، المياه)
   * - 3 بطاقات كنز (Treasure 📦) و 3 بطاقات مفاجأة (Surprise ❓)
   * - ضريبتا أرباح ودخل وضريبة كماليات
   * - 4 أركان (البداية START، السجن In Prison، العطلة Vacation، إلى السجن Go to prison)
   */
  const GAME_CONFIG = {
    MIN_PLAYERS: 2,
    MAX_PLAYERS: 6,
    STARTING_CASH: 1500,
    GO_SALARY: 200,
    JAIL_BAIL: 50,
    MAX_JAIL_TURNS: 3,
    CURRENCY: '$',
    STATION_RENTS: [25, 50, 100, 200],
    UTILITY_MULTIPLIERS: {
      SINGLE: 4,
      BOTH: 10
    }
  };

  /**
   * شخصيات Richup.io الدائرية المحبوبة (أعين كبيرة مميزة)
   */
  const PLAYER_PRESETS = [
    { id: 'cyan', name: 'الأزرق السماوي', icon: '🔵', color: '#38bdf8', eyeTone: '#0284c7' },
    { id: 'lime', name: 'الأخضر النيوني', icon: '🟢', color: '#4ade80', eyeTone: '#16a34a' },
    { id: 'brown', name: 'البني الكلاسيكي', icon: '🟤', color: '#b45309', eyeTone: '#78350f' },
    { id: 'coral', name: 'الأحمر المرجاني', icon: '🔴', color: '#f87171', eyeTone: '#dc2626' },
    { id: 'purple', name: 'البنفسجي الملكي', icon: '🟣', color: '#a855f7', eyeTone: '#7e22ce' },
    { id: 'orange', name: 'البرتقالي الحيوي', icon: '🟠', color: '#fb923c', eyeTone: '#ea580c' }
  ];

  /**
   * المجموعات اللونية الثمانية للدول العربية
   */
  const COLOR_GROUPS = {
    brown: {
      id: 'brown',
      name: 'سلطنة عُمان',
      country: 'عُمان',
      flag: '🇴🇲',
      flagSvg: '<svg viewBox="0 0 32 32" class="flag-svg" aria-label="عُمان"><clipPath id="f_om"><circle cx="16" cy="16" r="16"/></clipPath><g clip-path="url(#f_om)"><rect width="32" height="10.7" fill="#ffffff"/><rect y="10.7" width="32" height="10.6" fill="#ce1126"/><rect y="21.3" width="32" height="10.7" fill="#008000"/><rect width="10" height="32" fill="#ce1126"/><circle cx="5" cy="6" r="2" fill="#ffffff"/></g></svg>',
      color: '#92400e',
      textColor: '#ffffff',
      count: 2
    },
    sky: {
      id: 'sky',
      name: 'المملكة المغربية',
      country: 'المغرب',
      flag: '🇲🇦',
      flagSvg: '<svg viewBox="0 0 32 32" class="flag-svg" aria-label="المغرب"><circle cx="16" cy="16" r="16" fill="#c1272d"/><polygon points="16,8 18.2,14.5 25,14.5 19.5,18.5 21.5,25 16,21 10.5,25 12.5,18.5 7,14.5 13.8,14.5" fill="none" stroke="#006233" stroke-width="1.8"/></svg>',
      color: '#0284c7',
      textColor: '#ffffff',
      count: 3
    },
    pink: {
      id: 'pink',
      name: 'المملكة الأردنية',
      country: 'الأردن',
      flag: '🇯🇴',
      flagSvg: '<svg viewBox="0 0 32 32" class="flag-svg" aria-label="الأردن"><clipPath id="f_jo"><circle cx="16" cy="16" r="16"/></clipPath><g clip-path="url(#f_jo)"><rect width="32" height="10.7" fill="#000000"/><rect y="10.7" width="32" height="10.6" fill="#ffffff"/><rect y="21.3" width="32" height="10.7" fill="#007a3d"/><polygon points="0,0 13,16 0,32" fill="#ce1126"/><circle cx="5.5" cy="16" r="1.8" fill="#ffffff"/></g></svg>',
      color: '#c026d3',
      textColor: '#ffffff',
      count: 3
    },
    orange: {
      id: 'orange',
      name: 'دولة الكويت',
      country: 'الكويت',
      flag: '🇰🇼',
      flagSvg: '<svg viewBox="0 0 32 32" class="flag-svg" aria-label="الكويت"><clipPath id="f_kw"><circle cx="16" cy="16" r="16"/></clipPath><g clip-path="url(#f_kw)"><rect width="32" height="10.7" fill="#007a3d"/><rect y="10.7" width="32" height="10.6" fill="#ffffff"/><rect y="21.3" width="32" height="10.7" fill="#ce1126"/><polygon points="0,0 11,9.5 11,22.5 0,32" fill="#000000"/></g></svg>',
      color: '#ea580c',
      textColor: '#ffffff',
      count: 3
    },
    red: {
      id: 'red',
      name: 'دولة قطر',
      country: 'قطر',
      flag: '🇶🇦',
      flagSvg: '<svg viewBox="0 0 32 32" class="flag-svg" aria-label="قطر"><clipPath id="f_qa"><circle cx="16" cy="16" r="16"/></clipPath><g clip-path="url(#f_qa)"><rect width="32" height="32" fill="#8d1b3d"/><polygon points="0,0 10,0 12,3.5 10,7 12,10.5 10,14 12,17.5 10,21 12,24.5 10,28 12,32 0,32" fill="#ffffff"/></g></svg>',
      color: '#dc2626',
      textColor: '#ffffff',
      count: 3
    },
    yellow: {
      id: 'yellow',
      name: 'دولة الإمارات',
      country: 'الإمارات',
      flag: '🇦🇪',
      flagSvg: '<svg viewBox="0 0 32 32" class="flag-svg" aria-label="الإمارات"><clipPath id="f_ae"><circle cx="16" cy="16" r="16"/></clipPath><g clip-path="url(#f_ae)"><rect width="32" height="10.7" fill="#00732f"/><rect y="10.7" width="32" height="10.6" fill="#ffffff"/><rect y="21.3" width="32" height="10.7" fill="#000000"/><rect width="10" height="32" fill="#ff0000"/></g></svg>',
      color: '#eab308',
      textColor: '#1e293b',
      count: 3
    },
    green: {
      id: 'green',
      name: 'المملكة العربية السعودية',
      country: 'السعودية',
      flag: '🇸🇦',
      flagSvg: '<svg viewBox="0 0 32 32" class="flag-svg" aria-label="السعودية"><circle cx="16" cy="16" r="16" fill="#006c35"/><rect x="8" y="14" width="16" height="2" fill="#ffffff" rx="1"/><rect x="9" y="18" width="14" height="1.6" fill="#ffffff" rx="0.8"/></svg>',
      color: '#16a34a',
      textColor: '#ffffff',
      count: 3
    },
    royal: {
      id: 'royal',
      name: 'جمهورية مصر العربية',
      country: 'مصر',
      flag: '🇪🇬',
      flagSvg: '<svg viewBox="0 0 32 32" class="flag-svg" aria-label="مصر"><clipPath id="f_eg"><circle cx="16" cy="16" r="16"/></clipPath><g clip-path="url(#f_eg)"><rect width="32" height="10.7" fill="#c8102e"/><rect y="10.7" width="32" height="10.6" fill="#ffffff"/><rect y="21.3" width="32" height="10.7" fill="#000000"/><circle cx="16" cy="16" r="3.2" fill="#c09300"/></g></svg>',
      color: '#2563eb',
      textColor: '#ffffff',
      count: 2
    }
  };

  /**
   * الخانات الأربعون للوحة بنك الحظ العربي (Richup.io Sequence)
   */
  const BOARD_TILES = [
    // 0: أقصى أعلى اليسار - البداية
    {
      id: 0,
      type: 'go',
      name: 'البداية',
      shortName: 'البداية',
      subtitle: 'استلم 200$',
      icon: '⏩',
      description: 'نقطة الانطلاق! في كل مرة تمر بها أو تقف عليها تتقاضى راتب 200$ من البنك.'
    },

    // 1: سلطنة عُمان - صلالة
    {
      id: 1,
      type: 'property',
      name: 'صلالة',
      shortName: 'صلالة',
      subtitle: 'خريف ظفار الساحر',
      country: 'عُمان',
      flag: '🇴🇲',
      group: 'brown',
      price: 60,
      houseCost: 50,
      rent: [2, 10, 30, 90, 160, 250],
      icon: '🌴'
    },

    // 2: صندوق الكنز (Treasure)
    {
      id: 2,
      type: 'community',
      name: 'صندوق الكنز',
      shortName: 'كنز',
      subtitle: 'اسحب بطاقة كنز',
      icon: '📦',
      description: 'اسحب بطاقة من صندوق الكنز ونفّذ المكافأة أو التوجيه المذكور فيها.'
    },

    // 3: سلطنة عُمان - مسقط
    {
      id: 3,
      type: 'property',
      name: 'مسقط',
      shortName: 'مسقط',
      subtitle: 'العاصمة العُمانية العريقة',
      country: 'عُمان',
      flag: '🇴🇲',
      group: 'brown',
      price: 60,
      houseCost: 50,
      rent: [4, 20, 60, 180, 320, 450],
      icon: '⛵'
    },

    // 4: ضريبة الأرباح والدخل
    {
      id: 4,
      type: 'tax',
      name: 'ضريبة الأرباح',
      shortName: 'ضريبة أرباح',
      subtitle: 'ادفع 200$',
      taxAmount: 200,
      icon: '💼',
      description: 'ضريبة الدخل والأرباح التجارية السنوية: ادفع 200$ للخزينة.'
    },

    // 5: المطار 1 - مطار القاهرة الدولي
    {
      id: 5,
      type: 'station',
      name: 'مطار القاهرة',
      shortName: 'مطار القاهرة',
      subtitle: 'مطار القاهرة الدولي (CAI)',
      price: 200,
      icon: '✈️',
      description: 'أكبر مطارات العالم العربي وأفريقيا. يتضاعف الإيجار كلما امتلكت مطارات دولية إضافية.'
    },

    // 6: المغرب - طنجة
    {
      id: 6,
      type: 'property',
      name: 'طنجة',
      shortName: 'طنجة',
      subtitle: 'عروس الشمال ومضيق جبل طارق',
      country: 'المغرب',
      flag: '🇲🇦',
      group: 'sky',
      price: 100,
      houseCost: 50,
      rent: [6, 30, 90, 270, 400, 550],
      icon: '🌊'
    },

    // 7: المغرب - مراكش
    {
      id: 7,
      type: 'property',
      name: 'مراكش',
      shortName: 'مراكش',
      subtitle: 'المدينة الحمراء وساحة الفنا',
      country: 'المغرب',
      flag: '🇲🇦',
      group: 'sky',
      price: 100,
      houseCost: 50,
      rent: [6, 30, 90, 270, 400, 550],
      icon: '🕌'
    },

    // 8: مفاجأة (Surprise)
    {
      id: 8,
      type: 'chance',
      name: 'مفاجأة',
      shortName: 'مفاجأة',
      subtitle: 'اسحب بطاقة مفاجأة',
      icon: '❓',
      description: 'اسحب بطاقة مفاجأة واكتشف ما يخبئه لك الحظ السعيد أو التعثر الطارئ!'
    },

    // 9: المغرب - الدار البيضاء
    {
      id: 9,
      type: 'property',
      name: 'الدار البيضاء',
      shortName: 'الدار البيضاء',
      subtitle: 'العاصمة الاقتصادية وكازابلانكا',
      country: 'المغرب',
      flag: '🇲🇦',
      group: 'sky',
      price: 120,
      houseCost: 50,
      rent: [8, 40, 100, 300, 450, 600],
      icon: '🏙️'
    },

    // 10: أقصى أعلى اليمين - السجن / في الزيارة
    {
      id: 10,
      type: 'jail',
      name: 'السجن / زيارة',
      shortName: 'السجن',
      subtitle: 'زيارة عادية أو حجز',
      icon: '⛓️',
      description: 'إذا وصلت هنا عادياً فأنت مجرد زائر. أما المحتجز فعليه دفع كفالة 50$ أو رمي رقمين متطابقين (دبل).'
    },

    // 11: الأردن - العقبة
    {
      id: 11,
      type: 'property',
      name: 'العقبة',
      shortName: 'العقبة',
      subtitle: 'ثغر الأردن الباسم على البحر الأحمر',
      country: 'الأردن',
      flag: '🇯🇴',
      group: 'pink',
      price: 140,
      houseCost: 100,
      rent: [10, 50, 150, 450, 625, 750],
      icon: '🏖️'
    },

    // 12: شركة الكهرباء الوطنية
    {
      id: 12,
      type: 'utility',
      name: 'شركة الكهرباء',
      shortName: 'الكهرباء',
      subtitle: 'شبكة الطاقة الوطنية',
      price: 150,
      icon: '⚡',
      description: 'مرفق حيوي: الإيجار يساوي 4 أضعاف مجموع النرد لمرفق واحد، أو 10 أضعاف في حال امتلاك الكهرباء والمياه معاً.'
    },

    // 13: الأردن - البتراء
    {
      id: 13,
      type: 'property',
      name: 'البتراء',
      shortName: 'البتراء',
      subtitle: 'المدينة الوردية المنحوتة في الصخر',
      country: 'الأردن',
      flag: '🇯🇴',
      group: 'pink',
      price: 140,
      houseCost: 100,
      rent: [10, 50, 150, 450, 625, 750],
      icon: '🏛️'
    },

    // 14: الأردن - عمّان
    {
      id: 14,
      type: 'property',
      name: 'عمّان',
      shortName: 'عمّان',
      subtitle: 'عاصمة المملكة الأردنية الهاشمية',
      country: 'الأردن',
      flag: '🇯🇴',
      group: 'pink',
      price: 160,
      houseCost: 100,
      rent: [12, 60, 180, 500, 700, 900],
      icon: '🏰'
    },

    // 15: المطار 2 - مطار الملك خالد بالرياض
    {
      id: 15,
      type: 'station',
      name: 'مطار الرياض',
      shortName: 'مطار الرياض',
      subtitle: 'مطار الملك خالد الدولي (RUH)',
      price: 200,
      icon: '✈️',
      description: 'بوابة العاصمة السعودية الحديثة للعالم. يرتفع الإيجار بامتلاك مطارات إضافية.'
    },

    // 16: الكويت - الأحمدي
    {
      id: 16,
      type: 'property',
      name: 'الأحمدي',
      shortName: 'الأحمدي',
      subtitle: 'عاصمة النفط والصناعة الكبرى',
      country: 'الكويت',
      flag: '🇰🇼',
      group: 'orange',
      price: 180,
      houseCost: 100,
      rent: [14, 70, 200, 550, 750, 950],
      icon: '🛢️'
    },

    // 17: صندوق الكنز (Treasure)
    {
      id: 17,
      type: 'community',
      name: 'صندوق الكنز',
      shortName: 'كنز',
      subtitle: 'اسحب بطاقة كنز',
      icon: '📦',
      description: 'اسحب بطاقة من صندوق الكنز ونفّذ المكافأة أو التوجيه المذكور فيها.'
    },

    // 18: الكويت - حولي
    {
      id: 18,
      type: 'property',
      name: 'حولي',
      shortName: 'حولي',
      subtitle: 'مركز التجارة والنشاط التجاري',
      country: 'الكويت',
      flag: '🇰🇼',
      group: 'orange',
      price: 180,
      houseCost: 100,
      rent: [14, 70, 200, 550, 750, 950],
      icon: '🏬'
    },

    // 19: الكويت - مدينة الكويت
    {
      id: 19,
      type: 'property',
      name: 'مدينة الكويت',
      shortName: 'الكويت',
      subtitle: 'أبراج الكويت وسوق المباركية',
      country: 'الكويت',
      flag: '🇰🇼',
      group: 'orange',
      price: 200,
      houseCost: 100,
      rent: [16, 80, 220, 600, 800, 1000],
      icon: '🗼'
    },

    // 20: أقصى أسفل اليمين - عطلة واستراحة النخيل (Vacation)
    {
      id: 20,
      type: 'parking',
      name: 'عطلة واستراحة',
      shortName: 'عطلة',
      subtitle: 'استراحة مجانية هادئة',
      icon: '🌴',
      description: 'مكان استراحة مجاني للاسترخاء! إذا كانت خزينة الاستراحة مفعّلة فستفوز بكل الأموال المتراكمة بداخلها.'
    },

    // 21: قطر - الوكرة
    {
      id: 21,
      type: 'property',
      name: 'الوكرة',
      shortName: 'الوكرة',
      subtitle: 'سوق الوكرة التراثي وشاطئ الجنوب',
      country: 'قطر',
      flag: '🇶🇦',
      group: 'red',
      price: 220,
      houseCost: 150,
      rent: [18, 90, 250, 700, 875, 1050],
      icon: '🐚'
    },

    // 22: قطر - لوسيل
    {
      id: 22,
      type: 'property',
      name: 'لوسيل',
      shortName: 'لوسيل',
      subtitle: 'المدينة الذكية وأيقونة المستقبل',
      country: 'قطر',
      flag: '🇶🇦',
      group: 'red',
      price: 220,
      houseCost: 150,
      rent: [18, 90, 250, 700, 875, 1050],
      icon: '🏟️'
    },

    // 23: شركة تحلية المياه
    {
      id: 23,
      type: 'utility',
      name: 'شركة المياه',
      shortName: 'المياه',
      subtitle: 'محطة تحلية مياه البحر',
      price: 150,
      icon: '🚰',
      description: 'مرفق أساسي للحياة: الإيجار 4 أضعاف النرد لمرفق واحد، أو 10 أضعاف للمرفقين معاً.'
    },

    // 24: قطر - الدوحة
    {
      id: 24,
      type: 'property',
      name: 'الدوحة',
      shortName: 'الدوحة',
      subtitle: 'كورنيش الدوحة ومتحف الفن الإسلامي',
      country: 'قطر',
      flag: '🇶🇦',
      group: 'red',
      price: 240,
      houseCost: 150,
      rent: [20, 100, 300, 750, 925, 1100],
      icon: '🏙️'
    },

    // 25: المطار 3 - مطار دبي الدولي
    {
      id: 25,
      type: 'station',
      name: 'مطار دبي',
      shortName: 'مطار دبي',
      subtitle: 'مطار دبي الدولي (DXB)',
      price: 200,
      icon: '✈️',
      description: 'أكبر مركز ربط جوي للمسافرين الدوليين في العالم. يرتفع الإيجار بامتلاك باقي المطارات.'
    },

    // 26: الإمارات - الشارقة
    {
      id: 26,
      type: 'property',
      name: 'الشارقة',
      shortName: 'الشارقة',
      subtitle: 'عاصمة الثقافة والفنون الإسلامية',
      country: 'الإمارات',
      flag: '🇦🇪',
      group: 'yellow',
      price: 260,
      houseCost: 150,
      rent: [22, 110, 330, 800, 975, 1150],
      icon: '📚'
    },

    // 27: الإمارات - أبوظبي
    {
      id: 27,
      type: 'property',
      name: 'أبوظبي',
      shortName: 'أبوظبي',
      subtitle: 'جامع الشيخ زايد واللوفر أبوظبي',
      country: 'الإمارات',
      flag: '🇦🇪',
      group: 'yellow',
      price: 260,
      houseCost: 150,
      rent: [22, 110, 330, 800, 975, 1150],
      icon: '🕌'
    },

    // 28: مفاجأة (Surprise)
    {
      id: 28,
      type: 'chance',
      name: 'مفاجأة',
      shortName: 'مفاجأة',
      subtitle: 'اسحب بطاقة مفاجأة',
      icon: '❓',
      description: 'اسحب بطاقة مفاجأة واكتشف ما يخبئه لك الحظ!'
    },

    // 29: الإمارات - دبي
    {
      id: 29,
      type: 'property',
      name: 'دبي',
      shortName: 'دبي',
      subtitle: 'برج خليفة ودانة الدنيا العالمية',
      country: 'الإمارات',
      flag: '🇦🇪',
      group: 'yellow',
      price: 280,
      houseCost: 150,
      rent: [24, 120, 360, 850, 1025, 1200],
      icon: '🏙️'
    },

    // 30: أقصى أسفل اليسار - إلى السجن فوراً (Go to prison)
    {
      id: 30,
      type: 'go_to_jail',
      name: 'إلى السجن!',
      shortName: 'إلى السجن',
      subtitle: 'تحرك فوراً إلى السجن',
      icon: '☠️',
      description: 'توجّه مباشرة إلى زنزانة السجن! لا تمر بخانة البداية ولا تتقاضَ أي راتب.'
    },

    // 31: السعودية - مكة المكرمة
    {
      id: 31,
      type: 'property',
      name: 'مكة المكرمة',
      shortName: 'مكة المكرمة',
      subtitle: 'قبلة المسلمين والمسجد الحرام',
      country: 'السعودية',
      flag: '🇸🇦',
      group: 'green',
      price: 300,
      houseCost: 200,
      rent: [26, 130, 390, 900, 1100, 1275],
      icon: '🕋'
    },

    // 32: السعودية - جدة
    {
      id: 32,
      type: 'property',
      name: 'جدة',
      shortName: 'جدة',
      subtitle: 'عروس البحر الأحمر وجدة التاريخية',
      country: 'السعودية',
      flag: '🇸🇦',
      group: 'green',
      price: 300,
      houseCost: 200,
      rent: [26, 130, 390, 900, 1100, 1275],
      icon: '⛵'
    },

    // 33: صندوق الكنز (Treasure)
    {
      id: 33,
      type: 'community',
      name: 'صندوق الكنز',
      shortName: 'كنز',
      subtitle: 'اسحب بطاقة كنز',
      icon: '📦',
      description: 'اسحب بطاقة من صندوق الكنز ونفّذ المكافأة أو التوجيه المذكور فيها.'
    },

    // 34: السعودية - الرياض
    {
      id: 34,
      type: 'property',
      name: 'الرياض',
      shortName: 'الرياض',
      subtitle: 'عاصمة القرار ودرة المملكة المتألقة',
      country: 'السعودية',
      flag: '🇸🇦',
      group: 'green',
      price: 320,
      houseCost: 200,
      rent: [28, 150, 450, 1000, 1200, 1400],
      icon: '🌴'
    },

    // 35: المطار 4 - مطار حمد الدولي بالدوحة
    {
      id: 35,
      type: 'station',
      name: 'مطار الدوحة',
      shortName: 'مطار الدوحة',
      subtitle: 'مطار حمد الدولي (DOH)',
      price: 200,
      icon: '✈️',
      description: 'أحد أفضل وأفخم مطارات العالم. يتضاعف إيجار المطارات بزيادة عددها.'
    },

    // 36: مفاجأة (Surprise)
    {
      id: 36,
      type: 'chance',
      name: 'مفاجأة',
      shortName: 'مفاجأة',
      subtitle: 'اسحب بطاقة مفاجأة',
      icon: '❓',
      description: 'اسحب بطاقة مفاجأة واكتشف ما يخبئه لك الحظ!'
    },

    // 37: مصر - قنا
    {
      id: 37,
      type: 'property',
      name: 'قنا',
      shortName: 'قنا',
      subtitle: 'صعيد مصر العريق ومعبد دندرة',
      country: 'مصر',
      flag: '🇪🇬',
      group: 'royal',
      price: 350,
      houseCost: 200,
      rent: [35, 175, 500, 1100, 1300, 1500],
      icon: '🏛️'
    },

    // 38: ضريبة الرفاهية والكماليات
    {
      id: 38,
      type: 'tax',
      name: 'ضريبة الرفاهية',
      shortName: 'ضريبة كماليات',
      subtitle: 'ادفع 75$',
      taxAmount: 75,
      icon: '💎',
      description: 'رسوم فخامة ومقتنيات فاخرة: ادفع 75$ للخزينة العامة.'
    },

    // 39: مصر - القاهرة
    {
      id: 39,
      type: 'property',
      name: 'القاهرة',
      shortName: 'القاهرة',
      subtitle: 'قاهرة المعز وبرج القاهرة والأهرامات',
      country: 'مصر',
      flag: '🇪🇬',
      group: 'royal',
      price: 400,
      houseCost: 200,
      rent: [50, 200, 600, 1400, 1700, 2000],
      icon: '👑'
    }
  ];

  /**
   * بطاقات المفاجأة (Surprise Cards)
   */
  const CHANCE_CARDS = [
    {
      id: 'ch_1',
      title: 'انطلاقة سريعة!',
      text: 'انطلق فوراً إلى خانة البداية (START) واستلم راتبك 200$!',
      action: 'move_to',
      target: 0,
      collectGo: true
    },
    {
      id: 'ch_2',
      title: 'رحلة إلى قاهرة المعز',
      text: 'مؤتمر استثماري كبير في العاصمة المصرية.. تقدّم فوراً إلى القاهرة!',
      action: 'move_to',
      target: 39,
      collectGo: true
    },
    {
      id: 'ch_3',
      title: 'عروس البحر المتوسط',
      text: 'عطلة بحرية منعشة على كورنيش الإسكندرية.. تقدّم إلى الإسكندرية!',
      action: 'move_to',
      target: 37,
      collectGo: true
    },
    {
      id: 'ch_4',
      title: 'رحلة طيران دولية',
      text: 'تقدّم إلى مطار القاهرة الدولي، وإذا مررت بخانة البداية استلم 200$.',
      action: 'move_to',
      target: 5,
      collectGo: true
    },
    {
      id: 'ch_5',
      title: 'سحر دانة الدنيا دبي',
      text: 'زيارة لبرج خليفة ومركز الأعمال الدولي.. تقدّم مباشرة إلى دبي!',
      action: 'move_to',
      target: 29,
      collectGo: true
    },
    {
      id: 'ch_6',
      title: 'أرباح البورصة العربية',
      text: 'ارتفعت استثماراتك في الأسهم الخليجية والعربية.. استلم 150$ من البنك!',
      action: 'receive_cash',
      amount: 150
    },
    {
      id: 'ch_7',
      title: 'مخالفة سرعة على الطريق السريع',
      text: 'تجاوزت السرعة القانونية على الطريق الساحلي الدولي.. ادفع غرامة 50$.',
      action: 'pay_cash',
      amount: 50
    },
    {
      id: 'ch_8',
      title: 'بطاقة خروج مجاني من السجن',
      text: 'حصلت على عفو قضائي خاص! احتفظ بهذه البطاقة للخروج من السجن مجاناً.',
      action: 'jail_free_card'
    },
    {
      id: 'ch_9',
      title: 'إلى السجن فوراً!',
      text: 'تم ضبطك في مخالفة مالية كبرى.. توجّه إلى السجن فوراً ولا تمر بالبداية!',
      action: 'go_to_jail'
    },
    {
      id: 'ch_10',
      title: 'صيانة وتطوير العقارات',
      text: 'أعمال تجديد وتكييف لممتلكاتك: ادفع 25$ عن كل منزل و100$ عن كل فندق تمتلكه.',
      action: 'repair_buildings',
      houseFee: 25,
      hotelFee: 100
    },
    {
      id: 'ch_11',
      title: 'توزيع أرباح الشراكة',
      text: 'توزع أرباح المشاريع على الأصدقاء: ادفع 20$ لكل لاعب على الطاولة.',
      action: 'pay_each_player',
      amount: 20
    },
    {
      id: 'ch_12',
      title: 'مهرجان التراث والسياحة',
      text: 'فاز جناحك بجائزة أفضل مشروع سياحي عربي! خذ 100$ من البنك.',
      action: 'receive_cash',
      amount: 100
    },
    {
      id: 'ch_13',
      title: 'تراجع للخلف 3 خطوات',
      text: 'ازدحام مروري خانق على الجسر.. تراجع إلى الخلف 3 خانات.',
      action: 'move_steps',
      steps: -3
    },
    {
      id: 'ch_14',
      title: 'توجّه لأقرب مطار دولي',
      text: 'رحلة سفر عاجلة.. تقدّم لأقرب مطار وادفع ضعف الإيجار للمالك إن كان مملوكاً.',
      action: 'move_nearest_station'
    },
    {
      id: 'ch_15',
      title: 'توجّه لأقرب شركة مرافق',
      text: 'انقطاع خدمات مؤقت.. تقدّم لأقرب شركة مرافق (كهرباء أو مياه).',
      action: 'move_nearest_utility'
    },
    {
      id: 'ch_16',
      title: 'جائزة ريادة الأعمال الشابة',
      text: 'تقديراً لمشاريعك الذكية، حصلت على منحة تمويلية بقيمة 50$.',
      action: 'receive_cash',
      amount: 50
    }
  ];

  /**
   * بطاقات صندوق الكنز (Treasure Cards)
   */
  const COMMUNITY_CARDS = [
    {
      id: 'cc_1',
      title: 'عائدات الصناديق السيادية',
      text: 'أودعت عوائد استثماراتك السنوية في حسابك.. استلم 200$ من البنك!',
      action: 'receive_cash',
      amount: 200
    },
    {
      id: 'cc_2',
      title: 'يوم ميلاد سعيد!',
      text: 'يحتفل أصدقاؤك بيوم ميلادك.. يحصل صاحب العيد على 20$ من كل لاعب!',
      action: 'collect_from_players',
      amount: 20
    },
    {
      id: 'cc_3',
      title: 'إلى السجن مباشرة!',
      text: 'حكمت المحكمة المالية بإيقافك.. توجّه إلى السجن ولا تمر بخانة البداية.',
      action: 'go_to_jail'
    },
    {
      id: 'cc_4',
      title: 'بطاقة عفو قضائي من السجن',
      text: 'أمر إفراج فوري نافذ المفعول! احتفظ بالبطاقة لتخرج من السجن وقت الحاجة.',
      action: 'jail_free_card'
    },
    {
      id: 'cc_5',
      title: 'رد رسوم وفواتير حكومية',
      text: 'خطأ محاسبي لصالحك لدى الدائرة المالية.. استرد مبلغ 50$ الآن.',
      action: 'receive_cash',
      amount: 50
    },
    {
      id: 'cc_6',
      title: 'فحص دوري وتأمين صحي',
      text: 'تكاليف التأمين الصحي الشامل والفحص الدوري.. ادفع 50$.',
      action: 'pay_cash',
      amount: 50
    },
    {
      id: 'cc_7',
      title: 'صيانة شاملة للمحافظات',
      text: 'ترميم وتجميل المدن.. ادفع 40$ عن كل منزل و115$ عن كل فندق تمتلكه.',
      action: 'repair_buildings',
      houseFee: 40,
      hotelFee: 115
    },
    {
      id: 'cc_8',
      title: 'انطلاق نحو البداية',
      text: 'تقدّم فوراً إلى خانة البداية (START) واستلم 200$.',
      action: 'move_to',
      target: 0,
      collectGo: true
    },
    {
      id: 'cc_9',
      title: 'جائزة مسابقة الابتكار العربي',
      text: 'فاز بحثك بالمركز الثاني في معرض الاختراعات العربي.. استلم 100$.',
      action: 'receive_cash',
      amount: 100
    },
    {
      id: 'cc_10',
      title: 'رسوم تجديد التراخيص التجارية',
      text: 'تجديد السجل التجاري ورخصة الاستثمار.. ادفع 100$ للبلدية.',
      action: 'pay_cash',
      amount: 100
    },
    {
      id: 'cc_11',
      title: 'بيع محاصيل التمور الفاخرة',
      text: 'صفقة بيع تمور وادي الدواسر والمدينة المنورة بنجاح.. استلم 25$.',
      action: 'receive_cash',
      amount: 25
    },
    {
      id: 'cc_12',
      title: 'استرداد تأمين مسترد',
      text: 'انتهت مدة العقد بنجاح وتم استرداد وديعة التأمين.. خذ 20$.',
      action: 'receive_cash',
      amount: 20
    },
    {
      id: 'cc_13',
      title: 'دعم صندق الأيتام والخير',
      text: 'تبرع طوعي لمؤسسة الرعاية المجتمعية.. ادفع 50$.',
      action: 'pay_cash',
      amount: 50
    },
    {
      id: 'cc_14',
      title: 'أرباح التأمين على السفن',
      text: 'عوائد استثمارية في وثائق الشحن البحري.. استلم 100$.',
      action: 'receive_cash',
      amount: 100
    },
    {
      id: 'cc_15',
      title: 'مكافأة الاستشارات المالية',
      text: 'قدّمت استشارة استراتيجية ناجحة لأحد المستثمرين.. استلم 25$.',
      action: 'receive_cash',
      amount: 25
    },
    {
      id: 'cc_16',
      title: 'تكلفة ترخيص المباني الذكية',
      text: 'رسوم كود البناء الحديث والتطوير الحضري.. ادفع 50$.',
      action: 'pay_cash',
      amount: 50
    }
  ];

  BOARD_TILES.forEach(function (tile) {
    if (tile.group && COLOR_GROUPS[tile.group]) {
      tile.flagSvg = COLOR_GROUPS[tile.group].flagSvg;
      tile.flag = COLOR_GROUPS[tile.group].flag;
    }
  });

  /**
   * حساب إحداثيات الشبكة 11×11 تماماً كما في Richup.io:
   * - الخانة 0 (START): أعلى اليسار (الصف 1، العمود 1)
   * - الخانات 1..9 (الحافة العليا): الصف 1، الأعمدة 2 إلى 10 (من اليسار لليمين)
   * - الخانة 10 (السجن): أعلى اليمين (الصف 1، العمود 11)
   * - الخانات 11..19 (الحافة اليمنى): الصفوف 2 إلى 10، العمود 11 (من الأعلى للأسفل)
   * - الخانة 20 (العطلة والاستراحة): أسفل اليمين (الصف 11، العمود 11)
   * - الخانات 21..29 (الحافة السفلى): الصف 11، الأعمدة 10 إلى 2 (من اليمين لليسار)
   * - الخانة 30 (إلى السجن فوراً): أسفل اليسار (الصف 11، العمود 1)
   * - الخانات 31..39 (الحافة اليسرى): الصفوف 10 إلى 2، العمود 1 (من الأسفل للأعلى)
   */
  function getGridCoords(tileId) {
    const id = Number(tileId) || 0;
    if (id === 0) return { row: 1, col: 1, side: 'corner-tl' };
    if (id > 0 && id < 10) return { row: 1, col: 1 + id, side: 'top' };
    if (id === 10) return { row: 1, col: 11, side: 'corner-tr' };
    if (id > 10 && id < 20) return { row: 1 + (id - 10), col: 11, side: 'right' };
    if (id === 20) return { row: 11, col: 11, side: 'corner-br' };
    if (id > 20 && id < 30) return { row: 11, col: 11 - (id - 20), side: 'bottom' };
    if (id === 30) return { row: 11, col: 1, side: 'corner-bl' };
    return { row: 11 - (id - 30), col: 1, side: 'left' };
  }

  function isPurchasable(tile) {
    return tile && (tile.type === 'property' || tile.type === 'station' || tile.type === 'utility');
  }

  function getGroupTiles(groupId) {
    return BOARD_TILES.filter(function (t) {
      return t.group === groupId;
    });
  }

  function formatMoney(amount) {
    const n = Math.round(Number(amount) || 0);
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    return sign + '$' + abs.toLocaleString('en-US');
  }

  return {
    GAME_CONFIG: GAME_CONFIG,
    PLAYER_PRESETS: PLAYER_PRESETS,
    COLOR_GROUPS: COLOR_GROUPS,
    BOARD_TILES: BOARD_TILES,
    CHANCE_CARDS: CHANCE_CARDS,
    COMMUNITY_CARDS: COMMUNITY_CARDS,
    getGridCoords: getGridCoords,
    isPurchasable: isPurchasable,
    getGroupTiles: getGroupTiles,
    formatMoney: formatMoney
  };
});
