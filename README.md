# PIXORA — Unified Image Utility Platform

> **Your images. Every format. One place.**

PIXORA is a high-performance, client-first image utility engineered for creators, marketers, social media managers, and developers. It consolidates grid splitting, target file-size compression, bicubic resizing, aspect-ratio cropping, and social platform presets into a single, cohesive workflow protected by mandatory global authentication.

---

## 1. Architectural Principles

- **Mandatory App-Wide Authentication:** Unauthenticated visitors cannot access any application workspaces, image tools, or user data. A professional Welcome portal provides dedicated **Log In** and **Create Account** access.
- **Zero-Server Image Processing (Client-First):** While authentication and user project metadata are securely authorized on the server, all image manipulation, scaling, slicing, and compression occurs 100% inside the user's browser using HTML5 Canvas, Web Workers, and hardware-accelerated buffers. Your photos never leave your device.
- **60–30–10 Visual Discipline:**
  - **60% Warm Ivory (`#F7F5F0`)**: Dominant surfaces and workspace backdrops.
  - **30% Charcoal (`#171717`)**: High-contrast typography, structural cards, and primary framing.
  - **10% Vivid Orange (`#FF6B35`)**: Selective accents, active tabs, and primary call-to-actions.
- **Dual Typographic Standard:** Inter for user interface navigation; DM Mono for technical readings (dimensions, Megapixels, KB/MB thresholds, credentials).

---

## 2. Global Authentication & Access Control

PIXORA implements a centralized, app-wide access control system:

- **Welcome Gateway (`#welcome`):** Clean, professional brand gateway displaying **Log In** and **Create Account** options, capability cards, and privacy assurances.
- **Dedicated Authentication Pages (No Modals/Popups):**
  - **Login Page (`#login`):** Email, password with show/hide toggle, loading indicators, error banners, and demo auto-fill.
  - **Registration Page (`#register`):** Full name, email, password creation, password confirmation, real-time length and match checklist.
  - **Password Recovery Page (`#forgot-password`):** Email submission with anti-enumeration protection (uniform response preventing account discovery).
- **Global Route Guard:** Automatically intercepts unauthorized access to all protected features (`#dashboard`, `#splitter`, `#compressor`, `#resizer`, `#cropper`, `#presets`, `#projects`, `#settings`, `#qa`). Intercepted visitors are redirected to `#welcome` while preserving their `intendedRoute`.
- **Anti-Flicker Session Verification:** During initial session token verification against `/api/auth/me`, a branded security loading screen prevents protected dashboards from flashing.
- **Cryptographic Password Security:**
  - Password hashing utilizing Node.js native `crypto.scryptSync` with unique 16-byte cryptographic salts.
  - Constant-time verification via `crypto.timingSafeEqual` preventing timing attacks.
  - Zero plain-text password storage.
- **Pre-Configured Demo Account:**
  - **Email:** `creator@pixora.app`
  - **Password:** `Pixora@2026!`
  - Available for immediate testing or custom account registration.

---

## 3. Core Toolset (Authenticated Access)

