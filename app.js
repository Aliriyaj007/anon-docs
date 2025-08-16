/* script.js — AnonDocs upgraded
   - Quill editor for WYSIWYG editing
   - AES password protection (CryptoJS) for private docs & links
   - Public (PUB:) and Private (PRV:) self-contained share URLs
   - LocalStorage for docs and shared-links metadata
   - Export/import, print, autosave, search, themes, fonts
*/

const DOCS_KEY = 'anondocs_docs_v5';
const LINKS_KEY = 'anondocs_links_v5';
const THEME_KEY = 'anondocs_theme_v5';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let docs = JSON.parse(localStorage.getItem(DOCS_KEY) || '{}');
let sharedLinks = JSON.parse(localStorage.getItem(LINKS_KEY) || '[]');
let currentId = null;
let quill = null;

/* ---------------- Init ---------------- */
window.addEventListener('DOMContentLoaded', () => {
  initQuill();
  bindUI();
  applyTheme(localStorage.getItem(THEME_KEY) || 'hacker');
  renderDocsList();
  // Load most recent doc if exists
  const ids = Object.keys(docs).sort((a,b) => (docs[b].updated||0)-(docs[a].updated||0));
  if(ids.length) loadDoc(ids[0]);
  checkSharedParam(); // open shared link if present
  updateStats();
});

/* ---------------- Quill ---------------- */
function initQuill(){
  const Font = Quill.import('formats/font');
  Font.whitelist = ['Inter','Arial','Fira Code','Courier New','Source Sans 3'];
  Quill.register(Font, true);

  quill = new Quill('#quillEditor', {
    theme: 'snow',
    modules: {
      toolbar: '#toolbar'
    }
  });

  quill.on('text-change', () => {
    scheduleAutosave();
    updateStats();
  });
}

/* ---------------- UI Bindings ---------------- */
function bindUI(){
  $('#menuToggle').onclick = ()=> $('#sidebar').classList.toggle('open');
  $('#newBtn').onclick = createNew;
  $('#newSide').onclick = createNew;
  $('#saveBtn').onclick = saveCurrent;
  $('#shareBtn').onclick = openShareModal;

  $('#themeSelect').onchange = e => applyTheme(e.target.value);
  $('#fontSelect').onchange = e => document.querySelector('.ql-editor').style.fontFamily = e.target.value;

  $('#undoBtn').onclick = ()=> quill.history.undo();
  $('#redoBtn').onclick = ()=> quill.history.redo();

  $('#exportBtn').onclick = exportBackup;
  $('#importBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = handleImport;

  $('#printBtn').onclick = printDoc;
  $('#linksBtn').onclick = openManageModal;

  $('#searchInput').oninput = e => filterDocs(e.target.value);

  $('#generateShareBtn').onclick = generateShare;
  $('#copyShareBtn').onclick = () => copyToClipboard($('#shareUrl').value).then(ok => toast(ok? 'Copied' : 'Copy failed'));

  $('#openPwdBtn').onclick = handleOpenPassword;

  $('#viewerSaveBtn').onclick = () => {
    const html = $('#viewerContent').innerHTML;
    const id = String(Date.now());
    docs[id] = { id, title: $('#viewerTitle').textContent || 'Shared copy', content: html, created: Date.now(), updated: Date.now(), encrypted:false };
    persistDocs();
    renderDocsList();
    loadDoc(id);
    closeModal('viewer');
    toast('Saved local copy');
  };

  // keyboard shortcuts
  window.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    if(mod && e.key === 's'){ e.preventDefault(); saveCurrent(); }
    if(mod && e.key === 'n'){ e.preventDefault(); createNew(); }
    if(mod && e.key === 'b'){ e.preventDefault(); quill.format('bold', !quill.getFormat().bold); }
  });

  $('#titleInput').addEventListener('input', e => {
    if(currentId && docs[currentId]){
      docs[currentId].title = e.target.value || 'Untitled';
      docs[currentId].updated = Date.now();
      persistDocs();
      renderDocsList();
    }
  });
}

