// ------------------------------
// 0) Tiny helpers
// ------------------------------
const $ = (id) => document.getElementById(id);

function detectDirection(text){
  return /[\u0600-\u06FF]/.test(text || "") ? "rtl" : "ltr";
}

// Debounce save
let _saveTimer = null;
function saveDebounced(){
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try{
      localStorage.setItem("folders", JSON.stringify(state.folders));
    }catch(e){
      console.warn("Save failed (quota/other):", e);
      alert("فضای ذخیره‌سازی پر شده یا ذخیره‌سازی با مشکل مواجه شد. (تصاویر داخل دیتابیس ذخیره می‌شوند، ولی متادیتا ممکن است ذخیره نشده باشد.)");
    }
  }, 250);
}

// ------------------------------
// 1) IndexedDB for images (no more base64 in localStorage)
// ------------------------------
const IDB_DB_NAME = "arafiles_db";
const IDB_DB_VER = 1;
const IDB_STORE = "images";

function idbOpen(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, IDB_DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(IDB_STORE)){
        db.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbTx(db, mode){
  return db.transaction(IDB_STORE, mode).objectStore(IDB_STORE);
}

function genId(){
  return "img_" + crypto.getRandomValues(new Uint32Array(4)).join("_");
}

async function saveImageBlob(blob){
  const db = await idbOpen();
  const id = genId();
  await new Promise((resolve, reject) => {
    const store = idbTx(db, "readwrite");
    const req = store.put({ id, blob, type: blob.type || "image/png", ts: Date.now() });
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
  db.close();
  return id;
}

async function getImageBlob(id){
  const db = await idbOpen();
  const item = await new Promise((resolve, reject) => {
    const store = idbTx(db, "readonly");
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return item ? item.blob : null;
}

async function deleteImageBlob(id){
  const db = await idbOpen();
  await new Promise((resolve, reject) => {
    const store = idbTx(db, "readwrite");
    const req = store.delete(id);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
  db.close();
}

function blobToDataURL(blob){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Cache object URLs to avoid re-creating
const objectUrlCache = new Map(); // imageId -> objectURL
async function getObjectUrlForImage(id){
  if(objectUrlCache.has(id)) return objectUrlCache.get(id);
  const blob = await getImageBlob(id);
  if(!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(id, url);
  return url;
}
function revokeAllObjectUrls(){
  for(const url of objectUrlCache.values()) URL.revokeObjectURL(url);
  objectUrlCache.clear();
}

async function putImageBlobWithId(id, blob){
  const db = await idbOpen();
  await new Promise((resolve, reject) => {
    const store = idbTx(db, "readwrite");
    const req = store.put({ id, blob, type: blob.type || "image/png", ts: Date.now() });
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
  db.close();
}

// ------------------------------
// 2) State
// ------------------------------
let state = {
  view: "home",
  currentFolderIndex: null,
  folders: JSON.parse(localStorage.getItem("folders") || "[]"),
  theme: localStorage.getItem("theme") || "dark",
  background: localStorage.getItem("background") || "gradient1",
  cropper: null,
  pendingImageBlobUrl: null
};

// Normalize old data (if any old q.image base64 exists, keep it but don’t resave it)
function normalize(){
  for(const f of state.folders){
    f.questions = f.questions || [];
    f.perPage = f.perPage || 6;
    f.numberAlign = f.numberAlign || "right";
    for(const q of f.questions){
      // Legacy: q.image might exist as base64; keep it for display/export until user edits it.
      // New: q.imageId
      if(q.imageId && q.image){
        // keep only imageId preferred
        delete q.image;
      }
    }
  }
}
normalize();

// ------------------------------
// 3) Service Worker (correct path)
// ------------------------------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js")
    .catch(err => console.error("SW registration failed:", err));
}

// ------------------------------
// 4) Theme + Background
// ------------------------------
function applyBackground(key){
  document.body.style.backgroundImage = "none";
  document.body.style.backgroundColor = "";
  document.body.style.backgroundSize = "";
  document.body.style.backgroundPosition = "";

  if(key==="gradient1"){
    document.body.style.backgroundImage = "linear-gradient(120deg,#1f2937,#3b82f6 100%)";
  } else if(key==="gradient2"){
    document.body.style.backgroundImage = "linear-gradient(120deg,#0ea5e9,#10b981 100%)";
  } else if(key==="grid"){
    document.body.style.backgroundImage = "radial-gradient(#64748b 1px,transparent 1px)";
    document.body.style.backgroundSize = "24px 24px";
  } else if(key==="plain"){
    document.body.style.backgroundColor = getComputedStyle(document.body).getPropertyValue("--bg");
  } else if(key==="glass"){
    document.body.style.backgroundImage = "linear-gradient(140deg, rgba(255,255,255,0.18), rgba(255,255,255,0.02))";
  } else {
    document.body.style.backgroundColor = getComputedStyle(document.body).getPropertyValue("--bg");
  }
}

function setTheme(mode){
  state.theme = mode;
  localStorage.setItem("theme", mode);
  document.body.classList.remove("dark","light");
  document.body.classList.add(mode==="dark" ? "dark" : "light");
  applyBackground(state.background);
}

function setBackground(key){
  state.background = key;
  localStorage.setItem("background", key);
  applyBackground(key);
}

function closeSettings(){
  const ov = $("settingsOverlay");
  ov.classList.remove("active");
  ov.setAttribute("aria-hidden", "true");
}

function openSettings(){
  const ov = $("settingsOverlay");
  ov.classList.add("active");
  ov.setAttribute("aria-hidden", "false");
}

// ------------------------------
// 5) Reset
// ------------------------------
function openResetConfirm(){
  const ov = $("resetOverlay");
  ov.classList.add("active");
  ov.setAttribute("aria-hidden", "false");
  $("resetStep1").classList.remove("hidden");
  $("resetStep2").classList.add("hidden");
}

function closeReset(){
  const ov = $("resetOverlay");
  ov.classList.remove("active");
  ov.setAttribute("aria-hidden", "true");
}

function toResetStep2(){
  $("resetStep1").classList.add("hidden");
  $("resetStep2").classList.remove("hidden");
}

async function doFullReset(){
  // پاک کردن تصاویر
  try{
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.clear();
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    });
    db.close();
  }catch(e){
    console.warn("IDB clear failed:", e);
  }

  revokeAllObjectUrls();
  localStorage.clear();
  state.folders = [];
  closeReset();
  closeSettings();
  renderHome();
}

// ------------------------------
// 6) Email
// ------------------------------
function sendEmail(){
  window.location.href = "mailto:Aria973@yahoo.com?subject=نقد یا پرسش درباره Arafiles";
}

// ------------------------------
// 7) UI Rendering
// ------------------------------
const floatingAdd = $("floatingAdd");

function renderHome(){
  state.view = "home";
  state.currentFolderIndex = null;
  revokeAllObjectUrls();

  const app = $("app");
  app.innerHTML = "";
  floatingAdd.style.display = "flex";

  if(state.folders.length === 0){
    const empty = document.createElement("div");
    empty.className = "glass-3d card empty";
    empty.innerHTML = "<p>هیچ فایلی وجود ندارد</p>";
    app.appendChild(empty);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "grid";

  state.folders.forEach((f,i) => {
    const card = document.createElement("div");
    card.className = "glass-3d card folder-glow";
    card.style.setProperty("--glow", f.color || "#3B82F6");
    card.style.borderLeft = `4px solid ${f.color || "#3B82F6"}`;

    card.onclick = () => openFolder(i);

    card.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="material-icons-outlined">folder</span>
          <h3 style="margin:0;">${escapeHtml(f.name)}</h3>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="icon-btn" data-action="edit" title="ویرایش"><span class="material-icons-outlined">edit</span></button>
          <button class="icon-btn danger" data-action="delete" title="حذف"><span class="material-icons-outlined">delete</span></button>
        </div>
      </div>
      <p style="margin:10px 0 0;">${escapeHtml(f.desc || "—")}</p>
      <small>${(f.questions||[]).length} سوال</small>
    `;

    card.querySelector('[data-action="edit"]').onclick = (e) => {
      e.stopPropagation();
      editFolder(i);
    };
    card.querySelector('[data-action="delete"]').onclick = (e) => {
      e.stopPropagation();
      deleteFolder(i);
    };

    grid.appendChild(card);
  });

  app.appendChild(grid);
}

function escapeHtml(s){
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ------------------------------
// 8) Folder CRUD
// ------------------------------
function addFolder(){
  const name = prompt("نام پوشه:");
  if(!name) return;
  const desc = prompt("توضیحات:") || "";
  state.folders.push({
    name, desc,
    color:"#3B82F6",
    questions:[],
    perPage:6,
    numberAlign:"right"
  });
  saveDebounced();
  renderHome();
}

function deleteFolder(i){
  if(!confirm("این پوشه حذف شود؟")) return;
  state.folders.splice(i, 1);
  saveDebounced();
  renderHome();
}

function editFolder(i){
  const f = state.folders[i];

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay active";

  const panel = document.createElement("div");
  panel.className = "modal-panel glass-3d";

  panel.innerHTML = `
    <div class="modal-header">
      <h2>تنظیمات پوشه</h2>
      <button class="icon-btn" data-close="1"><span class="material-icons-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <label>نام:</label><input id="folderName" value="${escapeHtml(f.name)}" />
      <label>توضیحات:</label><input id="folderDesc" value="${escapeHtml(f.desc || "")}" />
      <label>رنگ:</label><input id="folderColor" type="color" value="${escapeHtml(f.color || "#3B82F6")}" />
      <div class="row-inline"><button class="primary" id="saveFolder">ذخیره</button></div>
    </div>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const close = () => document.body.removeChild(overlay);

  panel.querySelector('[data-close="1"]').onclick = close;
  panel.querySelector("#saveFolder").onclick = () => {
    f.name = panel.querySelector("#folderName").value;
    f.desc = panel.querySelector("#folderDesc").value;
    f.color = panel.querySelector("#folderColor").value;
    saveDebounced();
    close();
    (state.view==="folder" ? openFolder(i) : renderHome());
  };
}

// ------------------------------
// 9) Folder View + Questions
// ------------------------------
let _wrapDragBound = false;

function openFolder(i){
  state.view = "folder";
  state.currentFolderIndex = i;
  revokeAllObjectUrls();

  const f = state.folders[i];
  const app = $("app");
  app.innerHTML = "";
  floatingAdd.style.display = "none";

  const header = document.createElement("div");
  header.className = "glass-3d card";
  header.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:center;">
      <strong>عنوان:</strong><span>${escapeHtml(f.name)}</span><span class="spacer" style="flex:1;"></span>

      <button class="icon-btn" id="editFolderBtn" title="تنظیمات پوشه">
        <span class="material-icons-outlined">settings</span>
      </button>

      <label style="opacity:.9;">تعداد سوال در هر صفحه</label>
      <input id="perPage" type="number" min="2" max="20" value="${f.perPage || 6}" />

      <label style="opacity:.9;">جهت شماره‌گذاری</label>
      <select id="numberAlign">
        <option value="right" ${f.numberAlign==="right"?"selected":""}>راست</option>
        <option value="left" ${f.numberAlign==="left"?"selected":""}>چپ</option>
      </select>

      <button class="icon-btn" id="exportPDF" title="خروجی PDF">
        <span class="material-icons-outlined">picture_as_pdf</span>
      </button>
      <button class="icon-btn" id="exportPNG" title="خروجی PNG">
        <span class="material-icons-outlined">image</span>
      </button>
    </div>
  `;
  app.appendChild(header);

  header.querySelector("#editFolderBtn").onclick = () => editFolder(i);
  header.querySelector("#exportPDF").onclick = () => exportPDF(i);
  header.querySelector("#exportPNG").onclick = () => exportPNG(i);
  header.querySelector("#perPage").onchange = (e) => { f.perPage = +e.target.value; saveDebounced(); };
  header.querySelector("#numberAlign").onchange = (e) => { f.numberAlign = e.target.value; saveDebounced(); renderQuestions(i); };

  const controls = document.createElement("div");
  controls.className = "glass-3d card";
  controls.innerHTML = `
    <div style="display:flex; gap:8px; justify-content:center;">
      <button class="primary" id="addTextQ"><span class="material-icons-outlined">note_add</span></button>
      <button class="primary" id="addImageQ"><span class="material-icons-outlined">add_photo_alternate</span></button>
    </div>
  `;
  app.appendChild(controls);

  controls.querySelector("#addTextQ").onclick = () => addTextQuestion(i);
  controls.querySelector("#addImageQ").onclick = () => openCrop(i);

  const listWrap = document.createElement("div");
  listWrap.id = "questions";
  app.appendChild(listWrap);

  // bind dragover once
  if(!_wrapDragBound){
    listWrap.addEventListener("dragover", e => e.preventDefault());
    _wrapDragBound = true;
  }

  renderQuestions(i);
}

async function renderQuestions(folderIndex){
  const f = state.folders[folderIndex];
  const wrap = $("questions");
  wrap.innerHTML = "";

  if(!f.questions || f.questions.length === 0){
    const empty = document.createElement("div");
    empty.className = "glass-3d card empty";
    empty.innerHTML = "<p>هنوز سوالی اضافه نشده است.</p>";
    wrap.appendChild(empty);
    return;
  }

  for(let idx=0; idx < f.questions.length; idx++){
    const q = f.questions[idx];

    const card = document.createElement("div");
    card.className = "glass-3d card question";
    card.draggable = true;
    card.setAttribute("dir", detectDirection(q.text || ""));
    if(q.align) card.setAttribute("align", q.align);

    const top = document.createElement("div");
    top.className = "top-row";

    const label = (q.text && q.text.trim().length) ? `${idx+1}. ${q.text}` : `${idx+1}.`;
    const strong = document.createElement("strong");
    strong.textContent = label;
    strong.style.textAlign = f.numberAlign || "right";
    top.appendChild(strong);

    const spacer = document.createElement("span");
    spacer.className = "spacer";
    top.appendChild(spacer);

    const actions = document.createElement("div");
    actions.className = "actions";

    const editBtn = document.createElement("button");
    editBtn.className = "secondary";
    editBtn.innerHTML = `<span class="material-icons-outlined">edit</span>`;
    editBtn.onclick = () => editQuestion(folderIndex, idx);

    const delBtn = document.createElement("button");
    delBtn.className = "danger";
    delBtn.innerHTML = `<span class="material-icons-outlined">delete</span>`;
    delBtn.onclick = () => deleteQuestion(folderIndex, idx);

    const alignBtn = document.createElement("button");
    alignBtn.className = "secondary";
    alignBtn.innerHTML = `<span class="material-icons-outlined">format_align_center</span>`;
    alignBtn.onclick = () => {
      q.align = q.align==="center" ? "right" : q.align==="right" ? "left" : "center";
      saveDebounced();
      renderQuestions(folderIndex);
    };

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    actions.appendChild(alignBtn);
    top.appendChild(actions);
    card.appendChild(top);

    // image (new: imageId from IDB; legacy: q.image dataURL)
    if(q.imageId){
      const url = await getObjectUrlForImage(q.imageId);
      if(url){
        const img = document.createElement("img");
        img.className = "question-img";
        img.src = url;
        card.appendChild(img);
      }
    } else if(q.image){
      const img = document.createElement("img");
      img.className = "question-img";
      img.src = q.image;
      card.appendChild(img);
    }

    // options
    if(q.options && q.options.length){
      const ul = document.createElement("ul");
      ul.className = "options";
      q.options.forEach((o,j)=>{
        const li = document.createElement("li");

        const labelSpan = document.createElement("span");
        labelSpan.style.direction = "ltr";
        labelSpan.style.unicodeBidi = "isolate";
        labelSpan.style.marginInlineEnd = "6px";
        labelSpan.textContent = `(${String.fromCharCode(97+j)})`;

        const textSpan = document.createElement("span");
        textSpan.textContent = o;

        li.appendChild(labelSpan);
        li.appendChild(textSpan);
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }

    // Drag & drop reorder
    card.addEventListener("dragstart", e => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("index", String(idx));
    });
    card.addEventListener("dragover", e => e.preventDefault());
    card.addEventListener("drop", e => {
      e.preventDefault();
      const from = +e.dataTransfer.getData("index");
      const to = idx;
      if(Number.isNaN(from) || from===to) return;

      const arr = f.questions;
      const moved = arr.splice(from,1)[0];
      arr.splice(to,0,moved);

      saveDebounced();
      renderQuestions(folderIndex);
    });

    wrap.appendChild(card);
  }
}

function addTextQuestion(folderIndex){
  const text = prompt("متن سوال (می‌تواند خالی باشد):") || "";
  const q = { type:"text", text, options:[] };
  state.folders[folderIndex].questions.push(q);
  saveDebounced();
  renderQuestions(folderIndex);
  openOptionsEditor(folderIndex, state.folders[folderIndex].questions.length-1);
}

function openOptionsEditor(folderIndex, idx){
  const q = state.folders[folderIndex].questions[idx];

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay active";

  const panel = document.createElement("div");
  panel.className = "modal-panel glass-3d";

  panel.innerHTML = `
    <div class="modal-header">
      <h2>گزینه‌ها</h2>
      <button class="icon-btn" data-close="1"><span class="material-icons-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div id="optList" class="row"></div>
      <div class="row-inline">
        <button class="primary" id="addOpt"><span class="material-icons-outlined">add</span></button>
        <button class="secondary" id="doneOpt"><span class="material-icons-outlined">check</span></button>
      </div>
    </div>
  `;
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const renderOpts = () => {
    const wrap = panel.querySelector("#optList");
    wrap.innerHTML = "";
    (q.options || []).forEach((o,i)=>{
      const row = document.createElement("div");
      row.className = "row-inline";
      row.innerHTML = `
        <span style="direction:ltr; unicode-bidi:isolate;">(${String.fromCharCode(97+i)})</span>
        <input value="${escapeHtml(o)}" data-idx="${i}" />
        <button class="icon-btn danger" data-del="${i}"><span class="material-icons-outlined">close</span></button>
      `;
      wrap.appendChild(row);
    });

    wrap.querySelectorAll("input").forEach(inp=>{
      inp.oninput = (e) => {
        q.options[+e.target.dataset.idx] = e.target.value;
        saveDebounced();
      };
    });

    wrap.querySelectorAll("[data-del]").forEach(btn=>{
      btn.onclick = (e) => {
        const i = +e.currentTarget.dataset.del;
        q.options.splice(i,1);
        saveDebounced();
        renderOpts();
        renderQuestions(folderIndex);
      };
    });
  };

  renderOpts();

  panel.querySelector("#addOpt").onclick = () => {
    q.options.push("");
    saveDebounced();
    renderOpts();
    renderQuestions(folderIndex);
  };

  const close = () => document.body.removeChild(overlay);
  panel.querySelector("#doneOpt").onclick = close;
  panel.querySelector('[data-close="1"]').onclick = close;
}

function editQuestion(folderIndex, idx){
  const q = state.folders[folderIndex].questions[idx];

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay active";

  const panel = document.createElement("div");
  panel.className = "modal-panel glass-3d";

  panel.innerHTML = `
    <div class="modal-header">
      <h2>ویرایش سوال</h2>
      <button class="icon-btn" data-close="1"><span class="material-icons-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div class="row-inline">
        <button class="secondary" id="editText"><span class="material-icons-outlined">edit</span> متن</button>
        <button class="secondary" id="editOptions"><span class="material-icons-outlined">list</span> گزینه‌ها</button>
        <button class="secondary" id="editImage"><span class="material-icons-outlined">image</span> تصویر جدید</button>
        <button class="secondary" id="cropImage"><span class="material-icons-outlined">crop</span> کراپ تصویر</button>
      </div>
    </div>
  `;
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  panel.querySelector("#editText").onclick = () => {
    const nt = prompt("ویرایش متن سوال (می‌تواند خالی باشد):", q.text || "");
    if (nt !== null) q.text = nt;
    saveDebounced();
    renderQuestions(folderIndex);
  };

  panel.querySelector("#editOptions").onclick = () => openOptionsEditor(folderIndex, idx);

  panel.querySelector("#editImage").onclick = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if(!file) return;

      // save blob to IDB without changing quality
      const id = await saveImageBlob(file);

      // delete old if existed
      if(q.imageId) await deleteImageBlob(q.imageId);

      q.imageId = id;
      delete q.image; // legacy
      saveDebounced();
      renderQuestions(folderIndex);
    };
    input.click();
  };

  panel.querySelector("#cropImage").onclick = async () => {
    if(q.imageId){
      const blob = await getImageBlob(q.imageId);
      if(!blob){ alert("تصویر پیدا نشد."); return; }
      const url = URL.createObjectURL(blob);
      openCropExisting(folderIndex, idx, url, q.imageId);
      return;
    }
    if(q.image){
      openCropExisting(folderIndex, idx, q.image, null);
      return;
    }
    alert("هیچ تصویری برای کراپ وجود ندارد.");
  };

  const close = () => document.body.removeChild(overlay);
  panel.querySelector('[data-close="1"]').onclick = close;
}

async function deleteQuestion(folderIndex, idx){
  const q = state.folders[folderIndex].questions[idx];
  if(q?.imageId){
    try{ await deleteImageBlob(q.imageId); }catch{}
  }
  state.folders[folderIndex].questions.splice(idx, 1);
  saveDebounced();
  renderQuestions(folderIndex);
}

// ------------------------------
// 10) Cropper (stores blob in IDB, no base64)
// ------------------------------
function openCrop(folderIndex){
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay active";

  const panel = document.createElement("div");
  panel.className = "modal-panel glass-3d";

  panel.innerHTML = `
    <div class="modal-header">
      <h2>کراپ تصویر</h2>
      <button class="icon-btn" data-close="1"><span class="material-icons-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <input id="imageInput" type="file" accept="image/*" />
      <div id="cropArea" class="crop-area"></div>
      <div class="row-inline">
        <button class="primary" id="saveCropped"><span class="material-icons-outlined">save</span></button>
        <button class="secondary" id="cancelCrop"><span class="material-icons-outlined">close</span></button>
      </div>
    </div>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const input = panel.querySelector("#imageInput");
  const area = panel.querySelector("#cropArea");

  input.onchange = (e) => {
    const file = e.target.files[0];
    if(!file) return;

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
      autoCropArea: 0.85,
      background: false
    });
  };

  panel.querySelector("#saveCropped").onclick = async () => {
    if(!state.cropper) return;

    const canvas = state.cropper.getCroppedCanvas({ imageSmoothingQuality: "high" });

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png", 1);
    });

    if(!blob){
      alert("خطا در ساخت تصویر.");
      return;
    }

    const id = await saveImageBlob(blob);
    state.folders[folderIndex].questions.push({ type:"image", text:"", imageId: id, options:[] });

    saveDebounced();
    cleanupCrop(overlay);
    openFolder(folderIndex);
  };

  const close = () => cleanupCrop(overlay);
  panel.querySelector("#cancelCrop").onclick = close;
  panel.querySelector('[data-close="1"]').onclick = close;
};

function openCropExisting(folderIndex, idx, imageSrc, oldImageId){
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay active";

  const panel = document.createElement("div");
  panel.className = "modal-panel glass-3d";

  panel.innerHTML = `
    <div class="modal-header">
      <h2>کراپ تصویر موجود</h2>
      <button class="icon-btn" data-close="1"><span class="material-icons-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div id="cropArea" class="crop-area"></div>
      <div class="row-inline">
        <button class="primary" id="saveCropped"><span class="material-icons-outlined">save</span></button>
        <button class="secondary" id="cancelCrop"><span class="material-icons-outlined">close</span></button>
      </div>
    </div>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const area = panel.querySelector("#cropArea");
  area.innerHTML = "";

  const img = document.createElement("img");
  img.src = imageSrc;
  img.style.maxWidth = "100%";
  area.appendChild(img);

  state.cropper = new Cropper(img, {
    viewMode: 1,
    dragMode: "move",
    autoCropArea: 0.85,
    background: false
  });

  panel.querySelector("#saveCropped").onclick = async () => {
    if(!state.cropper) return;

    const canvas = state.cropper.getCroppedCanvas({ imageSmoothingQuality: "high" });

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png", 1);
    });

    if(!blob){
      alert("خطا در ساخت تصویر.");
      return;
    }

    const newId = await saveImageBlob(blob);

    // delete old
    if(oldImageId){
      try{ await deleteImageBlob(oldImageId); }catch{}
    }

    const q = state.folders[folderIndex].questions[idx];
    q.imageId = newId;
    delete q.image;

    saveDebounced();
    cleanupCrop(overlay);

    // revoke temp object url if used
    if(imageSrc.startsWith("blob:")){
      try{ URL.revokeObjectURL(imageSrc); }catch{}
    }

    openFolder(folderIndex);
  };

  const close = () => {
    cleanupCrop(overlay);
    if(imageSrc.startsWith("blob:")){
      try{ URL.revokeObjectURL(imageSrc); }catch{}
    }
  };

  panel.querySelector("#cancelCrop").onclick = close;
  panel.querySelector('[data-close="1"]').onclick = close;
}

function cleanupCrop(overlay){
  document.body.removeChild(overlay);
  if(state.cropper){ state.cropper.destroy(); state.cropper = null; }
  if(state.pendingImageBlobUrl){ URL.revokeObjectURL(state.pendingImageBlobUrl); state.pendingImageBlobUrl = null; }
}

// ------------------------------
// 11) Export PNG (renders a printable DOM)
// ------------------------------
async function buildOutputDOM(folder){
  const el = document.createElement("div");
  el.style.width = "794px";
  el.style.padding = "32px";
  el.style.background = "#fff";
  el.style.color = "#000";
  el.style.fontFamily = "Vazirmatn, Vazir, sans-serif";
  el.style.direction = "rtl";

  const h = document.createElement("h2");
  h.textContent = folder.name || "Arafiles";
  h.style.textAlign = "center";
  el.appendChild(h);

  const container = document.createElement("div");
  container.style.columnCount = "2";
  container.style.columnGap = "18px";
  container.style.columnFill = "auto";

  for(let idx=0; idx < (folder.questions||[]).length; idx++){
    const q = folder.questions[idx];

    const box = document.createElement("div");
    box.style.display = "inline-block";
    box.style.width = "100%";
    box.style.border = "1px solid #ddd";
    box.style.borderRadius = "10px";
    box.style.padding = "12px";
    box.style.marginBottom = "12px";
    box.style.breakInside = "avoid";

    if(q.align==="center") box.style.textAlign="center";
    else if(q.align==="right") box.style.textAlign="right";
    else if(q.align==="left") box.style.textAlign="left";

    const head = document.createElement("div");
    head.textContent = (q.text && q.text.trim().length) ? `${idx+1}. ${q.text}` : `${idx+1}.`;
    head.style.fontWeight = "800";
    head.style.textAlign = folder.numberAlign || "right";
    box.appendChild(head);

    // image
    if(q.imageId){
      const blob = await getImageBlob(q.imageId);
      if(blob){
        const dataUrl = await blobToDataURL(blob);
        const img = document.createElement("img");
        img.src = dataUrl;
        img.style.maxWidth="100%";
        img.style.maxHeight="240px";
        img.style.objectFit="contain";
        img.style.marginTop="10px";
        img.style.borderRadius="10px";
        box.appendChild(img);
      }
    } else if(q.image){
      const img = document.createElement("img");
      img.src = q.image;
      img.style.maxWidth="100%";
      img.style.maxHeight="240px";
      img.style.objectFit="contain";
      img.style.marginTop="10px";
      img.style.borderRadius="10px";
      box.appendChild(img);
    }

    // options
    if(q.options && q.options.length){
      const ul = document.createElement("ul");
      ul.style.padding = "0";
      ul.style.margin = "8px 0 0";
      q.options.forEach((o,i)=>{
        const li = document.createElement("li");
        li.style.listStyle = "none";
        li.style.margin = "4px 0";

        const labelSpan = document.createElement("span");
        labelSpan.style.direction = "ltr";
        labelSpan.style.unicodeBidi = "isolate";
        labelSpan.style.marginInlineEnd = "6px";
        labelSpan.textContent = `(${String.fromCharCode(97+i)})`;

        const textSpan = document.createElement("span");
        textSpan.textContent = o;

        li.appendChild(labelSpan);
        li.appendChild(textSpan);
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }

    container.appendChild(box);
  }

  el.appendChild(container);
  return el;
}

async function exportPNG(folderIndex){
  const folder = state.folders[folderIndex];
  const el = await buildOutputDOM(folder);
  document.body.appendChild(el);

  if (document.fonts && document.fonts.ready) await document.fonts.ready;

  const canvas = await html2canvas(el, { scale: 3, backgroundColor:"#fff" });
  document.body.removeChild(el);

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${folder.name}.png`;
  a.click();
}

// ------------------------------
// 12) Export PDF (two-column, Persian ok, no split)
// ------------------------------
async function exportPDF(folderIndex){
  const folder = state.folders[folderIndex];
  const { jsPDF } = window.jspdf;

  if (document.fonts && document.fonts.ready) await document.fonts.ready;

  // A4 px
  const PAGE_W = 794;
  const PAGE_H = 1123;
  const PADDING = 20;
  const GAP = 18;

  // Stage
  const stage = document.createElement("div");
  stage.style.position = "fixed";
  stage.style.left = "-99999px";
  stage.style.top = "0";
  stage.style.width = PAGE_W + "px";
  stage.style.height = PAGE_H + "px";
  stage.style.padding = PADDING + "px";
  stage.style.boxSizing = "border-box";
  stage.style.background = "#fff";
  stage.style.color = "#000";
  stage.style.fontFamily = "Vazirmatn, Vazir, sans-serif";
  stage.style.direction = "rtl";
  stage.style.overflow = "hidden";
  document.body.appendChild(stage);

  // Title
  const title = document.createElement("div");
  title.style.fontWeight = "800";
  title.style.fontSize = "18px";
  title.style.marginBottom = "12px";
  title.style.textAlign = "center";
  title.textContent = folder.name || "Arafiles";
  stage.appendChild(title);

  // Two columns container
  const colsWrap = document.createElement("div");
  colsWrap.style.display = "flex";
  colsWrap.style.gap = GAP + "px";

  const availableH = PAGE_H - (PADDING * 2) - title.getBoundingClientRect().height - 12;
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

  const doc = new jsPDF("p","mm","a4");
  const pages = [];

  const waitImages = async (root) => {
    const imgs = Array.from(root.querySelectorAll("img"));
    await Promise.all(imgs.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(res => { img.onload = img.onerror = () => res(); });
    }));
    // یک فریم برای settle شدن layout
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  };

  // block builder (همون ظاهر آزمونی)
  const makeBlock = (q, number) => {
    const block = document.createElement("div");
    block.style.border = "1px solid #ccc";
    block.style.borderRadius = "10px";
    block.style.padding = "10px";
    block.style.boxSizing = "border-box";

    if (q.align === "center") block.style.textAlign = "center";
    if (q.align === "left") block.style.textAlign = "left";
    if (q.align === "right") block.style.textAlign = "right";

    const head = document.createElement("div");
    head.style.fontWeight = "800";
    head.style.marginBottom = "8px";
    head.style.textAlign = folder.numberAlign || "right";
    head.textContent = (q.text && q.text.trim().length) ? `${number}. ${q.text}` : `${number}.`;
    block.appendChild(head);

    if(q.options && q.options.length){
      const opts = document.createElement("div");
      opts.style.display = "flex";
      opts.style.flexDirection = "column";
      opts.style.gap = "4px";
      q.options.forEach((opt, i) => {
        const row = document.createElement("div");
        const label = String.fromCharCode(65 + i) + ". ";
        row.innerHTML =
          `<span style="direction:ltr;unicode-bidi:isolate;display:inline-block;min-width:22px;">${label}</span>` +
          `<span>${opt}</span>`;
        opts.appendChild(row);
      });
      block.appendChild(opts);
    }

    if(q.imageId && typeof getImageBlob === "function"){
      // اگر نسخه IDB داری
      // اینجا فقط placeholder می‌ذاریم و بعداً با async پرش می‌کنیم
    } else if(q.image){
      const img = document.createElement("img");
      img.src = q.image;
      img.style.maxWidth = "100%";
      img.style.maxHeight = "220px";
      img.style.objectFit = "contain";
      img.style.marginTop = "10px";
      img.style.borderRadius = "10px";
      block.appendChild(img);
    }

    return block;
  };

  // اگر از نسخه‌ی IDB استفاده می‌کنی: imageId → dataURL داخل PDF
  const attachImageIfNeeded = async (q, block) => {
    if(q.imageId && typeof getImageBlob === "function" && typeof blobToDataURL === "function"){
      const blob = await getImageBlob(q.imageId);
      if(blob){
        const dataUrl = await blobToDataURL(blob);
        const img = document.createElement("img");
        img.src = dataUrl;
        img.style.maxWidth = "100%";
        img.style.maxHeight = "220px";
        img.style.objectFit = "contain";
        img.style.marginTop = "10px";
        img.style.borderRadius = "10px";
        block.appendChild(img);
      }
    }
  };

  const snapPage = async () => {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const canvas = await html2canvas(stage, {
      scale: 3,
      backgroundColor: "#fff",
      useCORS: true,
      allowTaint: false
    });
    pages.push(canvas.toDataURL("image/png"));
  };

  const clearCols = () => { col1.innerHTML = ""; col2.innerHTML = ""; };

  const fits = (col) => col.scrollHeight <= col.clientHeight;

  // Fill algorithm: col1 then col2 then new page
  clearCols();
  let currentCol = col1;

  for(let i=0; i < (folder.questions || []).length; i++){
    const q = folder.questions[i];
    const block = makeBlock(q, i+1);
    await attachImageIfNeeded(q, block);

    currentCol.appendChild(block);
    await waitImages(block);

    if(!fits(currentCol)){
      // doesn't fit in current column
      currentCol.removeChild(block);

      // try other column if we were in col1
      if(currentCol === col1){
        currentCol = col2;
        currentCol.appendChild(block);
        await waitImages(block);

        if(!fits(currentCol)){
          // doesn't fit in col2 either -> new page
          currentCol.removeChild(block);

          await snapPage();
          clearCols();
          currentCol = col1;

          currentCol.appendChild(block);
          await waitImages(block);

          // اگر هنوز هم جا نشد: سوال خیلی بزرگه.
          // بدون کاهش کیفیت تصویر، فقط چیدمان رو کمی جمع می‌کنیم.
          if(!fits(currentCol)){
            block.style.fontSize = "12px";
            block.style.lineHeight = "1.2";
          }
        }
      } else {
        // we were in col2 -> new page
        await snapPage();
        clearCols();
        currentCol = col1;

        currentCol.appendChild(block);
        await waitImages(block);

        if(!fits(currentCol)){
          block.style.fontSize = "12px";
          block.style.lineHeight = "1.2";
        }
      }
    }

    // اگر col2 پر شد و سوال بعدی باید بره صفحه بعد، خود الگوریتم هندل می‌کنه
    if(currentCol === col2){
      // nothing
    }
  }

  // last page
  if(col1.children.length || col2.children.length){
    await snapPage();
  }

  // Build PDF
  pages.forEach((img, idx) => {
    if(idx > 0) doc.addPage();
    doc.addImage(img, "PNG", 0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight());
  });

  doc.save(`${folder.name}.pdf`);
  document.body.removeChild(stage);
}

// ------------------------------
// 13) Export/Import JSON (metadata + images)
// ------------------------------
// اینجا برای اینکه "هیچ مشکلی واسه نوع دیتا" پیش نیاد، export شامل تصاویر هم هست.
// توجه: اگر خیلی تصویر سنگین باشد، فایل JSON خیلی بزرگ می‌شود.
async function exportData(){
  try{
    if(!window.JSZip) throw new Error("JSZip not loaded");

    const zip = new JSZip();

    // 1) data.json (متادیتا)
    const payload = {
      version: 2,
      theme: state.theme,
      background: state.background,
      exportedAt: new Date().toISOString(),
      folders: state.folders
    };
    zip.file("data.json", JSON.stringify(payload, null, 2));

    // 2) images/ (بلاب اصلی، بدون افت کیفیت)
    const ids = new Set();
    for(const f of (state.folders || [])){
      for(const q of (f.questions || [])){
        if(q.imageId) ids.add(q.imageId);
        // اگر هنوز legacy base64 داری:
        // می‌تونی اینجا هم اضافه کنی ولی بهتره همون imageId باشه
      }
    }

    const imgFolder = zip.folder("images");

    for(const id of ids){
      const blob = await getImageBlob(id);
      if(!blob) continue;
      const ext = (blob.type && blob.type.includes("jpeg")) ? "jpg"
               : (blob.type && blob.type.includes("webp")) ? "webp"
               : "png";
      // ذخیره blob خام (کیفیت کامل)
      imgFolder.file(`${id}.${ext}`, blob, { binary: true });
    }

    // برای سرعت/پایداری روی موبایل: STORE (بدون فشرده‌سازی سنگین)
    const outBlob = await zip.generateAsync({
      type: "blob",
      compression: "STORE"
    });

    const fileName = `arafiles-backup-${Date.now()}.zip`;
    const file = new File([outBlob], fileName, { type: "application/zip" });

    // iOS: Share Sheet معمولاً بهتر از دانلود مستقیمه
    if(navigator.canShare && navigator.canShare({ files: [file] })){
      await navigator.share({
        files: [file],
        title: "Arafiles Backup"
      });
      return;
    }

    // fallback download
    const a = document.createElement("a");
    a.href = URL.createObjectURL(outBlob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);

  }catch(err){
    console.error(err);
    alert("خطا در ساخت فایل خروجی. (JSZip یا ذخیره‌سازی تصاویر مشکل دارد)");
  }
}


async function importData(file){
  try{
    if(!window.JSZip) throw new Error("JSZip not loaded");

    const zip = await JSZip.loadAsync(file);

    const dataFile = zip.file("data.json");
    if(!dataFile) throw new Error("data.json not found");

    const text = await dataFile.async("string");
    const payload = JSON.parse(text);

    if(!payload || !Array.isArray(payload.folders)) throw new Error("Invalid data.json");

    // تنظیمات
    if(payload.theme) setTheme(payload.theme);
    if(payload.background) setBackground(payload.background);

    // تصاویر: هر چی داخل images/ هست رو برگردون داخل IDB
    const images = zip.folder("images");
    if(images){
      const entries = [];
      images.forEach((path, zf) => { if(!zf.dir) entries.push({ path, zf }); });

      // ذخیره سریالی برای iOS (کمتر لگ/کرش)
      for(const { path, zf } of entries){
        const blob = await zf.async("blob");
        const name = path.split("/").pop();           // id.ext
        const id = name.split(".")[0];               // id
        // با همان id ذخیره کن (تا رفرنس‌ها درست بماند)
        await putImageBlobWithId(id, blob);
      }
    }

    // state
    state.folders = payload.folders;
    normalize();
    saveDebounced();
    renderHome();

    alert("بکاپ با موفقیت وارد شد ✅");

  }catch(err){
    console.error(err);
    alert("خطا در خواندن فایل (ZIP/JSON خراب است یا ناقص ذخیره شده).");
  }
}

// ------------------------------
// 14) Wire UI events (no duplicates)
// ------------------------------
function initUI(){
  // header
  $("backBtn").onclick = () => renderHome();
  $("settingsBtn").onclick = () => openSettings();
  $("closeSettingsBtn").onclick = () => closeSettings();

  // floating
  if(floatingAdd) floatingAdd.onclick = addFolder;

  // settings actions
  document.querySelectorAll("[data-theme]").forEach(btn => {
    btn.onclick = () => setTheme(btn.getAttribute("data-theme"));
  });

  $("bgTiles").addEventListener("click", (e) => {
    const tile = e.target.closest(".preview-tile");
    if(!tile) return;
    document.querySelectorAll(".preview-tile").forEach(t => t.classList.remove("active"));
    tile.classList.add("active");
    setBackground(tile.getAttribute("data-bg"));
  });

  $("importBtn").onclick = () => $("importFile").click();
  $("importFile").onchange = (e) => {
    const file = e.target.files[0];
    if(file) importData(file);
    e.target.value = "";
  };

  $("btnSave").onclick = () => exportData();

  $("emailBtn").onclick = sendEmail;

  $("resetBtn").onclick = openResetConfirm;
  $("closeResetBtn").onclick = closeReset;
  $("resetNo1").onclick = closeReset;
  $("resetYes1").onclick = toResetStep2;
  $("resetNo2").onclick = closeReset;
  $("resetYes2").onclick = doFullReset;
}

// ------------------------------
// 15) Init
// ------------------------------
setTheme(state.theme);
applyBackground(state.background);
initUI();
renderHome();
