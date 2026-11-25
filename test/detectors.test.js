import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMagicType,
  isAllZeroBuffer,
  checkCloudPlaceholder,
  checkPasswordProtected,
  checkTruncation,
  checkPathAndName,
  analyzeSingleFile,
} from '../src/detectors.js';
import {
  makeValidPdf,
  makeValidZip,
  makeValidDocx,
  makeValidJpeg,
  makeValidPng,
  makeEncryptedOoxml,
} from '../src/sample.js';

test('detectMagicType identifies binary signatures and text headers', () => {
  assert.equal(detectMagicType(Buffer.alloc(0)), 'unknown');
  assert.equal(detectMagicType(makeValidPdf('Sample', 'Body')), 'pdf');
  assert.equal(detectMagicType(makeValidPng('Sample')), 'png');
  assert.equal(detectMagicType(makeValidJpeg('Sample')), 'jpeg');
  assert.equal(detectMagicType(Buffer.from('GIF89a\x01\x00\x01\x00')), 'gif');
  assert.equal(detectMagicType(Buffer.from('GIF87a\x01\x00')), 'gif');
  assert.equal(detectMagicType(makeValidDocx('Sample')), 'zip');
  assert.equal(detectMagicType(Buffer.from([0x50, 0x4b, 0x05, 0x06, 0, 0])), 'zip');
  assert.equal(detectMagicType(makeEncryptedOoxml('Sample')), 'ole2');
  assert.equal(detectMagicType(Buffer.from('{\\rtf1\\ansi Hello}')), 'rtf');
  assert.equal(detectMagicType(Buffer.from('\uFEFF  <!DOCTYPE html><html></html>')), 'html');
  assert.equal(detectMagicType(Buffer.from('<html><body>hi</body></html>')), 'html');
  assert.equal(detectMagicType(Buffer.from('<?xml version="1.0"?><root/>')), 'xml');
  assert.equal(detectMagicType(Buffer.from('plain text notes')), 'unknown');
});

test('isAllZeroBuffer flags only non-empty buffers containing exclusively 0x00', () => {
  assert.equal(isAllZeroBuffer(Buffer.alloc(0)), false);
  assert.equal(isAllZeroBuffer(Buffer.alloc(1)), true);
  assert.equal(isAllZeroBuffer(Buffer.alloc(4096, 0)), true);

  const almostZero = Buffer.alloc(4096, 0);
  almostZero[almostZero.length - 1] = 1;
  assert.equal(isAllZeroBuffer(almostZero), false);
});

test('analyzeSingleFile handles zero_byte and all_zero_bytes without spurious overlaps', () => {
  const zeroRes = analyzeSingleFile({
    relPath: 'docs/empty.pdf',
    fullPath: 'C:/scan/docs/empty.pdf',
    size: 0,
    allZero: false,
    headBuf: Buffer.alloc(0),
    tailBuf: Buffer.alloc(0),
    scanBuf: Buffer.alloc(0),
  });
  assert.deepEqual(zeroRes.findings.map((f) => f.code), ['zero_byte']);

  const blankBuf = Buffer.alloc(2048, 0);
  const allZeroRes = analyzeSingleFile({
    relPath: 'docs/blank.xlsx',
    fullPath: 'C:/scan/docs/blank.xlsx',
    size: blankBuf.length,
    allZero: true,
    headBuf: blankBuf,
    tailBuf: blankBuf,
    scanBuf: blankBuf,
  });
  assert.deepEqual(allZeroRes.findings.map((f) => f.code), ['all_zero_bytes']);
});

