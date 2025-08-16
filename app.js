/* app.js — AnonDocs core logic
   - Docs stored in localStorage
   - Shared links stored in localStorage
   - Private share = AES encrypted (CryptoJS)
   - Public share = base64 encoded JSON
*/

/* --------------------------
   Utilities & Storage keys
   -------------------------- */
const DOCS_KEY = 'anon_docs_v2';
const LINKS_KEY = 'anon_shared_v2';
const TIPS_KEY = 'anon_tips_v2';
const THEME_KEY = 'anon_theme_v2';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function now(){ return Date.now(); }
function toast(msg, ms=2200){
  const t = document.createElement('div'); t.className='toast'; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(()=> t.remove(), ms);
}
async function copyToClipboard(text){
  try { await navigator.clipboard.writeText(text); return true; }
  catch(e){
    try { const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true; }
    catch(e2){ return false; }
  }
}
function sanitize(html){ return String(html).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ''); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }

/* --------------------------
   Load / Save models
   -------------------------- */
let docs = JSON.parse(localStorage.getItem(DOCS_KEY) || '{}');
let sharedLinks = JSON.parse(localStorage.getItem(LINKS_KEY) || '[]');
let currentId = null;
const editor = $('#editor');

/* --------------------------
   Init on DOM ready
   -------------------------- */
window.addEventListener('DOMContentLoaded', () => {
  bindUI();
  applySavedTheme();
  renderDocsList();
  handleIncomingShared(); // open shared link if present
  // if no docs create one
  if(Object.keys(docs).length === 0) createNewDoc();
  else {
    // load most recent
    const ids = Object.keys(docs).sort((a,b)=> (docs[b].updated||0)-(docs[a].updated||0));
    if(ids.length) loadDoc(ids[0]);
  }
  updateStats();
});

/* --------------------------
   UI Bindings
   -------------------------- */
function bindUI(){
  // Top actions
  $('#menuToggle').addEventListener('click', ()=> $('#sidebar').classList.toggle('open'));
  $('#newBtn').addEventListener('click', createNewDoc);
  $('#saveBtn').addEventListener('click', saveCurrentDoc);
  $('#shareBtn').addEventListener('click', openShareModal);
  $('#themeSelect').value = localStorage.getItem(THEME_KEY) || 'dark';
  $('#themeSelect').addEventListener('change', e => { setTheme(e.target.value); });

  // Toolbar formatting handlers (buttons w/ data-cmd)
  $$('#toolbar [data-cmd]').forEach(btn => {
    btn.addEventListener('click', ()=> doCmd(btn.dataset.cmd));
    btn.addEventListener('mouseenter', showFirstTip);
  });

  // other toolbar controls
  $('#fontFamily').addEventListener('change', e => doCmd('fontName', e.target.value));
  $('#fontSize').addEventListener('change', e => doCmd('fontSize', e.target.value));
  $('#blockFormat').addEventListener('change', e => doCmd('formatBlock', e.target.value));
  $('#textColor').addEventListener('change', e => doCmd('foreColor', e.target.value));
  $('#highlightColor').addEventListener('change', e => doCmd('hiliteColor', e.target.value));
  $('#linkBtn').addEventListener('click', insertLink);
  $('#imageInput').addEventListener('change', insertImage);
  $('#findBtn').addEventListener('click', openFindDialog);

  $('#undoBtn').addEventListener('click', ()=> doCmd('undo'));
  $('#redoBtn').addEventListener('click', ()=> doCmd('redo'));
  $('#printBtn').addEventListener('click', printDocument);

  // Share modal
  $('#sharePublic').addEventListener('change', ()=> {
    $('#passRow').style.display = $('#sharePublic').checked ? 'none' : 'block';
  });
  $('#generateShareBtn').addEventListener('click', generateShare);
  $('#copyShareBtn').addEventListener('click', ()=> {
    const url = $('#shareUrl').value; copyToClipboard(url).then(ok=> toast(ok? 'Copied' : 'Copy failed'));
  });

  // Manage modal open
  $('#manageBtn') && $('#manageBtn').addEventListener('click', ()=> openManageModal());
  $('#shareBtn') && $('#shareBtn').addEventListener('mouseenter', showFirstTip);

  // editor events
  editor.addEventListener('input', ()=> { scheduleAutosave(); updateStats(); });
  editor.addEventListener('keydown', (e)=>{
    const mod = e.ctrlKey || e.metaKey;
    if(mod && e.key.toLowerCase() === 's'){ e.preventDefault(); saveCurrentDoc(); }
    if(mod && e.key.toLowerCase() === 'b'){ e.preventDefault(); doCmd('bold'); }
    if(mod && e.key.toLowerCase() === 'k'){ e.preventDefault(); insertLink(); }
  });

  // title change
  $('#titleInput').addEventListener('input', e => {
    if(!currentId) return;
    docs[currentId].title = e.target.value || 'Untitled';
    docs[currentId].updated = now();
    persistDocs();
    renderDocsList();
  });

  // image input hover tooltip
  $$('#toolbar [data-tip]').forEach(el => el.addEventListener('mouseenter', showFirstTip));
}

