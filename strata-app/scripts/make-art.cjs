// Draws the source icon + splash art with canvas (headless Chromium), saved to assets/.
// Then `npm run icons` turns them into every Android density.
const { chromium } = require('playwright');
const path = require('path');
const out = path.join(__dirname, '..', 'assets');

const draw = `
function strata(ctx, x, y, w, h, scale) {
  const L = [[30,45,28],[18,50,36],[220,12,30],[0,0,42],[12,45,28],[44,70,38],[190,55,36]];
  const bandH = h / L.length;
  L.forEach(([hh,s,l],i) => { ctx.fillStyle = 'hsl('+hh+','+s+'%,'+l+'%)'; ctx.fillRect(x, y+i*bandH, w, bandH+1);
    for (let k=0;k<40;k++){ const r=Math.sin(i*99+k*7.3)*43758.5; const f=r-Math.floor(r); const r2=Math.sin(i*13+k*3.1)*1e4; const g=r2-Math.floor(r2);
      ctx.fillStyle = 'hsl('+hh+','+s+'%,'+(l+(k%5?8:30))+'%)'; const sz=(k%5?6:12)*scale; ctx.fillRect(x+f*w, y+i*bandH+g*bandH, sz, sz);} });
}
function rig(ctx, cx, ground, s, depth) {
  ctx.fillStyle = '#05010a'; ctx.fillRect(cx-22*s, ground, 44*s, depth);
  ctx.fillStyle = '#6b6b80'; ctx.fillRect(cx-6*s, ground, 12*s, depth);
  // bit
  const by = ground + depth;
  ctx.fillStyle = '#d8d8e6'; ctx.beginPath(); ctx.moveTo(cx-34*s, by-10*s); ctx.lineTo(cx+34*s, by-10*s); ctx.lineTo(cx, by+56*s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7a7a90'; for (let i=0;i<3;i++){ const o=i*16*s; const hw=30*s*(1-(o+6*s)/(60*s)); ctx.fillRect(cx-hw, by-2*s+o, hw*2, 6*s); }
  // sparks
  ctx.fillStyle = '#ffe600'; [[-50,40],[46,30],[-30,70],[60,64],[-66,10],[20,84]].forEach(([dx,dy])=>ctx.fillRect(cx+dx*s, by+dy*s, 9*s, 9*s));
  // derrick
  ctx.strokeStyle = '#ffe600'; ctx.lineWidth = 12*s; ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx-70*s, ground); ctx.lineTo(cx, ground-210*s); ctx.lineTo(cx+70*s, ground);
  for (let k=1;k<4;k++){ const yy=ground-k*50*s, hw=70*s*(1-k*50/210); ctx.moveTo(cx-hw,yy); ctx.lineTo(cx+hw,yy); }
  ctx.stroke();
  ctx.fillStyle = '#ff2bd6'; ctx.fillRect(cx-14*s, ground-232*s, 28*s, 28*s);
}
function sky(ctx, w, h) { const g = ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,'#0a0414'); g.addColorStop(1,'#2a0b4d'); ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
  for (let i=0;i<60;i++){ const r=Math.sin(i*12.9)*43758.5, f=r-Math.floor(r), r2=Math.sin(i*78.2)*43758.5, g2=r2-Math.floor(r2); ctx.fillStyle='rgba(255,255,255,'+(0.3+0.6*f)+')'; ctx.fillRect(f*w, g2*h, 4, 4);} }
`;

const jobs = {
  // full square icon (legacy + Play listing 512px is made from this)
  'icon-only.png': [1024, 1024, `sky(ctx,1024,1024); strata(ctx,0,560,1024,464,1.6); rig(ctx,512,560,1.6,190);`],
  // adaptive icon: background + transparent foreground kept inside the centre safe zone
  'icon-background.png': [1024, 1024, `sky(ctx,1024,1024); strata(ctx,0,580,1024,444,1.6);`],
  'icon-foreground.png': [1024, 1024, `rig(ctx,512,580,1.15,120);`],
  'splash.png': [2732, 2732, `sky(ctx,2732,2732); strata(ctx,0,1500,2732,1232,3); rig(ctx,1366,1500,2.4,300);
     ctx.font='140px "Press Start 2P", monospace'; ctx.textAlign='center'; ctx.fillStyle='#ffe600'; ctx.shadowColor='#ffe600'; ctx.shadowBlur=30; ctx.fillText('STRATA',1366,700);
     ctx.fillStyle='#ff2bd6'; ctx.shadowColor='#ff2bd6'; ctx.fillText('TYCOON',1366,900);`],
  // Play Store feature graphic 1024x500
  'feature-graphic.png': [1024, 500, `sky(ctx,1024,500); strata(ctx,0,330,1024,170,0.9); rig(ctx,250,330,0.9,60);
     ctx.font='56px "Press Start 2P", monospace'; ctx.textAlign='left'; ctx.fillStyle='#ffe600'; ctx.shadowColor='#ffe600'; ctx.shadowBlur=14; ctx.fillText('STRATA',420,170);
     ctx.fillStyle='#ff2bd6'; ctx.shadowColor='#ff2bd6'; ctx.fillText('TYCOON',420,250); ctx.shadowBlur=0;
     ctx.font='18px "Press Start 2P", monospace'; ctx.fillStyle='#f4f4f4'; ctx.fillText('DIG DEEPER. GET RICHER.',420,300);`],
};

(async () => {
  const fontUrl = 'data:font/woff2;base64,' + require('fs').readFileSync(path.join(__dirname, '..', '..', 'idle', 'fonts', 'press-start-2p.woff2')).toString('base64');
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent(`<style>@font-face{font-family:'Press Start 2P';src:url('${fontUrl}')}</style><span style="font-family:'Press Start 2P'">.</span>`);
  await p.evaluate(() => document.fonts.ready);
  for (const [name, [w, h, body]] of Object.entries(jobs)) {
    const data = await p.evaluate(({ w, h, src }) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); new Function('ctx', src)(ctx);
      return c.toDataURL('image/png');
    }, { w, h, src: draw + body });
    require('fs').writeFileSync(path.join(out, name), Buffer.from(data.split(',')[1], 'base64'));
    console.log('wrote', name);
  }
  await b.close();
})();
