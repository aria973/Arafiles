// =================== Loading helpers ===================
function showLoading(msg){
  const ov = document.getElementById("loadingOverlay");
  const hint = document.getElementById("loadingHint");

  if(hint && msg) hint.textContent = msg;
  if(ov) ov.classList.add("active");
}

function hideLoading(){
  const ov = document.getElementById("loadingOverlay");
  if(ov) ov.classList.remove("active");
}

// جلوگیری از زوم Pinch در iOS
document.addEventListener("gesturestart", e => e.preventDefault(), { passive:false });
document.addEventListener("gesturechange", e => e.preventDefault(), { passive:false });
document.addEventListener("gestureend", e => e.preventDefault(), { passive:false });

// =================== IndexedDB Layer ===================
const DB_NAME = "arafiles_db";
const DB_VERSION = 1;
const STORE_META = "meta";
const STORE_IMAGES = "images";

let db = null;
let memImageUrlCache = new Map();
let pdfExportInProgress = false;

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const d = req.result;

      if(!d.objectStoreNames.contains(STORE_META)){
        d.createObjectStore(STORE_META);
      }

      if(!d.objectStoreNames.contains(STORE_IMAGES)){
        d.createObjectStore(STORE_IMAGES);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(store, key){
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const st = tx.objectStore(store);
    const req = st.get(key);

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbSet(store, key, val){
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const st = tx.objectStore(store);
    const req = st.put(val, key);

    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function idbDel(store, key){
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const st = tx.objectStore(store);
    const req = st.delete(key);

    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function idbClear(store){
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const st = tx.objectStore(store);
    const req = st.clear();

    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function uuid(){
  if(crypto && crypto.randomUUID) return crypto.randomUUID();
  return "img_" + Math.random().toString(16).slice(2) + "_" + Date.now();
}

async function putImageBlob(blob){
  const id = uuid();
  await idbSet(STORE_IMAGES, id, blob);
  return id;
}

async function getImageUrl(imageId){
  if(!imageId) return "";

  if(memImageUrlCache.has(imageId)){
    return memImageUrlCache.get(imageId);
  }

  const blob = await idbGet(STORE_IMAGES, imageId);
  if(!blob) return "";

  const url = URL.createObjectURL(blob);
  memImageUrlCache.set(imageId, url);

  return url;
}

async function revokeAllImageUrls(){
  for(const url of memImageUrlCache.values()){
    try{
      URL.revokeObjectURL(url);
    }catch{}
  }

  memImageUrlCache.clear();
}

async function removeImage(imageId){
  if(!imageId) return;

  if(memImageUrlCache.has(imageId)){
    try{
      URL.revokeObjectURL(memImageUrlCache.get(imageId));
    }catch{}

    memImageUrlCache.delete(imageId);
  }

  await idbDel(STORE_IMAGES, imageId);
}

// =================== Legacy localStorage migration ===================
function readLegacyFolders(){
  try{
    return JSON.parse(localStorage.getItem("folders") || "[]");
  }catch{
    return [];
  }
}

// =================== State ===================
let state = {
  view: "home",
  currentFolderIndex: null,
  folders: [],
  theme: "dark",
  background: "gradient1",
  folderGlow: true,
  cropper: null,
  pendingImageBlobUrl: null
};

// مقداردهی پیش‌فرض پوشه و سؤال‌ها
function defaultsForFolder(f){
  if(!("color" in f)) f.color = "#3B82F6";
  if(!("desc" in f)) f.desc = "";
  if(!("questions" in f)) f.questions = [];
  if(!("numberAlign" in f)) f.numberAlign = "right";
  if(!("perPageMode" in f)) f.perPageMode = "auto";
  if(!("perPageManual" in f)) f.perPageManual = 6;
  if(!("exportQuality" in f)) f.exportQuality = "hq";
  if(!("includeKey" in f)) f.includeKey = true;
  if(!("pageNumbers" in f)) f.pageNumbers = false;

  for(const q of (f.questions || [])){
    if(!("text" in q)) q.text = "";
    if(!("options" in q)) q.options = [];
    if(!("align" in q)) q.align = "right";
    if(!("answerText" in q)) q.answerText = "";
    if(!("optionsLayout" in q)){
      q.optionsLayout = "vertical";
    }
    if(!("imageAlign" in q)){
      q.imageAlign = "center";
    }
    if(!("optionsAlign" in q)){
      q.optionsAlign = "right";
    }
  }
}

async function saveState(){
  await idbSet(STORE_META, "state", {
    theme: state.theme,
    background: state.background,
    folderGlow: state.folderGlow,
    folders: state.folders
  });
}

let _saveTimer = null;

function saveStateDebounced(){
  if(_saveTimer) clearTimeout(_saveTimer);

  _saveTimer = setTimeout(() => {
    saveState().catch(() => {});
    _saveTimer = null;
  }, 150);
}

// =================== Service Worker ===================
if("serviceWorker" in navigator){
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// =================== Theme / Background ===================
function setTheme(mode){
  state.theme = mode;

  document.body.classList.remove("dark", "light");
  document.body.classList.add(mode === "dark" ? "dark" : "light");

  applyBackground(state.background);
  saveStateDebounced();
}

function setBackground(key){
  state.background = key;
  saveStateDebounced();
}

function applyBackground(key){
  document.body.style.backgroundImage = "none";
  document.body.style.backgroundColor = "";
  document.body.style.backgroundSize = "";
  document.body.style.backgroundPosition = "";

  if(key === "gradient1"){
    document.body.style.backgroundImage = "linear-gradient(120deg,#1f2937,#3b82f6 100%)";
  }else if(key === "gradient2"){
    document.body.style.backgroundImage = "linear-gradient(120deg,#0ea5e9,#10b981 100%)";
  }else if(key === "grid"){
    document.body.style.backgroundImage = "radial-gradient(#64748b 1px,transparent 1px)";
    document.body.style.backgroundSize = "24px 24px";
  }else if(key === "glass"){
    document.body.style.backgroundColor = "transparent";
  }else if(key === "plain"){
    document.body.style.backgroundColor = "#E9EEF5";
  }else{
    document.body.style.backgroundColor = getComputedStyle(document.body).getPropertyValue("--bg");
  }
}

function applyFolderGlow(){
  document.body.classList.toggle("no-folder-glow", !state.folderGlow);
}

function setBackgroundTile(el){
  document.querySelectorAll(".preview-tile").forEach(t => t.classList.remove("active"));
  el.classList.add("active");

  const key = el.getAttribute("data-bg");

  setBackground(key);
  applyBackground(key);
}

// =================== Settings / Reset ===================
function closeSettings(){
  document.getElementById("settingsOverlay").classList.remove("active");
}

function openResetConfirm(){
  const ov = document.getElementById("resetOverlay");

  ov.classList.add("active");
  document.getElementById("resetStep1").classList.remove("hidden");
  document.getElementById("resetStep2").classList.add("hidden");
}

function toResetStep2(){
  document.getElementById("resetStep1").classList.add("hidden");
  document.getElementById("resetStep2").classList.remove("hidden");
}

function closeReset(){
  document.getElementById("resetOverlay").classList.remove("active");
}

async function doFullReset(){
  showLoading("Reset…");

  await revokeAllImageUrls();

  try{
    await idbClear(STORE_IMAGES);
  }catch(err){
    console.error("Error clearing images:", err);
  }

  state.folders = [];
  state.theme = "dark";
  state.background = "gradient1";
  state.folderGlow = true;

  setTheme("dark");
  applyBackground("gradient1");
  applyFolderGlow();

  await saveState().catch(() => {});

  closeReset();
  closeSettings();
  renderHome();

  hideLoading();
}

function sendEmail(){
  window.location.href = "mailto:Aria973@yahoo.com?subject=نقد یا پرسش درباره Arafiles";
}

// =================== Header wiring ===================
document.getElementById("backBtn").onclick = () => renderHome();

document.getElementById("settingsBtn").onclick = () => {
  document.getElementById("settingsOverlay").classList.add("active");

  const tg = document.getElementById("folderGlowToggle");

  if(tg){
    tg.checked = state.folderGlow;

    tg.onchange = () => {
      state.folderGlow = tg.checked;
      applyFolderGlow();
      saveStateDebounced();
    };
  }
};

const floatingAdd = document.getElementById("floatingAdd");

if(floatingAdd){
  floatingAdd.onclick = addFolder;
}

// =================== Utils ===================
function detectDirection(text){
  return /[\u0600-\u06FF]/.test(text) ? "rtl" : "ltr";
}

function escapeHtml(s){
  return (s ?? "").toString().replace(/[&<>"']/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[m]));
}

function escapeAttr(s){
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function clampInt(v, min, max){
  const n = parseInt(v, 10);

  if(Number.isNaN(n)) return min;

  return Math.max(min, Math.min(max, n));
}

function sleepFrame(){
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function getImageJustify(align){
  if(align === "right") return "flex-start";
  if(align === "left") return "flex-end";
  return "center";
}

function imageAlignLabel(align){
  if(align === "right") return "راست";
  if(align === "left") return "چپ";
  return "وسط";
}

// =================== Home ===================
function renderHome(){
  state.view = "home";
  state.currentFolderIndex = null;

  const app = document.getElementById("app");
  app.innerHTML = "";

  document.getElementById("floatingAdd").style.display = "flex";

  if(state.folders.length === 0){
    const empty = document.createElement("div");

    empty.className = "glass-3d card empty";
    empty.innerHTML = "<p>هیچ فایلی وجود ندارد</p>";

    app.appendChild(empty);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "grid";

  state.folders.forEach((f, i) => {
    defaultsForFolder(f);

    const card = document.createElement("div");

    card.className = "glass-3d card folder-glow";
    card.style.setProperty("--glow", f.color || "#3B82F6");
    card.style.borderLeft = `4px solid ${f.color || "#3B82F6"}`;
    card.onclick = () => openFolder(i);

    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="material-icons-outlined">folder</span>
          <h3 style="margin:0;">${escapeHtml(f.name)}</h3>
        </div>

        <div style="display:flex;gap:6px;">
          <button class="icon-btn" onclick="event.stopPropagation();editFolder(${i})">
            <span class="material-icons-outlined">edit</span>
          </button>

          <button class="icon-btn danger" onclick="event.stopPropagation();deleteFolder(${i})">
            <span class="material-icons-outlined">delete</span>
          </button>
        </div>
      </div>

      <p style="margin:10px 0 6px;opacity:.9;">${escapeHtml(f.desc || "—")}</p>
      <small style="opacity:.8;">${(f.questions || []).length} سوال</small>
    `;

    grid.appendChild(card);
  });

  app.appendChild(grid);
}

function addFolder(){
  const name = prompt("نام پوشه:");

  if(!name) return;

  const desc = prompt("توضیحات:") || "";

  state.folders.push({
    name,
    desc,
    color: "#3B82F6",
    questions: [],
    numberAlign: "right",
    perPageMode: "auto",
    perPageManual: 6,
    exportQuality: "hq",
    includeKey: true,
    pageNumbers: false
  });

  saveStateDebounced();
  renderHome();
}

async function deleteFolder(i){
  if(!confirm("این پوشه حذف شود؟")) return;

  const folder = state.folders[i];
  
  // جمع‌آوری و حذف تصاویر
  const imageIds = new Set();
  for(const q of (folder.questions || [])){
    if(q.imageId) imageIds.add(q.imageId);
  }
  
  for(const id of imageIds){
    try{
      // بررسی اینکه آیا این image در جای دیگری استفاده شده
      let usedElsewhere = false;
      for(let j = 0; j < state.folders.length; j++){
        if(j === i) continue;
        for(const q of (state.folders[j].questions || [])){
          if(q.imageId === id){
            usedElsewhere = true;
            break;
          }
        }
        if(usedElsewhere) break;
      }
      
      if(!usedElsewhere){
        await removeImage(id);
      }
    }catch(err){
      console.error("Error removing image:", err);
    }
  }

  state.folders.splice(i, 1);

  saveStateDebounced();
  renderHome();
}

// =================== Folder view ===================
function openFolder(i){
  state.view = "folder";
  state.currentFolderIndex = i;

  const f = state.folders[i];
  defaultsForFolder(f);

  const app = document.getElementById("app");
  app.innerHTML = "";

  document.getElementById("floatingAdd").style.display = "none";

  const header = document.createElement("div");
  header.className = "glass-3d card folder-header";

  header.innerHTML = `
    <div class="folder-title-row">
      <h2 class="folder-title">${escapeHtml(f.name)}</h2>

      <button class="icon-btn" id="editFolderBtn" title="تنظیمات پوشه">
        <span class="material-icons-outlined">tune</span>
      </button>
    </div>

    <div class="folder-controls">
      <div class="ctrl" title="Q/P Auto or Manual">
        <span class="lbl">Q/P</span>

        <label class="toggle">
          <input id="qpModeToggle" type="checkbox" ${f.perPageMode === "manual" ? "checked" : ""}>
          <span class="track"></span>
          <span class="thumb"></span>
        </label>

        <input
          id="perPageManual"
          type="number"
          min="2"
          max="50"
          value="${f.perPageManual || 6}"
          ${f.perPageMode === "manual" ? "" : "disabled"}
        >
      </div>

      <div class="ctrl" title="Number align">
        <span class="lbl">Num</span>

        <select id="numberAlign">
          <option value="right" ${f.numberAlign === "right" ? "selected" : ""}>R</option>
          <option value="left" ${f.numberAlign === "left" ? "selected" : ""}>L</option>
        </select>
      </div>

      <div class="ctrl" title="HQ / Compact">
        <span class="lbl">HQ</span>

        <label class="toggle">
          <input id="toggleQuality" type="checkbox" ${f.exportQuality === "hq" ? "checked" : ""}>
          <span class="track"></span>
          <span class="thumb"></span>
        </label>

        <span class="lbl" style="opacity:.8;">C</span>
      </div>

      <div class="ctrl" title="Answer key in last page">
        <span class="lbl">Key</span>

        <label class="toggle">
          <input id="toggleKey" type="checkbox" ${f.includeKey ? "checked" : ""}>
          <span class="track"></span>
          <span class="thumb"></span>
        </label>
      </div>

      <div class="ctrl" title="Page numbers">
        <span class="lbl">Pg#</span>

        <label class="toggle">
          <input id="togglePageNum" type="checkbox" ${f.pageNumbers ? "checked" : ""}>
          <span class="track"></span>
          <span class="thumb"></span>
        </label>
      </div>
    </div>
  `;

  app.appendChild(header);

  const controls = document.createElement("div");
  controls.className = "glass-3d card";

  controls.innerHTML = `
    <div class="question-actions-bar">
      <button class="primary action-button" id="addTextQ" title="افزودن سؤال متنی">
        <span class="material-icons-outlined">note_add</span>
        <span>سؤال متنی</span>
      </button>

      <button class="primary action-button" id="addImageQ" title="افزودن سؤال تصویری">
        <span class="material-icons-outlined">add_photo_alternate</span>
        <span>سؤال تصویری</span>
      </button>

      <span class="actions-separator"></span>

      <button class="secondary action-button export-pdf-btn" id="exportPDF" title="خروجی PDF">
        <span class="material-icons-outlined">picture_as_pdf</span>
        <span>PDF</span>
      </button>

      <button class="secondary action-button export-zip-btn" id="exportZIP" title="بکاپ ZIP">
        <span class="material-icons-outlined">archive</span>
        <span>ZIP</span>
      </button>
    </div>
  `;

  app.appendChild(controls);

  const listWrap = document.createElement("div");
  listWrap.id = "questions";
  app.appendChild(listWrap);

  document.getElementById("editFolderBtn").onclick = () => editFolder(i);

  document.getElementById("addTextQ").onclick = () => addTextQuestion(i);
  document.getElementById("addImageQ").onclick = () => openCrop(i);

  document.getElementById("exportPDF").onclick = () => {
    if(pdfExportInProgress){
      alert("در حال حاضر خروجی PDF در حال ساخت است. لطفاً صبر کنید.");
      return;
    }
    exportPDF(i);
  };
  document.getElementById("exportZIP").onclick = () => exportZip();

  document.getElementById("numberAlign").onchange = e => {
    f.numberAlign = e.target.value;
    saveStateDebounced();
    renderQuestions(i);
  };

  const qpToggle = document.getElementById("qpModeToggle");
  const qpInput = document.getElementById("perPageManual");

  const syncQPUI = () => {
    const manual = f.perPageMode === "manual";

    qpInput.disabled = !manual;
    qpInput.style.opacity = manual ? "1" : ".55";
  };

  qpToggle.onchange = e => {
    f.perPageMode = e.target.checked ? "manual" : "auto";

    if(f.perPageMode === "manual"){
      const n = clampInt(qpInput.value || f.perPageManual || 6, 2, 50);
      f.perPageManual = n;
      qpInput.value = n;
    }

    saveStateDebounced();
    syncQPUI();
  };

  qpInput.onchange = e => {
    const n = clampInt(e.target.value || 6, 2, 50);

    f.perPageManual = n;
    e.target.value = n;

    saveStateDebounced();
  };

  syncQPUI();

  document.getElementById("toggleQuality").onchange = e => {
    f.exportQuality = e.target.checked ? "hq" : "compact";
    saveStateDebounced();
  };

  document.getElementById("toggleKey").onchange = e => {
    f.includeKey = !!e.target.checked;
    saveStateDebounced();
  };

  document.getElementById("togglePageNum").onchange = e => {
    f.pageNumbers = !!e.target.checked;
    saveStateDebounced();
  };

  renderQuestions(i);
}

// =================== Folder edit modal ===================
function editFolder(i){
  const f = state.folders[i];
  defaultsForFolder(f);

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay active";

  const panel = document.createElement("div");
  panel.className = "modal-panel glass-3d";

  panel.innerHTML = `
    <div class="modal-header">
      <h2>تنظیمات پوشه</h2>

      <button class="icon-btn" id="closeFolderSettings">
        <span class="material-icons-outlined">close</span>
      </button>
    </div>

    <div class="modal-body">
      <label>نام:</label>
      <input id="folderName" value="${escapeAttr(f.name)}">

      <label>توضیحات:</label>
      <input id="folderDesc" value="${escapeAttr(f.desc || "")}">

      <label>رنگ:</label>
      <input id="folderColor" type="color" value="${escapeAttr(f.color || "#3B82F6")}">

      <div class="row-inline center">
        <button class="primary" id="saveFolder">ذخیره</button>
      </div>
    </div>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  panel.querySelector("#saveFolder").onclick = () => {
    f.name = document.getElementById("folderName").value || "Folder";
    f.desc = document.getElementById("folderDesc").value || "";
    f.color = document.getElementById("folderColor").value || "#3B82F6";

    saveStateDebounced();

    document.body.removeChild(overlay);
    openFolder(i);
  };

  panel.querySelector("#closeFolderSettings").onclick = () => {
    document.body.removeChild(overlay);
  };
}

// =================== Questions render ===================
async function renderQuestions(folderIndex){
  const f = state.folders[folderIndex];
  defaultsForFolder(f);

  const wrap = document.getElementById("questions");
  wrap.innerHTML = "";

  if(!f.questions || f.questions.length === 0){
    const empty = document.createElement("div");

    empty.className = "glass-3d card empty";
    empty.innerHTML = "<p>هنوز سوالی اضافه نشده است.</p>";

    wrap.appendChild(empty);
    return;
  }

  wrap.ondragover = e => e.preventDefault();

  for(let idx = 0; idx < f.questions.length; idx++){
    const q = f.questions[idx];

    if(!("options" in q)) q.options = [];
    if(!("answerText" in q)) q.answerText = "";
    if(!("optionsLayout" in q)) q.optionsLayout = "vertical";
    if(!("imageAlign" in q)) q.imageAlign = "center";
    if(!("optionsAlign" in q)) q.optionsAlign = "right";

    const card = document.createElement("div");

    card.className = "glass-3d card question";
    card.draggable = true;
    card.setAttribute("dir", detectDirection(q.text || ""));
    card.setAttribute("align", q.align || "right");

    const top = document.createElement("div");
    top.className = "top-row";

    const strong = document.createElement("strong");
    const label = q.text && q.text.trim().length
      ? `${idx + 1}. ${q.text}`
      : `${idx + 1}.`;

    strong.textContent = label;
    strong.style.textAlign = f.numberAlign || "right";
    strong.style.flex = "1";

    top.appendChild(strong);

    const actions = document.createElement("div");
    actions.className = "actions";

    const editBtn = document.createElement("button");
    editBtn.className = "mini";
    editBtn.title = "ویرایش";
    editBtn.innerHTML = `<span class="material-icons-outlined">edit</span>`;
    editBtn.onclick = () => editQuestion(folderIndex, idx);

    const delBtn = document.createElement("button");
    delBtn.className = "mini danger";
    delBtn.title = "حذف";
    delBtn.innerHTML = `<span class="material-icons-outlined">delete</span>`;
    delBtn.onclick = () => deleteQuestion(folderIndex, idx);

    const alignBtn = document.createElement("button");
    alignBtn.className = "mini";
    alignBtn.title = "تنظیمات چینش";
    alignBtn.innerHTML = `<span class="material-icons-outlined">format_align_center</span>`;

    alignBtn.onclick = (e) => {
      e.stopPropagation();
      openLayoutMenuFullscreen(folderIndex, idx);
    };

    const ansBtn = document.createElement("button");

    ansBtn.className = "mini" + (
      q.answerText && q.answerText.trim() ? " ok" : ""
    );

    ansBtn.title = "جواب متنی";
    ansBtn.innerHTML = `
      <span class="material-icons-outlined">note</span>
      <span style="font-weight:900;">Ans</span>
    `;

    ansBtn.onclick = () => {
      const cur = q.answerText || "";
      const val = prompt("جواب متنی سوال:", cur);

      if(val === null) return;

      q.answerText = (val || "").trim();

      saveStateDebounced();
      renderQuestions(folderIndex);
    };

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    actions.appendChild(alignBtn);
    actions.appendChild(ansBtn);

    top.appendChild(actions);
    card.appendChild(top);

    if(q.imageId){
      const imageWrap = document.createElement("div");

      imageWrap.className = `question-image-wrap image-align-${q.imageAlign || "center"}`;

      const img = document.createElement("img");

      img.className = "question-img";
      img.alt = "image";

      imageWrap.appendChild(img);
      card.appendChild(imageWrap);

      getImageUrl(q.imageId).then(url => {
        if(url) img.src = url;
      });
    }

    if(q.options && q.options.length){
      const ul = document.createElement("ul");
      const layout = q.optionsLayout || "vertical";

      ul.className = `options options-${layout}`;
      
      ul.setAttribute("dir", "ltr");
      
      if(q.optionsAlign === "center") ul.style.textAlign = "center";
      if(q.optionsAlign === "left") ul.style.textAlign = "left";
      if(q.optionsAlign === "right") ul.style.textAlign = "right";

      q.options.forEach((o, j) => {
        const li = document.createElement("li");

        const labelSpan = document.createElement("span");
        labelSpan.className = "option-label";
        labelSpan.textContent = `(${String.fromCharCode(97 + j)})`;

        const textSpan = document.createElement("span");
        textSpan.className = "option-text";
        textSpan.textContent = o;
        textSpan.setAttribute("dir", "ltr");
        textSpan.style.unicodeBidi = "plaintext";

        li.appendChild(labelSpan);
        li.appendChild(textSpan);

        ul.appendChild(li);
      });

      card.appendChild(ul);
    }

    card.addEventListener("dragstart", e => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("index", idx);
    });

    card.addEventListener("drop", e => {
      e.preventDefault();

      const from = +e.dataTransfer.getData("index");
      const to = idx;

      if(Number.isNaN(from) || from === to) return;

      const arr = f.questions;
      const moved = arr.splice(from, 1)[0];

      arr.splice(to, 0, moved);

      saveStateDebounced();
      renderQuestions(folderIndex);
    });

    wrap.appendChild(card);
  }
}

// =================== Layout Menu Fullscreen (منوی چینش تمام صفحه) ===================
function openLayoutMenuFullscreen(folderIndex, idx){
  const q = state.folders[folderIndex].questions[idx];

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay active";
  overlay.style.overflow = "hidden";

  const panel = document.createElement("div");
  panel.className = "modal-panel glass-3d";
  panel.style.maxHeight = "80vh";
  panel.style.overflowY = "auto";

  panel.innerHTML = `
    <div class="modal-header">
      <h2>تنظیمات چینش سوال</h2>

      <button class="icon-btn" id="closeLayoutMenu">
        <span class="material-icons-outlined">close</span>
      </button>
    </div>

    <div class="modal-body">
      <div class="layout-section">
        <label class="layout-section-label">چینش متن سوال:</label>
        <div class="layout-options-group">
          <button class="layout-option-btn ${q.align === 'right' ? 'active' : ''}" data-align="right">
            <span class="material-icons-outlined">format_align_right</span>
            راست
          </button>
          <button class="layout-option-btn ${q.align === 'center' ? 'active' : ''}" data-align="center">
            <span class="material-icons-outlined">format_align_center</span>
            وسط
          </button>
          <button class="layout-option-btn ${q.align === 'left' ? 'active' : ''}" data-align="left">
            <span class="material-icons-outlined">format_align_left</span>
            چپ
          </button>
        </div>
      </div>

      <div class="layout-section">
        <label class="layout-section-label">چینش عکس:</label>
        <div class="layout-options-group">
          <button class="layout-option-btn ${q.imageAlign === 'right' ? 'active' : ''}" data-image-align="right">
            <span class="material-icons-outlined">align_horizontal_right</span>
            راست
          </button>
          <button class="layout-option-btn ${q.imageAlign === 'center' ? 'active' : ''}" data-image-align="center">
            <span class="material-icons-outlined">align_horizontal_center</span>
            وسط
          </button>
          <button class="layout-option-btn ${q.imageAlign === 'left' ? 'active' : ''}" data-image-align="left">
            <span class="material-icons-outlined">align_horizontal_left</span>
            چپ
          </button>
        </div>
      </div>

      <div class="layout-section">
        <label class="layout-section-label">چینش گزینه‌ها:</label>
        <div class="layout-options-group">
          <button class="layout-option-btn ${q.optionsAlign === 'right' ? 'active' : ''}" data-options-align="right">
            <span class="material-icons-outlined">format_align_right</span>
            راست
          </button>
          <button class="layout-option-btn ${q.optionsAlign === 'center' ? 'active' : ''}" data-options-align="center">
            <span class="material-icons-outlined">format_align_center</span>
            وسط
          </button>
          <button class="layout-option-btn ${q.optionsAlign === 'left' ? 'active' : ''}" data-options-align="left">
            <span class="material-icons-outlined">format_align_left</span>
            چپ
          </button>
        </div>
      </div>

      <div class="layout-section">
        <label class="layout-section-label">حالت نمایش گزینه‌ها:</label>
        <div class="layout-options-group">
          <button class="layout-option-btn ${q.optionsLayout === 'vertical' ? 'active' : ''}" data-options-layout="vertical">
            <span class="material-icons-outlined">vertical_split</span>
            عمودی
          </button>
          <button class="layout-option-btn ${q.optionsLayout === 'inline' ? 'active' : ''}" data-options-layout="inline">
            <span class="material-icons-outlined">horizontal_split</span>
            افقی
          </button>
        </div>
      </div>

      <div class="row-inline center" style="margin-top:16px;">
        <button class="primary" id="closeLayoutDone">انجام شد</button>
      </div>
    </div>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  document.body.style.overflow = "hidden";

  panel.querySelectorAll("[data-align]").forEach(btn => {
    btn.onclick = () => {
      q.align = btn.dataset.align;
      saveStateDebounced();
      renderQuestions(folderIndex);
      updateActiveButtons(panel, "data-align", q.align);
    };
  });

  panel.querySelectorAll("[data-image-align]").forEach(btn => {
    btn.onclick = () => {
      q.imageAlign = btn.dataset.imageAlign;
      saveStateDebounced();
      renderQuestions(folderIndex);
      updateActiveButtons(panel, "data-image-align", q.imageAlign);
    };
  });

  panel.querySelectorAll("[data-options-align]").forEach(btn => {
    btn.onclick = () => {
      q.optionsAlign = btn.dataset.optionsAlign;
      saveStateDebounced();
      renderQuestions(folderIndex);
      updateActiveButtons(panel, "data-options-align", q.optionsAlign);
    };
  });

  panel.querySelectorAll("[data-options-layout]").forEach(btn => {
    btn.onclick = () => {
      q.optionsLayout = btn.dataset.optionsLayout;
      saveStateDebounced();
      renderQuestions(folderIndex);
      updateActiveButtons(panel, "data-options-layout", q.optionsLayout);
    };
  });

  function updateActiveButtons(panel, attr, value){
    panel.querySelectorAll(`[${attr}]`).forEach(b => {
      b.classList.toggle("active", b.getAttribute(attr) === value);
    });
  }

  const close = () => {
    document.body.style.overflow = "";
    document.body.removeChild(overlay);
  };

  panel.querySelector("#closeLayoutMenu").onclick = close;
  panel.querySelector("#closeLayoutDone").onclick = close;

  overlay.addEventListener("click", (e) => {
    if(e.target === overlay){
      close();
    }
  });
}

// =================== Add text question ===================
function addTextQuestion(folderIndex){
  const text = prompt("متن سوال (می‌تواند خالی باشد):") || "";

  const q = {
    type: "text",
    text,
    options: [],
    answerText: "",
    align: "right",
    optionsLayout: "vertical",
    imageAlign: "center",
    optionsAlign: "right"
  };

  state.folders[folderIndex].questions.push(q);

  saveStateDebounced();
  renderQuestions(folderIndex);

  openOptionsEditor(folderIndex, state.folders[folderIndex].questions.length - 1);
}

// =================== Options editor ===================
function openOptionsEditor(folderIndex, idx){
  const q = state.folders[folderIndex].questions[idx];

  if(!("options" in q)) q.options = [];
  if(!("optionsLayout" in q)) q.optionsLayout = "vertical";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay active";

  const panel = document.createElement("div");
  panel.className = "modal-panel glass-3d";

  panel.innerHTML = `
    <div class="modal-header">
      <h2>گزینه‌ها</h2>

      <button class="icon-btn" id="closeOpt">
        <span class="material-icons-outlined">close</span>
      </button>
    </div>

    <div class="modal-body">
      <div id="optList" class="row"></div>

      <div class="row-inline center">
        <button class="primary" id="addOpt">
          <span class="material-icons-outlined">add</span>
          افزودن گزینه
        </button>

        <button class="secondary" id="doneOpt">
          <span class="material-icons-outlined">check</span>
          انجام شد
        </button>
      </div>
    </div>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const renderOpts = () => {
    const wrap = panel.querySelector("#optList");
    wrap.innerHTML = "";

    (q.options || []).forEach((o, i) => {
      const row = document.createElement("div");

      row.className = "row-inline";
      row.style.justifyContent = "space-between";
      row.style.width = "100%";

      row.innerHTML = `
        <span style="direction:ltr;unicode-bidi:isolate;font-weight:900;">
          (${String.fromCharCode(97 + i)})
        </span>

        <input value="${escapeAttr(o || "")}" data-idx="${i}" style="flex:1;">

        <button class="icon-btn danger" data-del="${i}">
          <span class="material-icons-outlined">close</span>
        </button>
      `;

      wrap.appendChild(row);
    });

    wrap.querySelectorAll("input[data-idx]").forEach(inp => {
      inp.oninput = e => {
        q.options[+e.target.dataset.idx] = e.target.value;
        saveStateDebounced();
        renderQuestions(folderIndex);
      };
    });

    wrap.querySelectorAll("[data-del]").forEach(btn => {
      btn.onclick = e => {
        const di = +e.currentTarget.dataset.del;

        q.options.splice(di, 1);

        saveStateDebounced();
        renderOpts();
        renderQuestions(folderIndex);
      };
    });
  };

  renderOpts();

  panel.querySelector("#addOpt").onclick = () => {
    q.options.push("");

    saveStateDebounced();
    renderOpts();
    renderQuestions(folderIndex);
  };

  const close = () => {
    document.body.removeChild(overlay);
    renderQuestions(folderIndex);
  };

  panel.querySelector("#doneOpt").onclick = close;
  panel.querySelector("#closeOpt").onclick = close;
}

// =================== Question edit modal ===================
function editQuestion(folderIndex, idx){
  const q = state.folders[folderIndex].questions[idx];

  if(!("optionsLayout" in q)) q.optionsLayout = "vertical";
  if(!("imageAlign" in q)) q.imageAlign = "center";
  if(!("options" in q)) q.options = [];

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay active";

  const panel = document.createElement("div");
  panel.className = "modal-panel glass-3d";

  panel.innerHTML = `
    <div class="modal-header">
      <h2>ویرایش سوال</h2>

      <button class="icon-btn" id="closeEditQ">
        <span class="material-icons-outlined">close</span>
      </button>
    </div>

    <div class="modal-body">
      <div class="question-edit-tools">
        <button class="secondary" id="editText">
          <span class="material-icons-outlined">edit</span>
          متن سؤال
        </button>

        <button class="secondary" id="editOptions">
          <span class="material-icons-outlined">list</span>
          گزینه‌ها
        </button>

        <button class="secondary" id="editImage">
          <span class="material-icons-outlined">image</span>
          تصویر
        </button>

        <button class="secondary" id="cropImage">
          <span class="material-icons-outlined">crop</span>
          کراپ تصویر
        </button>
      </div>
    </div>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  panel.querySelector("#editText").onclick = () => {
    const nt = prompt("ویرایش متن سوال:", q.text || "");

    if(nt !== null){
      q.text = nt;

      saveStateDebounced();
      renderQuestions(folderIndex);
    }
  };

  panel.querySelector("#editOptions").onclick = () => {
    openOptionsEditor(folderIndex, idx);
  };

  panel.querySelector("#editImage").onclick = () => {
    const input = document.createElement("input");

    input.type = "file";
    input.accept = "image/*";

    input.onchange = async e => {
      const file = e.target.files[0];

      if(!file) return;

      showLoading("در حال ذخیره تصویر…");
      await sleepFrame();

      try{
        const newId = await putImageBlob(file);

        if(q.imageId){
          await removeImage(q.imageId);
        }

        q.imageId = newId;

        saveStateDebounced();
        renderQuestions(folderIndex);

        document.body.removeChild(overlay);
      }catch(err){
        console.error(err);
        alert("خطا در ذخیره تصویر");
      }finally{
        hideLoading();
      }
    };

    input.click();
  };

  panel.querySelector("#cropImage").onclick = () => {
    if(!q.imageId){
      alert("هیچ تصویری برای کراپ وجود ندارد.");
      return;
    }

    document.body.removeChild(overlay);
    openCropExisting(folderIndex, idx, q.imageId);
  };

  panel.querySelector("#closeEditQ").onclick = () => {
    document.body.removeChild(overlay);
  };
}

// =================== Delete question ===================
async function deleteQuestion(folderIndex, idx){
  const q = state.folders[folderIndex].questions[idx];

  if(q?.imageId){
    await removeImage(q.imageId);
  }

  state.folders[folderIndex].questions.splice(idx, 1);

  saveStateDebounced();
  renderQuestions(folderIndex);
}

// =================== Cropper / New image ===================
function openCrop(folderIndex){
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay active";

  const panel = document.createElement("div");
  panel.className = "modal-panel glass-3d";

  panel.innerHTML = `
    <div class="modal-header">
      <h2>کراپ تصویر</h2>

      <button class="icon-btn" id="closeCrop">
        <span class="material-icons-outlined">close</span>
      </button>
    </div>

    <div class="modal-body">
      <input id="imageInput" type="file" accept="image/*">

      <div id="cropArea" class="crop-area"></div>

      <div class="row-inline center">
        <button class="primary" id="saveCropped">
          <span class="material-icons-outlined">save</span>
          ذخیره
        </button>

        <button class="secondary" id="cancelCrop">
          <span class="material-icons-outlined">close</span>
          لغو
        </button>
      </div>
    </div>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const input = panel.querySelector("#imageInput");
  const area = panel.querySelector("#cropArea");

  input.onchange = e => {
    const file = e.target.files[0];

    if(!file) return;

    if(state.cropper){
      state.cropper.destroy();
      state.cropper = null;
    }

    if(state.pendingImageBlobUrl){
      URL.revokeObjectURL(state.pendingImageBlobUrl);
      state.pendingImageBlobUrl = null;
    }

    const url = URL.createObjectURL(file);
    state.pendingImageBlobUrl = url;

    area.innerHTML = "";

    const img = document.createElement("img");
    img.src = url;
    img.style.maxWidth = "100%";

    area.appendChild(img);

    state.cropper = new Cropper(img, {
      viewMode: 1,
      dragMode: "move",
      autoCropArea: .85,
      background: false
    });
  };

  panel.querySelector("#saveCropped").onclick = async () => {
    if(!state.cropper){
      alert("ابتدا یک تصویر انتخاب کنید.");
      return;
    }

    showLoading("در حال ذخیره تصویر…");
    await sleepFrame();

    try{
      const canvas = state.cropper.getCroppedCanvas({
        imageSmoothingQuality: "high"
      });

      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, "image/png", 1);
      });

      if(!blob){
        throw new Error("Could not create image blob");
      }

      const imageId = await putImageBlob(blob);

      state.folders[folderIndex].questions.push({
        type: "image",
        text: "",
        options: [],
        answerText: "",
        align: "right",
        imageId,
        optionsLayout: "vertical",
        imageAlign: "center",
        optionsAlign: "right"
      });

      saveStateDebounced();

      cleanupCrop(overlay);
      openFolder(folderIndex);
    }catch(err){
      console.error(err);
      alert("خطا در ذخیره تصویر");
    }finally{
      hideLoading();
    }
  };

  const close = () => cleanupCrop(overlay);

  panel.querySelector("#cancelCrop").onclick = close;
  panel.querySelector("#closeCrop").onclick = close;
}

// =================== Crop existing image ===================
async function openCropExisting(folderIndex, idx, imageId){
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay active";

  const panel = document.createElement("div");
  panel.className = "modal-panel glass-3d";

  panel.innerHTML = `
    <div class="modal-header">
      <h2>کراپ تصویر</h2>

      <button class="icon-btn" id="closeCrop">
        <span class="material-icons-outlined">close</span>
      </button>
    </div>

    <div class="modal-body">
      <div id="cropArea" class="crop-area"></div>

      <div class="row-inline center">
        <button class="primary" id="saveCropped">
          <span class="material-icons-outlined">save</span>
          ذخیره
        </button>

        <button class="secondary" id="cancelCrop">
          <span class="material-icons-outlined">close</span>
          لغو
        </button>
      </div>
    </div>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const area = panel.querySelector("#cropArea");
  area.innerHTML = "";

  showLoading("در حال بارگذاری تصویر…");
  await sleepFrame();

  try{
    const url = await getImageUrl(imageId);

    if(!url){
      throw new Error("Image not found");
    }

    const img = document.createElement("img");

    img.src = url;
    img.style.maxWidth = "100%";

    img.onload = () => {
      state.cropper = new Cropper(img, {
        viewMode: 1,
        dragMode: "move",
        autoCropArea: .85,
        background: false
      });
    };

    area.appendChild(img);
  }catch(err){
    console.error(err);
    alert("تصویر پیدا نشد.");
    cleanupCrop(overlay);
    return;
  }finally{
    hideLoading();
  }

  panel.querySelector("#saveCropped").onclick = async () => {
    if(!state.cropper) return;

    showLoading("در حال ذخیره تصویر…");
    await sleepFrame();

    try{
      const canvas = state.cropper.getCroppedCanvas({
        imageSmoothingQuality: "high"
      });

      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, "image/png", 1);
      });

      if(!blob){
        throw new Error("Could not create image blob");
      }

      const newId = await putImageBlob(blob);

      await removeImage(imageId);

      state.folders[folderIndex].questions[idx].imageId = newId;

      saveStateDebounced();

      cleanupCrop(overlay);
      openFolder(folderIndex);
    }catch(err){
      console.error(err);
      alert("خطا در ذخیره تصویر");
    }finally{
      hideLoading();
    }
  };

  const close = () => cleanupCrop(overlay);

  panel.querySelector("#cancelCrop").onclick = close;
  panel.querySelector("#closeCrop").onclick = close;
}

function cleanupCrop(overlay){
  if(overlay && overlay.parentNode){
    overlay.parentNode.removeChild(overlay);
  }

  if(state.cropper){
    state.cropper.destroy();
    state.cropper = null;
  }

  if(state.pendingImageBlobUrl){
    URL.revokeObjectURL(state.pendingImageBlobUrl);
    state.pendingImageBlobUrl = null;
  }
}

// =================== PDF Export - Production Ready ===================
async function exportPDF(folderIndex){
  // جلوگیری از اجرای هم‌زمان
  if(pdfExportInProgress){
    alert("در حال حاضر خروجی PDF در حال ساخت است. لطفاً صبر کنید.");
    return;
  }
  
  pdfExportInProgress = true;
  
  const folder = state.folders[folderIndex];
  defaultsForFolder(folder);

  const { jsPDF } = window.jspdf;
  let stage = null;
  let doc = null;
  let pageCounter = 0;

  try{
    const quality = folder.exportQuality === "hq" ? "hq" : "compact";
    const scale = quality === "hq" ? 1.8 : 1.5;
    const jpegQ = quality === "hq" ? 0.88 : 0.78;

    const PAGE_W = 794;
    const PAGE_H = 1123;
    const PADDING = 20;
    const GAP = 18;

    const manualMode = folder.perPageMode === "manual";
    const manualLimit = clampInt(folder.perPageManual || 6, 2, 50);

    const isLeftAlign = folder.numberAlign === "left";

    // ایجاد stage
    stage = document.createElement("div");
    stage.style.position = "fixed";
    stage.style.left = "-99999px";
    stage.style.top = "0";
    stage.style.width = PAGE_W + "px";
    stage.style.height = PAGE_H + "px";
    stage.style.padding = PADDING + "px";
    stage.style.boxSizing = "border-box";
    stage.style.background = "#fff";
    stage.style.color = "#000";
    stage.style.fontFamily = "Vazirmatn, sans-serif";
    stage.style.direction = isLeftAlign ? "ltr" : "rtl";
    stage.style.overflow = "hidden";

    document.body.appendChild(stage);

    const title = document.createElement("div");
    title.style.fontWeight = "900";
    title.style.fontSize = "18px";
    title.style.marginBottom = "10px";
    title.style.textAlign = "center";
    title.textContent = folder.name || "Arafiles";

    stage.appendChild(title);
    await sleepFrame();

    const footer = document.createElement("div");
    footer.style.position = "absolute";
    footer.style.left = "0";
    footer.style.right = "0";
    footer.style.bottom = "10px";
    footer.style.textAlign = "center";
    footer.style.fontSize = "12px";
    footer.style.opacity = ".75";

    stage.appendChild(footer);

    const colsWrap = document.createElement("div");
    colsWrap.style.display = "flex";
    colsWrap.style.gap = GAP + "px";

    const titleHeight = title.getBoundingClientRect().height || 40;
    const availableH = PAGE_H - (PADDING * 2) - titleHeight - 20;

    colsWrap.style.height = Math.max(availableH, 300) + "px";
    colsWrap.style.overflow = "hidden";

    const col1 = document.createElement("div");
    const col2 = document.createElement("div");

    [col1, col2].forEach(col => {
      col.style.flex = "1";
      col.style.height = "100%";
      col.style.overflow = "hidden";
      col.style.display = "flex";
      col.style.flexDirection = "column";
      col.style.gap = "12px";
    });

    const firstCol = isLeftAlign ? col2 : col1;
    const secondCol = isLeftAlign ? col1 : col2;

    if(isLeftAlign){
      colsWrap.appendChild(col2);
      colsWrap.appendChild(col1);
    }else{
      colsWrap.appendChild(col1);
      colsWrap.appendChild(col2);
    }

    stage.appendChild(colsWrap);

    const qs = folder.questions || [];

    if(qs.length === 0){
      throw new Error("هیچ سوالی برای خروجی وجود ندارد");
    }

    // ابزارهای کمکی
    const waitImages = async (root) => {
      const imgs = Array.from(root.querySelectorAll("img"));
      if(imgs.length === 0) return;

      const promises = imgs.map(img => {
        return new Promise((resolve) => {
          let resolved = false;
          const timeout = setTimeout(() => {
            if(!resolved){
              resolved = true;
              resolve();
            }
          }, 4000);

          img.onload = () => {
            if(!resolved){
              resolved = true;
              clearTimeout(timeout);
              resolve();
            }
          };
          
          img.onerror = () => {
            if(!resolved){
              resolved = true;
              clearTimeout(timeout);
              resolve();
            }
          };

          if(img.complete && img.naturalWidth > 0){
            if(!resolved){
              resolved = true;
              clearTimeout(timeout);
              resolve();
            }
          }
        });
      });

      await Promise.all(promises);
      await sleepFrame();
    };

    const makeBlock = async (q, number) => {
      const block = document.createElement("div");

      block.style.border = "1px solid #ccc";
      block.style.borderRadius = "10px";
      block.style.padding = "10px";
      block.style.boxSizing = "border-box";
      block.style.breakInside = "avoid";
      block.style.pageBreakInside = "avoid";
      block.style.background = "#fff";

      if(q.align === "center") block.style.textAlign = "center";
      if(q.align === "left") block.style.textAlign = "left";
      if(q.align === "right") block.style.textAlign = "right";

      const head = document.createElement("div");
      head.style.fontWeight = "900";
      head.style.marginBottom = "8px";
      head.style.textAlign = folder.numberAlign || "right";
      
      head.textContent = q.text && q.text.trim().length
        ? `${number}. ${q.text}`
        : `${number}.`;

      block.appendChild(head);

      if(q.imageId){
        try{
          const imageWrap = document.createElement("div");
          imageWrap.style.display = "flex";
          imageWrap.style.marginTop = "10px";
          imageWrap.style.justifyContent = getImageJustify(q.imageAlign || "center");

          const img = document.createElement("img");
          img.style.maxWidth = "100%";
          img.style.maxHeight = "220px";
          img.style.objectFit = "contain";
          img.style.borderRadius = "10px";

          const url = await getImageUrl(q.imageId);
          
          if(url){
            img.src = url;
            // تلاش برای decode
            try{
              if(img.decode) await img.decode();
            }catch{}
          }else{
            img.style.display = "none";
          }

          imageWrap.appendChild(img);
          block.appendChild(imageWrap);
        }catch(err){
          console.warn("خطا در بارگذاری تصویر:", err);
        }
      }

      if(q.options && q.options.length){
        const opts = document.createElement("div");
        const layout = q.optionsLayout || "vertical";

        if(layout === "inline"){
          opts.style.display = "flex";
          opts.style.flexWrap = "wrap";
          opts.style.columnGap = "40px";
          opts.style.rowGap = "10px";
          opts.style.marginTop = "10px";
        }else{
          opts.style.display = "flex";
          opts.style.flexDirection = "column";
          opts.style.gap = "4px";
          opts.style.marginTop = "8px";
        }

        opts.setAttribute("dir", "ltr");

        if(q.optionsAlign === "center") opts.style.textAlign = "center";
        if(q.optionsAlign === "left") opts.style.textAlign = "left";
        if(q.optionsAlign === "right") opts.style.textAlign = "right";

        q.options.forEach((opt, i) => {
          const row = document.createElement("div");

          if(layout === "inline"){
            row.style.whiteSpace = "nowrap";
          }

          row.style.direction = "ltr";
          row.innerHTML =
            `<span style="direction:ltr;unicode-bidi:isolate;display:inline-block;min-width:22px;font-weight:800;">${String.fromCharCode(65 + i)}.</span>` +
            `<span style="direction:ltr;unicode-bidi:plaintext;">${escapeHtml(opt)}</span>`;

          opts.appendChild(row);
        });

        block.appendChild(opts);
      }

      return block;
    };

    const clearCols = () => {
      col1.innerHTML = "";
      col2.innerHTML = "";
    };

    const fits = (col) => {
      try{
        return col.scrollHeight <= col.clientHeight + 5;
      }catch{
        return true;
      }
    };

    const layouts = [];

    const pushLayout = () => {
      layouts.push({
        col1: col1.innerHTML,
        col2: col2.innerHTML
      });
    };

    // ساخت بلوک‌ها
    const blocks = [];
    for(let i = 0; i < qs.length; i++){
      const q = qs[i];

      if(!("options" in q)) q.options = [];
      if(!("answerText" in q)) q.answerText = "";
      if(!("align" in q)) q.align = "right";
      if(!("optionsLayout" in q)) q.optionsLayout = "vertical";
      if(!("imageAlign" in q)) q.imageAlign = "center";
      if(!("optionsAlign" in q)) q.optionsAlign = "right";

      const block = await makeBlock(q, i + 1);
      blocks.push(block);
      
      if(i % 5 === 0 || i === qs.length - 1){
        showLoading(`در حال ساخت PDF… ${Math.round((i + 1) / qs.length * 100)}%`);
        await sleepFrame();
      }
    }

    // چیدمان بلوک‌ها با جلوگیری از infinite loop
    let currentCol = firstCol;
    let countOnPage = 0;
    let blockIndex = 0;
    let guardCounter = 0;
    const MAX_GUARD = blocks.length * 3 + 10;

    while(blockIndex < blocks.length && guardCounter < MAX_GUARD){
      guardCounter++;
      
      if(manualMode && countOnPage >= manualLimit){
        pushLayout();
        clearCols();
        currentCol = firstCol;
        countOnPage = 0;
        continue;
      }

      const block = blocks[blockIndex];
      const blockHeight = block.scrollHeight || 200;
      
      // اگر بلوک از ارتفاع کل صفحه بزرگتر است، آن را مقیاس‌دهی کن
      const pageHeight = parseInt(colsWrap.style.height) || 700;
      if(blockHeight > pageHeight * 0.9){
        const scaleFactor = Math.min(1, (pageHeight * 0.85) / blockHeight);
        block.style.transform = `scale(${scaleFactor})`;
        block.style.transformOrigin = "top center";
      }
      
      currentCol.appendChild(block);
      await waitImages(block);

      if(!fits(currentCol)){
        currentCol.removeChild(block);
        
        if(currentCol === firstCol){
          currentCol = secondCol;
          continue;
        } else {
          // هر دو ستون پر شدند - صفحه جدید
          pushLayout();
          clearCols();
          currentCol = firstCol;
          countOnPage = 0;
          continue;
        }
      }

      blockIndex++;
      countOnPage++;

      if(currentCol === firstCol && !fits(firstCol)){
        currentCol = secondCol;
      }
    }

    // اگر guard فعال شد، یعنی احتمالاً infinite loop
    if(guardCounter >= MAX_GUARD){
      console.warn("Guard limit reached, forcing page break");
      pushLayout();
    }

    if(col1.children.length || col2.children.length){
      pushLayout();
    }

    if(layouts.length === 0){
      throw new Error("هیچ صفحه‌ای برای خروجی ساخته نشد");
    }

    // ایجاد jsPDF یک بار
    doc = new jsPDF("p", "mm", "a4");
    const shouldKey = !!folder.includeKey;
    const totalPages = layouts.length + (shouldKey ? 1 : 0);

    // تابع snapshot با مدیریت حافظه
    const snapAndAddPage = async (pageIndex, isKeyPage = false) => {
      footer.textContent = folder.pageNumbers ? String(pageIndex) : "";

      await sleepFrame();

      if(document.fonts && document.fonts.ready){
        try{
          await document.fonts.ready;
        }catch{}
      }

      // Promise با timeout واقعی
      const canvasPromise = new Promise((resolve, reject) => {
        let timeoutId = null;
        
        const cleanup = () => {
          if(timeoutId){
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        };

        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error("html2canvas timeout"));
        }, 60000);

        html2canvas(stage, {
          scale: scale,
          backgroundColor: "#fff",
          useCORS: true,
          allowTaint: false,
          logging: false,
          width: PAGE_W,
          height: PAGE_H
        }).then(canvas => {
          cleanup();
          resolve(canvas);
        }).catch(err => {
          cleanup();
          reject(err);
        });
      });

      let canvas = null;
      try{
        canvas = await canvasPromise;
      }catch(err){
        console.warn("html2canvas failed, retrying with lower quality:", err);
        // تلاش مجدد با کیفیت پایین‌تر
        canvas = await html2canvas(stage, {
          scale: Math.min(scale, 1.2),
          backgroundColor: "#fff",
          useCORS: true,
          allowTaint: false,
          logging: false,
          width: PAGE_W,
          height: PAGE_H
        });
      }

      if(!canvas){
        throw new Error("Failed to create canvas");
      }

      try{
        const imgData = canvas.toDataURL("image/jpeg", jpegQ);
        
        if(pageCounter > 0){
          doc.addPage();
        }
        pageCounter++;
        
        doc.addImage(
          imgData,
          "JPEG",
          0,
          0,
          doc.internal.pageSize.getWidth(),
          doc.internal.pageSize.getHeight()
        );
      }finally{
        // آزادسازی canvas
        if(canvas){
          canvas.width = 0;
          canvas.height = 0;
          canvas = null;
        }
      }
    };

    // ساخت صفحات سوالات
    for(let p = 0; p < layouts.length; p++){
      showLoading(`ساخت صفحه ${p + 1} از ${totalPages}…`);
      await sleepFrame();

      title.textContent = folder.name || "Arafiles";

      colsWrap.style.display = "flex";
      colsWrap.innerHTML = "";

      if(isLeftAlign){
        colsWrap.appendChild(col2);
        colsWrap.appendChild(col1);
      }else{
        colsWrap.appendChild(col1);
        colsWrap.appendChild(col2);
      }

      col1.innerHTML = layouts[p].col1;
      col2.innerHTML = layouts[p].col2;

      await snapAndAddPage(p + 1);
    }

    // Answer Key
    if(shouldKey){
      showLoading(`ساخت صفحه پاسخ‌نامه…`);
      await sleepFrame();

      title.textContent = `${folder.name || "Arafiles"} — Answer Key`;

      colsWrap.style.display = "block";
      colsWrap.innerHTML = "";
      colsWrap.style.direction = "ltr";

      const box = document.createElement("div");
      box.style.height = "100%";
      box.style.border = "1px solid #ddd";
      box.style.borderRadius = "12px";
      box.style.padding = "14px";
      box.style.boxSizing = "border-box";
      box.style.background = "#fff";
      box.style.direction = "ltr";

      const half = Math.ceil(qs.length / 2);
      
      const colFirst = document.createElement("div");
      colFirst.style.display = "flex";
      colFirst.style.flexDirection = "column";
      colFirst.style.gap = "4px";
      colFirst.style.direction = "ltr";
      
      for(let i = 0; i < half && i < qs.length; i++){
        const ans = qs[i].answerText && qs[i].answerText.trim()
          ? qs[i].answerText.trim()
          : "-";
        const item = document.createElement("div");
        item.textContent = `${i + 1}) ${ans}`;
        item.style.direction = "ltr";
        item.style.textAlign = "left";
        colFirst.appendChild(item);
      }
      
      const colSecond = document.createElement("div");
      colSecond.style.display = "flex";
      colSecond.style.flexDirection = "column";
      colSecond.style.gap = "4px";
      colSecond.style.direction = "ltr";
      
      for(let i = half; i < qs.length; i++){
        const ans = qs[i].answerText && qs[i].answerText.trim()
          ? qs[i].answerText.trim()
          : "-";
        const item = document.createElement("div");
        item.textContent = `${i + 1}) ${ans}`;
        item.style.direction = "ltr";
        item.style.textAlign = "left";
        colSecond.appendChild(item);
      }
      
      const gridContainer = document.createElement("div");
      gridContainer.style.display = "grid";
      gridContainer.style.gridTemplateColumns = "1fr 1fr";
      gridContainer.style.gap = "8px 18px";
      gridContainer.style.direction = "ltr";
      
      gridContainer.appendChild(colFirst);
      gridContainer.appendChild(colSecond);
      
      box.appendChild(gridContainer);
      colsWrap.appendChild(box);

      await snapAndAddPage(totalPages, true);
    }

    showLoading("ذخیره فایل PDF…");
    await sleepFrame();

    doc.save(`${folder.name}.pdf`);
    hideLoading();
    
  }catch(err){
    console.error("خطا در ساخت PDF:", err);
    hideLoading();
    alert("خطا در ساخت PDF: " + (err.message || "خطای ناشناخته"));
  }finally{
    // پاکسازی stage
    if(stage && stage.parentNode){
      try{
        stage.parentNode.removeChild(stage);
      }catch{}
    }

    // آزادسازی doc
    if(doc){
      doc = null;
    }

    // آزاد کردن guard
    pdfExportInProgress = false;
    
    // اطمینان از مخفی شدن لودر
    hideLoading();
  }
}

// =================== ZIP Export/Import ===================
function makeBackupJson(){
  return {
    schema: "arafiles_backup_v2",
    exportedAt: new Date().toISOString(),
    data: {
      theme: state.theme,
      background: state.background,
      folderGlow: state.folderGlow,
      folders: state.folders
    }
  };
}

async function dataUrlToBlob(dataUrl){
  const res = await fetch(dataUrl);
  return await res.blob();
}

async function exportZip(){
  showLoading("در حال ساخت ZIP…");
  await sleepFrame();

  try{
    await saveState().catch(() => {});

    const zip = new JSZip();

    const json = makeBackupJson();
    zip.file("data.json", JSON.stringify(json, null, 2));

    const imgFolder = zip.folder("images");

    const ids = new Set();

    for(const f of state.folders){
      for(const q of (f.questions || [])){
        if(q.imageId) ids.add(q.imageId);

        if(q.image && !q.imageId){
          try{
            const blob = await dataUrlToBlob(q.image);
            const newId = await putImageBlob(blob);

            q.imageId = newId;
            delete q.image;

            ids.add(newId);
          }catch(err){
            console.error("Error converting legacy image:", err);
          }
        }
      }
    }

    await saveState().catch(() => {});

    let imageCount = 0;
    for(const id of ids){
      try{
        const blob = await idbGet(STORE_IMAGES, id);

        if(blob){
          const ext = blob.type === "image/jpeg" ? "jpg" : "png";
          imgFolder.file(`${id}.${ext}`, blob);
          imageCount++;
          
          if(imageCount % 5 === 0){
            showLoading(`در حال ساخت ZIP… ${imageCount} تصویر`);
            await sleepFrame();
          }
        }
      }catch(err){
        console.error("Error adding image to ZIP:", err);
      }
    }

    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "arafiles-backup.zip";

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1500);
  }catch(err){
    console.error(err);
    alert("خطا در ساخت ZIP");
  }finally{
    hideLoading();
  }
}

async function importAny(file){
  showLoading("در حال بارگذاری…");
  await sleepFrame();

  const name = (file.name || "").toLowerCase();

  try{
    if(name.endsWith(".zip")){
      const ab = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);

      const dataFile =
        zip.file("data.json") ||
        zip.file("arafiles-data.json") ||
        zip.file(Object.keys(zip.files).find(k => k.toLowerCase().endsWith(".json")));

      if(!dataFile) throw new Error("No JSON inside ZIP");

      const jsonText = await dataFile.async("string");
      const payload = JSON.parse((jsonText || "").replace(/^\uFEFF/, "").trim());
      const data = payload?.data ? payload.data : payload;

      const imagesEntries = Object.keys(zip.files).filter(
        k => k.startsWith("images/") && !zip.files[k].dir
      );

      // پاک کردن تصاویر قبلی با transaction کامل
      await revokeAllImageUrls();

      try{
        await idbClear(STORE_IMAGES);
      }catch(err){
        console.error("Error clearing images:", err);
      }

      // ذخیره تصاویر جدید
      for(const path of imagesEntries){
        try{
          const fileObj = zip.file(path);
          if(!fileObj) continue;

          const blob = await fileObj.async("blob");

          const base = path.split("/").pop();
          const id = base.split(".")[0];

          await idbSet(STORE_IMAGES, id, blob);
        }catch(err){
          console.error("Error importing image:", err);
        }
      }

      state.theme = data.theme || state.theme;
      state.background = data.background || state.background;
      state.folderGlow = (typeof data.folderGlow === "boolean")
        ? data.folderGlow
        : state.folderGlow;

      state.folders = Array.isArray(data.folders) ? data.folders : [];

      for(const f of state.folders) defaultsForFolder(f);

      setTheme(state.theme);
      applyBackground(state.background);
      applyFolderGlow();

      await saveState();

      renderHome();
      hideLoading();

      alert("داده‌ها با موفقیت بارگذاری شدند!");
      return;
    }

    // JSON import
    const text = await file.text();
    const payload = JSON.parse((text || "").replace(/^\uFEFF/, "").trim());
    const data = payload?.data ? payload.data : payload;

    state.theme = data.theme || state.theme;
    state.background = data.background || state.background;
    state.folderGlow = (typeof data.folderGlow === "boolean")
      ? data.folderGlow
      : state.folderGlow;

    state.folders = Array.isArray(data.folders) ? data.folders : [];

    await revokeAllImageUrls();

    for(const f of state.folders){
      defaultsForFolder(f);

      for(const q of (f.questions || [])){
        if(q.image && !q.imageId){
          try{
            const blob = await dataUrlToBlob(q.image);
            const id = await putImageBlob(blob);

            q.imageId = id;
            delete q.image;
          }catch(err){
            console.error("Error converting legacy image:", err);
          }
        }
      }
    }

    setTheme(state.theme);
    applyBackground(state.background);
    applyFolderGlow();

    await saveState();
    renderHome();

    hideLoading();
    alert("داده‌ها با موفقیت بارگذاری شدند!");
  }catch(err){
    console.error(err);
    hideLoading();
    alert("خطا در بارگذاری فایل (ZIP/JSON)");
  }
}

// =================== Init ===================
async function init(){
  showLoading("در حال آماده‌سازی…");

  try{
    db = await openDB();
  }catch(err){
    console.error("IndexedDB failed:", err);

    state.folders = readLegacyFolders();
    state.theme = localStorage.getItem("theme") || "dark";
    state.background = localStorage.getItem("background") || "gradient1";
    state.folderGlow = (localStorage.getItem("folderGlow") ?? "1") === "1";

    setTheme(state.theme);
    applyBackground(state.background);
    applyFolderGlow();

    renderHome();
    hideLoading();
    return;
  }

  const saved = await idbGet(STORE_META, "state");

  if(saved){
    state.theme = saved.theme || "dark";
    state.background = saved.background || "gradient1";
    state.folderGlow = (typeof saved.folderGlow === "boolean")
      ? saved.folderGlow
      : true;

    state.folders = Array.isArray(saved.folders) ? saved.folders : [];
  }else{
    const legacyFolders = readLegacyFolders();

    state.folders = legacyFolders;
    state.theme = localStorage.getItem("theme") || "dark";
    state.background = localStorage.getItem("background") || "gradient1";
    state.folderGlow = (localStorage.getItem("folderGlow") ?? "1") === "1";

    for(const f of state.folders){
      defaultsForFolder(f);

      for(const q of (f.questions || [])){
        if(q.image && !q.imageId){
          try{
            const blob = await dataUrlToBlob(q.image);
            const id = await putImageBlob(blob);

            q.imageId = id;
            delete q.image;
          }catch(err){
            console.error("Error converting legacy image:", err);
          }
        }
      }
    }

    await saveState().catch(() => {});
  }

  for(const f of state.folders) defaultsForFolder(f);

  setTheme(state.theme);
  applyBackground(state.background);
  applyFolderGlow();

  const btnSave = document.getElementById("btnSave");
  const importInput = document.getElementById("importFile");

  if(btnSave) btnSave.onclick = exportZip;

  if(importInput){
    importInput.onchange = e => {
      const file = e.target.files && e.target.files[0];

      if(file) importAny(file);

      e.target.value = "";
    };
  }

  renderHome();
  hideLoading();
}

init();

// =================== Expose for inline handlers ===================
window.setTheme = setTheme;
window.setBackgroundTile = setBackgroundTile;
window.sendEmail = sendEmail;
window.openResetConfirm = openResetConfirm;
window.toResetStep2 = toResetStep2;
window.closeReset = closeReset;
window.doFullReset = doFullReset;
window.closeSettings = closeSettings;

window.addFolder = addFolder;
window.deleteFolder = deleteFolder;
window.editFolder = editFolder;

window.openFolder = openFolder;
window.renderQuestions = renderQuestions;
window.addTextQuestion = addTextQuestion;
window.editQuestion = editQuestion;
window.deleteQuestion = deleteQuestion;

window.openCrop = openCrop;
window.openCropExisting = openCropExisting;

window.exportPDF = exportPDF;
window.exportZip = exportZip;