/* script.js — AnonDocs (polished)
   Features:
   - Docs stored in localStorage, create/load/save/delete
   - Autosave
   - Rich formatting via document.execCommand
   - Import / Export (TXT + JSON backup)
   - Print — prints only document content (desktop)
   - Shareable links: PUBLIC (PUB: base64) and PRIVATE (PRV: AES encrypted via CryptoJS)
   - Shared Links manager (copy/open/toggle/revoke)
   - Viewer modal for shared docs (save copy locally)
   - Themes (hacker/dark/cyber/light), selectable fonts
   - Tooltips on hover (anytime)
   - Footer: Made by Riyajul Ali
*/

const DOCS_KEY = 'anondocs_docs_v4';
const LINKS_KEY = 'anondocs_links_v4';
const THEME_KEY = 'anondocs_theme_v4';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function now(){ return Date.now(); }
function toast(msg, ms = 2200){
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; $('#toasts').appendChild(t);
  setTimeout(()=> t.remove(), ms);
}
async function copyToClipboard(text){
  try { await navigator.clipboard.writeText(text); return true; }
  catch(e){
    try { const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true; } catch(e2){ return false; }
  }
}
function sanitize(html){ return String(html).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,''); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }

/* state */
let docs = JSON.parse(localStorage.getItem(DOCS_KEY) || '{}');
let shared = JSON.parse(localStorage.getItem(LINKS_KEY) || '[]');
let currentId = null;

/* elements */
const editor = $('#editor');
const docsList = $('#docsList');
const titleInput = $('#titleInput');

/* boot */
window.addEventListener('DOMContentLoaded', ()=> {
  bindUI();
  applyTheme(localStorage.getItem(THEME_KEY) || 'hacker');
  if(Object.keys(docs).length === 0) createDoc();
  else {
    const ids = Object.keys(docs).sort((a,b)=> (docs[b].updated||0)-(docs[a].updated||0));
    loadDoc(ids[0]);
  }
  checkSharedParam();
  updateStats();
});

/* UI binding */
function bindUI(){
  $('#menuToggle').onclick = ()=> $('#sidebar').classList.toggle('open');
  $('#newBtn').onclick = createDoc;
  $('#newSide').onclick = createDoc;
  $('#saveBtn').onclick = saveDoc;
  $('#shareBtn').onclick = openShareModal;

  $('#themeSelect').onchange = e => applyTheme(e.target.value);
  $('#fontSelect').onchange = e => editor.style.fontFamily = e.target.value;

  // toolbar commands
  $$('#toolbar [data-cmd]').forEach(btn => btn.onclick = ()=> execCmd(btn.dataset.cmd));
  $('#blockSelect').onchange = e => execCmd('formatBlock', e.target.value);
  $('#sizeSelect').onchange = e => execCmd('fontSize', e.target.value);
  $('#foreColor').onchange = e => execCmd('foreColor', e.target.value);
  $('#hiliteColor').onchange = e => execCmd('hiliteColor', e.target.value);

  $('#linkBtn').onclick = insertLink;
  $('#imgInput').onchange = insertImage;

  $('#undoBtn').onclick = ()=> execCmd('undo');
  $('#redoBtn').onclick = ()=> execCmd('redo');

  $('#findBtn').onclick = openFind;
  $('#exportBtn').onclick = exportDoc;
  $('#importBtn').onclick = importDoc;
  $('#printBtn').onclick = tryPrint;
  $('#manageBtn').onclick = openManageModal;

  // share modal
  $('#sharePublic').onchange = ()=> { $('#passwordRow').style.display = $('#sharePublic').checked ? 'none' : 'block'; };
  $('#genShare').onclick = generateShare;
  $('#copyShare').onclick = ()=> { copyToClipboard($('#shareUrl').value).then(ok => toast(ok? 'Copied' : 'Copy failed')); };

  // editor events
  editor.oninput = ()=> { scheduleAutosave(); updateStats(); };
  editor.addEventListener('keydown', ev => {
    const mod = ev.ctrlKey || ev.metaKey;
    if(mod && ev.key.toLowerCase() === 's'){ ev.preventDefault(); saveDoc(); }
    if(mod && ev.key.toLowerCase() === 'b'){ ev.preventDefault(); execCmd('bold'); }
    if(mod && ev.key.toLowerCase() === 'k'){ ev.preventDefault(); insertLink(); }
    if(mod && ev.key.toLowerCase() === 'n'){ if(ev.ctrlKey || ev.metaKey){ ev.preventDefault(); createDoc(); } }
  });

  // title changes
  titleInput.oninput = ()=> { if(!currentId) return; docs[currentId].title = titleInput.value || 'Untitled'; docs[currentId].updated = now(); persistDocs(); renderDocsList(); };

  // tooltips on hover
  $$('[data-tip]').forEach(el=>{
    el.addEventListener('mouseenter', e => showTooltip(e.currentTarget.dataset.tip, e.currentTarget));
    el.addEventListener('mouseleave', hideTooltip);
  });

  // viewer save
  $('#viewerSave')?.addEventListener('click', ()=> {
    const content = $('#viewerContent').innerHTML;
    const id = String(now()); docs[id] = { id, title: $('#viewerTitle').textContent || 'Shared copy', content, created: now(), updated: now() };
    persistDocs(); renderDocsList(); loadDoc(id); closeModal('viewerModal'); toast('Saved local copy');
  });
}

