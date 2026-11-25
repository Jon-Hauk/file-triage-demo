# Notes

## What was built

- **Detectors (`src/detectors.js`):** Pure functions and `ISSUE_META` definitions covering extension-vs-magic-byte mismatches (`.docx`/`.xlsx`/`.pptx`/`.zip`/`.pdf`/`.jpg`/`.png`/`.gif`/`.doc`/`.xls`/`.ppt`/`.rtf`/`.html`/`.xml`), 0-byte files, all-zero-byte files, truncated containers/images (ZIP EOCD, PDF `%%EOF`, JPEG `FFD9`, PNG `IEND`), cloud placeholder stubs (`.icloud`, `.url`, `.webloc`, `.gdoc`, `.gsheet`, `.gslides`, `.dropbox`, and `<= 512 B` cloud-marker stubs), password-protected files (`/Encrypt`, OLE2 `EncryptionInfo`/`EncryptedPackage`, ZIP bit-0 encryption flag), paths > 260 characters, Windows-rejected filenames, and SHA-256 duplicates.
- **Read-only scanner (`src/scanner.js`):** Streams files in 64 KB chunks using `fs.openSync(..., 'r')` and `path.toNamespacedPath(...)` (so paths over 260 characters work on Windows even without `LongPathsEnabled`), computes SHA-256 and all-zero state in a single pass, and assigns `duplicate` issues alphabetically after the first copy.
- **Reports & CLI (`src/report.js`, `src/run.js`):** Generates client-ready `triage-report.md`, self-contained `triage-report.html`, and full-inventory `triage-report.csv`.
- **Synthetic sample generator (`src/sample.js`, `src/generate.js`):** Builds 60 synthetic files for fictional "Alder & Pine Studio" (36 healthy, 24 with planted faults across 8 categories) plus `samples/truth.json`.
- **Tests (`test/detectors.test.js`, `test/triage.test.js`):** 11 tests under `node:test` covering unit edge cases, 100% reconciliation against `truth.json`, and read-only verification via pre/post SHA-256 tree snapshots.
- **CI & committed outputs (`.github/workflows/ci.yml`, `output/`):** Configured CI workflow using `actions/checkout@v5`, `actions/setup-node@v5` (Node 22), and `actions/upload-artifact@v6`, and committed `output/triage-report.{md,html,csv}`.

## Anything left undone

- Nothing in the brief was skipped. No remote repository was created or pushed, per the hard rules.

## Judgment calls

- **Zero external npm dependencies:** Implemented minimal valid PDF, store-mode ZIP/OOXML, JFIF JPEG, 1x1 PNG, and OLE2 encryption header builders using Node 20+ built-ins (`node:crypto`, `node:zlib`, `node:fs`, `node:path`) and generated `package-lock.json` via `npm install --package-lock-only` so `npm ci` works cleanly offline and in CI.
- **Gitignoring `samples/broken-copy/`:** Kept `samples/broken-copy/` in `.gitignore` (while committing `samples/truth.json` and `output/triage-report.*`) because the generated sample tree intentionally contains >260-character paths that fail `git add`/`git checkout` on Windows systems without `core.longpaths` enabled. Anyone cloning the repo runs `npm run generate` to recreate those files locally via `path.toNamespacedPath`.
- **`invalid_windows_name` coverage:** Because Windows NTFS forbids writing filenames with literal `< > : " | ? *` or reserved names like `CON`/`NUL` on disk, the sample generator does not write those onto the local filesystem; the detector is thoroughly covered across 16 invalid filename cases in `test/detectors.test.js`.
- **Duplicate folder naming:** Placed the 3 synthetic duplicates in `unsorted-duplicates/` so alphabetical sorting treats the original folders (`client-proposals/`, `finance/`, `photos/`) as primary copies and flags the unsorted copies as duplicates.
- **Portable folder label in reports:** Used a relative folder path (falling back to folder basename) in report headers instead of the host machine's absolute path so generated reports contain no local user directory paths and reproduce cleanly across machines.

## Review fixes (2026-11-24, Claude Code)

- **JPEG truncation false positives:** the check looked for `FFD9` only in the last 32 bytes, so phone photos that store data after the image (camera metadata, Samsung `SEFT` trailers, Pixel/Samsung motion-photo MP4 clips) would have been reported as cut off. It now searches the 64 KB tail window, and the scanner notes an MP4 `ftyp` box after the end-of-image marker while streaming. Tests cover trailing metadata, motion photos, Samsung trailers, and a large cut-off photo that must still be flagged. Known limit: a small (<64 KB) JPEG with an embedded thumbnail that is cut off after the thumbnail can pass as healthy.
- **Client wording:** findings read "Named .docx, but the contents are a web page (HTML)" instead of "Extension is .docx (expected zip), but file header detected html"; truncation lines are in plain English.
- **Line endings:** `.gitattributes` forces LF for text so regenerated reports match the committed ones on Windows and Linux.
