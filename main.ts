import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

// Helper to read CLI arguments (--name value or --name=value)
function arg(name: string, fallback: string): string {
  const flagIndex = process.argv.indexOf('--' + name);
  if (flagIndex !== -1 && process.argv.length > flagIndex + 1) {
    return process.argv[flagIndex + 1];
  }
  const prefix = '--' + name + '=';
  for (const a of process.argv) {
    if (a.startsWith(prefix)) {
      return a.slice(prefix.length);
    }
  }
  return fallback;
}

// Resolve input path
let input = arg('input', '/input');
if (!input.endsWith('.json')) {
  input = join(input, 'snapshot.json');
}

// Ensure input exists
if (!existsSync(input)) {
  process.stderr.write(`Error: Input file not found: ${input}\n`);
  process.exit(2);
}

// Resolve output directory
const out = arg('output', process.env['MAKEFUN_OUTPUT_DIR'] || '/output');

// Parse snapshot and build radar
const raw = readFileSync(input, 'utf8');
const snapshot = parseSnapshot(JSON.parse(raw));
const radar = buildRadar(snapshot);

// Check for board issues
const issue = boardIssue(radar.rows, snapshot.watchlist);
if (issue) {
  process.stderr.write(`Board issue: ${issue}\n`);
  process.exit(1);
}

// Create output directory
if (radar.rows.length < 100) { process.stderr.write(`token radar: only ${radar.rows.length} rows, need at least 100\n`); process.exit(1); }
mkdirSync(out, { recursive: true });

// Write board.json
const boardPath = join(out, 'board.json');
const boardContent = JSON.stringify({ rows: radar.rows }, null, 2) + '\n';
writeFileSync(boardPath, boardContent, 'utf8');

// Write data.js
const dataPath = join(out, 'data.js');
writeFileSync(dataPath, dataScript(radar), 'utf8');

// Helper to copy files from a source directory
function copyFiles(srcDir: string, destDir: string): string[] {
  const copied: string[] = [];
  if (!existsSync(srcDir)) return copied;
  for (const entry of readdirSync(srcDir)) {
    if (entry.startsWith('.')) continue;
    const srcPath = join(srcDir, entry);
    if (statSync(srcPath).isFile()) {
      mkdirSync(destDir, { recursive: true });
      copyFileSync(srcPath, join(destDir, entry));
      copied.push(entry);
    }
  }
  return copied;
}

copyFiles('dashboard', join(out, 'dashboard'));
const screenshots = copyFiles('screenshots', join(out, 'screenshots'));

// Verify screenshot count
if (screenshots.length < 3) {
  process.stderr.write(`Error: Fewer than 3 screenshots copied (${screenshots.length})\n`);
  process.exit(1);
}

// Validate screenshot names (letters, digits, dot, underscore, dash, 1-128 chars)
const namePattern = /^[a-zA-Z0-9._-]{1,128}$/;
for (const name of screenshots) {
  if (!namePattern.test(name)) {
    process.stderr.write(`Error: Invalid screenshot filename: ${name}\n`);
    process.exit(1);
  }
}

// Build and write dossier.json
const dossier = buildDossier(out, {
  text_max_bytes: 65536,
  screenshots: { max: 4, max_bytes: 524288 },
  dashboard: { max_files: 400, max_bytes: 4194304 }
});
writeFileSync(join(out, 'dossier.json'), JSON.stringify(dossier, null, 2) + '\n', 'utf8');

// Print summary lines to stdout
const protocolCount = radar.protocols ? radar.protocols.length : 0;
const watchlistSize = radar.watchlist ? radar.watchlist.length : 0;
const rowCount = radar.rows ? radar.rows.length : 0;
const earlySize = radar.early ? radar.early.length : 0;
const liveSize = radar.live ? radar.live.length : 0;

process.stdout.write(`Protocols: ${protocolCount}, Watchlist: ${watchlistSize}, Rows: ${rowCount}, Early: ${earlySize}, Live: ${liveSize}\n`);
process.stdout.write(`Written: board.json, data.js, dossier.json, ${screenshots.length} screenshots\n`);
