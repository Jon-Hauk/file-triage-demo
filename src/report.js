import fs from 'node:fs';
import path from 'node:path';
import { ISSUE_META } from './detectors.js';

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function displayFolder(scannedDir) {
  const rel = path.relative(process.cwd(), scannedDir).replace(/\\/g, '/');
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel;
  return path.basename(scannedDir) || scannedDir;
}

function mdCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function csvCell(value) {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Render a client-ready Markdown triage report grouped by problem type.
 */
export function renderMarkdown(result) {
  const folderLabel = displayFolder(result.scannedDir);
  const lines = [
    '# File Triage Report',
    '',
    `Read-only scan of \`${folderLabel}\`. No files were moved, renamed, modified, or deleted.`,
    '',
    '## Summary',
    '',
    '| Metric | Count |',
    '|---|---|',
    `| Files scanned | ${result.totalFiles} |`,
    `| Healthy files (no issues found) | ${result.healthyCount} |`,
    `| Files needing attention | ${result.flaggedCount} |`,
    `| Total data size | ${formatBytes(result.totalBytes)} |`,
    '',
  ];

  if (result.groups.length === 0) {
    lines.push('No problems were detected in the scanned folder.');
    lines.push('');
  } else {
    lines.push('### Problem breakdown');
    lines.push('');
    lines.push('| Problem group | Files |');
    lines.push('|---|---|');
    for (const group of result.groups) {
      lines.push(`| ${mdCell(group.title)} | ${group.items.length} |`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const group of result.groups) {
      const noun = group.items.length === 1 ? 'file' : 'files';
      lines.push(`## ${group.title} (${group.items.length} ${noun})`);
      lines.push('');
      lines.push(`- **Likely cause:** ${group.likelyCause}`);
      lines.push(`- **Safe next step:** ${group.safeNextStep}`);
      lines.push('');
      lines.push('| File | Size | What the scan saw |');
      lines.push('|---|---|---|');
      for (const item of group.items) {
        lines.push(`| \`${mdCell(item.path)}\` | ${formatBytes(item.size)} | ${mdCell(item.details)} |`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('See `triage-report.csv` for the complete file-by-file inventory (including healthy files and SHA-256 hashes).');
  lines.push('');

  return lines.join('\n');
}

/**
 * Render a self-contained HTML triage report suitable for sharing with a client.
 */
export function renderHtml(result) {
  const folderLabel = displayFolder(result.scannedDir);

  const summaryRows = result.groups
    .map(
      (g) => `          <tr>
            <td><a href="#issue-${escapeHtml(g.code)}">${escapeHtml(g.title)}</a></td>
            <td class="num">${g.items.length}</td>
          </tr>`,
    )
    .join('\n');

  const groupSections =
    result.groups.length === 0
      ? '<section class="card"><p>No problems were detected in the scanned folder.</p></section>'
      : result.groups
          .map((g) => {
            const noun = g.items.length === 1 ? 'file' : 'files';
            const rows = g.items
              .map(
                (item) => `            <tr>
              <td class="mono path-cell">${escapeHtml(item.path)}</td>
              <td class="num nowrap">${escapeHtml(formatBytes(item.size))}</td>
              <td>${escapeHtml(item.details)}</td>
            </tr>`,
              )
              .join('\n');

            return `      <section class="card group" id="issue-${escapeHtml(g.code)}">
        <div class="group-head">
          <h2>${escapeHtml(g.title)}</h2>
          <span class="badge">${g.items.length} ${noun}</span>
        </div>
        <div class="guidance">
          <p><strong>Likely cause:</strong> ${escapeHtml(g.likelyCause)}</p>
          <p><strong>Safe next step:</strong> ${escapeHtml(g.safeNextStep)}</p>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th class="num">Size</th>
                <th>What the scan saw</th>
              </tr>
            </thead>
            <tbody>
${rows}
            </tbody>
          </table>
        </div>
      </section>`;
          })
          .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>File Triage Report</title>
  <style>
    :root {
      --bg: #f6f7f9;
      --surface: #ffffff;
      --border: #dfe3ea;
      --text: #1b2430;
      --muted: #5a6577;
      --accent: #1d4ed8;
      --warn-bg: #fff8eb;
      --warn-border: #f59e0b;
      --ok: #15803d;
      --flag: #b45309;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 2rem 1rem;
    }
    main { max-width: 1040px; margin: 0 auto; }
    header { margin-bottom: 1.5rem; }
    h1 { margin: 0 0 0.35rem 0; font-size: 1.75rem; }
    h2 { margin: 0; font-size: 1.15rem; }
    .subtitle { margin: 0; color: var(--muted); }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.9rem;
      margin-bottom: 1.5rem;
    }
    .kpi {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem 1.1rem;
    }
    .kpi .label { font-size: 0.85rem; color: var(--muted); }
    .kpi .value { font-size: 1.6rem; font-weight: 700; margin-top: 0.2rem; }
    .kpi .value.ok { color: var(--ok); }
    .kpi .value.flag { color: var(--flag); }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
    }
    .group-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.85rem;
    }
    .badge {
      background: #eef2ff;
      color: var(--accent);
      font-weight: 600;
      font-size: 0.85rem;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      white-space: nowrap;
    }
    .guidance {
      background: var(--warn-bg);
      border-left: 4px solid var(--warn-border);
      padding: 0.75rem 1rem;
      border-radius: 4px;
      margin-bottom: 1rem;
    }
    .guidance p { margin: 0.25rem 0; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    th, td {
      text-align: left;
      padding: 0.55rem 0.65rem;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th { font-weight: 600; color: var(--muted); background: #fafbfc; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .nowrap { white-space: nowrap; }
    .mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.84rem; }
    .path-cell { overflow-wrap: anywhere; max-width: 360px; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    footer { color: var(--muted); font-size: 0.88rem; margin-top: 1.5rem; }
    @media print {
      body { background: #fff; padding: 0; }
      .card, .kpi { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>File Triage Report</h1>
      <p class="subtitle">Read-only scan of <code>${escapeHtml(folderLabel)}</code>. No files were moved, renamed, modified, or deleted.</p>
    </header>

    <section class="kpis">
      <div class="kpi">
        <div class="label">Files scanned</div>
        <div class="value">${result.totalFiles}</div>
      </div>
      <div class="kpi">
        <div class="label">Healthy files</div>
        <div class="value ok">${result.healthyCount}</div>
      </div>
      <div class="kpi">
        <div class="label">Files needing attention</div>
        <div class="value flag">${result.flaggedCount}</div>
      </div>
      <div class="kpi">
        <div class="label">Total data size</div>
        <div class="value">${escapeHtml(formatBytes(result.totalBytes))}</div>
      </div>
    </section>

    <section class="card">
      <h2 style="margin-bottom: 0.75rem;">Problem breakdown</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Problem group</th>
              <th class="num">Files</th>
            </tr>
          </thead>
          <tbody>
${summaryRows}
          </tbody>
        </table>
      </div>
    </section>

${groupSections}

    <footer>
      Full file-by-file inventory (including healthy files and SHA-256 hashes) is written to <code>triage-report.csv</code>.
    </footer>
  </main>
</body>
</html>
`;
}

/**
 * Render an RFC 4180 CSV inventory of every scanned file.
 */
export function renderCsv(result) {
  const header = [
    'path',
    'status',
    'issues',
    'size_bytes',
    'detected_type',
    'sha256',
    'details',
    'likely_cause',
    'safe_next_step',
  ];

  const rows = [header.map(csvCell).join(',')];

  for (const file of result.files) {
    const isFlagged = file.findings.length > 0;
    const issues = file.issues.join('; ');
    const likelyCause = file.findings.map((f) => ISSUE_META[f.code].likelyCause).join(' | ');
    const safeNextStep = file.findings.map((f) => ISSUE_META[f.code].safeNextStep).join(' | ');

    rows.push(
      [
        file.path,
        isFlagged ? 'flagged' : 'ok',
        issues,
        file.size,
        file.detectedType,
        file.sha256,
        file.details,
        likelyCause,
        safeNextStep,
      ]
        .map(csvCell)
        .join(','),
    );
  }

  return `${rows.join('\r\n')}\r\n`;
}

/**
 * Write Markdown, HTML, and CSV triage reports to outDir.
 */
export function writeReports(result, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const mdPath = path.join(outDir, 'triage-report.md');
  const htmlPath = path.join(outDir, 'triage-report.html');
  const csvPath = path.join(outDir, 'triage-report.csv');

  fs.writeFileSync(mdPath, renderMarkdown(result), 'utf8');
  fs.writeFileSync(htmlPath, renderHtml(result), 'utf8');
  fs.writeFileSync(csvPath, renderCsv(result), 'utf8');

  return { mdPath, htmlPath, csvPath };
}
