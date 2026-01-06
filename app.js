// Physio Tracker PWA (local-only storage)
// Data is saved in localStorage on this device.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const STORAGE_KEY = "physio_tracker_v1";

const todayISO = () => new Date().toISOString().slice(0,10);
const fmtDate = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday:"long", year:"numeric", month:"short", day:"numeric" });
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

const defaultState = () => ({
  settings: { name: "", reminder: "off" },
  exercises: [
    { id: uid(), name: "Heel slides", sets: 2, reps: 10, instructions: "Lie down, slowly slide heel toward you, then return. Keep it smooth.", video: "" },
    { id: uid(), name: "Quad sets", sets: 3, reps: 10, instructions: "Tighten thigh muscle, press knee down gently, hold 5 seconds, relax.", video: "" },
    { id: uid(), name: "Glute bridge", sets: 3, reps: 10, instructions: "Feet on floor, lift hips, squeeze glutes, lower with control.", video: "" }
  ],
  sessions: {
    // "YYYY-MM-DD": { completed: boolean, skipped: boolean, skippedReason: string, doneExerciseIds: [] }
  },
  checkins: [
    // { date:"YYYY-MM-DD", pain:0..10, stiffness:0..10, swelling:"none|mild|moderate|severe", sleep: number, notes:"" }
  ]
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // basic upgrade safety
    if (!parsed.settings) parsed.settings = { name:"", reminder:"off" };
    if (!Array.isArray(parsed.exercises)) parsed.exercises = [];
    if (!parsed.sessions) parsed.sessions = {};
    if (!Array.isArray(parsed.checkins)) parsed.checkins = [];
    return parsed;
  } catch {
    return defaultState();
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function ensureTodaySession() {
  const t = todayISO();
  if (!state.sessions[t]) {
    state.sessions[t] = { completed:false, skipped:false, skippedReason:"", doneExerciseIds: [] };
    save();
  }
  return state.sessions[t];
}

function setSubtitle() {
  const name = (state.settings.name || "").trim();
  $("#subtitle").textContent = name ? `Hi ${name} — you’ve got this.` : "Your rehab, simplified.";
}

function switchTab(tabName) {
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tabName));
  $$(".panel").forEach(p => p.classList.remove("active"));
  $("#tab-" + tabName).classList.add("active");

  // refresh views
  if (tabName === "home") renderToday();
  if (tabName === "plan") renderPlan();
  if (tabName === "checkin") renderCheckin();
  if (tabName === "progress") renderProgress();
  if (tabName === "settings") renderSettings();
}

function renderToday() {
  const t = todayISO();
  $("#todayDate").textContent = fmtDate(t);
  const session = ensureTodaySession();

  // status pill
  let status = "Not started";
  if (session.skipped) status = "Skipped";
  else if (session.completed) status = "Done";
  else if ((session.doneExerciseIds || []).length) status = "In progress";
  $("#todayStatus").textContent = status;

  const list = $("#todayList");
  list.innerHTML = "";

  state.exercises.forEach(ex => {
    const done = session.doneExerciseIds.includes(ex.id);
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="itemLeft">
        <input class="chk" type="checkbox" ${done ? "checked" : ""} aria-label="done"/>
        <div>
          <div class="itemTitle">${escapeHtml(ex.name)}</div>
          <div class="itemMeta">${ex.sets} sets × ${ex.reps} reps/sec</div>
          ${ex.video ? `<div class="itemMeta"><a href="${escapeAttr(ex.video)}" target="_blank" rel="noopener">Video</a></div>` : ""}
        </div>
      </div>
      <div class="itemRight">
        <button class="iconBtn" data-edit="${ex.id}">Edit</button>
      </div>
    `;
    el.querySelector(".chk").addEventListener("change", (e) => {
      if (e.target.checked) {
        if (!session.doneExerciseIds.includes(ex.id)) session.doneExerciseIds.push(ex.id);
      } else {
        session.doneExerciseIds = session.doneExerciseIds.filter(id => id !== ex.id);
      }
      // auto unskip if they start doing it
      session.skipped = false;
      session.skippedReason = "";
      // auto mark done if all checked
      session.completed = session.doneExerciseIds.length === state.exercises.length && state.exercises.length > 0;
      state.sessions[t] = session;
      save();
      renderToday();
    });

    el.querySelector("[data-edit]").addEventListener("click", () => openExerciseModal(ex.id));
    list.appendChild(el);
  });

  $("#btnCompleteToday").disabled = session.completed || session.skipped;
  $("#btnSkipToday").disabled = session.completed || session.skipped;

  $("#btnCompleteToday").onclick = () => {
    session.completed = true;
    session.skipped = false;
    session.doneExerciseIds = state.exercises.map(e => e.id);
    state.sessions[t] = session;
    save();
    renderToday();
  };

  $("#btnSkipToday").onclick = () => {
    const reason = prompt("What’s the reason today? (optional)", session.skippedReason || "");
    session.skipped = true;
    session.skippedReason = reason || "";
    session.completed = false;
    session.doneExerciseIds = [];
    state.sessions[t] = session;
    save();
    renderToday();
  };
}

function renderPlan() {
  const list = $("#planList");
  list.innerHTML = "";

  state.exercises.forEach(ex => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="itemLeft">
        <div>
          <div class="itemTitle">${escapeHtml(ex.name)}</div>
          <div class="itemMeta">${ex.sets} sets × ${ex.reps} reps/sec</div>
          <div class="itemMeta">${ex.instructions ? escapeHtml(shorten(ex.instructions, 90)) : "No instructions yet."}</div>
        </div>
      </div>
      <div class="itemRight">
        <button class="iconBtn" data-edit="${ex.id}">Edit</button>
      </div>
    `;
    el.querySelector("[data-edit]").addEventListener("click", () => openExerciseModal(ex.id));
    list.appendChild(el);
  });

  if (state.exercises.length === 0) {
    const empty = document.createElement("div");
    empty.className = "notice";
    empty.innerHTML = "No exercises yet. Tap <strong>+ Add</strong> to create your rehab plan.";
    list.appendChild(empty);
  }

  $("#btnAddExercise").onclick = () => openExerciseModal(null);
}