test('extension_mismatch detects mismatched headers and ignores encrypted OLE2 OOXML', () => {
  const htmlBuf = Buffer.from('<!DOCTYPE html><html><body>Login required</body></html>'.padEnd(600, ' '));
  const docxMismatch = analyzeSingleFile({
    relPath: 'report.docx',
    fullPath: 'C:/scan/report.docx',
    size: htmlBuf.length,
    allZero: false,
    headBuf: htmlBuf,
    tailBuf: htmlBuf,
    scanBuf: htmlBuf,
  });
  assert.deepEqual(docxMismatch.findings.map((f) => f.code), ['extension_mismatch']);

  const pdfInJpg = makeValidPdf('Not a photo', 'PDF bytes saved as .jpg');
  const jpgMismatch = analyzeSingleFile({
    relPath: 'photo.jpg',
    fullPath: 'C:/scan/photo.jpg',
    size: pdfInJpg.length,
    allZero: false,
    headBuf: pdfInJpg,
    tailBuf: pdfInJpg,
    scanBuf: pdfInJpg,
  });
  assert.deepEqual(jpgMismatch.findings.map((f) => f.code), ['extension_mismatch']);

  const jpegInPng = makeValidJpeg('jpeg-in-png');
  const pngMismatch = analyzeSingleFile({
    relPath: 'banner.png',
    fullPath: 'C:/scan/banner.png',
    size: jpegInPng.length,
    allZero: false,
    headBuf: jpegInPng,
    tailBuf: jpegInPng,
    scanBuf: jpegInPng,
  });
  assert.deepEqual(pngMismatch.findings.map((f) => f.code), ['extension_mismatch']);

  const encXlsx = makeEncryptedOoxml('secret-sheet');
  const encRes = analyzeSingleFile({
    relPath: 'secret.xlsx',
    fullPath: 'C:/scan/secret.xlsx',
    size: encXlsx.length,
    allZero: false,
    headBuf: encXlsx,
    tailBuf: encXlsx,
    scanBuf: encXlsx,
  });
  assert.deepEqual(encRes.findings.map((f) => f.code), ['password_protected']);
});

test('checkTruncation validates complete vs truncated ZIP/DOCX, PDF, JPEG, and PNG files', () => {
  const docx = makeValidDocx('ok-docx');
  assert.equal(checkTruncation('.docx', docx, docx, docx.length).detected, false);
  const cutDocx = docx.subarray(0, docx.length - 40);
  assert.equal(checkTruncation('.docx', cutDocx, cutDocx, cutDocx.length).detected, true);

  const pdf = makeValidPdf('OK PDF', 'Complete PDF document');
  assert.equal(checkTruncation('.pdf', pdf, pdf, pdf.length).detected, false);
  const cutPdf = pdf.subarray(0, pdf.length - 30);
  assert.equal(checkTruncation('.pdf', cutPdf, cutPdf, cutPdf.length).detected, true);

  const jpg = makeValidJpeg('ok-jpg');
  assert.equal(checkTruncation('.jpg', jpg, jpg, jpg.length).detected, false);
  const cutJpg = jpg.subarray(0, jpg.length - 10);
  assert.equal(checkTruncation('.jpg', cutJpg, cutJpg, cutJpg.length).detected, true);

  // Phones and cameras often store extra data after the end-of-image marker.
  const withTrailer = Buffer.concat([jpg, Buffer.alloc(40 * 1024, 0x41)]);
  assert.equal(checkTruncation('.jpg', withTrailer, withTrailer, withTrailer.length).detected, false,
    'trailing metadata after FFD9 is not truncation');
  const farTail = Buffer.alloc(64 * 1024, 0x41);
  assert.equal(checkTruncation('.jpg', jpg, farTail, jpg.length + farTail.length, { jpegVideoAfterEoi: true }).detected, false,
    'motion photo: MP4 clip after FFD9');
  const seft = Buffer.concat([farTail, Buffer.from('SEFT')]);
  assert.equal(checkTruncation('.jpg', jpg, seft, jpg.length + seft.length).detected, false,
    'Samsung SEFT trailer');
  assert.equal(checkTruncation('.jpg', jpg, farTail, jpg.length + farTail.length).detected, true,
    'no marker and no known trailer is still truncation');

  const png = makeValidPng('ok-png');
  assert.equal(checkTruncation('.png', png, png, png.length).detected, false);
  const cutPng = png.subarray(0, png.length - 12);
  assert.equal(checkTruncation('.png', cutPng, cutPng, cutPng.length).detected, true);
});

