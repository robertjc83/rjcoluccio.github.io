// FareFinder: estimate and compare ride share fares. No build step, no API keys.
// Geocoding: OpenStreetMap Nominatim. Routing: OSRM public server (falls back to straight-line math).

const DEFAULT_RATES = [
  // base, per mile, per minute, booking fee, minimum fare, seats, pickup wait (min), surges?
  { id: 'uberx',   brand: 'Uber', name: 'UberX',       base: 1.25, mile: 1.10, min: 0.30, fee: 2.85, floor: 8.00,  seats: 4, wait: 5, surge: true },
  { id: 'comfort', brand: 'Uber', name: 'Uber Comfort', base: 2.00, mile: 1.55, min: 0.40, fee: 2.85, floor: 11.00, seats: 4, wait: 6, surge: true },
  { id: 'uberxl',  brand: 'Uber', name: 'UberXL',      base: 2.50, mile: 1.90, min: 0.45, fee: 2.85, floor: 12.00, seats: 6, wait: 8, surge: true },
  { id: 'lyft',    brand: 'Lyft', name: 'Lyft',        base: 1.20, mile: 1.05, min: 0.30, fee: 2.75, floor: 7.50,  seats: 4, wait: 6, surge: true },
  { id: 'lyftxl',  brand: 'Lyft', name: 'Lyft XL',     base: 2.40, mile: 1.85, min: 0.45, fee: 2.75, floor: 11.50, seats: 6, wait: 9, surge: true },
  { id: 'taxi',    brand: 'Taxi', name: 'Local taxi',  base: 3.50, mile: 2.50, min: 0.50, fee: 0.00, floor: 0.00,  seats: 4, wait: 10, surge: false },
];
const FIELDS = [['base', 'Base $'], ['mile', '$ / mile'], ['min', '$ / min'], ['fee', 'Booking $'], ['floor', 'Minimum $'], ['seats', 'Seats'], ['wait', 'Wait min']];
const VALUE_OF_TIME = 0.40; // $ per minute, used by "best value" sort
const STORE = 'farefinder.rates.v1';

const $ = (id) => document.getElementById(id);
const money = (n) => '$' + n.toFixed(2);
let rates = loadRates();
let trip = null;            // { from, to, miles, minutes, when, approx }
const actual = {};          // id -> price the user typed in from the real app

function loadRates() {
  try { const r = JSON.parse(localStorage.getItem(STORE)); if (Array.isArray(r) && r.length) return r; } catch (e) {}
  return structuredClone(DEFAULT_RATES);
}
function saveRates() { try { localStorage.setItem(STORE, JSON.stringify(rates)); } catch (e) {} }

// Expected demand multiplier by time of day. A rough model; real surge depends on live supply.
function demand(date) {
  const h = date.getHours(), d = date.getDay(); // 0 = Sun
  const weekday = d >= 1 && d <= 5;
  const lateWeekend = (d === 5 || d === 6) && h >= 22 || (d === 6 || d === 0) && h < 3;
  if (lateWeekend) return { x: 1.45, label: 'late-night weekend demand' };
  if (weekday && (h >= 7 && h < 9 || h >= 16 && h < 19)) return { x: 1.25, label: 'rush hour demand' };
  if (h >= 0 && h < 5) return { x: 1.15, label: 'overnight, fewer drivers' };
  return { x: 1.0, label: 'normal demand' };
}

function estimate(r, t) {
  const raw = r.base + r.mile * t.miles + r.min * t.minutes;
  const mult = r.surge ? demand(t.when).x : 1;
  const mid = Math.max(raw * mult, r.floor) + r.fee;
  const spread = r.surge ? 0.12 : 0.05;
  return { mid, low: mid * (1 - spread), high: mid * (1 + spread), mult };
}

async function geocode(q) {
  const coords = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coords) return { lat: +coords[1], lon: +coords[2], label: q.trim() };
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Address lookup failed (' + res.status + ')');
  const [hit] = await res.json();
  if (!hit) throw new Error('Could not find "' + q + '"');
  return { lat: +hit.lat, lon: +hit.lon, label: hit.display_name.split(',').slice(0, 2).join(',') };
}

async function route(a, b) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
    const res = await fetch(url);
    const data = await res.json();
    const r = data.routes && data.routes[0];
    if (!r) throw new Error('no route');
    // OSRM durations ignore traffic; pad 20% for a realistic city trip.
    return { miles: r.distance / 1609.34, minutes: (r.duration / 60) * 1.2, approx: false };
  } catch (e) {
    const R = 3958.8, toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    const miles = 2 * R * Math.asin(Math.sqrt(h)) * 1.3; // roads are ~30% longer than a straight line
    return { miles, minutes: miles / 22 * 60, approx: true };
  }
}

function deepLink(r, t) {
  const { from: a, to: b } = t;
  if (r.brand === 'Uber') {
    const p = new URLSearchParams({ action: 'setPickup', 'pickup[latitude]': a.lat, 'pickup[longitude]': a.lon,
      'dropoff[latitude]': b.lat, 'dropoff[longitude]': b.lon, 'dropoff[nickname]': b.label });
    return 'https://m.uber.com/ul/?' + p;
  }
  if (r.brand === 'Lyft') {
    const p = new URLSearchParams({ id: r.id === 'lyftxl' ? 'lyft_plus' : 'lyft', 'pickup[latitude]': a.lat, 'pickup[longitude]': a.lon,
      'destination[latitude]': b.lat, 'destination[longitude]': b.lon });
    return 'https://lyft.com/ride?' + p;
  }
  return null;
}

