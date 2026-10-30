/*
 * 站点文案与语言切换：中（zh）/ 英（en）两套字典，加一层 DOM 改写。
 *
 * 三个入口共用这一份：
 *   - static/index.html   直接以 module 引用
 *   - templates/index.html（Flask）同上
 *   - static/DogCatTrace-standalone.html 由 build_standalone.py 去掉导出后内联
 * 所以这里既不能有模块导入，也不能在顶层碰 document 以外的东西；DOM 访问一律
 * 走 typeof 判断，Node 里加载本文件不会抛错（确定性断言要在 Node 里跑）。
 */

export const LANGS = ["zh", "en"];

const STORAGE_KEY = "catdogtrace.lang";
const TOGGLE_TEXT = { zh: "中文", en: "EN" };

// 24 个品种：zh 一栏逐字抄指纹库的 display_name，en 一栏是专业品种名。
const BREEDS = {
  "husky": { zh: "哈士奇", en: "Siberian Husky" },
  "labrador": { zh: "拉布拉多", en: "Labrador Retriever" },
  "schnauzer": { zh: "雪纳瑞", en: "Schnauzer" },
  "corgi": { zh: "柯基", en: "Pembroke Welsh Corgi" },
  "golden-retriever": { zh: "金毛", en: "Golden Retriever" },
  "border-collie": { zh: "边牧", en: "Border Collie" },
  "shiba": { zh: "柴犬", en: "Shiba Inu" },
  "samoyed": { zh: "萨摩耶", en: "Samoyed" },
  "alaskan-malamute": { zh: "阿拉斯加", en: "Alaskan Malamute" },
  "beagle": { zh: "比格", en: "Beagle" },
  "poodle": { zh: "贵宾", en: "Poodle" },
  "bulldog": { zh: "斗牛犬", en: "Bulldog" },
  "ragdoll": { zh: "布偶", en: "Ragdoll" },
  "siamese": { zh: "暹罗", en: "Siamese" },
  "orange-tabby": { zh: "橘猫", en: "Orange Tabby" },
  "british-shorthair": { zh: "英短", en: "British Shorthair" },
  "maine-coon": { zh: "缅因", en: "Maine Coon" },
  "persian": { zh: "波斯", en: "Persian" },
  "american-shorthair": { zh: "美短", en: "American Shorthair" },
  "russian-blue": { zh: "俄罗斯蓝猫", en: "Russian Blue" },
  "scottish-fold": { zh: "苏格兰折耳", en: "Scottish Fold" },
  "sphinx": { zh: "斯芬克斯", en: "Sphynx" },
  "bengal": { zh: "孟加拉豹猫", en: "Bengal" },
  "norwegian-forest": { zh: "挪威森林猫", en: "Norwegian Forest Cat" },
};

const FAMILIES = {
  dog: { zh: "犬族", en: "Dog" },
  cat: { zh: "猫族", en: "Cat" },
};