test('checkCloudPlaceholder catches stub extensions and small cloud stubs without false positives', () => {
  for (const ext of ['.icloud', '.url', '.webloc', '.gdoc', '.gsheet', '.gslides', '.dropbox']) {
    const res = checkCloudPlaceholder(ext, 80, Buffer.from('stub'));
    assert.equal(res.detected, true, `expected ${ext} to flag`);
  }

  const smallStub = Buffer.from('OneDrive placeholder: sync pending');
  assert.equal(checkCloudPlaceholder('.pdf', smallStub.length, smallStub).detected, true);

  const healthyPdf = makeValidPdf('Healthy', 'Full content');
  assert.equal(checkCloudPlaceholder('.pdf', healthyPdf.length, healthyPdf).detected, false);

  const healthyDocx = makeValidDocx('healthy');
  assert.equal(checkCloudPlaceholder('.docx', healthyDocx.length, healthyDocx).detected, false);
});

test('checkPasswordProtected detects encrypted PDFs, OLE2 Office files, and ZIP flags', () => {
  const encPdf = makeValidPdf('Locked', 'Secret', { encrypted: true });
  assert.equal(checkPasswordProtected('.pdf', encPdf, encPdf).detected, true);

  const plainPdf = makeValidPdf('Open', 'Public');
  assert.equal(checkPasswordProtected('.pdf', plainPdf, plainPdf).detected, false);

  const encXlsx = makeEncryptedOoxml('payroll');
  assert.equal(checkPasswordProtected('.xlsx', encXlsx, encXlsx).detected, true);

  const encZip = makeValidZip([{ name: 'note.txt', data: 'encrypted-bytes' }], { encrypted: true });
  assert.equal(checkPasswordProtected('.zip', encZip, encZip).detected, true);

  const plainZip = makeValidZip([{ name: 'note.txt', data: 'plain-bytes' }], { encrypted: false });
  assert.equal(checkPasswordProtected('.zip', plainZip, plainZip).detected, false);
});

test('checkPathAndName checks 260-character threshold accurately', () => {
  const exact260 = 'a/'.repeat(125) + '1234567890'; // 250 + 10 = 260
  assert.equal(exact260.length, 260);
  assert.deepEqual(checkPathAndName(exact260, exact260), []);

  const len261 = `${exact260}x`;
  assert.equal(len261.length, 261);
  assert.deepEqual(
    checkPathAndName(len261, len261).map((i) => i.code),
    ['path_too_long'],
  );

  const shortRelLongFull = checkPathAndName('docs/file.pdf', 'C:/' + 'x'.repeat(258));
  assert.deepEqual(
    shortRelLongFull.map((i) => i.code),
    ['path_too_long'],
  );
});

test('checkPathAndName detects Windows-rejected characters, reserved device names, and trailing dot/space', () => {
  const badNames = [
    'folder/file<1>.txt',
    'folder/file>1.txt',
    'folder/q1:summary.pdf',
    'folder/"quoted".docx',
    'folder/a|b.xlsx',
    'folder/what?.pdf',
    'folder/star*.png',
    'folder/ctrl\x01char.txt',
    'folder/CON.txt',
    'folder/aux.pdf',
    'folder/NUL',
    'folder/COM1.docx',
    'folder/lpt9.xlsx',
    'folder/notes.',
    'folder/draft ',
    'bad:dir/clean.txt',
  ];

  for (const name of badNames) {
    const found = checkPathAndName(name, `C:/root/${name}`).map((i) => i.code);
    assert.ok(found.includes('invalid_windows_name'), `expected invalid_windows_name for ${JSON.stringify(name)}`);
  }

  const goodNames = [
    'client-proposals/2026-q1-birchwood-bakery-proposal.pdf',
    'photos/.workshop-raw-album.icloud',
    'archive/CONFERENCE-notes.txt',
  ];
  for (const name of goodNames) {
    assert.deepEqual(checkPathAndName(name, `C:/root/${name}`), [], `expected clean path for ${name}`);
  }
});
