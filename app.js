/* ================================
   AnonDocs - app.js (secure share)
   ================================ */

let docs = JSON.parse(localStorage.getItem("docs") || "{}");
let currentDoc = null;
let isLight = localStorage.getItem("theme") === "light";

const editor = document.getElementById("editor");

/* ---------- Boot ---------- */
function boot() {
  // Apply theme early
  document.body.className = isLight ? "light" : "";

  // Load from ?doc= (encrypted) if present
  const params = new URLSearchParams(window.location.search);
  const enc = params.get("doc");
  if (enc) {
    tryOpenEncrypted(enc);
  }

  renderDocs();

  // If user has no docs yet, start one
  if (!Object.keys(docs).length && !enc) {
    newDocument();
  }
}
window.addEventListener("load", boot);

/* ---------- UI Helpers ---------- */
function renderDocs() {
  const list = document.getElementById("docList");
  list.innerHTML = "";
  Object.keys(docs)
    .sort((a, b) => (docs[b].updated || 0) - (docs[a].updated || 0))
    .forEach((id) => {
      const item = document.createElement("div");
      item.className = "doc-item";
      const title = docs[id].title || "Untitled";
      const date = docs[id].updated ? new Date(docs[id].updated).toLocaleString() : "";
      item.innerHTML = `<div>${escapeHtml(title)}</div><div style="opacity:.6;font-size:.8rem">${date}</div>`;
      item.onclick = () => loadDocument(id);
      list.appendChild(item);
    });
}

function escapeHtml(s = "") {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Documents ---------- */
function newDocument() {
  currentDoc = Date.now().toString();
  docs[currentDoc] = { title: "Untitled", content: "", updated: Date.now() };
  editor.innerHTML = "";
  persist();
  renderDocs();
}

function loadDocument(id) {
  currentDoc = id;
  editor.innerHTML = docs[id].content || "";
}

function saveDocument() {
  if (!currentDoc) newDocument();
  const content = editor.innerHTML;
  // Title = first 1 line of plain text (max 40 chars)
  const plain = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const title = (plain.split("\n")[0] || "Untitled").slice(0, 40) || "Untitled";

  docs[currentDoc] = { title, content, updated: Date.now() };
  persist();
  renderDocs();
  alert("✅ Document saved locally.");
}

function persist() {
  localStorage.setItem("docs", JSON.stringify(docs));
  localStorage.setItem("theme", isLight ? "light" : "dark");
}

/* ---------- Formatting ---------- */
function formatDoc(cmd, val = null) {
  document.execCommand(cmd, false, val);
}

/* ---------- Theme ---------- */
function toggleTheme() {
  isLight = !isLight;
  document.body.className = isLight ? "light" : "";
  persist();
}

/* ---------- Secure Share (AES) ---------- */
/**
 * Encrypts current document HTML using a password (AES),
 * builds a sharable URL, and copies it to clipboard.
 */
async function secureShare() {
  if (!currentDoc) saveDocument(); // ensure we have a doc id

  const password = prompt("Set a password for this document (remember it!):");
  if (!password) return;

  const payload = JSON.stringify({
    title: docs[currentDoc].title || "Untitled",
    html: docs[currentDoc].content || "",
    ts: Date.now(),
  });

  try {
    const encrypted = CryptoJS.AES.encrypt(payload, password).toString();
    const base = window.location.origin + window.location.pathname;
    const url = `${base}?doc=${encodeURIComponent(encrypted)}`;

    // Try to copy; if blocked, just show dialog
    try {
      await navigator.clipboard.writeText(url);
      alert("🔒 Secure URL copied to clipboard!\nShare it with the password.");
    } catch {
      prompt("Copy this secure URL:", url);
    }
  } catch (e) {
    console.error(e);
    alert("❌ Failed to create secure link.");
  }
}

/* ---------- Open Encrypted From URL ---------- */
function tryOpenEncrypted(enc) {
  const password = prompt("Enter password to open this document:");
  if (!password) return;

  try {
    const bytes = CryptoJS.AES.decrypt(enc, password);
    const json = bytes.toString(CryptoJS.enc.Utf8);
    if (!json) throw new Error("Bad password or data");
    const data = JSON.parse(json);

    // Show the decrypted content in editor (not auto-saving)
    editor.innerHTML = data.html || "";

    // Ask to save into local docs
    const saveIt = confirm("Open successful. Save a local copy?");
    if (saveIt) {
      currentDoc = Date.now().toString();
      docs[currentDoc] = {
        title: data.title || "Shared Document",
        content: data.html || "",
        updated: Date.now(),
      };
      persist();
      renderDocs();
    }
  } catch (e) {
    console.error(e);
    alert("❌ Incorrect password or corrupted link.");
  }
}

/* ---------- Optional: Open Shared (paste a URL) ---------- */
/* Hook to a toolbar button if you like: <button onclick="openShared()">🔓 Open Shared</button> */
function openShared() {
  const url = prompt("Paste the secure URL:");
  if (!url) return;
  try {
    const u = new URL(url, window.location.href);
    const enc = u.searchParams.get("doc");
    if (!enc) throw new Error("No 'doc' parameter found.");
    tryOpenEncrypted(enc);
  } catch (e) {
    alert("❌ Invalid URL.");
  }
}

/* ---------- Expose to window (used by HTML buttons) ---------- */
window.newDocument = newDocument;
window.loadDocument = loadDocument;
window.saveDocument = saveDocument;
window.formatDoc = formatDoc;
window.toggleTheme = toggleTheme;
window.secureShare = secureShare;
window.openShared = openShared;
