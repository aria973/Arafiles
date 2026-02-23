// ===== Arafiles app.js =====

// App state
let state = {
  view: "home",
  currentFolderIndex: null,
  folders: JSON.parse(localStorage.getItem("folders") || "[]"),
  theme: localStorage.getItem("theme") || "dark",
  background: localStorage.getItem("background") || "gradient1",
  cropper: null,
  pendingImageBlobUrl: null
};

function save(){ localStorage.setItem("folders", JSON.stringify(state.folders)); }
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js")
    .then(() => console.log("Service Worker registered"))
    .catch(err => console.error("SW registration failed:", err));
}

// Theme + Background
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

// Settings modal control
function closeSettings(){
  document.getElementById("settingsOverlay").classList.remove("active");
}

// Reset (sequential)
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
  closeReset();
  closeSettings();
  renderHome();
}

// Email
function sendEmail(){ window.location.href = "mailto:Aria973@yahoo.com?subject=نقد یا پرسش درباره Arafiles"; }

// Global header controls
document.getElementById("backBtn").onclick = () => renderHome();
document.getElementById("settingsBtn").onclick = () => {
  document.getElementById("settingsOverlay").classList.add("active");
};
// Floating add folder button will be shown only in Home (controlled in views)
const floatingAdd = document.getElementById("floatingAdd");
if (floatingAdd) floatingAdd.onclick = addFolder;
// Render Home (show floating add)
function renderHome(){
  state.view = "home"; state.currentFolderIndex = null;
  const app = document.getElementById("app"); app.innerHTML = "";
  document.getElementById("floatingAdd").style.display = "flex";

  if(state.folders.length === 0){
    const empty = document.createElement("div"); empty.className = "glass-3d card empty";
    empty.innerHTML = "<p>هیچ فایلی وجود ندارد</p>"; app.appendChild(empty);
  } else {
    const grid = document.createElement("div"); grid.className = "grid";
    state.folders.forEach((f,i)=>{
      const card = document.createElement("div");
      card.className = "glass-3d card folder-glow";
      card.style.setProperty("--glow", f.color || "#3B82F6");
      card.style.borderLeft = `4px solid ${f.color || "#3B82F6"}`;
      card.onclick = () => openFolder(i);
      card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="material-icons-outlined">folder</span>
            <h3>${f.name}</h3>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="icon-btn" onclick="event.stopPropagation(); editFolder(${i})"><span class="material-icons-outlined">edit</span></button>
            <button class="icon-btn danger" onclick="event.stopPropagation(); deleteFolder(${i})"><span class="material-icons-outlined">delete</span></button>
          </div>
        </div>
        <p>${f.desc || "—"}</p>
        <small>${(f.questions||[]).length} سوال</small>`;
      grid.appendChild(card);
    });
    app.appendChild(grid);
  }
}

// Add/Delete folder
function addFolder(){
  const name = prompt("نام پوشه:");
  if(!name) return;
  const desc = prompt("توضیحات:") || "";
  state.folders.push({ name, desc, color:"#3B82F6", questions:[], perPage:6, numberAlign:"right" });
  save(); renderHome();
}
function deleteFolder(i){
  if(!confirm("این پوشه حذف شود؟")) return;
  state.folders.splice(i,1); save(); renderHome();
}

// Open folder (hide floating add)
function openFolder(i){
  state.view = "folder"; state.currentFolderIndex = i;
  const f = state.folders[i];
  const app = document.getElementById("app"); app.innerHTML = "";
  document.getElementById("floatingAdd").style.display = "none";

  const header = document.createElement("div"); header.className="glass-3d card";
  header.innerHTML = `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
    <strong>عنوان:</strong><span>${f.name}</span><span class="spacer"></span>
    <button class="icon-btn" id="editFolderBtn"><span class="material-icons-outlined">settings</span></button>
    <label>تعداد سوال در هر صفحه</label><input id="perPage" type="number" min="2" max="20" value="${f.perPage||6}" />
    <label>جهت شماره‌گذاری</label>
    <select id="numberAlign">
      <option value="right" ${f.numberAlign==="right"?"selected":""}>راست</option>
      <option value="left" ${f.numberAlign==="left"?"selected":""}>چپ</option>
    </select>
    <button class="icon-btn" id="exportPDF"><span class="material-icons-outlined">picture_as_pdf</span></button>
    <button class="icon-btn" id="exportPNG"><span class="material-icons-outlined">image</span></button>
  </div>`;
  app.appendChild(header);
  document.getElementById("editFolderBtn").onclick = () => editFolder(i);
  document.getElementById("exportPDF").onclick = () => exportPDF(i);
  document.getElementById("exportPNG").onclick = () => exportPNG(i);
  document.getElementById("perPage").onchange = e => { f.perPage = +e.target.value; save(); };
  document.getElementById("numberAlign").onchange = e => { f.numberAlign = e.target.value; save(); renderQuestions(i); };

  const controls = document.createElement("div"); controls.className = "glass-3d card";
  controls.innerHTML = `<div style="display:flex; gap:8px;">
    <button class="primary" id="addTextQ"><span class="material-icons-outlined">note_add</span></button>
    <button class="primary" id="addImageQ"><span class="material-icons-outlined">add_photo_alternate</span></button>
  </div>`;
  app.appendChild(controls);
  document.getElementById("addTextQ").onclick = () => addTextQuestion(i);
  document.getElementById("addImageQ").onclick = () => openCrop(i);

  const listWrap = document.createElement("div"); listWrap.id="questions"; app.appendChild(listWrap);
  renderQuestions(i);
}

// Edit folder with modal
function editFolder(i){
  const f = state.folders[i];
  const overlay = document.createElement("div"); overlay.className="modal-overlay active";
  const panel = document.createElement("div"); panel.className="modal-panel glass-3d";
  panel.innerHTML = `
    <div class="modal-header"><h2>تنظیمات پوشه</h2>
      <button class="icon-btn" id="closeFolderSettings"><span class="material-icons-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <label>نام:</label><input id="folderName" value="${f.name}" />
      <label>توضیحات:</label><input id="folderDesc" value="${f.desc||""}" />
      <label>رنگ:</label><input id="folderColor" type="color" value="${f.color||"#3B82F6"}" />
      <div class="row-inline"><button class="primary" id="saveFolder">ذخیره</button></div>
    </div>`;
  overlay.appendChild(panel); document.body.appendChild(overlay);

  panel.querySelector("#saveFolder").onclick = () => {
    f.name = document.getElementById("folderName").value;
    f.desc = document.getElementById("folderDesc").value;
    f.color = document.getElementById("folderColor").value;
    save(); document.body.removeChild(overlay);
    (state.view==="folder" ? openFolder(i) : renderHome());
  };
  panel.querySelector("#closeFolderSettings").onclick = () => document.body.removeChild(overlay);
}
// Direction detection
function detectDirection(text){ return /[\u0600-\u06FF]/.test(text) ? "rtl" : "ltr"; }

// Render questions
function renderQuestions(folderIndex){
  const f = state.folders[folderIndex];
  const wrap = document.getElementById("questions");
  wrap.innerHTML = "";

  if(!f.questions || f.questions.length === 0){
    const empty = document.createElement("div"); empty.className = "glass-3d card empty";
    empty.innerHTML = "<p>هنوز سوالی اضافه نشده است.</p>";
    wrap.appendChild(empty);
    return;
  }

  wrap.addEventListener("dragover", e => e.preventDefault());

  f.questions.forEach((q, idx) => {
    const card = document.createElement("div");
    card.className = "glass-3d card question";
    card.draggable = true;
    card.setAttribute("dir", detectDirection(q.text || ""));
    if (q.align) card.setAttribute("align", q.align);

    // top row
    const top = document.createElement("div"); top.className = "top-row";
    const label = (q.text && q.text.trim().length) ? `${idx+1}. ${q.text}` : `${idx+1}.`;
    const strong = document.createElement("strong");
    strong.textContent = label;
    strong.style.textAlign = f.numberAlign || "right"; // راست یا چپ چین شماره سوالات
    top.appendChild(strong);

    const spacer = document.createElement("span"); spacer.className="spacer"; top.appendChild(spacer);

    const actions = document.createElement("div"); actions.className="actions";
    const editBtn = document.createElement("button"); editBtn.className="secondary"; editBtn.innerHTML=`<span class="material-icons-outlined">edit</span>`; editBtn.onclick=()=>editQuestion(folderIndex, idx);
    const delBtn = document.createElement("button"); delBtn.className="danger"; delBtn.innerHTML=`<span class="material-icons-outlined">delete</span>`; delBtn.onclick=()=>deleteQuestion(folderIndex, idx);
    const alignBtn = document.createElement("button"); alignBtn.className="secondary"; alignBtn.innerHTML=`<span class="material-icons-outlined">format_align_center</span>`;
    alignBtn.onclick=()=>{
      q.align = q.align==="center" ? "right" : q.align==="right" ? "left" : "center";
      save(); renderQuestions(folderIndex);
    };
    actions.appendChild(editBtn); actions.appendChild(delBtn); actions.appendChild(alignBtn);
    top.appendChild(actions); card.appendChild(top);

    // image
    if(q.image){
      const img = document.createElement("img"); img.className="question-img"; img.src = q.image;
      card.appendChild(img);
    }

    // options with LTR labels (a,b,c)
    if(q.options && q.options.length){
      const ul = document.createElement("ul"); ul.className="options";
      q.options.forEach((o,j)=>{
        const li = document.createElement("li");
        const labelSpan = document.createElement("span");
        labelSpan.style.direction="ltr"; labelSpan.style.unicodeBidi="isolate";
        labelSpan.style.marginInlineEnd="6px";
        labelSpan.textContent = `(${String.fromCharCode(97+j)})`;
        const textSpan = document.createElement("span"); textSpan.textContent = o;
        li.appendChild(labelSpan); li.appendChild(textSpan);
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }

    // DnD
    card.addEventListener("dragstart", e => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("index", idx);
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
      save(); renderQuestions(folderIndex);
    });

    wrap.appendChild(card);
  });
}
// Add text question (blank allowed)
function addTextQuestion(folderIndex){
  const text = prompt("متن سوال (می‌تواند خالی باشد):") || "";
  const q = { type:"text", text, options:[] };
  state.folders[folderIndex].questions.push(q);
  save(); renderQuestions(folderIndex);
  openOptionsEditor(folderIndex, state.folders[folderIndex].questions.length-1);
}

// Options editor
function openOptionsEditor(folderIndex, idx){
  const q = state.folders[folderIndex].questions[idx];
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
    </div>`;
  overlay.appendChild(panel); document.body.appendChild(overlay);

  const renderOpts = () => {
    const wrap = panel.querySelector("#optList"); wrap.innerHTML = "";
    (q.options || []).forEach((o,i)=>{
      const row = document.createElement("div"); row.className="row-inline";
      row.innerHTML = `
        <span style="direction:ltr; unicode-bidi:isolate;">(${String.fromCharCode(97+i)})</span>
        <input value="${o}" data-idx="${i}" />
        <button class="icon-btn danger" data-del="${i}"><span class="material-icons-outlined">close</span></button>`;
      wrap.appendChild(row);
    });
    wrap.querySelectorAll("input").forEach(inp=>{
      inp.onchange = e => { q.options[+e.target.dataset.idx] = e.target.value; save(); renderQuestions(folderIndex); };
    });
    wrap.querySelectorAll("[data-del]").forEach(btn=>{
      btn.onclick = e => { const i = +e.currentTarget.dataset.del; q.options.splice(i,1); save(); renderOpts(); renderQuestions(folderIndex); };
    });
  };
  renderOpts();

  panel.querySelector("#addOpt").onclick = () => { q.options.push(""); save(); renderOpts(); renderQuestions(folderIndex); };
  const close = () => { document.body.removeChild(overlay); };
  panel.querySelector("#doneOpt").onclick = close; panel.querySelector("#closeOpt").onclick = close;
}

// Edit question
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
      <div class="row-inline">
        <button class="secondary" id="editText"><span class="material-icons-outlined">edit</span> متن</button>
        <button class="secondary" id="editOptions"><span class="material-icons-outlined">list</span> گزینه‌ها</button>
        <button class="secondary" id="editImage"><span class="material-icons-outlined">image</span> تصویر جدید</button>
        <button class="secondary" id="cropImage"><span class="material-icons-outlined">crop</span> کراپ تصویر</button>
      </div>
    </div>`;
  overlay.appendChild(panel); document.body.appendChild(overlay);

  panel.querySelector("#editText").onclick = () => {
    const nt = prompt("ویرایش متن سوال (می‌تواند خالی باشد):", q.text || "");
    if (nt !== null) q.text = nt;
    save(); renderQuestions(folderIndex);
  };
  panel.querySelector("#editOptions").onclick = () => openOptionsEditor(folderIndex, idx);
  panel.querySelector("#editImage").onclick = () => {
    const input = document.createElement("input"); input.type="file"; input.accept="image/*";
    input.onchange = e => {
      const file = e.target.files[0]; if(!file) return;
      const rdr = new FileReader();
      rdr.onload = () => { q.image = rdr.result; save(); renderQuestions(folderIndex); };
      rdr.readAsDataURL(file);
    };
    input.click();
  };
  panel.querySelector("#cropImage").onclick = () => {
    if(!q.image){ alert("هیچ تصویری برای کراپ وجود ندارد."); return; }
    openCropExisting(folderIndex, idx, q.image);
  };
  const close = () => { document.body.removeChild(overlay); };
  panel.querySelector("#closeEditQ").onclick = close;
}

// Delete question
function deleteQuestion(folderIndex, idx){
  state.folders[folderIndex].questions.splice(idx, 1);
  save(); renderQuestions(folderIndex);
}
// Crop new image
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

  const input = panel.querySelector("#imageInput"); const area = panel.querySelector("#cropArea");
  input.onchange = e => {
    const file = e.target.files[0]; if(!file) return;
    const url = URL.createObjectURL(file); state.pendingImageBlobUrl = url;
    area.innerHTML = "";
    const img = document.createElement("img"); img.src = url; img.style.maxWidth = "100%";
    area.appendChild(img);
    state.cropper = new Cropper(img, { viewMode:1, dragMode:'move', autoCropArea:0.85, background:false });
  };

  panel.querySelector("#saveCropped").onclick = () => {
    if(!state.cropper) return;
    const dataUrl = state.cropper.getCroppedCanvas({ imageSmoothingQuality:'high' }).toDataURL('image/png', 1);
    state.folders[folderIndex].questions.push({ type:"image", text:"", image:dataUrl, options:[] });
    save();
    cleanupCrop(overlay);
    openFolder(folderIndex);   // 🔑 نمایش فوری سوال جدید
  };

  const close = () => cleanupCrop(overlay);
  panel.querySelector("#cancelCrop").onclick = close;
  panel.querySelector("#closeCrop").onclick = close;
}

// Crop existing image
function openCropExisting(folderIndex, idx, imageData){
  const overlay = document.createElement("div"); overlay.className="modal-overlay active";
  const panel = document.createElement("div"); panel.className="modal-panel glass-3d";
  panel.innerHTML = `
    <div class="modal-header"><h2>کراپ تصویر موجود</h2>
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

  const area = panel.querySelector("#cropArea"); area.innerHTML = "";
  const img = document.createElement("img"); img.src = imageData; img.style.maxWidth = "100%"; area.appendChild(img);
  state.cropper = new Cropper(img, { viewMode:1, dragMode:'move', autoCropArea:0.85, background:false });

  panel.querySelector("#saveCropped").onclick = () => {
    if(!state.cropper) return;
    const dataUrl = state.cropper.getCroppedCanvas({ imageSmoothingQuality:'high' }).toDataURL('image/png', 1);
    state.folders[folderIndex].questions[idx].image = dataUrl;
    save();
    cleanupCrop(overlay);
    openFolder(folderIndex);   // 🔑 نمایش فوری تصویر ویرایش‌شده
  };

  const close = () => cleanupCrop(overlay);
  panel.querySelector("#cancelCrop").onclick = close;
  panel.querySelector("#closeCrop").onclick = close;
}

// Cleanup cropper
function cleanupCrop(overlay){
  document.body.removeChild(overlay);
  if(state.cropper){ state.cropper.destroy(); state.cropper=null; }
  if(state.pendingImageBlobUrl){ URL.revokeObjectURL(state.pendingImageBlobUrl); state.pendingImageBlobUrl=null; }
}


// Build output DOM (respects alignment + empty text)
function buildOutputDOM(folder){
  const el = document.createElement("div");
  el.style.width = "794px";
  el.style.padding = "32px";
  el.style.background = "#fff";
  el.style.color = "#000";

  const h = document.createElement("h2"); h.textContent = folder.name; el.appendChild(h);

  const container = document.createElement("div");
  container.className = (folder.perPage||6) > 5 ? "exam-page two-columns" : "exam-page one-column";

  (folder.questions||[]).forEach((q,idx)=>{
    const box = document.createElement("div");
    box.style.border = "1px solid #ddd"; box.style.borderRadius = "8px";
    box.style.padding = "12px"; box.style.marginBottom = "12px"; box.style.pageBreakInside = "avoid";

    if(q.align==="center") box.style.textAlign="center";
    else if(q.align==="right") box.style.textAlign="right";
    else if(q.align==="left") box.style.textAlign="left";

    const hasText = q.text && q.text.trim().length;
    const head = document.createElement("div");
    head.textContent = hasText ? `${idx+1}. ${q.text}` : `${idx+1}.`;
    head.style.textAlign = folder.numberAlign || "right";
    box.appendChild(head);

    if(q.image){
      const img = document.createElement("img");
      img.style.maxWidth="100%"; img.style.maxHeight="220px"; img.style.objectFit="contain";
      img.src = q.image; box.appendChild(img);
    }

    if(q.options && q.options.length){
      const ul = document.createElement("ul"); ul.style.paddingLeft="0";
      q.options.forEach((o,i)=>{
        const li = document.createElement("li"); li.style.listStyle="none";
        const labelSpan = document.createElement("span");
        labelSpan.style.direction="ltr"; labelSpan.style.unicodeBidi="isolate";
        labelSpan.style.marginInlineEnd="6px";
        labelSpan.textContent = `(${String.fromCharCode(97+i)})`;
        const textSpan = document.createElement("span"); textSpan.textContent = o;
        li.appendChild(labelSpan); li.appendChild(textSpan);
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }

    const lines = document.createElement("div");
    lines.style.height = "60px"; lines.style.borderTop = "1px dashed #bbb"; lines.style.marginTop = "8px";
    box.appendChild(lines);

    container.appendChild(box);
  });

  el.appendChild(container);
  return el;
}

// Export PDF



async function exportPDF(folderIndex){
  const folder = state.folders[folderIndex];
  const { jsPDF } = window.jspdf;

  const QUESTIONS_PER_PAGE = 6; // هر صفحه حداکثر 6 سؤال
  const totalQuestions = folder.questions.length;
  const totalPages = Math.ceil(totalQuestions / QUESTIONS_PER_PAGE);

  const pageImages = [];

  for (let page = 0; page < totalPages; page++) {
    const start = page * QUESTIONS_PER_PAGE;
    const end = Math.min(start + QUESTIONS_PER_PAGE, totalQuestions);
    const slice = folder.questions.slice(start, end);

    // ساختن DOM برای یک صفحه
    const el = document.createElement("div");
    el.style.width = "794px";   // عرض A4 تقریبی در px
    el.style.height = "1123px"; // ارتفاع A4 تقریبی در px
    el.style.padding = "20px";
    el.style.background = "#fff";
    el.style.fontFamily = "Vazir, sans-serif";
    el.style.color = "#000";

    // 👇 ستون‌بندی همیشه دو ستونه
    el.style.display = "grid";
    el.style.gridTemplateColumns = "1fr 1fr";
    el.style.gap = "20px";

    slice.forEach((q, i) => {
      const block = document.createElement("div");
      block.style.border = "1px solid #ccc";
      block.style.borderRadius = "8px"; // گوشه‌های گرد
      block.style.padding = "10px";
      block.style.marginBottom = "20px";
      block.style.breakInside = "avoid";
      block.style.pageBreakInside = "avoid";

      let html = `<div><strong>${start+i+1}. ${q.text}</strong></div>`;
      if (q.options) {
        html += q.options.map((opt, idx) => `<div>${String.fromCharCode(65+idx)}. ${opt}</div>`).join("");
      }
      if (q.image) {
        html += `<img src="${q.image}" crossOrigin="anonymous" style="max-width:100%; margin-top:10px;">`;
      }

      block.innerHTML = html;
      el.appendChild(block);
    });

    document.body.appendChild(el);

    // گرفتن تصویر صفحه
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#fff"
    });

    document.body.removeChild(el);

    pageImages.push(canvas.toDataURL("image/jpeg", 0.95));
  }

  // ساخت PDF استاندارد A4
  const doc = new jsPDF("p","mm","a4");
  pageImages.forEach((img, i) => {
    if (i > 0) doc.addPage();
    doc.addImage(img, "JPEG", 0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight());
  });

  doc.save(`${folder.name}.pdf`);
}












// Export PNG
async function exportPNG(folderIndex){
  const folder = state.folders[folderIndex];
  const el = buildOutputDOM(folder);
  document.body.appendChild(el);
  const canvas = await html2canvas(el, { scale: 2 });
  document.body.removeChild(el);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${folder.name}.png`;
  a.click();
}

// Init
setTheme(state.theme);
applyBackground(state.background);
renderHome();

// Expose for inline handlers
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

function exportData(){
  save(); // ذخیره آخرین state
  const dataStr = JSON.stringify(state, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "arafiles-data.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importData(file){
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const newState = JSON.parse(e.target.result);
      state = newState;
      save();
      renderHome(); // یا openFolder(...) اگر داخل فولدر هستی
      alert("داده‌ها با موفقیت بارگذاری شدند!");
    } catch(err){
      alert("خطا در خواندن فایل JSON");
    }
  };
  reader.readAsText(file, "utf-8");
}

window.addEventListener("DOMContentLoaded", () => {
  const btnSave = document.getElementById("btnSave");
  const importInput = document.getElementById("importFile");

  if(btnSave) btnSave.onclick = exportData;
  if(importInput) importInput.onchange = e => {
    const file = e.target.files[0];
    if(file) importData(file);
  };
});
