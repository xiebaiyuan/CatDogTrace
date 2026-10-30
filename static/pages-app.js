/*
 * GitHub Pages 入口控制器：浏览器本地读 ./data/unified_bank.json 并本地计算。
 * 与 Flask 入口共用同一套算法（fingerprint-core.js），结果数值一致。
 *
 * renderChallenges / renderResult / renderRoster 在本文件与 app.js 各有一份，不共享模块。
 * 两者分别对应 GitHub Pages 入口与 Flask 入口，数据来源不同（一个读本地 JSON，一个走 API）。
 * 改界面文案、表头、结果区结构时两处都要改，只改一处会让两个入口显示不一致。
 */

import { analyzeGlobalOutputs, loadBank } from "./fingerprint-core.js";
import { generateChallenges } from "./challenge-browser.js";

const state = { bank: null, challenges: [] };
const byId = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function percent(value) {
  const pct = Number(value) * 100;
  // 非零但小于半个最小刻度时不能印 0.0%：读者会以为算坏了。β 顶格时其余 23 个就是这种情况。
  if (pct > 0 && pct < 0.05) return "<0.1%";
  return `${pct.toFixed(1)}%`;
}

// 品种头像：Pages 的发布根就是 static/，相对路径直接可用。
// 单文件版（build_standalone.py）没有 assets/ 目录，图片以 data URI 内联在 window.BREED_AVATARS。
function avatarSrc(modelId) {
  const inlined = window.BREED_AVATARS;
  if (inlined && inlined[modelId]) return inlined[modelId];
  return `./assets/breeds/${encodeURIComponent(modelId)}.png`;
}

// 品种族只用来上色，先把 id 收成安全的类名
function familyClass(family) {
  return String(family || "").replace(/[^a-z0-9-]/gi, "") || "other";
}

function setMessage(text, type = "error") {
  const element = byId("test-message");
  element.textContent = text;
  element.className = `message ${type}`;
  element.hidden = !text;
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  const original = button.textContent;
  button.textContent = "已复制";
  window.setTimeout(() => { button.textContent = original; }, 1000);
}

function renderChallenges() {
  byId("result").hidden = true;
  byId("challenge-list").innerHTML = state.challenges.map((challenge, index) => `
    <article class="challenge">
      <div class="challenge-head">
        <span class="challenge-index">挑战 ${index + 1}</span>
        <span class="challenge-count">${challenge.expected_count} 个整数</span>
        <button type="button" class="btn btn-quiet" data-copy="${index}">复制提示词</button>
      </div>
      <details class="challenge-prompt">
        <summary>展开提示词</summary>
        <pre class="challenge-prompt-text">${escapeHtml(challenge.prompt)}</pre>
      </details>
      <label class="challenge-label" for="output-${index}">粘贴完整输出</label>
      <textarea class="challenge-input" id="output-${index}" spellcheck="false" placeholder="保留文字、标点、代码块与完整整数序列"></textarea>
    </article>
  `).join("");
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", () => copyText(state.challenges[Number(button.dataset.copy)].prompt, button));
  });
}

// 候选名册：Pages 侧按指纹库里的 models 渲染。Flask 侧由 templates/index.html 直接渲染同一份结构。
function renderRoster(models) {
  const grid = byId("roster-grid");
  grid.removeAttribute("aria-busy");
  grid.innerHTML = models.map((model) => `
    <figure class="roster-item">
      <img class="roster-avatar" src="${avatarSrc(model.id)}" width="128" height="128" alt="" loading="lazy" onerror="this.remove()">
      <figcaption><span class="roster-name">${escapeHtml(model.display_name)}</span><span class="roster-family">${escapeHtml(model.family_name || "—")}</span></figcaption>
    </figure>
  `).join("");
}