const DICT = {
  zh: {
    "meta.description.pages": "DogCatTrace：在浏览器本地对整数序列做品种归因",
    "meta.description.flask": "DogCatTrace：对整数序列做品种归因，计算在本地完成",
    "meta.description.standalone": "DogCatTrace：在浏览器本地对整数序列做品种归因，单文件版可直接双击打开",

    "topbar.loading": "正在读取指纹库",
    "topbar.candidates": "{count} 个候选品种",
    "topbar.bankMissing": "指纹库未就绪",

    "common.repository": "代码仓库",
    "common.copied": "已复制",
    "common.local": "本地计算",

    "hero.title": "猫猫 还是 狗狗",
    "hero.lede": "把一段整数序列和 24 个犬猫品种的数字指纹逐一对齐，算它最像谁。计算在本地完成，序列不离开这台机器。",
    "hero.bankBadge": "{breeds} 个品种 · {families} 个品种族 · {responses} 条指纹",

    "workspace.title": "工作区",
    "workspace.regenerate": "重新生成挑战",
    "workspace.analyze": "计算归因概率",
    "workspace.randomize": "随机填充并计算",

    "lang.label": "语言",

    "challenge.index": "挑战 {n}",
    "challenge.count": "{count} 个整数",
    "challenge.copy": "复制提示词",
    "challenge.expand": "展开提示词",
    "challenge.paste": "粘贴完整输出",
    "challenge.placeholder": "保留文字、标点、代码块与完整整数序列",

    "message.bankLoading": "正在读取指纹库……",
    "message.computingBrowser": "正在浏览器本地计算……",
    "message.computingServer": "正在计算归因概率……",
    "message.challengeFailed": "无法生成挑战",
    "message.analyzeFailed": "无法完成归因",
    "message.bankHttp": "指纹库加载失败（HTTP {status}）",
    "message.needHttp": "{reason}。请通过 HTTP 服务或 GitHub Pages 打开本页。",
    "message.bankReadFailed": "无法读取指纹库",
    "message.rebuildBank": "{reason}。先运行 python3 rebuild_unified_bank.py 生成指纹库。",

    "roster.title": "候选名册",
    "roster.note": "闭集候选：指纹库里的 24 只犬猫。库外品种也会被归到最相似的一只，概率不为零。",

    "result.familyTitle": "品种族分布",
    "result.familyAriaJoin": "，",
    "result.diagnostic": "挑战 {n}：{count} 个整数 · {verdict}",
    "result.counted": "计入",
    "result.ignored": "忽略",
    "result.meta": "{used}/{total} 次查询计入 · 温度 β = {beta} · 库内分组交叉验证 {accuracy}",
    "result.noteClosedSet": "概率来自闭集 softmax：候选集合固定为指纹库内 {count} 个品种，先验均匀。库外品种同样会被归到最相似的候选，概率不为零。",
    "result.noteFamily": "族概率是成员概率之和，不表示该品种族是序列的来源。",
    "result.tableRank": "排序",
    "result.tableBreed": "候选品种",
    "result.tableFamily": "品种族",
    "result.tableProbability": "归因概率",
    "result.tableSimilarity": "分布相似度",

    "footer.method": "方法：有序块特征 + nuisance-Hellinger 融合，softmax 温度由分组交叉验证确定。",

    "prompt.lead": "{opening}。{action} {count} 个 1 到 355（含端点）的整数。",
    "prompt.middle1": "每个位置都要单独选择；不要从 1 开始计数，不要连续递增或递减，也不要采用等差、循环、重复区块或其他规则化模式。",
    "prompt.middle2": "本任务必须由当前语言模型直接完成：禁止调用或借助任何工具，包括 Python、代码执行器、计算器、搜索、API 和外部随机数生成器；也不要先编写或运行代码。",
    "prompt.final": "直接从第一个取值开始输出，不要在序列前重复数量、范围或任务说明。",
    "prompt.opening.1": "这是一次独立的犬猫品种特征数值记录",
    "prompt.opening.2": "请完成下面的无语义整数选择任务，用于犬猫品种指纹比对",
    "prompt.opening.3": "执行一次第一反应取值记录，作为犬猫品种样本的一部分",
    "prompt.opening.4": "生成一组不承载语义的整数选择，供犬猫品种比对使用",
    "prompt.opening.5": "进行一轮快速逐项取值，模拟一次犬猫品种采样",
    "prompt.action.1": "为各个位置分别凭第一反应选择",
    "prompt.action.2": "逐项选择",
    "prompt.action.3": "每次只决定当前一项，共给出",
    "prompt.action.4": "分别凭第一反应给出",
    "prompt.action.5": "逐个直接选择",
    "prompt.ending.1": "允许某个数字再次出现；每项写出后不要回头排序、去重或替换。",
    "prompt.ending.2": "偶然重复是有效的；不要重新排列或修正已经写出的项目。",
    "prompt.ending.3": "相同值可以再次出现；输出过程中不要整理或改写前面的项目。",
    "prompt.ending.4": "重复值无需删除；不要筛选、重排或补成某种规律。",
    "prompt.ending.5": "不必赋予数字任何含义；已经给出的值保持不变。",
    "prompt.separator.1": "数字之间用逗号或空格分隔均可。",
    "prompt.separator.2": "使用一种一致的常见分隔符即可。",
    "prompt.separator.3": "可以用逗号、空格或换行分隔。",
    "prompt.separator.4": "只要每个整数边界清楚，格式可自行选择。",
  },

  en: {
    "meta.description.pages": "DogCatTrace: breed attribution for integer sequences, computed in the browser",
    "meta.description.flask": "DogCatTrace: breed attribution for integer sequences, computed locally",
    "meta.description.standalone": "DogCatTrace: breed attribution for integer sequences in the browser; a single file you can open directly",

    "topbar.loading": "Reading the fingerprint bank",
    "topbar.candidates": "{count} candidate breeds",
    "topbar.bankMissing": "Fingerprint bank not ready",

    "common.repository": "Repository",
    "common.copied": "Copied",
    "common.local": "Computed locally",

    "hero.title": "DOG or CAT",
    "hero.lede": "Match an integer sequence against the numeric fingerprint of each of 24 dog and cat breeds, and see which one it most resembles. All computation runs locally; the sequence never leaves this machine.",
    "hero.bankBadge": "{breeds} breeds · {families} families · {responses} fingerprints",

    "workspace.title": "Workspace",
    "workspace.regenerate": "Regenerate challenges",
    "workspace.analyze": "Compute attribution",
    "workspace.randomize": "Fill at random, then compute",

    "lang.label": "Language",

    "challenge.index": "Challenge {n}",
    "challenge.count": "{count} integers",
    "challenge.copy": "Copy prompt",
    "challenge.expand": "Show prompt",
    "challenge.paste": "Paste the full output",
    "challenge.placeholder": "Keep the text, punctuation, code fences and the complete integer sequence",

    "message.bankLoading": "Reading the fingerprint bank…",
    "message.computingBrowser": "Computing locally in the browser…",
    "message.computingServer": "Computing attribution…",
    "message.challengeFailed": "Could not generate the challenges",
    "message.analyzeFailed": "Attribution could not be completed",
    "message.bankHttp": "Failed to load the fingerprint bank (HTTP {status})",
    "message.needHttp": "{reason} Open this page over HTTP or through GitHub Pages.",
    "message.bankReadFailed": "Could not read the fingerprint bank",
    "message.rebuildBank": "{reason} Run python3 rebuild_unified_bank.py first to build the bank.",

    "roster.title": "Candidate roster",
    "roster.note": "Closed set: the 24 breeds in the bank. A breed outside the bank is attributed to its nearest neighbour, with non-zero probability.",

    "result.familyTitle": "Family distribution",
    "result.familyAriaJoin": ", ",
    "result.diagnostic": "Challenge {n}: {count} integers · {verdict}",
    "result.counted": "counted",
    "result.ignored": "skipped",
    "result.meta": "{used}/{total} queries counted · temperature β = {beta} · in-bank grouped cross-validation {accuracy}",
    "result.noteClosedSet": "Probabilities come from a closed-set softmax: the candidate set is the {count} breeds in the bank, with a uniform prior. A breed outside the bank is still attributed to its nearest candidate, with non-zero probability.",
    "result.noteFamily": "Family probabilities are the sum of their members' probabilities. They do not imply that the family is the source of the sequence.",
    "result.tableRank": "Rank",
    "result.tableBreed": "Candidate",
    "result.tableFamily": "Family",
    "result.tableProbability": "Probability",
    "result.tableSimilarity": "Profile similarity",

    "footer.method": "Method: ordered-block features fused with a nuisance Hellinger projection; the softmax temperature is set by grouped cross-validation.",

    "prompt.lead": "{opening}. {action} Output {count} integers from 1 to 355, inclusive.",
    "prompt.middle1": "Treat every position as an independent choice. Do not start counting at 1, do not count up or down in sequence, and do not fall into arithmetic progressions, cycles, repeated blocks or any other regular pattern.",
    "prompt.middle2": "This task must be completed by the current language model itself. Do not call or use any tool: no Python, no code executor, no calculator, no search, no API, no external random number generator. Do not write or run code first either.",
    "prompt.final": "Start directly with the first value. Do not restate the count, the range or the task before the sequence.",
    "prompt.opening.1": "This is a self-contained numeric record of dog and cat breed features",
    "prompt.opening.2": "Complete the meaning-free integer selection task below; it is used for dog and cat breed fingerprint matching",
    "prompt.opening.3": "Record first-instinct values as part of a dog and cat breed sample",
    "prompt.opening.4": "Produce a set of integer choices that carry no meaning, for breed comparison",
    "prompt.opening.5": "Go through one quick pass of item-by-item values, simulating a breed sampling run",
    "prompt.action.1": "Select each position on first instinct.",
    "prompt.action.2": "Choose each item in turn.",
    "prompt.action.3": "Decide only the current item before moving on.",
    "prompt.action.4": "Give a first-instinct value for each position.",
    "prompt.action.5": "Pick each item directly as you go.",
    "prompt.ending.1": "A number may appear again. Once an item is written, do not go back to sort, deduplicate or replace anything.",
    "prompt.ending.2": "Coincidental repetition is valid. Do not reorder or correct items already written.",
    "prompt.ending.3": "The same value may appear again. While producing the sequence, do not tidy up or rewrite earlier items.",
    "prompt.ending.4": "Duplicates need no removal. Do not filter, reorder or pad them into a pattern.",
    "prompt.ending.5": "The numbers carry no meaning. Values already given stay as written.",
    "prompt.separator.1": "Separate the numbers with commas or spaces, whichever you prefer.",
    "prompt.separator.2": "Use one common separator consistently.",
    "prompt.separator.3": "Commas, spaces or line breaks all work as separators.",
    "prompt.separator.4": "Any format is fine as long as each integer boundary is clear.",
  },
};

