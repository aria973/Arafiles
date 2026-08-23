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

    // حالت گزینه‌ها: vertical یا inline
    if(!("optionsLayout" in q)){
      q.optionsLayout = "vertical";
    }

    // چینش تصویر: right / center / left
    if(!("imageAlign" in q)){
      q.imageAlign = "center";
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
    const tx = db.transaction(STORE_IMAGES, "readwrite");
    tx.objectStore(STORE_IMAGES).clear();
  }catch{}

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
  // صفحه RTL است:
  // flex-start = راست
  // flex-end = چپ
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

function deleteFolder(i){
  if(!confirm("این پوشه حذف شود؟")) return;

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

  // دکمه‌های افزودن سؤال و خروجی‌ها در یک خط
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

  document.getElementById("exportPDF").onclick = () => exportPDF(i);
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

    const card = document.createElement("div");

    card.className = "glass-3d card question";
    card.draggable = true;
    card.setAttribute("dir", detectDirection(q.text || ""));
    card.setAttribute("align", q.align || "right");

    // عنوان سؤال
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

    // دکمه‌ها
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
    alignBtn.title = "چینش متن سؤال";
    alignBtn.innerHTML = `<span class="material-icons-outlined">format_align_center</span>`;

    alignBtn.onclick = () => {
      q.align = q.align === "center"
        ? "right"
        : q.align === "right"
          ? "left"
          : "center";

      saveStateDebounced();
      renderQuestions(folderIndex);
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

    // تصویر پس از متن سؤال و قبل از گزینه‌ها
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

    // گزینه‌ها پس از تصویر
    if(q.options && q.options.length){
      const ul = document.createElement("ul");
      const layout = q.optionsLayout || "vertical";

      ul.className = `options options-${layout}`;

      q.options.forEach((o, j) => {
        const li = document.createElement("li");

        const labelSpan = document.createElement("span");
        labelSpan.className = "option-label";
        labelSpan.textContent = `(${String.fromCharCode(97 + j)})`;

        const textSpan = document.createElement("span");
        textSpan.className = "option-text";
        textSpan.textContent = o;

        li.appendChild(labelSpan);
        li.appendChild(textSpan);

        ul.appendChild(li);
      });

      card.appendChild(ul);
    }

    // Drag and Drop
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
    imageAlign: "center"
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

  const optionLayoutText = q.optionsLayout === "inline"
    ? "کنار هم"
    : "زیر هم";

  const imageIcon = q.imageAlign === "right"
    ? "format_align_right"
    : q.imageAlign === "left"
      ? "format_align_left"
      : "format_align_center";

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

        <button class="secondary" id="toggleOptionsLayout">
          <span class="material-icons-outlined">view_week</span>
          گزینه‌ها: ${optionLayoutText}
        </button>

        <button class="secondary" id="editImage">
          <span class="material-icons-outlined">image</span>
          تصویر
        </button>

        <button class="secondary" id="cropImage">
          <span class="material-icons-outlined">crop</span>
          کراپ تصویر
        </button>

        <button class="secondary" id="cycleImageAlign">
          <span class="material-icons-outlined">${imageIcon}</span>
          تصویر: ${imageAlignLabel(q.imageAlign)}
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

  panel.querySelector("#toggleOptionsLayout").onclick = () => {
    q.optionsLayout = q.optionsLayout === "inline"
      ? "vertical"
      : "inline";

    saveStateDebounced();
    renderQuestions(folderIndex);

    document.body.removeChild(overlay);
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

  panel.querySelector("#cycleImageAlign").onclick = () => {
    q.imageAlign = q.imageAlign === "right"
      ? "center"
      : q.imageAlign === "center"
        ? "left"
        : "right";

    saveStateDebounced();
    renderQuestions(folderIndex);

    document.body.removeChild(overlay);
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
        imageAlign: "center"
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

    area.appendChild(img);

    state.cropper = new Cropper(img, {
      viewMode: 1,
      dragMode: "move",
      autoCropArea: .85,
      background: false
    });
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

// =================== PDF Export ===================
async function exportPDF(folderIndex){
  const folder = state.folders[folderIndex];
  defaultsForFolder(folder);

  const { jsPDF } = window.jspdf;

  showLoading("در حال ساخت PDF…");
  await sleepFrame();

  let stage = null;

  try{
    const quality = folder.exportQuality === "hq" ? "hq" : "compact";
    const scale = quality === "hq" ? 2.3 : 1.9;
    const jpegQ = quality === "hq" ? .90 : .82;

    const PAGE_W = 794;
    const PAGE_H = 1123;
    const PADDING = 20;
    const GAP = 18;

    const manualMode = folder.perPageMode === "manual";
    const manualLimit = clampInt(folder.perPageManual || 6, 2, 50);

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
    stage.style.direction = "rtl";
    stage.style.overflow = "hidden";

    document.body.appendChild(stage);

    const title = document.createElement("div");

    title.style.fontWeight = "900";
    title.style.fontSize = "18px";
    title.style.marginBottom = "10px";
    title.style.textAlign = "center";
    title.textContent = folder.name || "Arafiles";

    stage.appendChild(title);

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

    const availableH = PAGE_H - (PADDING * 2) - title.getBoundingClientRect().height - 20;

    colsWrap.style.height = availableH + "px";
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

    colsWrap.appendChild(col1);
    colsWrap.appendChild(col2);
    stage.appendChild(colsWrap);

    const qs = folder.questions || [];

    const waitImages = async root => {
      const imgs = Array.from(root.querySelectorAll("img"));

      await Promise.all(imgs.map(img => {
        if(img.complete) return Promise.resolve();

        return new Promise(resolve => {
          img.onload = img.onerror = () => resolve();
        });
      }));

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

      if(q.align === "center") block.style.textAlign = "center";
      if(q.align === "left") block.style.textAlign = "left";
      if(q.align === "right") block.style.textAlign = "right";

      // عنوان سؤال
      const head = document.createElement("div");

      head.style.fontWeight = "900";
      head.style.marginBottom = "8px";
      head.style.textAlign = folder.numberAlign || "right";
      head.textContent = q.text && q.text.trim().length
        ? `${number}. ${q.text}`
        : `${number}.`;

      block.appendChild(head);

      // تصویر پس از متن سؤال و قبل از گزینه‌ها
      if(q.imageId){
        const imageWrap = document.createElement("div");

        imageWrap.style.display = "flex";
        imageWrap.style.marginTop = "10px";

        const imageAlign = q.imageAlign || "center";

        imageWrap.style.justifyContent = getImageJustify(imageAlign);

        const img = document.createElement("img");

        img.style.maxWidth = "100%";
        img.style.maxHeight = "220px";
        img.style.objectFit = "contain";
        img.style.borderRadius = "10px";

        const url = await getImageUrl(q.imageId);

        if(url) img.src = url;

        imageWrap.appendChild(img);
        block.appendChild(imageWrap);
      }

      // گزینه‌ها پس از تصویر
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

        q.options.forEach((opt, i) => {
          const row = document.createElement("div");

          if(layout === "inline"){
            row.style.whiteSpace = "nowrap";
          }

          row.innerHTML =
            `<span style="direction:ltr;unicode-bidi:isolate;display:inline-block;min-width:22px;font-weight:800;">${String.fromCharCode(65 + i)}.</span>` +
            `<span>${escapeHtml(opt)}</span>`;

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

    const fits = col => col.scrollHeight <= col.clientHeight;

    const layouts = [];

    const pushLayout = () => {
      layouts.push({
        col1: col1.innerHTML,
        col2: col2.innerHTML
      });
    };

    let currentCol = col1;
    let countOnPage = 0;

    const newPage = () => {
      pushLayout();
      clearCols();
      currentCol = col1;
      countOnPage = 0;
    };

    // چیدمان سؤال‌ها
    for(let i = 0; i < qs.length; i++){
      const q = qs[i];

      if(!("options" in q)) q.options = [];
      if(!("answerText" in q)) q.answerText = "";
      if(!("align" in q)) q.align = "right";
      if(!("optionsLayout" in q)) q.optionsLayout = "vertical";
      if(!("imageAlign" in q)) q.imageAlign = "center";

      if(manualMode && countOnPage >= manualLimit){
        newPage();
      }

      const block = await makeBlock(q, i + 1);

      currentCol.appendChild(block);
      await waitImages(block);

      if(!fits(currentCol)){
        currentCol.removeChild(block);

        if(currentCol === col1){
          currentCol = col2;
          currentCol.appendChild(block);
          await waitImages(block);

          if(!fits(currentCol)){
            currentCol.removeChild(block);
            newPage();

            currentCol.appendChild(block);
            await waitImages(block);

            if(!fits(currentCol)){
              block.style.fontSize = "12px";
              block.style.lineHeight = "1.2";
            }
          }
        }else{
          newPage();
          currentCol.appendChild(block);
          await waitImages(block);

          if(!fits(currentCol)){
            block.style.fontSize = "12px";
            block.style.lineHeight = "1.2";
          }
        }
      }

      countOnPage++;
    }

    if(col1.children.length || col2.children.length){
      pushLayout();
    }

    const pages = [];
    const shouldKey = !!folder.includeKey;
    const totalPages = layouts.length + (shouldKey ? 1 : 0);

    const snapPage = async pageIndex => {
      footer.textContent = folder.pageNumbers ? String(pageIndex) : "";

      await sleepFrame();

      const canvas = await html2canvas(stage, {
        scale,
        backgroundColor: "#fff",
        useCORS: true,
        allowTaint: false
      });

      pages.push(canvas.toDataURL("image/jpeg", jpegQ));
    };

    // ثبت صفحات سؤال‌ها
    for(let p = 0; p < layouts.length; p++){
      title.textContent = folder.name || "Arafiles";

      colsWrap.style.display = "flex";
      colsWrap.innerHTML = "";

      colsWrap.appendChild(col1);
      colsWrap.appendChild(col2);

      col1.innerHTML = layouts[p].col1;
      col2.innerHTML = layouts[p].col2;

      await snapPage(p + 1);
    }

    // صفحه پاسخ‌نامه
    if(shouldKey){
      title.textContent = `${folder.name || "Arafiles"} — Answer Key`;

      colsWrap.style.display = "block";
      colsWrap.innerHTML = "";

      const box = document.createElement("div");

      box.style.height = "100%";
      box.style.border = "1px solid #ddd";
      box.style.borderRadius = "12px";
      box.style.padding = "14px";
      box.style.boxSizing = "border-box";

      const grid = document.createElement("div");

      grid.style.display = "grid";
      grid.style.gridTemplateColumns = "1fr 1fr";
      grid.style.gap = "8px 18px";
      grid.style.fontSize = "14px";
      grid.style.lineHeight = "1.4";

      for(let i = 0; i < qs.length; i++){
        const ans = qs[i].answerText && qs[i].answerText.trim()
          ? qs[i].answerText.trim()
          : "-";

        const item = document.createElement("div");

        item.textContent = `${i + 1}) ${ans}`;

        grid.appendChild(item);
      }

      box.appendChild(grid);
      colsWrap.appendChild(box);

      await snapPage(totalPages);
    }

    const doc = new jsPDF("p", "mm", "a4");

    pages.forEach((img, idx) => {
      if(idx > 0) doc.addPage();

      doc.addImage(
        img,
        "JPEG",
        0,
        0,
        doc.internal.pageSize.getWidth(),
        doc.internal.pageSize.getHeight()
      );
    });

    doc.save(`${folder.name}.pdf`);
  }catch(err){
    console.error(err);
    alert("خطا در ساخت PDF");
  }finally{
    if(stage && stage.parentNode){
      stage.parentNode.removeChild(stage);
    }

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

    // ساخت ZIP:
    // - data.json (پوشه‌ها و سؤال‌ها با imageId)
    // - images/<imageId>.(png/jpg) بلاب
    const zip = new JSZip();

    const json = makeBackupJson();
    zip.file("data.json", JSON.stringify(json, null, 2));

    const imgFolder = zip.folder("images");

    // جمع‌آوری imageIdهای یکتا
    const ids = new Set();

    for(const f of state.folders){
      for(const q of (f.questions || [])){
        if(q.imageId) ids.add(q.imageId);

        // مهاجرت داده‌های قدیمی (dataURL)
        if(q.image && !q.imageId){
          try{
            const blob = await dataUrlToBlob(q.image);
            const newId = await putImageBlob(blob);

            q.imageId = newId;
            delete q.image;

            ids.add(newId);
          }catch{}
        }
      }
    }

    // ذخیره وضعیت اگر تصویری مهاجرت شد
    await saveState().catch(() => {});

    for(const id of ids){
      const blob = await idbGet(STORE_IMAGES, id);

      if(blob){
        const ext = blob.type === "image/jpeg" ? "jpg" : "png";
        imgFolder.file(`${id}.${ext}`, blob);
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

      // پیدا کردن data.json
      const dataFile =
        zip.file("data.json") ||
        zip.file("arafiles-data.json") ||
        zip.file(Object.keys(zip.files).find(k => k.toLowerCase().endsWith(".json")));

      if(!dataFile) throw new Error("No JSON inside ZIP");

      const jsonText = await dataFile.async("string");
      const payload = JSON.parse((jsonText || "").replace(/^\uFEFF/, "").trim());
      const data = payload?.data ? payload.data : payload;

      // پیدا کردن تصاویر
      const imagesEntries = Object.keys(zip.files).filter(
        k => k.startsWith("images/") && !zip.files[k].dir
      );

      // پاک کردن تصاویر قبلی
      await revokeAllImageUrls();

      try{
        const tx = db.transaction(STORE_IMAGES, "readwrite");
        tx.objectStore(STORE_IMAGES).clear();
      }catch{}

      // نوشتن تصاویر جدید در IDB
      for(const path of imagesEntries){
        const fileObj = zip.file(path);
        if(!fileObj) continue;

        const blob = await fileObj.async("blob");

        // نام فایل: images/<id>.<ext>
        const base = path.split("/").pop();
        const id = base.split(".")[0];

        await idbSet(STORE_IMAGES, id, blob);
      }

      // تنظیم state
      state.theme = data.theme || state.theme;
      state.background = data.background || state.background;
      state.folderGlow = (typeof data.folderGlow === "boolean")
        ? data.folderGlow
        : state.folderGlow;

      state.folders = Array.isArray(data.folders) ? data.folders : [];

      // نرمال‌سازی
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

    // JSON import (legacy)
    const text = await file.text();
    const payload = JSON.parse((text || "").replace(/^\uFEFF/, "").trim());
    const data = payload?.data ? payload.data : payload;

    state.theme = data.theme || state.theme;
    state.background = data.background || state.background;
    state.folderGlow = (typeof data.folderGlow === "boolean")
      ? data.folderGlow
      : state.folderGlow;

    state.folders = Array.isArray(data.folders) ? data.folders : [];

    // مهاجرت تصاویر base64 به IDB
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
          }catch{}
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

    // Fallback: بارگذاری با localStorage
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

  // بارگذاری از IDB
  const saved = await idbGet(STORE_META, "state");

  if(saved){
    state.theme = saved.theme || "dark";
    state.background = saved.background || "gradient1";
    state.folderGlow = (typeof saved.folderGlow === "boolean")
      ? saved.folderGlow
      : true;

    state.folders = Array.isArray(saved.folders) ? saved.folders : [];
  }else{
    // مهاجرت از localStorage
    const legacyFolders = readLegacyFolders();

    state.folders = legacyFolders;
    state.theme = localStorage.getItem("theme") || "dark";
    state.background = localStorage.getItem("background") || "gradient1";
    state.folderGlow = (localStorage.getItem("folderGlow") ?? "1") === "1";

    // مهاجرت تصاویر base64
    for(const f of state.folders){
      defaultsForFolder(f);

      for(const q of (f.questions || [])){
        if(q.image && !q.imageId){
          try{
            const blob = await dataUrlToBlob(q.image);
            const id = await putImageBlob(blob);

            q.imageId = id;
            delete q.image;
          }catch{}
        }
      }
    }

    await saveState().catch(() => {});
  }

  for(const f of state.folders) defaultsForFolder(f);

  setTheme(state.theme);
  applyBackground(state.background);
  applyFolderGlow();

  // اتصال دکمه‌های ذخیره و بارگذاری
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
