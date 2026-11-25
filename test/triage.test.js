import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateSample } from '../src/generate.js';
import { scanDirectory } from '../src/scanner.js';
import { renderMarkdown, renderHtml, renderCsv } from '../src/report.js';

function snapshotTree(rootDir) {
  const records = [];
  function walk(relPrefix) {
    const dirPath = path.toNamespacedPath(path.join(rootDir, relPrefix));
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const nextRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(nextRel);
      } else if (entry.isFile()) {
        const fsFile = path.toNamespacedPath(path.join(rootDir, ...nextRel.split('/')));
        const bytes = fs.readFileSync(fsFile);
        const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
        records.push({ path: nextRel, size: bytes.length, sha256 });
      }
    }
  }
  walk('');
  return records;
}

test('scanner reconciles 100% against generated truth.json with zero false positives and stays read-only', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-triage-test-'));
  const sampleDir = path.join(tmpDir, 'broken-copy');
  const truthPath = path.join(tmpDir, 'truth.json');

  try {
    const truth = generateSample(sampleDir, truthPath);
    const writtenTruth = JSON.parse(fs.readFileSync(truthPath, 'utf8'));
    assert.deepEqual(writtenTruth, truth);

    const before = snapshotTree(sampleDir);
    const result = scanDirectory(sampleDir);
    const after = snapshotTree(sampleDir);

    // Scanner must be strictly read-only on the target folder.
    assert.deepEqual(after, before);

    assert.equal(result.totalFiles, truth.totalFiles);
    assert.equal(result.healthyCount, truth.healthyCount);
    assert.equal(result.flaggedCount, truth.flaggedCount);
    assert.deepEqual(result.countsByIssue, truth.countsByIssue);

    const truthByPath = new Map(truth.files.map((f) => [f.path, f]));
    assert.equal(result.files.length, truth.files.length);

    for (const scannedFile of result.files) {
      const expected = truthByPath.get(scannedFile.path);
      assert.ok(expected, `unexpected file ${scannedFile.path}`);
      assert.equal(scannedFile.size, expected.size, `size mismatch for ${scannedFile.path}`);
      assert.deepEqual(
        scannedFile.issues,
        expected.issues,
        `issue mismatch for ${scannedFile.path}: got ${JSON.stringify(scannedFile.issues)}, expected ${JSON.stringify(expected.issues)}`,
      );
    }

    // Verify reports render accurately from scan output.
    const md = renderMarkdown(result);
    assert.match(md, /\| Files scanned \| 60 \|/);
    assert.match(md, /\| Healthy files \(no issues found\) \| 36 \|/);
    assert.match(md, /\| Files needing attention \| 24 \|/);
    for (const group of result.groups) {
      assert.ok(md.includes(group.title), `Markdown missing group ${group.title}`);
      assert.ok(md.includes(group.likelyCause), `Markdown missing likelyCause for ${group.code}`);
      assert.ok(md.includes(group.safeNextStep), `Markdown missing safeNextStep for ${group.code}`);
    }

    const html = renderHtml(result);
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('File Triage Report'));
    for (const group of result.groups) {
      assert.ok(html.includes(`id="issue-${group.code}"`), `HTML missing section ${group.code}`);
    }

    const csv = renderCsv(result);
    const csvLines = csv.trimEnd().split(/\r\n/);
    assert.equal(csvLines.length, truth.totalFiles + 1);
    assert.equal(
      csvLines[0],
      'path,status,issues,size_bytes,detected_type,sha256,details,likely_cause,safe_next_step',
    );
  } finally {
    fs.rmSync(path.toNamespacedPath(tmpDir), { recursive: true, force: true });
  }
});

test('scanner throws clear errors when target folder is missing or is a file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-triage-err-'));
  const filePath = path.join(tmpDir, 'single.txt');
  try {
    fs.writeFileSync(filePath, 'hello', 'utf8');
    assert.throws(() => scanDirectory(path.join(tmpDir, 'does-not-exist')), /Directory not found/);
    assert.throws(() => scanDirectory(filePath), /not a directory/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
