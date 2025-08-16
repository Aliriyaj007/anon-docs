let docs = JSON.parse(localStorage.getItem("docs") || "{}");
let currentDoc = null;
let isLight = false;

function renderDocs() {
  const list = document.getElementById("docList");
  list.innerHTML = "";
  Object.keys(docs).forEach(id => {
    let div = document.createElement("div");
    div.className = "doc-item";
    div.textContent = docs[id].title || "Untitled";
    div.onclick = () => loadDocument(id);
    list.appendChild(div);
  });
}

function newDocument() {
  currentDoc = Date.now().toString();
  docs[currentDoc] = { title: "Untitled", content: "" };
  document.getElementById("editor").innerHTML = "";
  renderDocs();
}

function loadDocument(id) {
  currentDoc = id;
  document.getElementById("editor").innerHTML = docs[id].content;
}

function saveDocument() {
  if (!currentDoc) newDocument();
  let content = document.getElementById("editor").innerHTML;
  let title = content.replace(/<[^>]+>/g, "").substring(0, 20) || "Untitled";
  docs[currentDoc] = { title, content };
  localStorage.setItem("docs", JSON.stringify(docs));
  renderDocs();
  alert("Document saved locally.");
}

function formatDoc(cmd, value=null) {
  document.execCommand(cmd, false, value);
}

function toggleTheme() {
  isLight = !isLight;
  document.body.className = isLight ? "light" : "";
}

function secureShare() {
  if (!currentDoc) { alert("Save document first."); return; }
  let pwd = prompt("Set a password for this document:");
  if (!pwd) return;
  let data = { content: docs[currentDoc].content, password: pwd };
  let encoded = btoa(JSON.stringify(data));
  let url = window.location.origin + window.location.pathname + "?doc=" + encoded;
  navigator.clipboard.writeText(url);
  alert("Secure URL copied to clipboard.\nShare with the password!");
}

// Handle loading shared doc
window.onload = () => {
  let params = new URLSearchParams(window.location.search);
  if (params.has("doc")) {
    let encoded = params.get("doc");
    try {
      let data = JSON.parse(atob(encoded));
      let pwd = prompt("Enter password to open document:");
      if (pwd === data.password) {
        document.getElementById("editor").innerHTML = data.content;
      } else {
        alert("Incorrect password!");
      }
    } catch(e) {
      console.error(e);
    }
  }
  renderDocs();
};
