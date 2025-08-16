# AnonDocs — Minimal, Private Docs

AnonDocs is a lightweight, privacy-focused, offline-capable writing app built with **only HTML, CSS, and JavaScript**.  
It provides a Google-Docs–inspired writing experience with password-protected sharing, saved shared-link management, printing of document content only, autosave, light/dark theme, and more.

---

## Features

- **Rich editing** with contentEditable + formatting toolbar (bold, italic, underline, headings, lists, alignment, color, images, links).
- **Autosave & manual save** to browser `localStorage`.
- **Password-protected sharing**:
  - Private links: AES-encrypted payload (CryptoJS) → require password to open.
  - Public links: base64 payload (no password).
  - Link expiry included in the payload (user selectable).
- **Shared Links Manager** — view, copy, open, toggle public/private, revoke links.
- **Print** — prints **only** the document content (no UI).
- **Responsive UI** — works on desktop and mobile; page-like layout for focused writing.
- **Light / Dark theme** persisted across sessions.
- **First-time tooltips** for toolbar features (one-time per browser).
- **Export / import** utilities included (backup via localStorage export & import).
- Fully client-side — no server required (links are self-contained in the URL).

---

## Files

- `index.html` — main app shell, UI, modals.
- `style.css` — styling and responsive layout.
- `app.js` — all application logic (documents, sharing, printing, UI).
- (Optional) `assets/` — place screenshots or demo images if you want.

---

## How to run

1. Put `index.html`, `style.css`, and `app.js` in the same folder.  
2. Open `index.html` in a browser (Chrome/Edge/Firefox recommended).  
3. Or upload to a GitHub repository and enable **GitHub Pages** from repository Settings → Pages → main → root to publish.

---

## How sharing works

- **Private link**: You set a password. The app AES-encrypts the document payload and produces a `?shared=PRV:<cipher>` URL. The receiver must enter the password to decrypt and view.
- **Public link**: The app creates a base64 payload `?shared=PUB:<base64>` that anyone can open.
- **Expiry**: You can set expiry (1 day, 7 days, 30 days, or never). Expired links cannot be opened.
- **Shared Links Manager**: saved links appear in the "Shared Links" modal where you can copy, open, toggle public/private, or revoke.

> Note: passwords are **not** stored by the app — if you forget the password for a private link, the data cannot be recovered.

---

## Printing

Use the **Print** button — the app opens a minimal print window containing only the document HTML (images preserved), then calls `window.print()` so the page UI is not printed.

---

## Security notes

- Private links use AES encryption (via CryptoJS) — password is required to decrypt.
- The app strips `<script>` tags from imported content to lower XSS risk.
- Data is stored in `localStorage` only. If you want server-backed sync/persistence, a small server or serverless function would be required.

---

## Next steps / Improvements

- Optional server for persistent shared links (so links survive device storage loss).
- Convert to a PWA to install and work fully offline with an app icon.
- Replace `document.execCommand` with a modern editor engine for richer features (collaboration, diffing).
- Add permissions & link access control (email-based invites) via a backend.

---

## License

MIT — feel free to use, modify, and distribute.

---

If you want, I can:
- Split `app.js` into modules and add inline documentation.
- Create a `README` with screenshots (I can generate mockups).
- Help you set up GitHub Pages and push these files to a repo.
