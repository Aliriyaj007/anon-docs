/* ========= AnonDocs — app.js =========
   - Separate JS for index.html
   - Uses CryptoJS (loaded in index.html)
   - Stores docs and shared links in localStorage
*/

/* ---------- Utilities ---------- */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
function now(){ return Date.now(); }
function formatDate(ts){ if(!ts) return "Never"; return new Date(ts).toLocaleString(); }
function toast(msg, time=2200){
  const t = document.createElement('div'); t.className='toast'; t.textContent=msg; $('#toasts').appendChild(t);
  setTimeout(()=> t.remove(), time);
}
async function copyToClipboard(text){
  try { await navigator.clipboard.writeText(text); return true; } catch(e){}
  try { const ta = document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true; } catch(e){ return false; }
}
function sanitize(html){ return String(html).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ''); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }

/* ---------- Storage Keys ---------- */
const KEY_DOCS = 'anon_docs_v1';
const KEY_SHARED = 'anon_shared_links_v1';
const KEY_TIPS = 'anon_tooltips_v1';
const KEY_THEME = 'anon_theme_v1';

/* ---------- Models ---------- */
let docs = JSON.parse(localStorage.getItem(KEY_DOCS) || '{}');
let sharedLinks = JSON.parse(localStorage.getItem(KEY_SHARED) || '[]');
let currentId = null;

/* ---------- Elements ---------- */
const editor = $('#editor');
const docsList = $('#docs-list');
const titleInput = $('#title');
const autosaveBadge = $('#autosave');
const shareModal = $('#share-modal');
const manageModal = $('#manage-modal');
const shareResult = $('#share-result');
const shareUrlInput = $('#share-url');
const shareMeta = $('#share-meta');
const tipEl = $('#tip');

/* ---------- Boot ---------- */
window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem(KEY_THEME) || 'dark';
  if(savedTheme === 'light') document.documentElement.classList.add('light');

  bindUI();
  renderDocs();
  handleSharedOpen();
  const ids = Object.keys(docs).sort((a,b) => (docs[b].updated||0)-(docs[a].updated||0));
  if(ids.length) loadDoc(ids[0]); else newDoc();
  updateStats();
});

/* ---------- UI Binding ---------- */
function bindUI(){
  $('#menu-toggle').addEventListener('click', ()=> $('#sidebar').classList.toggle('open'));
  $('#new-btn').addEventListener('click', newDoc);
  $('#side-new').addEventListener('click', newDoc);
  $('#save-btn').addEventListener('click', saveDoc);
  $('#print-btn').addEventListener('click', printDocument);
  $('#share-btn').addEventListener('click', openShareModal);
  $('#manage-shares-btn').addEventListener('click', openManageModal);

  $('#theme-toggle').addEventListener('click', ()=>{
    document.documentElement.classList.toggle('light');
    const active = document.documentElement.classList.contains('light') ? 'light' : 'dark';
    localStorage.setItem(KEY_THEME, active);
  });

  titleInput.addEventListener('input', ()=>{
    if(!currentId) return;
    docs[currentId].title = titleInput.value || 'Untitled';
    docs[currentId].updated = now();
    persistDocs();
    renderDocs();
  });

  $('#styleBlock').addEventListener('change', (e)=> formatBlock(e.target.value));
  $$('#toolbar .icon, .btn, .icon.upload').forEach(el=>{
    el.addEventListener('mouseenter', showFirstTipDelayed);
  });

  editor.addEventListener('input', ()=> {
    scheduleAutosave();
    updateStats();
  });
  editor.addEventListener('keydown', (ev)=>{
    if((ev.ctrlKey||ev.metaKey) && ev.key.toLowerCase()==='s'){ ev.preventDefault(); saveDoc(); }
    if((ev.ctrlKey||ev.metaKey) && ev.key.toLowerCase()==='k'){ ev.preventDefault(); insertLink(); }
  });

  $('#find-input').addEventListener('keydown', (e)=> { if(e.key==='Enter') findNext(); });

  $('#share-public') && $('#share-public').addEventListener('change', ()=> {
    $('#password-row').style.display = $('#share-public').checked ? 'none' : 'block';
  });
  $('#generate-share') && $('#generate-share').addEventListener('click', generateShare);

  $('#copy-share') && $('#copy-share').addEventListener('click', async ()=>{
    const url = shareUrlInput.value;
    const ok = await copyToClipboard(url);
    toast(ok ? 'Copied' : 'Copy failed');
  });

  manageModal && manageModal.addEventListener('click', (e)=> { if(e.target === manageModal) closeModal('manage-modal'); });
  shareModal && shareModal.addEventListener('click', (e)=> { if(e.target === shareModal) closeModal('share-modal'); });

  document.addEventListener('click', ()=> $$('.menu').forEach(m=> m.style.display='none'));
}

