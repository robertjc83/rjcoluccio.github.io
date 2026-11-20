/* Tidepool Solitaire: peak-style solitaire with a reef-restoration meta game.
 * Play a face-up card one rank above or below the top of the pile (K and A wrap).
 * Clear every card to win. Cards carry sea creatures you collect to restore the reef.
 * See DESIGN.md for rules, numbers and the roadmap.
 */
(() => {
  'use strict';

  // ===== CONFIG =====
  const SAVE_KEY = 'tidepool-solitaire-v1';
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const COST = { undo: 25, wild: 150, extra: [100, 200, 350, 500] };
  const STREAK_WILD = 8;         // a streak this long earns a free wild card
  const EXTRA_CARDS = 5;

  const CREATURES = {
    fish:   { e: '🐠', name: 'Clownfish', from: 1 },
    shell:  { e: '🐚', name: 'Shell',     from: 1 },
    shrimp: { e: '🦐', name: 'Shrimp',    from: 3 },
    crab:   { e: '🦀', name: 'Crab',      from: 5 },
    octo:   { e: '🐙', name: 'Octopus',   from: 8 },
  };

  // Reef zones: restore each with creatures + coins. Requirements scale with the reef tier.
  const ZONES = [
    { name: 'Kelp Garden',   art: '🌿🐠🌿<br>🌱🐚🌱', need: { fish: 6, shell: 4 },            coins: 200,  reward: { wild: 2 } },
    { name: 'Coral Arch',    art: '🪸🐠🪸<br>🦐🪸🦐',   need: { fish: 8, shrimp: 5 },           coins: 400,  reward: { wild: 2, coins: 300 } },
    { name: 'Crab Cove',     art: '🦀🏖️🦀<br>🐚🐚🐚',   need: { crab: 6, shell: 8 },            coins: 700,  reward: { wild: 3 } },
    { name: 'Octopus Den',   art: '🪨🐙🪨<br>🦐🪸🦀',   need: { octo: 5, shrimp: 8 },           coins: 1000, reward: { wild: 3, coins: 800 } },
    { name: 'Sunken Galleon',art: '🏴‍☠️🚢💰<br>🐠🐙🐢', need: { fish: 10, crab: 8, octo: 6 },  coins: 1600, reward: { wild: 5, coins: 2000 } },
  ];

  // ===== LAYOUTS (units: card width = 1, rows step 0.5; z = stacking order) =====
  const peak = (c, cx, rows, y0 = 0, z0 = 0) => {
    for (let r = 0; r < rows; r++) for (let k = 0; k <= r; k++) c.push({ x: cx - r / 2 + k, y: y0 + r * 0.5, z: z0 + r });
  };
  const row = (c, x0, n, y, z) => { for (let k = 0; k < n; k++) c.push({ x: x0 + k, y, z }); };
  const LAYOUTS = [
    { name: 'Three Peaks', build: c => { [1.5, 4.5, 7.5].forEach(cx => peak(c, cx, 3)); row(c, 0, 10, 1.5, 3); } },
    { name: 'Great Pyramid', build: c => peak(c, 3, 7) },
    { name: 'Twin Peaks', build: c => { [2, 6].forEach(cx => peak(c, cx, 4)); row(c, 0.5, 8, 2, 4); } },
    { name: 'Rolling Waves', build: c => { row(c, 0.5, 7, 0, 0); row(c, 0, 8, 0.5, 1); row(c, 0.5, 7, 1, 2); row(c, 0, 8, 1.5, 3); } },
    { name: 'Diamonds', build: c => [1.5, 5.5].forEach(cx => [1, 2, 3, 4, 3, 2, 1].forEach((n, r) => row(c, cx - (n - 1) / 2, n, r * 0.5, r))) },
    { name: 'Sea Wall', build: c => { row(c, 0, 9, 0, 0); row(c, 0.5, 8, 0.5, 1); row(c, 1, 7, 1, 2); row(c, 1.5, 6, 1.5, 3); } },
  ];

  function levelConfig(n) {
    const layout = LAYOUTS[(n - 1) % LAYOUTS.length];
    const pool = Object.keys(CREATURES).filter(k => CREATURES[k].from <= n);
    return {
      layout,
      creatures: Math.min(12, 3 + Math.floor(n / 2)),
      locks: n >= 4 ? Math.min(5, 1 + Math.floor((n - 4) / 3)) : 0,
      pool,
      // Difficulty dial for the solvable deal: longer chains + more spare cards = easier.
      runMin: Math.max(2, 5 - Math.floor(n / 4)),
      runMax: Math.max(4, 10 - Math.floor(n / 3)),
      slack: Math.max(4, 16 - n),
      // chance each draw is "helpful" (connects to a card on the board); eases off as levels go up
      help: Math.max(0.45, 0.9 - 0.025 * (n - 1)),
    };
  }

  // ===== SAVE =====
  const fresh = () => ({ coins: 300, wild: 2, level: 1, stars: {}, items: {}, reef: [], tier: 0, sound: true, played: 0, won: 0 });
  let S = load();
  function load() {
    try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); if (d) return Object.assign(fresh(), d); } catch (e) { /* fresh */ }
    return fresh();
  }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

  // ===== HELPERS =====
  const $ = id => document.getElementById(id);
  const rand = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const adjacent = (a, b) => Math.abs(a - b) === 1 || (a === 1 && b === 13) || (a === 13 && b === 1);
  const isRed = s => s === '♥' || s === '♦';
  const fmt = n => n >= 1e4 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K' : String(n);

  // ===== AUDIO (tiny synth, no files) =====
  let actx;
  function tone(freq, dur = 0.12, type = 'triangle', vol = 0.15) {
    if (!S.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* audio unavailable */ }
  }
  const sfx = {
    play: s => tone(330 * Math.pow(2, Math.min(s, 16) / 12)),
    draw: () => tone(180, 0.08, 'sine'),
    bad: () => tone(110, 0.15, 'square', 0.08),
    win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25), i * 110)),
    coin: () => tone(1200, 0.08, 'sine', 0.1),
  };

  // ===== RUN STATE =====
  let run = null, history = [], busy = false, hintTimer = 0;

  function startLevel(n) {
    const cfg = levelConfig(n);
    const slots = []; cfg.layout.build(slots);
    const cards = slots.map((p, id) => Object.assign({ id, removed: false }, p));
    // who covers whom: a card is covered by any higher card that overlaps it
    const coverers = cards.map(a => cards.filter(b => b.z > a.z && Math.abs(b.x - a.x) < 0.95 && Math.abs(b.y - a.y) < 1.3).map(b => b.id));

    // creatures
    shuffle(cards.slice()).slice(0, cfg.creatures).forEach(c => { c.creature = cfg.pool[rand(cfg.pool.length)]; });
    // key + locks. Locks only go on cards with z <= key.z, so a lock can never sit on top of its own key.
    let hasKey = false;
    if (cfg.locks) {
      const keyCand = cards.filter(c => c.z >= 1 && !c.creature);
      const key = keyCand[rand(keyCand.length)];
      if (key) {
        key.key = true; hasKey = true;
        shuffle(cards.filter(c => c !== key && c.z <= key.z)).slice(0, cfg.locks).forEach(c => { c.lock = true; });
      }
    }
    const { waste, stock } = dealSolvable(cards, coverers, cfg);
    run = {
      level: n, layout: cfg.layout.name, cards, coverers, waste, stock, slack: cfg.slack, help: cfg.help,
      streak: 0, best: 0, earned: 0, collected: {}, unlocked: !hasKey, extras: 0,
    };
    history = [];
    S.played++; save();
    showScreen('game');
    renderGame();
    resetHint();
  }

  /* Every level is winnable. We pick a random legal clearing order, cut it into runs, and give each run a
   * chain of ranks (each one above or below the last). Each run starts from a card drawn off the stock,
   * so the stock holds exactly those starters in order, plus `slack` spare cards drawn last.
   * The player never sees the plan; they just find there is always a way through. */
  function dealSolvable(cards, coverers, cfg) {
    const out = new Set(), order = [];
    let keyTaken = !cards.some(c => c.key);
    while (order.length < cards.length) {
      const avail = cards.filter(c => !out.has(c.id) && coverers[c.id].every(id => out.has(id)) && (!c.lock || keyTaken));
      const c = avail[rand(avail.length)];
      out.add(c.id); order.push(c);
      if (c.key) keyTaken = true;
    }
    const step = (r, d) => ((r - 1 + d + 13) % 13) + 1;
    const suit = () => SUITS[rand(4)];
    const starters = [];
    for (let i = 0; i < order.length;) {
      let r = 1 + rand(13), dir = Math.random() < 0.5 ? 1 : -1;
      starters.push({ rank: r, suit: suit() });
      const len = cfg.runMin + rand(cfg.runMax - cfg.runMin + 1);
      for (let k = 0; k < len && i < order.length; k++, i++) {
        if (Math.random() < 0.3) dir = -dir;   // zig-zag sometimes so runs aren't plain staircases
        r = step(r, dir);
        Object.assign(order[i], { rank: r, suit: suit() });
      }
    }
    // The stock size covers every planned run plus `slack` spares. Actual stock cards are dealt on draw
    // (see drawCard) so they can adapt when the player takes a different route than the plan.
    return { waste: [starters[0]], stock: Array(starters.length - 1 + cfg.slack).fill(0) };
  }

  // Deal the next stock card. With probability `help`, it's one rank away from a card the player can see,
  // preferring cards that start a longer chain. Otherwise it's random.
  function drawCard() {
    const suit = SUITS[rand(4)];
    const open = run.cards.filter(c => !c.removed && faceUp(c) && (!c.lock || run.unlocked));
    if (open.length && Math.random() < run.help) {
      const chain = c => open.filter(o => o !== c && adjacent(o.rank, c.rank)).length;
      const best = open.slice().sort((a, b) => chain(b) - chain(a));
      const target = best[Math.random() < 0.6 ? 0 : rand(best.length)];
      return { rank: ((target.rank - 1 + (Math.random() < 0.5 ? 1 : -1) + 13) % 13) + 1, suit };
    }
    return { rank: 1 + rand(13), suit };
  }

  const faceUp = c => run.coverers[c.id].every(id => run.cards[id].removed);
  const top = () => run.waste[run.waste.length - 1];
  function canPlay(c) {
    if (c.removed || !faceUp(c) || (c.lock && !run.unlocked)) return false;
    const t = top();
    return t.wild || adjacent(t.rank, c.rank);
  }
  const playable = () => run.cards.filter(canPlay);
  const remaining = () => run.cards.filter(c => !c.removed).length;

  function snapshot() { history.push(JSON.stringify({ run, wild: S.wild })); if (history.length > 50) history.shift(); }

  // ===== ACTIONS =====
  function playCard(c, el) {
    if (busy) return;
    if (!canPlay(c)) {
      if (!c.removed && faceUp(c)) { sfx.bad(); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); if (c.lock && !run.unlocked) toast('Clear the 🗝️ card to unlock'); }
      return;
    }
    snapshot();
    c.removed = true;
    run.waste.push({ rank: c.rank, suit: c.suit });
    run.streak++; run.best = Math.max(run.best, run.streak);
    const gain = 5 + Math.min(45, 5 * run.streak);
    run.earned += gain;
    sfx.play(run.streak);
    const r = el.getBoundingClientRect();
    popText(`+${gain}`, r.left + r.width / 2, r.top);
    if (c.creature) {
      run.collected[c.creature] = (run.collected[c.creature] || 0) + 1;
      popText(CREATURES[c.creature].e, r.left + r.width / 2, r.top + r.height / 2);
    }
    if (c.key) { run.unlocked = true; toast('🔓 Shell locks opened!'); }
    if (run.streak % STREAK_WILD === 0) { S.wild++; save(); toast(`🔥 ${run.streak} streak! +1 Wild`); bump('h-wilds'); }
    fly(el, () => { renderGame(); afterMove(); });
  }

  function draw() {
    if (busy) return;
    if (!run.stock.length) { checkStuck(true); return; }
    snapshot();
    run.stock.pop();
    run.waste.push(drawCard());
    run.streak = 0;
    sfx.draw();
    renderGame(); afterMove();
  }

  function useWild() {
    if (busy || top().wild) return;
    if (S.wild <= 0) {
      return modal('🃏', 'Buy a Wild?', `<p>A wild card matches any rank. Buy one for <b>${COST.wild} 🪙</b>?</p>`, [
        ['Buy', 'gold', () => { if (spend(COST.wild)) { S.wild++; save(); renderGame(); } }, S.coins + run.earned < COST.wild],
        ['Not now', 'alt'],
      ]);
    }
    snapshot();
    S.wild--; save();
    run.waste.push({ wild: true });
    tone(880, 0.2, 'sine');
    renderGame(); afterMove();
  }

  function undo() {
    if (busy || !history.length) return;
    const snap = JSON.parse(history[history.length - 1]);
    // coins earned by the undone move are taken back (snapshot's earned), then the undo fee is paid
    if (S.coins + snap.run.earned < COST.undo) { toast(`Undo costs ${COST.undo} 🪙`); return; }
    history.pop();
    run = snap.run; S.wild = snap.wild;
    spend(COST.undo);
    save(); renderGame(); resetHint();
  }

  // Pay from run earnings first, then the bank. Returns false if unaffordable.
  function spend(amount) {
    const total = S.coins + run.earned;
    if (total < amount) { toast('Not enough coins'); return false; }
    const fromRun = Math.min(run.earned, amount);
    run.earned -= fromRun; S.coins -= amount - fromRun;
    save(); renderHud();
    return true;
  }

  function afterMove() {
    resetHint();
    if (remaining() === 0) return win();
    checkStuck(false);
  }

  function checkStuck(fromStockClick) {
    if (run.stock.length || playable().length) return;
    const extraCost = COST.extra[Math.min(run.extras, COST.extra.length - 1)];
    const total = S.coins + run.earned;
    modal('🌊', 'Out of cards!', `<p>${remaining()} cards left on the reef.</p>`, [
      [`+${EXTRA_CARDS} cards · ${extraCost} 🪙`, 'gold', () => {
        if (!spend(extraCost)) return;
        run.extras++;
        run.stock.push(...Array(EXTRA_CARDS).fill(0));
        history = [];
        renderGame();
      }, total < extraCost],
      ...(S.wild > 0 ? [[`Use a Wild (${S.wild})`, '', () => useWild()]] : []),
      ['Give up', 'alt', lose],
    ], false);
    if (fromStockClick) sfx.bad();
  }

  function bankRun() {
    S.coins += run.earned;
    for (const k in run.collected) S.items[k] = (S.items[k] || 0) + run.collected[k];
  }

  function win() {
    const left = run.stock.length;
    const bonus = 50 + 20 * left;
    run.earned += bonus;
    // stars measure how many of the spare cards you still had: play the planned chains well = 3 stars
    const stars = run.extras ? 1 : left >= Math.ceil(run.slack * 0.6) ? 3 : left >= Math.ceil(run.slack * 0.25) ? 2 : 1;
    bankRun();
    S.stars[run.level] = Math.max(S.stars[run.level] || 0, stars);
    if (run.level === S.level) S.level++;
    S.won++;
    save();
    sfx.win();
    const lvl = run.level;
    const got = Object.entries(run.collected).map(([k, v]) => `${CREATURES[k].e}×${v}`).join(' ') || 'none';
    modal('🏆', 'Reef cleared!',
      `<div class="big-stars">${[1, 2, 3].map(i => `<span class="${i <= stars ? '' : 'off'}">⭐</span>`).join('')}</div>
       <p>Earned <b>${run.earned} 🪙</b> (incl. ${bonus} clear bonus for ${left} cards left)<br>Rescued: ${got}<br>Best streak: ${run.best}</p>`,
      [['Next level', '', () => startLevel(lvl + 1)], ['Map', 'alt', () => goMap()]], false);
    run = null;
  }

  function lose() {
    bankRun(); save();
    const kept = run.earned;
    const lvl = run.level;
    run = null;
    modal('🐡', 'So close!', `<p>You keep the <b>${kept} 🪙</b> and creatures you rescued.</p>`,
      [['Try again', '', () => startLevel(lvl)], ['Map', 'alt', () => goMap()]], false);
  }

  function quit() {
    modal('🧭', 'Leave level?', '<p>You keep coins and creatures collected so far.</p>', [
      ['Leave', 'alt', () => { bankRun(); save(); run = null; goMap(); }],
      ['Keep playing', ''],
    ]);
  }

  // ===== HINTS =====
  function resetHint() {
    clearTimeout(hintTimer);
    document.querySelectorAll('.hint').forEach(e => e.classList.remove('hint'));
    hintTimer = setTimeout(() => {
      if (!run || busy) return;
      const p = playable()[0];
      const el = p ? document.querySelector(`[data-id="${p.id}"]`) : run.stock.length ? $('stock').querySelector('.card') : null;
      if (el) el.classList.add('hint');
    }, 7000);
  }

  // ===== RENDER: GAME =====
  function cardFace(c, unit) {
    if (c.wild) return `<div class="card wild" style="font-size:${unit * 0.5}px">★</div>`;
    const fs = unit * 0.36;
    return `<div class="corner" style="font-size:${fs}px"><span>${RANK[c.rank]}</span><span style="font-size:${fs * 0.85}px">${c.suit}</span></div>
            <div class="pip" style="font-size:${unit * 0.55}px">${c.suit}</div>`;
  }

  function renderGame() {
    if (!run) return;
    const board = $('board');
    const W = board.clientWidth, H = board.clientHeight;
    const CH = 1.32;  // card height in units
    const maxX = Math.max(...run.cards.map(c => c.x)) + 1, rowsY = Math.max(...run.cards.map(c => c.y));
    // width decides card size; spare height spreads the rows apart (up to 1.9x) so covered cards show more
    let unit = Math.min(W / maxX, 74);
    if ((rowsY + CH) * unit > H) unit = H / (rowsY + CH);
    const ys = rowsY ? Math.max(1, Math.min(1.9, (H / unit - CH) / rowsY)) : 1;
    const offX = (W - maxX * unit) / 2, offY = Math.max(0, (H - (rowsY * ys + CH) * unit) / 2);
    let html = '';
    for (const c of run.cards) {
      if (c.removed) continue;
      const up = faceUp(c);
      const style = `left:${offX + c.x * unit}px;top:${offY + c.y * ys * unit}px;width:${unit * 0.94}px;height:${unit * CH}px;z-index:${c.z + 1}`;
      const badge = c.creature ? `<span class="badge" style="font-size:${unit * (up ? 0.36 : 0.5)}px">${CREATURES[c.creature].e}</span>`
        : c.key ? `<span class="badge" style="font-size:${unit * (up ? 0.36 : 0.5)}px">🗝️</span>` : '';
      const lock = c.lock && !run.unlocked ? `<div class="lock" style="font-size:${unit * 0.5}px">🔒</div>` : '';
      if (up) {
        html += `<div class="card face ${isRed(c.suit) ? 'red' : ''}" data-id="${c.id}" data-rank="${c.rank}" style="${style}">${cardFace(c, unit)}${badge}${lock}</div>`;
      } else {
        html += `<div class="card back" style="${style}">${badge}${lock}</div>`;
      }
    }
    board.innerHTML = html;

    // tray
    const t = top();
    const wasteUnit = $('waste').clientWidth;
    $('waste').innerHTML = t.wild ? cardFace(t, wasteUnit)
      : `<div class="card ${isRed(t.suit) ? 'red' : ''}">${cardFace(t, wasteUnit)}</div>`;
    $('stock').innerHTML = (run.stock.length ? '<div class="card back"></div>' : '') + `<span class="count">${run.stock.length}</span>`;
    $('stock').classList.toggle('empty', !run.stock.length);
    $('wild-count').textContent = S.wild;
    $('btn-undo').disabled = !history.length;
    $('btn-wild').disabled = !!t.wild;
    $('g-level').textContent = `Level ${run.level}`;
    $('g-layout').textContent = run.layout;
    $('g-earned').textContent = run.earned;
    $('g-catch').innerHTML = Object.entries(run.collected).map(([k, v]) => `<span>${CREATURES[k].e} ${v}</span>`).join('');
    const pct = (run.streak % STREAK_WILD) / STREAK_WILD * 100;
    $('streak-fill').style.width = `${run.streak && run.streak % STREAK_WILD === 0 ? 100 : pct}%`;
    $('streak-label').textContent = run.streak ? `STREAK ${run.streak} · WILD AT ${Math.ceil((run.streak + 0.01) / STREAK_WILD) * STREAK_WILD}` : `STREAK ${STREAK_WILD} FOR A FREE WILD`;
    renderHud();
  }

  function fly(el, done) {
    busy = true;
    const from = el.getBoundingClientRect(), to = $('waste').getBoundingClientRect();
    const f = el.cloneNode(true);
    f.classList.add('flyer'); f.classList.remove('hint');
    Object.assign(f.style, { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' });
    document.body.appendChild(f);
    el.style.visibility = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      Object.assign(f.style, { left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px' });
    }));
    setTimeout(() => { f.remove(); busy = false; done(); }, 230);
  }

  function popText(text, x, y) {
    const p = document.createElement('div');
    p.className = 'pop'; p.textContent = text;
    p.style.left = x - 20 + 'px'; p.style.top = y + 'px';
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }

  // ===== RENDER: HUD / MAP / REEF =====
  function renderHud() {
    $('h-coins').textContent = fmt(S.coins + (run ? run.earned : 0));
    $('h-wilds').textContent = S.wild;
    $('btn-sound').textContent = S.sound ? '🔊' : '🔈';
  }
  function bump(id) { const e = $(id).parentElement; e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }

  const bagHtml = () => Object.keys(CREATURES).filter(k => CREATURES[k].from <= S.level || S.items[k])
    .map(k => `<span>${CREATURES[k].e} ${S.items[k] || 0}</span>`).join('');

  function renderMap() {
    const done = S.reef.length;
    $('map-reef-sub').textContent = `Reef ${S.tier + 1} · ${done} / ${ZONES.length} restored`;
    $('map-reef-art').textContent = done >= 4 ? '🐢' : done >= 2 ? '🪸' : '🌱';
    $('map-bag').innerHTML = bagHtml();
    let html = '';
    for (let n = 1; n <= S.level + 4; n++) {
      const st = S.stars[n] || 0, locked = n > S.level, cur = n === S.level;
      html += `<li><button type="button" class="lvl ${cur ? 'current' : ''} ${locked ? 'locked' : ''}" data-level="${n}" ${locked ? 'disabled' : ''}>
        <b>${locked ? '🔒' : n}</b><small>${LAYOUTS[(n - 1) % LAYOUTS.length].name}</small>
        <span class="stars">${locked ? '&nbsp;' : [1, 2, 3].map(i => i <= st ? '⭐' : '☆').join('')}</span></button></li>`;
    }
    $('levels').innerHTML = html;
    renderHud();
    const cur = document.querySelector('.lvl.current');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }

  const tierScale = () => 1 + S.tier * 0.75;
  const zoneNeed = z => Object.fromEntries(Object.entries(z.need).map(([k, v]) => [k, Math.ceil(v * tierScale())]));
  const zoneCoins = z => Math.ceil(z.coins * tierScale() / 10) * 10;

  function renderReef() {
    $('reef-tier').textContent = `Reef ${S.tier + 1}`;
    $('reef-bag').innerHTML = bagHtml();
    $('zones').innerHTML = ZONES.map((z, i) => {
      const done = S.reef.includes(i), need = zoneNeed(z), coins = zoneCoins(z);
      const ok = Object.entries(need).every(([k, v]) => (S.items[k] || 0) >= v) && S.coins >= coins;
      const rewardTxt = [z.reward.wild && `${z.reward.wild} 🃏`, z.reward.coins && `${Math.round(z.reward.coins * tierScale())} 🪙`].filter(Boolean).join(' + ');
      return `<div class="zone ${done ? 'done' : 'todo'}">
        <div class="zone-art">${z.art}</div>
        <div><h3>${z.name} ${done ? '✅' : ''}</h3>
        ${done ? '<p class="reward">Restored! The creatures are back.</p>' : `
          <div class="need">${Object.entries(need).map(([k, v]) => `<span class="${(S.items[k] || 0) >= v ? 'ok' : ''}">${CREATURES[k].e} ${S.items[k] || 0}/${v}</span>`).join('')}
          <span class="${S.coins >= coins ? 'ok' : ''}">🪙 ${coins}</span></div>
          <p class="reward">Reward: ${rewardTxt}</p>
          <button type="button" class="btn small" data-zone="${i}" ${ok ? '' : 'disabled'}>Restore</button>`}
        </div></div>`;
    }).join('');
    renderHud();
  }

  function restoreZone(i) {
    const z = ZONES[i], need = zoneNeed(z), coins = zoneCoins(z);
    if (S.reef.includes(i) || S.coins < coins || !Object.entries(need).every(([k, v]) => (S.items[k] || 0) >= v)) return;
    S.coins -= coins;
    for (const [k, v] of Object.entries(need)) S.items[k] -= v;
    S.reef.push(i);
    S.wild += z.reward.wild || 0;
    S.coins += Math.round((z.reward.coins || 0) * tierScale());
    sfx.win();
    let extra = '';
    if (S.reef.length === ZONES.length) { S.tier++; S.reef = []; extra = `<p>The whole reef is alive again! A new, bigger reef awaits: <b>Reef ${S.tier + 1}</b>.</p>`; }
    save();
    modal('🪸', `${z.name} restored!`, `<p>${z.art}</p>${extra}`, [['Yay!', '']]);
    renderReef();
  }

  // ===== SCREENS / MODAL / TOAST =====
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === `screen-${name}`));
  }
  function goMap() { showScreen('map'); renderMap(); }

  // actions: [label, style, onClick, disabled]
  function modal(art, title, body, actions, closeOnBackdrop = true) {
    $('modal-art').textContent = art;
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = body;
    const box = $('modal-actions'); box.innerHTML = '';
    for (const [label, style, fn, disabled] of actions) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `btn ${style || ''}`; b.textContent = label; b.disabled = !!disabled;
      b.addEventListener('click', () => { $('modal').hidden = true; if (fn) fn(); });
      box.appendChild(b);
    }
    $('modal').dataset.dismiss = closeOnBackdrop ? '1' : '';
    $('modal').hidden = false;
  }
  $('modal').addEventListener('click', e => { if (e.target === $('modal') && $('modal').dataset.dismiss) $('modal').hidden = true; });

  let toastT;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // ===== INPUT =====
  $('board').addEventListener('click', e => {
    const el = e.target.closest('.card.face');
    if (el && run) playCard(run.cards[+el.dataset.id], el);
  });
  $('stock').addEventListener('click', () => run && draw());
  $('btn-wild').addEventListener('click', () => run && useWild());
  $('btn-undo').addEventListener('click', () => run && undo());
  $('btn-quit').addEventListener('click', quit);
  $('btn-reef').addEventListener('click', () => { showScreen('reef'); renderReef(); });
  $('btn-reef-back').addEventListener('click', goMap);
  $('zones').addEventListener('click', e => { const b = e.target.closest('[data-zone]'); if (b) restoreZone(+b.dataset.zone); });
  $('levels').addEventListener('click', e => { const b = e.target.closest('[data-level]'); if (b && !b.disabled) startLevel(+b.dataset.level); });
  $('btn-sound').addEventListener('click', () => { S.sound = !S.sound; save(); renderHud(); });
  window.addEventListener('resize', () => run && renderGame());
  window.addEventListener('pagehide', () => { if (run) { bankRun(); run.earned = 0; run.collected = {}; } save(); });

  // ===== NATIVE APP (Capacitor), same hooks as Strata Tycoon =====
  const Cap = window.Capacitor;
  if (Cap && Cap.isNativePlatform && Cap.isNativePlatform()) {
    document.documentElement.classList.add('native');
    const App = Cap.Plugins && Cap.Plugins.App;
    // Android may kill a backgrounded app without firing pagehide, so bank progress whenever we go to the background.
    if (App) App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) { if (run) { bankRun(); run.earned = 0; run.collected = {}; } save(); }
    });
    if (App) App.addListener('backButton', () => {
      if (!$('modal').hidden) { if ($('modal').dataset.dismiss) $('modal').hidden = true; }
      else if (run) quit();
      else if (document.querySelector('#screen-reef.active')) goMap();
      else App.minimizeApp();
    });
  }

  // ===== BOOT =====
  goMap();
  if (S.played === 0) {
    modal('🐠', 'Welcome to the Tidepool!', `<p>Tap a face-up card <b>one higher or lower</b> than the card in your pile. Kings and Aces connect.</p>
      <p>Stuck? Tap the deck to draw. Clear the board to win, and rescue sea creatures to restore your reef!</p>`, [['Dive in', '', () => startLevel(1)]]);
  }
})();