function renderResult(payload) {
  const diagnostics = payload.diagnostics.map((item, index) => `
    <span class="diagnostic ${item.accepted ? "accepted" : "rejected"}">挑战 ${index + 1}：${item.parsed_numbers} 个整数 · ${item.accepted ? "计入" : "忽略"}</span>
  `).join("");
  const rows = payload.results.map((item, index) => `
    <tr class="${index === 0 ? "is-winner" : ""}">
      <td class="col-rank">${index + 1}</td>
      <td><span class="breed-cell"><img class="breed-avatar" src="${avatarSrc(item.model)}" width="22" height="22" alt="" onerror="this.remove()"><strong>${escapeHtml(item.display_name)}</strong></span></td>
      <td>${escapeHtml(item.family_name || "—")}</td>
      <td><div class="prob"><span class="prob-track"><i style="width:${(item.probability * 100).toFixed(3)}%"></i></span><b>${percent(item.probability)}</b></div></td>
      <td class="col-sim">${percent(item.profile_similarity)}</td>
    </tr>
  `).join("");
  const families = payload.family_probabilities || [];
  const familyBar = families.length ? `
    <div class="family">
      <p class="family-title">品种族分布</p>
      <div class="family-bar" role="img" aria-label="${escapeHtml(families.map((item) => `${item.display_name} ${percent(item.probability)}`).join("，"))}">
        ${families.map((item) => `<span class="family-seg ${familyClass(item.family)}" style="width:${(item.probability * 100).toFixed(3)}%"></span>`).join("")}
      </div>
      <ul class="family-legend">
        ${families.map((item) => `<li><span class="family-key ${familyClass(item.family)}"></span>${escapeHtml(item.display_name)}<b>${percent(item.probability)}</b></li>`).join("")}
      </ul>
    </div>` : "";
  const panel = byId("result");
  panel.innerHTML = `
    <div class="verdict">
      <img class="breed-avatar breed-avatar-lg" src="${avatarSrc(payload.prediction)}" width="40" height="40" alt="" onerror="this.remove()">
      <p class="verdict-line"><strong>${escapeHtml(payload.prediction_name)}</strong><span class="verdict-prob">${percent(payload.probability)}</span></p>
    </div>
    <p class="verdict-meta">${payload.used_outputs}/${state.challenges.length} 次查询计入 · 温度 β = ${Number(payload.calibration.beta).toFixed(3)} · 库内分组交叉验证 ${percent(payload.calibration.cv_accuracy)}</p>
    <div class="diagnostics">${diagnostics}</div>
    ${familyBar}
    <table class="board">
      <thead><tr><th class="col-rank">排序</th><th>候选品种</th><th>品种族</th><th>归因概率</th><th class="col-sim">分布相似度</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="result-note">
      <p>概率来自闭集 softmax：候选集合固定为指纹库内 ${payload.results.length} 个品种，先验均匀。库外品种同样会被归到最相似的候选，概率不为零。</p>
      <p>族概率是成员概率之和，不表示该品种族是序列的来源。</p>
    </div>
  `;
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function regenerate() {
  state.challenges = generateChallenges(3);
  setMessage("");
  renderChallenges();
}

function randomInteger() {
  return Math.floor(Math.random() * 355) + 1;
}

function fillRandomOutputs() {
  state.challenges.forEach((challenge, index) => {
    const field = byId(`output-${index}`);
    if (!field) return;
    const values = [];
    for (let position = 0; position < challenge.expected_count; position += 1) values.push(randomInteger());
    field.value = values.join(" ");
  });
}

async function analyze() {
  const button = byId("analyze");
  button.disabled = true;
  byId("result").hidden = true;
  setMessage("正在浏览器本地计算……", "working");
  await new Promise((resolve) => requestAnimationFrame(resolve));
  try {
    const outputs = state.challenges.map((challenge, index) => ({
      text: byId(`output-${index}`).value,
      expected_count: challenge.expected_count,
    }));
    renderResult(analyzeGlobalOutputs(outputs, state.bank));
    setMessage("");
  } catch (error) {
    setMessage(error.message || "无法完成归因", "error");
  } finally {
    button.disabled = false;
  }
}

async function randomizeAndAnalyze() {
  const button = byId("randomize");
  button.disabled = true;
  try {
    fillRandomOutputs();
    await analyze();
  } finally {
    button.disabled = false;
  }
}

function mountRandomizeButton() {
  const row = document.querySelector(".action-row");
  if (!row || byId("randomize")) return;
  const button = document.createElement("button");
  button.id = "randomize";
  button.type = "button";
  button.className = "btn btn-quiet";
  button.disabled = true;
  button.textContent = "随机填充并计算";
  row.insertBefore(button, byId("analyze"));
  button.addEventListener("click", randomizeAndAnalyze);
}

async function initialize() {
  try {
    const response = await fetch("./data/unified_bank.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`指纹库加载失败（HTTP ${response.status}）`);
    state.bank = loadBank(await response.json());
    renderRoster(state.bank.models);
    const responseCount = state.bank.models.reduce((sum, model) => sum + Number(model.response_count || 0), 0);
    const families = new Set(state.bank.models.map((model) => model.family).filter(Boolean));
    byId("topbar-bank-count").textContent = `${state.bank.models.length} 个候选品种`;
    byId("active-bank-badge").textContent = `${state.bank.models.length} 个品种 · ${families.size} 个品种族 · ${responseCount} 条指纹`;
    byId("regenerate").disabled = false;
    byId("analyze").disabled = false;
    if (byId("randomize")) byId("randomize").disabled = false;
    regenerate();
  } catch (error) {
    setMessage(`${error.message}。请通过 HTTP 服务或 GitHub Pages 打开本页。`, "error");
  }
}

mountRandomizeButton();
byId("regenerate").addEventListener("click", regenerate);
byId("analyze").addEventListener("click", analyze);
initialize();
