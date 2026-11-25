import path from 'node:path';

export const ISSUE_ORDER = [
  'extension_mismatch',
  'zero_byte',
  'all_zero_bytes',
  'truncated_file',
  'cloud_placeholder',
  'password_protected',
  'path_too_long',
  'invalid_windows_name',
  'duplicate',
];

export const ISSUE_META = {
  extension_mismatch: {
    code: 'extension_mismatch',
    title: 'Wrong file extension (header does not match filename)',
    likelyCause: 'A browser, portal, or script saved a web page (HTML) or a different file type under the original document or photo name.',
    safeNextStep: 'Test opening a copy with the detected file type (for example rename a copy to .html), or re-download from the original source.',
  },
  zero_byte: {
    code: 'zero_byte',
    title: 'Empty files (0 bytes)',
    likelyCause: 'The copy created the filename entry in the destination folder, then failed or was cancelled before any data was written.',
    safeNextStep: 'Recover this file from the source drive, backup, or cloud trash; a 0-byte file contains no data to repair.',
  },
  all_zero_bytes: {
    code: 'all_zero_bytes',
    title: 'Blank files (filled with zero bytes)',
    likelyCause: 'Storage space was pre-allocated during a copy or sync, then the connection dropped or the drive disconnected before contents arrived.',
    safeNextStep: 'Do not try repair tools on an all-zero file; copy it again from the original source or a prior backup.',
  },
  truncated_file: {
    code: 'truncated_file',
    title: 'Cut-off / incomplete files',
    likelyCause: 'The transfer stopped mid-stream, leaving a valid file header without its closing end-of-file structure.',
    safeNextStep: 'Re-copy from the source first. If the original is gone, work only on a copy when testing recovery tools.',
  },
  cloud_placeholder: {
    code: 'cloud_placeholder',
    title: 'Cloud placeholder stubs (not full files)',
    likelyCause: 'Only an online shortcut or cloud-sync stub (.icloud, .url, .gsheet, or Files On-Demand stub) was copied instead of the downloaded file.',
    safeNextStep: 'Open the original cloud folder on a signed-in device, mark the folder "Always keep on this device" or export offline copies, then copy again.',
  },
  password_protected: {
    code: 'password_protected',
    title: 'Password-protected / encrypted files',
    likelyCause: 'The file is intentionally encrypted with a password and was left unopened by this scan.',
    safeNextStep: 'Confirm with the file owner whether the password is known; keep the file intact and never run brute-force crackers on client files.',
  },
  path_too_long: {
    code: 'path_too_long',
    title: 'Paths over 260 characters',
    likelyCause: 'Deeply nested folders pushed the full path past the classic Windows 260-character limit, causing Explorer and older Office apps to fail to open it.',
    safeNextStep: 'Copy the parent folder to a shorter root path (for example C:\\Triage\\) or shorten intermediate folder names before opening.',
  },
  invalid_windows_name: {
    code: 'invalid_windows_name',
    title: 'Invalid Windows filenames',
    likelyCause: 'The file came from macOS, Linux, or a web archive and contains characters (< > : " | ? *), trailing spaces/dots, or reserved device names Windows rejects.',
    safeNextStep: 'Rename a copy on the source system (or via a safe bulk renamer) to remove restricted characters before opening on Windows.',
  },
  duplicate: {
    code: 'duplicate',
    title: 'Exact duplicate files',
    likelyCause: 'Repeated drag-and-drop attempts or merged backup folders left byte-for-byte identical copies in multiple places.',
    safeNextStep: 'Verify one copy opens cleanly, then archive or remove redundant duplicates only after client sign-off.',
  },
};

export const CLOUD_STUB_EXTENSIONS = new Set([
  '.icloud',
  '.url',
  '.webloc',
  '.gdoc',
  '.gsheet',
  '.gslides',
  '.dropbox',
]);

export const EXPECTED_MAGIC_BY_EXT = {
  '.pdf': ['pdf'],
  '.png': ['png'],
  '.jpg': ['jpeg'],
  '.jpeg': ['jpeg'],
  '.gif': ['gif'],
  '.docx': ['zip'],
  '.xlsx': ['zip'],
  '.pptx': ['zip'],
  '.zip': ['zip'],
  '.doc': ['ole2'],
  '.xls': ['ole2'],
  '.ppt': ['ole2'],
  '.rtf': ['rtf'],
  '.html': ['html'],
  '.htm': ['html'],
  '.xml': ['xml'],
};

