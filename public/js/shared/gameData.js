(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BankElHazData = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GAME_CONFIG = {
    MIN_PLAYERS: 2,
    MAX_PLAYERS: 6,
    STARTING_CASH: 15000,
    GO_SALARY: 2000,
    JAIL_BAIL: 500,
    MAX_JAIL_TURNS: 3,
    CURRENCY: 'ج.م',
    STATION_RENTS: [250, 500, 1000, 2000],
    UTILITY_MULTIPLIERS: {
      SINGLE: 40,
      BOTH: 100
    }
  };

  const PLAYER_PRESETS = [
    { id: 'pharaoh', name: 'تاج الفرعون', icon: '👑', color: '#f59e0b' },
    { id: 'pyramid', name: 'الهرم الذهبي', icon: '🏛️', color: '#ef4444' },
    { id: 'felucca', name: 'فلوكة النيل', icon: '⛵', color: '#06b6d4' },
    { id: 'falcon', name: 'صقر حورس', icon: '🦅', color: '#10b981' },
    { id: 'camel', name: 'سفينة الصحراء', icon: '🐪', color: '#a855f7' },
    { id: 'sphinx', name: 'أسد قصر النيل', icon: '🦁', color: '#ec4899' }
  ];

  const COLOR_GROUPS = {
    brown: { id: 'brown', name: 'شمال الصعيد', color: '#8d5524', textColor: '#ffffff', count: 2 },
    sky: { id: 'sky', name: 'وسط الصعيد', color: '#0ea5e9', textColor: '#ffffff', count: 3 },
    pink: { id: 'pink', name: 'مدن القناة', color: '#d946ef', textColor: '#ffffff', count: 3 },
    orange: { id: 'orange', name: 'عروس الدلتا', color: '#f97316', textColor: '#ffffff', count: 3 },
    red: { id: 'red', name: 'السياحة الشاطئية', color: '#ef4444', textColor: '#ffffff', count: 3 },
    yellow: { id: 'yellow', name: 'كنوز الجنوب والآثار', color: '#eab308', textColor: '#1e293b', count: 3 },
    green: { id: 'green', name: 'المدن الكبرى والحديثة', color: '#16a34a', textColor: '#ffffff', count: 3 },
    royal: { id: 'royal', name: 'درّة الجمهورية', color: '#1d4ed8', textColor: '#ffffff', count: 2 }
  };

  const BOARD_TILES = [
    {
      id: 0,
      type: 'go',
      name: 'البداية',
      shortName: 'البداية',
      subtitle: 'تقاضَ 2,000 ج.م',
      icon: '🚀',
      description: 'نقطة الانطلاق! في كل مرة تمر بها أو تقف عليها تتقاضى 2,000 ج.م من البنك.'
    },
    {
      id: 1,
      type: 'property',
      name: 'الفيوم',
      shortName: 'الفيوم',
      subtitle: 'شلالات وادي الريان',
      group: 'brown',
      price: 600,
      houseCost: 500,
      rent: [20, 100, 300, 900, 1600, 2500],
      icon: '🌴'
    },
    {
      id: 2,
      type: 'community',
      name: 'صندوق المحكمة',
      shortName: 'المحكمة',
      subtitle: 'اسحب بطاقة محكمة',
      icon: '⚖️',
      description: 'اسحب بطاقة من صندوق المحكمة ونفّذ الحكم المذكور فيها.'
    },
    {
      id: 3,
      type: 'property',
      name: 'بني سويف',
      shortName: 'بني سويف',
      subtitle: 'هرم ميدوم',
      group: 'brown',
      price: 600,
      houseCost: 500,
      rent: [40, 200, 600, 1800, 3200, 4500],
      icon: '🌾'
    },
    {
      id: 4,
      type: 'tax',
      name: 'ضريبة الدخل',
      shortName: 'ضريبة الدخل',
      subtitle: 'ادفع 2,000 ج.م',
      taxAmount: 2000,
      icon: '🧾',
      description: 'مصلحة الضرائب العامة: ادفع ضريبة الدخل وقدرها 2,000 ج.م.'
    },
    {
      id: 5,
      type: 'station',
      name: 'محطة مصر',
      shortName: 'محطة مصر',
      subtitle: 'ميدان رمسيس',
      price: 2000,
      icon: '🚆',
      description: 'محطة السكك الحديدية الرئيسية بالقاهرة. يتضاعف الإيجار كلما امتلكت محطات نقل أكثر.'
    },
    {
      id: 6,
      type: 'property',
      name: 'المنيا',
      shortName: 'المنيا',
      subtitle: 'عروس الصعيد',
      group: 'sky',
      price: 1000,
      houseCost: 500,
      rent: [60, 300, 900, 2700, 4000, 5500],
      icon: '🏺'
    },
    {
      id: 7,
      type: 'chance',
      name: 'مفاجأة',
      shortName: 'فرصة',
      subtitle: 'اسحب بطاقة فرصة',
      icon: '🎁',
      description: 'اسحب بطاقة مفاجأة (فرصة) واكتشف ما يخبئه لك الحظ اليوم!'
    },
    {
      id: 8,
      type: 'property',
      name: 'أسيوط',
      shortName: 'أسيوط',
      subtitle: 'قناطر أسيوط',
      group: 'sky',
      price: 1000,
      houseCost: 500,
      rent: [60, 300, 900, 2700, 4000, 5500],
      icon: '🌊'
    },
    {
      id: 9,
      type: 'property',
      name: 'سوهاج',
      shortName: 'سوهاج',
      subtitle: 'معبد أبيدوس',
      group: 'sky',
      price: 1200,
      houseCost: 500,
      rent: [80, 400, 1000, 3000, 4500, 6000],
      icon: '🏛️'
    },
    {
      id: 10,
      type: 'jail',
      name: 'السجن / زيارة',
      shortName: 'السجن',
      subtitle: 'زيارة فقط أو حجز',
      icon: '🔒',
      description: 'إذا وقفت هنا بشكل عادي فأنت في زيارة فقط. أما المحتجز فعليه دفع 500 ج.م أو استخدام بطاقة عفو أو رمي الدبل.'
    },
    {
      id: 11,
      type: 'property',
      name: 'الإسماعيلية',
      shortName: 'الإسماعيلية',
      subtitle: 'بحيرة التمساح',
      group: 'pink',
      price: 1400,
      houseCost: 1000,
      rent: [100, 500, 1500, 4500, 6250, 7500],
      icon: '🥭'
    },
    {
      id: 12,
      type: 'utility',
      name: 'شركة الكهرباء',
      shortName: 'الكهرباء',
      subtitle: 'مرفق عام',
      price: 1500,
      icon: '⚡',
      description: 'مرفق حيوي: الإيجار يساوي 40 ضعف مجموع النرد إذا امتلكت مرفقاً واحداً، و100 ضعف إذا امتلكت الكهرباء والمياه معاً!'
    },
    {
      id: 13,
      type: 'property',
      name: 'السويس',
      shortName: 'السويس',
      subtitle: 'مدخل القناة الجنوبي',
      group: 'pink',
      price: 1400,
      houseCost: 1000,
      rent: [100, 500, 1500, 4500, 6250, 7500],
      icon: '⚓'
    },
    {
      id: 14,
      type: 'property',
      name: 'بورسعيد',
      shortName: 'بورسعيد',
      subtitle: 'المدينة الباسلة',
      group: 'pink',
      price: 1600,
      houseCost: 1000,
      rent: [120, 600, 1800, 5000, 7000, 9000],
      icon: '🚢'
    },
    {
      id: 15,
      type: 'station',
      name: 'مترو الأنفاق',
      shortName: 'مترو الأنفاق',
      subtitle: 'شبكة مترو القاهرة',
      price: 2000,
      icon: '🚇',
      description: 'شريان المواصلات الأسرع في مصر. يتضاعف الإيجار بزيادة عدد محطات النقل التي تملكها.'
    },
    {
      id: 16,
      type: 'property',
      name: 'الغربية',
      shortName: 'طنطا',
      subtitle: 'قلب الدلتا - طنطا',
      group: 'orange',
      price: 1800,
      houseCost: 1000,
      rent: [140, 700, 2000, 5500, 7500, 9500],
      icon: '🕌'
    },
    {
      id: 17,
      type: 'community',
      name: 'صندوق المحكمة',
      shortName: 'المحكمة',
      subtitle: 'اسحب بطاقة محكمة',
      icon: '⚖️',
      description: 'اسحب بطاقة من صندوق المحكمة ونفّذ الحكم المذكور فيها.'
    },
    {
      id: 18,
      type: 'property',
      name: 'الدقهلية',
      shortName: 'المنصورة',
      subtitle: 'عروس النيل - المنصورة',
      group: 'orange',
      price: 1800,
      houseCost: 1000,
      rent: [140, 700, 2000, 5500, 7500, 9500],
      icon: '🌿'
    },
    {
      id: 19,
      type: 'property',
      name: 'دمياط',
      shortName: 'دمياط',
      subtitle: 'قلعة الأثاث والحلويات',
      group: 'orange',
      price: 2000,
      houseCost: 1000,
      rent: [160, 800, 2200, 6000, 8000, 10000],
      icon: '🛋️'
    },
    {
      id: 20,
      type: 'parking',
      name: 'استراحة النيل',
      shortName: 'استراحة',
      subtitle: 'كورنيش النيل المجاني',
      icon: '☕',
      description: 'استراحة هادئة على ضفاف النيل! إذا كانت خزينة الضرائب مفعّلة في الغرفة فستحصل على ما بداخلها.'
    },
    {
      id: 21,
      type: 'property',
      name: 'مرسى مطروح',
      shortName: 'مطروح',
      subtitle: 'شاطئ عجيبة الفيروزي',
      group: 'red',
      price: 2200,
      houseCost: 1500,
      rent: [180, 900, 2500, 7000, 8750, 10500],
      icon: '🏖️'
    },
    {
      id: 22,
      type: 'chance',
      name: 'مفاجأة',
      shortName: 'فرصة',
      subtitle: 'اسحب بطاقة فرصة',
      icon: '🎁',
      description: 'اسحب بطاقة مفاجأة (فرصة) واكتشف ما يخبئه لك الحظ اليوم!'
    },
    {
      id: 23,
      type: 'property',
      name: 'الغردقة',
      shortName: 'الغردقة',
      subtitle: 'لؤلؤة البحر الأحمر',
      group: 'red',
      price: 2200,
      houseCost: 1500,
      rent: [180, 900, 2500, 7000, 8750, 10500],
      icon: '🐬'
    },
    {
      id: 24,
      type: 'property',
      name: 'شرم الشيخ',
      shortName: 'شرم الشيخ',
      subtitle: 'مدينة السلام - جنوب سيناء',
      group: 'red',
      price: 2400,
      houseCost: 1500,
      rent: [200, 1000, 3000, 7500, 9250, 11000],
      icon: '🪸'
    },
    {
      id: 25,
      type: 'station',
      name: 'ميناء الإسكندرية',
      shortName: 'ميناء الإسكندرية',
      subtitle: 'الميناء البحري الكبير',
      price: 2000,
      icon: '⛴️',
      description: 'أكبر موانئ مصر التجارية على البحر المتوسط. يرتفع الإيجار بامتلاك محطات نقل إضافية.'
    },
    {
      id: 26,
      type: 'property',
      name: 'قنا',
      shortName: 'قنا',
      subtitle: 'معبد دندرة العريق',
      group: 'yellow',
      price: 2600,
      houseCost: 1500,
      rent: [220, 1100, 3300, 8000, 9750, 11500],
      icon: '☀️'
    },
    {
      id: 27,
      type: 'property',
      name: 'أسوان',
      shortName: 'أسوان',
      subtitle: 'السد العالي ومعبد فيلة',
      group: 'yellow',
      price: 2600,
      houseCost: 1500,
      rent: [220, 1100, 3300, 8000, 9750, 11500],
      icon: '⛵'
    },
    {
      id: 28,
      type: 'utility',
      name: 'شركة المياه',
      shortName: 'المياه',
      subtitle: 'مرفق عام',
      price: 1500,
      icon: '💧',
      description: 'مرفق حيوي: الإيجار يساوي 40 ضعف مجموع النرد لمرفق واحد، و100 ضعف إذا امتلكت الكهرباء والمياه معاً!'
    },
    {
      id: 29,
      type: 'property',
      name: 'الأقصر',
      shortName: 'الأقصر',
      subtitle: 'ثلث آثار العالم - الكرنك',
      group: 'yellow',
      price: 2800,
      houseCost: 1500,
      rent: [240, 1200, 3600, 8500, 10250, 12000],
      icon: '🛕'
    },
    {
      id: 30,
      type: 'go_to_jail',
      name: 'اذهب إلى السجن',
      shortName: 'إلى السجن!',
      subtitle: 'تحرك فوراً للسجن',
      icon: '🚓',
      description: 'توجّه مباشرةً إلى السجن! لا تمر بخانة البداية ولا تتقاضَ مكافأة المرور.'
    },
    {
      id: 31,
      type: 'property',
      name: 'العلمين الجديدة',
      shortName: 'العلمين',
      subtitle: 'أبراج الساحل الشمالي',
      group: 'green',
      price: 3000,
      houseCost: 2000,
      rent: [260, 1300, 3900, 9000, 11000, 12750],
      icon: '🏙️'
    },
    {
      id: 32,
      type: 'property',
      name: 'العاصمة الإدارية',
      shortName: 'العاصمة الجديدة',
      subtitle: 'البرج الأيقوني',
      group: 'green',
      price: 3000,
      houseCost: 2000,
      rent: [260, 1300, 3900, 9000, 11000, 12750],
      icon: '🏢'
    },
    {
      id: 33,
      type: 'community',
      name: 'صندوق المحكمة',
      shortName: 'المحكمة',
      subtitle: 'اسحب بطاقة محكمة',
      icon: '⚖️',
      description: 'اسحب بطاقة من صندوق المحكمة ونفّذ الحكم المذكور فيها.'
    },
    {
      id: 34,
      type: 'property',
      name: 'الجيزة',
      shortName: 'الجيزة',
      subtitle: 'أهرامات الجيزة والمتحف الكبير',
      group: 'green',
      price: 3200,
      houseCost: 2000,
      rent: [280, 1500, 4500, 10000, 12000, 14000],
      icon: '🔺'
    },
    {
      id: 35,
      type: 'station',
      name: 'مطار القاهرة',
      shortName: 'مطار القاهرة',
      subtitle: 'مطار القاهرة الدولي',
      price: 2000,
      icon: '✈️',
      description: 'بوابة مصر الجوية للعالم. يتضاعف الإيجار بزيادة عدد محطات النقل التي تملكها.'
    },
    {
      id: 36,
      type: 'chance',
      name: 'مفاجأة',
      shortName: 'فرصة',
      subtitle: 'اسحب بطاقة فرصة',
      icon: '🎁',
      description: 'اسحب بطاقة مفاجأة (فرصة) واكتشف ما يخبئه لك الحظ اليوم!'
    },
    {
      id: 37,
      type: 'property',
      name: 'الإسكندرية',
      shortName: 'الإسكندرية',
      subtitle: 'عروس البحر المتوسط وقايتباي',
      group: 'royal',
      price: 3500,
      houseCost: 2000,
      rent: [350, 1750, 5000, 11000, 13000, 15000],
      icon: '🏰'
    },
    {
      id: 38,
      type: 'tax',
      name: 'ضريبة الرفاهية',
      shortName: 'ضريبة الرفاهية',
      subtitle: 'ادفع 1,000 ج.م',
      taxAmount: 1000,
      icon: '💎',
      description: 'رسوم أملاك فاخرة ورفاهية: ادفع 1,000 ج.م للبنك.'
    },
    {
      id: 39,
      type: 'property',
      name: 'القاهرة',
      shortName: 'القاهرة',
      subtitle: 'قاهرة المعز وبرج القاهرة',
      group: 'royal',
      price: 4000,
      houseCost: 2000,
      rent: [500, 2000, 6000, 14000, 17000, 20000],
      icon: '🗼'
    }
  ];

  const CHANCE_CARDS = [
    {
      id: 'ch_1',
      title: 'انطلاقة جديدة!',
      text: 'انطلق مباشرةً إلى خانة البداية وتقاضَ مكافأة المرور (2,000 ج.م)!',
      action: 'move_to',
      target: 0,
      collectGo: true
    },
    {
      id: 'ch_2',
      title: 'اجتماع في قلب العاصمة',
      text: 'رحلة عمل عاجلة إلى قاهرة المعز.. تقدّم إلى القاهرة!',
      action: 'move_to',
      target: 39,
      collectGo: true
    },
    {
      id: 'ch_3',
      title: 'نسمة بحر إسكندراني',
      text: 'قررت قضاء عطلة الصيف على الكورنيش.. تقدّم إلى الإسكندرية!',
      action: 'move_to',
      target: 37,
      collectGo: true
    },
    {
      id: 'ch_4',
      title: 'قطار الـ VIP يتحرك!',
      text: 'تقدّم إلى محطة مصر (رمسيس)، وإذا مررت بخانة البداية تقاضَ 2,000 ج.م.',
      action: 'move_to',
      target: 5,
      collectGo: true
    },
    {
      id: 'ch_5',
      title: 'سحر الحضارة الفرعونية',
      text: 'جولة سياحية لمعابد الكرنك وطريق الكباش.. تقدّم إلى الأقصر!',
      action: 'move_to',
      target: 29,
      collectGo: true
    },
    {
      id: 'ch_6',
      title: 'أرباح قناة السويس',
      text: 'أسهمك الاستثمارية حققت عوائد قياسية هذا الربع! تقاضَ 1,500 ج.م من البنك.',
      action: 'money',
      amount: 1500
    },
    {
      id: 'ch_7',
      title: 'فوازير رمضان',
      text: 'فزت بالجائزة الكبرى في مسابقة التليفزيون المصري! تقاضَ 1,000 ج.م.',
      action: 'money',
      amount: 1000
    },
    {
      id: 'ch_8',
      title: 'رادار الطريق الدائري 📸',
      text: 'تم رصد مخالفة سرعة وعدم ربط الحزام على الدائري.. ادفع غرامة 300 ج.م.',
      action: 'money',
      amount: -300
    },
    {
      id: 'ch_9',
      title: 'زحمة كوبري 6 أكتوبر!',
      text: 'تكدس مروري مفاجئ اضطرك لتغيير مسارك.. ارجع 3 خانات للخلف.',
      action: 'move_steps',
      steps: -3
    },
    {
      id: 'ch_10',
      title: 'تذكرة مستعجلة',
      text: 'تقدّم إلى أقرب محطة نقل، وإذا كانت مملوكة للاعب آخر ادفع له ضعف الإيجار المستحق!',
      action: 'nearest_station',
      doubleRent: true
    },
    {
      id: 'ch_11',
      title: 'فحص المرافق العامة',
      text: 'تقدّم إلى أقرب مرفق عام (شركة الكهرباء أو شركة المياه).',
      action: 'nearest_utility'
    },
    {
      id: 'ch_12',
      title: 'صيانة الموسم السياحي',
      text: 'تجهيز وتجميل عقاراتك: ادفع 250 ج.م عن كل منزل و1,000 ج.م عن كل فندق تملكه.',
      action: 'repairs',
      houseCost: 250,
      hotelCost: 1000
    },
    {
      id: 'ch_13',
      title: 'عزومة كشري وحلويات!',
      text: 'احتفالاً بصفقتك الأخيرة عزمت كل اللاعبين على الغداء والحلو! ادفع 250 ج.م لكل لاعب.',
      action: 'pay_each_player',
      amount: 250
    },
    {
      id: 'ch_14',
      title: 'عفو خاص',
      text: 'بطاقة خروج من السجن مجاناً! يمكنك الاحتفاظ بها لاستخدامها لاحقاً أو مقايضتها.',
      action: 'jail_free'
    },
    {
      id: 'ch_15',
      title: 'مخالفة بناء بدون ترخيص!',
      text: 'صدر قرار بإيقاف الأعمال والتحفظ عليك.. اذهب إلى السجن مباشرةً دون المرور بالبداية!',
      action: 'go_to_jail'
    },
    {
      id: 'ch_16',
      title: 'شهادات الادخار البنكية',
      text: 'تم إيداع عائد شهادات الاستثمار في حسابك.. تقاضَ 750 ج.م.',
      action: 'money',
      amount: 750
    }
  ];

  const COMMUNITY_CARDS = [
    {
      id: 'cm_1',
      title: 'حكم تعويض لصالحك!',
      text: 'حكمت المحكمة الاقتصادية بتعويضك في نزاع تجاري.. تقاضَ 2,000 ج.م.',
      action: 'money',
      amount: 2000
    },
    {
      id: 'cm_2',
      title: 'استرداد ضريبي',
      text: 'فرق تسوية ضريبية لصالحك من مصلحة الضرائب.. تقاضَ 500 ج.م.',
      action: 'money',
      amount: 500
    },
    {
      id: 'cm_3',
      title: 'موسم دخول المدارس',
      text: 'مصاريف المدارس والكتب والزي المدرسي.. ادفع 750 ج.م.',
      action: 'money',
      amount: -750
    },
    {
      id: 'cm_4',
      title: 'فاتورة مستشفى خاص',
      text: 'إجراء فحوصات طبية شاملة وأشعة.. ادفع 500 ج.م.',
      action: 'money',
      amount: -500
    },
    {
      id: 'cm_5',
      title: 'النهارده فرحك! 🎉',
      text: 'ألف مبروك يا عريس/عروسة! اجمع "نقطة الفرح" 200 ج.م من كل لاعب في الغرفة.',
      action: 'collect_each_player',
      amount: 200
    },
    {
      id: 'cm_6',
      title: 'ميراث العائلة',
      text: 'نصيبك من بيع فدان أرض زراعية في المنصورة.. تقاضَ 1,200 ج.م.',
      action: 'money',
      amount: 1200
    },
    {
      id: 'cm_7',
      title: 'حكم بالبراءة!',
      text: 'بطاقة خروج من السجن مجاناً بأمر المحكمة! يمكنك الاحتفاظ بها أو مقايضتها.',
      action: 'jail_free'
    },
    {
      id: 'cm_8',
      title: 'ضبط وإحضار!',
      text: 'ثبت عليك التهرب من سداد رسوم رسمية.. اذهب إلى السجن فوراً دون المرور بالبداية!',
      action: 'go_to_jail'
    },
    {
      id: 'cm_9',
      title: 'قرار تنسيق حضاري',
      text: 'إلزام الملاك بطلاء الواجهات وصيانة المصاعد: ادفع 400 ج.م عن كل منزل و1,150 ج.م عن كل فندق.',
      action: 'repairs',
      houseCost: 400,
      hotelCost: 1150
    },
    {
      id: 'cm_10',
      title: 'مكافأة نهاية السنة',
      text: 'صرف الأرباح السنوية والحوافز من شركتك.. تقاضَ 1,000 ج.م.',
      action: 'money',
      amount: 1000
    },
    {
      id: 'cm_11',
      title: 'ونش المرور في وسط البلد!',
      text: 'ركنت صف تاني في التحرير وتم رفع سيارتك بالونش.. ادفع غرامة 400 ج.م.',
      action: 'money',
      amount: -400
    },
    {
      id: 'cm_12',
      title: 'صفقة في خان الخليلي',
      text: 'بعت تحفاً ومشغولات نحاسية لوفد سياحي وحققت ربحاً رائعاً! تقاضَ 600 ج.م.',
      action: 'money',
      amount: 600
    },
    {
      id: 'cm_13',
      title: 'منحة تشجيعية',
      text: 'تقدّم مباشرةً إلى خانة البداية وتقاضَ 2,000 ج.م!',
      action: 'move_to',
      target: 0,
      collectGo: true
    },
    {
      id: 'cm_14',
      title: 'رسوم الشهر العقاري',
      text: 'توثيق عقود وتسجيل ملكيات عقارية.. ادفع 500 ج.م.',
      action: 'money',
      amount: -500
    },
    {
      id: 'cm_15',
      title: 'جائزة أفضل مستثمر شاب',
      text: 'فاز مشروعك بالمركز الأول في معرض القاهرة الدولي! تقاضَ 800 ج.م.',
      action: 'money',
      amount: 800
    },
    {
      id: 'cm_16',
      title: 'مبادرة تنمية القرى',
      text: 'مساهمة مجتمعية لتطوير المدارس والمراكز الصحية.. ادفع 300 ج.م.',
      action: 'money',
      amount: -300
    }
  ];

  function getGridCoords(tileId) {
    if (tileId === 0) return { row: 11, col: 11, side: 'corner-br' };
    if (tileId > 0 && tileId < 10) return { row: 11, col: 11 - tileId, side: 'bottom' };
    if (tileId === 10) return { row: 11, col: 1, side: 'corner-bl' };
    if (tileId > 10 && tileId < 20) return { row: 11 - (tileId - 10), col: 1, side: 'left' };
    if (tileId === 20) return { row: 1, col: 1, side: 'corner-tl' };
    if (tileId > 20 && tileId < 30) return { row: 1, col: 1 + (tileId - 20), side: 'top' };
    if (tileId === 30) return { row: 1, col: 11, side: 'corner-tr' };
    return { row: 1 + (tileId - 30), col: 11, side: 'right' };
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
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(Math.round(Number(amount) || 0));
    return sign + abs.toLocaleString('en-US') + ' ' + GAME_CONFIG.CURRENCY;
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