function render() {
  if (!trip) return;
  const riders = +$('riders').value;
  const sort = $('sort').value;
  const d = demand(trip.when);
  const rows = rates.filter((r) => r.seats >= riders).map((r) => {
    const e = estimate(r, trip);
    const price = actual[r.id] || e.mid;
    const total = trip.minutes + r.wait;
    return { r, e, price, total, score: price + VALUE_OF_TIME * total };
  });
  rows.sort((x, y) => sort === 'value' ? x.score - y.score : x.price - y.price);

  $('summary').textContent = `${trip.miles.toFixed(1)} mi, about ${Math.round(trip.minutes)} min ride` +
    (trip.approx ? ' (straight-line estimate, routing unavailable)' : '') + ` · ${d.label}` +
    (d.x > 1 ? ` (×${d.x.toFixed(2)} on Uber/Lyft)` : '');

  const cards = $('cards');
  cards.innerHTML = '';
  if (!rows.length) { cards.innerHTML = '<li class="meta">No ride type fits that many riders.</li>'; return; }
  const cheapest = Math.min(...rows.map((x) => x.price));
  rows.forEach((x, i) => {
    const li = document.createElement('li');
    li.className = 'card' + (i === 0 ? ' best' : '');
    const diff = x.price - cheapest;
    const link = deepLink(x.r, trip);
    li.innerHTML = `
      <div><h3>${x.r.name}${i === 0 ? '<span class="badge">Best deal</span>' : ''}</h3>
        <span class="brand">${x.r.brand}</span></div>
      <div class="price">${money(x.price)}</div>
      <div class="meta">${actual[x.r.id] ? 'Your real quote' : `Est. ${money(x.e.low)}–${money(x.e.high)}`}
        · ~${x.r.wait} min wait · arrive in ~${Math.round(x.total)} min</div>
      <div class="meta">${diff > 0.005 ? '+' + money(diff) : ''}</div>
      <div class="actions">
        ${link ? `<a href="${link}" target="_blank" rel="noopener">Open in ${x.r.brand} &rarr;</a>` : '<span class="meta">Call or hail locally</span>'}
        <input type="number" min="0" step="0.01" inputmode="decimal" placeholder="Real price $" aria-label="Real price shown in ${x.r.name}" data-id="${x.r.id}" value="${actual[x.r.id] || ''}" />
      </div>`;
    cards.appendChild(li);
  });
}

$('cards').addEventListener('change', (ev) => {
  const id = ev.target.dataset.id;
  if (!id) return;
  const v = parseFloat(ev.target.value);
  if (v > 0) actual[id] = v; else delete actual[id];
  render();
});

$('trip').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const status = $('status');
  status.className = 'status';
  status.textContent = 'Looking up addresses…';
  $('go').disabled = true;
  try {
    const fromVal = $('from').dataset.coords || $('from').value;
    const [from, to] = await Promise.all([geocode(fromVal), geocode($('to').value)]);
    status.textContent = 'Getting route…';
    const r = await route(from, to);
    const whenVal = $('when').value;
    trip = { from, to, ...r, when: whenVal ? new Date(whenVal) : new Date() };
    for (const k in actual) delete actual[k];
    status.textContent = '';
    $('results').hidden = false;
    render();
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    status.className = 'status err';
    status.textContent = e.message;
  } finally {
    $('go').disabled = false;
  }
});

$('from').addEventListener('input', () => delete $('from').dataset.coords);
$('locate').addEventListener('click', () => {
  if (!navigator.geolocation) return;
  $('status').textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition((p) => {
    const c = p.coords.latitude.toFixed(5) + ',' + p.coords.longitude.toFixed(5);
    $('from').value = 'Current location';
    $('from').dataset.coords = c;
    $('status').textContent = '';
  }, () => { $('status').textContent = 'Location permission denied.'; });
});
['riders', 'sort'].forEach((id) => $(id).addEventListener('change', render));

function renderRates() {
  const box = $('rates');
  box.innerHTML = '';
  rates.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'rate';
    div.innerHTML = `<h4>${r.name}</h4><div class="fields">` + FIELDS.map(([k, label]) =>
      `<label>${label}<input type="number" step="0.01" min="0" data-i="${i}" data-k="${k}" value="${r[k]}" /></label>`).join('') + '</div>';
    box.appendChild(div);
  });
}
$('rates').addEventListener('change', (ev) => {
  const { i, k } = ev.target.dataset;
  const v = parseFloat(ev.target.value);
  if (i === undefined || !(v >= 0)) return;
  rates[i][k] = v;
  saveRates();
  render();
});
$('reset-rates').addEventListener('click', () => {
  rates = structuredClone(DEFAULT_RATES);
  try { localStorage.removeItem(STORE); } catch (e) {}
  renderRates();
  render();
});
renderRates();
