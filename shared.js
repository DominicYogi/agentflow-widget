// ── Default data ─────────────────────────────────────
const DEFAULT_REQUESTS = [
  { id:"PA-001", member:"Chukwuemeka Obi",  memberId:"MCR-10441", hospital:"Lagos Island General", procedure:"Appendectomy",        plan:"Gold",     amount:185000, status:"pending",   date:"2026-03-09" },
  { id:"PA-002", member:"Fatima Aliyu",     memberId:"MCR-10442", hospital:"Reddington Hospital",  procedure:"MRI Scan – Brain",   plan:"Silver",   amount:95000,  status:"pending",   date:"2026-03-09" },
  { id:"PA-003", member:"Tunde Fashola",    memberId:"MCR-10443", hospital:"St. Nicholas Hospital",procedure:"Knee Arthroscopy",   plan:"Gold",     amount:320000, status:"pending",   date:"2026-03-09" },
  { id:"PA-004", member:"Ngozi Adeyemi",    memberId:"MCR-10444", hospital:"Eko Hospital",         procedure:"Ultrasound Scan",    plan:"Bronze",   amount:35000,  status:"pending",   date:"2026-03-09" },
  { id:"PA-005", member:"Biodun Sawyer",    memberId:"MCR-10445", hospital:"Lagos Island General", procedure:"Dialysis Session",   plan:"Platinum", amount:120000, status:"pending",   date:"2026-03-09" },
  { id:"PA-006", member:"Amaka Eze",        memberId:"MCR-10446", hospital:"Reddington Hospital",  procedure:"Chemotherapy Cycle", plan:"Gold",     amount:450000, status:"pending",   date:"2026-03-08" },
  { id:"PA-007", member:"Emeka Nwosu",      memberId:"MCR-10447", hospital:"LUTH",                 procedure:"Cataract Surgery",   plan:"Silver",   amount:140000, status:"pending",   date:"2026-03-08" },
  { id:"PA-008", member:"Halima Musa",      memberId:"MCR-10448", hospital:"Eko Hospital",         procedure:"Blood Panel Test",   plan:"Bronze",   amount:28000,  status:"pending",   date:"2026-03-08" },
];

const RANDOM_MEMBERS = [
  {name:"Seun Adeleke",id:"MCR-10449",plan:"Silver"},{name:"Kemi Olatunji",id:"MCR-10450",plan:"Gold"},
  {name:"Bola Tinubu",id:"MCR-10451",plan:"Bronze"},{name:"Yemi Alade",id:"MCR-10452",plan:"Platinum"},
  {name:"Ade Banwo",id:"MCR-10453",plan:"Silver"},{name:"Sola Peters",id:"MCR-10454",plan:"Gold"},
];
const RANDOM_PROCEDURES = ["Physiotherapy (5 sessions)","Chest X-Ray","ECG Test","Hernia Repair","Eye Examination","Dental Extraction","CT Scan – Abdomen","Blood Transfusion","Laparoscopy","Colonoscopy"];
const RANDOM_HOSPITALS  = ["Lagos Island General","Reddington Hospital","St. Nicholas Hospital","Eko Hospital","LUTH","Lagoon Hospital","First Cardiology Clinic"];
const RANDOM_AMOUNTS    = [22000,45000,68000,95000,130000,175000,210000,280000,360000,480000];

// ── State ────────────────────────────────────────────
let requests = [];
let auditLog = [];

const LS_KEY_REQUESTS = "af_demo_requests";
const LS_KEY_AUDIT    = "af_demo_audit";

// ── LocalStorage ─────────────────────────────────────
function loadData() {
  try {
    const r = localStorage.getItem(LS_KEY_REQUESTS);
    const a = localStorage.getItem(LS_KEY_AUDIT);
    requests = r ? JSON.parse(r) : JSON.parse(JSON.stringify(DEFAULT_REQUESTS));
    auditLog = a ? JSON.parse(a) : [];
  } catch {
    requests = JSON.parse(JSON.stringify(DEFAULT_REQUESTS));
    auditLog = [];
  }
}

function saveData() {
  localStorage.setItem(LS_KEY_REQUESTS, JSON.stringify(requests));
  localStorage.setItem(LS_KEY_AUDIT,    JSON.stringify(auditLog));
}

function resetAllData() {
  if (!confirm("Reset demo to original data?")) return;
  requests = JSON.parse(JSON.stringify(DEFAULT_REQUESTS));
  auditLog = [];
  saveData();
  if (typeof renderAll === "function") renderAll();
  toast("Demo reset to original data");
}

// ── Status actions ────────────────────────────────────
function updateStatus(requestId, newStatus) {
  const req = requests.find(r => r.id === requestId);
  if (!req || req.status !== "pending") return;

  const row = document.getElementById("row-" + requestId);
  if (row) {
    row.querySelectorAll("button").forEach(b => b.disabled = true);
    row.classList.add("row-exiting");
    setTimeout(function() {
      req.status = newStatus;
      _logAction(newStatus, req);
      saveData();
      if (typeof renderAll === "function") renderAll();
      const icons = { approved:"✅", rejected:"❌", escalated:"⚠️" };
      toast(icons[newStatus] + " " + req.member + " — " + newStatus);
    }, 380);
  } else {
    req.status = newStatus;
    _logAction(newStatus, req);
    saveData();
    if (typeof renderAll === "function") renderAll();
    const icons = { approved:"✅", rejected:"❌", escalated:"⚠️" };
    toast(icons[newStatus] + " " + req.member + " — " + newStatus);
  }
}

function _logAction(newStatus, req) {
  auditLog.unshift({
    time: new Date().toLocaleTimeString("en-NG", {hour:"2-digit",minute:"2-digit"}),
    action: newStatus.charAt(0).toUpperCase() + newStatus.slice(1),
    requestId: req.id,
    member: req.member,
    officer: "Adaeze Okonkwo"
  });
}

function highlightRow(id) {
  const row = document.getElementById("row-" + id);
  if (row) {
    row.classList.remove("ai-touched");
    void row.offsetWidth;
    row.classList.add("ai-touched");
  }
}

// ── Add random request ────────────────────────────────
function addRandomRequest() {
  const m   = RANDOM_MEMBERS[Math.floor(Math.random() * RANDOM_MEMBERS.length)];
  const num = requests.length + 1;
  requests.push({
    id: "PA-" + String(num).padStart(3,"0"),
    member: m.name, memberId: m.id,
    hospital:  RANDOM_HOSPITALS[Math.floor(Math.random() * RANDOM_HOSPITALS.length)],
    procedure: RANDOM_PROCEDURES[Math.floor(Math.random() * RANDOM_PROCEDURES.length)],
    plan:   m.plan,
    amount: RANDOM_AMOUNTS[Math.floor(Math.random() * RANDOM_AMOUNTS.length)],
    status: "pending",
    date:   new Date().toISOString().split("T")[0]
  });
  saveData();
  if (typeof renderAll === "function") renderAll();
  toast("New request added");
}

// ── Nav badges ────────────────────────────────────────
function updateNavBadges() {
  const n = requests.filter(r => r.status === "pending").length;
  const el = document.getElementById("nav-pending-count");
  if (el) el.textContent = n;
  const al = document.getElementById("nav-audit-count");
  if (al) al.textContent = auditLog.length;
}

// ── Utilities ─────────────────────────────────────────
function formatAmount(n) {
  if (n >= 1000000) return "₦" + (n / 1000000).toFixed(1) + "M";
  if (n >= 1000)    return "₦" + (n / 1000).toFixed(0)    + "k";
  return "₦" + n.toLocaleString();
}

function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2500);
}