/* ---------- Docs CRUD ---------- */
function persistDocs(){ localStorage.setItem(KEY_DOCS, JSON.stringify(docs)); }
function persistShared(){ localStorage.setItem(KEY_SHARED, JSON.stringify(sharedLinks)); }

function newDoc(){
  const id = String(Date.now());
  docs[id] = { id, title: 'Untitled', content: '', created: now(), updated: now() };
  persistDocs();
  renderDocs();
  loadDoc(id);
  toast('New document created');
}

function renderDocs(){
  docsList.innerHTML = '';
  const sorted = Object.values(docs).sort((a,b)=> (b.updated||0)-(a.updated||0));
  sorted.forEach(d=>{
    const item = document.createElement('div'); item.className='doc-item'; item.textContent = d.title;
    item.addEventListener('click', ()=> loadDoc(d.id));
    if(d.id === currentId) item.classList.add('active');
    docsList.appendChild(item);
  });
}

function loadDoc(id){
  const d = docs[id];
  if(!d) return;
  currentId = id;
  editor.innerHTML = d.content || '';
  titleInput.value = d.title || 'Untitled';
  renderDocs();
  updateStats();
}

let autosaveTimer = null;
function scheduleAutosave(){
  autosaveBadge.textContent = 'Saving...'; autosaveBadge.style.opacity=1;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(()=> {
    saveDoc();
    autosaveBadge.textContent = 'Saved'; autosaveBadge.style.opacity=.7;
  }, 900);
}

function saveDoc(){
  if(!currentId) { newDoc(); return; }
  docs[currentId].content = sanitize(editor.innerHTML);
  docs[currentId].title = titleInput.value || deriveTitleFromContent(editor.innerHTML) || 'Untitled';
  docs[currentId].updated = now();
  persistDocs();
  renderDocs();
  toast('Saved');
}

function deriveTitleFromContent(html){
  const text = stripTags(html).trim();
  return (text.split('\n')[0]||'').slice(0,40);
}
function stripTags(s){ return String(s).replace(/<[^>]+>/g,''); }

/* ---------- Formatting & Insert ---------- */
function execCmd(cmd, value=null){ document.execCommand(cmd, false, value); editor.focus(); }
function formatBlock(tag){ document.execCommand('formatBlock', false, tag); editor.focus(); }
function insertLink(){
  const url = prompt('Enter URL (include https://):');
  if(!url) return;
  execCmd('createLink', url);
}
function insertImage(e){
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = ()=> {
    execCmd('insertImage', reader.result);
    toast('Image inserted');
  };
  reader.readAsDataURL(f);
  e.target.value = '';
}

/* ---------- Find ---------- */
let lastFindIndex = 0;
function findNext(){
  const term = $('#find-input').value;
  if(!term) return;
  const text = editor.innerText;
  const idx = text.indexOf(term, lastFindIndex+1);
  if(idx === -1){
    lastFindIndex = 0; toast('Not found');
    return;
  }
  selectTextByIndex(idx, term.length);
  lastFindIndex = idx;
}
function selectTextByIndex(start, len){
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node, pos=0, startNode, endNode, startOffset, endOffset;
  while(node = walker.nextNode()){
    const nextPos = pos + node.textContent.length;
    if(startNode==null && start >= pos && start < nextPos){ startNode = node; startOffset = start-pos; }
    if(startNode && (start+len) <= nextPos){ endNode = node; endOffset = (start+len)-pos; break; }
    pos = nextPos;
  }
  if(startNode && endNode){
    const range = document.createRange();
    range.setStart(startNode, startOffset); range.setEnd(endNode, endOffset);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }
}

