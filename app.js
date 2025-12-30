// Categories + amounts (SGD)
const DEFAULT_CATS = [
  { key:"wk_full",  name:"Weekday full call",             amount:300, color:"#22c55e" },
  { key:"weph_full",name:"Weekend/PH full call",          amount:480, color:"#60a5fa" },
  { key:"work_ph",  name:"Work on public holiday",        amount:250, color:"#f59e0b" },
  { key:"we_round", name:"Weekend rounds",                amount:240, color:"#a78bfa" },
  { key:"wk_half",  name:"Weekday half call",             amount:150, color:"#34d399" },
  { key:"we_half",  name:"Weekend half call",             amount:240, color:"#fb7185" },
];

function pad2(n){ return String(n).padStart(2,"0"); }
function ymd(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function ym(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }
function money(n){ return `$${Number(n).toLocaleString("en-SG")}`; }

const state = {
  cats: DEFAULT_CATS,
  view: "Calendar",
  cursor: new Date(), // current month being shown
  selectedCatKey: DEFAULT_CATS[0].key,
  sheetDateKey: null,
  longPressTimer: null
};

// --- Tabs routing ---
const views = {
  Calendar: document.getElementById("viewCalendar"),
  Add: document.getElementById("viewAdd"),
  Stats: document.getElementById("viewStats"),
  Settings: document.getElementById("viewSettings"),
};

const topTitle = document.getElementById("topTitle");
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    switchView(btn.dataset.view);
  });
});

function switchView(name){
  state.view = name;
  Object.entries(views).forEach(([k,el])=>{
    el.classList.toggle("view--active", k===name);
  });
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("tab--active", t.dataset.view===name));
  topTitle.textContent = name;
  if(name==="Stats") renderStats();
}

// --- Service worker ---
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}

// --- Calendar ---
const monthLabel = document.getElementById("monthLabel");
const calendarGrid = document.getElementById("calendarGrid");
document.getElementById("prevMonth").addEventListener("click", ()=>{ state.cursor.setMonth(state.cursor.getMonth()-1); renderCalendar(); });
document.getElementById("nextMonth").addEventListener("click", ()=>{ state.cursor.setMonth(state.cursor.getMonth()+1); renderCalendar(); });
document.getElementById("todayBtn").addEventListener("click", ()=>{ state.cursor = new Date(); renderCalendar(); });

function monthName(d){
  return d.toLocaleString("en-SG",{month:"long", year:"numeric"});
}
function mondayIndex(jsDay){ // JS: 0 Sun..6 Sat -> 0 Mon..6 Sun
  return (jsDay + 6) % 7;
}

