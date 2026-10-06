// Програмата „Покани колеги“ е спряна засега. true я връща навсякъде.
export const INVITES_ON = true; // вече се управлява от админа: Настройки → Общи → Препоръки

// ProfiTaxi – справочници

export const CAR_TYPES = {
  own: { label: 'Собствена', hint: 'Колата е твоя (и на лизинг)', icon: 'car' },
  rent: { label: 'Под наем', hint: 'Плащаш наем', icon: 'key' },
};

export const FUELS = {
  petrol: { label: 'Бензин', types: ['petrol'] },
  petrol_lpg: { label: 'Бензин + Газ', types: ['lpg', 'petrol'] },
  diesel: { label: 'Дизел', types: ['diesel'] },
  hybrid: { label: 'Хибрид', types: ['petrol'] },
  lpg: { label: 'Само газ', types: ['lpg'] },
  petrol_cng: { label: 'Бензин + Метан', types: ['cng', 'petrol'] },
  cng: { label: 'Метан', types: ['cng'] },
  electric: { label: 'Ток', types: ['electric'] },
};

export const FUEL_TYPES = {
  petrol: { label: 'Бензин', unit: 'л' },
  lpg: { label: 'Газ', unit: 'л' },
  diesel: { label: 'Дизел', unit: 'л' },
  cng: { label: 'Метан', unit: 'кг' },
  electric: { label: 'Ток', unit: 'kWh' },
};

export const INCOME_TYPES = {
  cash: { label: 'Кеш', icon: 'coins', color: 'var(--c-green)' },
  card: { label: 'Карта', icon: 'card', color: 'var(--c-blue)' },
  app: { label: 'Приложения', icon: 'phone', color: 'var(--c-violet)' },
  tips: { label: 'Бакшиш', icon: 'heart', color: 'var(--c-amber)' },
};

// Разходи по време на смяна – само неща, свързани с таксито.
// Шофьорът може да скрива вградените и да добавя свои категории.
export const EXPENSE_CATS = {
  fuel: { label: 'Гориво', icon: 'fuel', color: 'var(--c-orange)' },
  wash: { label: 'Автомивка', icon: 'wash', color: 'var(--c-sky)' },
  parking: { label: 'Паркинг', icon: 'parking', color: 'var(--c-blue)' },
  service: { label: 'Обслужване', icon: 'wrench', color: 'var(--c-slate)' },
  repair: { label: 'Ремонт', icon: 'tool', color: 'var(--c-red)' },
  tires: { label: 'Гуми', icon: 'tire', color: 'var(--c-gray)' },
  fine: { label: 'Глоба', icon: 'alert', color: 'var(--c-red)' },
  other: { label: 'Друго', icon: 'more', color: 'var(--c-gray)' },
};

// Постоянни (периодични) разходи. owner: само при собствена кола (вкл. на лизинг)
// (при кола под наем ги плаща собственикът). system: идват от профила.
export const COST_CATS = {
  dispatch: { label: 'Ефир / диспечер', icon: 'radio', system: true, color: 'var(--c-violet)' },
  leasing: { label: 'Лизинг', icon: 'doc', car: true, owner: true, period: 'month', color: 'var(--c-blue)' },
  rent: { label: 'Наем на колата', icon: 'key', system: true, car: true, color: 'var(--c-blue)' },
  fuel: { label: 'Гориво', icon: 'fuel', period: 'week', color: 'var(--c-orange)' },
  wash: { label: 'Автомивка', icon: 'wash', period: 'week', color: 'var(--c-sky)' },
  insurance: { label: 'Гражданска отговорност', icon: 'shield', car: true, owner: true, period: 'year', color: 'var(--c-teal)' },
  casco: { label: 'Каско', icon: 'shield', car: true, owner: true, period: 'year', color: 'var(--c-teal)' },
  insure: { label: 'Застраховка', icon: 'shield', period: 'year', color: 'var(--c-teal)' },
  vignette: { label: 'Винетка', icon: 'road', car: true, owner: true, period: 'year', color: 'var(--c-green)' },
  inspection: { label: 'Технически преглед', icon: 'gauge', car: true, owner: true, period: 'year', color: 'var(--c-sky)' },
  service: { label: 'Обслужване', icon: 'wrench', car: true, owner: true, period: 'month', color: 'var(--c-slate)' },
  repair: { label: 'Ремонти', icon: 'tool', car: true, owner: true, period: 'month', color: 'var(--c-red)' },
  tires: { label: 'Гуми', icon: 'tire', car: true, owner: true, period: 'year', color: 'var(--c-gray)' },
  meter: { label: 'Таксиметров апарат', icon: 'receipt', car: true, owner: true, period: 'month', color: 'var(--c-amber)' },
  license: { label: 'Разрешително', icon: 'doc', period: 'year', color: 'var(--c-orange)' },
  parking: { label: 'Паркинг', icon: 'parking', period: 'month', color: 'var(--c-blue)' },
  phone: { label: 'Телефон и интернет', icon: 'phone', period: 'month', color: 'var(--c-violet)' },
  taxes: { label: 'Данъци и осигуровки', icon: 'bank', period: 'month', color: 'var(--c-red)' },
  accountant: { label: 'Счетоводител', icon: 'receipt', period: 'month', color: 'var(--c-pink)' },
  other: { label: 'Други', icon: 'more', period: 'month', color: 'var(--c-gray)' },
};

