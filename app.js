// =================== State ===================
let state = {
  view: "home",
  currentFolderIndex: null,
  folders: JSON.parse(localStorage.getItem("folders") || "[]"),
  theme: localStorage.getItem("theme") || "dark",
  background: localStorage.getItem("background") || "gradient1",
  folderGlow: (localStorage.getItem("folderGlow") ?? "1") === "1",
  cropper: null,
  pendingImageBlobUrl: null
};

function applyFolderGlow(){
  document.body.classList.toggle("no-folder-glow", !state.folderGlow);
}

function saveNow(){ localStorage.setItem("folders", JSON.stringify(state.folders)); }
let _saveTimer = null;
function saveDebounced(){
  if(_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    saveNow();
    _saveTimer = null;
  }, 120);
}

// =================== Service Worker ===================
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(()=>{});
}

// =================== Theme + Background ===================
function setTheme(mode){
  state.theme = mode; localStorage.setItem("theme", mode);
  document.body.classList.remove("dark","light");
  document.body.classList.add(mode==="dark"?"dark":"light");
  applyBackground(state.background);
}
function setBackground(key){ state.background = key; localStorage.setItem("background", key); }
function applyBackground(key){
  document.body.style.backgroundImage = "none";
  document.body.style.backgroundColor = "";
  if(key==="gradient1"){
    document.body.style.backgroundImage = "linear-gradient(120deg,#1f2937,#3b82f6 100%)";
  } else if(key==="gradient2"){
    document.body.style.backgroundImage = "linear-gradient(120deg,#0ea5e9,#10b981 100%)";
  } else if(key==="grid"){
    document.body.style.backgroundImage = "radial-gradient(#64748b 1px,transparent 1px)";
    document.body.style.backgroundSize = "24px 24px";
  } else {
    document.body.style.backgroundColor = getComputedStyle(document.body).getPropertyValue("--bg");
  }
}
function setBackgroundTile(el){
  document.querySelectorAll(".preview-tile").forEach(t=>t.classList.remove("active"));
  el.classList.add("active");
  const key = el.getAttribute("data-bg");
  setBackground(key); applyBackground(key);
}

// =================== Settings modal ===================
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
function doFullReset(){
  localStorage.clear();
  state.folders = [];
  state.theme = "dark";
  state.background = "gradient1";
  state.folderGlow = true;
  closeReset();
  closeSettings();
  setTheme("dark");
  applyBackground("gradient1");
  applyFolderGlow();
  renderHome();
}
function sendEmail(){
  window.location.href = "mailto:Aria973@yahoo.com?subject=نقد یا پرسش درباره Arafiles";
}

// =================== Header controls ===================
document.getElementById("backBtn").onclick = () => renderHome();
document.getElementById("settingsBtn").onclick = () => {
  document.getElementById("settingsOverlay").classList.add("active");

  const tg = document.getElementById("toggleFolderGlow");
  if(tg){
    tg.checked = state.folderGlow;
    tg.onchange = () => {
      state.folderGlow = tg.checked;
      localStorage.setItem("folderGlow", state.folderGlow ? "1" : "0");
      applyFolderGlow();
    };
  }
};

const floatingAdd = document.getElementById("floatingAdd");
if (floatingAdd) floatingAdd.onclick = addFolder;

// =================== Home ===================
function renderHome(){
  state.view = "home"; state.currentFolderIndex = null;
  const app = document.getElementById("app"); app.innerHTML = "";
  document.getElementById("floatingAdd").style.display = "flex";

  if(state.folders.length === 0){
    const empty = document.createElement("div"); empty.className = "glass-3d card empty";
    empty.innerHTML = "<p>هیچ فایلی وجود ندارد</p>";
    app.appendChild(empty);
    return;
  }

  const grid = document.createElement("div"); grid.className = "grid";
  state.folders.forEach((f,i)=>{
    const card = document.createElement("div");
    card.className = "glass-3d card folder-glow";
    card.style.setProperty("--glow", f.color || "#3B82F6");
    card.onclick = () => openFolder(i);

    card.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="material-icons-outlined">folder</span>
          <h3 style="margin:0;">${escapeHtml(f.name)}</h3>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="icon-btn" onclick="event.stopPropagation(); editFolder(${i})"><span class="material-icons-outlined">edit</span></button>
          <button class="icon-btn danger" onclick="event.stopPropagation(); deleteFolder(${i})"><span class="material-icons-outlined">delete</span></button>
        </div>
      </div>
      <p style="margin:10px 0 6px 0; opacity:.9;">${escapeHtml(f.desc || "—")}</p>
      <small style="opacity:.8;">${(f.questions||[]).length} سوال</small>
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
    name, desc,
    color:"#3B82F6",
    questions:[],
    perPage:6,
    numberAlign:"right",
    exportQuality:"hq",      // hq | compact
    includeKey:true,
    showCorrectBadge:true,
    pageNumbers:false
  });
  saveNow(); renderHome();
}
function deleteFolder(i){
  if(!confirm("این پوشه حذف شود؟")) return;
  state.folders.splice(i,1);
  saveNow(); renderHome();
}

