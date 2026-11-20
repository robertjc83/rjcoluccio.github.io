// Copies the web game (../idle) into www/ for Capacitor. Docs and the privacy page stay web-only.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '..', 'idle');
const out = join(root, 'www');
const skip = new Set(['DESIGN.md', 'privacy.html']);

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
cpSync(src, out, { recursive: true, filter: p => !skip.has(basename(p)) });
// favicon is referenced as ../rjc-favicon.ico on the website; harmless if missing in the app
console.log('Copied', src, '->', out);
