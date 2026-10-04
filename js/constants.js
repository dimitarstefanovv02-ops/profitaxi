// ProfiTaxi – справочници

export const CAR_TYPES = {
  own: { label: 'Собствена', hint: 'Колата е твоя' },
  leasing: { label: 'Лизинг', hint: 'Собствена, с месечна вноска' },
  rent: { label: 'Под наем', hint: 'Плащаш наем за колата' },
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
  cash: { label: 'Кеш', icon: 'coins' },
  card: { label: 'Карта', icon: 'card' },
  app: { label: 'Приложения', icon: 'phone' },
  tips: { label: 'Бакшиш', icon: 'heart' },
};

// Разходи по време на смяна
export const EXPENSE_CATS = {
  fuel: { label: 'Гориво', icon: 'fuel' },
  wash: { label: 'Миене', icon: 'wash' },
  parking: { label: 'Паркинг', icon: 'parking' },
  food: { label: 'Храна', icon: 'food' },
  service: { label: 'Сервиз', icon: 'wrench' },
  other: { label: 'Друго', icon: 'more' },
};

// Постоянни разходи
export const COST_CATS = {
  dispatch: { label: 'Ефир / диспечер', icon: 'phone', system: true },
  leasing: { label: 'Лизинг', icon: 'car', system: true, car: true },
  rent: { label: 'Наем на колата', icon: 'car', system: true, car: true },
  insurance: { label: 'Гражданска отговорност', icon: 'shield', car: true, due: true },
  casco: { label: 'Каско', icon: 'shield', car: true, due: true },
  vignette: { label: 'Винетка', icon: 'road', car: true, due: true },
  inspection: { label: 'Технически преглед', icon: 'gauge', car: true, due: true },
  license: { label: 'Разрешително', icon: 'doc', due: true },
  meter: { label: 'Таксиметров апарат', icon: 'receipt', car: true },
  service: { label: 'Сервиз и гуми', icon: 'wrench', car: true },
  phone: { label: 'Телефон и интернет', icon: 'phone' },
  taxes: { label: 'Данъци и осигуровки', icon: 'doc' },
  accountant: { label: 'Счетоводител', icon: 'receipt' },
  other: { label: 'Друго', icon: 'more' },
};

export const PERIODS = {
  day: { label: 'на ден', short: 'ден' },
  week: { label: 'на седмица', short: 'седмица' },
  month: { label: 'на месец', short: 'месец' },
  year: { label: 'на година', short: 'година' },
};

export const DISPATCH_MODES = {
  none: 'Няма',
  daily: 'На ден',
  weekly: 'Седмица',
  monthly: 'Месец',
};
