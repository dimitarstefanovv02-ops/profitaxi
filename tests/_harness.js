// Общ помощник за тестовете на изчисленията (класически скрипт – зарежда се ПРЕДИ модулите).
// 1) Подменя Date, за да можем да „местим“ днешния ден: setNow('2026-09-20T21:00') (местно време).
// 2) ok / eq / near / noNaN – записват PASS/FAIL в window.__results (както calc.test.html).
(function () {
  const RealDate = Date;
  let now = null;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0 && now != null) super(now); else super(...a); }
    static now() { return now != null ? now : RealDate.now(); }
  }
  window.Date = FakeDate;
  window.RealDate = RealDate;
  window.setNow = (local) => { now = local == null ? null : new RealDate(local).getTime(); };

  const results = [];
  const fmt = (v) => (typeof v === 'number' ? String(Math.round(v * 10000) / 10000) : JSON.stringify(v));
  window.ok = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  [' + extra + ']' : ''}`);
  // известна грешка във файл извън обхвата на тестовете (напр. js/views/*) – не е FAIL, а KNOWN
  window.known = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'KNOWN'}  ${name}${extra !== '' ? '  [' + extra + ']' : ''}`);
  window.eq = (name, got, want) => window.ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${fmt(got)}${JSON.stringify(got) === JSON.stringify(want) ? '' : ', want ' + fmt(want)}`);
  // пари: толеранс 0,005
  window.near = (name, got, want, eps = 0.005) => window.ok(name, typeof got === 'number' && Number.isFinite(got) && Math.abs(got - want) <= eps, `got ${fmt(got)}, want ${fmt(want)}`);
  // никъде да няма NaN / Infinity (обхожда обект)
  window.allFinite = (obj, path = '') => {
    const bad = [];
    const walk = (v, p, depth) => {
      if (depth > 4 || v == null) return;
      if (typeof v === 'number') { if (!Number.isFinite(v)) bad.push(p); return; }
      if (typeof v === 'object' && !(v instanceof RealDate)) for (const [k, x] of Object.entries(v)) { if (k === 'shift' || k === 'ref' || k === 'stats' || k === 'st' && depth > 1) continue; walk(x, p + '.' + k, depth + 1); }
    };
    walk(obj, path, 0);
    return bad;
  };
  window.noNaN = (name, obj) => { const bad = window.allFinite(obj); window.ok(name, bad.length === 0, bad.join(', ')); };
  // група тестове: грешка в една група не спира останалите
  window.group = async (title, fn) => { try { await fn(); } catch (e) { results.push(`FAIL  ${title}: exception ${e.message}\n${e.stack}`); } };
  window.finish = () => {
    setNow(null);
    const el = document.getElementById('out');
    if (el) el.textContent = results.join('\n');
    window.__results = results;
  };

  // ---- построяване на данни ----
  let n = 0;
  // смяна: start/end в местно време 'YYYY-MM-DDTHH:MM'
  window.sh = (start, end, income = {}, expenses = [], km = [0, 0], extra = {}) => ({
    id: 's' + (++n), start: new RealDate(start).toISOString(), end: end ? new RealDate(end).toISOString() : null,
    kmStart: km[0], kmEnd: km[1], income: { cash: 0, card: 0, app: 0, tips: 0, ...income },
    expenses: expenses.map((e, i) => ({ id: 'e' + n + '-' + i, ...e })), note: '', ...extra,
  });
  window.cost = (amount, period, startDate, extra = {}) => ({ id: 'c' + (++n), name: 'Разход', category: 'other', amount, period, startDate, ...extra });
  window.mk = (shifts, costs = [], profile = {}) => ({ user: { id: 'u1', name: 'Тест' }, profile: { sharePct: 100, monthlyGoal: 0, ...profile }, shifts, costs, reminders: [], reservations: [] });
})();
