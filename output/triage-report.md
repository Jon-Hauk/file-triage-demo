# File Triage Report

Read-only scan of `samples/broken-copy`. No files were moved, renamed, modified, or deleted.

## Summary

| Metric | Count |
|---|---|
| Files scanned | 60 |
| Healthy files (no issues found) | 36 |
| Files needing attention | 24 |
| Total data size | 51.4 KB |

### Problem breakdown

| Problem group | Files |
|---|---|
| Wrong file extension (header does not match filename) | 4 |
| Empty files (0 bytes) | 3 |
| Blank files (filled with zero bytes) | 2 |
| Cut-off / incomplete files | 4 |
| Cloud placeholder stubs (not full files) | 4 |
| Password-protected / encrypted files | 2 |
| Paths over 260 characters | 2 |
| Exact duplicate files | 3 |

---

## Wrong file extension (header does not match filename) (4 files)

- **Likely cause:** A browser, portal, or script saved a web page (HTML) or a different file type under the original document or photo name.
- **Safe next step:** Test opening a copy with the detected file type (for example rename a copy to .html), or re-download from the original source.

| File | Size | What the scan saw |
|---|---|---|
| `client-proposals/meadowbrook-clinic-sow.docx` | 738 B | Extension is .docx (expected zip), but file header detected html |
| `finance/2026-10-merchant-statement.pdf` | 737 B | Extension is .pdf (expected pdf), but file header detected html |
| `photos/catalog-hero-banner.png` | 696 B | Extension is .png (expected png), but file header detected jpeg |
| `photos/trade-show-badge-photo.jpg` | 826 B | Extension is .jpg (expected jpeg), but file header detected pdf |

## Empty files (0 bytes) (3 files)

- **Likely cause:** The copy created the filename entry in the destination folder, then failed or was cancelled before any data was written.
- **Safe next step:** Recover this file from the source drive, backup, or cloud trash; a 0-byte file contains no data to repair.

| File | Size | What the scan saw |
|---|---|---|
| `client-proposals/2026-q3-harborline-addendum.docx` | 0 B | File size is 0 bytes |
| `finance/2026-10-reimbursement-scan.pdf` | 0 B | File size is 0 bytes |
| `photos/storefront-signage-night.jpg` | 0 B | File size is 0 bytes |

## Blank files (filled with zero bytes) (2 files)

- **Likely cause:** Storage space was pre-allocated during a copy or sync, then the connection dropped or the drive disconnected before contents arrived.
- **Safe next step:** Do not try repair tools on an all-zero file; copy it again from the original source or a prior backup.

| File | Size | What the scan saw |
|---|---|---|
| `archive/2025-q4-backup-export.zip` | 4.0 KB | All 4096 bytes are 0x00 |
| `finance/2026-09-payroll-register.xlsx` | 8.0 KB | All 8192 bytes are 0x00 |

## Cut-off / incomplete files (4 files)

- **Likely cause:** The transfer stopped mid-stream, leaving a valid file header without its closing end-of-file structure.
- **Safe next step:** Re-copy from the source first. If the original is gone, work only on a copy when testing recovery tools.

| File | Size | What the scan saw |
|---|---|---|
| `client-proposals/2026-q2-birchwood-contract.docx` | 867 B | ZIP/Office container (.docx) is missing End-of-Central-Directory (EOCD) record |
| `finance/2026-10-invoice-batch.pdf` | 675 B | PDF file has %PDF- header but is missing %%EOF end marker |
| `photos/event-stage-wide.jpg` | 616 B | JPEG image is missing FFD9 end-of-image (EOI) marker |
| `photos/logo-print-master.png` | 591 B | PNG image is missing IEND trailer chunk |

## Cloud placeholder stubs (not full files) (4 files)

- **Likely cause:** Only an online shortcut or cloud-sync stub (.icloud, .url, .gsheet, or Files On-Demand stub) was copied instead of the downloaded file.
- **Safe next step:** Open the original cloud folder on a signed-in device, mark the folder "Always keep on this device" or export offline copies, then copy again.

| File | Size | What the scan saw |
|---|---|---|
| `client-proposals/shared-client-folder.url` | 81 B | Cloud shortcut/stub extension (.url) |
| `finance/2026-budget-live.gsheet` | 81 B | Cloud shortcut/stub extension (.gsheet) |
| `hr-templates/benefits-enrollment-2026.pdf` | 81 B | Small (81 B) stub file matching cloud placeholder text instead of pdf data |
| `photos/.workshop-raw-album.icloud` | 129 B | Cloud shortcut/stub extension (.icloud) |

## Password-protected / encrypted files (2 files)

- **Likely cause:** The file is intentionally encrypted with a password and was left unopened by this scan.
- **Safe next step:** Confirm with the file owner whether the password is known; keep the file intact and never run brute-force crackers on client files.

| File | Size | What the scan saw |
|---|---|---|
| `finance/2026-executive-comp-model.xlsx` | 2.0 KB | Encrypted Office container (OLE2 EncryptionInfo stream inside .xlsx) |
| `hr-templates/signed-background-consent.pdf` | 1.0 KB | PDF declares /Encrypt dictionary (password or permissions locked) |

## Paths over 260 characters (2 files)

- **Likely cause:** Deeply nested folders pushed the full path past the classic Windows 260-character limit, causing Explorer and older Office apps to fail to open it.
- **Safe next step:** Copy the parent folder to a shorter root path (for example C:\Triage\) or shorten intermediate folder names before opening.

| File | Size | What the scan saw |
|---|---|---|
| `archive/2025-client-deliverables-backup/regional-operations-north/quarterly-project-archive-folders/birchwood-bakery-rebrand-project-files/final-print-production-assets-approved-by-marketing-director/2025-11-approved-vendor-pack/birchwood-print-order-summary-final-signed.pdf` | 833 B | Relative path is 275 characters (exceeds 260) |
| `archive/2025-client-deliverables-backup/regional-operations-south/quarterly-project-archive-folders/cedar-ridge-dental-office-expansion/financial-tracking-workbooks-and-contractor-bids-folder/2025-12-approved-budget-workbooks/cedar-ridge-contractor-cost-breakdown.xlsx` | 1002 B | Relative path is 268 characters (exceeds 260) |

## Exact duplicate files (3 files)

- **Likely cause:** Repeated drag-and-drop attempts or merged backup folders left byte-for-byte identical copies in multiple places.
- **Safe next step:** Verify one copy opens cleanly, then archive or remove redundant duplicates only after client sign-off.

| File | Size | What the scan saw |
|---|---|---|
| `unsorted-duplicates/2026-10-cashflow-forecast-copy.xlsx` | 1002 B | Exact duplicate of finance/2026-10-cashflow-forecast.xlsx (SHA-256 69375548f057) |
| `unsorted-duplicates/2026-q1-birchwood-bakery-proposal-copy.pdf` | 832 B | Exact duplicate of client-proposals/2026-q1-birchwood-bakery-proposal.pdf (SHA-256 b6e89317ffd1) |
| `unsorted-duplicates/office-lobby-east-copy.jpg` | 696 B | Exact duplicate of photos/office-lobby-east.jpg (SHA-256 05dc559356c5) |

---

See `triage-report.csv` for the complete file-by-file inventory (including healthy files and SHA-256 hashes).
