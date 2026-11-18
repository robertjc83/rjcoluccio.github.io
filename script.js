/* RJC Arcade — three original mini-games on one retro cabinet. No dependencies. */
(() => {
  'use strict';

  // ---------- Basics ----------
  const W = 240, H = 320;
  const C = {
    bg: '#07020f', green: '#39ff14', pink: '#ff2bd6', cyan: '#00e5ff',
    yellow: '#ffe600', red: '#ff3355', white: '#f4f4f4', dim: '#3a2a5a', tile: '#160b2b'
  };
  const FONT = '"Press Start 2P", monospace';

  const $ = (s) => document.querySelector(s);
  const canvas = $('#screen');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hits = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const pad6 = (n) => String(Math.floor(n)).padStart(6, '0');

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };

  // ---------- Drawing helpers ----------
  function text(str, x, y, color = C.white, size = 8, align = 'left') {
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.fillText(str, Math.round(x), Math.round(y));
  }

  function sprite(rows, x, y, px, palette) {
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const ch = rows[r][c];
        if (ch === '.') continue;
        ctx.fillStyle = palette[ch];
        ctx.fillRect(Math.round(x + c * px), Math.round(y + r * px), px, px);
      }
    }
  }

  const HEART = ['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..'];
  const SHIP = ['...c...', '..cwc..', '..cwc..', '.cwwwc.', 'cwwpwwc', 'cc.p.cc', '...f...'];
  const GEM = ['..c..', '.cwc.', 'cwccc', '.ccc.', '..c..'];

  function hud(score, lives, center) {
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, 0, W, 16);
    text(pad6(score), 4, 4, C.yellow);
    for (let i = 0; i < lives; i++) sprite(HEART, W - 14 - i * 12, 3, 2, { r: C.red });
    if (center) text(center, W / 2, 4, C.cyan, 8, 'center');
  }

  // starfield used behind every screen
  const stars = Array.from({ length: 70 }, () => ({ x: rand(0, W), y: rand(0, H), s: rand(0.3, 1) }));
  function drawStars(dt, speed) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    for (const st of stars) {
      st.y += st.s * speed * dt;
      if (st.y > H) { st.y = 0; st.x = rand(0, W); }
      ctx.fillStyle = st.s > 0.8 ? C.white : st.s > 0.55 ? C.cyan : C.dim;
      const sz = st.s > 0.8 ? 2 : 1;
      ctx.fillRect(st.x | 0, st.y | 0, sz, sz);
    }
  }

  // particles + floating text
  const particles = [];
  const popups = [];
  function burst(x, y, color, n = 12, spd = 80) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), v = rand(spd * 0.3, spd);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.7), color });
    }
  }
  function popup(str, x, y, color = C.yellow) { popups.push({ str, x, y, color, life: 0.8 }); }
  function updateFx(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.y -= 25 * dt; p.life -= dt;
      if (p.life <= 0) popups.splice(i, 1);
    }
  }
  function drawFx() {
    for (const p of particles) { ctx.fillStyle = p.color; ctx.fillRect(p.x | 0, p.y | 0, 2, 2); }
    for (const p of popups) {
      ctx.globalAlpha = clamp(p.life / 0.8, 0, 1);
      text(p.str, p.x, p.y, p.color, 8, 'center');
      ctx.globalAlpha = 1;
    }
  }

  let shake = 0;

  // ---------- Sound (WebAudio bleeps) ----------
  const sfx = {
    ctx: null,
    muted: store.get('rjcArcade.muted', false),
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(freq, dur = 0.1, type = 'square', vol = 0.07, slideTo = null, delay = 0) {
      if (this.muted) return;
      this.ensure();
      const c = this.ctx;
      if (!c) return;
      const t = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    seq(notes, step, type = 'square') { notes.forEach((f, i) => this.tone(f, step * 1.2, type, 0.07, null, i * step)); },
    coin() { this.tone(988, 0.08); this.tone(1319, 0.3, 'square', 0.07, null, 0.08); },
    select() { this.tone(660, 0.05); },
    start() { this.seq([523, 659, 784, 1047], 0.08); },
    hit() { this.tone(220, 0.35, 'sawtooth', 0.09, 40); },
    point() { this.tone(880, 0.07, 'triangle', 0.1, 1320); },
    perfect() { this.seq([1047, 1319, 1568], 0.05, 'triangle'); },
    drop() { this.tone(330, 0.08, 'square', 0.06, 200); },
    tick() { this.tone(160, 0.04, 'square', 0.04); },
    error() { this.tone(110, 0.18, 'square', 0.07); },
    over() { this.seq([392, 330, 262, 196], 0.17); },
    cheat() { this.seq([523, 659, 784, 1047, 784, 1047, 1319, 1568], 0.06); },
    fanfare() { this.seq([784, 784, 784, 1047, 988, 1047, 1319], 0.09); }
  };

  // ---------- Input ----------
  const input = {
    left: false, right: false, presses: new Set(),
    press(k) { this.presses.add(k); },
    consume(k) { const h = this.presses.has(k); this.presses.delete(k); return h; },
    clear() { this.presses.clear(); }
  };

  // =====================================================================
  // GAME 1: METEOR DASH — dodge falling rocks, collect gems
  // =====================================================================
  const meteorDash = {
    id: 'meteor', title: 'METEOR DASH', color: C.yellow,
    blurb: 'DODGE ROCKS, GRAB GEMS', starSpeed: 70,
    reset() {
      this.score = 0; this.over = false; this.ending = null;
      this.t = 0; this.lives = 3; this.inv = 0; this.x = W / 2 - 7;
      this.rocks = []; this.gems = []; this.rockTimer = 0.8; this.gemTimer = 2.5;
    },
    update(dt) {
      this.t += dt;
      this.inv = Math.max(0, this.inv - dt);
      const lvl = 1 + this.t / 25;
      const moveRocks = (scale) => {
        for (const r of this.rocks) { r.y += r.vy * dt * scale; r.x += r.vx * dt * scale; }
        for (const g of this.gems) g.y += g.vy * dt * scale;
      };
      if (this.ending != null) { moveRocks(0.3); return; }

      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      this.x = clamp(this.x + dir * 135 * dt, 2, W - 16);

      this.rockTimer -= dt;
      if (this.rockTimer <= 0) {
        const s = randInt(3, 8) * 2;
        this.rocks.push({ x: rand(0, W - s), y: -s, w: s, h: s, vy: rand(55, 95) * lvl, vx: rand(-15, 15) });
        this.rockTimer = Math.max(0.12, rand(0.35, 0.75) / lvl);
      }
      this.gemTimer -= dt;
      if (this.gemTimer <= 0) {
        this.gems.push({ x: rand(4, W - 14), y: -10, w: 10, h: 10, vy: 60 * Math.sqrt(lvl) });
        this.gemTimer = rand(2, 4);
      }

      moveRocks(1);
      const ship = { x: this.x + 2, y: H - 28, w: 10, h: 10 };

      for (let i = this.rocks.length - 1; i >= 0; i--) {
        const r = this.rocks[i];
        if (r.y > H || r.x < -20 || r.x > W + 20) { this.rocks.splice(i, 1); continue; }
        if (this.inv <= 0 && hits(r, ship)) {
          this.rocks.splice(i, 1);
          this.lives--; this.inv = 1.5; shake = 0.3;
          sfx.hit();
          burst(this.x + 7, H - 23, C.red, 24, 110);
          if (this.lives <= 0) { this.ending = 1.2; burst(this.x + 7, H - 23, C.yellow, 30, 140); }
        }
      }
      for (let i = this.gems.length - 1; i >= 0; i--) {
        const g = this.gems[i];
        if (g.y > H) { this.gems.splice(i, 1); continue; }
        if (hits(g, ship)) {
          this.gems.splice(i, 1);
          this.score += 50;
          sfx.point();
          burst(g.x + 5, g.y + 5, C.cyan, 14, 70);
          popup('+50', g.x + 5, g.y - 6, C.cyan);
        }
      }
      this.score += dt * 10 * lvl;
    },
    draw() {
      for (const r of this.rocks) {
        const x = r.x | 0, y = r.y | 0;
        ctx.fillStyle = 'rgba(255,120,40,.45)';
        ctx.fillRect(x + 2, y - 4, r.w - 4, 4);
        // chunky rounded rock: outline, body, highlight, craters
        ctx.fillStyle = '#4a2c18';
        ctx.fillRect(x + 2, y, r.w - 4, r.h);
        ctx.fillRect(x, y + 2, r.w, r.h - 4);
        ctx.fillStyle = '#9a6038';
        ctx.fillRect(x + 2, y + 2, r.w - 4, r.h - 4);
        ctx.fillStyle = '#d99a62'; ctx.fillRect(x + 2, y + 2, Math.max(2, r.w / 3 | 0), 2);
        ctx.fillStyle = '#5e3a22'; ctx.fillRect(x + r.w - 6, y + r.h - 6, 2, 2);
        if (r.w > 10) ctx.fillRect(x + 4, y + r.h / 2 | 0, 2, 2);
      }
      for (const g of this.gems) sprite(GEM, g.x, g.y, 2, { c: C.cyan, w: C.white });

      const blink = this.inv > 0 && Math.floor(this.inv * 12) % 2 === 0;
      if (this.ending == null && !blink) {
        const flame = Math.random() < 0.5 ? C.yellow : C.red;
        sprite(SHIP, this.x, H - 30, 2, { c: C.cyan, w: C.white, p: C.pink, f: flame });
      }
      hud(this.score, this.lives, '');
    }
  };

  // =====================================================================
  // GAME 2: BYTE STACKER — time your drops, overhang gets chopped
  // =====================================================================
  const CELL = 10, COLS = 24;
  const byteStacker = {
    id: 'stacker', title: 'BYTE STACKER', color: C.pink,
    blurb: 'STACK THE BLOCKS SKY HIGH', starSpeed: 8, tapAction: true,
    reset() {
      this.score = 0; this.over = false; this.ending = null;
      this.stack = [{ x: 8, w: 8 }];
      this.falling = []; this.combo = 0; this.cam = 0; this.flash = 0;
      this.spawnRow();
    },
    spawnRow() {
      const top = this.stack[this.stack.length - 1];
      const fromLeft = this.stack.length % 2 === 0;
      this.cur = { x: fromLeft ? 0 : COLS - top.w, w: top.w, dir: fromLeft ? 1 : -1 };
      this.stepTimer = 0;
      this.speed = Math.min(30, 8 + this.stack.length * 0.65); // cells per second
    },
    worldY(i) { return H - (i + 1) * CELL; },
    color(i) { return `hsl(${(i * 22) % 360} 100% 60%)`; },
    update(dt) {
      for (let i = this.falling.length - 1; i >= 0; i--) {
        const f = this.falling[i];
        f.vy += 400 * dt; f.y += f.vy * dt;
        if (f.y + this.cam > H + 20) this.falling.splice(i, 1);
      }
      const targetCam = Math.max(0, this.stack.length + 1 - 22) * CELL;
      this.cam += (targetCam - this.cam) * Math.min(1, dt * 6);
      this.flash = Math.max(0, this.flash - dt);
      if (this.ending != null) return;

      this.stepTimer += dt;
      const step = 1 / this.speed;
      while (this.stepTimer >= step) {
        this.stepTimer -= step;
        let nx = this.cur.x + this.cur.dir;
        if (nx < 0 || nx + this.cur.w > COLS) { this.cur.dir *= -1; nx = this.cur.x + this.cur.dir; }
        this.cur.x = nx;
      }
      if (input.consume('action')) this.drop();
    },
    drop() {
      const top = this.stack[this.stack.length - 1], c = this.cur;
      const i = this.stack.length, y = this.worldY(i), color = this.color(i);
      const l = Math.max(top.x, c.x), r = Math.min(top.x + top.w, c.x + c.w);

      if (r <= l) {
        this.falling.push({ x: c.x * CELL, y, w: c.w * CELL, vy: 0, color });
        sfx.hit(); shake = 0.3;
        this.ending = 1.2;
        return;
      }
      if (c.x < l) this.falling.push({ x: c.x * CELL, y, w: (l - c.x) * CELL, vy: 0, color });
      if (c.x + c.w > r) this.falling.push({ x: r * CELL, y, w: (c.x + c.w - r) * CELL, vy: 0, color });

      const perfect = l === c.x && r === c.x + c.w;
      const row = { x: l, w: r - l };
      this.stack.push(row);
      const sy = y + this.cam;
      if (perfect) {
        this.combo++;
        const pts = 10 + this.combo * 5;
        this.score += pts;
        this.flash = 0.15;
        let label = 'PERFECT!';
        if (this.combo % 3 === 0 && row.w < 8) {
          if (row.x + row.w < COLS) row.w++; else { row.x--; row.w++; }
          label = 'GROW!';
          sfx.fanfare();
        } else sfx.perfect();
        popup(label, (row.x + row.w / 2) * CELL, sy - 12, C.white);
        burst((row.x + row.w / 2) * CELL, sy, C.white, 16, 90);
      } else {
        this.combo = 0;
        this.score += 10;
        sfx.drop();
      }
      this.spawnRow();
    },
    drawRow(x, w, y, color) {
      for (let c = 0; c < w; c++) {
        const px = (x + c) * CELL;
        ctx.fillStyle = color; ctx.fillRect(px, y, CELL - 1, CELL - 1);
        ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(px, y, CELL - 1, 2);
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(px, y + CELL - 3, CELL - 1, 2);
      }
    },
    draw() {
      ctx.fillStyle = 'rgba(255,43,214,.06)';
      for (let c = 0; c <= COLS; c += 4) ctx.fillRect(c * CELL, 16, 1, H);
      this.stack.forEach((row, i) => {
        const y = this.worldY(i) + this.cam;
        if (y < H && y > -CELL) this.drawRow(row.x, row.w, y, this.color(i));
      });
      if (this.ending == null) {
        const i = this.stack.length;
        this.drawRow(this.cur.x, this.cur.w, this.worldY(i) + this.cam, this.color(i));
      }
      for (const f of this.falling) {
        ctx.fillStyle = f.color;
        ctx.fillRect(f.x, f.y + this.cam, f.w - 1, CELL - 1);
      }
      if (this.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${this.flash})`;
        ctx.fillRect(0, 0, W, H);
      }
      hud(this.score, 0, 'HEIGHT ' + (this.stack.length - 1));
      if (this.stack.length < 3 && this.ending == null) text('PRESS A TO DROP', W / 2, 60, C.white, 8, 'center');
    }
  };

  // =====================================================================
  // GAME 3: REFLEX GRID — whack green, avoid red
  // =====================================================================
  const S = 52, GAP = 6, GX = 7, GY = 72;
  const GRID_KEYS = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];
  const reflexGrid = {
    id: 'reflex', title: 'REFLEX GRID', color: C.cyan,
    blurb: 'HIT GREEN. NEVER RED.', starSpeed: 12,
    reset() {
      this.score = 0; this.over = false; this.ending = null;
      this.t = 0; this.lives = 3; this.combo = 0; this.spawnTimer = 0.5;
      this.tiles = Array.from({ length: 16 }, () => ({ type: null, life: 0, max: 1, flash: 0, flashColor: C.white }));
    },
    pos(i) { return { x: GX + (i % 4) * (S + GAP), y: GY + Math.floor(i / 4) * (S + GAP) }; },
    loseLife() {
      this.lives--; this.combo = 0; shake = 0.25;
      if (this.lives <= 0) {
        this.ending = 1.2;
        for (const t of this.tiles) { t.type = null; t.flash = 0.6; t.flashColor = C.red; }
      }
    },
    spawn(lvl) {
      const empty = this.tiles.map((t, i) => (t.type ? -1 : i)).filter((i) => i >= 0);
      if (!empty.length) return;
      const t = this.tiles[empty[randInt(0, empty.length - 1)]];
      t.type = Math.random() < Math.min(0.35, 0.12 + this.t / 150) ? 'no' : 'go';
      t.max = t.life = Math.max(0.6, 1.6 / Math.pow(lvl, 0.7));
    },
    update(dt) {
      for (const t of this.tiles) t.flash = Math.max(0, t.flash - dt);
      if (this.ending != null) return;
      this.t += dt;
      const lvl = 1 + this.t / 18;
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawn(lvl);
        if (lvl > 1.8 && Math.random() < 0.3) this.spawn(lvl);
        this.spawnTimer = Math.max(0.25, 0.85 / lvl);
      }
      this.tiles.forEach((t, i) => {
        if (!t.type) return;
        t.life -= dt;
        if (t.life <= 0) {
          if (t.type === 'go') {
            t.flash = 0.3; t.flashColor = C.red;
            sfx.error();
            const p = this.pos(i);
            popup('MISS', p.x + S / 2, p.y + S / 2 - 4, C.red);
            t.type = null;
            this.loseLife();
          } else t.type = null;
        }
      });
    },
    hit(i) {
      if (this.ending != null) return;
      const t = this.tiles[i], p = this.pos(i);
      const cx = p.x + S / 2, cy = p.y + S / 2;
      if (t.type === 'go') {
        this.combo++;
        const pts = 10 + Math.min(this.combo, 25) * 2;
        this.score += pts;
        sfx.point();
        burst(cx, cy, C.green, 14, 80);
        popup('+' + pts, cx, cy - 4, C.yellow);
        t.type = null; t.flash = 0.15; t.flashColor = C.white;
      } else if (t.type === 'no') {
        sfx.hit();
        burst(cx, cy, C.red, 20, 100);
        t.type = null; t.flash = 0.3; t.flashColor = C.red;
        this.loseLife();
      } else {
        sfx.tick();
        t.flash = 0.08; t.flashColor = C.dim;
      }
    },
    onPointer(x, y) {
      const col = Math.floor((x - GX) / (S + GAP)), row = Math.floor((y - GY) / (S + GAP));
      if (col < 0 || col > 3 || row < 0 || row > 3) return;
      const p = this.pos(row * 4 + col);
      if (x >= p.x && x < p.x + S && y >= p.y && y < p.y + S) this.hit(row * 4 + col);
    },
    onKey(k) {
      const i = GRID_KEYS.indexOf(k);
      if (i < 0) return false;
      this.hit(i);
      return true;
    },
    draw() {
      this.tiles.forEach((t, i) => {
        const { x, y } = this.pos(i);
        ctx.fillStyle = C.tile; ctx.fillRect(x, y, S, S);
        ctx.strokeStyle = C.dim; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, S - 2, S - 2);
        if (t.type) {
          const inner = S - 8, frac = clamp(t.life / t.max, 0, 1);
          ctx.fillStyle = t.type === 'go' ? C.green : C.red;
          ctx.fillRect(x + 4, y + 4, inner, inner);
          ctx.fillStyle = 'rgba(0,0,0,.45)';
          ctx.fillRect(x + 4, y + 4, inner, inner * (1 - frac)); // draining timer
          ctx.fillStyle = '#000';
          if (t.type === 'go') {
            ctx.fillRect(x + 18, y + 18, 16, 16);
            ctx.fillStyle = C.green; ctx.fillRect(x + 22, y + 22, 8, 8);
          } else {
            for (let k = 0; k < 7; k++) {
              ctx.fillRect(x + 14 + k * 3, y + 14 + k * 3, 4, 4);
              ctx.fillRect(x + 34 - k * 3, y + 14 + k * 3, 4, 4);
            }
          }
        }
        if (t.flash > 0) {
          ctx.globalAlpha = clamp(t.flash / 0.3, 0, 1);
          ctx.fillStyle = t.flashColor; ctx.fillRect(x, y, S, S);
          ctx.globalAlpha = 1;
        }
        text(GRID_KEYS[i].toUpperCase(), x + 5, y + S - 12, 'rgba(255,255,255,.3)', 8);
      });
      if (this.t < 3.5 && this.ending == null) {
        text('HIT GREEN!', W / 2, 28, C.green, 8, 'center');
        text('AVOID RED!', W / 2, 44, C.red, 8, 'center');
      }
      hud(this.score, this.lives, this.combo > 1 ? 'x' + this.combo : '');
    }
  };

  // =====================================================================
  // CABINET / STATE MACHINE
  // =====================================================================
  const GAMES = [meteorDash, byteStacker, reflexGrid];
  let state = 'attract'; // attract | menu | play | over
  let game = null;
  let paused = false;
  let ready = 0;
  let credits = 0;
  let menuIndex = clamp(store.get('rjcArcade.last', 0) | 0, 0, GAMES.length - 1);
  let lastEntry = null;

  const els = {
    credits: $('#credits'), prompt: $('#attract-prompt'), attractHi: $('#attract-hi'),
    list: $('#game-list'), overGame: $('#over-game'), overScore: $('#over-score'),
    form: $('#initials-form'), initials: $('#initials'), scores: $('#over-scores'),
    coin: $('#coin'), sound: $('#sound'), toast: $('#toast'), retry: $('#btn-retry')
  };

  const getScores = (id) => {
    const s = store.get('rjcArcade.scores.' + id, []);
    return Array.isArray(s) ? s : [];
  };

  function setView(name) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  }

  let toastTimer = 0;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1800);
  }

  function retrigger(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function updateCredits() {
    els.credits.textContent = String(credits).padStart(2, '0');
    els.prompt.textContent = credits > 0 ? 'PRESS START' : 'INSERT COIN';
  }

  function updateAttractHi() {
    let best = 0;
    for (const g of GAMES) for (const s of getScores(g.id)) best = Math.max(best, s.s);
    els.attractHi.textContent = pad6(best);
  }

  function insertCoin() {
    credits = Math.min(99, credits + 1);
    sfx.coin();
    retrigger(els.coin, 'bump');
    updateCredits();
  }

  function needCoin() {
    sfx.error();
    retrigger(els.coin, 'nag');
    toast('INSERT COIN FIRST! (C)');
  }

  function renderMenu() {
    els.list.replaceChildren(...GAMES.map((g, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'game-card' + (i === menuIndex ? ' selected' : '');
      const top = getScores(g.id)[0];
      const t = document.createElement('span'); t.className = 'g-title'; t.style.color = g.color; t.textContent = g.title;
      const d = document.createElement('span'); d.className = 'g-blurb'; d.textContent = g.blurb;
      const h = document.createElement('span'); h.className = 'g-hi'; h.textContent = top ? `HI ${pad6(top.s)} ${top.n}` : 'HI ------ ---';
      b.append(t, d, h);
      b.addEventListener('click', () => { menuIndex = i; startGame(i); });
      li.append(b);
      return li;
    }));
  }

  function goAttract() {
    state = 'attract'; game = null;
    updateAttractHi(); updateCredits();
    setView('attract');
  }

  function goMenu() {
    state = 'menu'; game = null; paused = false;
    renderMenu();
    setView('menu');
  }

  function startGame(i) {
    if (credits <= 0) { needCoin(); return; }
    credits--; updateCredits();
    menuIndex = i;
    store.set('rjcArcade.last', i);
    game = GAMES[i];
    game.reset();
    particles.length = 0; popups.length = 0;
    paused = false; ready = 1.4;
    state = 'play';
    input.clear();
    setView('none');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    sfx.start();
  }

  function renderScores(list, highlight) {
    const items = [];
    for (let i = 0; i < 5; i++) {
      const li = document.createElement('li');
      const e = list[i];
      const n = document.createElement('span'); n.className = 's-name';
      const s = document.createElement('span');
      if (e) { n.textContent = e.n; s.textContent = pad6(e.s); if (e === highlight) li.className = 'me'; }
      else { li.className = 'empty'; n.textContent = '---'; s.textContent = '------'; }
      li.append(n, s);
      items.push(li);
    }
    els.scores.replaceChildren(...items);
  }

  function endGame() {
    state = 'over';
    const final = Math.floor(game.score);
    sfx.over();
    els.overGame.textContent = game.title;
    els.overScore.textContent = pad6(final);
    const list = getScores(game.id);
    const qualifies = final > 0 && (list.length < 5 || final > list[list.length - 1].s);
    lastEntry = qualifies ? { s: final } : null;
    els.form.hidden = !qualifies;
    renderScores(list, null);
    setView('over');
    if (qualifies) {
      els.initials.value = store.get('rjcArcade.initials', '');
      setTimeout(() => { els.initials.focus(); els.initials.select(); }, 50);
      setTimeout(() => sfx.fanfare(), 700);
    } else {
      els.retry.focus({ preventScroll: true });
    }
  }

  els.initials.addEventListener('input', () => {
    els.initials.value = els.initials.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  });

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!lastEntry || !game) return;
    const name = (els.initials.value || '???').padEnd(3, '-');
    store.set('rjcArcade.initials', els.initials.value);
    const entry = { n: name, s: lastEntry.s };
    const list = getScores(game.id);
    list.push(entry);
    list.sort((a, b) => b.s - a.s);
    const top = list.slice(0, 5);
    store.set('rjcArcade.scores.' + game.id, top);
    lastEntry = null;
    els.form.hidden = true;
    renderScores(top, entry);
    sfx.coin();
    els.retry.focus({ preventScroll: true });
  });

  $('#btn-retry').addEventListener('click', () => startGame(menuIndex));
  $('#btn-menu').addEventListener('click', () => { sfx.select(); goMenu(); });
  $('#view-attract').addEventListener('click', () => onStart());
  els.coin.addEventListener('click', insertCoin);

  function updateSoundBtn() { els.sound.textContent = 'SOUND: ' + (sfx.muted ? 'OFF' : 'ON'); }
  function toggleSound() {
    sfx.muted = !sfx.muted;
    store.set('rjcArcade.muted', sfx.muted);
    updateSoundBtn();
    sfx.select();
  }
  els.sound.addEventListener('click', toggleSound);

  function togglePause() {
    if (state !== 'play') return;
    paused = !paused;
    sfx.select();
  }

  function onStart() {
    sfx.ensure();
    if (state === 'attract') {
      if (credits > 0) { sfx.select(); goMenu(); } else needCoin();
    } else if (state === 'menu') startGame(menuIndex);
    else if (state === 'play') togglePause();
    else if (state === 'over' && els.form.hidden) startGame(menuIndex);
  }

  function onAction() {
    sfx.ensure();
    if (state === 'play') { if (!paused && ready <= 0) input.press('action'); }
    else if (state === 'attract' || state === 'menu') onStart();
  }

  function onDir(d) {
    if (state !== 'menu') return;
    menuIndex = (menuIndex + d + GAMES.length) % GAMES.length;
    sfx.select();
    renderMenu();
  }

  // ---------- Cheat code ----------
  const CODE = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  let codeIdx = 0;
  function cheat() {
    credits = 99; updateCredits();
    document.body.classList.toggle('rainbow');
    sfx.cheat();
    toast(document.body.classList.contains('rainbow') ? 'CHEAT ON: 99 CREDITS + RAINBOW' : 'RAINBOW OFF (KEEP THE CREDITS)');
  }

  // ---------- Keyboard ----------
  const ctlBtn = (name) => document.querySelector(`.ctl[data-ctl="${name}"]`);
  const keyCtl = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', ' ': 'action', enter: 'start' };

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if ((k === 'enter' || k === ' ') && e.target.tagName === 'BUTTON') return; // let focused buttons click

    if (!e.repeat) {
      codeIdx = k === CODE[codeIdx] ? codeIdx + 1 : (k === CODE[0] ? 1 : 0);
      if (codeIdx === CODE.length) { codeIdx = 0; cheat(); }
    }

    if (state === 'play' && game && game.onKey && !paused && ready <= 0 && !e.repeat && game.onKey(k)) {
      e.preventDefault();
      return;
    }

    if (keyCtl[k]) { const b = ctlBtn(keyCtl[k]); if (b) b.classList.add('pressed'); }

    switch (k) {
      case 'arrowleft': case 'a': input.left = true; if (!e.repeat) onDir(-1); break;
      case 'arrowright': case 'd': input.right = true; if (!e.repeat) onDir(1); break;
      case 'arrowup': case 'w': if (!e.repeat) onDir(-1); break;
      case 'arrowdown': case 's': if (!e.repeat) onDir(1); break;
      case ' ': if (!e.repeat) onAction(); break;
      case 'enter': if (!e.repeat) onStart(); break;
      case 'c': if (!e.repeat) insertCoin(); break;
      case 'm': if (!e.repeat) toggleSound(); break;
      case 'p': if (!e.repeat) togglePause(); break;
      case 'escape': if (state === 'play' || state === 'over') { sfx.select(); goMenu(); } else if (state === 'menu') goAttract(); break;
      default: return;
    }
    e.preventDefault();
  });

  document.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') input.left = false;
    if (k === 'arrowright' || k === 'd') input.right = false;
    if (keyCtl[k]) { const b = ctlBtn(keyCtl[k]); if (b) b.classList.remove('pressed'); }
  });

  window.addEventListener('blur', () => { input.left = input.right = false; });

  // ---------- On-cabinet controls (mouse + touch) ----------
  document.querySelectorAll('.ctl').forEach((btn) => {
    const name = btn.dataset.ctl;
    const release = () => {
      if (name === 'left') input.left = false;
      if (name === 'right') input.right = false;
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sfx.ensure();
      if (btn.setPointerCapture) { try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      if (name === 'left') { input.left = true; onDir(-1); }
      else if (name === 'right') { input.right = true; onDir(1); }
      else if (name === 'action') onAction();
      else if (name === 'start') onStart();
    });
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'play' || !game || paused || ready > 0) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    if (game.onPointer) game.onPointer(x, y);
    else if (game.tapAction) input.press('action');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'play') paused = true;
  });

  // ---------- Main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) {
      shake -= dt;
      ctx.translate(randInt(-2, 2), randInt(-2, 2));
    }

    if ((state === 'play' || state === 'over') && game) {
      const running = state === 'play' && !paused;
      drawStars(running ? dt : 0, game.starSpeed);
      if (running) {
        if (ready > 0) ready -= dt;
        else {
          game.update(dt);
          if (game.ending != null) {
            game.ending -= dt;
            if (game.ending <= 0) game.over = true;
          }
        }
        updateFx(dt);
      }
      input.clear();
      game.draw();
      drawFx();

      if (state === 'play' && ready > 0) {
        ctx.fillStyle = 'rgba(0,0,0,.5)';
        ctx.fillRect(0, H / 2 - 22, W, 44);
        text(ready > 0.45 ? 'READY?' : 'GO!', W / 2, H / 2 - 8, ready > 0.45 ? C.yellow : C.green, 16, 'center');
      }
      if (state === 'play' && paused) {
        ctx.fillStyle = 'rgba(0,0,0,.65)';
        ctx.fillRect(0, 0, W, H);
        if (Math.floor(now / 500) % 2 === 0) text('PAUSED', W / 2, H / 2 - 16, C.yellow, 16, 'center');
        text('START TO RESUME', W / 2, H / 2 + 12, C.white, 8, 'center');
        text('ESC TO QUIT', W / 2, H / 2 + 28, C.dim, 8, 'center');
      }
      if (running && game.over) endGame();
    } else {
      drawStars(dt, state === 'menu' ? 15 : 35);
    }

    ctx.restore();
    requestAnimationFrame(frame);
  }

  // ---------- Boot ----------
  updateSoundBtn();
  goAttract();
  requestAnimationFrame(frame);
})();