// =================== Folder ===================
function openFolder(i){
  state.view = "folder";
  state.currentFolderIndex = i;
  const f = state.folders[i];

  // defaults for old folders
  if(!("exportQuality" in f)) f.exportQuality = "hq";
  if(!("includeKey" in f)) f.includeKey = true;
  if(!("showCorrectBadge" in f)) f.showCorrectBadge = true;
  if(!("pageNumbers" in f)) f.pageNumbers = false;
  if(!("perPage" in f)) f.perPage = 6;
  if(!("numberAlign" in f)) f.numberAlign = "right";

  const app = document.getElementById("app"); app.innerHTML = "";
  document.getElementById("floatingAdd").style.display = "none";

  // compact header
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
      <div class="ctrl">
        <span class="lbl">Q/P</span>
        <input id="perPage" type="number" min="2" max="20" value="${f.perPage}" />
      </div>

      <div class="ctrl">
        <span class="lbl">Num</span>
        <select id="numberAlign">
          <option value="right" ${f.numberAlign==="right"?"selected":""}>R</option>
          <option value="left" ${f.numberAlign==="left"?"selected":""}>L</option>
        </select>
      </div>

      <div class="ctrl" title="HQ / Compact">
        <span class="lbl">HQ</span>
        <label class="toggle">
          <input id="toggleQuality" type="checkbox" ${f.exportQuality==="hq"?"checked":""}>
          <span class="track"></span><span class="thumb"></span>
        </label>
        <span class="lbl" style="opacity:.8;">C</span>
      </div>

      <div class="ctrl" title="Answer Key in last page">
        <span class="lbl">Key</span>
        <label class="toggle">
          <input id="toggleKey" type="checkbox" ${f.includeKey?"checked":""}>
          <span class="track"></span><span class="thumb"></span>
        </label>
      </div>

      <div class="ctrl" title="Show correct badge on questions">
        <span class="lbl">Show</span>
        <label class="toggle">
          <input id="toggleShowCorrect" type="checkbox" ${f.showCorrectBadge?"checked":""}>
          <span class="track"></span><span class="thumb"></span>
        </label>
      </div>

      <div class="ctrl" title="Page numbers">
        <span class="lbl">Pg#</span>
        <label class="toggle">
          <input id="togglePageNum" type="checkbox" ${f.pageNumbers?"checked":""}>
          <span class="track"></span><span class="thumb"></span>
        </label>
      </div>

      <button class="icon-btn" id="exportPDF" title="PDF">
        <span class="material-icons-outlined">picture_as_pdf</span>
      </button>
      <button class="icon-btn" id="exportPNG" title="PNG">
        <span class="material-icons-outlined">image</span>
      </button>
    </div>
  `;
  app.appendChild(header);

  // add buttons card
  const controls = document.createElement("div");
  controls.className = "glass-3d card";
  controls.innerHTML = `
    <div style="display:flex; gap:10px; flex-wrap:wrap;">
      <button class="primary" id="addTextQ"><span class="material-icons-outlined">note_add</span></button>
      <button class="primary" id="addImageQ"><span class="material-icons-outlined">add_photo_alternate</span></button>
    </div>
  `;
  app.appendChild(controls);

  const listWrap = document.createElement("div");
  listWrap.id="questions";
  app.appendChild(listWrap);

  // wire controls
  document.getElementById("editFolderBtn").onclick = () => editFolder(i);
  document.getElementById("exportPDF").onclick = () => exportPDF(i);
  document.getElementById("exportPNG").onclick = () => exportPNG(i);

  document.getElementById("addTextQ").onclick = () => addTextQuestion(i);
  document.getElementById("addImageQ").onclick = () => openCrop(i);

  document.getElementById("perPage").onchange = (e) => { f.perPage = +e.target.value; saveDebounced(); };
  document.getElementById("numberAlign").onchange = (e) => { f.numberAlign = e.target.value; saveDebounced(); renderQuestions(i); };

  document.getElementById("toggleQuality").onchange = (e) => {
    f.exportQuality = e.target.checked ? "hq" : "compact";
    saveDebounced();
  };
  document.getElementById("toggleKey").onchange = (e) => { f.includeKey = !!e.target.checked; saveDebounced(); };
  document.getElementById("toggleShowCorrect").onchange = (e) => { f.showCorrectBadge = !!e.target.checked; saveDebounced(); renderQuestions(i); };
  document.getElementById("togglePageNum").onchange = (e) => { f.pageNumbers = !!e.target.checked; saveDebounced(); };

  renderQuestions(i);
}

// =================== Folder edit modal ===================
function editFolder(i){
  const f = state.folders[i];
  const overlay = document.createElement("div"); overlay.className="modal-overlay active";
  const panel = document.createElement("div"); panel.className="modal-panel glass-3d";
  panel.innerHTML = `
    <div class="modal-header"><h2>تنظیمات پوشه</h2>
      <button class="icon-btn" id="closeFolderSettings"><span class="material-icons-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <label>نام:</label><input id="folderName" value="${escapeAttr(f.name)}" />
      <label>توضیحات:</label><input id="folderDesc" value="${escapeAttr(f.desc||"")}" />
      <label>رنگ:</label><input id="folderColor" type="color" value="${escapeAttr(f.color||"#3B82F6")}" />
      <div class="row-inline"><button class="primary" id="saveFolder">ذخیره</button></div>
    </div>`;
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  panel.querySelector("#saveFolder").onclick = () => {
    f.name = document.getElementById("folderName").value || "Folder";
    f.desc = document.getElementById("folderDesc").value || "";
    f.color = document.getElementById("folderColor").value || "#3B82F6";
    saveNow();
    document.body.removeChild(overlay);
    openFolder(i);
  };
  panel.querySelector("#closeFolderSettings").onclick = () => document.body.removeChild(overlay);
}

// =================== Utilities ===================
function detectDirection(text){ return /[\u0600-\u06FF]/.test(text) ? "rtl" : "ltr"; }
function escapeHtml(s){ return (s??"").toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
function letter(n){ return String.fromCharCode(65 + n); } // 0->A

// =================== Questions render ===================
function renderQuestions(folderIndex){
  const f = state.folders[folderIndex];
  const wrap = document.getElementById("questions");
  wrap.innerHTML = "";

  if(!f.questions || f.questions.length === 0){
    const empty = document.createElement("div");
    empty.className = "glass-3d card empty";
    empty.innerHTML = "<p>هنوز سوالی اضافه نشده است.</p>";
    wrap.appendChild(empty);
    return;
  }

  // prevent listener leak
  wrap.ondragover = (e) => e.preventDefault();

  f.questions.forEach((q, idx) => {
    // normalize old questions
    if(!("options" in q)) q.options = [];
    if(!("correct" in q)) q.correct = null;
    if(!("answerText" in q)) q.answerText = "";

    const card = document.createElement("div");
    card.className = "glass-3d card question";
    card.draggable = true;
    card.setAttribute("dir", detectDirection(q.text || ""));
    if (q.align) card.setAttribute("align", q.align);

    const top = document.createElement("div");
    top.className = "top-row";

    const strong = document.createElement("strong");
    const label = (q.text && q.text.trim().length) ? `${idx+1}. ${q.text}` : `${idx+1}.`;
    strong.textContent = label;
    strong.style.textAlign = f.numberAlign || "right";
    strong.style.flex = "1";
    top.appendChild(strong);

    // show correct badge toggle
    if(f.showCorrectBadge){
      const b = document.createElement("span");
      b.className = "badge-correct";
      b.textContent = (q.correct == null) ? "-" : letter(q.correct);
      top.appendChild(b);
    }

    const actions = document.createElement("div");
    actions.className="actions";

    const editBtn = document.createElement("button");
    editBtn.className="mini";
    editBtn.title="ویرایش";
    editBtn.innerHTML=`<span class="material-icons-outlined">edit</span>`;
    editBtn.onclick=()=>editQuestion(folderIndex, idx);

    const delBtn = document.createElement("button");
    delBtn.className="mini danger";
    delBtn.title="حذف";
    delBtn.innerHTML=`<span class="material-icons-outlined">delete</span>`;
    delBtn.onclick=()=>deleteQuestion(folderIndex, idx);

    const alignBtn = document.createElement("button");
    alignBtn.className="mini";
    alignBtn.title="چینش";
    alignBtn.innerHTML=`<span class="material-icons-outlined">format_align_center</span>`;
    alignBtn.onclick=()=>{
      q.align = q.align==="center" ? "right" : q.align==="right" ? "left" : "center";
      saveDebounced(); renderQuestions(folderIndex);
    };

    // ✅ Correct option cycle button (— / A / B / ...)
    const correctBtn = document.createElement("button");
    correctBtn.className="mini";
    correctBtn.title="گزینه درست";
    const label2 = (q.correct == null) ? "—" : letter(q.correct);
    correctBtn.innerHTML = `<span class="material-icons-outlined">check_circle</span><span style="direction:ltr;unicode-bidi:isolate;font-weight:800;">${label2}</span>`;
    correctBtn.onclick = () => {
      const opts = q.options || [];
      if(opts.length === 0){
        alert("اول گزینه‌ها را اضافه کن.");
        return;
      }
      if(q.correct == null) q.correct = 0;
      else if(q.correct >= opts.length - 1) q.correct = null;
      else q.correct += 1;
      saveDebounced(); renderQuestions(folderIndex);
    };

    // ✅ Add Answer (text)
    const ansBtn = document.createElement("button");
    ansBtn.className = "mini" + (q.answerText && q.answerText.trim() ? " ok" : "");
    ansBtn.title = "Add Answer (متنی)";
    ansBtn.innerHTML = `<span class="material-icons-outlined">note</span><span style="font-weight:800;">Ans</span>`;
    ansBtn.onclick = () => {
      const cur = q.answerText || "";
      const val = prompt("جواب متنی سوال:", cur);
      if(val === null) return;
      q.answerText = val.trim();
      saveDebounced();
      renderQuestions(folderIndex);
    };

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    actions.appendChild(alignBtn);
    actions.appendChild(correctBtn);
    actions.appendChild(ansBtn);

    top.appendChild(actions);
    card.appendChild(top);

    if(q.image){
      const img = document.createElement("img");
      img.className="question-img";
      img.src = q.image;
      card.appendChild(img);
    }

    if(q.options && q.options.length){
      const ul = document.createElement("ul");
      ul.className="options";
      q.options.forEach((o,j)=>{
        const li = document.createElement("li");
        const labelSpan = document.createElement("span");
        labelSpan.style.direction="ltr";
        labelSpan.style.unicodeBidi="isolate";
        labelSpan.style.marginInlineEnd="6px";
        labelSpan.textContent = `(${String.fromCharCode(97+j)})`;
        const textSpan = document.createElement("span");
        textSpan.textContent = o;
        li.appendChild(labelSpan);
        li.appendChild(textSpan);
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }

    // DnD
    card.addEventListener("dragstart", e => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("index", idx);
    });
    card.addEventListener("drop", e => {
      e.preventDefault();
      const from = +e.dataTransfer.getData("index");
      const to = idx;
      if(Number.isNaN(from) || from===to) return;
      const arr = f.questions;
      const moved = arr.splice(from,1)[0];
      arr.splice(to,0,moved);
      saveDebounced(); renderQuestions(folderIndex);
    });

    wrap.appendChild(card);
  });
}

// =================== Add / Edit / Delete question ===================
function addTextQuestion(folderIndex){
  const text = prompt("متن سوال (می‌تواند خالی باشد):") || "";
  const q = { type:"text", text, options:[], correct:null, answerText:"" };
  state.folders[folderIndex].questions.push(q);
  saveNow(); renderQuestions(folderIndex);
  openOptionsEditor(folderIndex, state.folders[folderIndex].questions.length-1);
}

function openOptionsEditor(folderIndex, idx){
  const q = state.folders[folderIndex].questions[idx];
  if(!("options" in q)) q.options = [];
  if(!("correct" in q)) q.correct = null;

  const overlay = document.createElement("div"); overlay.className="modal-overlay active";
  const panel = document.createElement("div"); panel.className="modal-panel glass-3d";

  panel.innerHTML = `
    <div class="modal-header">
      <h2>گزینه‌ها</h2>
      <button class="icon-btn" id="closeOpt"><span class="material-icons-outlined">close</span></button>
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

    if (q.correct != null && (q.correct < 0 || q.correct >= q.options.length)) {
      q.correct = null;
      saveDebounced();
    }

    q.options.forEach((o,i)=>{
      const row = document.createElement("div");
      row.className="row-inline";
      row.style.justifyContent = "space-between";
      row.style.width = "100%";

      row.innerHTML = `
        <span style="direction:ltr; unicode-bidi:isolate; font-weight:800;">${letter(i)}</span>
        <input value="${escapeAttr(o||"")}" data-idx="${i}" style="flex:1;" />
        <button class="icon-btn danger" data-del="${i}"><span class="material-icons-outlined">close</span></button>
      `;
      wrap.appendChild(row);
    });

    wrap.querySelectorAll("input[data-idx]").forEach(inp=>{
      inp.oninput = e => {
        q.options[+e.target.dataset.idx] = e.target.value;
        saveDebounced();
      };
    });
    wrap.querySelectorAll("[data-del]").forEach(btn=>{
      btn.onclick = e => {
        const di = +e.currentTarget.dataset.del;
        q.options.splice(di,1);
        if(q.correct === di) q.correct = null;
        else if(q.correct != null && q.correct > di) q.correct -= 1;
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
  const close = () => { document.body.removeChild(overlay); };
  panel.querySelector("#doneOpt").onclick = close;
  panel.querySelector("#closeOpt").onclick = close;
}

function editQuestion(folderIndex, idx){
  const q = state.folders[folderIndex].questions[idx];

  const overlay = document.createElement("div"); overlay.className="modal-overlay active";
  const panel = document.createElement("div"); panel.className="modal-panel glass-3d";

  panel.innerHTML = `
    <div class="modal-header">
      <h2>ویرایش سوال</h2>
      <button class="icon-btn" id="closeEditQ"><span class="material-icons-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div class="row-inline" style="justify-content:center;">
        <button class="secondary" id="editText"><span class="material-icons-outlined">edit</span> متن</button>
        <button class="secondary" id="editOptions"><span class="material-icons-outlined">list</span> گزینه‌ها</button>
        <button class="secondary" id="editImage"><span class="material-icons-outlined">image</span> تصویر</button>
        <button class="secondary" id="cropImage"><span class="material-icons-outlined">crop</span> کراپ</button>
      </div>
    </div>
  `;
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  panel.querySelector("#editText").onclick = () => {
    const nt = prompt("ویرایش متن سوال:", q.text || "");
    if(nt !== null) q.text = nt;
    saveDebounced(); renderQuestions(folderIndex);
  };
  panel.querySelector("#editOptions").onclick = () => openOptionsEditor(folderIndex, idx);

  panel.querySelector("#editImage").onclick = () => {
    const input = document.createElement("input");
    input.type="file"; input.accept="image/*";
    input.onchange = e => {
      const file = e.target.files[0]; if(!file) return;
      const rdr = new FileReader();
      rdr.onload = () => {
        q.image = rdr.result;
        saveDebounced(); renderQuestions(folderIndex);
      };
      rdr.readAsDataURL(file);
    };
    input.click();
  };

  panel.querySelector("#cropImage").onclick = () => {
    if(!q.image){ alert("هیچ تصویری وجود ندارد."); return; }
    openCropExisting(folderIndex, idx, q.image);
  };

  panel.querySelector("#closeEditQ").onclick = () => document.body.removeChild(overlay);
}

function deleteQuestion(folderIndex, idx){
  state.folders[folderIndex].questions.splice(idx, 1);
  saveDebounced();
  renderQuestions(folderIndex);
}

// =================== Crop (kept from yours) ===================
function openCrop(folderIndex){
  const overlay = document.createElement("div"); overlay.className="modal-overlay active";
  const panel = document.createElement("div"); panel.className="modal-panel glass-3d";
  panel.innerHTML = `
    <div class="modal-header"><h2>کراپ تصویر</h2>
      <button class="icon-btn" id="closeCrop"><span class="material-icons-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <input id="imageInput" type="file" accept="image/*" />
      <div id="cropArea" class="crop-area"></div>
      <div class="row-inline">
        <button class="primary" id="saveCropped"><span class="material-icons-outlined">save</span></button>
        <button class="secondary" id="cancelCrop"><span class="material-icons-outlined">close</span></button>
      </div>
    </div>`;
  overlay.appendChild(panel); document.body.appendChild(overlay);

  const input = panel.querySelector("#imageInput");
  const area = panel.querySelector("#cropArea");

  input.onchange = e => {
    const file = e.target.files[0]; if(!file) return;
    const url = URL.createObjectURL(file);
    state.pendingImageBlobUrl = url;
    area.innerHTML = "";
    const img = document.createElement("img");
    img.src = url; img.style.maxWidth = "100%";
    area.appendChild(img);
    state.cropper = new Cropper(img, { viewMode:1, dragMode:'move', autoCropArea:0.85, background:false });
  };

  panel.querySelector("#saveCropped").onclick = () => {
    if(!state.cropper) return;
    const dataUrl = state.cropper.getCroppedCanvas({ imageSmoothingQuality:'high' }).toDataURL('image/png', 1);
    state.folders[folderIndex].questions.push({ type:"image", text:"", image:dataUrl, options:[], correct:null, answerText:"" });
    saveNow();
    cleanupCrop(overlay);
    openFolder(folderIndex);
  };

  const close = () => cleanupCrop(overlay);
  panel.querySelector("#cancelCrop").onclick = close;
  panel.querySelector("#closeCrop").onclick = close;
}

function openCropExisting(folderIndex, idx, imageData){
  const overlay = document.createElement("div"); overlay.className="modal-overlay active";
  const panel = document.createElement("div"); panel.className="modal-panel glass-3d";
  panel.innerHTML = `
    <div class="modal-header"><h2>کراپ تصویر</h2>
      <button class="icon-btn" id="closeCrop"><span class="material-icons-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div id="cropArea" class="crop-area"></div>
      <div class="row-inline">
        <button class="primary" id="saveCropped"><span class="material-icons-outlined">save</span></button>
        <button class="secondary" id="cancelCrop"><span class="material-icons-outlined">close</span></button>
      </div>
    </div>`;
  overlay.appendChild(panel); document.body.appendChild(overlay);

  const area = panel.querySelector("#cropArea");
  area.innerHTML = "";
  const img = document.createElement("img");
  img.src = imageData;
  img.style.maxWidth = "100%";
  area.appendChild(img);

  state.cropper = new Cropper(img, { viewMode:1, dragMode:'move', autoCropArea:0.85, background:false });

  panel.querySelector("#saveCropped").onclick = () => {
    if(!state.cropper) return;
    const dataUrl = state.cropper.getCroppedCanvas({ imageSmoothingQuality:'high' }).toDataURL('image/png', 1);
    state.folders[folderIndex].questions[idx].image = dataUrl;
    saveDebounced();
    cleanupCrop(overlay);
    openFolder(folderIndex);
  };

  const close = () => cleanupCrop(overlay);
  panel.querySelector("#cancelCrop").onclick = close;
  panel.querySelector("#closeCrop").onclick = close;
}

function cleanupCrop(overlay){
  document.body.removeChild(overlay);
  if(state.cropper){ state.cropper.destroy(); state.cropper=null; }
  if(state.pendingImageBlobUrl){ URL.revokeObjectURL(state.pendingImageBlobUrl); state.pendingImageBlobUrl=null; }
}

// =================== Export PNG (kept) ===================
function buildOutputDOM(folder){
  const el = document.createElement("div");
  el.style.width = "794px";
  el.style.padding = "32px";
  el.style.background = "#fff";
  el.style.color = "#000";
  el.style.fontFamily = "Vazirmatn, Vazir, sans-serif";
  el.style.direction = "rtl";

  const h = document.createElement("h2");
  h.textContent = folder.name;
  el.appendChild(h);

  (folder.questions||[]).forEach((q,idx)=>{
    const box = document.createElement("div");
    box.style.border = "1px solid #ddd";
    box.style.borderRadius = "8px";
    box.style.padding = "12px";
    box.style.marginBottom = "12px";
    box.style.pageBreakInside = "avoid";

    const head = document.createElement("div");
    head.textContent = (q.text && q.text.trim().length) ? `${idx+1}. ${q.text}` : `${idx+1}.`;
    head.style.fontWeight = "800";
    head.style.textAlign = folder.numberAlign || "right";
    box.appendChild(head);

    if(q.image){
      const img = document.createElement("img");
      img.style.maxWidth="100%";
      img.style.maxHeight="220px";
      img.style.objectFit="contain";
      img.src = q.image;
      box.appendChild(img);
    }

    el.appendChild(box);
  });
  return el;
}

async function exportPNG(folderIndex){
  const folder = state.folders[folderIndex];
  const el = buildOutputDOM(folder);
  document.body.appendChild(el);
  const canvas = await html2canvas(el, { scale: 2, backgroundColor:"#fff" });
  document.body.removeChild(el);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${folder.name}.png`;
  a.click();
}

// =================== Export PDF (HQ/Compact + optional key + optional page numbers) ===================
async function exportPDF(folderIndex){
  const folder = state.folders[folderIndex];
  const { jsPDF } = window.jspdf;

  if (document.fonts && document.fonts.ready) await document.fonts.ready;

  const quality = folder.exportQuality === "hq" ? "hq" : "compact";
  const scale = (quality === "hq") ? 2.5 : 2.0;
  const jpegQ = (quality === "hq") ? 0.90 : 0.82;

  const PAGE_W = 794;
  const PAGE_H = 1123;
  const PADDING = 20;
  const GAP = 18;

  // stage
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
  stage.style.position = "fixed";
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
  footer.style.opacity = "0.75";
  stage.appendChild(footer);

  const colsWrap = document.createElement("div");
  colsWrap.style.display = "flex";
  colsWrap.style.gap = GAP + "px";

  const availableH = PAGE_H - (PADDING*2) - title.getBoundingClientRect().height - 20; // keep room for footer
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

  const pages = [];
  const qs = folder.questions || [];

  const waitImages = async (root) => {
    const imgs = Array.from(root.querySelectorAll("img"));
    await Promise.all(imgs.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(res => { img.onload = img.onerror = () => res(); });
    }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  };

  const makeBlock = (q, number) => {
    const block = document.createElement("div");
    block.style.border = "1px solid #ccc";
    block.style.borderRadius = "10px";
    block.style.padding = "10px";
    block.style.boxSizing = "border-box";
    block.style.breakInside = "avoid";
    block.style.pageBreakInside = "avoid";

    if (q.align === "center") block.style.textAlign = "center";
    if (q.align === "left") block.style.textAlign = "left";
    if (q.align === "right") block.style.textAlign = "right";

    const head = document.createElement("div");
    head.style.fontWeight = "900";
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
        row.innerHTML =
          `<span style="direction:ltr;unicode-bidi:isolate;display:inline-block;min-width:22px;font-weight:800;">${letter(i)}.</span>` +
          `<span>${escapeHtml(opt)}</span>`;
        opts.appendChild(row);
      });
      block.appendChild(opts);
    }

    if(q.image){
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

  const clearCols = () => { col1.innerHTML = ""; col2.innerHTML = ""; };
  const fits = (col) => col.scrollHeight <= col.clientHeight;

  const snapPage = async (pageIndex, totalPages) => {
    footer.textContent = folder.pageNumbers ? `صفحه ${pageIndex} / ${totalPages}` : "";
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const canvas = await html2canvas(stage, {
      scale,
      backgroundColor: "#fff",
      useCORS: true,
      allowTaint: false
    });

    // JPEG to reduce size massively
    pages.push(canvas.toDataURL("image/jpeg", jpegQ));
  };

  // We need to build pages first (without snapping) to know total pages if pageNumbers ON.
  // We'll simulate pagination with DOM but store snapshots later.
  const layoutPages = [];
  clearCols();
  let currentCol = col1;

  const pushLayout = () => {
    // clone current content as HTML snapshot blueprint
    layoutPages.push({
      col1: col1.innerHTML,
      col2: col2.innerHTML
    });
  };

  for(let i=0; i<qs.length; i++){
    const q = qs[i];
    if(!("options" in q)) q.options = [];
    const block = makeBlock(q, i+1);

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
          pushLayout();
          clearCols();
          currentCol = col1;

          currentCol.appendChild(block);
          await waitImages(block);

          if(!fits(currentCol)){
            block.style.fontSize = "12px";
            block.style.lineHeight = "1.2";
          }
        }
      } else {
        pushLayout();
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
  }

  if(col1.children.length || col2.children.length){
    pushLayout();
  }

  // optional answer key as last page
  const shouldKey = !!folder.includeKey;
  const totalSnapPages = layoutPages.length + (shouldKey ? 1 : 0);

  // Snap question pages
  for(let p=0; p<layoutPages.length; p++){
    col1.innerHTML = layoutPages[p].col1;
    col2.innerHTML = layoutPages[p].col2;
    await snapPage(p+1, totalSnapPages);
  }

  // Answer key page
  if(shouldKey){
    title.textContent = `${folder.name || "Arafiles"} — کلید پاسخ`;
    colsWrap.style.display = "block";
    colsWrap.style.gap = "0";
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

    for(let i=0;i<qs.length;i++){
      const q = qs[i];
      const ans = (q.correct == null) ? "-" : letter(q.correct);
      const item = document.createElement("div");
      item.textContent = `${i+1}) ${ans}`;
      grid.appendChild(item);
    }

    box.appendChild(grid);
    colsWrap.appendChild(box);

    await snapPage(totalSnapPages, totalSnapPages);
  }

  // Build PDF
  const doc = new jsPDF("p","mm","a4");
  pages.forEach((img, idx) => {
    if(idx > 0) doc.addPage();
    doc.addImage(img, "JPEG", 0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight());
  });

  doc.save(`${folder.name}.pdf`);
  document.body.removeChild(stage);

  // restore title display (not really needed after save)
}

// =================== Export / Import JSON ===================
function exportData(){
  saveNow();
  const dataStr = JSON.stringify({
    theme: state.theme,
    background: state.background,
    folderGlow: state.folderGlow,
    folders: state.folders
  }, null, 2);

  const blob = new Blob([dataStr], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "arafiles-data.json";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

async function importData(file){
  try{
    const text = await file.text();
    const cleaned = text.replace(/^\uFEFF/, "").trim();
    const payload = JSON.parse(cleaned);

    if(payload.theme) setTheme(payload.theme);
    if(payload.background) { state.background = payload.background; applyBackground(state.background); }
    if(typeof payload.folderGlow === "boolean"){
      state.folderGlow = payload.folderGlow;
      localStorage.setItem("folderGlow", state.folderGlow ? "1" : "0");
      applyFolderGlow();
    }
    if(Array.isArray(payload.folders)) state.folders = payload.folders;

    saveNow();
    renderHome();
    alert("داده‌ها با موفقیت بارگذاری شدند!");
  }catch(err){
    console.error(err);
    alert("خطا در خواندن فایل JSON");
  }
}

// =================== Init ===================
setTheme(state.theme);
applyBackground(state.background);
applyFolderGlow();
renderHome();

// wire save/import buttons
window.addEventListener("DOMContentLoaded", () => {
  const btnSave = document.getElementById("btnSave");
  const importInput = document.getElementById("importFile");

  if(btnSave) btnSave.onclick = exportData;
  if(importInput) importInput.onchange = e => {
    const file = e.target.files[0];
    if(file) importData(file);
  };
});

// expose for inline handlers
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
window.exportPNG = exportPNG;