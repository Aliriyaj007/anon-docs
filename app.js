// ==== State ====
let docs = JSON.parse(localStorage.getItem("docs") || "{}");
let currentId = null;
let zoom = 1.0;
let lineHeight = 1.5;

// ==== Elements ====
const sidebar = document.getElementById("sidebar");
const docList = document.getElementById("docList");
const editor = document.getElementById("editor");
const page = document.getElementById("page");
const statsEl = document.getElementById("stats");
const zoomLabel = document.getElementById("zoomLabel");
const autosaveBadge = document.getElementById("autosaveBadge");
const titleInput = document.getElementById("docTitle");

// ==== Boot ====
window.addEventListener("DOMContentLoaded", () => {
  bindUI();
  handleSharedOpen();
  renderList();
  if (!Object.keys(docs).length) newDocument(); else if (!currentId) {
    // load most recent
    const sorted = Object.entries(docs).sort((a,b) => (b[1].updated||0)-(a[1].updated||0));
    if (sorted[0]) loadDocument(sorted[0][0]);
  }
  updateStats();
  setZoom(1.0, true);
});

// ==== UI bindings ====
function bindUI(){
  // toggle sidebar (mobile)
  document.getElementById("menuToggle").onclick = () => sidebar.classList.toggle("open");
  // theme
  const themeToggle = document.getElementById("themeToggle");
  const savedTheme = localStorage.getItem("theme") || "dark";
  if (savedTheme === "light") document.body.classList.add("light");
  themeToggle.onclick = () => {
    document.body.classList.toggle("light");
    localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
  };
  // share
  document.getElementById("shareBtn").onclick = secureShare;

  // menus
  document.querySelectorAll(".menu-btn").forEach(btn=>{
    btn.addEventListener("click", (e)=>{
      const id = btn.dataset.menu;
      const menu = document.getElementById(id);
      closeAllMenus();
      const rect = btn.getBoundingClientRect();
      menu.style.left = rect.left + "px";
      menu.style.display = "flex";
      e.stopPropagation();
    });
  });
  document.addEventListener("click", closeAllMenus);

  // editor events
  editor.addEventListener("input", ()=>{
    scheduleAutosave();
    updateStats();
  });
  editor.addEventListener("keyup", (e)=>{
    if(e.key === "Tab"){ e.preventDefault(); cmd("insertText", "    "); }
  });

  // title input
  titleInput.addEventListener("input", ()=>{
    if(!currentId) return;
    docs[currentId].title = titleInput.value || "Untitled document";
    docs[currentId].updated = Date.now();
    persist();
    renderList();
  });

  // keyboard shortcuts
  document.addEventListener("keydown", (e)=>{
    const mod = e.ctrlKey || e.metaKey;
    if(mod && e.key.toLowerCase() === "s"){ e.preventDefault(); saveDocument(); }
    if(mod && e.key.toLowerCase() === "b"){ e.preventDefault(); cmd("bold"); }
    if(mod && e.key.toLowerCase() === "i"){ e.preventDefault(); cmd("italic"); }
    if(mod && e.key.toLowerCase() === "u"){ e.preventDefault(); cmd("underline"); }
    if(mod && e.key.toLowerCase() === "k"){ e.preventDefault(); insertLink(); }
    if(mod && e.key === "="){ e.preventDefault(); setZoom(zoom+0.1); }
    if(mod && e.key === "-"){ e.preventDefault(); setZoom(zoom-0.1); }
    if(mod && e.key === "0"){ e.preventDefault(); setZoom(1.0); }
    if(mod && e.shiftKey && e.key.toLowerCase()==="p"){ e.preventDefault(); secureShare(); }
  });
}

function closeAllMenus(){ document.querySelectorAll(".menu").forEach(m=>m.style.display="none"); }