/* exec command */
function execCmd(cmd, val=null){ document.execCommand(cmd, false, val); editor.focus(); }

/* link / image */
function insertLink(){
  const sel = window.getSelection();
  let defaultUrl = '';
  if(sel && sel.toString()) { defaultUrl = prompt('Enter URL to link selected text (include https://):', 'https://'); if(!defaultUrl) return; execCmd('createLink', defaultUrl); }
  else {
    const url = prompt('Enter URL (include https://):', 'https://'); if(!url) return; execCmd('createLink', url);
  }
}
function insertImage(e){
  const f = e.target.files?.[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ()=> execCmd('insertImage', r.result);
  r.readAsDataURL(f); e.target.value = '';
}

/* docs CRUD */
function persistDocs(){ localStorage.setItem(DOCS_KEY, JSON.stringify(docs)); }
function persistLinks(){ localStorage.setItem(LINKS_KEY, JSON.stringify(shared)); }

function createDoc(){
  const id = String(now());
  docs[id] = { id, title: 'Untitled', content: '', created: now(), updated: now() };
  persistDocs(); renderDocsList(); loadDoc(id); toast('New document created');
}
function renderDocsList(){
  docsList.innerHTML = '';
  const arr = Object.values(docs).sort((a,b)=> (b.updated||0)-(a.updated||0));
  arr.forEach(d=>{
    const el = document.createElement('div'); el.className = 'doc-item'; el.innerHTML = `<div>${escapeHtml(d.title)}</div><div class="muted">${new Date(d.updated).toLocaleString()}</div>`;
    el.onclick = ()=> loadDoc(d.id);
    if(d.id === currentId) el.classList.add('active');
    docsList.appendChild(el);
  });
}
function loadDoc(id){
  const d = docs[id]; if(!d) return;
  currentId = id; editor.innerHTML = d.content || ''; titleInput.value = d.title || 'Untitled'; renderDocsList(); updateStats();
}
function saveDoc(){
  if(!currentId) createDoc();
  docs[currentId].content = sanitize(editor.innerHTML);
  docs[currentId].title = titleInput.value || deriveTitle(docs[currentId].content) || 'Untitled';
  docs[currentId].updated = now();
  persistDocs(); renderDocsList(); toast('Saved');
}
function deriveTitle(html){ const txt = (html||'').replace(/<[^>]+>/g,' ').trim(); return (txt.split('\n')[0]||'').slice(0,60); }

/* autosave */
let autoTimer = null;
function scheduleAutosave(){
  clearTimeout(autoTimer);
  autoTimer = setTimeout(()=> saveDoc(), 900);
}

/* stats */
function updateStats(){
  const t = (editor.innerText || '').trim();
  const words = t ? (t.match(/\S+/g) || []).length : 0;
  const chars = t.replace(/\s/g,'').length;
  $('#stats').textContent = `${words} words · ${chars} chars`;
}
setInterval(updateStats, 1000);

/* print only content */
function tryPrint(){
  if(window.innerWidth < 600){ toast('Printing is recommended from desktop for best results.'); }
  const content = sanitize(editor.innerHTML || '');
  const title = escapeHtml(titleInput.value || 'Document');
  const w = window.open('', '_blank', 'noopener');
  if(!w){ alert('Popup blocked. Enable popups to print.'); return; }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:system-ui, Arial; padding:20px; color:#111} img{max-width:100%; height:auto}</style></head><body>${content}</body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = ()=> { w.focus(); w.print(); };
}

/* export / import */
function exportDoc(){
  if(!currentId){ toast('No document to export'); return; }
  const fileName = `${(titleInput.value||'document').replace(/\s+/g,'_')}.txt`;
  download(fileName, editor.innerText, 'text/plain');
  download(`anondocs_backup_${Date.now()}.json`, JSON.stringify(docs, null, 2), 'application/json');
  toast('Export started');
}
function download(name, content, type){
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
function importDoc(){
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.txt,application/json,text/plain';
  input.onchange = e => {
    const f = e.target.files[0]; if(!f) return; const r = new FileReader();
    r.onload = ()=> {
      try {
        if(f.type === 'application/json' || f.name.endsWith('.json')) {
          const data = JSON.parse(r.result); docs = {...docs, ...data}; persistDocs(); renderDocsList(); toast('Backup imported');
        } else {
          if(!currentId) createDoc();
          editor.innerText = r.result; saveDoc(); toast('Imported text into current document');
        }
      } catch(err){ alert('Import failed: ' + err.message); }
    };
    r.readAsText(f);
  };
  input.click();
}

/* sharing: create & manage */
function openShareModal(){
  if(!currentId){ toast('Save a document first'); return; }
  $('#shareExpiry').value = '7'; $('#sharePublic').checked = false; $('#sharePassword').value = '';
  $('#shareResult').classList.add('hidden'); openModal('shareModal');
}
function generateShare(){
  const days = Number($('#shareExpiry').value);
  const isPublic = $('#sharePublic').checked;
  const pwd = $('#sharePassword').value;
  if(!isPublic && !pwd){ alert('Private links require a password'); return; }

  const payload = { title: titleInput.value || 'Untitled', html: sanitize(editor.innerHTML), docId: currentId, created: now(), expires: days>0 ? now()+days*24*60*60*1000 : null };
  let encoded = '';
  if(isPublic) encoded = 'PUB:' + btoa(JSON.stringify(payload));
  else encoded = 'PRV:' + CryptoJS.AES.encrypt(JSON.stringify(payload), pwd).toString();

  const url = `${location.origin}${location.pathname}?shared=${encodeURIComponent(encoded)}`;
  const rec = { id: String(now()), url, public: isPublic, created: payload.created, expires: payload.expires, docId: currentId };
  shared.unshift(rec); persistLinks();

  $('#shareUrl').value = url; $('#shareInfo').textContent = `Expires: ${payload.expires ? new Date(payload.expires).toLocaleString() : 'Never'} · ${isPublic ? 'Public' : 'Private'}`;
  $('#shareResult').classList.remove('hidden');
  copyToClipboard(url).then(ok => toast(ok? 'Link copied to clipboard' : 'Auto-copy failed'));
}

/* manage shared */
function openManageModal(){ renderSharedList(); openModal('manageModal'); }
function renderSharedList(){
  const wrap = $('#sharedList'); wrap.innerHTML = '';
  if(!shared.length){ wrap.innerHTML = '<div style="color:var(--muted)">No shared links</div>'; return; }
  shared.forEach(r=>{
    const item = document.createElement('div'); item.className='shared-item';
    const left = document.createElement('div'); left.innerHTML = `<div style="font-weight:600">${escapeHtml(docs[r.docId]?.title || '(deleted)')}</div>
      <div style="font-size:12px;color:var(--muted)">Created: ${new Date(r.created).toLocaleString()} · Expires: ${r.expires ? new Date(r.expires).toLocaleString() : 'Never'}</div>`;
    const right = document.createElement('div');
    const copyBtn = makeSmall('Copy', ()=> copyToClipboard(r.url).then(ok=> toast(ok? 'Copied' : 'Copy failed')));
    const openBtn = makeSmall('Open', ()=> window.open(r.url, '_blank'));
    const toggleBtn = makeSmall(r.public ? 'Make Private' : 'Make Public', ()=> togglePublic(r.id));
    const revokeBtn = makeSmall('Revoke', ()=> { if(confirm('Revoke link?')) { revokeLink(r.id); } });
    [copyBtn, openBtn, toggleBtn, revokeBtn].forEach(b=> right.appendChild(b));
    item.appendChild(left); item.appendChild(right); wrap.appendChild(item);
  });
}
function makeSmall(text, fn){ const b = document.createElement('button'); b.className='small'; b.textContent = text; b.onclick = fn; return b; }
function togglePublic(id){
  const rec = shared.find(s=> s.id===id); if(!rec) return; const doc = docs[rec.docId]; if(!doc){ alert('Original missing'); return; }
  const payload = { title: doc.title, html: doc.content, docId: doc.id, created: now(), expires: rec.expires };
  if(rec.public){
    const pwd = prompt('Set password for private link:'); if(!pwd) return;
    const enc = 'PRV:' + CryptoJS.AES.encrypt(JSON.stringify(payload), pwd).toString(); rec.url = `${location.origin}${location.pathname}?shared=${encodeURIComponent(enc)}`; rec.public = false;
  } else {
    const b = 'PUB:' + btoa(JSON.stringify(payload)); rec.url = `${location.origin}${location.pathname}?shared=${encodeURIComponent(b)}`; rec.public = true;
  }
  persistLinks(); renderSharedList(); toast('Link updated');
}
function revokeLink(id){ shared = shared.filter(s=> s.id !== id); persistLinks(); renderSharedList(); toast('Revoked'); }

/* handle incoming shared param */
function checkSharedParam(){
  const params = new URLSearchParams(location.search); const s = params.get('shared'); if(!s) return;
  const raw = decodeURIComponent(s);
  if(raw.startsWith('PUB:')) {
    try { const payload = JSON.parse(atob(raw.slice(4))); if(payload.expires && now() > payload.expires){ alert('This shared link has expired'); return; } showViewer(payload); } catch(e){ alert('Invalid public link'); }
  } else if(raw.startsWith('PRV:')) {
    openModal('pwModal'); $('#openShareBtn').onclick = ()=> {
      const pwd = $('#openPassword').value; if(!pwd) return;
      try {
        const bytes = CryptoJS.AES.decrypt(raw.slice(4), pwd); const json = bytes.toString(CryptoJS.enc.Utf8); if(!json) throw new Error('bad'); const payload = JSON.parse(json);
        if(payload.expires && now() > payload.expires){ alert('This shared link has expired'); closeModal('pwModal'); return; }
        closeModal('pwModal'); showViewer(payload);
      } catch(e){ alert('Incorrect password or corrupted link'); }
    };
  }
}
function showViewer(payload){
  $('#viewerTitle').textContent = payload.title || 'Shared document'; $('#viewerContent').innerHTML = sanitize(payload.html || '');
  openModal('viewerModal');
}

/* modal helpers */
function openModal(id){ $(`#${id}`).classList.remove('hidden'); }
function closeModal(id){ $(`#${id}`).classList.add('hidden'); }

/* theme */
function applyTheme(name){
  document.documentElement.classList.remove('hacker','cyber','light');
  if(!name) name = 'hacker';
  if(name === 'hacker') document.documentElement.classList.add('hacker');
  else if(name === 'cyber') document.documentElement.classList.add('cyber');
  else if(name === 'light') document.documentElement.classList.add('light');
  else document.documentElement.classList.remove('hacker','cyber','light');
  localStorage.setItem(THEME_KEY, name);
}

/* find */
function openFind(){
  const term = prompt('Find (text):'); if(!term) return;
  const idx = editor.innerText.indexOf(term); if(idx === -1){ toast('Not found'); return; }
  selectTextByIndex(idx, term.length);
}
function selectTextByIndex(start, len){
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node, pos=0, startNode, endNode, startOffset, endOffset;
  while(node = walker.nextNode()){
    const next = pos + node.textContent.length;
    if(!startNode && start >= pos && start < next){ startNode = node; startOffset = start - pos; }
    if(startNode && (start+len) <= next){ endNode = node; endOffset = (start+len) - pos; break; }
    pos = next;
  }
  if(startNode && endNode){ const r = document.createRange(); r.setStart(startNode, startOffset); r.setEnd(endNode, endOffset); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
}

/* helpers */
function persistDocs(){ localStorage.setItem(DOCS_KEY, JSON.stringify(docs)); }
function persistLinks(){ localStorage.setItem(LINKS_KEY, JSON.stringify(shared)); }

function makeSmallButton(text, cls){ const b = document.createElement('button'); b.className = 'small ' + (cls||''); b.textContent = text; return b; }

/* tooltip */
function showTooltip(text, el){
  const tip = $('#tooltip'); tip.textContent = text;
  const rect = el.getBoundingClientRect();
  tip.style.top = (rect.bottom + 8 + window.scrollY) + 'px';
  tip.style.left = Math.max(8, rect.left + (rect.width/2) - 120 + window.scrollX) + 'px';
  tip.classList.remove('hidden');
}
function hideTooltip(){ $('#tooltip').classList.add('hidden'); }