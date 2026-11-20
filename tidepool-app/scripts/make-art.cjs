// Draws the source icon, splash and Play Store art with canvas (headless Chromium) into assets/.
// Then `npm run icons` turns them into every Android density.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const out = path.join(__dirname, '..', 'assets');

const draw = `
function sea(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, -h * 0.1, h * 0.1, w / 2, h * 0.3, h * 1.1);
  g.addColorStop(0, '#3fc6e0'); g.addColorStop(0.45, '#0b5370'); g.addColorStop(1, '#041f30');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // light rays
  ctx.save(); ctx.globalAlpha = 0.08; ctx.fillStyle = '#fff';
  for (let i = 0; i < 5; i++) { const x = w * (0.1 + i * 0.2); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w * 0.08, 0); ctx.lineTo(x + w * 0.2, h); ctx.lineTo(x + w * 0.05, h); ctx.fill(); }
  ctx.restore();
  // bubbles
  ctx.strokeStyle = 'rgba(233,251,255,.5)';
  for (let i = 0; i < 18; i++) { const r = Math.sin(i * 12.9) * 43758.5, f = r - Math.floor(r), r2 = Math.sin(i * 78.2) * 43758.5, g2 = r2 - Math.floor(r2);
    ctx.lineWidth = Math.max(2, w / 300); ctx.beginPath(); ctx.arc(f * w, g2 * h, (4 + 10 * f) * w / 1024, 0, Math.PI * 2); ctx.stroke(); }
  // sand + coral
  ctx.fillStyle = '#e8c98a'; ctx.beginPath(); ctx.ellipse(w / 2, h * 1.02, w * 0.75, h * 0.12, 0, 0, Math.PI * 2); ctx.fill();
}
function card(ctx, x, y, w, h, rot, label, suit, red, emoji, right) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = w * 0.12; ctx.shadowOffsetY = w * 0.04;
  ctx.fillStyle = '#fffdf6'; const r = w * 0.1;
  ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, r); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = red ? '#d7263d' : '#1b2430'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold ' + (w * 0.3) + 'px system-ui, sans-serif'; const cx = right ? w * 0.28 : -w * 0.28; ctx.fillText(label, cx, -h * 0.36);
  ctx.font = (w * 0.22) + 'px system-ui, sans-serif'; ctx.fillText(suit, cx, -h * 0.17);
  if (emoji) { ctx.font = (w * 0.55) + 'px "Noto Color Emoji", sans-serif'; ctx.fillText(emoji, 0, h * 0.12); }
  else { ctx.font = (w * 0.5) + 'px system-ui, sans-serif'; ctx.fillText(suit, right ? w * 0.12 : -w * 0.12, h * 0.15); }
  ctx.restore();
}
function fan(ctx, cx, cy, s) {
  const w = 300 * s, h = 420 * s;
  card(ctx, cx - 150 * s, cy + 20 * s, w, h, -0.32, 'K', '♠', false);
  card(ctx, cx + 150 * s, cy + 20 * s, w, h, 0.32, 'A', '♥', true, null, true);
  card(ctx, cx, cy - 10 * s, w, h, 0, 'Q', '♦', true, '🐠');
}
function title(ctx, x, y, size, align) {
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.font = '800 ' + size + 'px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowOffsetY = size * 0.06; ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffe8b8'; ctx.fillText('Tidepool', x, y);
  ctx.fillStyle = '#ff7a6b'; ctx.fillText('Solitaire', x, y + size * 1.05);
  ctx.shadowColor = 'transparent';
}
`;

const jobs = {
  'icon-only.png': [1024, 1024, `sea(ctx,1024,1024); fan(ctx,512,520,1.15);`],
  'icon-background.png': [1024, 1024, `sea(ctx,1024,1024);`],
  'icon-foreground.png': [1024, 1024, `fan(ctx,512,520,0.8);`],
  'splash.png': [2732, 2732, `sea(ctx,2732,2732); fan(ctx,1366,1150,2); title(ctx,1366,1900,200,'center');`],
  'feature-graphic.png': [1024, 500, `sea(ctx,1024,500); fan(ctx,260,250,0.62); title(ctx,500,210,82,'left');
     ctx.font='600 26px system-ui, sans-serif'; ctx.fillStyle='#e9fbff'; ctx.fillText('Clear the cards. Save the reef.',500,370);`],
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent('<span>.</span>');
  for (const [name, [w, h, body]] of Object.entries(jobs)) {
    const data = await p.evaluate(({ w, h, src }) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      new Function('ctx', src)(c.getContext('2d'));
      return c.toDataURL('image/png');
    }, { w, h, src: draw + body });
    fs.writeFileSync(path.join(out, name), Buffer.from(data.split(',')[1], 'base64'));
    console.log('wrote', name);
  }
  await b.close();
})();