const CLOUD_MARKER_RE = /\b(onedrive|sharepoint|dropbox|icloud|placeholder|reparse)\b|\[internetshortcut\]|"doc_id"|cloud-only|files on-demand/i;
const WINDOWS_ILLEGAL_CHARS_RE = /[<>:"|?*\x00-\x1f]/;
const WINDOWS_RESERVED_NAME_RE = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IEND = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);
const SAMSUNG_TRAILER = Buffer.from('SEFT', 'ascii');
const OLE2_SIG =Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ENCRYPTION_INFO_UTF16 = Buffer.from('EncryptionInfo', 'utf16le');
const ENCRYPTED_PKG_UTF16 = Buffer.from('EncryptedPackage', 'utf16le');
const ENCRYPTION_INFO_ASCII = Buffer.from('EncryptionInfo', 'ascii');
const ENCRYPTED_PKG_ASCII = Buffer.from('EncryptedPackage', 'ascii');

const OOXML_EXTENSIONS = new Set(['.docx', '.xlsx', '.pptx']);
const CLASSIC_OFFICE_EXTENSIONS = new Set(['.doc', '.xls', '.ppt']);

/**
 * Detect the underlying file type from the leading bytes of a file.
 */
export function detectMagicType(buf) {
  if (!buf || buf.length === 0) return 'unknown';

  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG)) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';

  if (buf.length >= 6) {
    const gifHdr = buf.subarray(0, 6).toString('ascii');
    if (gifHdr === 'GIF87a' || gifHdr === 'GIF89a') return 'gif';
  }

  if (
    buf.length >= 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    ((buf[2] === 0x03 && buf[3] === 0x04) ||
      (buf[2] === 0x05 && buf[3] === 0x06) ||
      (buf[2] === 0x07 && buf[3] === 0x08))
  ) {
    return 'zip';
  }

  if (buf.length >= 8 && buf.subarray(0, 8).equals(OLE2_SIG)) return 'ole2';
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '{\\rtf') return 'rtf';

  // Strip optional UTF-8 BOM and leading whitespace to recognize HTML / XML documents.
  let text = buf.subarray(0, Math.min(buf.length, 512)).toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const trimmed = text.trimStart().toLowerCase();

  if (
    trimmed.startsWith('<!doctype html') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<head') ||
    trimmed.startsWith('<body') ||
    trimmed.startsWith('<script') ||
    trimmed.startsWith('<meta')
  ) {
    return 'html';
  }
  if (trimmed.startsWith('<?xml')) return 'xml';

  return 'unknown';
}

/**
 * Return true when buffer is non-empty and consists solely of 0x00 bytes.
 */
export function isAllZeroBuffer(buf) {
  if (!buf || buf.length === 0) return false;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== 0) return false;
  }
  return true;
}

/**
 * Detect cloud placeholder stubs by extension or small stub signature.
 */
export function checkCloudPlaceholder(ext, size, headBuf) {
  const lowerExt = ext.toLowerCase();
  if (CLOUD_STUB_EXTENSIONS.has(lowerExt)) {
    return {
      detected: true,
      details: `Cloud shortcut/stub extension (${lowerExt})`,
    };
  }

  const expected = EXPECTED_MAGIC_BY_EXT[lowerExt];
  if (expected && size >= 1 && size <= 512) {
    const magic = detectMagicType(headBuf);
    if (!expected.includes(magic)) {
      const sampleText = headBuf
        .subarray(0, Math.min(headBuf.length, 512))
        .toString('utf8')
        .replace(/\u0000/g, '');
      if (CLOUD_MARKER_RE.test(sampleText)) {
        return {
          detected: true,
          details: `Small (${size} B) stub file matching cloud placeholder text instead of ${expected.join('/')} data`,
        };
      }
    }
  }

  return { detected: false, details: null };
}

function hasEncryptedZipLocalHeader(buf) {
  let pos = 0;
  while (pos + 30 <= buf.length) {
    if (buf.readUInt32LE(pos) !== 0x04034b50) break;
    const flags = buf.readUInt16LE(pos + 6);
    if ((flags & 0x0001) !== 0) return true;
    // Data descriptor flag (bit 3) defers compressed size until after payload.
    if ((flags & 0x0008) !== 0) break;
    const compSize = buf.readUInt32LE(pos + 18);
    const nameLen = buf.readUInt16LE(pos + 26);
    const extraLen = buf.readUInt16LE(pos + 28);
    const next = pos + 30 + nameLen + extraLen + compSize;
    if (next <= pos) break;
    pos = next;
  }
  return false;
}