async function renderCalendar(){
  const d = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
  const monthKey = ym(d);
  monthLabel.textContent = monthName(d);

  // get claims for month
  const claims = await DB.listClaimsByMonth(monthKey);
  const byDate = {};
  for(const c of claims){
    if(!byDate[c.dateKey]) byDate[c.dateKey] = [];
    byDate[c.dateKey].push(c);
  }
  const tags = await DB.listDayTagsForMonth(monthKey);

  const firstDow = mondayIndex(d.getDay());
  const daysInMonth = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();

  // previous month filler
  const prevMonthDays = firstDow;
  const prevMonthLast = new Date(d.getFullYear(), d.getMonth(), 0).getDate();

  const cells = [];
  for(let i=prevMonthDays; i>0; i--){
    const dayNum = prevMonthLast - i + 1;
    const dateObj = new Date(d.getFullYear(), d.getMonth()-1, dayNum);
    cells.push({date: dateObj, inMonth:false});
  }
  for(let day=1; day<=daysInMonth; day++){
    cells.push({date: new Date(d.getFullYear(), d.getMonth(), day), inMonth:true});
  }
  while(cells.length % 7 !== 0) {
    const last = cells[cells.length-1].date;
    cells.push({date: new Date(last.getFullYear(), last.getMonth(), last.getDate()+1), inMonth:false});
  }

  calendarGrid.innerHTML = "";
  const todayKey = ymd(new Date());

  for(const cell of cells){
    const dateKey = ymd(cell.date);
    const dayEl = document.createElement("button");
    dayEl.className = "day" + (cell.inMonth ? "" : " day--muted") + (dateKey===todayKey ? " day--today" : "");
    dayEl.type = "button";

    const num = document.createElement("div");
    num.className = "daynum";
    num.textContent = cell.date.getDate();
    dayEl.appendChild(num);

    const tag = tags[dateKey] || "";
    if(tag){
      const tagEl = document.createElement("div");
      tagEl.className = "daytag";
      tagEl.textContent = tag;
      dayEl.appendChild(tagEl);
    }

    const dots = document.createElement("div");
    dots.className = "dots";
    const dayClaims = byDate[dateKey] || [];
    // show up to 8 dots
    for(const c of dayClaims.slice(0,8)){
      const cat = state.cats.find(x=>x.key===c.catKey);
      const dot = document.createElement("div");
      dot.className = "dot";
      dot.style.background = cat ? cat.color : "#94a3b8";
      dots.appendChild(dot);
    }
    dayEl.appendChild(dots);

    // tap: open sheet
    dayEl.addEventListener("click", ()=> openSheet(dateKey));

    // long-press: tag day
    dayEl.addEventListener("touchstart", (e)=>{
      state.longPressTimer = setTimeout(()=>{ openTagPrompt(dateKey); }, 450);
    }, {passive:true});
    dayEl.addEventListener("touchend", ()=> clearTimeout(state.longPressTimer));
    dayEl.addEventListener("touchmove", ()=> clearTimeout(state.longPressTimer));

    calendarGrid.appendChild(dayEl);
  }
}

renderCalendar();

// --- Add view ---
const addDate = document.getElementById("addDate");
const addQty = document.getElementById("addQty");
const addNote = document.getElementById("addNote");
const saveHint = document.getElementById("saveHint");

addDate.value = ymd(new Date());

document.getElementById("qtyMinus").addEventListener("click", ()=>{
  addQty.value = Math.max(1, (Number(addQty.value)||1) - 1);
});
document.getElementById("qtyPlus").addEventListener("click", ()=>{
  addQty.value = (Number(addQty.value)||1) + 1;
});

const catButtons = document.getElementById("catButtons");
function renderCatButtons(){
  catButtons.innerHTML = "";
  for(const cat of state.cats){
    const b = document.createElement("button");
    b.className = "catbtn" + (cat.key===state.selectedCatKey ? " catbtn--active" : "");
    b.type = "button";
    b.innerHTML = `
      <div class="catbtn__left">
        <span class="swatch" style="background:${cat.color}"></span>
        <span>${cat.name}</span>
      </div>
      <div>${money(cat.amount)}</div>
    `;
    b.addEventListener("click", ()=>{
      state.selectedCatKey = cat.key;
      renderCatButtons();
    });
    catButtons.appendChild(b);
  }
}
renderCatButtons();

document.getElementById("saveClaim").addEventListener("click", async ()=>{
  const dateKey = addDate.value;
  if(!dateKey){ saveHint.textContent = "Pick a date."; return; }
  const catKey = state.selectedCatKey;
  const qty = Math.max(1, Number(addQty.value)||1);
  const note = (addNote.value||"").trim();
  const cat = state.cats.find(c=>c.key===catKey);
  const monthKey = dateKey.slice(0,7);

  const claim = {
    id: crypto.randomUUID(),
    dateKey,
    monthKey,
    catKey,
    qty,
    amountEach: cat.amount,
    note,
    createdAt: Date.now()
  };

  await DB.putClaim(claim);

  saveHint.textContent = "Saved ✓";
  setTimeout(()=> saveHint.textContent="", 900);

  // keep date, reset qty/note for fast repeated entries
  addQty.value = 1;
  addNote.value = "";

  // refresh calendar if same month visible
  if(ym(state.cursor) === monthKey) renderCalendar();
});