function renderCheckin() {
  const t = todayISO();
  const existing = state.checkins.find(c => c.date === t);

  $("#painRange").value = existing ? existing.pain : 0;
  $("#stiffRange").value = existing ? existing.stiffness : 0;
  $("#swellingSel").value = existing ? existing.swelling : "none";
  $("#sleepNum").value = existing ? existing.sleep : 0;
  $("#notesTxt").value = existing ? existing.notes : "";

  $("#painVal").textContent = $("#painRange").value;
  $("#stiffVal").textContent = $("#stiffRange").value;

  $("#checkinPill").textContent = existing ? "Saved" : "Not saved";
  $("#lastCheckinText").textContent = existing ? `Saved for ${fmtDate(t)}.` : "";

  $("#painRange").oninput = () => $("#painVal").textContent = $("#painRange").value;
  $("#stiffRange").oninput = () => $("#stiffVal").textContent = $("#stiffRange").value;

  $("#btnSaveCheckin").onclick = () => {
    const entry = {
      date: t,
      pain: Number($("#painRange").value),
      stiffness: Number($("#stiffRange").value),
      swelling: $("#swellingSel").value,
      sleep: Number($("#sleepNum").value || 0),
      notes: ($("#notesTxt").value || "").trim()
    };

    state.checkins = state.checkins.filter(c => c.date !== t);
    state.checkins.push(entry);
    state.checkins.sort((a,b) => a.date.localeCompare(b.date));
    save();
    renderCheckin();
  };

  $("#btnClearCheckin").onclick = () => {
    if (!confirm("Clear today’s check-in?")) return;
    state.checkins = state.checkins.filter(c => c.date !== t);
    save();
    renderCheckin();
  };
}