/* ---------------- Docs CRUD ---------------- */
function createNew(){
  const id = String(Date.now());
  docs[id] = { id, title: 'Untitled', content: '', created: Date.now(), updated: Date.now(), encrypted:false };
  persistDocs();
  renderDocsList();
  loadDoc(id);
  toast('New document created');
}

function renderDocsList(){
  const wrap = $('#docsList'); wrap.innerHTML = '';
  const arr = Object.values(docs).sort((a,b)=> (b.updated||0)-(a.updated||0));
  arr.forEach(d => {
    const el = document.createElement('div'); el.className = 'doc-item';
    el.innerHTML = `<div class="doc-left"><div class="doc-title">${escapeHtml(d.title)}</div><div class="doc-meta">${new Date(d.updated).toLocaleString()} ${d.encrypted? '· 🔒' : ''}</div></div>
      <div class="doc-actions"><button class="small" data-id="${d.id}" onclick="loadDoc('${d.id}')">Open</button>
      <button class="small ghost" onclick="deleteDoc('${d.id}')">Delete</button>
      <button class="small" onclick="toggleEncryptPrompt('${d.id}')">${d.encrypted? 'Unlock' : 'Protect'}</button></div>`;
    if(d.id === currentId) el.classList.add('active');
    wrap.appendChild(el);
  });
}

function loadDoc(id){
  const d = docs[id]; if(!d) return;
  currentId = id;
  if(d.encrypted){
    // ask for password to decrypt
    $('#passwordModal').dataset.pendingDoc = id;
    openModal('passwordModal');
    return;
  }
  $('#titleInput').value = d.title || 'Untitled';
  quill.root.innerHTML = d.content || '';
  renderDocsList();
  toast('Loaded');
  updateStats();
}

function saveCurrent(){
  if(!currentId){
    createNew();
    return;
  }
  const content = quill.root.innerHTML;
  docs[currentId].content = content;
  docs[currentId].title = $('#titleInput').value || docs[currentId].title || 'Untitled';
  docs[currentId].updated = Date.now();
  persistDocs();
  renderDocsList();
  toast('Saved');
}

function deleteDoc(id){
  if(!confirm('Delete document?')) return;
  delete docs[id];
  persistDocs();
  if(currentId === id) {
    currentId = null; quill.root.innerHTML = ''; $('#titleInput').value = '';
  }
  renderDocsList();
  toast('Deleted');
}

/* ---------------- Encryption (password protection) ---------------- */
function toggleEncryptPrompt(id){
  const doc = docs[id];
  if(!doc) return;
  if(doc.encrypted){
    // unlock (ask password and decrypt)
    $('#passwordModal').dataset.pendingDoc = id;
    openModal('passwordModal');
  } else {
    const pwd = prompt('Set a password to protect this document (you will need it to open):');
    if(!pwd) return;
    const ciphertext = CryptoJS.AES.encrypt(JSON.stringify({content:doc.content, title: doc.title}), pwd).toString();
    docs[id].content = ciphertext;
    docs[id].encrypted = true;
    docs[id].updated = Date.now();
    persistDocs();
    renderDocsList();
    toast('Document protected');
    if(currentId === id){ quill.root.innerHTML = ''; $('#titleInput').value = 'Encrypted'; }
  }
}

function handleOpenPassword(){
  const pwd = $('#openPassword').value;
  const id = $('#passwordModal').dataset.pendingDoc;
  if(!id || !pwd) return;
  try{
    const doc = docs[id];
    if(!doc) throw new Error('Doc missing');
    const bytes = CryptoJS.AES.decrypt(doc.content, pwd);
    const decoded = bytes.toString(CryptoJS.enc.Utf8);
    if(!decoded) throw new Error('Bad password');
    const obj = JSON.parse(decoded);
    // replace stored content with decrypted plain content? We'll keep encrypted flag - but allow viewing in session.
    doc.content = obj.content;
    doc.title = obj.title;
    doc.encrypted = false; // choose to keep it decrypted after successful unlock
    doc.updated = Date.now();
    persistDocs();
    closeModal('passwordModal');
    loadDoc(id);
    $('#openPassword').value = '';
    toast('Decrypted');
  }catch(e){
    alert('Incorrect password or corrupted file.');
  }
}

