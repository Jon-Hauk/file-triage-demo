import zlib from 'node:zlib';

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function escapePdfText(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Build a minimal, syntactically valid PDF 1.4 file (>600 bytes).
 */
export function makeValidPdf(title, body, { encrypted = false } = {}) {
  const safeLine1 = escapePdfText(`Alder & Pine Studio - ${title}`);
  const safeLine2 = escapePdfText(body.padEnd(320, ' '));
  const streamContent = `BT\n/F1 12 Tf\n72 720 Td\n(${safeLine1}) Tj\n0 -20 Td\n(${safeLine2}) Tj\nET\n`;

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'latin1')} >>\nstream\n${streamContent}endstream\nendobj\n`,
  ];

  if (encrypted) {
    const padHex = '0'.repeat(64);
    objects.push(
      `5 0 obj\n<< /Filter /Standard /V 2 /R 3 /Length 128 /P -4 /O <${padHex}> /U <${padHex}> >>\nendobj\n`,
    );
  }

  const parts = ['%PDF-1.4\n'];
  const offsets = [0];
  let cursor = Buffer.byteLength(parts[0], 'latin1');

  for (const obj of objects) {
    offsets.push(cursor);
    parts.push(obj);
    cursor += Buffer.byteLength(obj, 'latin1');
  }

  const xrefOffset = cursor;
  const xrefLines = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`];
  for (let i = 1; i < offsets.length; i++) {
    xrefLines.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }

  const encryptEntry = encrypted ? ' /Encrypt 5 0 R' : '';
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${encryptEntry} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  parts.push(xrefLines.join(''), trailer);
  return Buffer.from(parts.join(''), 'latin1');
}

/**
 * Pure-JS store-mode ZIP builder with CRC32 and valid EOCD record.
 */
export function makeValidZip(entries, { encrypted = false } = {}) {
  const DOS_TIME = 0x4800;
  const DOS_DATE = 0x5a21;
  const flags = encrypted ? 0x0001 : 0x0000;

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const crc = crc32(dataBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += 30 + nameBuf.length + dataBuf.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

export function makeValidDocx(tag) {
  const padded = `Alder & Pine synthetic Word document: ${tag}`.padEnd(450, ' ');
  return makeValidZip([
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    },
    {
      name: 'word/document.xml',
      data: `<?xml version="1.0" encoding="UTF-8"?><w:document><w:body><w:p><w:r><w:t>${padded}</w:t></w:r></w:p></w:body></w:document>`,
    },
  ]);
}

export function makeValidXlsx(tag) {
  const padded = `Alder & Pine synthetic Excel workbook: ${tag}`.padEnd(450, ' ');
  return makeValidZip([
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8"?><workbook><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/></sheets><!-- ${padded} --></workbook>`,
    },
  ]);
}

export function makeValidPptx(tag) {
  const padded = `Alder & Pine synthetic PowerPoint deck: ${tag}`.padEnd(450, ' ');
  return makeValidZip([
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    },
    {
      name: 'ppt/presentation.xml',
      data: `<?xml version="1.0" encoding="UTF-8"?><p:presentation><!-- ${padded} --></p:presentation>`,
    },
  ]);
}

/**
 * Build a minimal JFIF JPEG (>600 bytes) with valid SOI and EOI markers.
 */
