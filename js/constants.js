// ProfiTaxi – справочници

export const CAR_TYPES = {
  own: { label: 'Собствена', hint: 'Колата е твоя', icon: 'car' },
  leasing: { label: 'Лизинг', hint: 'Твоя, с месечна вноска', icon: 'doc' },
  rent: { label: 'Под наем', hint: 'Плащаш наем', icon: 'key' },
};

export const FUELS = {
  petrol: { label: 'Бензин', types: ['petrol'] },
  petrol_lpg: { label: 'Бензин + Газ', types: ['lpg', 'petrol'] },
  diesel: { label: 'Дизел', types: ['diesel'] },
  hybrid: { label: 'Хибрид', types: ['petrol'] },
  lpg: { label: 'Само газ', types: ['lpg'] },
  electric: { label: 'Ток', types: ['electric'] },
};

export const FUEL_TYPES = {
  petrol: { label: 'Бензин', unit: 'л' },
  lpg: { label: 'Газ', unit: 'л' },
  diesel: { label: 'Дизел', unit: 'л' },
  electric: { label: 'Ток', unit: 'kWh' },
};

export const INCOME_TYPES = {
  cash: { label: 'Кеш', icon: 'coins', color: 'var(--c-green)' },
  card: { label: 'Карта', icon: 'card', color: 'var(--c-blue)' },
  app: { label: 'Приложения', icon: 'phone', color: 'var(--c-violet)' },
  tips: { label: 'Бакшиш', icon: 'heart', color: 'var(--c-amber)' },
};

// Разходи по време на смяна – само неща, свързани с таксито
export const EXPENSE_CATS = {
  fuel: { label: 'Гориво', icon: 'fuel', color: 'var(--c-orange)' },
  wash: { label: 'Миене', icon: 'wash', color: 'var(--c-sky)' },
  parking: { label: 'Паркинг', icon: 'parking', color: 'var(--c-blue)' },
  service: { label: 'Сервиз', icon: 'wrench', color: 'var(--c-slate)' },
  fine: { label: 'Глоба', icon: 'alert', color: 'var(--c-red)' },
  other: { label: 'Друго', icon: 'more', color: 'var(--c-gray)' },
};
export const expenseCat = (k) => EXPENSE_CATS[k] || { label: 'Друго', icon: 'more', color: 'var(--c-gray)' };

// Постоянни разходи. owner: само при собствена кола или лизинг
// (при кола под наем ги плаща собственикът)
export const COST_CATS = {
  dispatch: { label: 'Ефир / диспечер', icon: 'phone', system: true, color: 'var(--c-violet)' },
  leasing: { label: 'Лизинг', icon: 'car', system: true, car: true, color: 'var(--c-blue)' },
  rent: { label: 'Наем на колата', icon: 'key', system: true, car: true, color: 'var(--c-blue)' },
  insurance: { label: 'Гражданска отговорност', icon: 'shield', car: true, owner: true, period: 'year', color: 'var(--c-teal)' },
  casco: { label: 'Каско', icon: 'shield', car: true, owner: true, period: 'year', color: 'var(--c-teal)' },
  vignette: { label: 'Винетка', icon: 'road', car: true, owner: true, period: 'year', color: 'var(--c-green)' },
  inspection: { label: 'Технически преглед', icon: 'gauge', car: true, owner: true, period: 'year', color: 'var(--c-sky)' },
  meter: { label: 'Таксиметров апарат', icon: 'receipt', car: true, owner: true, period: 'month', color: 'var(--c-amber)' },
  service: { label: 'Сервиз и гуми', icon: 'wrench', car: true, owner: true, period: 'month', color: 'var(--c-slate)' },
  license: { label: 'Разрешително', icon: 'doc', period: 'year', color: 'var(--c-orange)' },
  phone: { label: 'Телефон и интернет', icon: 'phone', period: 'month', color: 'var(--c-violet)' },
  taxes: { label: 'Данъци и осигуровки', icon: 'doc', period: 'month', color: 'var(--c-red)' },
  accountant: { label: 'Счетоводител', icon: 'receipt', period: 'month', color: 'var(--c-pink)' },
  other: { label: 'Друго', icon: 'more', period: 'month', color: 'var(--c-gray)' },
};
export const costCat = (k) => COST_CATS[k] || COST_CATS.other;

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

// Градове и таксиметрови фирми (от публични справочници, октомври 2026).
// Във всеки град има и „Друга“ – шофьорът пише името сам.
export const OTHER = 'Друга';
export const COMPANIES = {
  'София': ['ОК Супертранс', 'Yellow Taxi', 'Такси С Експрес', 'Радио СВ Такси', 'Мега Такси', 'Панда Такси', 'Грийн Такси', 'София Транс Такси', 'TaxiMe', 'Volt Premium Taxi'],
  'Пловдив': ['ONE Taxi', 'Такси 1 (6142)', 'Еко Такси (6155)', 'Пловдив Такси', 'Бига Такси', 'Густо Такси', 'Ден и Нощ', 'Експрес Такси', 'Интер Такси', 'Корона Такси', 'Виайлет Такси', 'ВИП Такси'],
  'Варна': ['Триумф Такси', 'Омега Транс Такси', 'Джой Такси', 'Хипо Такси', 'Алфа Такси', 'Топ Такси'],
  'Бургас': ['Такси Бургас', 'Орион Такси', 'Еко Такси Бургас', 'Инди Такси', 'Индикар Такси'],
  'Стара Загора': ['ЕН Такси', 'Чар Такси', 'Берое Такси', 'Вика Такси', 'Такси Скорпион'],
  'Русе': ['Грийн Такси Русе', 'Точните Такси (8108)'],
  'Плевен': ['Такси Орион', 'Експрес Такси Плевен', 'Светлина Такси'],
  'Велико Търново': ['Евротакси'],
};
export const CITIES = [
  'София', 'Пловдив', 'Варна', 'Бургас', 'Стара Загора', 'Русе', 'Плевен', 'Велико Търново',
  'Асеновград', 'Благоевград', 'Видин', 'Враца', 'Габрово', 'Добрич', 'Дупница', 'Казанлък', 'Кърджали',
  'Кюстендил', 'Ловеч', 'Монтана', 'Пазарджик', 'Перник', 'Разград', 'Сандански', 'Силистра', 'Сливен',
  'Смолян', 'Търговище', 'Хасково', 'Шумен', 'Ямбол',
];
export const OTHER_CITY = 'Друг град';
export const companiesFor = (city) => [...(COMPANIES[city] || []), OTHER];
