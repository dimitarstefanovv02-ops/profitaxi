// Избор на град и таксиметрова фирма (с „Друг град“ / „Друга“ и поле за име)

import { h, fill } from '../util.js';
import { CITIES, OTHER_CITY, OTHER, companiesFor } from '../constants.js';
import { field } from '../ui.js';

export function cityCompanyPicker({ city = '', company = '' } = {}) {
  const known = CITIES.includes(city);
  const st = { city: known ? city : city ? OTHER_CITY : '', cityOther: known ? '' : city, company: '', companyOther: '' };
  const list = () => companiesFor(st.city === OTHER_CITY ? '' : st.city);
  const setCompany = (c) => {
    const l = list();
    if (!c) { st.company = ''; st.companyOther = ''; } else if (l.includes(c) && c !== OTHER) { st.company = c; st.companyOther = ''; } else { st.company = OTHER; st.companyOther = c === OTHER ? '' : c; }
  };
  setCompany(company);
  const box = h('div', { class: 'form' });
  const draw = () => {
    const citySel = h('select', { class: 'input', onchange: (e) => { st.city = e.target.value; st.company = ''; st.companyOther = ''; draw(); } },
      h('option', { value: '', disabled: true, selected: !st.city }, 'Избери град'),
      CITIES.map((c) => h('option', { value: c, selected: st.city === c }, c)),
      h('option', { value: OTHER_CITY, selected: st.city === OTHER_CITY }, OTHER_CITY));
    const cityOther = st.city === OTHER_CITY && h('input', { class: 'input', placeholder: 'Име на града', value: st.cityOther, oninput: (e) => { st.cityOther = e.target.value; } });
    const compSel = h('select', { class: 'input', disabled: !st.city, onchange: (e) => { st.company = e.target.value; draw(); } },
      h('option', { value: '', disabled: true, selected: !st.company }, st.city ? 'Избери фирма' : 'Първо избери град'),
      list().map((c) => h('option', { value: c, selected: st.company === c }, c === OTHER ? 'Друга (напиши името)' : c)));
    const compOther = st.company === OTHER && h('input', { class: 'input', placeholder: 'Име на фирмата', value: st.companyOther, oninput: (e) => { st.companyOther = e.target.value; } });
    fill(box,
      field('Град', h('div', { class: 'form', style: { gap: '8px' } }, citySel, cityOther), null, true),
      field('Таксиметрова фирма', h('div', { class: 'form', style: { gap: '8px' } }, compSel, compOther), 'Ако работиш самостоятелно, избери „Друга“ и го напиши.', true));
  };
  draw();
  return {
    el: box,
    value: () => ({
      city: st.city === OTHER_CITY ? st.cityOther.trim() : st.city,
      company: st.company === OTHER ? st.companyOther.trim() : st.company,
    }),
  };
}