export function makeValidJpeg(tag) {
  const soi = Buffer.from([0xff, 0xd8]);
  const app0 = Buffer.from([
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  const commentText = `Alder & Pine synthetic JPEG: ${tag}`.padEnd(420, ' ');
  const commentData = Buffer.from(commentText, 'ascii');
  const comHeader = Buffer.alloc(4);
  comHeader[0] = 0xff;
  comHeader[1] = 0xfe;
  comHeader.writeUInt16BE(commentData.length + 2, 2);

  // Entropy-safe payload (bytes strictly < 0xff so no spurious FFD9 markers occur before EOI).
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);
  const scanData = Buffer.alloc(240, 0x42);
  const eoi = Buffer.from([0xff, 0xd9]);

  return Buffer.concat([soi, app0, comHeader, commentData, sos, scanData, eoi]);
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Build a valid 1x1 RGB PNG (>600 bytes) with valid signature, IDAT, and IEND.
 */
export function makeValidPng(tag) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0);
  ihdrData.writeUInt32BE(1, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // RGB

  const commentPayload = Buffer.from(`Comment\0Alder & Pine synthetic PNG: ${tag}`.padEnd(550, ' '), 'ascii');
  const idatPayload = zlib.deflateSync(Buffer.from([0x00, 0x3a, 0x6b, 0x4c]));

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdrData),
    pngChunk('tEXt', commentPayload),
    pngChunk('IDAT', idatPayload),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Build an OLE2 wrapper holding UTF-16LE EncryptionInfo / EncryptedPackage markers.
 */
export function makeEncryptedOoxml(tag) {
  const buf = Buffer.alloc(2048, 0);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(buf, 0);
  Buffer.from('Root Entry', 'utf16le').copy(buf, 512);
  Buffer.from('EncryptionInfo', 'utf16le').copy(buf, 640);
  Buffer.from('EncryptedPackage', 'utf16le').copy(buf, 768);
  Buffer.from(`Alder & Pine encrypted payload: ${tag}`, 'utf8').copy(buf, 1024);
  return buf;
}

function makeHtmlErrorPage(title) {
  return Buffer.from(
    `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
  <h1>Sign in required</h1>
  <p>Your portal session expired while downloading this file for Alder &amp; Pine Studio. Please sign in again and retry the download.</p>
  <p>${' '.repeat(420)}</p>
</body>
</html>
`,
    'utf8',
  );
}

/**
 * Build the deterministic 60-file synthetic sample manifest and ground truth.
 */
export function buildSampleManifest() {
  const entries = [];
  const byPath = new Map();

  const add = (relPath, data, expectedIssues = []) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const item = { path: relPath, data: buf, expectedIssues };
    entries.push(item);
    byPath.set(relPath, item);
  };

  // --- 36 healthy files ---
  add('client-proposals/2026-q1-birchwood-bakery-proposal.pdf', makeValidPdf('Birchwood Bakery Q1 Proposal', 'Synthetic proposal summary for Birchwood Bakery storefront signage and menu print run.'));
  add('client-proposals/2026-q1-birchwood-scope.docx', makeValidDocx('2026-q1-birchwood-scope'));
  add('client-proposals/2026-q2-cedar-ridge-dental-estimate.xlsx', makeValidXlsx('2026-q2-cedar-ridge-dental-estimate'));
  add('client-proposals/2026-q2-cedar-ridge-kickoff-deck.pptx', makeValidPptx('2026-q2-cedar-ridge-kickoff-deck'));
  add('client-proposals/2026-q2-harborline-hardware-retainer.pdf', makeValidPdf('Harborline Hardware Retainer', 'Quarterly design and catalog update retainer terms for Harborline Hardware.'));
  add('client-proposals/2026-q3-clearwater-roasters-brief.docx', makeValidDocx('2026-q3-clearwater-roasters-brief'));
  add('client-proposals/2026-q3-larkspur-print-specs.pdf', makeValidPdf('Larkspur Print Specifications', 'Paper weights, trim sizes, and ink profiles for Q3 seasonal mailer campaign.'));
  add('client-proposals/proposal-checklist.txt', 'Alder & Pine Proposal Review Checklist\n1. Confirm client scope\n2. Verify pricing table\n3. Export signed PDF\n');

  add('finance/2026-08-bank-reconciliation.xlsx', makeValidXlsx('2026-08-bank-reconciliation'));
  add('finance/2026-09-ap-aging-summary.csv', 'Vendor,Current,30Days,60Days\nLarkspur Print,1240.00,0.00,0.00\nClearwater Roasters,380.50,0.00,0.00\n');
  add('finance/2026-09-expense-receipts.pdf', makeValidPdf('September 2026 Expense Receipts', 'Compiled synthetic receipts for studio supplies, postage, and print proofs.'));
  add('finance/2026-10-cashflow-forecast.xlsx', makeValidXlsx('2026-10-cashflow-forecast'));
  add('finance/2026-10-vendor-payments.csv', 'Date,Vendor,Amount\n2026-10-03,Larkspur Print,845.00\n2026-10-12,Harborline Hardware,192.40\n');
  add('finance/2026-q3-tax-prep-notes.docx', makeValidDocx('2026-q3-tax-prep-notes'));
  add('finance/chart-of-accounts.xlsx', makeValidXlsx('chart-of-accounts'));
  add('finance/payroll-schedule-2026.pdf', makeValidPdf('2026 Payroll Schedule', 'Biweekly payroll calendar and holiday cutoff dates for Alder & Pine Studio.'));

  add('photos/booth-banner-proof.png', makeValidPng('booth-banner-proof'));
  add('photos/office-lobby-east.jpg', makeValidJpeg('office-lobby-east'));
  add('photos/office-lobby-west.jpg', makeValidJpeg('office-lobby-west'));
  add('photos/product-packaging-front.png', makeValidPng('product-packaging-front'));
  add('photos/product-packaging-side.png', makeValidPng('product-packaging-side'));
  add('photos/storefront-signage-day.jpg', makeValidJpeg('storefront-signage-day'));
  add('photos/team-workshop-table.jpg', makeValidJpeg('team-workshop-table'));
  add('photos/warehouse-rack-layout.png', makeValidPng('warehouse-rack-layout'));

  add('hr-templates/contractor-onboarding-guide.pdf', makeValidPdf('Contractor Onboarding Guide', 'Synthetic onboarding steps, invoice format, and studio hours overview.'));
  add('hr-templates/equipment-checkout-form.docx', makeValidDocx('equipment-checkout-form'));
  add('hr-templates/holiday-calendar-2026.pdf', makeValidPdf('2026 Studio Holiday Calendar', 'Observed public holidays and year-end studio closure dates for 2026.'));
  add('hr-templates/onboarding-slides.pptx', makeValidPptx('onboarding-slides'));
  add('hr-templates/pto-request-tracker.xlsx', makeValidXlsx('pto-request-tracker'));
  add('hr-templates/safety-handbook-v2.docx', makeValidDocx('safety-handbook-v2'));

  add('archive/2025-annual-summary.pdf', makeValidPdf('2025 Annual Summary', 'Year-end project count and synthetic revenue overview for Alder & Pine Studio.'));
  add('archive/2025-asset-register.xlsx', makeValidXlsx('2025-asset-register'));
  add('archive/2025-brand-palette.png', makeValidPng('2025-brand-palette'));
  add('archive/2025-office-lease-scan.pdf', makeValidPdf('2025 Office Lease Scan', 'Synthetic office suite lease summary for Unit 4B, Alder & Pine Studio.'));
  add('archive/2025-vendor-contacts.csv', 'Vendor,Contact,Email\nLarkspur Print,Sam Patel,orders@larkspur.example\nHarborline Hardware,Lee Ortiz,sales@harborline.example\n');
  add('archive/legacy-readme.txt', 'Archive folder containing closed 2025 project deliverables for Alder & Pine Studio.\n');

  // --- 4 extension_mismatch files ---
  add('client-proposals/meadowbrook-clinic-sow.docx', makeHtmlErrorPage('Portal Sign-In - Statement of Work'), ['extension_mismatch']);
  add('photos/trade-show-badge-photo.jpg', makeValidPdf('Trade Show Badge Proof', 'Actually a PDF proof saved with a .jpg extension from an email attachment.'), ['extension_mismatch']);
  add('finance/2026-10-merchant-statement.pdf', makeHtmlErrorPage('Session Expired - Merchant Portal'), ['extension_mismatch']);
  add('photos/catalog-hero-banner.png', makeValidJpeg('catalog-hero-banner-jpeg-in-png'), ['extension_mismatch']);

  // --- 3 zero_byte files ---
  add('client-proposals/2026-q3-harborline-addendum.docx', Buffer.alloc(0), ['zero_byte']);
  add('finance/2026-10-reimbursement-scan.pdf', Buffer.alloc(0), ['zero_byte']);
  add('photos/storefront-signage-night.jpg', Buffer.alloc(0), ['zero_byte']);

  // --- 2 all_zero_bytes files ---
  add('finance/2026-09-payroll-register.xlsx', Buffer.alloc(8192, 0), ['all_zero_bytes']);
  add('archive/2025-q4-backup-export.zip', Buffer.alloc(4096, 0), ['all_zero_bytes']);

  // --- 4 truncated_file files ---
  const fullDocx = makeValidDocx('truncated-birchwood-contract');
  add('client-proposals/2026-q2-birchwood-contract.docx', fullDocx.subarray(0, fullDocx.length - 120), ['truncated_file']);

  const fullPdf = makeValidPdf('October Invoice Batch', 'Synthetic invoice batch cut off mid-transfer before the closing trailer.');
  add('finance/2026-10-invoice-batch.pdf', fullPdf.subarray(0, fullPdf.length - 150), ['truncated_file']);

  const fullJpeg = makeValidJpeg('truncated-event-stage-wide');
  add('photos/event-stage-wide.jpg', fullJpeg.subarray(0, fullJpeg.length - 80), ['truncated_file']);

  const fullPng = makeValidPng('truncated-logo-print-master');
  add('photos/logo-print-master.png', fullPng.subarray(0, fullPng.length - 40), ['truncated_file']);

  // --- 4 cloud_placeholder files ---
  add(
    'photos/.workshop-raw-album.icloud',
    '<?xml version="1.0" encoding="UTF-8"?><plist><dict><key>NSURLNameKey</key><string>workshop-raw-album.zip</string></dict></plist>\n',
    ['cloud_placeholder'],
  );
  add(
    'client-proposals/shared-client-folder.url',
    '[InternetShortcut]\r\nURL=https://cloud.alderpine.example/shared/client-proposals\r\n',
    ['cloud_placeholder'],
  );
  add(
    'finance/2026-budget-live.gsheet',
    '{"doc_id":"synthetic-gsheet-alderpine-2026","email":"finance@alderpine.example"}\n',
    ['cloud_placeholder'],
  );
  add(
    'hr-templates/benefits-enrollment-2026.pdf',
    'OneDrive Files On-Demand placeholder: file contents remain in cloud-only storage.',
    ['cloud_placeholder'],
  );

  // --- 2 password_protected files ---
  add('finance/2026-executive-comp-model.xlsx', makeEncryptedOoxml('2026-executive-comp-model'), ['password_protected']);
  add('hr-templates/signed-background-consent.pdf', makeValidPdf('Signed Background Consent', 'Encrypted PDF payload.', { encrypted: true }), ['password_protected']);

  // --- 2 path_too_long files (relative path > 260 chars) ---
  const longPdfPath =
    'archive/2025-client-deliverables-backup/regional-operations-north/quarterly-project-archive-folders/birchwood-bakery-rebrand-project-files/final-print-production-assets-approved-by-marketing-director/2025-11-approved-vendor-pack/birchwood-print-order-summary-final-signed.pdf';
  const longXlsxPath =
    'archive/2025-client-deliverables-backup/regional-operations-south/quarterly-project-archive-folders/cedar-ridge-dental-office-expansion/financial-tracking-workbooks-and-contractor-bids-folder/2025-12-approved-budget-workbooks/cedar-ridge-contractor-cost-breakdown.xlsx';

  add(longPdfPath, makeValidPdf('Birchwood Print Order Summary', 'Healthy PDF nested past 260 characters.'), ['path_too_long']);
  add(longXlsxPath, makeValidXlsx('cedar-ridge-contractor-cost-breakdown'), ['path_too_long']);

  // --- 3 duplicate files (sorted after original healthy files) ---
  add(
    'unsorted-duplicates/2026-q1-birchwood-bakery-proposal-copy.pdf',
    byPath.get('client-proposals/2026-q1-birchwood-bakery-proposal.pdf').data,
    ['duplicate'],
  );
  add(
    'unsorted-duplicates/2026-10-cashflow-forecast-copy.xlsx',
    byPath.get('finance/2026-10-cashflow-forecast.xlsx').data,
    ['duplicate'],
  );
  add(
    'unsorted-duplicates/office-lobby-east-copy.jpg',
    byPath.get('photos/office-lobby-east.jpg').data,
    ['duplicate'],
  );

  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}
