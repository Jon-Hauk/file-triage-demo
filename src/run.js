// npm run report: scans samples/broken-copy (or --in <dir>) in read-only mode
// and writes triage-report.md, triage-report.html, and triage-report.csv.
//
//   node src/run.js [--in samples/broken-copy] [--out output]

import fs from 'node:fs';
import path from 'node:path';
import { scanDirectory } from './scanner.js';
import { writeReports } from './report.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--') && i + 1 < argv.length) {
      out[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const inDir = args.in ?? 'samples/broken-copy';
const outDir = args.out ?? 'output';

if (!fs.existsSync(path.toNamespacedPath(path.resolve(inDir)))) {
  const hint = inDir === 'samples/broken-copy' ? ' Run "npm run generate" first.' : '';
  console.error(`Input folder does not exist: ${inDir}.${hint}`);
  process.exit(1);
}

const result = scanDirectory(inDir);
const written = writeReports(result, outDir);

console.log(`Scanned ${result.totalFiles} files in ${inDir} (read-only)`);
console.log(`Healthy: ${result.healthyCount} | Flagged: ${result.flaggedCount}`);
for (const group of result.groups) {
  console.log(`  - ${group.code}: ${group.items.length}`);
}
console.log(`Wrote ${written.mdPath}, ${written.htmlPath}, and ${written.csvPath}`);