function renderProgress() {
  const now = new Date();
  const days = [...Array(14)].map((_,i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0,10);
  });

  // adherence: completed sessions / (days where plan exists)
  const completedCount = days.filter(d => state.sessions[d]?.completed).length;
  const totalDays = days.length;
  const adherence = Math.round((completedCount / totalDays) * 100);

  $("#adherencePill").textContent = `${adherence}% adherence`;
  $("#done14").textContent = String(completedCount);

  // streak: consecutive completed ending today
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (state.sessions[d]?.completed) streak++;
    else break;
  }
  $("#streakVal").textContent = String(streak);

  // last pain
  const last = [...state.checkins].sort((a,b) => b.date.localeCompare(a.date))[0];
  $("#lastPain").textContent = last ? `${last.pain}/10` : "—";

  // pain chart
  const painPoints = days.map(d => {
    const c = state.checkins.find(x => x.date === d);
    return c ? c.pain : null;
  });
  drawSimpleChart($("#painChart"), painPoints);

  // check-in list (last 7)
  const last7 = [...state.checkins].sort((a,b) => b.date.localeCompare(a.date)).slice(0,7);
  const list = $("#checkinList");
  list.innerHTML = "";
  if (!last7.length) {
    const empty = document.createElement("div");
    empty.className = "notice";
    empty.textContent = "No check-ins yet. Save a daily check-in to see progress here.";
    list.appendChild(empty);
  } else {
    last7.forEach(c => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="itemLeft">
          <div>
            <div class="itemTitle">${escapeHtml(fmtDate(c.date))}</div>
            <div class="itemMeta">Pain ${c.pain}/10 • Stiffness ${c.stiffness}/10 • Swelling: ${escapeHtml(c.swelling)}</div>
            ${c.notes ? `<div class="itemMeta">${escapeHtml(shorten(c.notes, 120))}</div>` : ""}
          </div>
        </div>
      `;
      list.appendChild(el);
    });
  }
}

function renderSettings() {
  $("#nameTxt").value = state.settings.name || "";
  $("#reminderSel").value = state.settings.reminder || "off";
  $("#nameTxt").oninput = () => {
    state.settings.name = $("#nameTxt").value;
    save(); setSubtitle();
  };
  $("#reminderSel").onchange = () => {
    state.settings.reminder = $("#reminderSel").value;
    save();
  };
}

function openExerciseModal(idOrNull) {
  const modal = $("#exerciseModal");
  const isNew = !idOrNull;
  const ex = isNew ? { id: uid(), name:"", sets:3, reps:10, instructions:"", video:"" }
                   : state.exercises.find(e => e.id === idOrNull);

  $("#modalTitle").textContent = isNew ? "Add exercise" : "Edit exercise";
  $("#exId").value = ex.id;
  $("#exName").value = ex.name || "";
  $("#exSets").value = ex.sets ?? 3;
  $("#exReps").value = ex.reps ?? 10;
  $("#exInst").value = ex.instructions || "";
  $("#exVideo").value = ex.video || "";

  const delBtn = $("#btnDeleteExercise");
  delBtn.style.display = isNew ? "none" : "inline-flex";
  delBtn.onclick = () => {
    if (!confirm("Delete this exercise?")) return;
    state.exercises = state.exercises.filter(e => e.id !== ex.id);

    // remove from session done lists
    Object.keys(state.sessions).forEach(d => {
      const s = state.sessions[d];
      s.doneExerciseIds = (s.doneExerciseIds || []).filter(x => x !== ex.id);
      // recompute completion if needed
      if (s.completed) {
        s.completed = s.doneExerciseIds.length === state.exercises.length && state.exercises.length > 0;
      }
    });

    save();
    modal.close();
    renderPlan();
    renderToday();
  };

  $("#btnSaveExercise").onclick = (evt) => {
    evt.preventDefault();

    const updated = {
      id: $("#exId").value,
      name: ($("#exName").value || "").trim(),
      sets: Number($("#exSets").value),
      reps: Number($("#exReps").value),
      instructions: ($("#exInst").value || "").trim(),
      video: ($("#exVideo").value || "").trim()
    };

    if (!updated.name) return;

    const existingIdx = state.exercises.findIndex(e => e.id === updated.id);
    if (existingIdx >= 0) state.exercises[existingIdx] = updated;
    else state.exercises.push(updated);

    save();
    modal.close();
    renderPlan();
    renderToday();
  };

  modal.showModal();
}

function escapeHtml(str) {
  return (str ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
function escapeAttr(str){ return escapeHtml(str).replace(/"/g, "&quot;"); }
function shorten(s, n){ return s.length > n ? s.slice(0,n-1) + "…" : s; }

function drawSimpleChart(canvas, points) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  // background grid
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1;
  for (let i=0;i<=10;i+=2){
    const y = h - (i/10)*h;
    ctx.beginPath();
    ctx.moveTo(0,y);
    ctx.lineTo(w,y);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // plot
  const valid = points.map((p,i)=>({p,i})).filter(x=>x.p!==null);
  if (!valid.length) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "14px system-ui";
    ctx.fillText("No pain data yet.", 12, 26);
    return;
  }

  const stepX = w / (points.length - 1);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(14,165,233,0.9)";
  ctx.beginPath();

  let started = false;
  points.forEach((p,i) => {
    if (p === null) return;
    const x = i * stepX;
    const y = h - (p/10)*h;
    if (!started) { ctx.moveTo(x,y); started = true; }
    else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // dots
  ctx.fillStyle = "rgba(230,237,247,0.95)";
  points.forEach((p,i) => {
    if (p === null) return;
    const x = i * stepX;
    const y = h - (p/10)*h;
    ctx.beginPath();
    ctx.arc(x,y,4,0,Math.PI*2);
    ctx.fill();
  });
}

// tabs
$$(".tab").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

$("#btnReset").addEventListener("click", () => {
  if (!confirm("Reset ALL data on this device?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  save();
  setSubtitle();
  switchTab("home");
});

// exercise modal open from plan tab
$("#btnAddExercise").addEventListener("click", () => openExerciseModal(null));

// service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}

// init
setSubtitle();
switchTab("home");
