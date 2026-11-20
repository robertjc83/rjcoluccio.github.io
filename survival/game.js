/* Hollow Pines — forest survival. Gather by day, hold the Hearth by night. Plain JS, no dependencies. */
(() => {
  'use strict';

  // =====================================================================
  // Constants & data
  // =====================================================================
  const TILE = 40, GRID = 80, WORLD = TILE * GRID;
  const DAY_LEN = 150, NIGHT_LEN = 95, CYCLE = DAY_LEN + NIGHT_LEN, DUSK = 20;
  const HG = GRID / 2, HX = (HG + 0.5) * TILE, HY = HX;
  const SAVE_KEY = 'hollowpines.save.v1', BEST_KEY = 'hollowpines.best', MUTE_KEY = 'hollowpines.muted';
  const RES_KEYS = ['wood', 'stone', 'iron', 'berries', 'bone'];
  const RES_NAME = { wood: 'Wood', stone: 'Stone', iron: 'Iron', berries: 'Berries', bone: 'Bone' };
  const RES_COL = { wood: '#c99358', stone: '#c3c8cd', iron: '#e39a5a', berries: '#ff6b81', bone: '#f3ecd9' };

  const TOOL_POWER = [1, 2, 3, 5];
  const WEAPON_DMG = [11, 19, 31, 52];
  const LANTERN = [95, 130, 165, 205];
  const TOOL_COST = [null, { wood: 15, stone: 20 }, { wood: 30, stone: 25, iron: 20 }, { iron: 35, bone: 15 }];
  const GEAR = {
    axe: { label: 'Axe', names: ['Flint Axe', 'Stone Axe', 'Iron Axe', 'Hollowbone Axe'], stat: t => `Chops ${TOOL_POWER[t]} wood per swing`, cost: TOOL_COST },
    pick: { label: 'Pickaxe', names: ['Flint Pick', 'Stone Pickaxe', 'Iron Pickaxe', 'Hollowbone Pick'], stat: t => `Mines ${TOOL_POWER[t]} stone${t ? ', can mine iron' : ''}`, cost: TOOL_COST },
    weapon: { label: 'Weapon', names: ['Wooden Spear', 'Stone Spear', 'Iron Sword', 'Hollowbone Glaive'], stat: t => `${WEAPON_DMG[t]} damage`, cost: [null, { wood: 20, stone: 25 }, { wood: 20, stone: 20, iron: 25 }, { iron: 40, bone: 20 }] },
    lantern: { label: 'Lantern', names: ['Candle Lantern', 'Oil Lantern', 'Bright Lantern', 'Hollowfire Lantern'], stat: t => `Light radius ${LANTERN[t]}${t === 3 ? ', burns nearby creatures' : ''}`, cost: [null, { wood: 10, stone: 12 }, { stone: 20, iron: 12 }, { iron: 25, bone: 10 }] },
  };
  const GEAR_KEYS = ['axe', 'pick', 'weapon', 'lantern'];

  // block: 2 = blocks everyone, 1 = blocks creatures only, 0 = walk over
  const SD = {
    hearth: { name: 'Hearth', maxLv: 5, block: 2, hp: [400, 650, 950, 1300, 1800],
      cost: [null, { wood: 40, stone: 30 }, { stone: 60, iron: 20 }, { iron: 50, bone: 15 }, { iron: 80, bone: 40 }],
      light: [210, 250, 290, 330, 370], ward: [3, 5, 8, 11, 15],
      desc: 'The heart of your camp. Heals you, burns creatures in its glow, and sets how far you can build. If it goes out, the run is over.' },
    bench: { name: 'Workbench', names: ['Workbench', 'Smithy', 'Bone Forge'], maxLv: 3, block: 2, unique: true, hp: [150, 300, 500],
      cost: [{ wood: 20 }, { wood: 40, stone: 30 }, { stone: 40, iron: 25 }],
      desc: 'Stand near it to craft. Its level sets the best tool tier you can make.' },
    wall: { names: ['Log Wall', 'Stone Wall', 'Iron Wall'], maxLv: 3, block: 2, hp: [150, 380, 800],
      cost: [{ wood: 4 }, { stone: 6 }, { iron: 4 }], desc: 'Blocks everything. Creatures will claw through it.' },
    gate: { names: ['Log Gate', 'Stone Gate', 'Iron Gate'], maxLv: 3, block: 1, hp: [120, 300, 650],
      cost: [{ wood: 8 }, { stone: 10 }, { iron: 6 }], desc: 'You can walk through. They can\'t.' },
    spikes: { names: ['Wood Spikes', 'Stone Spikes', 'Bone Spikes'], maxLv: 3, block: 0, hp: [90, 170, 280],
      cost: [{ wood: 6, stone: 2 }, { stone: 8, iron: 2 }, { iron: 6, bone: 3 }], dps: [16, 30, 50],
      desc: 'Hurts and slows creatures that cross it. Wears down with use.' },
    torch: { names: ['Torch', 'Brazier', 'Hollowfire Brazier'], maxLv: 3, block: 0, hp: [50, 110, 200],
      cost: [{ wood: 3, stone: 1 }, { wood: 4, stone: 5 }, { iron: 3, bone: 2 }], light: [110, 145, 185], ward: [3, 6, 10],
      desc: 'Lights the dark. Its glow slowly burns Hollowkin.' },
    tower: { names: ['Watchtower', 'Ballista Tower', 'Bone Ballista'], maxLv: 3, block: 2, needBench: true, hp: [200, 420, 750],
      cost: [{ wood: 20, stone: 15 }, { stone: 25, iron: 10 }, { iron: 25, bone: 8 }], range: [230, 270, 320], dmg: [12, 22, 40], rate: [1.1, 0.85, 0.6],
      desc: 'Fires bolts at the nearest creature.' },
  };
  const BUILD_LIST = ['wall', 'gate', 'spikes', 'torch', 'tower', 'bench'];

  const ED = {
    hollow: { name: 'Hollowkin', hp: 45, spd: 92, dmg: 9, r: 12, xp: 10, bone: [0.35, 1, 1], body: '#bdb4a6', limb: '#7d7468', eye: '#ff3b30' },
    stalker: { name: 'Stalker', hp: 32, spd: 148, dmg: 7, r: 10, xp: 16, bone: [0.5, 1, 1], body: '#2b2a31', limb: '#1b1a20', eye: '#ff5a3c' },
    brute: { name: 'Antlered Brute', hp: 240, spd: 55, dmg: 24, sdmg: 2, r: 20, xp: 55, bone: [1, 1, 3], body: '#8c8172', limb: '#5d554b', eye: '#ff2a1a' },
    elder: { name: 'The Hollow Elder', hp: 1100, spd: 68, dmg: 36, sdmg: 2.5, r: 30, xp: 350, bone: [1, 10, 14], body: '#e8e4da', limb: '#a39d90', eye: '#7fd4ff' },
  };

  const PERKS = [
    { id: 'vit', name: 'Vitality', desc: '+25 max health' },
    { id: 'brawn', name: 'Brawn', desc: '+15% weapon damage' },
    { id: 'lumber', name: 'Lumberjack', desc: '+1 wood per chop' },
    { id: 'prospect', name: 'Prospector', desc: '+1 stone and iron per strike' },
    { id: 'fleet', name: 'Fleet-footed', desc: '+8% move speed' },
    { id: 'gut', name: 'Iron Gut', desc: 'Hunger drains 20% slower' },
    { id: 'mason', name: 'Mason', desc: 'All structures get +15% health' },
    { id: 'warden', name: 'Warden', desc: 'Towers deal +20% damage' },
  ];

  // =====================================================================
  // Helpers
  // =====================================================================
  const $ = s => document.querySelector(s);
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const key = (gx, gy) => gx + ',' + gy;
  const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };
  const lerpAng = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = randInt(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
  };
  const sname = (t, lv) => SD[t].names ? SD[t].names[lv - 1] : SD[t].name;
  const fmtTime = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  // =====================================================================
  // Sound
  // =====================================================================
  const AC = window.AudioContext || window.webkitAudioContext;
  let ac = null, muted = store.get(MUTE_KEY, false);
  function tone(f, d = 0.1, type = 'square', v = 0.05, f2) {
    if (muted || !AC) return;
    try {
      ac = ac || new AC();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
    } catch (e) { /* audio unavailable */ }
  }
  const sfx = {
    chop: () => tone(170, 0.08, 'square', 0.035, 90),
    mine: () => tone(620, 0.07, 'triangle', 0.05, 320),
    pick: () => tone(700, 0.06, 'sine', 0.04, 900),
    hit: () => tone(150, 0.1, 'sawtooth', 0.05, 60),
    swish: () => tone(420, 0.05, 'sine', 0.015, 200),
    build: () => { tone(300, 0.08, 'square', 0.035); setTimeout(() => tone(460, 0.09, 'square', 0.035), 70); },
    hurt: () => tone(95, 0.22, 'sawtooth', 0.07, 45),
    crash: () => tone(110, 0.3, 'square', 0.05, 40),
    level: () => [392, 523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'triangle', 0.05), i * 90)),
    howl: () => { tone(240, 0.9, 'sine', 0.06, 470); setTimeout(() => tone(470, 1.2, 'sine', 0.05, 190), 850); },
    dawn: () => [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sine', 0.04), i * 140)),
    shoot: () => tone(900, 0.05, 'triangle', 0.02, 500),
    eat: () => tone(500, 0.08, 'sine', 0.04, 700),
    deny: () => tone(160, 0.12, 'square', 0.03),
  };

  // =====================================================================
  // Canvas
  // =====================================================================
  const canvas = $('#game'), ctx = canvas.getContext('2d');
  const dark = document.createElement('canvas'), dctx = dark.getContext('2d');
  const mini = $('#mini'), mctx = mini.getContext('2d');
  let dpr = 1, zoom = 1, VW = 0, VH = 0, camX = 0, camY = 0;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = dark.width = Math.floor(innerWidth * dpr);
    canvas.height = dark.height = Math.floor(innerHeight * dpr);
    zoom = clamp(Math.min(innerWidth, innerHeight) / 720, 0.6, 1.15);
    VW = innerWidth / zoom; VH = innerHeight / zoom;
  }
  addEventListener('resize', resize);
  resize();

  const groundTex = (() => {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#22331d'; g.fillRect(0, 0, S, S);
    const blob = (x, y, r, col) => {
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        g.fillStyle = col; g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill();
      }
    };
    for (let i = 0; i < 160; i++) blob(rand(0, S), rand(0, S), rand(6, 22), `rgba(${randInt(20, 45)},${randInt(45, 70)},${randInt(18, 32)},${rand(0.2, 0.45).toFixed(2)})`);
    for (let i = 0; i < 300; i++) blob(rand(0, S), rand(0, S), rand(0.6, 1.6), `rgba(${randInt(60, 110)},${randInt(70, 100)},${randInt(30, 50)},${rand(0.25, 0.6).toFixed(2)})`);
    return c;
  })();
  const groundPat = ctx.createPattern(groundTex, 'repeat');

  // =====================================================================
  // State
  // =====================================================================
  let G = null;
  const input = { keys: new Set(), attack: false, mx: 0, my: 0, stick: { x: 0, y: 0, id: null } };
  const ui = { build: false, craft: false, sel: null, placing: null, modal: 'title', pendingLvl: 0, perkChoices: null };
  const isTouch = matchMedia('(pointer: coarse)').matches;
  if (isTouch) document.body.classList.add('touch');

  const perk = k => (G.p.perks[k] || 0);
  const buildRadius = () => 270 + 70 * G.hearth.lv;
  const smax = s => Math.round(SD[s.type].hp[s.lv - 1] * (1 + 0.15 * perk('mason')));
  const weaponDmg = () => WEAPON_DMG[G.gear.weapon] * (1 + 0.15 * perk('brawn')) * (1 + 0.04 * (G.p.lvl - 1));
  const speed = () => 165 * (1 + 0.08 * perk('fleet'));
  const xpNeed = l => Math.floor(40 * Math.pow(l, 1.45));
  const isNight = () => G.t >= DAY_LEN;
  function darkness() {
    const t = G.t;
    if (t < 6) return 0.88 * (1 - t / 6);
    if (t < DAY_LEN - DUSK) return 0;
    if (t < DAY_LEN) return 0.88 * ((t - (DAY_LEN - DUSK)) / DUSK);
    return 0.88;
  }

  function newGame() {
    G = {
      day: 1, t: 6, time: 0, night: false, saveT: 0,
      inv: { wood: 10, stone: 0, iron: 0, berries: 3, bone: 0 },
      gear: { axe: 0, pick: 0, weapon: 0, lantern: 0 },
      p: { x: HX, y: HY + 90, r: 14, hp: 100, maxHp: 100, hunger: 100, xp: 0, lvl: 1, face: Math.PI / 2, swingCd: 0, swingT: 0, dead: 0, hurt: 0, walk: 0, perks: {} },
      structs: new Map(), res: [], enemies: [], proj: [], fx: [], pops: [], spawnQ: [],
      stats: { kills: 0, built: 0 }, hearth: null, bench: null,
    };
    placeStruct('hearth', HG, HG);
    genResources();
  }

  // =====================================================================
  // World generation
  // =====================================================================
  function makeRes(type, x, y) {
    const r = { type, x, y, dead: false, regrow: 0, shake: 0 };
    if (type === 'tree') {
      r.r = 16; r.cr = 12; r.max = randInt(10, 14); r.R = rand(26, 38); r.rot = rand(0, 6.28);
      const h = randInt(108, 138), l = rand(13, 19);
      r.cols = [`hsl(${h},34%,${l}%)`, `hsl(${h},36%,${l + 5}%)`, `hsl(${h + 6},38%,${l + 10}%)`];
    } else if (type === 'rock' || type === 'iron') {
      r.r = rand(15, 21); r.cr = r.r * 0.85; r.max = type === 'rock' ? randInt(10, 14) : randInt(6, 9);
      r.pts = Array.from({ length: 8 }, (_, i) => { const a = i / 8 * Math.PI * 2 + rand(-0.2, 0.2), m = rand(0.78, 1.1); return [Math.cos(a) * r.r * m, Math.sin(a) * r.r * m]; });
      r.specks = Array.from({ length: type === 'iron' ? 5 : 2 }, () => [rand(-0.5, 0.5) * r.r, rand(-0.5, 0.5) * r.r, rand(1.5, 3.2)]);
    } else {
      r.r = 16; r.cr = 0; r.max = 4;
      r.blobs = Array.from({ length: 5 }, () => [rand(-8, 8), rand(-7, 7), rand(7, 11)]);
      r.dots = Array.from({ length: 4 }, () => [rand(-9, 9), rand(-8, 8)]);
    }
    r.amount = r.max;
    return r;
  }

  const SPACING = { tree: 52, rock: 46, iron: 46, bush: 40 };
  function spotOk(type, x, y, minHearth) {
    if (x < 30 || y < 30 || x > WORLD - 30 || y > WORLD - 30) return false;
    if (dist(x, y, HX, HY) < minHearth) return false;
    if (G.structs.has(key(Math.floor(x / TILE), Math.floor(y / TILE)))) return false;
    for (const o of G.res) {
      if (o.dead) continue;
      const sp = Math.max(SPACING[type], SPACING[o.type]);
      if (Math.abs(o.x - x) < sp && Math.abs(o.y - y) < sp && dist(o.x, o.y, x, y) < sp) return false;
    }
    return true;
  }
  function findSpot(type, minHearth, avoidPlayer) {
    for (let i = 0; i < 40; i++) {
      const x = rand(40, WORLD - 40), y = rand(40, WORLD - 40);
      if (avoidPlayer && dist(x, y, G.p.x, G.p.y) < 520) continue;
      if (spotOk(type, x, y, minHearth)) return [x, y];
    }
    return null;
  }
  const minDistFor = type => type === 'iron' ? 950 : 280;
  function genResources() {
    const plan = [['iron', 60], ['rock', 150], ['bush', 90], ['tree', 540]];
    for (const [type, n] of plan) {
      for (let i = 0; i < n; i++) {
        const s = findSpot(type, minDistFor(type), false);
        if (s) G.res.push(makeRes(type, s[0], s[1]));
      }
    }
    // a few starter bushes and rocks near camp so the first day isn't a trek
    for (let i = 0; i < 4; i++) { const a = rand(0, 6.28), d = rand(180, 260); G.res.push(makeRes('bush', HX + Math.cos(a) * d, HY + Math.sin(a) * d)); }
    for (let i = 0; i < 4; i++) { const a = rand(0, 6.28), d = rand(200, 270); G.res.push(makeRes('rock', HX + Math.cos(a) * d, HY + Math.sin(a) * d)); }
  }
  function relocate(r) {
    const s = findSpot(r.type, Math.max(minDistFor(r.type), buildRadius() + 60), true);
    if (!s) { r.regrow = 10; return; }
    const n = makeRes(r.type, s[0], s[1]);
    Object.assign(r, n);
  }

  // =====================================================================
  // Structures
  // =====================================================================
  function placeStruct(type, gx, gy, lv = 1, hp) {
    const s = { type, gx, gy, x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE, lv, hp: 0, cd: 0, ang: -Math.PI / 2, hit: 0 };
    s.hp = hp == null ? smax(s) : Math.min(hp, smax(s));
    G.structs.set(key(gx, gy), s);
    if (type === 'hearth') G.hearth = s;
    if (type === 'bench') G.bench = s;
    return s;
  }
  function destroyStruct(s) {
    G.structs.delete(key(s.gx, s.gy));
    burst(s.x, s.y, '#8a7a66', 18, 120);
    sfx.crash();
    if (s === G.bench) G.bench = null;
    if (ui.sel === s) closeSel();
    if (s === G.hearth) gameOver();
  }
  function damageStruct(s, dmg) {
    s.hp -= dmg; s.hit = 0.15;
    burst(s.x + rand(-10, 10), s.y + rand(-10, 10), s.type === 'wall' && s.lv === 1 ? '#8a6038' : '#999', 4, 60);
    if (s.hp <= 0) destroyStruct(s);
  }
  function blocker(x, y, r, enemy) {
    const gx = Math.floor(x / TILE), gy = Math.floor(y / TILE);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const s = G.structs.get(key(gx + dx, gy + dy));
      if (!s) continue;
      const b = SD[s.type].block;
      if (b === 0 || (b === 1 && !enemy)) continue;
      const x0 = s.gx * TILE, y0 = s.gy * TILE;
      const cx = clamp(x, x0, x0 + TILE), cy = clamp(y, y0, y0 + TILE);
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return s;
    }
    return null;
  }
  const afford = c => !c || Object.entries(c).every(([k, v]) => G.inv[k] >= v);
  const spend = c => { if (c) for (const k in c) G.inv[k] -= c[k]; };
  function placeReason(type, gx, gy) {
    const d = SD[type];
    if (d.unique && G.bench) return 'You already have one';
    if (d.needBench && !G.bench) return 'Requires a Workbench';
    if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return 'Out of bounds';
    if (G.structs.has(key(gx, gy))) return 'Space taken';
    const cx = (gx + 0.5) * TILE, cy = (gy + 0.5) * TILE;
    if (dist(cx, cy, HX, HY) > buildRadius()) return 'Too far from the Hearth. Upgrade it to build farther';
    for (const r of G.res) {
      if (r.dead || Math.abs(r.x - cx) > 60 || Math.abs(r.y - cy) > 60) continue;
      const x0 = gx * TILE, y0 = gy * TILE, px = clamp(r.x, x0, x0 + TILE), py = clamp(r.y, y0, y0 + TILE);
      if ((r.x - px) ** 2 + (r.y - py) ** 2 < (r.type === 'bush' ? 10 : r.cr) ** 2) return 'Clear the ' + (r.type === 'iron' ? 'ore' : r.type) + ' first';
    }
    if (d.block === 2) {
      const x0 = gx * TILE, y0 = gy * TILE, p = G.p;
      const px = clamp(p.x, x0, x0 + TILE), py = clamp(p.y, y0, y0 + TILE);
      if (!p.dead && (p.x - px) ** 2 + (p.y - py) ** 2 < p.r * p.r) return 'You are in the way';
    }
    if (d.block) for (const e of G.enemies) if (dist(e.x, e.y, cx, cy) < e.r + 22) return 'A creature is in the way';
    if (!afford(d.cost[0])) return 'Not enough resources';
    return null;
  }
  function tryPlace(wx, wy) {
    const gx = Math.floor(wx / TILE), gy = Math.floor(wy / TILE);
    const existing = G.structs.get(key(gx, gy));
    if (existing) { openSel(existing); return; }
    const type = ui.placing, why = placeReason(type, gx, gy);
    if (why) { toast(why, true); sfx.deny(); return; }
    spend(SD[type].cost[0]);
    const s = placeStruct(type, gx, gy);
    G.stats.built++; addXp(4); sfx.build();
    burst(s.x, s.y, '#d8c8a8', 10, 70);
    if (SD[type].unique) stopPlacing();
    refreshPanels();
  }

  // =====================================================================
  // Player
  // =====================================================================
  function give(k, n) {
    if (n <= 0) return;
    G.inv[k] += n;
    pop(`+${n} ${RES_NAME[k]}`, G.p.x + rand(-10, 10), G.p.y - 26, RES_COL[k]);
  }
  function addXp(n) {
    const p = G.p;
    p.xp += n;
    while (p.xp >= xpNeed(p.lvl)) {
      p.xp -= xpNeed(p.lvl); p.lvl++;
      p.maxHp += 5; p.hp = p.maxHp;
      ui.pendingLvl++;
    }
    if (ui.pendingLvl && !ui.modal) showLevelUp();
  }
  function hurtPlayer(dmg) {
    const p = G.p;
    if (p.dead) return;
    p.hp -= dmg; p.hurt = 0.25;
    sfx.hurt();
    burst(p.x, p.y, '#b3261e', 6, 80);
    if (p.hp <= 0) killPlayer();
  }
  function killPlayer() {
    const p = G.p;
    p.hp = 0; p.dead = 6; input.attack = false;
    const lost = [];
    for (const k of ['wood', 'stone', 'iron', 'berries']) { const n = Math.floor(G.inv[k] * 0.25); if (n) { G.inv[k] -= n; lost.push(`${n} ${RES_NAME[k].toLowerCase()}`); } }
    burst(p.x, p.y, '#b3261e', 30, 160);
    toast('You were dragged down.' + (lost.length ? ' Lost ' + lost.join(', ') + '.' : '') + ' Back at the Hearth in 6s', true);
  }
  function respawn() {
    const p = G.p;
    const spot = freeSpotNear(HX, HY + 70);
    p.x = spot[0]; p.y = spot[1]; p.dead = 0;
    p.hp = Math.round(p.maxHp * 0.6); p.hunger = Math.max(p.hunger, 50);
  }
  function freeSpotNear(x, y) {
    for (let ring = 0; ring < 12; ring++) for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, d = ring * 30;
      const nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d;
      if (!blocker(nx, ny, 16, false)) return [nx, ny];
    }
    return [x, y];
  }
  function eat() {
    const p = G.p;
    if (p.dead) return;
    if (G.inv.berries <= 0) { toast('No berries. Pick some from bushes', true); sfx.deny(); return; }
    if (p.hunger >= 99) { toast('You\'re not hungry'); return; }
    G.inv.berries--; p.hunger = Math.min(100, p.hunger + 22); p.hp = Math.min(p.maxHp, p.hp + 5);
    sfx.eat(); pop('+22 food', p.x, p.y - 26, '#ffd27a');
  }

  function swing() {
    const p = G.p;
    if (p.swingCd > 0 || p.dead) return;
    if (isTouch) autoAim();
    p.swingCd = 0.36; p.swingT = 0.16;
    const reach = 46, a = p.face;
    let hitAny = false;
    for (const e of G.enemies) {
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < p.r + reach + e.r && angDiff(Math.atan2(e.y - p.y, e.x - p.x), a) < 1.2) {
        damageEnemy(e, weaponDmg(), Math.cos(a), Math.sin(a), true);
        hitAny = true;
      }
    }
    if (hitAny) { sfx.hit(); return; }
    let best = null, bd = 1e9;
    for (const r of G.res) {
      if (r.dead) continue;
      const d = dist(p.x, p.y, r.x, r.y);
      if (d < p.r + reach + r.r && d < bd && angDiff(Math.atan2(r.y - p.y, r.x - p.x), a) < 1.1) { best = r; bd = d; }
    }
    if (best) gather(best); else sfx.swish();
  }
  function autoAim() {
    const p = G.p;
    let best = null, bd = 130;
    for (const e of G.enemies) { const d = dist(p.x, p.y, e.x, e.y) - e.r; if (d < bd) { bd = d; best = e; } }
    if (!best) {
      bd = 70;
      for (const r of G.res) { if (r.dead || (r.type === 'bush' && r.amount <= 0)) continue; const d = dist(p.x, p.y, r.x, r.y) - r.r; if (d < bd) { bd = d; best = r; } }
    }
    if (best) p.face = Math.atan2(best.y - p.y, best.x - p.x);
  }
  function gather(r) {
    r.shake = 0.18;
    let n = 0, k;
    if (r.type === 'bush') {
      if (r.amount <= 0) { pop('Picked clean', r.x, r.y - 20, '#aaa'); return; }
      n = 1; k = 'berries'; sfx.pick();
      if (r.amount === r.max) r.regrow = 20;
    } else if (r.type === 'tree') {
      n = TOOL_POWER[G.gear.axe] + perk('lumber'); k = 'wood'; sfx.chop();
      burst(r.x, r.y, '#6b8a3a', 4, 50);
    } else if (r.type === 'rock') {
      n = TOOL_POWER[G.gear.pick] + perk('prospect'); k = 'stone'; sfx.mine();
      burst(r.x, r.y, '#aaa', 4, 60);
    } else {
      if (G.gear.pick < 1) { pop('Need a Stone Pickaxe', r.x, r.y - 24, '#ff9a3c'); sfx.deny(); return; }
      n = Math.max(1, TOOL_POWER[G.gear.pick] - 1) + perk('prospect'); k = 'iron'; sfx.mine();
      burst(r.x, r.y, '#c87533', 5, 60);
    }
    n = Math.min(n, r.amount);
    r.amount -= n;
    give(k, n);
    addXp(1);
    if (r.amount <= 0 && r.type !== 'bush') {
      r.dead = true; r.regrow = rand(70, 130);
      burst(r.x, r.y, r.type === 'tree' ? '#3f5e2a' : '#888', 16, 110);
    }
  }

  // =====================================================================
  // Enemies
  // =====================================================================
  function spawnEnemy(type) {
    const d = ED[type], a = rand(0, Math.PI * 2), dd = rand(760, 980);
    const x = clamp(HX + Math.cos(a) * dd, 20, WORLD - 20), y = clamp(HY + Math.sin(a) * dd, 20, WORLD - 20);
    const hp = Math.round(d.hp * (1 + (G.day - 1) * 0.08));
    G.enemies.push({ type, x, y, r: d.r, hp, maxHp: hp, cd: rand(0, 1), hit: 0, face: a + Math.PI, anim: rand(0, 6), tgt: 'h', tgtT: 0, burn: false, lunge: 0 });
  }
  function nightfall() {
    const n = G.day;
    const list = [];
    for (let i = 0; i < 3 + n * 3; i++) list.push('hollow');
    if (n >= 3) for (let i = 0; i < n - 1; i++) list.push('stalker');
    if (n >= 4) for (let i = 0; i < Math.floor((n - 2) / 2); i++) list.push('brute');
    G.spawnQ = shuffle(list).map(type => ({ type, at: rand(2, NIGHT_LEN * 0.6) })).sort((a, b) => a.at - b.at);
    if (n % 5 === 0) G.spawnQ.push({ type: 'elder', at: NIGHT_LEN * 0.3 });
    G.spawnQ.sort((a, b) => a.at - b.at);
    sfx.howl();
    toast(n % 5 === 0 ? `Night ${n}. Something old walks with them tonight…` : `Night ${n} falls. They are coming.`, true);
  }
  function dawn() {
    for (const e of G.enemies) e.burn = true;
    G.spawnQ = [];
    sfx.dawn();
    toast(`Day ${G.day}. You survived the night.`);
    saveGame();
  }
  function damageEnemy(e, dmg, kx, ky, melee) {
    if (e.hp <= 0) return;
    e.hp -= dmg; e.hit = 0.12;
    pop(String(Math.round(dmg)), e.x + rand(-6, 6), e.y - e.r - 10, '#fff', 0.5);
    burst(e.x, e.y, '#5a1010', 5, 80);
    if (melee) {
      const kb = e.type === 'elder' ? 3 : e.type === 'brute' ? 8 : 22;
      const nx = e.x + kx * kb, ny = e.y + ky * kb;
      if (!blocker(nx, ny, e.r, true)) { e.x = nx; e.y = ny; }
    }
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    const d = ED[e.type];
    e.hp = 0; e.dead = true;
    G.stats.kills++;
    burst(e.x, e.y, '#d8d0c0', 18, 140);
    burst(e.x, e.y, '#4a0d0d', 12, 100);
    addXp(d.xp);
    if (Math.random() < d.bone[0]) give('bone', randInt(d.bone[1], d.bone[2]));
    if (e.type === 'elder') toast('The Hollow Elder falls. The forest goes quiet.');
  }
  function moveEnemy(e, mx, my, step) {
    const b = blocker(e.x + mx, e.y + my, e.r, true);
    if (!b) { e.x += mx; e.y += my; return null; }
    if (Math.abs(mx) > step * 0.35 && !blocker(e.x + mx, e.y, e.r, true)) { e.x += mx; return null; }
    if (Math.abs(my) > step * 0.35 && !blocker(e.x, e.y + my, e.r, true)) { e.y += my; return null; }
    return b;
  }

  // =====================================================================
  // Update
  // =====================================================================
  let lights = [];
  function update(dt) {
    G.time += dt;
    // --- day/night cycle ---
    G.t += dt;
    if (G.t >= CYCLE) { G.t -= CYCLE; G.day++; dawn(); }
    const nightNow = isNight();
    if (nightNow && !G.night) nightfall();
    G.night = nightNow;
    if (G.night) {
      const ne = G.t - DAY_LEN;
      while (G.spawnQ.length && G.spawnQ[0].at <= ne) spawnEnemy(G.spawnQ.shift().type);
    }

    updatePlayer(dt);

    // --- light sources (also used for warding) ---
    lights = [];
    const h = G.hearth;
    lights.push({ x: h.x, y: h.y, r: SD.hearth.light[h.lv - 1], ward: SD.hearth.ward[h.lv - 1], wardR: 0.55 });
    const torches = [];
    for (const s of G.structs.values()) {
      s.hit -= dt;
      if (!G.night && s.hp < smax(s)) s.hp = Math.min(smax(s), s.hp + smax(s) * 0.01 * dt);
      if (s.type === 'torch') { const L = { x: s.x, y: s.y, r: SD.torch.light[s.lv - 1], ward: SD.torch.ward[s.lv - 1], wardR: 0.7 }; lights.push(L); torches.push(L); }
      else if (s.type === 'tower') { lights.push({ x: s.x, y: s.y, r: 60, ward: 0 }); updateTower(s, dt); }
    }
    if (!G.p.dead) lights.push({ x: G.p.x, y: G.p.y, r: LANTERN[G.gear.lantern], ward: G.gear.lantern === 3 ? 5 : 0, wardR: 0.4 });

    updateEnemies(dt);

    // --- projectiles ---
    for (const pr of G.proj) {
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (Math.abs(e.x - pr.x) < e.r + 4 && Math.abs(e.y - pr.y) < e.r + 4 && dist(e.x, e.y, pr.x, pr.y) < e.r + 4) {
          damageEnemy(e, pr.dmg, 0, 0, false); pr.life = 0; break;
        }
      }
    }
    G.proj = G.proj.filter(p => p.life > 0);
    G.enemies = G.enemies.filter(e => !e.dead);

    // --- resources regrow ---
    for (const r of G.res) {
      r.shake -= dt;
      if (r.type === 'bush') {
        if (r.amount < r.max) { r.regrow -= dt; if (r.regrow <= 0) { r.amount++; r.regrow = 20; } }
      } else if (r.dead) { r.regrow -= dt; if (r.regrow <= 0) relocate(r); }
    }

    updateFx(dt);

    G.saveT += dt;
    if (G.saveT > 45) { G.saveT = 0; saveGame(); }
  }

  function updatePlayer(dt) {
    const p = G.p;
    p.hurt -= dt;
    if (p.dead > 0) { p.dead -= dt; if (p.dead <= 0) respawn(); return; }
    let mx = 0, my = 0;
    const K = input.keys;
    if (K.has('KeyW') || K.has('ArrowUp')) my -= 1;
    if (K.has('KeyS') || K.has('ArrowDown')) my += 1;
    if (K.has('KeyA') || K.has('ArrowLeft')) mx -= 1;
    if (K.has('KeyD') || K.has('ArrowRight')) mx += 1;
    mx += input.stick.x; my += input.stick.y;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const moving = len > 0.1;
    if (isTouch) { if (moving) p.face = Math.atan2(my, mx); }
    else p.face = Math.atan2(input.my / zoom + camY - p.y, input.mx / zoom + camX - p.x);
    if (moving) {
      const sp = speed();
      p.walk += dt * 10 * Math.min(1, len);
      const nx = p.x + mx * sp * dt;
      if (!blocker(nx, p.y, p.r, false)) p.x = nx;
      const ny = p.y + my * sp * dt;
      if (!blocker(p.x, ny, p.r, false)) p.y = ny;
      for (const r of G.res) {
        if (r.dead || !r.cr) continue;
        const dx = p.x - r.x, dy = p.y - r.y;
        if (Math.abs(dx) > 50 || Math.abs(dy) > 50) continue;
        const d = Math.hypot(dx, dy), m = p.r + r.cr;
        if (d < m && d > 0.01) {
          const ox = r.x + dx / d * m, oy = r.y + dy / d * m;
          if (!blocker(ox, oy, p.r, false)) { p.x = ox; p.y = oy; }
        }
      }
      p.x = clamp(p.x, p.r, WORLD - p.r); p.y = clamp(p.y, p.r, WORLD - p.r);
    }
    p.swingCd -= dt; p.swingT -= dt;
    if (input.attack && !ui.placing) swing();

    // hunger & healing
    p.hunger = Math.max(0, p.hunger - 0.45 * (1 - 0.2 * perk('gut')) * dt);
    if (p.hunger <= 0) { p.hp -= 2 * dt; if (p.hp <= 0) { killPlayer(); return; } }
    else if (p.hunger > 40) p.hp += 0.8 * dt;
    const h = G.hearth;
    if (dist(p.x, p.y, h.x, h.y) < SD.hearth.light[h.lv - 1] * 0.6) p.hp += (2 + h.lv) * dt;
    p.hp = Math.min(p.maxHp, p.hp);
  }

  function updateTower(s, dt) {
    s.cd -= dt;
    if (s.cd > 0) return;
    const range = SD.tower.range[s.lv - 1];
    let best = null, bd = range;
    for (const e of G.enemies) { if (e.dead || e.burn) continue; const d = dist(s.x, s.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
    if (!best) return;
    // lead the target a little
    const t = bd / 520, ex = best.x + (best.vx || 0) * t, ey = best.y + (best.vy || 0) * t;
    const a = Math.atan2(ey - s.y, ex - s.x);
    s.ang = a; s.cd = SD.tower.rate[s.lv - 1];
    G.proj.push({ x: s.x + Math.cos(a) * 14, y: s.y + Math.sin(a) * 14, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: range / 520 + 0.15, dmg: SD.tower.dmg[s.lv - 1] * (1 + 0.2 * perk('warden')), lv: s.lv });
    sfx.shoot();
  }

  function updateEnemies(dt) {
    const p = G.p, h = G.hearth;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = ED[e.type];
      e.cd -= dt; e.hit -= dt; e.lunge -= dt;
      const ox = e.x, oy = e.y;
      if (e.burn) {
        e.hp -= 60 * dt;
        const a = Math.atan2(e.y - h.y, e.x - h.x);
        e.face = lerpAng(e.face, a, 0.2);
        moveEnemy(e, Math.cos(a) * d.spd * 1.3 * dt, Math.sin(a) * d.spd * 1.3 * dt, d.spd * 1.3 * dt);
        if (Math.random() < dt * 20) burst(e.x, e.y, '#ff8a2a', 1, 40);
        e.anim += dt * 6;
        if (e.hp <= 0) { e.dead = true; burst(e.x, e.y, '#ff9a3c', 14, 90); }
        continue;
      }
      // traps & light
      let slow = 1;
      const cell = G.structs.get(key(Math.floor(e.x / TILE), Math.floor(e.y / TILE)));
      if (cell && cell.type === 'spikes') {
        e.hp -= SD.spikes.dps[cell.lv - 1] * dt; slow = 0.5;
        cell.hp -= 4 * dt;
        if (Math.random() < dt * 8) burst(e.x, e.y, '#5a1010', 1, 40);
        if (cell.hp <= 0) destroyStruct(cell);
      }
      for (const L of lights) {
        if (!L.ward) continue;
        const dd = dist(e.x, e.y, L.x, L.y);
        if (dd < L.r * L.wardR) {
          e.hp -= L.ward * dt;
          if (Math.random() < dt * 6) burst(e.x + rand(-6, 6), e.y + rand(-6, 6), '#ff9a3c', 1, 30);
        }
      }
      if (e.hp <= 0) { killEnemy(e); continue; }

      // targeting
      e.tgtT -= dt;
      if (e.tgtT <= 0) {
        e.tgtT = 0.4;
        const aggro = e.type === 'stalker' ? 460 : 320;
        e.tgt = (!p.dead && dist(e.x, e.y, p.x, p.y) < aggro) ? 'p' : 'h';
      }
      const tx = e.tgt === 'p' && !p.dead ? p.x : h.x, ty = e.tgt === 'p' && !p.dead ? p.y : h.y;
      const dx = tx - e.x, dy = ty - e.y, dd = Math.hypot(dx, dy) || 1;
      e.face = lerpAng(e.face, Math.atan2(dy, dx), Math.min(1, dt * 8));
      if (!p.dead && dist(e.x, e.y, p.x, p.y) < e.r + p.r + 6) {
        if (e.cd <= 0) { hurtPlayer(d.dmg); e.cd = 1; e.lunge = 0.15; }
      } else {
        const step = d.spd * slow * dt;
        const b = moveEnemy(e, dx / dd * step, dy / dd * step, step);
        if (b && e.cd <= 0) { damageStruct(b, d.dmg * (d.sdmg || 1)); e.cd = 1.1; e.lunge = 0.15; }
        e.anim += step / 6;
      }
      e.vx = (e.x - ox) / dt; e.vy = (e.y - oy) / dt;
    }
    // keep them from stacking into one blob
    const E = G.enemies;
    for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
      const a = E[i], b = E[j], dx = b.x - a.x, dy = b.y - a.y, m = a.r + b.r;
      if (Math.abs(dx) > m || Math.abs(dy) > m) continue;
      const d = Math.hypot(dx, dy);
      if (d < m && d > 0.01) {
        const push = (m - d) / 2, ux = dx / d * push, uy = dy / d * push;
        if (!blocker(a.x - ux, a.y - uy, a.r, true)) { a.x -= ux; a.y -= uy; }
        if (!blocker(b.x + ux, b.y + uy, b.r, true)) { b.x += ux; b.y += uy; }
      }
    }
  }

  // =====================================================================
  // Effects
  // =====================================================================
  function burst(x, y, col, n = 10, spd = 80) {
    if (!G) return;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * spd;
      G.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), col, size: rand(1.5, 3.5) });
    }
  }
  function pop(text, x, y, col = '#fff', life = 0.9) { G.pops.push({ text, x, y, col, life, max: life }); }
  function updateFx(dt) {
    for (const f of G.fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.9; f.vy *= 0.9; f.life -= dt; }
    G.fx = G.fx.filter(f => f.life > 0);
    if (G.fx.length > 600) G.fx.splice(0, G.fx.length - 600);
    for (const p of G.pops) { p.y -= 28 * dt; p.life -= dt; }
    G.pops = G.pops.filter(p => p.life > 0);
  }

  // =====================================================================
  // Rendering
  // =====================================================================
  function star(x, y, R, n, inner, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? R * inner : R; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
  }
  function shadow(x, y, rx, ry) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }

  function drawTree(r) {
    const x = r.x + (r.shake > 0 ? Math.sin(G.time * 70) * 2.5 : 0), y = r.y;
    shadow(x + 9, y + 11, r.R * 0.95, r.R * 0.7);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = r.cols[i]; star(x, y - i * 5, r.R * (1 - i * 0.27), 9, 0.7, r.rot + i * 0.35); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,230,.05)'; ctx.beginPath(); ctx.arc(x - r.R * 0.2, y - r.R * 0.35, r.R * 0.25, 0, 7); ctx.fill();
  }
  function drawRock(r) {
    const x = r.x + (r.shake > 0 ? Math.sin(G.time * 80) * 2 : 0), y = r.y;
    shadow(x + 4, y + 6, r.r, r.r * 0.7);
    ctx.fillStyle = r.type === 'iron' ? '#5b5652' : '#71767c';
    ctx.beginPath(); r.pts.forEach(([px, py]) => ctx.lineTo(x + px, y + py)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.ellipse(x - r.r * 0.25, y - r.r * 0.3, r.r * 0.45, r.r * 0.28, -0.4, 0, 7); ctx.fill();
    ctx.fillStyle = r.type === 'iron' ? '#d07a36' : 'rgba(0,0,0,.18)';
    for (const [sx, sy, ss] of r.specks) { ctx.beginPath(); ctx.arc(x + sx, y + sy, ss, 0, 7); ctx.fill(); }
  }
  function drawBush(r) {
    const x = r.x + (r.shake > 0 ? Math.sin(G.time * 70) * 2 : 0), y = r.y;
    shadow(x + 3, y + 5, 15, 10);
    for (const [bx, by, br] of r.blobs) { ctx.fillStyle = '#2f5a30'; ctx.beginPath(); ctx.arc(x + bx, y + by, br, 0, 7); ctx.fill(); }
    for (const [bx, by, br] of r.blobs) { ctx.fillStyle = '#3d7038'; ctx.beginPath(); ctx.arc(x + bx - 2, y + by - 2, br * 0.6, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#e0334f';
    for (let i = 0; i < r.amount; i++) { const [dx, dy] = r.dots[i]; ctx.beginPath(); ctx.arc(x + dx, y + dy, 2.8, 0, 7); ctx.fill(); }
  }

  const WALL_COL = [['#6b4a2b', '#4b321d', '#86603a'], ['#80848a', '#55585d', '#9da1a6'], ['#4a5560', '#2b333b', '#7d8995']];
  function drawStruct(s) {
    const d = SD[s.type], x0 = s.gx * TILE, y0 = s.gy * TILE, x = s.x, y = s.y;
    const flash = s.hit > 0;
    if (s.type === 'wall' || s.type === 'gate') {
      const [base, dk, lt] = WALL_COL[s.lv - 1];
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x0 + 3, y0 + 5, TILE, TILE);
      ctx.fillStyle = flash ? '#fff' : base; ctx.fillRect(x0, y0, TILE, TILE);
      ctx.strokeStyle = dk; ctx.lineWidth = 2;
      if (s.type === 'wall') {
        if (s.lv === 1) { for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x0 + i * 10, y0 + 2); ctx.lineTo(x0 + i * 10, y0 + TILE - 2); ctx.stroke(); } }
        else if (s.lv === 2) { for (let r = 0; r < 3; r++) { ctx.beginPath(); ctx.moveTo(x0, y0 + 13 * r + 13); ctx.lineTo(x0 + TILE, y0 + 13 * r + 13); ctx.stroke(); const off = r % 2 ? 10 : 20; ctx.beginPath(); ctx.moveTo(x0 + off, y0 + 13 * r); ctx.lineTo(x0 + off, y0 + 13 * r + 13); ctx.stroke(); } }
        else { ctx.fillStyle = lt; for (const [rx, ry] of [[6, 6], [34, 6], [6, 34], [34, 34], [20, 20]]) { ctx.beginPath(); ctx.arc(x0 + rx, y0 + ry, 2.5, 0, 7); ctx.fill(); } }
        ctx.strokeStyle = lt; ctx.lineWidth = 1; ctx.strokeRect(x0 + 1.5, y0 + 1.5, TILE - 3, TILE - 3);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x0 + 6, y0 + 6, TILE - 12, TILE - 12);
        ctx.strokeStyle = lt; ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x0 + 9 + i * 7.3, y0 + 6); ctx.lineTo(x0 + 9 + i * 7.3, y0 + TILE - 6); ctx.stroke(); }
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0 + 6, y + 0); ctx.lineTo(x0 + TILE - 6, y); ctx.stroke();
      }
    } else if (s.type === 'spikes') {
      ctx.fillStyle = 'rgba(40,25,15,.45)'; ctx.fillRect(x0 + 2, y0 + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = flash ? '#fff' : ['#9b7448', '#a9adb2', '#efe6d2'][s.lv - 1];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const sx = x0 + 8 + i * 12, sy = y0 + 8 + j * 12;
        ctx.beginPath(); ctx.moveTo(sx, sy - 6); ctx.lineTo(sx + 4, sy + 4); ctx.lineTo(sx - 4, sy + 4); ctx.closePath(); ctx.fill();
      }
    } else if (s.type === 'torch') {
      shadow(x + 3, y + 5, 8, 5);
      if (s.lv === 1) { ctx.fillStyle = '#5a3b20'; ctx.fillRect(x - 3, y - 4, 6, 14); }
      else { ctx.fillStyle = s.lv === 3 ? '#d9cfbf' : '#6e7277'; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill(); ctx.fillStyle = '#2a2420'; ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill(); }
      drawFlame(x, y - (s.lv === 1 ? 6 : 1), 5 + s.lv * 2, s.lv === 3);
    } else if (s.type === 'tower') {
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x0 + 4, y0 + 6, TILE, TILE);
      ctx.fillStyle = flash ? '#fff' : ['#6b4a2b', '#7a7e84', '#cfc6b3'][s.lv - 1]; ctx.fillRect(x0 + 2, y0 + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x0 + 2, y0 + TILE - 8, TILE - 4, 6);
      ctx.fillStyle = ['#8a6038', '#9a9ea4', '#e8e1cf'][s.lv - 1]; ctx.beginPath(); ctx.arc(x, y - 3, 13, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(x, y - 3); ctx.rotate(s.ang);
      ctx.strokeStyle = '#2a1d12'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(16, 0); ctx.stroke();
      ctx.strokeStyle = '#3b2a18'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(6, 0, 10, -1.2, 1.2); ctx.stroke();
      ctx.restore();
    } else if (s.type === 'bench') {
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x0 + 6, y0 + 10, TILE - 6, TILE - 12);
      ctx.fillStyle = flash ? '#fff' : ['#7a5532', '#6b5a4a', '#cfc6b3'][s.lv - 1]; ctx.fillRect(x0 + 3, y0 + 7, TILE - 6, TILE - 14);
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 3.5, y0 + 7.5, TILE - 7, TILE - 15);
      ctx.fillStyle = '#3b3f45'; ctx.fillRect(x0 + 8, y0 + 13, 12, 7); ctx.fillRect(x0 + 11, y0 + 20, 6, 5);
      ctx.strokeStyle = '#c9c2b0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0 + 25, y0 + 12); ctx.lineTo(x0 + 33, y0 + 26); ctx.stroke();
      if (s.lv >= 2) drawFlame(x0 + 30, y0 + 28, 4, s.lv === 3);
    } else if (s.type === 'hearth') {
      const R = 18 + s.lv * 1.5;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(x + 3, y + 5, R + 4, 0, 7); ctx.fill();
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; ctx.fillStyle = flash ? '#fff' : (i % 2 ? '#7d7f84' : '#686b70'); ctx.beginPath(); ctx.arc(x + Math.cos(a) * R, y + Math.sin(a) * R, 6 + s.lv * 0.4, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#1e140c'; ctx.beginPath(); ctx.arc(x, y, R - 4, 0, 7); ctx.fill();
      ctx.strokeStyle = '#4a3320'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x - 10, y - 6); ctx.lineTo(x + 10, y + 6); ctx.moveTo(x - 10, y + 6); ctx.lineTo(x + 10, y - 6); ctx.stroke();
      drawFlame(x, y, 10 + s.lv * 2, s.lv >= 4);
    }
    // health bar
    const mx = smax(s);
    if (s.hp < mx - 0.5) {
      const w = TILE - 8;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x0 + 4, y0 - 7, w, 4);
      ctx.fillStyle = s.hp / mx > 0.5 ? '#7fbf5a' : s.hp / mx > 0.25 ? '#e0b040' : '#d94a3a';
      ctx.fillRect(x0 + 4, y0 - 7, w * clamp(s.hp / mx, 0, 1), 4);
    }
  }
  function drawFlame(x, y, size, blue) {
    const f = Math.sin(G.time * 13 + x) * 0.15 + Math.sin(G.time * 21 + y) * 0.1;
    const cols = blue ? ['#2f6fd6', '#7fd4ff', '#e8f8ff'] : ['#d8461d', '#ff9a3c', '#ffe7a3'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = cols[i];
      ctx.beginPath(); ctx.arc(x + Math.sin(G.time * 9 + i) * 1.5, y - i * size * 0.18, size * (1 - i * 0.3) * (1 + f), 0, 7); ctx.fill();
    }
  }

  function drawPlayer() {
    const p = G.p;
    if (p.dead > 0) return;
    const x = p.x, y = p.y, a = p.face;
    shadow(x + 3, y + 6, 15, 10);
    // tool swing
    let ta = a;
    if (p.swingT > 0) ta = a - 1.1 + (1 - p.swingT / 0.16) * 2.2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ta);
    const wt = G.gear.weapon;
    ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(6, 8); ctx.lineTo(34, 8); ctx.stroke();
    ctx.fillStyle = ['#a8875a', '#9ba0a6', '#c9d2dc', '#efe6d2'][wt];
    ctx.beginPath(); ctx.moveTo(34, 4); ctx.lineTo(44 + wt * 2, 8); ctx.lineTo(34, 12); ctx.closePath(); ctx.fill();
    ctx.restore();
    // body
    const bob = Math.sin(p.walk) * 1.2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = p.hurt > 0 ? '#ff6b5a' : '#3d5f3a';
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 15, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2b4329'; ctx.beginPath(); ctx.ellipse(-5, 0, 6, 12, 0, 0, 7); ctx.fill(); // pack
    ctx.fillStyle = '#d9b48f'; ctx.beginPath(); ctx.arc(4 + bob * 0.3, 0, 7.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#5a3b20'; ctx.beginPath(); ctx.arc(2.5 + bob * 0.3, 0, 7.5, Math.PI * 0.55, Math.PI * 1.45); ctx.fill(); // hood/hair
    ctx.restore();
    // lantern
    const lx = x + Math.cos(a + 1.6) * 13, ly = y + Math.sin(a + 1.6) * 13;
    ctx.fillStyle = '#3a3026'; ctx.beginPath(); ctx.arc(lx, ly, 4, 0, 7); ctx.fill();
    ctx.fillStyle = G.gear.lantern === 3 ? '#9fe0ff' : '#ffd27a'; ctx.beginPath(); ctx.arc(lx, ly, 2.4, 0, 7); ctx.fill();
  }

  function drawEnemy(e) {
    const d = ED[e.type], r = e.r, p = G.p;
    let alpha = 1;
    if (e.type === 'stalker') {
      const lit = lights.some(L => L.ward && dist(e.x, e.y, L.x, L.y) < L.r * 0.6);
      alpha = lit ? 1 : clamp((210 - dist(e.x, e.y, p.x, p.y)) / 120, 0.06, 1);
    }
    if (e.burn) alpha *= clamp(e.hp / e.maxHp + 0.3, 0.2, 1);
    ctx.save(); ctx.globalAlpha = alpha;
    shadow(e.x + 4, e.y + 7, r * 1.2, r * 0.8);
    ctx.translate(e.x, e.y); ctx.rotate(e.face);
    const lunge = e.lunge > 0 ? 6 : 0;
    const sw = Math.sin(e.anim) * 0.5;
    // legs
    ctx.strokeStyle = d.limb; ctx.lineWidth = r * 0.22; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(-r * 0.4, s * r * 0.45); ctx.lineTo(-r * 0.9 + Math.sin(e.anim + (s > 0 ? 0 : Math.PI)) * r * 0.4, s * r * 0.95); ctx.stroke();
    }
    // long arms reaching forward
    for (const s of [-1, 1]) {
      const ext = r * 1.5 + lunge + Math.sin(e.anim + (s > 0 ? Math.PI : 0)) * r * 0.25;
      ctx.beginPath(); ctx.moveTo(r * 0.2, s * r * 0.55); ctx.lineTo(ext, s * r * (0.7 + sw * 0.15)); ctx.stroke();
      ctx.lineWidth = 1.4; ctx.strokeStyle = '#efe8da';
      for (const c of [-0.25, 0, 0.25]) { ctx.beginPath(); ctx.moveTo(ext, s * r * 0.7); ctx.lineTo(ext + r * 0.35, s * r * 0.7 + c * r); ctx.stroke(); }
      ctx.strokeStyle = d.limb; ctx.lineWidth = r * 0.22;
    }
    // gaunt body
    ctx.fillStyle = e.hit > 0 ? '#fff' : d.body;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.95, r * 0.62, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.3, -r * 0.5); ctx.lineTo(i * r * 0.3 + r * 0.1, r * 0.5); ctx.stroke(); }
    // skull head
    const hx = r * 0.85;
    ctx.fillStyle = e.hit > 0 ? '#fff' : (e.type === 'stalker' ? '#3a3940' : '#e9e2d2');
    ctx.beginPath(); ctx.ellipse(hx, 0, r * 0.5, r * 0.4, 0, 0, 7); ctx.fill();
    // antlers
    const ant = e.type === 'brute' || e.type === 'elder' ? 1.5 : e.type === 'stalker' ? 0.7 : 1;
    ctx.strokeStyle = e.type === 'stalker' ? '#4b4a52' : '#d4c8b2'; ctx.lineWidth = Math.max(1.5, r * 0.12);
    for (const s of [-1, 1]) {
      const bx = hx - r * 0.1, by = s * r * 0.3;
      const tx = bx - r * 0.9 * ant, ty = s * r * 1.15 * ant;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - r * 0.35 * ant, by + s * r * 0.35 * ant); ctx.lineTo(bx - r * 0.2 * ant, s * r * 1.05 * ant); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - r * 0.65 * ant, by + s * r * 0.6 * ant); ctx.lineTo(bx - r * 0.55 * ant, s * r * 1.35 * ant); ctx.stroke();
      if (ant > 1) { ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - r * 0.3, ty + s * r * 0.35); ctx.stroke(); }
    }
    ctx.restore();
    // health bar
    if (e.hp < e.maxHp && !e.burn) {
      const w = r * 2.4;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(e.x - w / 2, e.y - r - 14, w, 4);
      ctx.fillStyle = '#d94a3a'; ctx.fillRect(e.x - w / 2, e.y - r - 14, w * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
  }
  function drawEyes(e) {
    const d = ED[e.type], r = e.r, a = e.face;
    const hx = e.x + Math.cos(a) * r * 1.05, hy = e.y + Math.sin(a) * r * 1.05;
    const px = -Math.sin(a) * r * 0.2, py = Math.cos(a) * r * 0.2;
    let fl = 0.7 + Math.sin(G.time * 5 + e.anim) * 0.3;
    if (e.type === 'stalker') fl *= clamp((260 - dist(e.x, e.y, G.p.x, G.p.y)) / 160, 0.15, 1);
    ctx.fillStyle = d.eye; ctx.globalAlpha = e.burn ? 0.4 : fl;
    ctx.shadowColor = d.eye; ctx.shadowBlur = 8;
    const er = Math.max(1.6, r * 0.13);
    ctx.beginPath(); ctx.arc(hx + px, hy + py, er, 0, 7); ctx.arc(hx - px, hy - py, er, 0, 7); ctx.fill();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  function render() {
    const p = G.p;
    // camera
    const tx = p.x - VW / 2, ty = p.y - VH / 2;
    camX += (tx - camX) * 0.18; camY += (ty - camY) * 0.18;
    if (Math.abs(tx - camX) > 600 || Math.abs(ty - camY) > 600) { camX = tx; camY = ty; }
    const S = dpr * zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0f08'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(S, 0, 0, S, -camX * S, -camY * S);

    // ground
    const gx0 = Math.max(0, camX), gy0 = Math.max(0, camY);
    ctx.fillStyle = groundPat; ctx.fillRect(gx0, gy0, Math.min(WORLD, camX + VW) - gx0, Math.min(WORLD, camY + VH) - gy0);
    const br = buildRadius();
    const grd = ctx.createRadialGradient(HX, HY, 0, HX, HY, br + 40);
    grd.addColorStop(0, 'rgba(92,70,42,.55)'); grd.addColorStop(0.75, 'rgba(70,55,35,.25)'); grd.addColorStop(1, 'rgba(70,55,35,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(HX, HY, br + 40, 0, 7); ctx.fill();

    const inView = (x, y, m = 60) => x > camX - m && x < camX + VW + m && y > camY - m && y < camY + VH + m;

    // build mode overlay
    if (ui.placing) {
      ctx.strokeStyle = 'rgba(255,210,122,.5)'; ctx.setLineDash([10, 8]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(HX, HY, br, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
      const sx = Math.floor(camX / TILE) * TILE, sy = Math.floor(camY / TILE) * TILE;
      ctx.beginPath();
      for (let x = sx; x < camX + VW; x += TILE) { ctx.moveTo(x, camY); ctx.lineTo(x, camY + VH); }
      for (let y = sy; y < camY + VH; y += TILE) { ctx.moveTo(camX, y); ctx.lineTo(camX + VW, y); }
      ctx.stroke();
    }

    // ground-level structures first
    const items = [];
    for (const s of G.structs.values()) {
      if (!inView(s.x, s.y)) continue;
      if (s.type === 'spikes') drawStruct(s); else items.push({ y: s.y + 10, f: drawStruct, o: s });
    }
    for (const r of G.res) {
      if (r.dead || !inView(r.x, r.y)) continue;
      items.push({ y: r.y, f: r.type === 'tree' ? drawTree : r.type === 'bush' ? drawBush : drawRock, o: r });
    }
    for (const e of G.enemies) if (inView(e.x, e.y)) items.push({ y: e.y, f: drawEnemy, o: e });
    items.push({ y: p.y, f: drawPlayer, o: p });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.f(it.o);

    // projectiles
    ctx.lineCap = 'round';
    for (const pr of G.proj) {
      ctx.strokeStyle = pr.lv === 3 ? '#efe6d2' : '#d8c8a8'; ctx.lineWidth = 2.5;
      const l = 0.025;
      ctx.beginPath(); ctx.moveTo(pr.x - pr.vx * l, pr.y - pr.vy * l); ctx.lineTo(pr.x, pr.y); ctx.stroke();
    }
    // particles
    for (const f of G.fx) { ctx.globalAlpha = clamp(f.life * 2, 0, 1); ctx.fillStyle = f.col; ctx.fillRect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size); }
    ctx.globalAlpha = 1;
    // swing arc
    if (p.swingT > 0 && !p.dead) {
      ctx.strokeStyle = `rgba(255,240,210,${p.swingT * 3})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 48, p.face - 1.1, p.face - 1.1 + (1 - p.swingT / 0.16) * 2.2); ctx.stroke();
    }

    // ghost placement
    if (ui.placing && !isTouch) {
      const wx = input.mx / zoom + camX, wy = input.my / zoom + camY;
      const gx = Math.floor(wx / TILE), gy = Math.floor(wy / TILE);
      const occ = G.structs.get(key(gx, gy));
      const ok = !placeReason(ui.placing, gx, gy);
      ctx.fillStyle = occ ? 'rgba(120,170,255,.25)' : ok ? 'rgba(127,191,90,.35)' : 'rgba(217,74,58,.35)';
      ctx.strokeStyle = occ ? '#8fb6ff' : ok ? '#a6e07f' : '#ff7a6a'; ctx.lineWidth = 2;
      ctx.fillRect(gx * TILE, gy * TILE, TILE, TILE); ctx.strokeRect(gx * TILE + 1, gy * TILE + 1, TILE - 2, TILE - 2);
    }
    // selected structure outline
    if (ui.sel) { ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(ui.sel.gx * TILE - 2, ui.sel.gy * TILE - 2, TILE + 4, TILE + 4); ctx.setLineDash([]); }

    // ----- darkness -----
    const dk = darkness();
    if (dk > 0.01) {
      dctx.setTransform(1, 0, 0, 1, 0, 0);
      dctx.globalCompositeOperation = 'source-over';
      dctx.clearRect(0, 0, dark.width, dark.height);
      dctx.fillStyle = `rgba(4,7,18,${dk})`; dctx.fillRect(0, 0, dark.width, dark.height);
      dctx.globalCompositeOperation = 'destination-out';
      for (const L of lights) {
        if (!inView(L.x, L.y, L.r)) continue;
        const sx = (L.x - camX) * S, sy = (L.y - camY) * S;
        const R = L.r * S * (1 + Math.sin(G.time * 7 + L.x) * 0.02);
        const g = dctx.createRadialGradient(sx, sy, 0, sx, sy, R);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(0,0,0,.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        dctx.fillStyle = g; dctx.beginPath(); dctx.arc(sx, sy, R, 0, 7); dctx.fill();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(dark, 0, 0);
      // warm glow
      ctx.globalCompositeOperation = 'lighter';
      for (const L of lights) {
        if (L.r < 80 || !inView(L.x, L.y, L.r)) continue;
        const sx = (L.x - camX) * S, sy = (L.y - camY) * S, R = L.r * S * 0.7;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
        g.addColorStop(0, `rgba(255,140,50,${0.16 * dk})`); g.addColorStop(1, 'rgba(255,140,50,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, R, 0, 7); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(S, 0, 0, S, -camX * S, -camY * S);
    }
    // dusk tint
    if (G.t > DAY_LEN - DUSK - 10 && G.t < DAY_LEN) {
      const k = clamp((G.t - (DAY_LEN - DUSK - 10)) / 10, 0, 1) * 0.12;
      ctx.fillStyle = `rgba(255,110,40,${k})`; ctx.fillRect(camX, camY, VW, VH);
    }
    // eyes glow through the dark
    for (const e of G.enemies) if (inView(e.x, e.y)) drawEyes(e);

    // popups
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const pp of G.pops) {
      ctx.globalAlpha = clamp(pp.life / pp.max * 1.5, 0, 1);
      ctx.font = '700 12px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(pp.text, pp.x + 1, pp.y + 1);
      ctx.fillStyle = pp.col; ctx.fillText(pp.text, pp.x, pp.y);
    }
    ctx.globalAlpha = 1;

    // low health vignette
    if (!p.dead && p.hp / p.maxHp < 0.35) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const w = canvas.width, h = canvas.height;
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(120,0,0,${0.35 + Math.sin(G.time * 5) * 0.1})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
  }

  function renderMini() {
    const W = mini.width, span = 1900, sc = W / span, ox = G.p.x - span / 2, oy = G.p.y - span / 2;
    mctx.fillStyle = '#121b10'; mctx.fillRect(0, 0, W, W);
    mctx.fillStyle = 'rgba(92,70,42,.6)'; mctx.beginPath(); mctx.arc((HX - ox) * sc, (HY - oy) * sc, buildRadius() * sc, 0, 7); mctx.fill();
    mctx.fillStyle = '#d07a36';
    for (const r of G.res) if (!r.dead && r.type === 'iron') mctx.fillRect((r.x - ox) * sc - 1, (r.y - oy) * sc - 1, 2, 2);
    for (const s of G.structs.values()) {
      mctx.fillStyle = s.type === 'hearth' ? '#ff9a3c' : s.type === 'torch' ? '#ffd27a' : s.type === 'tower' ? '#c9c2b0' : '#8a7a66';
      const z = s.type === 'hearth' ? 5 : 2.4;
      mctx.fillRect((s.x - ox) * sc - z / 2, (s.y - oy) * sc - z / 2, z, z);
    }
    for (const e of G.enemies) {
      if (e.type === 'stalker' && dist(e.x, e.y, G.p.x, G.p.y) > 300) continue;
      mctx.fillStyle = e.type === 'elder' ? '#7fd4ff' : '#ff3b30';
      mctx.beginPath(); mctx.arc((e.x - ox) * sc, (e.y - oy) * sc, e.type === 'elder' ? 3 : 1.6, 0, 7); mctx.fill();
    }
    mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(W / 2, W / 2, 2.6, 0, 7); mctx.fill();
    // edge of the world
    mctx.strokeStyle = 'rgba(255,255,255,.15)'; mctx.strokeRect(-ox * sc, -oy * sc, WORLD * sc, WORLD * sc);
  }

  // =====================================================================
  // HUD & panels
  // =====================================================================
  const el = {
    hud: $('#hud'), lvl: $('#lvl'), hpBar: $('#hpBar'), hpTxt: $('#hpTxt'), hgBar: $('#hgBar'), hgTxt: $('#hgTxt'), xpBar: $('#xpBar'),
    inv: $('#inv'), gear: $('#gear'), dayTxt: $('#dayTxt'), timeTxt: $('#timeTxt'), cycBar: $('#cycBar'), clock: document.querySelector('.clock'),
    hint: $('#hint'), placeBar: $('#placeBar'), build: $('#buildMenu'), craft: $('#craftMenu'), sel: $('#selPanel'), toast: $('#toast'),
    title: $('#title'), levelUp: $('#levelUp'), levelCard: $('#levelCard'), pause: $('#pauseM'), over: $('#overM'), overTxt: $('#overTxt'),
    touch: $('#touch'), knob: $('#knob'), stick: $('#stick'), cont: $('#btnCont'), best: $('#best'), mute: $('#btnMute'),
  };
  const setHTML = (node, html) => { if (node._h !== html) { node.innerHTML = html; node._h = html; } };
  const setText = (node, t) => { if (node.textContent !== t) node.textContent = t; };
  const costHtml = c => c ? Object.entries(c).map(([k, v]) => `<span class="c ${G.inv[k] >= v ? '' : 'no'}"><i class="sw ${k}"></i>${v} ${RES_NAME[k]}</span>`).join('') : '';

  function updateHud() {
    const p = G.p;
    setText(el.lvl, String(p.lvl));
    el.hpBar.style.width = (clamp(p.hp / p.maxHp, 0, 1) * 100) + '%';
    setText(el.hpTxt, `Health ${Math.ceil(p.hp)} / ${p.maxHp}`);
    el.hgBar.style.width = p.hunger + '%';
    setText(el.hgTxt, `Hunger ${Math.ceil(p.hunger)}`);
    el.xpBar.style.width = (p.xp / xpNeed(p.lvl) * 100) + '%';
    setHTML(el.inv, RES_KEYS.map(k => `<span title="${RES_NAME[k]}"><i class="sw ${k}"></i>${G.inv[k]}</span>`).join(''));
    setHTML(el.gear, GEAR_KEYS.map(k => `<span>${GEAR[k].names[G.gear[k]]}</span>`).join(''));
    const night = isNight();
    setText(el.dayTxt, (night ? 'Night ' : 'Day ') + G.day);
    const toNight = DAY_LEN - G.t;
    setText(el.timeTxt, night ? `Dawn in ${fmtTime(CYCLE - G.t)} · ${G.enemies.length} hunting` : `Nightfall in ${fmtTime(toNight)}`);
    el.clock.classList.toggle('night', night);
    el.clock.classList.toggle('dusk', !night && toNight < 30);
    el.cycBar.style.width = (night ? (G.t - DAY_LEN) / NIGHT_LEN : G.t / DAY_LEN) * 100 + '%';
    setText(el.hint, hintText());
    if (ui.build) renderBuild();
    if (ui.craft) renderCraft();
    if (ui.sel) { if (dist(p.x, p.y, ui.sel.x, ui.sel.y) > 320 || !G.structs.has(key(ui.sel.gx, ui.sel.gy))) closeSel(); else renderSel(); }
    if (ui.placing) setHTML(el.placeBar, `<span>Placing <b>${sname(ui.placing, 1)}</b></span><span class="cost">${costHtml(SD[ui.placing].cost[0])}</span><span style="color:var(--muted)">${isTouch ? 'Tap to place' : 'Click to place · Right-click / Esc to stop'}</span><button type="button" data-cmd="stopPlace">Done</button>`);
  }
  function hintText() {
    const p = G.p;
    if (p.dead) return 'Returning to the Hearth…';
    if (isNight()) return G.enemies.length ? 'Defend the Hearth! Stay in the light.' : 'Hold on until dawn.';
    if (DAY_LEN - G.t < 25) return 'Night is coming. Get back inside your walls!';
    if (p.hunger < 25) return 'You\'re starving. Eat berries (F)';
    let walls = 0, towers = 0, torches = 0;
    for (const s of G.structs.values()) { if (s.type === 'wall' || s.type === 'gate') walls++; if (s.type === 'tower') towers++; if (s.type === 'torch') torches++; }
    if (!G.bench) return G.inv.wood < 20 ? `Chop trees for wood (${G.inv.wood}/20), then build a Workbench (B)` : 'Build a Workbench near the Hearth (B)';
    if (G.gear.axe + G.gear.pick === 0) return 'Mine stone, then upgrade your tools at the Workbench (C)';
    if (walls < 10) return 'Wall in your Hearth. Leave a Gate so you can get out.';
    if (torches < 2) return 'Light torches: their glow burns the Hollowkin';
    if (!towers) return 'Build a Watchtower to shoot creatures for you';
    if (G.gear.pick >= 1 && G.inv.iron < 5 && G.bench.lv < 2) return 'Iron ore lies deep in the forest. Upgrade the Workbench to use it.';
    return 'Upgrade the Hearth to build farther and burn brighter';
  }

  function renderBuild() {
    let h = `<h3>Build <button class="x" data-cmd="closeBuild" aria-label="Close">&times;</button></h3><p class="sub">Pick a structure, then place it inside the Hearth's glow. Tap or inspect a building to upgrade it.</p><div class="grid">`;
    BUILD_LIST.forEach((t, i) => {
      const d = SD[t];
      const hard = (d.unique && G.bench) ? 'Already built' : (d.needBench && !G.bench) ? 'Requires a Workbench' : '';
      h += `<button type="button" class="item ${hard ? 'dis' : ''}" data-build="${t}"><b>${isTouch ? '' : (i + 1) + '. '}${sname(t, 1)}</b><small>${d.desc}</small><div class="cost">${costHtml(d.cost[0])}</div>${hard ? `<em>${hard}</em>` : ''}</button>`;
    });
    setHTML(el.build, h + '</div>');
  }
  const nearBench = () => G.bench && dist(G.p.x, G.p.y, G.bench.x, G.bench.y) < 150;
  function renderCraft() {
    const near = nearBench();
    let h = `<h3>Crafting <button class="x" data-cmd="closeCraft" aria-label="Close">&times;</button></h3>`;
    if (!G.bench) h += '<p class="warn">Build a Workbench first (B).</p>';
    else if (!near) h += '<p class="warn">Walk over to your Workbench to craft.</p>';
    else h += `<p class="sub">${sname('bench', G.bench.lv)} · level ${G.bench.lv}. Upgrade it to unlock higher tiers.</p>`;
    for (const k of GEAR_KEYS) {
      const g = GEAR[k], t = G.gear[k];
      h += `<div class="row"><div class="now">${g.names[t]}<small>${g.stat(t)}</small></div>`;
      if (t >= 3) h += '<div class="maxed">Fully upgraded</div>';
      else {
        const c = g.cost[t + 1], needLv = t + 1;
        const benchOk = G.bench && G.bench.lv >= needLv;
        const ok = near && benchOk && afford(c);
        h += `<div class="act"><button type="button" data-craft="${k}" ${ok ? '' : 'disabled'}>Make ${g.names[t + 1]}</button><span class="cost">${costHtml(c)}</span></div>`;
        h += `<small style="color:var(--muted);font-size:11px">${g.stat(t + 1)}${benchOk ? '' : ` · needs ${sname('bench', needLv)} (Workbench Lv ${needLv})`}</small>`;
      }
      h += '</div>';
    }
    setHTML(el.craft, h);
  }
  function repairCost(s) {
    const mx = smax(s), miss = (mx - s.hp) / mx;
    if (miss < 0.01) return null;
    const base = SD[s.type].cost[s.lv - 1] || { wood: 20, stone: 12 };
    const c = {};
    for (const k in base) c[k] = Math.max(1, Math.ceil(base[k] * miss * 0.6));
    return c;
  }
  function statLine(s) {
    const d = SD[s.type], i = s.lv - 1;
    switch (s.type) {
      case 'hearth': return `Light ${d.light[i]} · Burns ${d.ward[i]}/s · Build radius ${buildRadius()}`;
      case 'tower': return `Damage ${Math.round(d.dmg[i] * (1 + 0.2 * perk('warden')))} · Range ${d.range[i]} · ${(1 / d.rate[i]).toFixed(1)} shots/s`;
      case 'spikes': return `${d.dps[i]} damage/s, slows creatures`;
      case 'torch': return `Light ${d.light[i]} · Burns ${d.ward[i]}/s`;
      case 'bench': return `Unlocks tier ${s.lv} gear: ${GEAR.axe.names[s.lv].replace(' Axe', '')}`;
      default: return d.block === 1 ? 'You walk through, creatures don\'t' : 'Blocks movement';
    }
  }
  function nextStat(s) {
    const d = SD[s.type], i = s.lv;
    switch (s.type) {
      case 'hearth': return `Light ${d.light[i]}, burns ${d.ward[i]}/s, build radius ${270 + 70 * (i + 1)}`;
      case 'tower': return `Damage ${d.dmg[i]}, range ${d.range[i]}`;
      case 'spikes': return `${d.dps[i]} damage/s`;
      case 'torch': return `Light ${d.light[i]}, burns ${d.ward[i]}/s`;
      case 'bench': return `Unlocks ${GEAR.axe.names[i + 1].replace(' Axe', '')} gear`;
      default: return `${Math.round(d.hp[i] * (1 + 0.15 * perk('mason')))} health`;
    }
  }
  function renderSel() {
    const s = ui.sel, d = SD[s.type], mx = smax(s);
    let h = `<h3>${sname(s.type, s.lv)} <small>Lv ${s.lv}/${d.maxLv}</small><button class="x" data-cmd="closeSel" aria-label="Close">&times;</button></h3>`;
    h += `<div class="bar hp"><i style="width:${clamp(s.hp / mx, 0, 1) * 100}%"></i><span>${Math.ceil(s.hp)} / ${mx}</span></div>`;
    h += `<p style="color:var(--muted)">${d.desc}</p><p style="margin-top:6px">${statLine(s)}</p>`;
    if (s.lv < d.maxLv) {
      const c = d.cost[s.lv];
      h += `<div class="row"><div class="now">Upgrade to ${sname(s.type, s.lv + 1)}<small>${nextStat(s)}</small></div><div class="act"><button type="button" data-act="upgrade" ${afford(c) ? '' : 'disabled'}>Upgrade</button><span class="cost">${costHtml(c)}</span></div></div>`;
    } else h += '<div class="row"><div class="maxed">Max level</div></div>';
    const rc = repairCost(s);
    h += '<div class="row"><div class="act">';
    if (rc) h += `<button type="button" data-act="repair" ${afford(rc) ? '' : 'disabled'}>Repair</button><span class="cost">${costHtml(rc)}</span>`;
    else h += '<span class="maxed">Undamaged</span>';
    h += '</div>';
    if (s.type !== 'hearth') h += `<div class="act"><button type="button" class="danger" data-act="demolish">Demolish</button><small style="color:var(--muted)">refunds half the base cost</small></div>`;
    h += '</div>';
    if (!G.night && rc) h += '<p style="color:var(--muted);font-size:11px;margin-top:6px">Structures slowly mend during the day.</p>';
    setHTML(el.sel, h);
  }
  function openSel(s) { ui.sel = s; closeBuild(); closeCraft(); el.sel.classList.remove('hidden'); el.sel._h = null; renderSel(); }
  function closeSel() { ui.sel = null; el.sel.classList.add('hidden'); }
  function toggleBuild() { if (ui.build) closeBuild(); else { closeCraft(); closeSel(); ui.build = true; el.build.classList.remove('hidden'); renderBuild(); } }
  function closeBuild() { ui.build = false; el.build.classList.add('hidden'); }
  function toggleCraft() { if (ui.craft) closeCraft(); else { closeBuild(); closeSel(); stopPlacing(); ui.craft = true; el.craft.classList.remove('hidden'); renderCraft(); } }
  function closeCraft() { ui.craft = false; el.craft.classList.add('hidden'); }
  function startPlacing(t) {
    const d = SD[t];
    if (d.unique && G.bench) { toast('You already have a Workbench'); return; }
    if (d.needBench && !G.bench) { toast('Build a Workbench first', true); return; }
    ui.placing = t; input.attack = false; closeBuild();
    el.placeBar.classList.remove('hidden'); el.placeBar._h = null; updateHud();
  }
  function stopPlacing() { ui.placing = null; el.placeBar.classList.add('hidden'); }
  function refreshPanels() { if (ui.build) renderBuild(); if (ui.craft) renderCraft(); if (ui.sel) renderSel(); }

  function craft(k) {
    const g = GEAR[k], t = G.gear[k];
    if (t >= 3 || !nearBench() || G.bench.lv < t + 1 || !afford(g.cost[t + 1])) { sfx.deny(); return; }
    spend(g.cost[t + 1]); G.gear[k]++;
    addXp(15); sfx.build();
    toast(`Crafted ${g.names[t + 1]}`);
    burst(G.bench.x, G.bench.y, '#ffd27a', 14, 80);
    renderCraft();
  }
  function selAction(act) {
    const s = ui.sel; if (!s) return;
    const d = SD[s.type];
    if (act === 'upgrade') {
      if (s.lv >= d.maxLv || !afford(d.cost[s.lv])) { sfx.deny(); return; }
      spend(d.cost[s.lv]);
      const before = smax(s); s.lv++; s.hp += smax(s) - before;
      addXp(10); sfx.build(); burst(s.x, s.y, '#ffd27a', 16, 90);
      toast(`Upgraded to ${sname(s.type, s.lv)}`);
    } else if (act === 'repair') {
      const c = repairCost(s); if (!c || !afford(c)) { sfx.deny(); return; }
      spend(c); s.hp = smax(s); sfx.build();
    } else if (act === 'demolish') {
      const c = d.cost[0];
      for (const k in c) G.inv[k] += Math.floor(c[k] / 2);
      G.structs.delete(key(s.gx, s.gy));
      if (s === G.bench) G.bench = null;
      burst(s.x, s.y, '#8a7a66', 12, 80);
      closeSel(); return;
    }
    renderSel();
  }
  function interact() {
    if (!G || G.p.dead) return;
    let best = null, bd = 85;
    for (const s of G.structs.values()) { const d = dist(G.p.x, G.p.y, s.x, s.y); if (d < bd) { bd = d; best = s; } }
    if (best) { if (best.type === 'bench' && !ui.sel) { toggleCraft(); return; } openSel(best); }
    else toast('Nothing to inspect nearby');
  }

  let toastT = null;
  function toast(msg, bad) {
    el.toast.textContent = msg;
    el.toast.classList.toggle('bad', !!bad);
    el.toast.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.toast.classList.remove('show'), 2800);
  }

  // ---------- modals ----------
  function showModal(name) {
    ui.modal = name;
    for (const n of ['title', 'levelUp', 'pause', 'over']) el[n].classList.toggle('hidden', n !== name);
    input.attack = false; input.keys.clear();
  }
  function hideModal() {
    ui.modal = null;
    for (const n of ['title', 'levelUp', 'pause', 'over']) el[n].classList.add('hidden');
    last = performance.now();
    if (ui.pendingLvl) showLevelUp();
  }
  function showLevelUp() {
    ui.perkChoices = shuffle(PERKS).slice(0, 3);
    sfx.level();
    el.levelCard.innerHTML = `<h2>Level ${G.p.lvl - ui.pendingLvl + 1}</h2><p class="tag" style="margin:6px 0 0">+5 max health and fully healed. Choose a perk:</p><div class="perks">${ui.perkChoices.map((pk, i) => `<button type="button" data-perk="${i}"><b>${pk.name}${perk(pk.id) ? ` <small>(have ${perk(pk.id)})</small>` : ''}</b><small>${pk.desc}</small></button>`).join('')}</div>`;
    showModal('levelUp');
  }
  function choosePerk(i) {
    const pk = ui.perkChoices[i]; if (!pk) return;
    const before = new Map([...G.structs.values()].map(s => [s, smax(s)]));
    G.p.perks[pk.id] = perk(pk.id) + 1;
    if (pk.id === 'vit') { G.p.maxHp += 25; G.p.hp = G.p.maxHp; }
    if (pk.id === 'mason') for (const [s, b] of before) s.hp += smax(s) - b;
    ui.pendingLvl--;
    hideModal();
  }
  function togglePause() {
    if (!G || G.over) return;
    if (ui.modal === 'pause') hideModal();
    else if (!ui.modal) { setText(el.mute, 'Sound: ' + (muted ? 'Off' : 'On')); showModal('pause'); }
  }
  function gameOver() {
    if (G.over) return;
    G.over = true;
    const nights = G.day - (isNight() ? 0 : 1);
    const best = store.get(BEST_KEY, 0);
    if (nights > best) store.set(BEST_KEY, nights);
    store.del(SAVE_KEY);
    el.overTxt.innerHTML = `The Hollowkin smothered the last embers on <b>${isNight() ? 'night' : 'day'} ${G.day}</b>.<br>Nights survived: <b>${nights}</b>${nights > best ? ' (new best!)' : ` · best ${best}`}<br>Level ${G.p.lvl} · ${G.stats.kills} creatures slain · ${G.stats.built} structures built`;
    showModal('over');
  }
  function showTitle() {
    const has = !!store.get(SAVE_KEY, null);
    el.cont.classList.toggle('hidden', !has);
    const best = store.get(BEST_KEY, 0);
    el.best.textContent = best ? `Longest run: ${best} night${best === 1 ? '' : 's'} survived` : '';
    el.hud.classList.add('hidden'); el.touch.classList.add('hidden');
    closeBuild(); closeCraft(); closeSel(); stopPlacing();
    showModal('title');
  }
  function startPlaying() {
    el.hud.classList.remove('hidden');
    if (isTouch) el.touch.classList.remove('hidden');
    camX = G.p.x - VW / 2; camY = G.p.y - VH / 2;
    ui.pendingLvl = 0;
    hideModal();
    updateHud();
    if (G.day === 1 && G.t < 10) setTimeout(() => toast('Gather wood and stone. Build before nightfall.'), 600);
  }

  // =====================================================================
  // Save / load
  // =====================================================================
  function saveGame() {
    if (!G || G.over) return;
    const p = G.p;
    store.set(SAVE_KEY, {
      v: 1, day: G.day, t: G.t, inv: G.inv, gear: G.gear, stats: G.stats,
      p: { x: p.x, y: p.y, hp: Math.max(1, p.hp), maxHp: p.maxHp, hunger: p.hunger, xp: p.xp, lvl: p.lvl, perks: p.perks },
      s: [...G.structs.values()].map(s => [s.type, s.gx, s.gy, s.lv, Math.round(s.hp)]),
      r: G.res.map(r => [r.type, Math.round(r.x), Math.round(r.y), r.amount, r.dead ? 1 : 0, Math.round(r.regrow)]),
      e: G.enemies.map(e => [e.type, Math.round(e.x), Math.round(e.y), Math.round(e.hp), e.maxHp, e.burn ? 1 : 0]),
      q: G.spawnQ,
    });
  }
  function loadGame() {
    const d = store.get(SAVE_KEY, null);
    if (!d || d.v !== 1) return false;
    try {
      newGame();
      G.structs.clear(); G.res = []; G.hearth = null; G.bench = null;
      G.day = d.day; G.t = d.t; G.night = G.t >= DAY_LEN;
      Object.assign(G.inv, d.inv); Object.assign(G.gear, d.gear); Object.assign(G.stats, d.stats);
      Object.assign(G.p, d.p);
      for (const [type, gx, gy, lv, hp] of d.s) placeStruct(type, gx, gy, lv, hp);
      for (const [type, x, y, amount, dead, regrow] of d.r) { const r = makeRes(type, x, y); r.amount = amount; r.dead = !!dead; r.regrow = regrow; G.res.push(r); }
      for (const [type, x, y, hp, maxHp, burn] of d.e || []) G.enemies.push({ type, x, y, r: ED[type].r, hp, maxHp, cd: 1, hit: 0, face: 0, anim: 0, tgt: 'h', tgtT: 0, burn: !!burn, lunge: 0 });
      G.spawnQ = d.q || [];
      if (!G.hearth) throw new Error('no hearth');
      return true;
    } catch (e) { G = null; return false; }
  }

  // =====================================================================
  // Input
  // =====================================================================
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const c = e.code;
    if (c === 'KeyM') { muted = !muted; store.set(MUTE_KEY, muted); toast('Sound ' + (muted ? 'off' : 'on')); setText(el.mute, 'Sound: ' + (muted ? 'Off' : 'On')); return; }
    if (c === 'KeyP') { togglePause(); return; }
    if (ui.modal) {
      if (ui.modal === 'levelUp' && /^Digit[1-3]$/.test(c)) choosePerk(+c.slice(5) - 1);
      if (ui.modal === 'pause' && c === 'Escape') togglePause();
      return;
    }
    if (!G) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) e.preventDefault();
    input.keys.add(c);
    if (c === 'Space') input.attack = true;
    if (e.repeat) return;
    if (c === 'KeyB') toggleBuild();
    else if (c === 'KeyC') toggleCraft();
    else if (c === 'KeyF') eat();
    else if (c === 'KeyE') interact();
    else if (c === 'Escape') {
      if (ui.placing) stopPlacing();
      else if (ui.build || ui.craft || ui.sel) { closeBuild(); closeCraft(); closeSel(); }
      else togglePause();
    } else if (/^Digit[1-6]$/.test(c) && (ui.build || ui.placing)) {
      const t = BUILD_LIST[+c.slice(5) - 1]; if (t) startPlacing(t);
    }
  });
  addEventListener('keyup', e => { input.keys.delete(e.code); if (e.code === 'Space') input.attack = false; });
  addEventListener('blur', () => { input.keys.clear(); input.attack = false; if (G && !ui.modal && !G.over) togglePause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G) { saveGame(); if (!ui.modal && !G.over) togglePause(); } });

  canvas.addEventListener('pointermove', e => { input.mx = e.clientX; input.my = e.clientY; });
  canvas.addEventListener('pointerdown', e => {
    input.mx = e.clientX; input.my = e.clientY;
    if (!G || ui.modal) return;
    const wx = e.clientX / zoom + camX, wy = e.clientY / zoom + camY;
    if (e.pointerType === 'mouse' && e.button === 2) {
      if (ui.placing) { stopPlacing(); return; }
      const s = G.structs.get(key(Math.floor(wx / TILE), Math.floor(wy / TILE)));
      if (s && dist(G.p.x, G.p.y, s.x, s.y) < 320) openSel(s);
      return;
    }
    if (ui.placing) { tryPlace(wx, wy); return; }
    if (e.pointerType === 'mouse') { input.attack = true; return; }
    // touch: tap a structure to inspect it
    const s = G.structs.get(key(Math.floor(wx / TILE), Math.floor(wy / TILE)));
    if (s && dist(G.p.x, G.p.y, s.x, s.y) < 320) openSel(s);
  });
  addEventListener('pointerup', e => { if (e.pointerType === 'mouse') input.attack = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // joystick
  const stick = el.stick;
  function stickMove(t) {
    const r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const max = r.width / 2, d = Math.hypot(dx, dy);
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    el.knob.style.transform = `translate(${dx}px,${dy}px)`;
    const n = Math.hypot(dx, dy) / max;
    input.stick.x = n < 0.15 ? 0 : dx / max; input.stick.y = n < 0.15 ? 0 : dy / max;
  }
  stick.addEventListener('pointerdown', e => { e.preventDefault(); input.stick.id = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); });
  stick.addEventListener('pointermove', e => { if (e.pointerId === input.stick.id) stickMove(e); });
  const stickEnd = e => { if (e.pointerId !== input.stick.id) return; input.stick.id = null; input.stick.x = input.stick.y = 0; el.knob.style.transform = ''; };
  stick.addEventListener('pointerup', stickEnd); stick.addEventListener('pointercancel', stickEnd);

  document.querySelectorAll('[data-hold]').forEach(b => {
    b.addEventListener('pointerdown', e => { e.preventDefault(); input.attack = true; b.setPointerCapture(e.pointerId); });
    const end = () => { input.attack = false; };
    b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
  });

  // delegated UI clicks (pointerdown so re-rendered panels never swallow a press)
  document.addEventListener('pointerdown', e => {
    const t = e.target.closest('[data-cmd],[data-build],[data-craft],[data-act],[data-perk]');
    if (!t || t.hasAttribute('data-hold') || t.disabled) return;
    if (t.dataset.perk != null) { choosePerk(+t.dataset.perk); return; }
    if (!G || (ui.modal && ui.modal !== 'levelUp')) return;
    e.preventDefault();
    const cmd = t.dataset.cmd;
    if (cmd === 'build') toggleBuild();
    else if (cmd === 'craft') toggleCraft();
    else if (cmd === 'eat') eat();
    else if (cmd === 'use') interact();
    else if (cmd === 'pause') togglePause();
    else if (cmd === 'closeBuild') closeBuild();
    else if (cmd === 'closeCraft') closeCraft();
    else if (cmd === 'closeSel') closeSel();
    else if (cmd === 'stopPlace') stopPlacing();
    else if (t.dataset.build) { if (!t.classList.contains('dis')) startPlacing(t.dataset.build); }
    else if (t.dataset.craft) craft(t.dataset.craft);
    else if (t.dataset.act) selAction(t.dataset.act);
  });

  $('#btnNew').addEventListener('click', () => {
    if (store.get(SAVE_KEY, null) && !confirm('Start over? Your current camp will be lost.')) return;
    store.del(SAVE_KEY); newGame(); startPlaying();
  });
  el.cont.addEventListener('click', () => { if (loadGame()) startPlaying(); else { toast('Save could not be loaded', true); el.cont.classList.add('hidden'); } });
  $('#btnResume').addEventListener('click', () => hideModal());
  el.mute.addEventListener('click', () => { muted = !muted; store.set(MUTE_KEY, muted); setText(el.mute, 'Sound: ' + (muted ? 'Off' : 'On')); });
  $('#btnQuit').addEventListener('click', () => { saveGame(); G = null; showTitle(); });
  $('#btnAgain').addEventListener('click', () => { newGame(); startPlaying(); });

  // =====================================================================
  // Main loop
  // =====================================================================
  let last = performance.now(), hudT = 0, miniT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (G) {
      if (!ui.modal && !G.over) {
        update(dt);
        hudT -= dt; miniT -= dt;
        if (hudT <= 0) { hudT = 0.1; updateHud(); }
        if (miniT <= 0) { miniT = 0.2; renderMini(); }
      }
      if (G) render();
    } else drawTitleBackdrop(now / 1000);
    requestAnimationFrame(frame);
  }

  // A slow drifting forest behind the title screen
  let backdrop = null;
  function drawTitleBackdrop(t) {
    if (!backdrop) { newGame(); backdrop = G; G = null; }
    const save = G; G = backdrop; G.time = t; G.t = DAY_LEN + 20;
    G.p.x = HX + Math.cos(t * 0.05) * 500; G.p.y = HY + Math.sin(t * 0.05) * 500; G.p.dead = 1;
    lights = [{ x: HX, y: HY, r: 260, ward: 0 }];
    render();
    G = save;
  }

  // debug/test hook
  window.HollowPines = { get state() { return G; }, ui, save: saveGame };

  showTitle();
  requestAnimationFrame(frame);
})();