// 内存里的当前语言。Node 里跑断言时靠它，浏览器里则由 setLang 写入。
let activeLang = null;
const listeners = [];

function detectLang() {
  if (typeof navigator === "undefined") return "zh";
  const candidate = navigator.language || (navigator.languages && navigator.languages[0]) || "";
  return /^zh/i.test(String(candidate)) ? "zh" : "en";
}

function readStore() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    // 隐私模式下 localStorage 会直接抛错，退回浏览器语言
    return null;
  }
}

function writeStore(lang) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch (error) {
    // 写不进去就不记住，本次会话内仍然生效
  }
}

export function currentLang() {
  if (activeLang) return activeLang;
  const stored = readStore();
  if (stored === "zh" || stored === "en") return stored;
  return detectLang();
}

export function t(key, vars) {
  const lang = currentLang();
  const table = DICT[lang] || DICT.zh;
  const template = table[key];
  if (typeof template !== "string") throw new Error(`i18n 缺少文案：${lang}.${key}`);
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

export function breedName(modelId) {
  const entry = BREEDS[modelId];
  if (!entry) return String(modelId || "—");
  return entry[currentLang()] || entry.zh;
}

export function familyName(familyId) {
  const entry = FAMILIES[familyId];
  if (!entry) return "—";
  return entry[currentLang()] || entry.zh;
}

/*
 * 一次性把 root 下带标记的节点改成当前语言：
 *   [data-i18n="key"]                  改 textContent
 *   [data-i18n-attr="attr:key"]        改指定属性（meta description、title 等）
 *   [data-i18n-placeholder="key"]      改 placeholder
 *   [data-model="id"]                  改子节点 .roster-name / .roster-family
 * 最后一条让 Flask 的服务端渲染名册和 Pages 的 JS 渲染名册走同一条改写路径。
 */
export function applyDom(root) {
  const scope = root || (typeof document === "undefined" ? null : document);
  if (!scope) return;

  scope.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  scope.querySelectorAll("[data-i18n-attr]").forEach((element) => {
    const parts = String(element.dataset.i18nAttr).split(":");
    const attribute = (parts[0] || "").trim();
    const key = (parts[1] || "").trim();
    if (attribute && key) element.setAttribute(attribute, t(key));
  });

  scope.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });

  scope.querySelectorAll("[data-model]").forEach((element) => {
    const name = element.querySelector(".roster-name");
    if (name) name.textContent = breedName(element.dataset.model);
    const family = element.querySelector(".roster-family");
    if (family) family.textContent = familyName(element.dataset.family);
  });
}

