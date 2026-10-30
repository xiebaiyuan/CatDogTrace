/*
 * Flask 入口控制器：挑战由 /api/challenges 下发，归因由 /api/analyze 计算。
 *
 * renderChallenges / renderResult 在本文件与 pages-app.js 各有一份，不共享模块。
 * 两者分别对应 Flask 入口与 GitHub Pages 入口，数据来源不同（一个走 API，一个读本地 JSON）。
 * 改界面文案、表头、结果区结构时两处都要改，只改一处会让两个入口显示不一致。
 *
 * 文案全部走 i18n.js 的 t()；品种名与族名走 breedName() / familyName()，
 * 不信 payload 里的 display_name / family_name（那是中文，来自指纹库与 fingerprint.py）。
 */

import { breedName, familyName, mountToggle, onLangChange, t } from "./i18n.js";

const state = {
  challenges: [],
  summary: null,
  lastResult: null,
  // 提示条分两种：key 形式的能随语言重画，纯文本的（服务端报错）保持原样
  message: { kind: "key", key: "message.bankLoading", type: "working" },
};

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

// 品种头像：Flask 把 static/ 挂在 /static，页面本身在 /，
// 所以这里不能照抄 Pages 的 ./assets/...，前缀要带 static/。
function avatarSrc(modelId) {
  return `./static/assets/breeds/${encodeURIComponent(modelId)}.png`;
}

// 品种族只用来上色，先把 id 收成安全的类名
function familyClass(family) {
  return String(family || "").replace(/[^a-z0-9-]/gi, "") || "other";
}

function setMessage(text, type = "error") {
  state.message = text ? { kind: "text", text, type } : null;
  paintMessage();
}

function setMessageKey(key, type = "error", vars) {
  state.message = { kind: "key", key, type, vars };
  paintMessage();
}

function paintMessage() {
  const element = byId("test-message");
  const entry = state.message;
  if (!entry) {
    element.textContent = "";
    element.className = "message error";
    element.hidden = true;
    return;
  }
  element.textContent = entry.kind === "key" ? t(entry.key, entry.vars) : entry.text;
  element.className = `message ${entry.type}`;
  element.hidden = false;
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
  button.textContent = t("common.copied");
  // 恢复时按当前语言取文案：切换语言后再还原也不能留下旧语言的字
  window.setTimeout(() => { button.textContent = t("challenge.copy"); }, 1000);
}

function renderChallenges() {
  // 提示词是服务端下发的成品文本（fingerprint.py 生成），只有一种语言，这里原样显示。
  // 语言切换会重跑本函数，先把已粘贴的内容抓出来，重建后按位置回填
  const filled = state.challenges.map((challenge, index) => {
    const field = byId(`output-${index}`);
    return field ? field.value : "";
  });
  byId("result").hidden = true;
  byId("challenge-list").innerHTML = state.challenges.map((challenge, index) => `
    <article class="challenge">
      <div class="challenge-head">
        <span class="challenge-index">${escapeHtml(t("challenge.index", { n: index + 1 }))}</span>
        <span class="challenge-count">${escapeHtml(t("challenge.count", { count: challenge.expected_count }))}</span>
        <button type="button" class="btn btn-quiet" data-copy="${index}">${escapeHtml(t("challenge.copy"))}</button>
      </div>
      <details class="challenge-prompt">
        <summary>${escapeHtml(t("challenge.expand"))}</summary>
        <pre class="challenge-prompt-text">${escapeHtml(challenge.prompt)}</pre>
      </details>
      <label class="challenge-label" for="output-${index}">${escapeHtml(t("challenge.paste"))}</label>
      <textarea class="challenge-input" id="output-${index}" spellcheck="false" placeholder="${escapeHtml(t("challenge.placeholder"))}"></textarea>
    </article>
  `).join("");
  state.challenges.forEach((challenge, index) => {
    const field = byId(`output-${index}`);
    if (field) field.value = filled[index] || "";
  });
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", () => copyText(state.challenges[Number(button.dataset.copy)].prompt, button));
  });
}