/* ---------------- Autosave ---------------- */
let autosaveTimer = null;
function scheduleAutosave(){
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(()=> {
    if(currentId) saveCurrent();
  }, 900);
}

/* ---------------- Export / Import ---------------- */
function exportBackup(){
  const filename = `anondocs_backup_${Date.now()}.json`;
  const data = JSON.stringify(docs, null, 2);
  download(filename, data, 'application/json');
  toast('Backup exported');
}
function handleImport(e){
  const f = e.target.files[0]; if(!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const imported = JSON.parse(reader.result);
      docs = {...docs, ...imported};
      persistDocs();
      renderDocsList();
      toast('Backup imported');
    }catch(err){
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(f);
}

/* ---------------- Printing ---------------- */
function printDoc(){
  // print only the editor content
  const content = quill.root.innerHTML;
  const title = escapeHtml($('#titleInput').value || 'Document');
  const w = window.open('', '_blank', 'noopener');
  if(!w){ alert('Popup blocked. Allow popups to print.'); return; }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:system-ui, Arial; padding:20px; color:#111} img{max-width:100%;height:auto}</style></head><body>${content}</body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = ()=> { w.focus(); w.print(); };
}

/* ---------------- Share (public & private) ---------------- */
function openShareModal(){
  if(!currentId){ alert('Save or create a document first'); return; }
  $('#shareExpiry').value = '7';
  $('#sharePublic').checked = false;
  $('#sharePassword').value = '';
  $('#shareResult').classList.add('hidden');
  openModal('shareModal');
}

function generateShare(){
  if(!currentId) return;
  const days = Number($('#shareExpiry').value);
  const isPublic = $('#sharePublic').checked;
  const pwd = $('#sharePassword').value;
  if(!isPublic && !pwd){ alert('Private link requires a password'); return; }

  // build payload
  const payload = {
    title: $('#titleInput').value || 'Untitled',
    html: quill.root.innerHTML,
    created: Date.now(),
    expires: days > 0 ? Date.now() + days*24*60*60*1000 : null
  };

  let encoded = '';
  if(isPublic){
    encoded = 'PUB:' + btoa(JSON.stringify(payload));
  } else {
    encoded = 'PRV:' + CryptoJS.AES.encrypt(JSON.stringify(payload), pwd).toString();
  }

  const url = `${location.origin}${location.pathname}?shared=${encodeURIComponent(encoded)}`;
  // save record locally
  const rec = { id: String(Date.now()), docId: currentId, url, public: isPublic, created: payload.created, expires: payload.expires };
  sharedLinks.unshift(rec);
  persistLinks();

  $('#shareUrl').value = url;
  $('#shareMeta').textContent = `Expires: ${payload.expires ? new Date(payload.expires).toLocaleString() : 'Never'} · ${isPublic ? 'Public' : 'Private'}`;
  $('#shareResult').classList.remove('hidden');

  copyToClipboard(url).then(ok => toast(ok? 'Link copied to clipboard' : 'Copy failed'));
}

/* Shared Links Manager */
function openManageModal(){
  renderSharedList();
  openModal('manageModal');
}
function renderSharedList(){
  const wrap = $('#sharedList'); wrap.innerHTML = '';
  if(!sharedLinks.length){ wrap.innerHTML = '<div class="muted">No shared links yet</div>'; return; }
  sharedLinks.forEach(rec => {
    const item = document.createElement('div'); item.className = 'shared-item';
    const left = document.createElement('div'); left.innerHTML = `<div style="font-weight:600">${escapeHtml(docs[rec.docId]?.title || '(deleted)')}</div>
      <div style="font-size:12px;color:var(--muted)">Created: ${new Date(rec.created).toLocaleString()} · Expires: ${rec.expires ? new Date(rec.expires).toLocaleString() : 'Never'}</div>`;
    const right = document.createElement('div');
    const copyBtn = makeSmall('Copy', ()=> copyToClipboard(rec.url).then(ok => toast(ok? 'Copied' : 'Copy failed')));
    const openBtn = makeSmall('Open', ()=> window.open(rec.url, '_blank'));
    const toggleBtn = makeSmall(rec.public ? 'Make Private' : 'Make Public', ()=> togglePublic(rec.id));
    const revokeBtn = makeSmall('Revoke', ()=> { if(confirm('Revoke link?')) { revokeLink(rec.id); } });
    [copyBtn, openBtn, toggleBtn, revokeBtn].forEach(b => right.appendChild(b));
    item.appendChild(left); item.appendChild(right); wrap.appendChild(item);
  });
}
function makeSmall(txt, fn){ const b = document.createElement('button'); b.className = 'small'; b.textContent = txt; b.onclick = fn; return b; }
function togglePublic(id){
  const rec = sharedLinks.find(r => r.id === id); if(!rec) return;
  const doc = docs[rec.docId]; if(!doc){ alert('Original document missing'); return; }
  const payload = { title: doc.title, html: doc.content, created: Date.now(), expires: rec.expires };
  if(rec.public){
    const pwd = prompt('Set password for private link:'); if(!pwd) return;
    const enc = 'PRV:' + CryptoJS.AES.encrypt(JSON.stringify(payload), pwd).toString();
    rec.url = `${location.origin}${location.pathname}?shared=${encodeURIComponent(enc)}`; rec.public = false;
  } else {
    const b = 'PUB:' + btoa(JSON.stringify(payload));
    rec.url = `${location.origin}${location.pathname}?shared=${encodeURIComponent(b)}`; rec.public = true;
  }
  persistLinks();
  renderSharedList();
  toast('Link updated');
}
function revokeLink(id){
  sharedLinks = sharedLinks.filter(r => r.id !== id);
  persistLinks();
  renderSharedList();
  toast('Revoked');
}

/* ---------------- Incoming shared URL handling ---------------- */
function checkSharedParam(){
  const params = new URLSearchParams(window.location.search);
  const s = params.get('shared');
  if(!s) return;
  const raw = decodeURIComponent(s);
  if(raw.startsWith('PUB:')){
    try{
      const payload = JSON.parse(atob(raw.slice(4)));
      if(payload.expires && Date.now() > payload.expires){ alert('This shared link has expired'); return; }
      showSharedViewer(payload);
    }catch(e){ alert('Invalid public share link'); }
  } else if(raw.startsWith('PRV:')){
    // store cipher text and show password modal to decrypt
    $('#passwordModal').dataset.incoming = raw.slice(4);
    openModal('passwordModal');
    $('#openPwdBtn').onclick = () => {
      const pwd = $('#openPassword').value;
      if(!pwd) return;
      try{
        const bytes = CryptoJS.AES.decrypt($('#passwordModal').dataset.incoming, pwd);
        const json = bytes.toString(CryptoJS.enc.Utf8);
        if(!json) throw new Error('bad');
        const payload = JSON.parse(json);
        if(payload.expires && Date.now() > payload.expires){ alert('This shared link has expired'); closeModal('passwordModal'); return; }
        closeModal('passwordModal');
        showSharedViewer(payload);
      }catch(e){ alert('Incorrect password or corrupted link'); }
    };
  }
}

function showSharedViewer(payload){
  $('#viewerTitle').textContent = payload.title || 'Shared';
  $('#viewerContent').innerHTML = payload.html || '';
  openModal('viewer');
}

/* ---------------- Helpers ---------------- */
function persistDocs(){ localStorage.setItem(DOCS_KEY, JSON.stringify(docs)); }
function persistLinks(){ localStorage.setItem(LINKS_KEY, JSON.stringify(sharedLinks)); }
function persistTheme(t){ localStorage.setItem(THEME_KEY, t); }

function persistDocsAndUI(){
  persistDocs();
  renderDocsList();
}

function download(filename, content, type){
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadFile(name, content, type='text/plain'){
  download(name, content, type);
}

function escapeHtml(str){ if(!str) return ''; return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[s])); }