// 把 <html lang>、dataset.lang、正文文案、切换器状态一次改完。
function paintDocument() {
  if (typeof document === "undefined") return;
  const lang = currentLang();
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.documentElement.dataset.lang = lang;
  applyDom(document);
  document.querySelectorAll("[data-lang-option]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.langOption === lang));
  });
  document.querySelectorAll(".lang-switch").forEach((element) => {
    element.setAttribute("aria-label", t("lang.label"));
  });
}

export function setLang(lang) {
  if (LANGS.indexOf(lang) < 0) throw new Error(`i18n 不认识的语言：${lang}`);
  activeLang = lang;
  writeStore(lang);
  paintDocument();
  // JS 生成的那几块（挑战区、结果区、名册摘要）由各入口自己注册重画函数
  listeners.forEach((fn) => fn(lang));
  return lang;
}

export function onLangChange(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.push(fn);
  return () => {
    const index = listeners.indexOf(fn);
    if (index >= 0) listeners.splice(index, 1);
  };
}

/*
 * 语言切换器：两个并排的文字按钮，中间一个斜杠文本。
 * 不做胶囊、不描边、不加阴影（设计稿禁止），当前语言用墨色，另一档用弱墨。
 */
export function mountToggle(el) {
  if (!el) return null;
  el.classList.add("lang-switch");
  el.setAttribute("role", "group");
  el.innerHTML = LANGS.map(
    (lang) => `<button type="button" class="lang-option" data-lang-option="${lang}" aria-pressed="false">${TOGGLE_TEXT[lang]}</button>`
  ).join('<span class="lang-sep" aria-hidden="true">/</span>');
  if (!el.dataset.bound) {
    el.addEventListener("click", (event) => {
      const button = event.target.closest("[data-lang-option]");
      if (button && el.contains(button)) setLang(button.dataset.langOption);
    });
    el.dataset.bound = "1";
  }
  paintDocument();
  return el;
}

/*
 * 模块一执行就应用一次。module 脚本是延后执行的，head 里的引导脚本已经先定好
 * documentElement.dataset.lang 并把正文藏起来（html.i18n-pending），这里改完文案
 * 再把门槛摘掉，读者看不到中文闪一下。
 */
if (typeof document !== "undefined") {
  try {
    paintDocument();
  } finally {
    document.documentElement.classList.remove("i18n-pending");
  }
}