/**
 * Flag encrypted or password-protected PDF, Office, and ZIP files without trying to open them.
 */
export function checkPasswordProtected(ext, headBuf, scanBuf = headBuf) {
  const lowerExt = ext.toLowerCase();
  const magic = detectMagicType(headBuf);

  if (magic === 'pdf' || lowerExt === '.pdf') {
    if (magic === 'pdf') {
      const latin = scanBuf.toString('latin1');
      if (/\/Encrypt\b/.test(latin)) {
        return {
          detected: true,
          details: 'PDF declares /Encrypt dictionary (password or permissions locked)',
        };
      }
    }
  }

  if (magic === 'ole2' && (OOXML_EXTENSIONS.has(lowerExt) || CLASSIC_OFFICE_EXTENSIONS.has(lowerExt))) {
    if (
      scanBuf.includes(ENCRYPTION_INFO_UTF16) ||
      scanBuf.includes(ENCRYPTED_PKG_UTF16) ||
      scanBuf.includes(ENCRYPTION_INFO_ASCII) ||
      scanBuf.includes(ENCRYPTED_PKG_ASCII)
    ) {
      return {
        detected: true,
        details: `Encrypted Office container (OLE2 EncryptionInfo stream inside ${lowerExt})`,
      };
    }
  }

  if (magic === 'zip' && (OOXML_EXTENSIONS.has(lowerExt) || lowerExt === '.zip')) {
    if (hasEncryptedZipLocalHeader(scanBuf)) {
      return {
        detected: true,
        details: 'ZIP local header has encryption flag (bit 0) set',
      };
    }
  }

  return { detected: false, details: null };
}

/**
 * Check whether an image, PDF, or ZIP-based document appears cut off before its end marker.
 */
export function checkTruncation(ext, headBuf, tailBuf, size, opts = {}) {
  if (size <= 0) return { detected: false, details: null };

  const lowerExt = ext.toLowerCase();
  const magic = detectMagicType(headBuf);
  const expected = EXPECTED_MAGIC_BY_EXT[lowerExt];
  if (!expected || !expected.includes(magic)) {
    return { detected: false, details: null };
  }

  if (magic === 'zip') {
    // Valid EOCD is 22 bytes + 2-byte little-endian comment length reaching end of file.
    for (let i = tailBuf.length - 22; i >= 0; i--) {
      if (
        tailBuf[i] === 0x50 &&
        tailBuf[i + 1] === 0x4b &&
        tailBuf[i + 2] === 0x05 &&
        tailBuf[i + 3] === 0x06
      ) {
        const commentLen = tailBuf.readUInt16LE(i + 20);
        if (i + 22 + commentLen === tailBuf.length) {
          return { detected: false, details: null };
        }
      }
    }
    return {
      detected: true,
      details: `${lowerExt} file ends before its closing ZIP directory record (EOCD)`,
    };
  }

  if (magic === 'pdf') {
    const tailSlice = tailBuf.subarray(Math.max(0, tailBuf.length - 1024)).toString('latin1');
    if (!tailSlice.includes('%%EOF')) {
      return {
        detected: true,
        details: 'PDF starts normally but ends before its %%EOF end marker',
      };
    }
  }

  if (magic === 'jpeg') {
    // Many cameras and phones store extra data after the end-of-image marker
    // (FFD9): thumbnails, Samsung "SEFT" trailers, or a whole MP4 clip for
    // Pixel/Samsung motion photos. So search the whole tail window rather than
    // the last few bytes, and accept known trailers even when the marker sits
    // further back than the window.
    let foundEoi = tailBuf.includes(JPEG_EOI);
    if (!foundEoi && opts.jpegVideoAfterEoi) foundEoi = true;
    if (!foundEoi && tailBuf.subarray(Math.max(0, tailBuf.length - 8)).includes(SAMSUNG_TRAILER)) foundEoi = true;
    if (!foundEoi) {
      return {
        detected: true,
        details: 'JPEG photo stops before its end-of-image marker (FFD9)',
      };
    }
  }

  if (magic === 'png') {
    const tailSlice = tailBuf.subarray(Math.max(0, tailBuf.length - 32));
    if (!tailSlice.includes(PNG_IEND)) {
      return {
        detected: true,
        details: 'PNG image ends before its IEND end chunk',
      };
    }
  }

  return { detected: false, details: null };
}