function copyToClipboard(text){
  return navigator.clipboard?.writeText(text).then(()=>true).catch(async ()=>{
    try{
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position='fixed'; ta.style.opacity=0; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove(); return true;
    }catch(e){ return false; }
  });
}

function makeId(){ return String(Date.now()); }

function toast(msg, ms=2200){
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(()=> t.remove(), ms);
}

/* ---------------- Search & Filter ---------------- */
function filterDocs(q){
  q = String(q || '').toLowerCase();
  $$('.doc-item').forEach(el => {
    const title = el.querySelector('.doc-title')?.textContent?.toLowerCase() || '';
    el.style.display = title.includes(q) ? '' : 'none';
  });
}

/* ---------------- Theme ---------------- */
function applyTheme(name){
  document.documentElement.classList.remove('hacker','dark','cyber','light');
  if(!name) name = 'hacker';
  if(name === 'hacker') document.documentElement.classList.add('hacker');
  else if(name === 'cyber') document.documentElement.classList.add('cyber');
  else if(name === 'light') document.documentElement.classList.add('light');
  else document.documentElement.classList.add('dark');
  persistTheme(name);
}

/* ---------------- Modal helpers ---------------- */
function openModal(id){ $(`#${id}`).classList.remove('hidden'); }
function closeModal(id){ $(`#${id}`).classList.add('hidden'); }

