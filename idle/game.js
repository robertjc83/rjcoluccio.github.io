/* Strata Tycoon — an idle drilling game. Plain JS, no build step.
 * Core loop: drills dig ore -> ore fills the silo -> haulers sell it -> buy more of everything.
 * Deeper layers are harder to dig but worth far more. Launching to a new planet resets the run
 * for Core Shards, a permanent income multiplier. See DESIGN.md for the numbers.
 */
(() => {
  'use strict';

  // ===== CONFIG =====
  const SAVE_KEY = 'strata-tycoon-v1';
  const LAYER_M = 100;            // meters per layer
  const M_PER_ORE = 0.15;         // depth gained per unit of ore dug
  const LAUNCH_DEPTH = 500;       // meters needed before launching
  const SHARD_BONUS = 0.10;       // +10% value per shard

  const LAYERS = [
    // name, hue, sat, light
    ['TOPSOIL', 30, 45, 28], ['CLAY', 18, 50, 36], ['SHALE', 220, 12, 30], ['GRANITE', 0, 0, 42],
    ['IRON VEIN', 12, 45, 28], ['COPPER SEAM', 24, 60, 34], ['SILVER LODE', 210, 14, 50],
    ['GOLD REEF', 44, 70, 38], ['CRYSTAL CAVES', 190, 55, 36], ['OBSIDIAN', 270, 22, 16],
    ['MAGMA SHELF', 8, 80, 32], ['MANTLE', 22, 85, 42], ['CORE', 48, 95, 50],
  ];
  const PLANETS = ['RUSTMOOR', 'VELKA PRIME', 'CINDRAL', 'GLACIS', 'OBSIDIA', 'NYX-7', 'HALCYON', 'TAUROS', 'ZEPHRA', 'OMEGA DRIFT'];

  // Purchasable things. cost(lvl) = base * growth^lvl
  const RIGS = {
    drills:  { name: 'DRILL RIG', icon: '⛏', base: 10, growth: 1.22, desc: () => `Each rig digs ${fmt(rigPower())} ore/s at the surface.` },
    haulers: { name: 'HAULER',    icon: '🚚', base: 25, growth: 1.2,  desc: () => `Each hauler sells ${fmt(cargoRate())} ore/s from the silo.` },
  };
  const UPGRADES = {
    bit:    { name: 'DIAMOND BITS',   icon: '💎', base: 50,   growth: 1.85, max: 200, desc: l => `Rig power x1.25 per level. Now x${fmt(1.25 ** l)}.` },
    silo:   { name: 'BIGGER SILO',    icon: '🛢', base: 40,   growth: 1.7,  max: 200, desc: () => `Silo capacity x1.6. Now ${fmt(siloCap())} ore.` },
    cargo:  { name: 'CARGO BEDS',     icon: '📦', base: 60,   growth: 1.8,  max: 200, desc: l => `Hauler speed x1.35 per level. Now x${fmt(1.35 ** l)}.` },
    market: { name: 'MARKET CONTACTS',icon: '💰', base: 300,  growth: 2.0,  max: 100, desc: l => `Ore sells for +15% per level. Now x${fmt(1.15 ** l)}.` },
    over:   { name: 'TURBO COILS',    icon: '⚡', base: 200,  growth: 2.3,  max: 20,  desc: () => `Overdrive peaks at x${fmt(overdriveMax())} dig speed.` },
    offline:{ name: 'NIGHT SHIFT',    icon: '🌙', base: 500,  growth: 3.0,  max: 10,  desc: () => `Earn while away for up to ${offlineCapH()} h.` },
  };

  // ===== STATE =====
  const fresh = () => ({
    credits: 0, runEarned: 0, totalEarned: 0,
    depth: 0, bestDepth: 0, ore: 0, oreWorth: 0,
    drills: 1, haulers: 1,
    upg: { bit: 0, silo: 0, cargo: 0, market: 0, over: 0, offline: 0 },
    shards: 0, planet: 0, launches: 0,
    geodes: 0, playTime: 0, lastSave: Date.now(),
  });
  let S = load();

  // runtime-only
  let boost = 0, holding = false, buyMult = 1, cpsSmooth = 0, lastLayer = -1;
  let geode = null, geodeTimer = 20 + Math.random() * 20;
  const sparks = [], floaters = [];

  // ===== FORMULAS =====
  const layerIdx = d => Math.max(0, Math.floor(d / LAYER_M));
  const layerInfo = i => i < LAYERS.length ? LAYERS[i] : [`ABYSS ${i - LAYERS.length + 1}`, (i * 37) % 360, 60, 30];
  const planetName = p => PLANETS[p % PLANETS.length] + (p >= PLANETS.length ? ` ${Math.floor(p / PLANETS.length) + 1}` : '');
  const hardness = i => 2.4 ** i * 2 ** S.planet;
  const oreValue = i => 2.7 ** i * 3 ** S.planet * 1.15 ** S.upg.market * (1 + SHARD_BONUS * S.shards);
  const rigPower = () => 1.25 ** S.upg.bit;
  const overdriveMax = () => 2 + 0.5 * S.upg.over;
  const boostMult = () => 1 + boost * (overdriveMax() - 1);
  const digRate = () => S.drills * rigPower() * boostMult() / hardness(layerIdx(S.depth));
  const siloCap = () => 30 * 1.6 ** S.upg.silo;
  const cargoRate = () => 2 * 1.35 ** S.upg.cargo;
  const haulRate = () => S.haulers * cargoRate();
  const offlineCapH = () => 2 + S.upg.offline;
  const shardsForRun = () => Math.floor(Math.cbrt(S.runEarned / 1e4));
  const costOf = (def, lvl) => def.base * def.growth ** lvl;

  // ===== SIMULATION =====
  function step(dt) {
    const li = layerIdx(S.depth);
    // dig, limited by free silo space
    const free = Math.max(0, siloCap() - S.ore);
    const dug = Math.min(digRate() * dt, free);
    S.ore += dug;
    S.oreWorth += dug * oreValue(li);
    S.depth += dug * M_PER_ORE;
    if (S.depth > S.bestDepth) S.bestDepth = S.depth;
    // haul + sell
    let earned = 0;
    if (S.ore > 0) {
      const moved = Math.min(S.ore, haulRate() * dt);
      const frac = moved / S.ore;
      earned = S.oreWorth * frac;
      S.ore -= moved;
      S.oreWorth -= earned;
      if (S.ore < 1e-9) { S.ore = 0; S.oreWorth = 0; }
    }
    earn(earned);
    return { dug, earned };
  }

  function earn(x) {
    S.credits += x; S.runEarned += x; S.totalEarned += x;
  }

  // ===== PURCHASES =====
  // How many can we buy at the current multiplier, and what would it cost?
  function quote(def, lvl, cap = Infinity) {
    let n = 0, total = 0;
    const want = buyMult === 'max' ? Infinity : buyMult;
    while (n < want && lvl + n < cap) {
      const c = costOf(def, lvl + n);
      if (buyMult === 'max' && total + c > S.credits) break;
      total += c; n++;
      if (n > 1000) break;
    }
    if (n === 0) { n = 1; total = costOf(def, lvl); } // show the next single price
    return { n, total };
  }

  function buyRig(key) {
    const q = quote(RIGS[key], S[key]);
    if (S.credits < q.total) return;
    S.credits -= q.total; S[key] += q.n;
    refreshPanels();
  }

  function buyUpgrade(key) {
    const def = UPGRADES[key];
    if (S.upg[key] >= def.max) return;
    const q = quote(def, S.upg[key], def.max);
    if (S.credits < q.total) return;
    S.credits -= q.total; S.upg[key] += q.n;
    refreshPanels();
  }

  function launch() {
    if (S.depth < LAUNCH_DEPTH) return;
    const gain = shardsForRun();
    const keep = { shards: S.shards + gain, planet: S.planet + 1, launches: S.launches + 1,
      totalEarned: S.totalEarned, geodes: S.geodes, playTime: S.playTime, bestDepth: S.bestDepth };
    S = Object.assign(fresh(), keep);
    lastLayer = -1; cpsSmooth = 0;
    save();
    showModal('NEW WORLD', `You land on <b>${planetName(S.planet)}</b> with <b>${S.shards}</b> Core Shards (+${Math.round(S.shards * SHARD_BONUS * 100)}% ore value). The rock is harder here, but every ton is worth more.`, 'DRILL');
    selectTab('rigs');
    refreshPanels();
  }

  // ===== SAVE / LOAD / OFFLINE =====
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const base = fresh();
        return Object.assign(base, data, { upg: Object.assign(base.upg, data.upg) });
      }
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    return fresh();
  }

  function save() {
    S.lastSave = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  }

  function applyOffline() {
    const away = Math.min((Date.now() - S.lastSave) / 1000, offlineCapH() * 3600);
    if (away < 30) return;
    const c0 = S.credits, d0 = S.depth;
    // run the real simulation in coarse steps so silo/hauler bottlenecks still apply
    const dt = 2;
    for (let t = 0; t < away; t += dt) step(Math.min(dt, away - t));
    const gained = S.credits - c0;
    if (gained > 0) {
      showModal('WELCOME BACK', `Your crew worked the night shift for <b>${fmtTime(away)}</b>.<br>Earned <b>${fmt(gained)}</b> credits and dug <b>${fmt(S.depth - d0)} m</b>.`, 'COLLECT');
    }
  }

  // ===== FORMAT =====
  const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  function fmt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toString();
    const t = Math.floor(Math.log10(n) / 3);
    if (t >= SUFFIX.length) return n.toExponential(2).replace('+', '');
    const v = n / 1000 ** t;
    return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v)) + SUFFIX[t];
  }
  function fmtTime(s) {
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
  }

  // ===== DOM =====
  const $ = id => document.getElementById(id);
  const els = {
    credits: $('s-credits'), cps: $('s-cps'), depth: $('s-depth'), shards: $('s-shards'),
    planet: $('planet-name'), layerTag: $('layer-tag'), siloWarn: $('silo-warn'),
    odBtn: $('od-btn'), odFill: $('od-fill'), silo: $('s-silo'), dig: $('s-dig'), haul: $('s-haul'),
    rigs: $('panel-rigs'), upgrades: $('panel-upgrades'), launchBtn: $('btn-launch'),
    lGain: $('l-gain'), lReq: $('l-req'), lNext: $('l-next'), statList: $('stat-list'),
    modal: $('modal'), modalTitle: $('modal-title'), modalBody: $('modal-body'), modalOk: $('modal-ok'),
    toast: $('toast'), canvas: $('world'), buyMode: $('buy-mode'),
  };

  function makeRow(key, def, onBuy) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="icon" aria-hidden="true">${def.icon}</div>
      <div class="info"><div class="name">${def.name}<small></small></div><div class="desc"></div></div>
      <button type="button" class="buy"></button>`;
    row.querySelector('button').addEventListener('click', () => onBuy(key));
    return row;
  }

  const rows = { rigs: {}, upgrades: {} };
  for (const k in RIGS) els.rigs.appendChild(rows.rigs[k] = makeRow(k, RIGS[k], buyRig));
  for (const k in UPGRADES) els.upgrades.appendChild(rows.upgrades[k] = makeRow(k, UPGRADES[k], buyUpgrade));

  function setRow(row, lvlText, desc, q, maxed) {
    row.querySelector('small').textContent = lvlText;
    row.querySelector('.desc').textContent = desc;
    const b = row.querySelector('button');
    if (maxed) { b.textContent = 'MAXED'; b.disabled = true; return; }
    b.textContent = (q.n > 1 ? `+${q.n} ` : '') + fmt(q.total);
    b.disabled = S.credits < q.total;
  }

  function refreshPanels() {
    for (const k in RIGS) setRow(rows.rigs[k], `x${S[k]}`, RIGS[k].desc(), quote(RIGS[k], S[k]), false);
    for (const k in UPGRADES) {
      const d = UPGRADES[k], l = S.upg[k], maxed = l >= d.max;
      setRow(rows.upgrades[k], `LV ${l}`, d.desc(l), maxed ? null : quote(d, l, d.max), maxed);
    }
    const gain = shardsForRun(), ready = S.depth >= LAUNCH_DEPTH;
    els.lGain.textContent = fmt(gain);
    els.lNext.textContent = planetName(S.planet + 1);
    els.launchBtn.disabled = !ready || gain < 1;
    els.lReq.textContent = !ready ? `Reach ${LAUNCH_DEPTH} m to unlock launch (now ${fmt(S.depth)} m).`
      : gain < 1 ? 'Earn more credits this run to gain at least 1 shard.'
      : `Shards gained grow with the cube root of credits earned this run (${fmt(S.runEarned)}).`;
    const launchTab = document.querySelector('[data-tab="launch"]');
    launchTab.innerHTML = 'LAUNCH' + (ready && gain >= 1 ? '<span class="dot"></span>' : '');

    const stats = [
      ['PLANET', planetName(S.planet)], ['LAUNCHES', S.launches], ['CORE SHARDS', fmt(S.shards)],
      ['SHARD BONUS', `+${Math.round(S.shards * SHARD_BONUS * 100)}%`], ['BEST DEPTH', `${fmt(S.bestDepth)} m`],
      ['EARNED THIS RUN', fmt(S.runEarned)], ['EARNED ALL TIME', fmt(S.totalEarned)],
      ['GEODES CRACKED', S.geodes], ['TIME PLAYED', fmtTime(S.playTime)],
    ];
    els.statList.innerHTML = stats.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  }

  function refreshHud() {
    const li = layerIdx(S.depth);
    els.credits.textContent = fmt(S.credits);
    els.cps.textContent = fmt(cpsSmooth);
    els.depth.textContent = `${fmt(S.depth)} m`;
    els.shards.textContent = fmt(S.shards);
    els.planet.textContent = planetName(S.planet);
    els.layerTag.textContent = `${layerInfo(li)[0]} · ORE x${fmt(oreValue(li))}`;
    const full = S.ore >= siloCap() - 1e-6;
    els.siloWarn.hidden = !full;
    els.silo.textContent = `${fmt(S.ore)} / ${fmt(siloCap())}`;
    els.silo.classList.toggle('bad', full);
    els.dig.textContent = `${fmt(digRate())}/s`;
    els.haul.textContent = `${fmt(haulRate())}/s`;
    els.odFill.style.width = `${boost * 100}%`;
  }

  // tabs + buy mode
  function selectTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.panel').forEach(p => { p.hidden = p.id !== `panel-${name}`; });
    els.buyMode.style.visibility = name === 'rigs' || name === 'upgrades' ? 'visible' : 'hidden';
  }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => selectTab(t.dataset.tab)));
  els.buyMode.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    buyMult = b.dataset.mult === 'max' ? 'max' : +b.dataset.mult;
    els.buyMode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    refreshPanels();
  }));

  els.launchBtn.addEventListener('click', launch);
  $('btn-wipe').addEventListener('click', () => {
    if (!confirm('Erase all progress, including Core Shards?')) return;
    S = fresh(); lastLayer = -1; save(); refreshPanels();
  });

  function showModal(title, html, btn) {
    els.modalTitle.textContent = title;
    els.modalBody.innerHTML = html;
    els.modalOk.textContent = btn;
    els.modal.hidden = false;
  }
  els.modalOk.addEventListener('click', () => { els.modal.hidden = true; });

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  // ===== INPUT: hold to overdrive, tap geodes =====
  function holdStart(e) { e.preventDefault(); holding = true; els.odBtn.classList.add('held'); }
  function holdEnd() { holding = false; els.odBtn.classList.remove('held'); }
  els.odBtn.addEventListener('pointerdown', holdStart);
  window.addEventListener('pointerup', holdEnd);
  window.addEventListener('pointercancel', holdEnd);
  window.addEventListener('blur', holdEnd);
  window.addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat && e.target === document.body) { e.preventDefault(); holding = true; } });
  window.addEventListener('keyup', e => { if (e.code === 'Space') holdEnd(); });

  els.canvas.addEventListener('pointerdown', e => {
    const r = els.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (geode && Math.hypot(x - geode.x, y - geode.y) < 26) {
      crackGeode();
    } else {
      holdStart(e);
    }
  });

  function crackGeode() {
    const reward = Math.max(50 * 3 ** S.planet, cpsSmooth * 30, S.credits * 0.05);
    earn(reward);
    S.geodes++;
    floaters.push({ x: geode.x, y: geode.y, text: `+${fmt(reward)}`, life: 1.4 });
    for (let i = 0; i < 24; i++) spark(geode.x, geode.y, `hsl(${280 + Math.random() * 80},90%,65%)`, 160);
    toast('GEODE CRACKED!');
    geode = null;
    geodeTimer = 30 + Math.random() * 40;
    refreshPanels();
  }

  // ===== RENDER =====
  const ctx = els.canvas.getContext('2d');
  let W = 0, H = 0;
  const SURF = 86, PX_PER_M = 3;

  function resize() {
    const r = els.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    els.canvas.width = Math.round(W * dpr);
    els.canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);

  const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const hsl = (i, dl = 0) => {
    const [, h, s, l] = layerInfo(i);
    return `hsl(${(h + S.planet * 47) % 360},${s}%,${Math.max(4, Math.min(90, l + dl))}%)`;
  };
  function spark(x, y, color, spd = 90) {
    const a = Math.random() * Math.PI * 2, v = spd * (0.4 + Math.random());
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.5 + Math.random() * 0.4, color });
  }

  function draw(t, dt, dug) {
    const shaftX = Math.round(W * 0.3);
    const view = H - SURF;
    const headScreen = Math.min(S.depth * PX_PER_M, view * 0.62);
    const camTop = S.depth - headScreen / PX_PER_M; // meters at y=SURF
    const headY = SURF + headScreen;

    // sky
    const skyHue = (230 + S.planet * 47) % 360;
    const g = ctx.createLinearGradient(0, 0, 0, SURF);
    g.addColorStop(0, `hsl(${skyHue},50%,8%)`); g.addColorStop(1, `hsl(${skyHue},45%,22%)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, SURF);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * hash(i, 9) * (0.6 + 0.4 * Math.sin(t * 2 + i))})`;
      ctx.fillRect(hash(i, 1) * W, hash(i, 2) * (SURF - 30), 1.5, 1.5);
    }

    // strata
    const firstL = layerIdx(camTop), lastL = layerIdx(camTop + view / PX_PER_M);
    for (let li = firstL; li <= lastL; li++) {
      const y0 = SURF + (li * LAYER_M - camTop) * PX_PER_M;
      const top = Math.max(SURF, y0), bot = Math.min(H, y0 + LAYER_M * PX_PER_M);
      ctx.fillStyle = hsl(li); ctx.fillRect(0, top, W, bot - top);
      // grit + ore flecks, fixed in world space
      for (let k = 0; k < 90; k++) {
        const y = y0 + hash(li, k) * LAYER_M * PX_PER_M;
        if (y < SURF || y > H) continue;
        const x = hash(k, li + 0.5) * W, ore = k % 6 === 0;
        ctx.fillStyle = ore ? hsl(li, 35) : hsl(li, hash(k, li) > 0.5 ? 8 : -8);
        const s = ore ? 4 : 2 + hash(li, k + 3) * 3;
        ctx.fillRect(Math.round(x), Math.round(y), s, s);
      }
      if (y0 > SURF && y0 < H) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, y0, W, 2); }
    }
    // depth ruler
    ctx.font = '7px "Press Start 2P", monospace'; ctx.textAlign = 'right';
    const step = 25;
    for (let m = Math.ceil(camTop / step) * step; m < camTop + view / PX_PER_M; m += step) {
      const y = SURF + (m - camTop) * PX_PER_M;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(W - 10, y, 10, 1);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText(`${m}m`, W - 14, y + 3);
    }

    // shaft + bit
    ctx.fillStyle = '#05010a'; ctx.fillRect(shaftX - 7, SURF, 14, headY - SURF);
    ctx.fillStyle = '#6b6b80'; ctx.fillRect(shaftX - 2, SURF, 4, headY - SURF);
    const spin = t * (6 + boost * 30);
    ctx.save(); ctx.translate(shaftX, headY);
    ctx.fillStyle = '#c9c9d6';
    ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(10, -4); ctx.lineTo(0, 16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7a7a90';
    for (let i = 0; i < 3; i++) {
      const o = ((spin * 4 + i * 6) % 18) - 4;
      const w = 10 * (1 - (o + 4) / 20);
      ctx.fillRect(-w, o, w * 2, 2);
    }
    ctx.restore();
    if (dug > 0 && Math.random() < 0.5 + boost) spark(shaftX + (Math.random() - 0.5) * 14, headY + 14, Math.random() < 0.5 ? '#ffe600' : hsl(layerIdx(S.depth), 30));

    // ground line
    ctx.fillStyle = hsl(0, 10); ctx.fillRect(0, SURF - 4, W, 4);

    // rig tower
    ctx.strokeStyle = '#ffe600'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shaftX - 18, SURF - 4); ctx.lineTo(shaftX, SURF - 58); ctx.lineTo(shaftX + 18, SURF - 4);
    for (let y = 1; y < 4; y++) { const yy = SURF - 4 - y * 13, hw = 18 * (1 - y * 13 / 54); ctx.moveTo(shaftX - hw, yy); ctx.lineTo(shaftX + hw, yy); }
    ctx.stroke();
    ctx.fillStyle = boost > 0.05 ? '#ff2bd6' : '#ff3355';
    ctx.fillRect(shaftX - 3, SURF - 62, 6, 6);
    if (S.drills > 1) {
      ctx.fillStyle = '#ffe600'; ctx.font = '7px "Press Start 2P", monospace'; ctx.textAlign = 'center';
      ctx.fillText(`x${S.drills}`, shaftX, SURF - 68);
    }

    // silo
    const siloX = shaftX + 28, siloW = 22, siloH = 44, fill = Math.min(1, S.ore / siloCap());
    ctx.fillStyle = '#2a2140'; ctx.fillRect(siloX, SURF - 4 - siloH, siloW, siloH);
    ctx.fillStyle = fill >= 0.999 ? '#ff3355' : hsl(layerIdx(S.depth), 25);
    ctx.fillRect(siloX + 3, SURF - 7 - (siloH - 6) * fill, siloW - 6, (siloH - 6) * fill);
    ctx.strokeStyle = '#a99bc9'; ctx.lineWidth = 1; ctx.strokeRect(siloX + 0.5, SURF - 4 - siloH + 0.5, siloW - 1, siloH - 1);

    // depot
    const depX = W - 58;
    ctx.fillStyle = '#1f6b10'; ctx.fillRect(depX, SURF - 30, 46, 26);
    ctx.fillStyle = '#39ff14'; ctx.fillRect(depX + 4, SURF - 38, 38, 8);
    ctx.fillStyle = '#000'; ctx.font = '6px "Press Start 2P", monospace'; ctx.textAlign = 'center';
    ctx.fillText('SELL', depX + 23, SURF - 31);

    // haulers drive between silo and depot
    const x0 = siloX + siloW + 6, x1 = depX - 22, n = Math.min(S.haulers, 8);
    const busy = S.ore > 0.01;
    for (let i = 0; i < n; i++) {
      const p = ((t * 0.25 + i / n) % 1);
      const out = p < 0.5, k = out ? p * 2 : (1 - p) * 2;
      const x = x0 + (x1 - x0) * k, y = SURF - 12 - (i % 2) * 0;
      ctx.fillStyle = '#00e5ff'; ctx.fillRect(x, y, 18, 6);
      ctx.fillRect(out ? x + 14 : x - 2, y - 4, 6, 4);
      if (out && busy) { ctx.fillStyle = hsl(layerIdx(S.depth), 25); ctx.fillRect(x + 2, y - 4, 10, 4); }
      ctx.fillStyle = '#000'; ctx.fillRect(x + 2, y + 6, 4, 3); ctx.fillRect(x + 12, y + 6, 4, 3);
    }
    if (S.haulers > n) {
      ctx.fillStyle = '#00e5ff'; ctx.font = '7px "Press Start 2P", monospace'; ctx.textAlign = 'center';
      ctx.fillText(`x${S.haulers}`, (x0 + x1) / 2 + 9, SURF - 22);
    }

    // geode
    if (geode && !(geode.life < 3 && Math.floor(t * 8) % 2)) { // blinks when about to vanish
      const pulse = 1 + 0.12 * Math.sin(t * 6);
      ctx.save(); ctx.translate(geode.x, geode.y); ctx.scale(pulse, pulse);
      ctx.fillStyle = 'rgba(255,43,214,.25)'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c86bff';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + t; ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-3, -6, 3, 3);
      ctx.restore();
    }

    // particles + floaters
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt; if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy += 300 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      ctx.fillStyle = s.color; ctx.globalAlpha = Math.min(1, s.life * 2);
      ctx.fillRect(s.x, s.y, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.font = '9px "Press Start 2P", monospace'; ctx.textAlign = 'center';
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= dt; if (f.life <= 0) { floaters.splice(i, 1); continue; }
      f.y -= 30 * dt;
      ctx.globalAlpha = Math.min(1, f.life); ctx.fillStyle = '#ffe600';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function updateGeode(dt) {
    if (geode) {
      geode.life -= dt;
      if (geode.life <= 0) { geode = null; geodeTimer = 30 + Math.random() * 40; }
      return;
    }
    geodeTimer -= dt;
    if (geodeTimer <= 0 && W > 0) {
      geode = { x: W * (0.5 + Math.random() * 0.35), y: SURF + 30 + Math.random() * (H - SURF - 60), life: 10 };
    }
  }

  // ===== MAIN LOOP =====
  let last = performance.now(), uiTimer = 0, saveTimer = 0;
  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    boost = holding ? Math.min(1, boost + dt * 1.2) : Math.max(0, boost - dt * 0.5);
    const { dug, earned } = step(dt);
    S.playTime += dt;
    cpsSmooth += (earned / Math.max(dt, 1e-3) - cpsSmooth) * Math.min(1, dt * 2);

    const li = layerIdx(S.depth);
    if (li !== lastLayer) {
      if (lastLayer >= 0) toast(`NEW LAYER: ${layerInfo(li)[0]}!`);
      if (lastLayer >= 0 && S.depth >= LAUNCH_DEPTH && lastLayer * LAYER_M < LAUNCH_DEPTH) toast('LAUNCH UNLOCKED!');
      lastLayer = li;
    }

    updateGeode(dt);
    draw(now / 1000, dt, dug);
    refreshHud();
    if ((uiTimer += dt) > 0.25) { uiTimer = 0; refreshPanels(); }
    if ((saveTimer += dt) > 10) { saveTimer = 0; save(); }
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
    else { applyOffline(); last = performance.now(); }
  });
  window.addEventListener('pagehide', save);

  // ===== BOOT =====
  resize();
  applyOffline();
  lastLayer = layerIdx(S.depth);
  refreshPanels();
  selectTab('rigs');
  requestAnimationFrame(frame);
})();
