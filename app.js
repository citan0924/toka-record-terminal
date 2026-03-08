
function renderBar(v){
  const total = 10;
  const filled = Math.max(0, Math.min(total, Math.round(v / 10)));
  const empty = total - filled;
  const percent = String(v).padStart(3, " ");
  return "█".repeat(filled) + "░".repeat(empty) + " " + percent + "%";
}

const STORAGE_KEY = "toka_super_complete_state_v1";

const DEFAULT_STATE = {
  day: 1,
  org: 50,
  cog: 0,
  risk: 10,
  worldShift: 0,
  logs: [],
  operatorLabel: "OPERATOR",
  operatorId: "ID_7702"
};

let state = loadState();
let currentScenario = null;
let fixedSet = new Set();
let currentTarget = null;
let totalTargets = 0;

const el = {
  sysDate: document.getElementById("sys-date"),
  sysDay: document.getElementById("sys-day"),
  operatorLabel: document.getElementById("operator-label"),
  operatorId: document.getElementById("operator-id"),
  fileId: document.getElementById("file-id"),
  guideline: document.getElementById("guideline-text"),
  report: document.getElementById("report-container"),
  statusOrg: document.getElementById("status-org"),
  statusCog: document.getElementById("status-cog"),
  statusRisk: document.getElementById("status-risk"),
  choices: document.getElementById("choices-container"),
  log: document.getElementById("log-container"),
  systemMiniLog: document.getElementById("system-mini-log"),
  stamp: document.getElementById("stamp-btn"),
  reset: document.getElementById("reset-btn"),
  footerStatus: document.getElementById("doc-footer-status"),
  modalOverlay: document.getElementById("modal-overlay"),
  modalTitle: document.getElementById("modal-title"),
  modalBody: document.getElementById("modal-body"),
  modalClose: document.getElementById("modal-close-btn")
};

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  }catch{
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function resetState(){
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(DEFAULT_STATE);
  fixedSet = new Set();
  currentTarget = null;
  
}

function init(){
  updateHeader();
  updateStatus();
  updateLog();
  updateSystemMiniLog();
  document.body.classList.toggle("distorted", state.cog >= 8);

  if(state.day > SCENARIOS.length){
    renderEnding();
    return;
  }

  currentScenario = SCENARIOS[state.day - 1];
  renderMailModal(currentScenario);
}

function updateHeader(){
  el.sysDate.textContent = GAME_DATE;
  el.sysDay.textContent = String(state.day);
  el.operatorLabel.textContent = state.operatorLabel;
  el.operatorId.textContent = state.operatorId;
}

function updateStatus(){
  el.statusOrg.textContent = renderBar(state.org);
  el.statusCog.textContent = renderBar(state.cog);
  el.statusRisk.textContent = renderBar(state.risk);
}

function updateSystemMiniLog(){
  let permission = "INTERNAL";
  if(state.worldShift >= 2) permission = "INTERNAL / RESTRICTED";
  if(state.worldShift >= 4) permission = "RESTRICTED";
  let archive = state.worldShift >= 3 ? "ARCHIVE_CONNECTION : UNSTABLE" : "ARCHIVE_CONNECTION : OK";
  let operatorLine = state.day >= 5 ? "IDENTITY_CHECK : PENDING" : "IDENTITY_CHECK : CLEAR";

  el.systemMiniLog.innerHTML = [
    archive,
    "DATABASE : ACTIVE",
    "PERMISSION : " + permission,
    operatorLine
  ].join("<br>");
}

function renderMailModal(scenario){
  showModal(
    "INBOX: " + scenario.mailTitle,
    "From: 佐伯課長\nDate: " + GAME_DATE + "\n------------------------------\n" + scenario.mailBody,
    () => renderScenario(scenario)
  );
}

function renderScenario(scenario){
  fixedSet = new Set();
  currentTarget = null;
  el.footerStatus.textContent = "";
  el.fileId.textContent = scenario.id;
  el.guideline.textContent = scenario.guideline;
  el.choices.innerHTML = '<div class="hint">修正対象をクリックしてください。</div>';
  el.stamp.disabled = true;

  const html = scenario.sections.map(section => {
    return `
      <section class="report-section">
        <span class="report-section-title">[${section.title}]</span>
        <p>${section.text(state.worldShift, state)}</p>
      </section>
    `;
  }).join("");

  el.report.innerHTML = html;

  const censorNodes = document.querySelectorAll(".censor");
  totalTargets = censorNodes.length;

  censorNodes.forEach(node => {
    node.addEventListener("click", () => selectTarget(node, scenario));
  });
}

function selectTarget(node, scenario){
  if(node.classList.contains("fixed")) return;

  document.querySelectorAll(".censor").forEach(n => n.classList.remove("selected"));
  node.classList.add("selected");
  currentTarget = node;

  const q = node.dataset.q;
  const choices = scenario.choices[q] || [];
  el.choices.innerHTML = "";

  choices.forEach(choice => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice";
    btn.textContent = choice.text;
    btn.onclick = () => applyChoice(node, q, choice);
    el.choices.appendChild(btn);
  });
}