// --- Sheet (day detail) ---
const sheetBack = document.getElementById("sheetBack");
const sheetTitle = document.getElementById("sheetTitle");
const sheetTag = document.getElementById("sheetTag");
const claimsList = document.getElementById("claimsList");
document.getElementById("closeSheet").addEventListener("click", closeSheet);
sheetBack.addEventListener("click",(e)=>{ if(e.target===sheetBack) closeSheet(); });

document.getElementById("addFromSheet").addEventListener("click", ()=>{
  // jump to Add view with date prefilled
  addDate.value = state.sheetDateKey;
  closeSheet();
  switchView("Add");
});

document.getElementById("tagBtn").addEventListener("click", ()=> openTagPrompt(state.sheetDateKey));

async function openSheet(dateKey){
  state.sheetDateKey = dateKey;
  sheetBack.classList.add("sheetback--show");
  const dateObj = new Date(dateKey+"T00:00:00");
  sheetTitle.textContent = dateObj.toLocaleDateString("en-SG",{weekday:"short", day:"2-digit", month:"short", year:"numeric"});
  const tag = await DB.getDayTag(dateKey);
  sheetTag.textContent = tag ? `Tag: ${tag}` : "Tag: —";
  await renderClaimsList(dateKey);
}

function closeSheet(){
  sheetBack.classList.remove("sheetback--show");
  state.sheetDateKey = null;
}

