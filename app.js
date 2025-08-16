/* script.js - AnonDocs core
   - docs & shared links stored in localStorage
   - private share = AES encryption (CryptoJS); public share = base64 payload
   - printing prints only document contents (desktop)
   - import/export supports .txt and .json backup
   - themes: hacker, dark, cyber, light; fonts selectable
   - tooltips on hover (anytime)
*/

/* ---- keys & utils ---- */
const DOCS_KEY = 'anondocs_docs_v3';
const LINKS_KEY = 'anondocs_links_v3';
const THEME_KEY = 'anondocs_theme_v3';

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function now(){ return Date.now(); }
function toast(msg, ms=2200){
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(()=> t.remove(), ms);
}
async function copyToClipboard(text){
  try { await navigator.clipboard.writeText(text); return true; }
  catch(e){
    try { const ta = document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity=0; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true; }
    catch(e2){ return false; }
  }
}
function sanitize(html){ return String(html).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,''); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }

/* ---- state ---- */
let docs = JSON.parse(localStorage.getItem(DOCS_KEY) || '{}');
let shared = JSON.parse(localStorage.getItem(LINKS_KEY) || '[]');
let currentId = null;

/* ---- elements ---- */
const editor = $('#editor');
const docsList = $('#docsList');
const titleInput = $('#titleInput');

/* ---- startup ---- */
window.addEventListener('DOMContentLoaded', () => {
  bindUI();
  applyTheme(localStorage.getItem(THEME_KEY) || 'hacker');
  if(Object.keys(docs).length === 0) createDoc();
  else {
    const ids = Object.keys(docs).sort((a,b)=> (docs[b].updated||0)-(docs[a].updated||0));
    loadDoc(ids[0]);
  }
  handleIncomingShared(); // open shared url if present
  updateStats();
});

/* ---- UI bindings ---- */
function bindUI(){
  $('#menuToggle').onclick = ()=> $('#sidebar').classList.toggle('open');
  $('#newBtn').onclick = createDoc;
  $('#newSide').onclick = createDoc;
  $('#saveBtn').onclick = saveDoc;
  $('#shareBtn').onclick = openShareModal;
  $('#themeSelect').onchange = e => applyTheme(e.target.value);
  $('#fontSelect').onchange = e => editor.style.fontFamily = e.target.value;

  // toolbar buttons with data-cmd
  $$('#toolbar [data-cmd]').forEach(b => b.onclick = ()=> execCmd(b.dataset.cmd));
  $('#blockSelect').onchange = e => execCmd('formatBlock', e.target.value);
  $('#fontSize').onchange = e => execCmd('fontSize', e.target.value);
  $('#foreColor').onchange = e => execCmd('foreColor', e.target.value);
  $('#hiliteColor').onchange = e => execCmd('hiliteColor', e.target.value);
  $('#linkBtn').onclick = insertLink;
  $('#imgInput').onchange = insertImage;

  $('#findBtn').onclick = openFind;
  $('#exportBtn').onclick = exportDoc;
  $('#importBtn').onclick = importDoc;
  $('#printBtn').onclick = tryPrint;
  $('#manageBtn').onclick = openManageModal;

  // share modal
  $('#sharePublic').onchange = ()=> { $('#passwordRow').style.display = $('#sharePublic').checked ? 'none' : 'block'; };
  $('#genShare').onclick = generateShare;
  $('#copyShare').onclick = ()=> copyToClipboard($('#shareUrl').value).then(ok => toast(ok? 'Copied' : 'Copy failed'));

  // editor events
  editor.oninput = ()=> { scheduleAutosave(); updateStats(); };
  editor.addEventListener('keydown', (ev)=> {
    const mod = ev.ctrlKey || ev.metaKey;
    if(mod && ev.key.toLowerCase() === 's'){ ev.preventDefault(); saveDoc(); }
    if(mod && ev.key.toLowerCase() === 'k'){ ev.preventDefault(); insertLink(); }
  });

  // title change
  titleInput.oninput = ()=> { if(!currentId) return; docs[currentId].title = titleInput.value || 'Untitled'; docs[currentId].updated = now(); persistDocs(); renderDocsList(); };

  // tooltips (anytime)
  $$('[title]').forEach(el=>{
    el.addEventListener('mouseenter', (e)=> showTooltip(e.currentTarget.title, e.currentTarget));
    el.addEventListener('mouseleave', hideTooltip);
  });

  // viewer save
  $('#viewerSave')?.addEventListener('click', ()=> {
    const content = $('#viewerContent').innerHTML;
    const id = String(now());
    docs[id] = { id, title: $('#viewerTitle').textContent || 'Shared copy', content, created: now(), updated: now() };
    persistDocs(); renderDocsList(); loadDoc(id); closeModal('viewer'); toast('Saved local copy');
  });
}

