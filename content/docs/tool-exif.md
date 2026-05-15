---
title: EXIF Inspector
breadcrumb: docs / tools
sidebar_section: Technology Tools
sidebar_order: 4
tool_desc: Extract and strip photo metadata from images.
tool_suffix: No data sent.
---

# EXIF Inspector

> [!NOTE]
> This tool is 100% client-side. Files never leave your browser — no data is uploaded to any server.

## What is EXIF Metadata?

When you take a photo with a smartphone or digital camera, the file contains much more than just the image. It also stores hidden "metadata" called **EXIF data**. 

This often includes:
- The exact **GPS coordinates** of where the photo was taken.
- The **date and time** it was captured.
- Details about your **camera or phone model**.
- Even unique **serial numbers** that can identify your specific device.

## What is this tool for?

The EXIF Inspector makes this "invisible" data visible so you can see what you're sharing. More importantly, it allows you to **strip** (remove) this information from your photos before you upload them to social media or send them to others, protecting your privacy and location.

The EXIF Inspector extracts and strips hidden metadata from image files. Every digital photo taken with a smartphone or camera contains embedded metadata that most people never see: GPS coordinates, device serial numbers, creation timestamps, and more. This tool makes the invisible visible — and lets you remove it before sharing.

---

## Supported Formats

| Format | Metadata Extraction | Stripping |
|---|---|---|
| JPEG / JPG | Full (EXIF, IPTC, XMP) | Yes — Canvas re-encode |
| PNG | Partial (iTXt/XMP chunks) | Yes — Canvas re-encode |
| WebP | Full (EXIF, XMP) | Yes — Canvas re-encode |
| TIFF | Full (EXIF, IPTC, XMP) | Yes — Canvas re-encode to JPEG |
| HEIC / HEIF | Full (EXIF, GPS) | Yes — Converts to JPEG |
| AVIF | Partial | Yes — Canvas re-encode |

> [!TIP]
> HEIC files (common on iPhones) cannot be stripped in-place since browsers cannot re-encode to HEIC. The tool automatically converts to JPEG during the strip operation, which removes all original metadata.

---

## Privacy Score

Each file is graded on a 0–100 scale based on the metadata present:

| Grade | Score | Meaning |
|---|---|---|
| A | 90–100 | Minimal exposure — few or no sensitive fields |
| B | 75–89 | Minor exposure — non-critical metadata only |
| C | 60–74 | Moderate exposure — consider stripping before sharing |
| D | 40–59 | Significant exposure — sensitive data detected |
| F | 0–39 | High exposure — GPS or unique identifiers present |

### Scoring Deductions

| Field | Deduction | Reason |
|---|---|---|
| GPS coordinates | −40 | Exact physical location |
| Serial / Lens serial number | −20 | Uniquely identifies your specific device |
| Artist / Author / Credit | −15 | Your name or identity embedded in the file |
| DateTimeOriginal | −10 | Proves your presence at a location and time |
| Make / Model | −10 | Your specific device type |
| Software / CreatorTool | −5 | OS or application version fingerprint |

---

## Metadata Categories

The tool groups metadata into six categories:

- **GPS & Location** — Latitude, longitude, altitude, speed, direction
- **Identity** — Artist, copyright, description, camera serial number, lens serial
- **Device** — Camera make and model, lens make and model, software version
- **Timestamps** — DateTimeOriginal, DateTimeDigitized, DateTime, UTC offsets
- **IPTC** — Credit, byline, caption, keywords, source (journalism metadata standard)
- **XMP** — Creator, CreatorTool, rating, subject (Adobe/XMP metadata standard)
- **Technical** — Focal length, aperture, ISO, shutter speed, flash, colour space (low-risk camera settings)

---

## How Stripping Works

Metadata stripping uses the browser's **Canvas API**:

1. The file is read into an `<img>` element via a local Object URL (no network transfer)
2. The image is drawn onto an off-screen `<canvas>`
3. The canvas is re-encoded to `image/jpeg`, `image/png`, or `image/webp` via `canvas.toBlob()`
4. The re-encoded blob is offered as a download — it contains only pixel data, no metadata headers

> [!IMPORTANT]
> Re-encoding to JPEG introduces very minor lossy compression (quality 0.92 by default). For archival or professional use, re-encode to PNG (`image/png`) which is lossless but produces larger files.

---

## Batch Processing

Up to **10 files** can be analysed in a single session. Each file gets its own card in the sidebar showing its name, size, and privacy score. Click any card to view its full metadata breakdown. Stripping is per-file — the "Strip & Download" button acts on the currently selected file only.

**Limits:** 10 files per session · 50 MB per file

---

## Privacy Model

- **No upload:** Files are accessed via `FileReader` / Object URL — a browser-native API that reads local files without network I/O
- **No logging:** No filenames, metadata values, or scores are transmitted to kapadia.org
- **No analytics:** The site has no analytics or tracking of any kind
- **GPS map links:** Coordinates open OpenStreetMap in a new tab — your IP is exposed to OpenStreetMap only when you click the link, not during metadata extraction
- **Vendor library:** The `exifr` parsing library (v7.1.3) is self-hosted with a Subresource Integrity hash — no CDN phone-home

---

## Technical Implementation

| Component | Technology |
|---|---|
| Metadata parsing | [exifr](https://github.com/MikeKovarik/exifr) v7.1.3 (vendored, SRI-verified) |
| File access | `FileReader` API + `URL.createObjectURL()` |
| Magic-byte validation | `ArrayBuffer` header inspection before parsing |
| Stripping | `HTMLCanvasElement.toBlob()` re-encode |
| Download | Ephemeral Object URL + `<a download>` click |
| GPS conversion | DMS rational arrays → decimal degrees (client-side math) |
