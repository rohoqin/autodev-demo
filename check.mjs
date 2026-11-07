import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

// 无框架、无外部依赖：用 Node 内置模块静态核对 + 模拟 DOM 执行 theme.js 验证行为。
const here = dirname(fileURLToPath(import.meta.url));
const read = (name) =>
  existsSync(join(here, name)) ? readFileSync(join(here, name), "utf8") : "";

const html = read("index.html");
const css = read("style.css");
const js = read("theme.js");

const failures = [];
function check(name, cond) {
  if (cond) console.log("  ok   " + name);
  else {
    console.log("  FAIL " + name);
    failures.push(name);
  }
}

console.log("深色模式需求验收检查\n");

// [1] 右上角有深浅色切换开关
console.log("[1] 切换开关");
check("存在 id=theme-toggle 的按钮", /id=["']theme-toggle["']/.test(html));
check(
  "开关为 role=switch 且带 aria-checked",
  /role=["']switch["']/.test(html) && /aria-checked/.test(html)
);
check(
  "开关位于顶部 header 内",
  /<header[\s\S]*?theme-toggle[\s\S]*?<\/header>/.test(html)
);
check("页面引用了本地 theme.js", /<script[^>]*src=["']theme\.js["']/.test(html));

// [2] 点击后整页切到深色（文字、卡片、背景都换）
console.log("[2] 整页深色配色");
const darkBlock = css.match(/:root\[data-theme=["']?dark["']?\]\s*\{([\s\S]*?)\}/);
const darkCss = darkBlock ? darkBlock[1] : "";
check("存在 data-theme=dark 的配色覆盖块", !!darkBlock);
for (const v of ["--bg", "--card", "--ink", "--muted", "--line"]) {
  check(
    "深色块重定义了 " + v,
    new RegExp(v.replace(/-/g, "\\-") + "\\s*:").test(darkCss)
  );
}
check(
  "现有组件基于这些 CSS 变量（整页联动，不是只变一块）",
  /var\(--bg\)/.test(css) && /var\(--card\)/.test(css) && /var\(--ink\)/.test(css)
);

// [3] 刷新后保持上次选择（用模拟 DOM 真实执行 theme.js）
console.log("[3] 记忆与切换（模拟 DOM）");
function makeHarness(stored) {
  const rootAttrs = {};
  const toggleAttrs = {};
  const store = Object.assign({}, stored);
  let clickHandler = null;

  const root = {
    setAttribute: (k, v) => (rootAttrs[k] = v),
    removeAttribute: (k) => delete rootAttrs[k],
    getAttribute: (k) => (k in rootAttrs ? rootAttrs[k] : null),
  };
  const toggle = {
    setAttribute: (k, v) => (toggleAttrs[k] = v),
    addEventListener: (ev, fn) => {
      if (ev === "click") clickHandler = fn;
    },
  };
  const document = {
    documentElement: root,
    getElementById: (id) => (id === "theme-toggle" ? toggle : null),
  };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => (store[k] = String(v)),
  };
  return {
    sandbox: { document, localStorage },
    toggleAttrs,
    store,
    click: () => {
      if (!clickHandler) throw new Error("未注册 click 监听");
      clickHandler();
    },
    theme: () => rootAttrs["data-theme"] || null,
  };
}

try {
  const h = makeHarness({});
  vm.runInNewContext(js, h.sandbox);
  check("首次访问默认浅色（未设置 data-theme）", h.theme() === null);
  check("初始 aria-checked=false", h.toggleAttrs["aria-checked"] === "false");
  h.click();
  check("点击后整页切到深色（data-theme=dark）", h.theme() === "dark");
  check("点击后 aria-checked=true", h.toggleAttrs["aria-checked"] === "true");
  check("选择写入了 localStorage", Object.values(h.store).includes("dark"));
  const darkKey = Object.keys(h.store).find((k) => h.store[k] === "dark");
  h.click();
  check("再点一次回到浅色", h.theme() === null);
  const reload = makeHarness({ [darkKey]: "dark" });
  vm.runInNewContext(js, reload.sandbox);
  check("刷新后恢复上次深色选择", reload.theme() === "dark");
} catch (e) {
  check("theme.js 可在模拟 DOM 正常执行", false);
  console.log("       -> " + e.message);
}

// [4] 不破坏现有内容与布局，不引入框架和外部资源
console.log("[4] 内容与依赖");
const preserved = [
  ["品牌名「晨光笔记」", /晨光笔记/],
  ["标语", /把想法留在早上最好的光里/],
  ["主标题", /每天一句，就够记下一天/],
  ["卡片：一句话", /一句话/],
  ["卡片：回头看", /回头看/],
  ["卡片：不打扰", /不打扰/],
  ["页脚", /一个演示页面/],
];
for (const [label, re] of preserved) check("保留 " + label, re.test(html));
check("引用本地 style.css", /href=["']style\.css["']/.test(html));
check(
  "未引入外部脚本/样式（无 src/href 指向 http）",
  !/(?:src|href)\s*=\s*["']https?:/i.test(html)
);
check(
  "CSS 未引入外部资源（无 @import / url(http)）",
  !/@import/i.test(css) && !/url\(\s*["']?https?:/i.test(css)
);
check("未引入前端框架", !/(react|vue|angular|jquery|bootstrap|tailwind)/i.test(html + js));

console.log("");
if (failures.length) {
  console.log(`结果：${failures.length} 项未通过，验收失败。`);
  process.exit(1);
}
console.log("结果：全部通过，验收成功。");