/* ---- editor helpers ---- */
function execCmd(cmd, val=null){ document.execCommand(cmd, false, val); editor.focus(); }
function insertLink(){
  const url = prompt('Enter URL (include https://):'); if(!url) return; execCmd('createLink', url);
}
function insertImage(e){
  const f = e.target.files?.[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ()=> execCmd('insertHTML', `<img src="${r.result}" style="max-width:100%;height:auto" />`);
  r.readAsDataURL(f); e.target.value = '';
}

/* ---- docs CRUD ---- */
function persistDocs(){ localStorage.setItem(DOCS_KEY, JSON.stringify(docs)); }
function persistLinks(){ localStorage.setItem(LINKS_KEY, JSON.stringify(shared)); }

function createDoc(){
  const id = String(now()); docs[id] = { id, title: 'Untitled', content: '', created: now(), updated: now() };
  persistDocs(); renderDocsList(); loadDoc(id); toast('New document created');
}
function renderDocsList(){
  docsList.innerHTML = '';
  const arr = Object.values(docs).sort((a,b)=> (b.updated||0)-(a.updated||0));
  arr.forEach(d=>{
    const item = document.createElement('div'); item.className = 'doc-item'; item.textContent = d.title;
    item.onclick = ()=> loadDoc(d.id);
    if(d.id === currentId) item.classList.add('active');
    docsList.appendChild(item);
  });
}
function loadDoc(id){
  const d = docs[id]; if(!d) return; currentId = id; editor.innerHTML = d.content || ''; titleInput.value = d.title || 'Untitled';
  renderDocsList(); updateStats();
}
function saveDoc(){
  if(!currentId) createDoc();
  docs[currentId].content = sanitize(editor.innerHTML);
  docs[currentId].title = titleInput.value || deriveTitle(docs[currentId].content) || 'Untitled';
  docs[currentId].updated = now();
  persistDocs(); renderDocsList(); toast('Saved');
}
function deriveTitle(html){ const txt = (html||'').replace(/<[^>]+>/g,' ').trim(); return (txt.split('\n')[0] || '').slice(0,60); }

/* autosave */
let autoTimer = null;
function scheduleAutosave(){
  clearTimeout(autoTimer);
  autoTimer = setTimeout(()=> { saveDoc(); }, 900);
}

/* ---- stats ---- */
function updateStats(){
  const txt = (editor.innerText || '').trim();
  const words = txt ? (txt.match(/\S+/g) || []).length : 0;
  const chars = txt.replace(/\s/g,'').length;
  $('#stats').textContent = `${words} words · ${chars} chars`;
}
setInterval(updateStats, 1200);

/* ---- print (desktop-friendly) ---- */
function tryPrint(){
  if(window.innerWidth < 600){ toast('Printing is limited on mobile — use desktop for best results'); return; }
  const content = sanitize(editor.innerHTML); const title = escapeHtml(titleInput.value || 'Document');
  const w = window.open('', '_blank', 'noopener');
  if(!w){ alert('Popup blocked — allow popups to print'); return; }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:system-ui,Arial;padding:20px;color:#111}img{max-width:100%;height:auto}</style></head><body>${content}</body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = ()=> { w.focus(); w.print(); };
}

/* ---- export / import ---- */
function exportDoc(){
  if(!currentId){ toast('No document to export'); return; }
  const txtName = `${(titleInput.value||'document').replace(/\s+/g,'_')}.txt`;
  downloadFile(txtName, editor.innerText, 'text/plain');
  downloadFile(`anondocs_backup_${Date.now()}.json`, JSON.stringify(docs, null, 2), 'application/json');
  toast('Export started');
}
function downloadFile(name, content, type){
  const blob = new Blob([content], {type}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
function importDoc(){
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.txt,application/json,text/plain';
  input.onchange = e => {
    const f = e.target.files[0]; if(!f) return; const r = new FileReader();
    r.onload = ()=> {
      try {
        if(f.type === 'application/json' || f.name.endsWith('.json')){
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

/* ---- sharing (public & private) ---- */
function openShareModal(){
  if(!currentId){ toast('Save a document first'); return; }
  $('#shareExpiry').value = '7'; $('#sharePublic').checked = false; $('#sharePassword').value = ''; $('#shareResult').classList.add('hidden');
  openModal('shareModal');
}
function generateShare(){
  const days = Number($('#shareExpiry').value);
  const isPublic = $('#sharePublic').checked;
  const pwd = $('#sharePassword').value;
  if(!isPublic && !pwd){ alert('Private links require a password'); return; }

  const payload = { title: titleInput.value || 'Untitled', html: sanitize(editor.innerHTML), docId: currentId, created: now(), expires: days>0? now()+days*24*60*60*1000 : null };
  let encoded = '';
  if(isPublic) encoded = 'PUB:' + btoa(JSON.stringify(payload));
  else encoded = 'PRV:' + CryptoJS.AES.encrypt(JSON.stringify(payload), pwd).toString();

  const url = `${location.origin}${location.pathname}?shared=${encodeURIComponent(encoded)}`;
  const rec = { id: String(now()), url, public: isPublic, created: payload.created, expires: payload.expires, docId: currentId };
  shared.unshift(rec); persistLinks();

  $('#shareUrl').value = url; $('#shareInfo').textContent = `Expires: ${payload.expires? new Date(payload.expires).toLocaleString() : 'Never'} · ${isPublic? 'Public':'Private'}`; $('#shareResult').classList.remove('hidden');
  copyToClipboard(url).then(ok => toast(ok? 'Link copied' : 'Auto-copy failed'));
}

/* manage links */
function openManageModal(){ renderSharedList(); openModal('manageModal'); }
function renderSharedList(){
  const wrap = $('#sharedList'); wrap.innerHTML = '';
  if(!shared.length){ wrap.innerHTML = '<div style="color:var(--muted)">No shared links</div>'; return; }
  shared.forEach(r=>{
    const item = document.createElement('div'); item.className = 'shared-item';
    const left = document.createElement('div');
    left.innerHTML = `<div style="font-weight:600">${escapeHtml(docs[r.docId]?.title || '(deleted)')}</div><div style="font-size:12px;color:var(--muted)">Created: ${new Date(r.created).toLocaleString()} · Expires: ${r.expires? new Date(r.expires).toLocaleString(): 'Never'}</div>`;
    const right = document.createElement('div');
    const copyBtn = createSmall('Copy', ()=> copyToClipboard(r.url).then(ok=> toast(ok? 'Copied' : 'Copy failed')));
    const openBtn = createSmall('Open', ()=> window.open(r.url, '_blank'));
    const toggleBtn = createSmall(r.public? 'Make Private' : 'Make Public', ()=> togglePublic(r.id));
    const revokeBtn = createSmall('Revoke', ()=> { if(confirm('Revoke link?')) { revokeLink(r.id); } });
    [copyBtn, openBtn, toggleBtn, revokeBtn].forEach(b => right.appendChild(b));
    item.appendChild(left); item.appendChild(right); wrap.appendChild(item);
  });
}
function createSmall(txt, fn){ const b = document.createElement('button'); b.className = 'small'; b.textContent = txt; b.onclick = fn; return b; }
function togglePublic(id){
  const rec = shared.find(s=> s.id === id); if(!rec) return;
  const doc = docs[rec.docId]; if(!doc){ alert('Original document missing'); return; }
  const payload = { title: doc.title, html: doc.content, docId: doc.id, created: now(), expires: rec.expires };
  if(rec.public){
    const pwd = prompt('Set password for private link:'); if(!pwd) return;
    const enc = 'PRV:' + CryptoJS.AES.encrypt(JSON.stringify(payload), pwd).toString();
    rec.url = `${location.origin}${location.pathname}?shared=${encodeURIComponent(enc)}`; rec.public = false;
  } else {
    const b = 'PUB:' + btoa(JSON.stringify(payload));
    rec.url = `${location.origin}${location.pathname}?shared=${encodeURIComponent(b)}`; rec.public = true;
  }
  persistLinks(); renderSharedList(); toast('Link updated');
}
function revokeLink(id){ shared = shared.filter(s=> s.id !== id); persistLinks(); renderSharedList(); toast('Revoked'); }

/* ---- handle incoming shared link ---- */
function handleIncomingShared(){
  const params = new URLSearchParams(location.search);
  const s = params.get('shared'); if(!s) return;
  const raw = decodeURIComponent(s);
  if(raw.startsWith('PUB:')){
    try { const payload = JSON.parse(atob(raw.slice(4))); if(payload.expires && now() > payload.expires){ alert('This link has expired'); return; } showViewer(payload); } catch(e){ alert('Invalid public link'); }
  } else if(raw.startsWith('PRV:')){
    openModal('pwModal'); $('#openShareBtn').onclick = ()=> {
      const pwd = $('#openPassword').value; if(!pwd) return;
      try {
        const bytes = CryptoJS.AES.decrypt(raw.slice(4), pwd); const json = bytes.toString(CryptoJS.enc.Utf8);
        if(!json) throw new Error('bad'); const payload = JSON.parse(json);
        if(payload.expires && now() > payload.expires){ alert('This link has expired'); closeModal('pwModal'); return; }
        closeModal('pwModal'); showViewer(payload);
      } catch(e){ alert('Incorrect password or corrupted link'); }
    };
  } else { /* no shared param */ }
}
function showViewer(payload){
  $('#viewerTitle').textContent = payload.title || 'Shared document'; $('#viewerContent').innerHTML = sanitize(payload.html || '');
  openModal('viewer');
}

/* ---- modal helpers ---- */
function openModal(id){ $(`#${id}`).classList.remove('hidden'); }
function closeModal(id){ $(`#${id}`).classList.add('hidden'); }

/* ---- theme ---- */
function applyTheme(name){
  document.documentElement.classList.remove('hacker','cyber','light');
  if(!name) name = 'hacker';
  if(name === 'hacker') document.documentElement.classList.add('hacker');
  else if(name === 'cyber') document.documentElement.classList.add('cyber');
  else if(name === 'light') document.documentElement.classList.add('light');
  else document.documentElement.classList.remove('hacker','cyber','light');
  localStorage.setItem(THEME_KEY, name);
}

/* ---- find ---- */
function openFind(){
  const term = prompt('Find (type term):'); if(!term) return;
  const idx = editor.innerText.indexOf(term); if(idx === -1){ toast('Not found'); return; }
  selectTextByIndex(idx, term.length);
}
function selectTextByIndex(start, len){
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node, pos=0, sNode, eNode, sOff, eOff;
  while(node = walker.nextNode()){
    const next = pos + node.textContent.length;
    if(!sNode && start >= pos && start < next){ sNode = node; sOff = start - pos; }
    if(sNode && (start+len) <= next){ eNode = node; eOff = (start+len) - pos; break; }
    pos = next;
  }
  if(sNode && eNode){ const r = document.createRange(); r.setStart(sNode, sOff); r.setEnd(eNode, eOff); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
}

/* ---- small helpers ---- */
function persistDocs(){ localStorage.setItem(DOCS_KEY, JSON.stringify(docs)); }
function persistLinks(){ localStorage.setItem(LINKS_KEY, JSON.stringify(shared)); }
function deriveTitleFromContent(html){ return (html||'').replace(/<[^>]+>/g,' ').trim().split('\n')[0]?.slice(0,60) || 'Untitled'; }
function showTooltip(text, el){
  const tip = $('#tooltip'); tip.textContent = text; const rect = el.getBoundingClientRect();
  tip.style.top = (rect.bottom + 8 + window.scrollY) + 'px'; tip.style.left = (rect.left + (rect.width/2) - 110 + window.scrollX) + 'px'; tip.classList.remove('hidden');
}
function hideTooltip(){ $('#tooltip').classList.add('hidden'); }