// ==== Documents ====
function renderList(){
  docList.innerHTML = "";
  Object.keys(docs)
    .sort((a,b)=>(docs[b].updated||0)-(docs[a].updated||0))
    .forEach(id=>{
      const item = document.createElement("div");
      item.className = "doc-item" + (id===currentId ? " active":"");
      item.textContent = docs[id].title || "Untitled document";
      item.onclick = ()=> loadDocument(id);
      docList.appendChild(item);
    });
}
function newDocument(){
  currentId = Date.now().toString();
  docs[currentId] = { title:"Untitled document", content:"", updated:Date.now(), lh: lineHeight };
  editor.innerHTML = "";
  titleInput.value = docs[currentId].title;
  setLineHeight(1.5);
  persist(); renderList();
  toast("New document");
}
function loadDocument(id){
  currentId = id;
  const d = docs[id];
  editor.innerHTML = d.content || "";
  titleInput.value = d.title || "Untitled document";
  setLineHeight(d.lh || 1.5);
  renderList();
  sidebar.classList.remove("open");
}
function saveDocument(){
  if(!currentId) newDocument();
  docs[currentId].content = editor.innerHTML;
  docs[currentId].title = titleInput.value || "Untitled document";
  docs[currentId].lh = lineHeight;
  docs[currentId].updated = Date.now();
  persist(); renderList();
  autosaveBadge.textContent = "Saved"; autosaveBadge.style.opacity = 1;
  setTimeout(()=>autosaveBadge.style.opacity=.6, 1200);
  toast("Saved");
}
function persist(){ localStorage.setItem("docs", JSON.stringify(docs)); }

// autosave
let tAuto;
function scheduleAutosave(){
  autosaveBadge.textContent = "Saving…"; autosaveBadge.style.opacity = 1;
  clearTimeout(tAuto);
  tAuto = setTimeout(saveDocument, 900);
}

// ==== Formatting ====
function cmd(action, value=null){ document.execCommand(action, false, value); editor.focus(); }
function block(tag){ document.execCommand("formatBlock", false, tag); editor.focus(); }
function clearFormatting(){ document.execCommand("removeFormat"); block("P"); editor.focus(); }
function setLineHeight(lh){
  lineHeight = lh;
  editor.style.lineHeight = String(lh);
  if(currentId && docs[currentId]){ docs[currentId].lh = lh; persist(); }
}
function setZoom(z, silent=false){
  zoom = Math.min(1.5, Math.max(0.7, z));
  page.style.transform = `scale(${zoom})`;
  zoomLabel.textContent = Math.round(zoom*100) + "%";
  if(!silent) toast("Zoom " + zoomLabel.textContent);
}
function togglePageShade(){ page.classList.toggle("noshadow"); }

// Insert
function insertLink(){
  const url = prompt("Enter URL:");
  if(!url) return;
  document.execCommand("createLink", false, url);
}
function insertImage(e){
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = document.createElement("img");
    img.src = reader.result;
    img.style.maxWidth = "100%";
    document.execCommand("insertHTML", false, img.outerHTML);
    toast("Image inserted");
  };
  reader.readAsDataURL(file);
  e.target.value = "";
}
function insertDate(){
  const now = new Date();
  document.execCommand("insertText", false, now.toLocaleString());
}
function insertDivider(){
  const hr = '<hr style="border:none;border-top:1px solid #ccc;margin:16px 0" />';
  document.execCommand("insertHTML", false, hr);
}

// ==== Stats ====
function updateStats(){
  const text = (editor.innerText||"").trim();
  const words = text ? (text.match(/\S+/g)||[]).length : 0;
  const chars = text.replace(/\s/g,"").length;
  const mins = Math.max(1, Math.round(words/200)) || 0;
  statsEl.textContent = `${words} words · ${chars} chars · ${mins} min`;
}
setInterval(updateStats, 1000);