// Собствени категории на шофьорите (ключ „u_…“). Регистрират се при зареждане на данните,
// за да се показват с правилното име навсякъде, вкл. в админ панела.
const CUSTOM = {};
const CUSTOM_COLORS = ['var(--c-pink)', 'var(--c-teal)', 'var(--c-amber)', 'var(--c-violet)', 'var(--c-sky)', 'var(--c-green)'];
export function registerCustomCats(list = []) {
  list.forEach((c, i) => { CUSTOM[c.id] = { label: c.label, icon: 'tag', color: CUSTOM_COLORS[i % CUSTOM_COLORS.length], custom: true }; });
}
export const expenseCat = (k) => EXPENSE_CATS[k] || CUSTOM[k] || { label: 'Друго', icon: 'more', color: 'var(--c-gray)' };
export const costCat = (k) => COST_CATS[k] || CUSTOM[k] || COST_CATS.other;

// Видимите категории за шофьора: вградените без скритите + собствените
export function shiftCats(profile = {}) {
  const hidden = new Set(profile.hiddenCats || []);
  const out = Object.entries(EXPENSE_CATS).filter(([k]) => !hidden.has('s:' + k) && k !== 'other').map(([k, v]) => ({ key: k, ...v }));
  (profile.customCats || []).filter((c) => c.kind !== 'fixed').forEach((c) => out.push({ key: c.id, ...expenseCat(c.id) }));
  out.push({ key: 'other', ...EXPENSE_CATS.other });
  return out;
}
export function fixedCats(profile = {}) {
  const hidden = new Set(profile.hiddenCats || []);
  const rent = profile.carType === 'rent';
  const out = Object.entries(COST_CATS).filter(([k, v]) => !v.system && !(rent && v.owner) && !hidden.has('f:' + k) && k !== 'other').map(([k, v]) => ({ key: k, ...v }));
  (profile.customCats || []).filter((c) => c.kind !== 'shift').forEach((c) => out.push({ key: c.id, ...costCat(c.id), period: 'month' }));
  out.push({ key: 'other', ...COST_CATS.other });
  return out;
}

export const PERIODS = {
  day: { label: 'на ден', short: 'ден', every: 'всеки ден' },
  week: { label: 'на седмица', short: 'седмица', every: 'всяка седмица' },
  month: { label: 'на месец', short: 'месец', every: 'всеки месец' },
  quarter: { label: 'на тримесечие', short: 'тримесечие', every: 'всяко тримесечие' },
  year: { label: 'на година', short: 'година', every: 'всяка година' },
};

export const DISPATCH_MODES = {
  none: 'Няма',
  daily: 'На ден',
  weekly: 'Седмица',
  monthly: 'Месец',
};

// Градове и таксиметрови фирми. За останалите градове има само „Друга“,
// а шофьорът пише името на фирмата сам.
export const OTHER = 'Друга';
export const COMPANIES = {
  'София': ['Yellow!', 'TaxiMe', 'OK Supertrans', 'Radio SV Taxi', 'Volt Premium Taxi', 'Mega Taxi 91999'],
  'Пловдив': ['ONE Такси – 032 22 22', 'Еко Такси 6155', 'Виайлет Такси', 'Зелени Такси', 'Елма Такси'],
  'Стара Загора': ['ЕН Такси', 'Чар Такси', 'Берое Такси', 'Vika Taxi'],
  'Варна': ['Триумф Такси / Транстриумф', 'Yellow! Taxi', 'Omega Trans', 'Hippo Taxi', 'JoyTaxi', 'Lasia Taxi'],
  'Бургас': ['Indicar Taxi', 'Еко Такси Бургас', 'Taxi Burgas', 'Supertrans Taxi 1280', 'Yellow Taxi 1515', 'Green Taxi'],
  'Русе': ['Точните 2222', 'Green Taxi', 'Орион', 'Демар Такси', 'Миланов Такси', 'Такси Време'],
  'Сливен': ['ЕС-СИ / ESI Taxi', 'Perfect Taxi', 'Euro Taxi', 'Elite Taxi', 'Express Taxi', 'Taxi Roni'],
  'Нова Загора': ['Виктория Такси', 'Аватари-НЗ', 'Нова Такси', 'Ирис Такси'],
};
export const CITIES = [
  'София', 'Пловдив', 'Варна', 'Бургас', 'Стара Загора', 'Русе', 'Сливен', 'Нова Загора',
  'Асеновград', 'Благоевград', 'Велико Търново', 'Видин', 'Враца', 'Габрово', 'Добрич', 'Дупница', 'Казанлък',
  'Кърджали', 'Кюстендил', 'Ловеч', 'Монтана', 'Пазарджик', 'Перник', 'Плевен', 'Разград', 'Сандански',
  'Силистра', 'Смолян', 'Търговище', 'Хасково', 'Шумен', 'Ямбол',
];
export const OTHER_CITY = 'Друг град';
export const companiesFor = (city) => [...(COMPANIES[city] || []), OTHER];