/* --------------------------
   Commands & Editor utilities
   -------------------------- */
function doCmd(cmd, val=null){
  document.execCommand(cmd, false, val);
  editor.focus();
}
function insertLink(){
  const url = prompt('Enter URL (include https://):');
  if(!url) return;
  document.execCommand('createLink', false, url);
}
function insertImage(e){
  const file = e.target.files?.[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const imgHtml = `<img src="${reader.result}" style="max-width:100%;height:auto;" />`;
    document.execCommand('insertHTML', false, imgHtml);
    toast('Image inserted');
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

/* --------------------------
   Docs CRUD
   -------------------------- */
function persistDocs(){ localStorage.setItem(DOCS_KEY, JSON.stringify(docs)); }
function persistLinks(){ localStorage.setItem(LINKS_KEY, JSON.stringify(sharedLinks)); }

function createNewDoc(){
  const id = String(now());
  docs[id] = { id, title: 'Untitled', content: '', created: now(), updated: now() };
  persistDocs();
  renderDocsList();
  loadDoc(id);
  toast('New document');
}

function renderDocsList(){
  const wrap = $('#docsList'); wrap.innerHTML = '';
  const arr = Object.values(docs).sort((a,b)=> (b.updated||0)-(a.updated||0));
  arr.forEach(d => {
    const item = document.createElement('div'); item.className='doc-item'; item.textContent = d.title;
    item.addEventListener('click', ()=> loadDoc(d.id));
    if(d.id === currentId) item.classList.add('active');
    wrap.appendChild(item);
  });
}

function loadDoc(id){
  const d = docs[id]; if(!d) return;
  currentId = id;
  editor.innerHTML = d.content || '';
  $('#titleInput').value = d.title || 'Untitled';
  renderDocsList();
  updateStats();
}

function saveCurrentDoc(){
  if(!currentId){ createNewDoc(); return; }
  docs[currentId].content = sanitize(editor.innerHTML);
  docs[currentId].title = $('#titleInput').value || deriveTitle(docs[currentId].content) || 'Untitled';
  docs[currentId].updated = now();
  persistDocs();
  renderDocsList();
  toast('Saved');
}
function deriveTitle(html){
  const text = (html || '').replace(/<[^>]+>/g,' ').trim();
  return (text.split('\n')[0] || '').slice(0,60);
}

/* Autosave */
let autosaveTimer = null;
function scheduleAutosave(){
  $('#statusBadge').textContent = 'Saving...'; $('#statusBadge').style.opacity = 1;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(()=> {
    saveCurrentDoc();
    $('#statusBadge').textContent = 'Saved'; $('#statusBadge').style.opacity = 0.7;
  }, 900);
}

/* --------------------------
   Stats
   -------------------------- */
function updateStats(){
  const txt = (editor.innerText || '').trim();
  const words = txt ? (txt.match(/\S+/g) || []).length : 0;
  const chars = txt.replace(/\s/g, '').length;
  $('#stats').textContent = `${words} words · ${chars} chars`;
}
setInterval(updateStats, 1000);

/* --------------------------
   Print only content
   -------------------------- */
function printDocument(){
  const content = sanitize(editor.innerHTML);
  const title = escapeHtml($('#titleInput').value || 'Document');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:system-ui,Arial;padding:20px;color:#111}img{max-width:100%;height:auto}</style></head><body>${content}</body></html>`;
  const w = window.open('', '_blank', 'noopener');
  if(!w){ alert('Popup blocked — allow popups to use print.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = ()=> { w.focus(); w.print(); };
}

/* --------------------------
   Sharing: create link, manage links
   -------------------------- */
function openShareModal(){
  if(!currentId){ alert('Please create or save a document first.'); return; }
  $('#shareExpiry').value = '7';
  $('#sharePublic').checked = false;
  $('#sharePassword').value = '';
  $('#passRow').style.display = 'block';
  $('#shareResult').classList.add('hidden');
  openModal('shareModal');
}

function generateShare(){
  const days = Number($('#shareExpiry').value);
  const isPublic = $('#sharePublic').checked;
  const pwd = $('#sharePassword').value;

  if(!isPublic && !pwd){ alert('Private links require a password.'); return; }

  const payload = {
    title: $('#titleInput').value || 'Untitled',
    html: sanitize(editor.innerHTML),
    docId: currentId,
    createdAt: now(),
    expiresAt: days>0 ? now() + days*24*60*60*1000 : null
  };

  let encoded = '';
  if(isPublic){
    encoded = 'PUB:' + btoa(JSON.stringify(payload));
  } else {
    // encrypt with password
    encoded = 'PRV:' + CryptoJS.AES.encrypt(JSON.stringify(payload), pwd).toString();
  }
  const shareUrl = `${location.origin}${location.pathname}?shared=${encodeURIComponent(encoded)}`;

  // save record
  const rec = {
    id: String(now()), docId: currentId, url: shareUrl, public: isPublic, createdAt: payload.createdAt, expiresAt: payload.expiresAt
  };
  sharedLinks.unshift(rec);
  persistLinks();

  // show result & copy
  $('#shareUrl').value = shareUrl;
  $('#shareMeta').textContent = `Expires: ${payload.expiresAt ? new Date(payload.expiresAt).toLocaleString() : 'Never'} · ${isPublic ? 'Public' : 'Private'}`;
  $('#shareResult').classList.remove('hidden');

  copyToClipboard(shareUrl).then(ok => toast(ok? 'Link copied to clipboard' : 'Could not auto-copy — use copy button'));
}

/* Manage links UI */
function openManageModal(){
  renderSharedList();
  openModal('manageModal');
}
function renderSharedList(){
  const wrap = $('#sharedList'); wrap.innerHTML = '';
  if(!sharedLinks.length){ wrap.innerHTML = '<div class="muted">No shared links yet</div>'; return; }
  sharedLinks.forEach(rec => {
    const item = document.createElement('div'); item.className='shared-item';
    const left = document.createElement('div'); left.innerHTML = `<div style="font-weight:600">${escapeHtml(docs[rec.docId]?.title || '(deleted)')}</div>
      <div style="font-size:12px;color:var(--muted)">Created: ${new Date(rec.createdAt).toLocaleString()} · Expires: ${rec.expiresAt? new Date(rec.expiresAt).toLocaleString():'Never'}</div>`;
    const right = document.createElement('div');
    const copyBtn = document.createElement('button'); copyBtn.className='small'; copyBtn.textContent='Copy';
    copyBtn.onclick = ()=> { copyToClipboard(rec.url).then(ok => toast(ok?'Copied':'Copy failed')); };
    const openBtn = document.createElement('button'); openBtn.className='small ghost'; openBtn.textContent='Open';
    openBtn.onclick = ()=> window.open(rec.url, '_blank');
    const toggleBtn = document.createElement('button'); toggleBtn.className='small'; toggleBtn.textContent = rec.public ? 'Make Private' : 'Make Public';
    toggleBtn.onclick = ()=> togglePublicLink(rec.id);
    const revokeBtn = document.createElement('button'); revokeBtn.className='small ghost'; revokeBtn.textContent='Revoke';
    revokeBtn.onclick = ()=> { if(confirm('Revoke link?')) { revokeLink(rec.id); } };

    right.appendChild(copyBtn); right.appendChild(openBtn); right.appendChild(toggleBtn); right.appendChild(revokeBtn);
    item.appendChild(left); item.appendChild(right);
    wrap.appendChild(item);
  });
}

function togglePublicLink(id){
  const rec = sharedLinks.find(r=> r.id === id);
  if(!rec) return;
  const doc = docs[rec.docId];
  if(!doc){ alert('Original document not found'); return; }
  const payload = { title: doc.title, html: doc.content, docId: doc.id, createdAt: now(), expiresAt: rec.expiresAt };

  if(rec.public){
    // make private -> require password
    const pwd = prompt('Set password for private link:');
    if(!pwd) return;
    const enc = 'PRV:' + CryptoJS.AES.encrypt(JSON.stringify(payload), pwd).toString();
    rec.url = `${location.origin}${location.pathname}?shared=${encodeURIComponent(enc)}`;
    rec.public = false;
  } else {
    // make public
    const b = 'PUB:' + btoa(JSON.stringify(payload));
    rec.url = `${location.origin}${location.pathname}?shared=${encodeURIComponent(b)}`;
    rec.public = true;
  }
  persistLinks(); renderSharedList(); toast('Link updated');
}
function revokeLink(id){
  sharedLinks = sharedLinks.filter(r => r.id !== id);
  persistLinks(); renderSharedList(); toast('Link revoked');
}

/* --------------------------
   Handle incoming shared link
   -------------------------- */
let incomingPayload = null;
function handleIncomingShared(){
  const params = new URLSearchParams(location.search);
  const s = params.get('shared');
  if(!s) return;
  const decoded = decodeURIComponent(s);
  if(decoded.startsWith('PUB:')){
    try {
      const payload = JSON.parse(atob(decoded.slice(4)));
      if(payload.expiresAt && now() > payload.expiresAt){ alert('This shared link has expired.'); return; }
      showSharedViewer(payload, false);
    } catch(e){
      alert('Invalid public share link.');
    }
  } else if(decoded.startsWith('PRV:')){
    incomingPayload = decoded.slice(4); // cipher text
    // open password modal
    openModal('passwordModal');
    $('#openPwdBtn').onclick = ()=> {
      const pwd = $('#openPassword').value;
      if(!pwd) return;
      try {
        const bytes = CryptoJS.AES.decrypt(incomingPayload, pwd);
        const json = bytes.toString(CryptoJS.enc.Utf8);
        if(!json) throw new Error('bad');
        const payload = JSON.parse(json);
        if(payload.expiresAt && now() > payload.expiresAt){ alert('This shared link has expired.'); closeModal('passwordModal'); return; }
        closeModal('passwordModal');
        showSharedViewer(payload, true);
      } catch(e){
        alert('Incorrect password or corrupted link.');
      }
    };
  } else {
    // not recognized
  }
}

/* Show shared viewer overlay */
function showSharedViewer(payload, wasPrivate){
  $('#viewerTitle').textContent = payload.title || 'Shared Document';
  $('#viewerContent').innerHTML = sanitize(payload.html || '');
  $('#viewerOverlay').classList.remove('hidden');
  $('#viewerCloseBtn').onclick = ()=> $('#viewerOverlay').classList.add('hidden');
  $('#viewerSaveBtn').onclick = ()=> {
    const id = String(now());
    docs[id] = { id, title: payload.title || 'Shared copy', content: sanitize(payload.html || ''), created: now(), updated: now() };
    persistDocs(); renderDocsList(); loadDoc(id); toast('Saved local copy'); $('#viewerOverlay').classList.add('hidden');
  };
}

/* --------------------------
   Modals open/close
   -------------------------- */
function openModal(id){ $(`#${id}`).classList.remove('hidden'); }
function closeModal(id){ $(`#${id}`).classList.add('hidden'); }

/* --------------------------
   Theme
   -------------------------- */
function setTheme(t){
  if(!t) t = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.classList.remove('light','colored');
  if(t === 'light') document.documentElement.classList.add('light');
  if(t === 'colored') document.documentElement.classList.add('colored');
  localStorage.setItem(THEME_KEY, t);
}
function applySavedTheme(){ setTheme(localStorage.getItem(THEME_KEY) || 'dark'); }

/* --------------------------
   Tooltip (first time per key)
   -------------------------- */
function showFirstTip(e){
  const el = e.currentTarget;
  const key = el.dataset.tipKey;
  const txt = el.dataset.tip;
  if(!key || !txt) return;
  const shown = JSON.parse(localStorage.getItem(TIPS_KEY) || '{}');
  if(shown[key]) return;
  const rect = el.getBoundingClientRect();
  const tip = $('#tooltip');
  tip.textContent = txt; tip.style.top = (rect.bottom + 8 + window.scrollY) + 'px';
  tip.style.left = (rect.left + (rect.width/2) - 120 + window.scrollX) + 'px';
  tip.classList.remove('hidden'); setTimeout(()=> tip.classList.add('hidden'), 4200);
  shown[key] = true; localStorage.setItem(TIPS_KEY, JSON.stringify(shown));
}

/* --------------------------
   Find (simple UX: selection)
   -------------------------- */
function openFindDialog(){
  const term = prompt('Find (enter text):');
  if(!term) return;
  const idx = editor.innerText.indexOf(term);
  if(idx === -1){ toast('Not found'); return; }
  selectTextByIndex(idx, term.length);
}
function selectTextByIndex(start, len){
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node, pos=0, startNode, endNode, startOffset, endOffset;
  while(node = walker.nextNode()){
    const next = pos + node.textContent.length;
    if(startNode == null && start >= pos && start < next){ startNode = node; startOffset = start - pos; }
    if(startNode && (start+len) <= next){ endNode = node; endOffset = (start+len) - pos; break; }
    pos = next;
  }
  if(startNode && endNode){
    const r = document.createRange(); r.setStart(startNode, startOffset); r.setEnd(endNode, endOffset);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
}

/* --------------------------
   Helpers: revoke, persist
   -------------------------- */
function persistLinks(){ localStorage.setItem(LINKS_KEY, JSON.stringify(sharedLinks)); }

/* --------------------------
   End of file
   -------------------------- */