function applyChoice(node, q, choice){
  if(fixedSet.has(q)) return;

  fixedSet.add(q);
  state.org = clamp(state.org + choice.org, 0, 99);
  state.cog = clamp(state.cog + choice.cog, 0, 99);
  state.risk = clamp(state.risk + choice.risk, 0, 99);
  state.worldShift += choice.shift;

  const original = node.textContent;
  const replacement = document.createElement("span");
  replacement.className = "fixed flash";
  replacement.innerHTML = `<s>${escapeHtml(original)}</s> ${escapeHtml(choice.text)}`;
  node.replaceWith(replacement);

  state.logs.push({
    day: state.day,
    q,
    text: choice.text
  });

  updateStatus();
  updateLog();
  updateSystemMiniLog();
  document.body.classList.toggle("distorted", state.cog >= 8);

  if(fixedSet.size === totalTargets){
    el.stamp.disabled = false;
    el.choices.innerHTML = '<div class="hint">すべての修正が完了しました。受理できます。</div>';
  }else{
    el.choices.innerHTML = '<div class="hint">次の修正対象をクリックしてください。</div>';
  }

  saveState();
}

function updateLog(){
  if(state.logs.length === 0){
    el.log.innerHTML = '<div class="hint">まだ修正はありません。</div>';
    return;
  }

  const recent = state.logs.slice(-8);
  el.log.innerHTML = "";
  recent.forEach(item => addTypedLog(`DAY${item.day} ${item.q} → ${item.text}`));
}

function addTypedLog(text){
  const line = document.createElement("div");
  line.className = "log-line";
  line.textContent = "";
  el.log.appendChild(line);

  let i = 0;
  const timer = setInterval(() => {
    line.textContent = text.slice(0, i);
    i++;
    if(i > text.length){
      clearInterval(timer);
    }
  }, 8);
}

function proceedNextDay(){
  el.footerStatus.textContent = "STATUS : ACCEPTED / ARCHIVE : REGISTERED";
  saveState();

  showModal(
    "SYSTEM_MESSAGE",
    "本日の業務を完了しました。",
    () => {
      state.day += 1;
      if(state.day >= 5){
        state.operatorLabel = "DOCUMENT";
      }
      if(state.day > 5){
        state.operatorId = "ID_7702";
      }
      updateHeader();
      saveState();
      init();
    }
  );
}

function renderEnding(){
  el.fileId.textContent = "SRI-TK-099";
  el.guideline.textContent = "当該記録は整理済みです。追加修正は不要です。";
  el.choices.innerHTML = "";
  el.stamp.disabled = true;
  el.footerStatus.textContent = "STATUS : ARCHIVED";

  if(state.worldShift >= 4){
    state.operatorLabel = "DOCUMENT";
    state.operatorId = "ID_7702";
  }else{
    state.operatorLabel = "OPERATOR";
    state.operatorId = "ID_7702";
  }
  updateHeader();

  const paragraph1 = state.worldShift >= 3
    ? "編纂官 ID_7702 に該当する勤務記録は、当研究所アーカイブ上確認できない。"
    : "編纂官 ID_7702 の勤務記録には複数の不一致がある。";

  const paragraph2 = state.worldShift >= 4
    ? "当該記録は過去の修正履歴の中にのみ存在し、現行名簿および引継簿には記載されていない。"
    : "当該情報は照合未了とされている。";

  const paragraph3 = state.worldShift >= 4
    ? "記録は整理された。問題は存在しない。"
    : "本件は記録上の誤差としてアーカイブ処理を実施した。";

  el.report.innerHTML = `
    <section class="report-section">
      <span class="report-section-title">[概要]</span>
      <p>${paragraph1}</p>
    </section>
    <section class="report-section">
      <span class="report-section-title">[状況]</span>
      <p>${paragraph2}</p>
    </section>
    <section class="report-section">
      <span class="report-section-title">[結論]</span>
      <p>${paragraph3}</p>
    </section>
  `;

  showModal(
    "ARCHIVE_COMPLETE",
    state.worldShift >= 4
      ? "記録は整理された。\n問題は存在しない。"
      : "アーカイブ処理を完了しました。"
  );
}

function showModal(title, body, onClose){
  el.modalTitle.textContent = title;
  el.modalBody.textContent = body;
  el.modalOverlay.classList.remove("hidden");
  el.modalClose.onclick = () => {
    el.modalOverlay.classList.add("hidden");
    if(typeof onClose === "function"){
      onClose();
    }
  };
}

function clamp(v, min, max){
  return Math.min(max, Math.max(min, v));
}

function escapeHtml(text){
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

el.stamp.addEventListener("click", () => {
  if(el.stamp.disabled) return;
  proceedNextDay();
});

el.reset.addEventListener("click", () => {
  showModal("RESET_CONFIRM", "保存中の進行状況を初期化します。", () => resetState());
});




const titleScreen = document.getElementById("title-screen");
const startNewBtn = document.getElementById("start-new-btn");
const continueBtn = document.getElementById("continue-btn");

function startFromTitle(reset=false){
  if(reset){
    localStorage.removeItem(STORAGE_KEY);
    state = structuredClone(DEFAULT_STATE);
  }else{
    state = loadState();
  }
  fixedSet = new Set();
  currentTarget = null;
  titleScreen.classList.add("title-hidden");
  init();
}

startNewBtn.addEventListener("click", () => startFromTitle(true));
continueBtn.addEventListener("click", () => startFromTitle(false));