/* ---------- Printing ---------- */
function printDocument(){
  const html = `
    <!doctype html><html><head>
    <meta charset="utf-8"><title>${escapeHtml(titleInput.value || 'Document')}</title>
    <style>
      @media print { @page { margin: 20mm } body { margin: 0; font-family: system-ui, Arial; color: #111 } }
      body{ padding: 20px; }
      img{ max-width:100%; height:auto; }
    </style>
    </head><body>${sanitize(editor.innerHTML)}</body></html>
  `;
  const w = window.open('', '_blank', 'noopener');
  if(!w){ alert('Popup blocked — allow popups to use print.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}

/* ---------- Sharing ---------- */
function openShareModal(){
  if(!currentId){ alert('Save or create a document first.'); return; }
  $('#share-expiry').value = '7';
  $('#share-public').checked = false;
  $('#share-password').value = '';
  $('#password-row').style.display = 'block';
  shareResult && shareResult.classList.add('hidden');
  openModal('share-modal');
}

function generateShare(){
  const expiryDays = Number($('#share-expiry').value);
  const isPublic = $('#share-public').checked;
  const password = $('#share-password').value;
  if(!isPublic && !password){ alert('Private links require a password.'); return; }

  const payload = {
    title: titleInput.value || 'Untitled',
    html: editor.innerHTML,
    createdAt: now(),
    expiresAt: expiryDays>0 ? now() + expiryDays*24*60*60*1000 : null,
    docId: currentId
  };

  let encoded = '';
  if(isPublic){
    encoded = 'PUB:' + btoa(JSON.stringify(payload));
  } else {
    encoded = 'PRV:' + CryptoJS.AES.encrypt(JSON.stringify(payload), password).toString();
  }
  const url = `${location.origin}${location.pathname}?shared=${encodeURIComponent(encoded)}`;

  const record = {
    id: String(Date.now()),
    docId: currentId,
    url,
    public: isPublic,
    createdAt: payload.createdAt,
    expiresAt: payload.expiresAt
  };
  sharedLinks.unshift(record);
  persistShared();

  if(shareResult){
    shareUrlInput.value = url;
    shareMeta.textContent = 'Expires: ' + (payload.expiresAt ? formatDate(payload.expiresAt) : 'Never') + (isPublic ? ' · Public link' : ' · Private (password required)');
    shareResult.classList.remove('hidden');
  }

  copyToClipboard(url).then(ok=>{
    if(ok) toast('Secure link copied to clipboard');
    else toast('Could not auto-copy — use copy button');
  });
}

function openManageModal(){
  renderSharedList();
  openModal('manage-modal');
}

function renderSharedList(){
  const wrap = $('#shared-links-list'); wrap.innerHTML = '';
  if(!sharedLinks.length){ wrap.innerHTML = '<div class="muted">No shared links yet</div>'; return; }
  sharedLinks.forEach(rec=>{
    const item = document.createElement('div'); item.className='shared-item';
    const left = document.createElement('div'); left.className='left';
    const title = docs[rec.docId] ? docs[rec.docId].title : '(deleted)';
    left.innerHTML = `<div class="s-title">${escapeHtml(title)}</div>
                      <div class="s-meta">Created: ${formatDate(rec.createdAt)} · Expires: ${rec.expiresAt ? formatDate(rec.expiresAt) : 'Never'}</div>`;
    const right = document.createElement('div'); right.className='right';
    const copyBtn = document.createElement('button'); copyBtn.className='small'; copyBtn.textContent='Copy';
    copyBtn.addEventListener('click', ()=> { copyToClipboard(rec.url).then(ok=> toast(ok?'Copied':'Copy failed')); });

    const openBtn = document.createElement('button'); openBtn.className='small ghost'; openBtn.textContent='Open';
    openBtn.addEventListener('click', ()=> window.open(rec.url, '_blank'));

    const toggleBtn = document.createElement('button'); toggleBtn.className='small'; toggleBtn.textContent = rec.public ? 'Make Private' : 'Make Public';
    toggleBtn.addEventListener('click', ()=> togglePublic(rec.id));

    const revokeBtn = document.createElement('button'); revokeBtn.className='small ghost'; revokeBtn.textContent='Revoke';
    revokeBtn.addEventListener('click', ()=> { if(confirm('Revoke this link?')) revokeLink(rec.id); });

    right.appendChild(copyBtn); right.appendChild(openBtn); right.appendChild(toggleBtn); right.appendChild(revokeBtn);
    item.appendChild(left); item.appendChild(right);
    wrap.appendChild(item);
  });
}

function togglePublic(recId){
  const rec = sharedLinks.find(r=>r.id===recId);
  if(!rec) return;
  const doc = docs[rec.docId];
  if(!doc){ alert('Original document no longer available'); return; }
  const payload = {
    title: doc.title,
    html: doc.content,
    createdAt: now(),
    expiresAt: rec.expiresAt,
    docId: rec.docId
  };
  if(rec.public){
    const pwd = prompt('Make private — set a password:');
    if(!pwd) return;
    const enc = 'PRV:' + CryptoJS.AES.encrypt(JSON.stringify(payload), pwd).toString();
    rec.url = `${location.origin}${location.pathname}?shared=${encodeURIComponent(enc)}`;
    rec.public = false;
  } else {
    const b = 'PUB:' + btoa(JSON.stringify(payload));
    rec.url = `${location.origin}${location.pathname}?shared=${encodeURIComponent(b)}`;
    rec.public = true;
  }
  persistShared(); renderSharedList(); toast('Link updated');
}

function revokeLink(recId){
  sharedLinks = sharedLinks.filter(r => r.id !== recId);
  persistShared();
  renderSharedList();
  toast('Link revoked');
}

/* ---------- Open shared link flow ---------- */
function handleSharedOpen(){
  const params = new URLSearchParams(location.search);
  const s = params.get('shared');
  if(!s) return;
  const decoded = decodeURIComponent(s);
  if(decoded.startsWith('PUB:')){
    try{
      const payload = JSON.parse(atob(decoded.slice(4)));
      if(payload.expiresAt && Date.now() > payload.expiresAt){ alert('This shared link has expired.'); return; }
      openSharedPayload(payload);
    } catch(e){ alert('Invalid share link'); }
  } else if(decoded.startsWith('PRV:')){
    const cipher = decoded.slice(4);
    const pwd = prompt('Enter password to open shared document:');
    if(!pwd) return;
    try{
      const bytes = CryptoJS.AES.decrypt(cipher, pwd);
      const json = bytes.toString(CryptoJS.enc.Utf8);
      if(!json) throw new Error('bad');
      const payload = JSON.parse(json);
      if(payload.expiresAt && Date.now() > payload.expiresAt){ alert('This shared link has expired.'); return; }
      openSharedPayload(payload);
    } catch(e){ alert('Incorrect password or corrupted link'); }
  } else {
    alert('Invalid share format');
  }
}

function openSharedPayload(payload){
  editor.innerHTML = sanitize(payload.html || '');
  titleInput.value = payload.title || 'Shared Document';
  if(confirm('Open successful. Save a local copy of this shared doc?')){
    const id = String(Date.now());
    docs[id] = { id, title: titleInput.value, content: editor.innerHTML, created: now(), updated: now() };
    persistDocs();
    renderDocs();
    loadDoc(id);
    toast('Saved local copy');
  }
}

/* ---------- Modals & helpers ---------- */
function openModal(id){ document.getElementById(id).classList.remove('hidden'); }
function closeModal(id){ document.getElementById(id).classList.add('hidden'); }

/* ---------- Tooltips (first-time) ---------- */
function showFirstTipDelayed(e){
  const el = e.currentTarget;
  const key = el.dataset.tipKey;
  const tipText = el.dataset.tip;
  if(!key || !tipText) return;
  const shown = JSON.parse(localStorage.getItem(KEY_TIPS) || '{}');
  if(shown[key]) return;
  const rect = el.getBoundingClientRect();
  tipEl.textContent = tipText;
  tipEl.style.top = (rect.bottom + 8 + window.scrollY) + 'px';
  tipEl.style.left = (rect.left + (rect.width/2) - 120 + window.scrollX) + 'px';
  tipEl.classList.remove('hidden');
  setTimeout(()=> tipEl.classList.add('hidden'), 4200);
  shown[key] = true;
  localStorage.setItem(KEY_TIPS, JSON.stringify(shown));
}

/* ---------- Stats ---------- */
function updateStats(){
  const txt = (editor.innerText||'').trim();
  const words = txt ? (txt.match(/\S+/g)||[]).length : 0;
  const chars = (txt.replace(/\s/g,'')).length;
  $('#stats').textContent = `${words} words · ${chars} chars`;
}
setInterval(updateStats, 1000);