function renderResult(payload, options) {
  // 切换语言会重画一次结果区，那时不能把页面滚到底下
  const scroll = !options || options.scroll !== false;
  const diagnostics = payload.diagnostics.map((item, index) => `
    <span class="diagnostic ${item.accepted ? "accepted" : "rejected"}">${escapeHtml(t("result.diagnostic", {
      n: index + 1,
      count: item.parsed_numbers,
      verdict: item.accepted ? t("result.counted") : t("result.ignored"),
    }))}</span>
  `).join("");
  const rows = payload.results.map((item, index) => `
    <tr class="${index === 0 ? "is-winner" : ""}">
      <td class="col-rank">${index + 1}</td>
      <td><span class="breed-cell"><img class="breed-avatar" src="${avatarSrc(item.model)}" width="22" height="22" alt="" onerror="this.remove()"><strong>${escapeHtml(breedName(item.model))}</strong></span></td>
      <td>${escapeHtml(familyName(item.family))}</td>
      <td><div class="prob"><span class="prob-track"><i style="width:${(item.probability * 100).toFixed(3)}%"></i></span><b>${percent(item.probability)}</b></div></td>
      <td class="col-sim">${percent(item.profile_similarity)}</td>
    </tr>
  `).join("");
  const families = payload.family_probabilities || [];
  const familyBar = families.length ? `
    <div class="family">
      <p class="family-title">${escapeHtml(t("result.familyTitle"))}</p>
      <div class="family-bar" role="img" aria-label="${escapeHtml(families.map((item) => `${familyName(item.family)} ${percent(item.probability)}`).join(t("result.familyAriaJoin")))}">
        ${families.map((item) => `<span class="family-seg ${familyClass(item.family)}" style="width:${(item.probability * 100).toFixed(3)}%"></span>`).join("")}
      </div>
      <ul class="family-legend">
        ${families.map((item) => `<li><span class="family-key ${familyClass(item.family)}"></span>${escapeHtml(familyName(item.family))}<b>${percent(item.probability)}</b></li>`).join("")}
      </ul>
    </div>` : "";
  const panel = byId("result");
  panel.innerHTML = `
    <div class="verdict">
      <img class="breed-avatar breed-avatar-lg" src="${avatarSrc(payload.prediction)}" width="40" height="40" alt="" onerror="this.remove()">
      <p class="verdict-line"><strong>${escapeHtml(breedName(payload.prediction))}</strong><span class="verdict-prob">${percent(payload.probability)}</span></p>
    </div>
    <p class="verdict-meta">${escapeHtml(t("result.meta", {
      used: payload.used_outputs,
      total: state.challenges.length,
      beta: Number(payload.calibration.beta).toFixed(3),
      accuracy: percent(payload.calibration.cv_accuracy),
    }))}</p>
    <div class="diagnostics">${diagnostics}</div>
    ${familyBar}
    <table class="board">
      <thead><tr><th class="col-rank">${escapeHtml(t("result.tableRank"))}</th><th>${escapeHtml(t("result.tableBreed"))}</th><th>${escapeHtml(t("result.tableFamily"))}</th><th>${escapeHtml(t("result.tableProbability"))}</th><th class="col-sim">${escapeHtml(t("result.tableSimilarity"))}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="result-note">
      <p>${escapeHtml(t("result.noteClosedSet", { count: payload.results.length }))}</p>
      <p>${escapeHtml(t("result.noteFamily"))}</p>
    </div>
  `;
  panel.hidden = false;
  if (scroll) panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

// 顶栏与首屏状态行：数字来自指纹库摘要，文案随语言变
function paintSummary() {
  const summary = state.summary;
  byId("topbar-bank-count").textContent = summary
    ? t("topbar.candidates", { count: summary.model_count })
    : t("topbar.bankMissing");
  byId("active-bank-badge").textContent = summary
    ? t("hero.bankBadge", {
      breeds: summary.model_count,
      families: (summary.families || []).length,
      responses: summary.response_count,
    })
    : t("topbar.bankMissing");
}

function applySummary(summary) {
  state.summary = summary;
  paintSummary();
}

async function loadChallenges() {
  byId("regenerate").disabled = true;
  setMessage("");
  try {
    const response = await fetch("/api/challenges", { cache: "no-cache" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || t("message.challengeFailed"));
    state.challenges = payload.challenges;
    renderChallenges();
    byId("analyze").disabled = false;
    if (byId("randomize")) byId("randomize").disabled = false;
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    byId("regenerate").disabled = false;
  }
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
  setMessageKey("message.computingServer", "working");
  try {
    const outputs = state.challenges.map((challenge, index) => ({
      text: byId(`output-${index}`).value,
      expected_count: challenge.expected_count,
    }));
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outputs }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || t("message.analyzeFailed"));
    state.lastResult = payload;
    setMessage("");
    renderResult(payload);
  } catch (error) {
    setMessage(error.message, "error");
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

function paintRandomizeButton() {
  const button = byId("randomize");
  if (button) button.textContent = t("workspace.randomize");
}

function mountRandomizeButton() {
  const row = document.querySelector(".action-row");
  if (!row || byId("randomize")) return;
  const button = document.createElement("button");
  button.id = "randomize";
  button.type = "button";
  button.className = "btn btn-quiet";
  button.disabled = true;
  button.textContent = t("workspace.randomize");
  row.insertBefore(button, byId("analyze"));
  button.addEventListener("click", randomizeAndAnalyze);
}

// 切换语言：静态文案与名册由 i18n 的 DOM 阶段改完，这里只补 JS 生成的那几块。
// 挑战区用 renderChallenges 重画（不重新请求），已填的输入原样保留。
onLangChange(() => {
  paintSummary();
  paintMessage();
  paintRandomizeButton();
  const hadResult = Boolean(state.lastResult) && !byId("result").hidden;
  if (state.challenges.length) renderChallenges();
  if (hadResult) renderResult(state.lastResult, { scroll: false });
});

async function initialize() {
  // 服务端已经把摘要渲染进页面，这里先按摘要（或空摘要）把顶栏与状态行画一遍
  paintMessage();
  applySummary(window.DOGCATTRACE_SUMMARY || null);
  if (!state.summary) {
    try {
      const response = await fetch("/api/bank", { cache: "no-cache" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || t("message.bankReadFailed"));
      applySummary(payload);
    } catch (error) {
      setMessage(t("message.rebuildBank", { reason: error.message }), "error");
      return;
    }
  }
  await loadChallenges();
}

mountToggle(byId("lang-switch"));
mountRandomizeButton();
byId("regenerate").addEventListener("click", loadChallenges);
byId("analyze").addEventListener("click", analyze);
initialize();