/* ---------------- Print ---------------- */
// already implemented in printDoc()

/* ---------------- Persist ---------------- */
function persistDocs(){ localStorage.setItem(DOCS_KEY, JSON.stringify(docs)); }
function persistLinks(){ localStorage.setItem(LINKS_KEY, JSON.stringify(sharedLinks)); }

/* ---------------- Shared Records persistence wrapper (fix dup names) */
function persistDocs(){ localStorage.setItem(DOCS_KEY, JSON.stringify(docs)); }
function persistLinks(){ localStorage.setItem(LINKS_KEY, JSON.stringify(sharedLinks)); }

/* ---------------- Render & utility calls ---------------- */
function renderDocsList(){ // already defined above but ensure call safe
  const wrap = $('#docsList'); wrap.innerHTML = '';
  const arr = Object.values(docs).sort((a,b)=> (b.updated||0)-(a.updated||0));
  arr.forEach(d => {
    const el = document.createElement('div'); el.className = 'doc-item';
    el.innerHTML = `<div class="doc-left"><div class="doc-title">${escapeHtml(d.title)}</div><div class="doc-meta">${new Date(d.updated).toLocaleString()} ${d.encrypted? '· 🔒' : ''}</div></div>
      <div class="doc-actions"><button class="small" onclick="loadDoc('${d.id}')">Open</button>
      <button class="small ghost" onclick="deleteDoc('${d.id}')">Delete</button>
      <button class="small" onclick="toggleEncryptPrompt('${d.id}')">${d.encrypted? 'Unlock' : 'Protect'}</button></div>`;
    if(d.id === currentId) el.classList.add('active');
    wrap.appendChild(el);
  });
}

/* ---------------- Update Stats ---------------- */
function updateStats(){
  const text = quill.getText().trim();
  const words = text ? (text.match(/\S+/g) || []).length : 0;
  const chars = text.replace(/\s/g,'').length;
  $('#stats').textContent = `${words} words · ${chars} chars`;
}

/* ---------------- Small note: ensure persistence functions exist (avoid overwritten) ---------------- */
persistDocs = persistDocs;
persistLinks = persistLinks;

/* ---------------- End ---------------- */