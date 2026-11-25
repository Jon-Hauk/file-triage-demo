import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ISSUE_META, ISSUE_ORDER, analyzeSingleFile } from './detectors.js';

const CHUNK_SIZE = 64 * 1024;
const HEAD_LIMIT = 4096;
const TAIL_LIMIT = 65557;
const SCAN_LIMIT = 2 * 1024 * 1024;

function walkFiles(baseDir, relPrefix, out) {
  const dirFsPath = path.toNamespacedPath(path.join(baseDir, relPrefix));
  const entries = fs.readdirSync(dirFsPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const nextRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walkFiles(baseDir, nextRel, out);
    } else if (entry.isFile()) {
      out.push(nextRel);
    }
  }
}

function readFileReadOnly(fsPath, size) {
  const hash = crypto.createHash('sha256');
  if (size === 0) {
    return {
      sha256: hash.digest('hex'),
      allZero: false,
      headBuf: Buffer.alloc(0),
      tailBuf: Buffer.alloc(0),
      scanBuf: Buffer.alloc(0),
    };
  }

  let allZero = true;
  const scanChunks = [];
  let scanCollected = 0;

  // Keep a rolling window of the last TAIL_LIMIT bytes without buffering huge files in memory.
  const tailWindowCap = Math.min(size, TAIL_LIMIT);
  let tailBuf = Buffer.alloc(0);

  const fd = fs.openSync(fsPath, 'r');
  try {
    const chunk = Buffer.allocUnsafe(Math.min(CHUNK_SIZE, size));
    let offset = 0;
    while (offset < size) {
      const toRead = Math.min(chunk.length, size - offset);
      const bytesRead = fs.readSync(fd, chunk, 0, toRead, offset);
      if (bytesRead <= 0) break;

      const view = chunk.subarray(0, bytesRead);
      hash.update(view);

      if (allZero) {
        for (let i = 0; i < view.length; i++) {
          if (view[i] !== 0) {
            allZero = false;
            break;
          }
        }
      }

      if (scanCollected < SCAN_LIMIT) {
        const take = Math.min(view.length, SCAN_LIMIT - scanCollected);
        scanChunks.push(Buffer.from(view.subarray(0, take)));
        scanCollected += take;
      }

      if (view.length >= tailWindowCap) {
        tailBuf = Buffer.from(view.subarray(view.length - tailWindowCap));
      } else {
        const combined = Buffer.concat([tailBuf, view]);
        tailBuf =
          combined.length > tailWindowCap
            ? combined.subarray(combined.length - tailWindowCap)
            : combined;
      }

      offset += bytesRead;
    }
  } finally {
    fs.closeSync(fd);
  }

  const scanBuf = Buffer.concat(scanChunks);
  return {
    sha256: hash.digest('hex'),
    allZero,
    headBuf: scanBuf.subarray(0, Math.min(HEAD_LIMIT, scanBuf.length)),
    tailBuf,
    scanBuf,
  };
}

/**
 * Recursively scan rootDir in strictly read-only mode and triage every file.
 */
export function scanDirectory(rootDir) {
  const absRoot = path.resolve(rootDir);
  const rootFsPath = path.toNamespacedPath(absRoot);
  if (!fs.existsSync(rootFsPath)) {
    throw new Error(`Directory not found: ${absRoot}`);
  }
  const rootStat = fs.statSync(rootFsPath);
  if (!rootStat.isDirectory()) {
    throw new Error(`Path is not a directory: ${absRoot}`);
  }

  const relPaths = [];
  walkFiles(absRoot, '', relPaths);
  relPaths.sort((a, b) => a.localeCompare(b));

  const files = [];
  let totalBytes = 0;

  for (const relPath of relPaths) {
    const fullPath = path.join(absRoot, ...relPath.split('/'));
    const fsPath = path.toNamespacedPath(fullPath);
    const stat = fs.statSync(fsPath);
    const size = stat.size;
    totalBytes += size;

    const { sha256, allZero, headBuf, tailBuf, scanBuf } = readFileReadOnly(fsPath, size);
    const { ext, detectedType, findings } = analyzeSingleFile({
      relPath,
      fullPath,
      size,
      allZero,
      headBuf,
      tailBuf,
      scanBuf,
    });

    files.push({
      path: relPath,
      ext,
      size,
      sha256,
      allZero,
      detectedType,
      findings,
      issues: findings.map((f) => f.code),
      details: findings.map((f) => f.details).join(' | '),
    });
  }

  // Group non-empty, non-all-zero files by SHA-256 to catch exact duplicates.
  const byHash = new Map();
  for (const file of files) {
    if (file.size === 0 || file.allZero) continue;
    const list = byHash.get(file.sha256) ?? [];
    list.push(file);
    byHash.set(file.sha256, list);
  }

  for (const group of byHash.values()) {
    if (group.length < 2) continue;
    const primary = group[0];
    for (let i = 1; i < group.length; i++) {
      const dup = group[i];
      const msg = `Exact duplicate of ${primary.path} (SHA-256 ${dup.sha256.slice(0, 12)})`;
      dup.findings.push({ code: 'duplicate', details: msg });
      dup.issues.push('duplicate');
      dup.details = dup.details ? `${dup.details} | ${msg}` : msg;
    }
  }

  const countsByIssue = Object.fromEntries(ISSUE_ORDER.map((code) => [code, 0]));
  const groupsMap = new Map(ISSUE_ORDER.map((code) => [code, []]));

  let healthyCount = 0;
  let flaggedCount = 0;

  for (const file of files) {
    if (file.findings.length === 0) {
      healthyCount++;
    } else {
      flaggedCount++;
      for (const finding of file.findings) {
        countsByIssue[finding.code]++;
        groupsMap.get(finding.code).push({
          path: file.path,
          size: file.size,
          detectedType: file.detectedType,
          sha256: file.sha256,
          details: finding.details,
        });
      }
    }
  }

  const groups = ISSUE_ORDER.map((code) => ({
    ...ISSUE_META[code],
    items: groupsMap.get(code),
  })).filter((g) => g.items.length > 0);

  return {
    scannedDir: absRoot,
    totalFiles: files.length,
    totalBytes,
    healthyCount,
    flaggedCount,
    countsByIssue,
    files,
    groups,
  };
}