async function renderClaimsList(dateKey){
  const claims = await DB.listClaimsByDate(dateKey);
  claims.sort((a,b)=> b.createdAt - a.createdAt);

  if(claims.length===0){
    claimsList.innerHTML = `<div class="muted">No claims for this date.</div>`;
    return;
  }

  claimsList.innerHTML = "";
  for(const c of claims){
    const cat = state.cats.find(x=>x.key===c.catKey);
    const total = c.qty * c.amountEach;

    const el = document.createElement("div");
    el.className = "claim";
    el.innerHTML = `
      <div class="claim__top">
        <div class="claim__name">
          <span class="swatch" style="background:${cat.color};display:inline-block;vertical-align:middle;margin-right:8px;"></span>
          ${cat.name}
        </div>
        <div style="font-weight:900">${money(total)}</div>
      </div>
      <div class="claim__meta">Qty: ${c.qty} × ${money(c.amountEach)} ${c.note ? " • "+escapeHtml(c.note) : ""}</div>
      <div class="claim__actions">
        <button class="pill" data-del="${c.id}">Delete</button>
      </div>
    `;
    el.querySelector("[data-del]").addEventListener("click", async ()=>{
      await DB.deleteClaim(c.id);
      await renderClaimsList(dateKey);
      renderCalendar();
    });
    claimsList.appendChild(el);
  }
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Tag prompt
async function openTagPrompt(dateKey){
  const current = await DB.getDayTag(dateKey);
  const val = prompt(
    `Tag this day (for your own reference only).\nType one: Weekday / Weekend / PH / (blank to clear)\n\nCurrent: ${current || "—"}`,
    current || ""
  );
  if(val===null) return; // cancelled
  const trimmed = val.trim();
  const tag = trimmed ? trimmed : "";
  await DB.setDayTag(dateKey, tag);
  if(state.sheetDateKey===dateKey){
    sheetTag.textContent = tag ? `Tag: ${tag}` : "Tag: —";
  }
  renderCalendar();
}

// --- Stats ---
const statsMonth = document.getElementById("statsMonth");
const statsTitle = document.getElementById("statsTitle");
const totalMonth = document.getElementById("totalMonth");
const barAmount = document.getElementById("barAmount");
const barCount = document.getElementById("barCount");
const statsTable = document.getElementById("statsTable");

function buildMonthOptions(){
  const now = new Date();
  const opts = [];
  for(let i=0;i<18;i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    opts.push({key: ym(d), label: d.toLocaleString("en-SG",{month:"long", year:"numeric"})});
  }
  statsMonth.innerHTML = opts.map(o=>`<option value="${o.key}">${o.label}</option>`).join("");
  statsMonth.value = ym(new Date());
}
buildMonthOptions();

statsMonth.addEventListener("change", ()=> renderStats());

async function renderStats(){
  const monthKey = statsMonth.value;
  statsTitle.textContent = `Stats — ${monthKey}`;
  const claims = await DB.listClaimsByMonth(monthKey);

  // aggregate
  const byCat = {};
  for(const cat of state.cats){
    byCat[cat.key] = { cat, count:0, amount:0 };
  }
  for(const c of claims){
    byCat[c.catKey].count += c.qty;
    byCat[c.catKey].amount += c.qty * c.amountEach;
  }

  const totals = Object.values(byCat);
  const totalAmt = totals.reduce((s,x)=> s+x.amount, 0);
  totalMonth.textContent = money(totalAmt);

  // bars
  const maxAmt = Math.max(1, ...totals.map(x=>x.amount));
  const maxCount = Math.max(1, ...totals.map(x=>x.count));

  barAmount.innerHTML = totals.map(x=>{
    const pct = Math.round((x.amount/maxAmt)*100);
    return `
      <div class="bar">
        <div class="bar__top"><span>${x.cat.name}</span><span>${money(x.amount)}</span></div>
        <div class="bar__track"><div class="bar__fill" style="width:${pct}%;background:${x.cat.color}"></div></div>
      </div>
    `;
  }).join("");

  barCount.innerHTML = totals.map(x=>{
    const pct = Math.round((x.count/maxCount)*100);
    return `
      <div class="bar">
        <div class="bar__top"><span>${x.cat.name}</span><span>${x.count}</span></div>
        <div class="bar__track"><div class="bar__fill" style="width:${pct}%;background:${x.cat.color}"></div></div>
      </div>
    `;
  }).join("");

  // table
  statsTable.innerHTML = totals.map(x=>`
    <div class="tableRow">
      <div>${x.cat.name}</div>
      <div style="text-align:right">
        <div style="font-weight:900">${money(x.amount)}</div>
        <div class="muted">${x.count} claim(s)</div>
      </div>
    </div>
  `).join("");
}

// --- Settings: export/import/wipe ---
document.getElementById("exportBtn").addEventListener("click", async ()=>{
  const claims = await DB.listAllClaims();
  const tags = await DB.listDayTagsForMonth(""); // not used; we’ll export all tags by cursor
  // export all tags by scanning store (simple approach: open cursor)
  const db = await openDB();
  const allTags = await new Promise((resolve, reject)=>{
    const t=db.transaction("dayTags","readonly");
    const s=t.objectStore("dayTags");
    const out=[];
    const r=s.openCursor();
    r.onsuccess=()=>{ const cur=r.result; if(!cur) return resolve(out); out.push(cur.value); cur.continue(); };
    r.onerror=()=>reject(r.error);
  });

  const payload = { version:1, exportedAt: new Date().toISOString(), cats: state.cats, claims, dayTags: allTags };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `allowance-tracker-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("importFile").addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  const text = await file.text();
  let payload;
  try { payload = JSON.parse(text); } catch { alert("Invalid file."); return; }

  if(!payload || !Array.isArray(payload.claims)){ alert("Invalid format."); return; }

  // wipe then import
  if(!confirm("This will replace your current data on this device. Continue?")) return;
  await DB.wipeAll();

  // restore cats (optional)
  if(Array.isArray(payload.cats) && payload.cats.length){
    state.cats = payload.cats;
    renderCatButtons();
  }

  for(const c of payload.claims){
    // keep IDs if present, else generate
    c.id = c.id || crypto.randomUUID();
    await DB.putClaim(c);
  }
  if(Array.isArray(payload.dayTags)){
    for(const t of payload.dayTags){
      if(t.dateKey) await DB.setDayTag(t.dateKey, t.tag || "");
    }
  }

  alert("Imported.");
  renderCalendar();
  renderStats();
  e.target.value = "";
});

document.getElementById("wipeBtn").addEventListener("click", async ()=>{
  if(!confirm("Wipe ALL data on this device? This cannot be undone.")) return;
  await DB.wipeAll();
  alert("Wiped.");
  renderCalendar();
  renderStats();
});
