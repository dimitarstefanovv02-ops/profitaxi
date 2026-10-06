// Мини „Leaflet“ за тестовете (CDN-ът е недостъпен тук): рисува маркерите по координати върху контейнера
(() => {
  const B = { s: 41.2, n: 44.25, w: 22.3, e: 28.65 };
  const L = {
    map(el) { el.style.position = 'relative'; el.style.background = '#cfe3c6'; el.classList.add('fake-map'); return { el, setView() { return this; }, fitBounds() { return this; }, invalidateSize() {} }; },
    tileLayer() { return { addTo() { return this; } }; },
    layerGroup() { const g = { items: [], map: null, addTo(m) { this.map = m; return this; }, remove() { this.items.forEach((x) => x.remove()); } }; return g; },
    divIcon(o) { return o; },
    marker(ll, o) {
      const m = { ll, o, popup: '', handlers: {}, bindPopup(h) { this.popup = h; return this; }, on(ev, f) { this.handlers[ev] = f; return this; },
        addTo(g) {
          const el = document.createElement('div'); el.className = 'leaflet-marker-icon ' + (o.icon.className || '');
          const [w, hgt] = o.icon.iconSize; const box = g.map.el.getBoundingClientRect();
          const x = ((ll[1] - B.w) / (B.e - B.w)) * box.width, y = ((B.n - ll[0]) / (B.n - B.s)) * box.height;
          Object.assign(el.style, { position: 'absolute', left: `${x - w / 2}px`, top: `${y - hgt / 2}px`, width: `${w}px`, height: `${hgt}px`, zIndex: String(1000 + (o.zIndexOffset || 0)) });
          el.innerHTML = o.icon.html; el.title = o.title || ''; el.dataset.popup = this.popup;
          g.map.el.appendChild(el); g.items.push(el); return this;
        } };
      return m;
    },
  };
  window.L = L;
})();