/**
 * Check for paths longer than 260 characters and segments Windows rejects.
 */
export function checkPathAndName(relPath, fullPath = relPath) {
  const issues = [];
  const normRel = relPath.replace(/\\/g, '/');

  if (normRel.length > 260 || fullPath.length > 260) {
    const reason =
      normRel.length > 260
        ? `Relative path is ${normRel.length} characters (exceeds 260)`
        : `Full path is ${fullPath.length} characters (exceeds 260)`;
    issues.push({ code: 'path_too_long', details: reason });
  }

  const segments = normRel.split('/').filter(Boolean);
  const badReasons = [];
  for (const seg of segments) {
    if (seg === '.' || seg === '..') continue;
    const illegal = seg.match(WINDOWS_ILLEGAL_CHARS_RE);
    if (illegal) {
      badReasons.push(`segment "${seg}" contains illegal character "${illegal[0]}"`);
      continue;
    }
    if (WINDOWS_RESERVED_NAME_RE.test(seg)) {
      badReasons.push(`segment "${seg}" uses reserved Windows device name`);
      continue;
    }
    if (/[ .]$/.test(seg)) {
      badReasons.push(`segment "${seg}" ends with a trailing space or period`);
    }
  }

  if (badReasons.length > 0) {
    issues.push({
      code: 'invalid_windows_name',
      details: badReasons.join('; '),
    });
  }

  return issues;
}

/**
 * Evaluate all single-file checks (everything except cross-file duplicate detection).
 */
// Plain-English names for detected file types, used in client-facing reports.
export const TYPE_LABELS = {
  pdf: 'a PDF',
  png: 'a PNG image',
  jpeg: 'a JPEG photo',
  gif: 'a GIF image',
  zip: 'a ZIP-based file (Word/Excel/PowerPoint or .zip)',
  ole2: 'an older Office file (.doc/.xls/.ppt)',
  rtf: 'a rich-text (RTF) document',
  html: 'a web page (HTML)',
  xml: 'an XML file',
  unknown: 'an unrecognised format',
};
const typeLabel = (t) => TYPE_LABELS[t] ?? `${t} data`;

export function analyzeSingleFile({ relPath, fullPath, size, allZero, headBuf, tailBuf, scanBuf, jpegVideoAfterEoi = false }) {
  const ext = path.extname(relPath).toLowerCase();
  const magic = size === 0 ? 'empty' : allZero ? 'all_zero' : detectMagicType(headBuf);
  const findings = [];

  if (size === 0) {
    findings.push({ code: 'zero_byte', details: 'File size is 0 bytes' });
  } else if (allZero) {
    findings.push({ code: 'all_zero_bytes', details: `All ${size} bytes are 0x00` });
  } else {
    const cloud = checkCloudPlaceholder(ext, size, headBuf);
    if (cloud.detected) {
      findings.push({ code: 'cloud_placeholder', details: cloud.details });
    } else {
      const pw = checkPasswordProtected(ext, headBuf, scanBuf);
      if (pw.detected) {
        findings.push({ code: 'password_protected', details: pw.details });
      }

      // Encrypted OOXML legitimately uses an OLE2 container rather than a ZIP header.
      const encryptedOle2Ooxml = pw.detected && magic === 'ole2' && OOXML_EXTENSIONS.has(ext);
      const expected = EXPECTED_MAGIC_BY_EXT[ext];
      if (!encryptedOle2Ooxml && expected && !expected.includes(magic)) {
        findings.push({
          code: 'extension_mismatch',
          details: `Named ${ext}, but the contents are ${typeLabel(magic)}`,
        });
      }

      const trunc = checkTruncation(ext, headBuf, tailBuf, size, { jpegVideoAfterEoi });
      if (trunc.detected) {
        findings.push({ code: 'truncated_file', details: trunc.details });
      }
    }
  }

  for (const pathIssue of checkPathAndName(relPath, fullPath)) {
    findings.push(pathIssue);
  }

  return {
    ext,
    detectedType: magic,
    findings,
  };
}
