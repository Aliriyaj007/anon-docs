// Formatting
function formatDoc(cmd, value = null) {
  document.execCommand(cmd, false, value);
}

// Save Document
function saveDoc() {
  localStorage.setItem("document", document.getElementById("editor").innerHTML);
  alert("Document Saved Locally ✅");
}

// Load Document
window.onload = () => {
  if (localStorage.getItem("document")) {
    document.getElementById("editor").innerHTML = localStorage.getItem("document");
  }
};

// Print only editor content
function printDoc() {
  let content = document.getElementById("editor").innerHTML;
  let win = window.open('', '', 'height=600,width=800');
  win.document.write('<html><head><title>Print</title></head><body>');
  win.document.write(content);
  win.document.write('</body></html>');
  win.document.close();
  win.print();
}

// Themes
let themes = ["light", "dark", "colored"];
let currentTheme = 0;
function toggleTheme() {
  document.body.className = themes[currentTheme % 3];
  currentTheme++;
}

// Share Document
function shareDoc() {
  let doc = document.getElementById("editor").innerHTML;
  let id = "doc_" + Date.now();
  localStorage.setItem(id, JSON.stringify({ content: doc, public: true, expiry: Date.now() + 86400000 }));

  let link = window.location.origin + window.location.pathname + "?doc=" + id;
  document.getElementById("shareLink").innerText = link;
  document.getElementById("sharePopup").style.display = "flex";

  navigator.clipboard.writeText(link);
  alert("Link Copied to Clipboard ✅");
}

// Close Popup
function closePopup() {
  document.getElementById("sharePopup").style.display = "none";
}

// Manage Links
function showLinks() {
  let list = document.getElementById("linksList");
  list.innerHTML = "";
  for (let key in localStorage) {
    if (key.startsWith("doc_")) {
      let data = JSON.parse(localStorage.getItem(key));
      let li = document.createElement("li");
      li.innerHTML = `<a href="?doc=${key}" target="_blank">${key}</a> - ${data.public ? "Public" : "Private"} 
      <button onclick="togglePrivacy('${key}')">Toggle</button>`;
      list.appendChild(li);
    }
  }
  document.getElementById("linksManager").style.display = "flex";
}
function closeLinks() {
  document.getElementById("linksManager").style.display = "none";
}
function togglePrivacy(key) {
  let data = JSON.parse(localStorage.getItem(key));
  data.public = !data.public;
  localStorage.setItem(key, JSON.stringify(data));
  showLinks();
}

// Load Shared Doc (View-Only)
const params = new URLSearchParams(window.location.search);
if (params.has("doc")) {
  let key = params.get("doc");
  let data = JSON.parse(localStorage.getItem(key));
  if (data && Date.now() < data.expiry && data.public) {
    document.getElementById("editor").innerHTML = data.content;
    document.getElementById("editor").contentEditable = false;
    alert("You are viewing a shared document (read-only).");
  } else {
    document.body.innerHTML = "<h2>❌ Link Expired or Private</h2>";
  }
}