// ==== Export / Import ====
function download(name, content, type){
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
function exportHTML(){
  const title = (titleInput.value || "document").replace(/[^\w\-]+/g,"_");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${editor.innerHTML}</body></html>`;
  download(`${title}.html`, html, "text/html");
}
function exportTXT(){
  const title = (titleInput.value || "document").replace(/[^\w\-]+/g,"_");
  download(`${title}.txt`, editor.innerText, "text/plain");
}
function exportBackup(){
  download("anon-docs-backup.json", JSON.stringify(docs, null, 2), "application/json");
}
function importBackup(ev){
  const f = ev.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => {
    try{
      const data = JSON.parse(r.result);
      docs = {...docs, ...data};
      persist(); renderList(); toast("Backup imported");
    }catch{ alert("Invalid JSON backup"); }
  };
  r.readAsText(f);
  ev.target.value = "";
}
function printDocument(){ window.print(); }

// ==== Secure Share (AES + auto copy) ====
async function secureShare(){
  if(!currentId) saveDocument();
  const pwd = prompt("Set a password for this document:");
  if(!pwd) return;

  const payload = JSON.stringify({
    title: docs[currentId].title,
    html: docs[currentId].content,
    ts: Date.now()
  });

  try{
    const enc = CryptoJS.AES.encrypt(payload, pwd).toString();
    const url = `${location.origin}${location.pathname}?doc=${encodeURIComponent(enc)}`;
    const ok = await copy(url);
    ok ? toast("🔒 Secure link copied") : toast("⚠️ Copy failed — link shown");
    if(!ok) alert(url);
  }catch(e){
    console.error(e); alert("Failed to create secure link.");
  }
}
async function copy(text){
  try{ await navigator.clipboard.writeText(text); return true; }
  catch{
    try{
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position="fixed"; ta.style.opacity="0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy");
      ta.remove(); return true;
    }catch{ return false; }
  }
}
function handleSharedOpen(){
  const p = new URLSearchParams(location.search);
  const doc = p.get("doc"); if(!doc) return;
  const pwd = prompt("Enter password to open:");
  if(!pwd) return;
  try{
    const bytes = CryptoJS.AES.decrypt(doc, pwd);
    const json = bytes.toString(CryptoJS.enc.Utf8);
    if(!json) throw new Error("Bad password/data");
    const data = JSON.parse(json);
    editor.innerHTML = sanitizeHTML(data.html || "");
    titleInput.value = data.title || "Shared document";
    updateStats();
    if(confirm("Save a local copy?")){
      currentId = Date.now().toString();
      docs[currentId] = { title: titleInput.value, content: editor.innerHTML, updated: Date.now(), lh: lineHeight };
      persist(); renderList(); toast("Saved local copy");
    }
  }catch{ alert("Incorrect password or corrupted link."); }
}
// Basic sanitization (allow common tags)
function sanitizeHTML(html){
  // quick & simple: strip scripts if any
  return String(html).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
}

// ==== Find & Replace ====
const findModal = document.getElementById("findModal");
function openFind(){ findModal.classList.remove("hidden"); document.getElementById("findInput").focus(); }
function closeFind(){ findModal.classList.add("hidden"); }
function findNext(){
  const term = document.getElementById("findInput").value;
  if(!term) return;
  const sel = window.getSelection();
  const range = sel.rangeCount ? sel.getRangeAt(0).endOffset : 0;
  const idx = editor.innerText.indexOf(term, range);
  if(idx === -1){ toast("Not found"); return; }
  selectByTextIndex(idx, term.length);
}
function selectByTextIndex(start, len){
  // Walk text nodes to create a range
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
  let pos = 0, node, fromNode, fromOffset, toNode, toOffset;
  while((node = walker.nextNode())){
    const next = pos + node.textContent.length;
    if(fromNode==null && start >= pos && start < next){ fromNode = node; fromOffset = start - pos; }
    if(fromNode!=null && (start+len) <= next){ toNode = node; toOffset = (start+len) - pos; break; }
    pos = next;
  }
  if(fromNode && toNode){
    const r = document.createRange();
    r.setStart(fromNode, fromOffset); r.setEnd(toNode, toOffset);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
}
function replaceOne(){
  const find = document.getElementById("findInput").value;
  const rep = document.getElementById("replaceInput").value;
  if(!find) return;
  document.execCommand("insertText", false, rep);
  findNext();
}
function replaceAll(){
  const find = document.getElementById("findInput").value;
  const rep = document.getElementById("replaceInput").value;
  if(!find) return;
  editor.innerHTML = editor.innerHTML.replaceAll(find, rep);
  toast("Replaced all");
  closeFind();
  scheduleAutosave();
}

// ==== Toasts ====
function toast(msg){
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.getElementById("toasts").appendChild(t);
  setTimeout(()=> t.remove(), 2400);
}
