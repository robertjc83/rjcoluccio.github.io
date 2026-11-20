// Re-encode generated splash PNGs with a 256-colour palette (gradients are smooth enough that it's invisible).
const sharp = require('sharp'), fs = require('fs'), path = require('path');
const res = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
(async () => {
  for (const d of fs.readdirSync(res).filter(d => d.startsWith('drawable'))) {
    const f = path.join(res, d, 'splash.png');
    if (!fs.existsSync(f)) continue;
    const buf = await sharp(f).png({ palette: true, quality: 90, dither: 1, compressionLevel: 9 }).toBuffer();
    if (buf.length < fs.statSync(f).size) fs.writeFileSync(f, buf);
  }
})();
