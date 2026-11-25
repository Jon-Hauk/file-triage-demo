// npm run generate: builds synthetic sample files in samples/broken-copy/
// and writes ground-truth expectations to samples/truth.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ISSUE_ORDER } from './detectors.js';
import { buildSampleManifest } from './sample.js';

/**
 * Generate the synthetic sample directory and matching truth manifest.
 */
export function generateSample(sampleDir = 'samples/broken-copy', truthFile = 'samples/truth.json') {
  const absSampleDir = path.resolve(sampleDir);
  const absTruthFile = path.resolve(truthFile);

  fs.rmSync(path.toNamespacedPath(absSampleDir), { recursive: true, force: true });
  fs.mkdirSync(path.toNamespacedPath(absSampleDir), { recursive: true });

  const manifest = buildSampleManifest();
  const countsByIssue = Object.fromEntries(ISSUE_ORDER.map((c) => [c, 0]));
  let healthyCount = 0;
  let flaggedCount = 0;

  const truthFiles = [];

  for (const entry of manifest) {
    const targetPath = path.join(absSampleDir, ...entry.path.split('/'));
    const parentFsPath = path.toNamespacedPath(path.dirname(targetPath));
    fs.mkdirSync(parentFsPath, { recursive: true });
    fs.writeFileSync(path.toNamespacedPath(targetPath), entry.data);

    if (entry.expectedIssues.length === 0) {
      healthyCount++;
    } else {
      flaggedCount++;
      for (const code of entry.expectedIssues) {
        countsByIssue[code]++;
      }
    }

    truthFiles.push({
      path: entry.path,
      size: entry.data.length,
      issues: entry.expectedIssues,
    });
  }

  const truth = {
    totalFiles: manifest.length,
    healthyCount,
    flaggedCount,
    countsByIssue,
    files: truthFiles,
  };

  if (truthFile) {
    fs.mkdirSync(path.dirname(absTruthFile), { recursive: true });
    fs.writeFileSync(absTruthFile, `${JSON.stringify(truth, null, 2)}\n`, 'utf8');
  }

  return truth;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const truth = generateSample();
  console.log(`Generated ${truth.totalFiles} synthetic files in samples/broken-copy/`);
  console.log(`Healthy: ${truth.healthyCount} | Flagged: ${truth.flaggedCount}`);
  for (const [code, count] of Object.entries(truth.countsByIssue)) {
    if (count > 0) console.log(`  - ${code}: ${count}`);
  }
  console.log('Wrote samples/truth.json');
}
