/*
 * Flask 入口控制器：挑战由 /api/challenges 下发，归因由 /api/analyze 计算。
 *
 * renderChallenges / renderResult 在本文件与 pages-app.js 各有一份，不共享模块。
 * 两者分别对应 Flask 入口与 GitHub Pages 入口，数据来源不同（一个走 API，一个读本地 JSON）。
 * 改界面文案、表头、结果区结构时两处都要改，只改一处会让两个入口显示不一致。
 */

const state = { challenges: [], summary: null };

const byId = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function percent(value) {
  return `${(Number(value) * 100).toFixed(1)}%`;
}

// 品种头像：Flask 把 static/ 挂在 /static，页面本身在 /，
// 所以这里不能照抄 Pages 的 ./assets/...，前缀要带 static/。
function avatarSrc(modelId) {
  return `./static/assets/breeds/${encodeURIComponent(modelId)}.png`;
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
    <article class="challenge-item">
      <div class="challenge-header">
        <strong>挑战 ${index + 1}</strong>
        <span>${challenge.expected_count} 个整数</span>
        <button type="button" data-copy="${index}">复制提示词</button>
      </div>
      <div class="challenge-columns">
        <div><label>发送给待测品种</label><pre>${escapeHtml(challenge.prompt)}</pre></div>
        <div><label for="output-${index}">粘贴完整输出</label><textarea id="output-${index}" spellcheck="false" placeholder="保留文字、标点、代码块与完整整数序列"></textarea></div>
      </div>
    </article>
  `).join("");
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", () => copyText(state.challenges[Number(button.dataset.copy)].prompt, button));
  });
}

function renderResult(payload) {
  const diagnostics = payload.diagnostics.map((item, index) => `
    <span class="diagnostic ${item.accepted ? "accepted" : "rejected"}">挑战 ${index + 1}：${item.parsed_numbers} 个整数 · ${item.accepted ? "计入" : "忽略"}</span>
  `).join("");
  const rows = payload.results.map((item, index) => `
    <tr class="${index === 0 ? "winner" : ""}">
      <td>${index + 1}</td>
      <td><span class="breed-cell"><img class="breed-avatar" src="${avatarSrc(item.model)}" width="22" height="22" alt="" onerror="this.remove()"><strong>${escapeHtml(item.display_name)}</strong></span></td>
      <td>${escapeHtml(item.family_name || "—")}</td>
      <td><div class="probability-cell"><span><i style="width:${(item.probability * 100).toFixed(3)}%"></i></span><strong>${percent(item.probability)}</strong></div></td>
      <td>${percent(item.profile_similarity)}</td>
    </tr>
  `).join("");
  const familyRows = (payload.family_probabilities || []).map((item) => `
    <tr><td>${escapeHtml(item.display_name)}</td><td>${percent(item.probability)}</td></tr>
  `).join("");
  const panel = byId("result");
  panel.innerHTML = `
    <div class="result-summary">
      <div><span>最可能品种</span><strong class="breed-headline"><img class="breed-avatar breed-avatar-lg" src="${avatarSrc(payload.prediction)}" width="40" height="40" alt="" onerror="this.remove()">${escapeHtml(payload.prediction_name)}</strong></div>
      <div><span>归因概率</span><strong>${percent(payload.probability)}</strong></div>
      <div><span>所属品种族</span><strong>${escapeHtml(payload.family_prediction_name || "—")} · ${percent(payload.family_probability || 0)}</strong></div>
      <div><span>有效查询</span><strong>${payload.used_outputs}/${state.challenges.length}</strong></div>
    </div>
    <div class="diagnostics">${diagnostics}</div>
    <div class="table-wrap"><table>
      <thead><tr><th>排序</th><th>候选品种</th><th>品种族</th><th>归因概率</th><th>分布相似度</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${familyRows ? `<div class="table-wrap"><table>
      <thead><tr><th>品种族</th><th>族概率（成员概率之和）</th></tr></thead>
      <tbody>${familyRows}</tbody>
    </table></div>` : ""}
    <div class="result-guidance" role="note" aria-label="结果说明">
      <p>概率来自闭集 softmax：候选集合固定为指纹库内 ${payload.results.length} 个品种，先验均匀。库外品种同样会被归到最相似的候选，概率不为零。</p>
      <p>本次温度 β = ${Number(payload.calibration.beta).toFixed(3)}，${payload.calibration.queries} 次查询，库内分组交叉验证准确率 ${percent(payload.calibration.cv_accuracy)}。</p>
      <p>族概率是成员概率之和，不表示该品种族是序列的来源。</p>
    </div>
  `;
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function applySummary(summary) {
  state.summary = summary;
  const count = summary ? summary.model_count : 0;
  const familyCount = summary ? (summary.families || []).length : 0;
  const responseCount = summary ? summary.response_count : 0;
  byId("topbar-bank-count").textContent = summary ? `${count} 个候选品种` : "指纹库未就绪";
  byId("active-bank-badge").textContent = summary
    ? `${count} 个品种 · ${familyCount} 个品种族 · ${responseCount} 条指纹`
    : "指纹库未就绪";
}

async function loadChallenges() {
  byId("regenerate").disabled = true;
  setMessage("");
  try {
    const response = await fetch("/api/challenges", { cache: "no-cache" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "无法生成挑战");
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
  setMessage("正在计算归因概率……", "working");
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
    if (!response.ok) throw new Error(payload.error || "无法完成归因");
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

function mountRandomizeButton() {
  const row = document.querySelector(".action-row");
  if (!row || byId("randomize")) return;
  const button = document.createElement("button");
  button.id = "randomize";
  button.type = "button";
  button.className = "button secondary";
  button.disabled = true;
  button.textContent = "随机填充并计算";
  row.insertBefore(button, byId("analyze"));
  button.addEventListener("click", randomizeAndAnalyze);
}

async function initialize() {
  applySummary(window.DOGCATTRACE_SUMMARY || null);
  if (!state.summary) {
    try {
      const response = await fetch("/api/bank", { cache: "no-cache" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "无法读取指纹库");
      applySummary(payload);
    } catch (error) {
      setMessage(`${error.message}。先运行 python3 rebuild_unified_bank.py 生成指纹库。`, "error");
      return;
    }
  }
  await loadChallenges();
}

mountRandomizeButton();
byId("regenerate").addEventListener("click", loadChallenges);
byId("analyze").addEventListener("click", analyze);
initialize();
