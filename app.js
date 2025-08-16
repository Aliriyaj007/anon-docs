/* ================================
   AnonDocs - app.js (secure share + UX)
   ================================ */

let docs = JSON.parse(localStorage.getItem("docs") || "{}");
let currentDoc = null;
let isLight = localStorage.getItem("theme") === "light";

const editor = document.getElementById("editor");
const titleInput = document.getElementById("titleInput");
const meter = document.getElementById("meter");

/* ---------- Boot ---------- */
function boot() {
  document.body.className = isLight ? "light" : "";

  const params = new URLSearchParams(window.location.search);
  const enc = params.get("doc");
  if (enc) tryOpenEncrypted(enc);

  renderDocs();

  if (!Object.keys(docs).length && !enc) newDocument();

  updateMeter();
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
  titleInput.value = "Untitled";
  persist();
  renderDocs();
}

function loadDocument(id) {
  currentDoc = id;
  editor.innerHTML = docs[id].content || "";
  titleInput.value = docs[id].title || "Untitled";
  updateMeter();
}

function deriveTitleFromContent(html) {
  const plain = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return (plain.split("\n")[0] || "Untitled").slice(0, 40) || "Untitled";
}

function saveDocument() {
  if (!currentDoc) newDocument();
  const content = editor.innerHTML;
  const title = (titleInput.value || "").trim() || deriveTitleFromContent(content);
  docs[currentDoc] = { title, content, updated: Date.now() };
  persist();
  renderDocs();
  showToast("✅ Saved");
}

function persist() {
  localStorage.setItem("docs", JSON.stringify(docs));
  localStorage.setItem("theme", isLight ? "light" : "dark");
}

/* ---------- Autosave (debounced) ---------- */
let autosaveTimer;
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    if (!currentDoc) newDocument();
    const content = editor.innerHTML;
    const title = (titleInput.value || "").trim() || deriveTitleFromContent(content);
    docs[currentDoc] = { title, content, updated: Date.now() };
    persist();
    renderDocs();
    showToast("💾 Autosaved");
  }, 1200);
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

/* ---------- Word meter ---------- */
function updateMeter() {
  const text = (editor.innerText || "").trim();
  const words = text ? (text.match(/\S+/g) || []).length : 0;
  meter.textContent = `${words} word${words === 1 ? "" : "s"}`;
}

/* ---------- Secure Share (AES) ---------- */
async function secureShare() {
  if (!currentDoc) saveDocument();

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

    const ok = await copyToClipboard(url);
    if (ok) {
      showToast("🔒 Secure URL copied");
    } else {
      // Fallback: show modal with the URL to copy manually
      document.getElementById("shareUrl").value = url;
      document.getElementById("shareModal").classList.remove("hidden");
      showToast("⚠️ Couldn’t auto-copy. Copy manually.");
    }
  } catch (e) {
    console.error(e);
    alert("❌ Failed to create secure link.");
  }
}

/* ---------- Clipboard helpers ---------- */
async function copyToClipboard(text) {
  // Primary: Async Clipboard API
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e1) {
    // Fallback: hidden textarea + execCommand
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch (e2) {
      return false;
    }
  }
}

function copyShareUrl() {
  const val = document.getElementById("shareUrl").value;
  copyToClipboard(val).then((ok) => {
    showToast(ok ? "📋 Copied" : "❌ Copy failed");
    if (ok) closeShareModal();
  });
}

function closeShareModal() {
  document.getElementById("shareModal").classList.add("hidden");
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

    editor.innerHTML = data.html || "";
    titleInput.value = data.title || "Shared Document";
    updateMeter();

    const saveIt = confirm("Open successful. Save a local copy?");
    if (saveIt) {
      currentDoc = Date.now().toString();
      docs[currentDoc] = {
        title: titleInput.value || "Shared Document",
        content: editor.innerHTML,
        updated: Date.now(),
      };
      persist();
      renderDocs();
      showToast("✅ Saved local copy");
    }
  } catch (e) {
    console.error(e);
    alert("❌ Incorrect password or corrupted link.");
  }
}

/* ---------- Optional: Open Shared (paste a URL) ---------- */
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

/* ---------- Toasts ---------- */
function showToast(text) {
  const wrap = document.getElementById("toasts");
  const t = document.createElement("div");
  t.className = "toast show";
  t.textContent = text;
  wrap.appendChild(t);
  setTimeout(() => wrap.removeChild(t), 2400);
}

/* ---------- Events ---------- */
editor.addEventListener("input", () => {
  updateMeter();
  scheduleAutosave();
});
titleInput.addEventListener("input", () => {
  if (!currentDoc) return;
  docs[currentDoc].title = titleInput.value || "Untitled";
  docs[currentDoc].updated = Date.now();
  persist();
  renderDocs();
});

/* ---------- Expose to window (used by HTML buttons) ---------- */
window.newDocument = newDocument;
window.loadDocument = loadDocument;
window.saveDocument = saveDocument;
window.formatDoc = formatDoc;
window.toggleTheme = toggleTheme;
window.secureShare = secureShare;
window.openShared = openShared;
window.copyShareUrl = copyShareUrl;
window.closeShareModal = closeShareModal;