1. **Image Splitter & Grid Tile Exporter:**
   - Splits images into multi-row/multi-column grids (e.g., 3×3 Instagram grids) or seamless carousel panos.
   - **Zero-Seam Loss Math:** Employs remainder-distribution calculus (`Math.round((c * W) / totalCols)`) to ensure not a single pixel is lost across tile borders.
   - **Instagram Posting Order:** Displays reversed posting sequence (Tile #9 to Tile #1) to ensure flawless profile grid rendering.
   - Batch ZIP export with auto-generated numbered filenames.

2. **Target KB/MB Compressor:**
   - 8-stage binary search algorithm converging on user-specified target file size (e.g., exact 200 KB or strict 2.0 MB).
   - Micro-downscaling fallback if quality compression alone cannot satisfy the byte cap.
   - Alpha transparency detection with automatic white-flattening option for JPEG outputs.

3. **Pixel Dimension Resizer:**
   - Exact pixel width/height inputs with instantaneous aspect-ratio lock.
   - Percentage scaling presets (25%, 50%, 75%, 100%, 200%).
   - High-quality bicubic canvas interpolation.

4. **Aspect Ratio Cropper:**
   - Visual draggable handles with 1:1, 4:5, 16:9, 9:16, 3:1, and free-form presets.
   - 90° clockwise/counter-clockwise rotation and horizontal/vertical flipping.

5. **Social Platform Preset Library:**
   - Up-to-date aspect ratios and maximum file size limits for Instagram, TikTok, YouTube, X (Twitter), LinkedIn, Pinterest, Facebook, and Threads.

---

## 4. Security Baseline

PIXORA adheres to modern web application security practices:

- **HTTPS & HSTS:** All traffic is strictly encrypted with `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- **Content Security Policy (CSP):** Strict script and asset boundaries configured in `server.ts`.
- **Security Headers:**
  - `X-Content-Type-Options: nosniff` (prevents MIME confusion attacks).
  - `Referrer-Policy: strict-origin-when-cross-origin`.
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()` (blocks unauthorized sensor access).
- **Rate Limiting:**
  - Implemented via `express-rate-limit`.
  - Global API limiter: 100 requests / 15 minutes.
  - Sensitive route limiter (`/api/auth/*`, `/api/contact`): 15 requests / 15 minutes, returning `HTTP 429 Too Many Requests`.
- **CORS Protection:** Domain-locked CORS middleware rejecting wildcard (`*`) origins.
- **Honeypot Bot Protection:** Public contact and feedback forms include a hidden, zero-tab-index honeypot field (`website_trap`) that silently blocks automated bot submissions without spamming human users with captchas.
- **Server Error Sanitization:** The server logs full error traces internally with zero secret exposure, and transmits only generic, safe error messages to clients.

---

## 5. Upload & Abuse Protection

- **Dual-Layer 10 MB Cap:** Enforced strictly in both the browser dropzone validation (`validation.ts`) and on the Express server (`express.json({ limit: '10mb' })`).
- **Magic Byte Signature Sniffing:** Verifies binary file headers (`FF D8 FF` for JPEG, `89 50 4E 47` for PNG, `RIFF...WEBP` for WebP). Rejects corrupted or malicious renamed executables.
- **Decompression Bomb Protection:** Inspects decoded dimensions before full memory allocation. Images exceeding **50 Megapixels** or a **12,000 px single axis** are immediately rejected with an actionable safety message.
- **Automatic EXIF Stripping:** Re-encoding images via HTML5 Canvas naturally discards geolocation tags, device IDs, and embedded camera metadata.
- **XSS Sanitization:** `sanitizeUserInput()` escapes HTML entities (`&`, `<`, `>`, `"`, `'`, `/`) on all user strings.

---

## 6. SEO Baseline & Search Engine Submission

- **Metadata Sync:** Single unified H1 per route, 50–60 character page titles, and 140–160 character descriptive meta tags.
- **Social Sharing Cards:** OpenGraph and Twitter Card meta tags with designated preview images.
- **Schema.org Structured Data:** Valid JSON-LD graph representing `WebApplication`, `Organization`, and an embedded `FAQPage` for rich search engine result snippets.
- **Sitemap & Robots:**
  - Dynamic `sitemap.xml` accessible at `/sitemap.xml`.
  - Crawler instructions served at `/robots.txt`.

---

## 7. Privacy & Legal Compliance

- **Nigeria Data Protection Act (NDPA 2023) & GDPR Compliant:**
  - Transparent data processing model: PIXORA does not transmit, collect, or store user image files.
  - Interactive Cookie & Local Storage consent banner (`CookieConsentBanner.tsx`) with Granular "Essential Only" and "Accept All" controls.
  - No third-party tracking scripts or advertising beacons.
- **Accessibility (WCAG 2.1 AA):**
  - Minimum 4.5:1 contrast ratios on all text surfaces.
  - Visible focus rings (`focus-visible:ring-2 focus-visible:ring-[#FF6B35]`).
  - Screen-reader labels (`aria-label`) on all icon-only buttons.

---

## 8. Development & Build

```bash
# Install dependencies
npm install

# Start development server (Node/Express backend + Vite HMR middleware)
npm run dev

# Run automated linter
npm run lint

# Compile production bundle
npm run build

# Start production server
npm run start
```

---

## 9. QA & Automated Verification

Navigate to the **QA Suite** inside the app (`#qa` once authenticated) to run the integrated 17-point test suite:
- Mathematical seam-loss prevention across fractional divisions.
- Instagram 3×3 grid 1080×1080 pixel parity.
- Magic byte binary MIME sniffing.
- Target size binary search compressor convergence.
- Alpha transparency detection in JPEG exports.
- Bicubic aspect-ratio resizing exactness.
- Interactive cropper coordinate fidelity.
- Social preset library limits.
- Local-first CRUD storage persistence.
- PWA manifest compliance.
- 50MP Decompression bomb prevention.
- 10MB file size ceiling enforcement.
- XSS and HTML entity sanitization.
- NDPA & GDPR cookie consent storage persistence.
- **Backend Route Authorization:** HTTP 401 on unauthenticated private endpoints (`/api/auth/me`, `/api/user/projects`).
- **Cryptographic Credential Validation:** Rejection of fraudulent login attempts.
- **Anti-Enumeration Recovery:** Uniform confirmation responses for password reset requests.
