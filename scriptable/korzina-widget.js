// «Корзина» — виджет и мини-приложение для Scriptable (iPhone).
// Виджет: сумма корзины, товары с ценами, сколько запросов ждут обработки.
// Нажатие на виджет открывает сайт на весь экран, как мини-приложение.
// Ссылки на GitHub (запросы) открываются в Safari.
// Работает без VPN. Если сети нет, виджет показывает последнюю загруженную версию.

const GITHUB_USER = "r13sss";
const SITE = "https://" + GITHUB_USER + ".github.io/korzina/";
const PREVIEW = false; // true — при запуске из приложения показать превью виджета вместо сайта

const INK = Color.dynamic(new Color("#151515"), new Color("#ffffff"));
const SALE = Color.dynamic(new Color("#e3441b"), new Color("#ff7a4d"));

function rub(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₽";
}

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

async function loadCart() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.cacheDirectory(), "korzina-cart.json");
  try {
    const data = await new Request(SITE + "data/cart.json?t=" + Date.now()).loadJSON();
    fm.writeString(cachePath, JSON.stringify(data));
    return { data: data, offline: false };
  } catch (e) {
    if (fm.fileExists(cachePath)) {
      return { data: JSON.parse(fm.readString(cachePath)), offline: true };
    }
    return { data: null, offline: true };
  }
}

async function loadPending(repo) {
  if (!repo) return 0;
  try {
    const req = new Request("https://api.github.com/repos/" + repo + "/issues?state=open&per_page=30");
    req.headers = { "Accept": "application/vnd.github+json" };
    const list = await req.loadJSON();
    if (!Array.isArray(list)) return 0;
    return list.filter(function (i) { return !i.pull_request; }).length;
  } catch (e) {
    return 0;
  }
}

function addText(stack, text, size, weight, opacity, color) {
  const t = stack.addText(text);
  if (weight === "bold") t.font = Font.boldSystemFont(size);
  else if (weight === "semibold") t.font = Font.semiboldSystemFont(size);
  else if (weight === "medium") t.font = Font.mediumSystemFont(size);
  else t.font = Font.systemFont(size);
  t.textColor = color || INK;
  t.textOpacity = opacity || 1;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.75;
  return t;
}

function itemRow(parent, it, size) {
  const r = parent.addStack();
  r.layoutHorizontally();
  r.centerAlignContent();
  addText(r, it.short || it.name, size, "medium", 0.9);
  r.addSpacer();
  r.addSpacer(6);
  addText(r, rub(it.price * it.qty), size, "semibold", 1, it.old ? SALE : INK);
  return r;
}

async function buildWidget() {
  const family = config.widgetFamily || "medium";
  const w = new ListWidget();
  w.backgroundColor = Color.dynamic(new Color("#f1f0ec"), new Color("#1b1b1b"));
  w.url = "scriptable:///run/" + encodeURIComponent(Script.name());
  w.setPadding(14, 16, 14, 16);
  w.refreshAfterDate = new Date(Date.now() + 20 * 60 * 1000);

  const loaded = await loadCart();
  const data = loaded.data;
  if (!data || !data.lists || !data.lists.length) {
    addText(w, "Корзина", 16, "bold");
    w.addSpacer(4);
    addText(w, "Нет связи с сайтом", 12, "regular", 0.6);
    return w;
  }

  const list = data.lists[0];
  const items = list.items.filter(function (it) { return it.qty > 0; });
  let sum = 0;
  let old = 0;
  items.forEach(function (it) {
    sum += it.price * it.qty;
    old += (it.old || it.price) * it.qty;
  });
  const pending = await loadPending(data.repo);
  const count = items.length + " " + plural(items.length, "товар", "товара", "товаров");
  let footer = "";
  if (pending > 0) footer = "Ждут обработки: " + pending;
  else if (loaded.offline) footer = "Без сети — старая версия";

  if (family === "small") {
    addText(w, "Корзина", 13, "semibold", 0.6);
    w.addSpacer(2);
    addText(w, rub(sum), 26, "bold");
    addText(w, count, 13, "medium", 0.6);
    w.addSpacer();
    if (footer) addText(w, footer, 12, "semibold");
    else addText(w, "экономия " + rub(old - sum), 12, "medium", 0.6);
    return w;
  }

  const head = w.addStack();
  head.layoutHorizontally();
  head.bottomAlignContent();
  addText(head, list.title, 17, "bold");
  head.addSpacer();
  addText(head, rub(sum), 17, "bold");
  w.addSpacer(2);
  addText(w, count + " · экономия " + rub(old - sum), 12, "medium", 0.6);
  w.addSpacer(family === "large" ? 12 : 8);

  if (family === "medium") {
    const cols = w.addStack();
    cols.layoutHorizontally();
    cols.spacing = 16;
    const perCol = footer ? 2 : 3;
    const shown = items.slice(0, perCol * 2);
    [shown.slice(0, perCol), shown.slice(perCol)].forEach(function (part) {
      const col = cols.addStack();
      col.layoutVertically();
      col.spacing = 4;
      part.forEach(function (it) { itemRow(col, it, 13); });
    });
    w.addSpacer();
    if (footer) addText(w, footer, 12, "semibold");
    else if (items.length > shown.length) addText(w, "и ещё " + (items.length - shown.length), 12, "medium", 0.6);
    return w;
  }

  // large
  const shown = items.slice(0, footer ? 11 : 12);
  shown.forEach(function (it) {
    itemRow(w, it, 14);
    w.addSpacer(5);
  });
  if (items.length > shown.length) addText(w, "и ещё " + (items.length - shown.length), 12, "medium", 0.6);
  w.addSpacer();
  if (footer) addText(w, footer, 12, "semibold");
  return w;
}

async function openMiniApp() {
  const wv = new WebView();
  wv.shouldAllowRequest = function (req) {
    const url = req.url || "";
    if (url.indexOf(SITE) === 0 || url === "about:blank") return true;
    Safari.open(url);
    return false;
  };
  await wv.loadURL(SITE + "?app=1");
  await wv.present(true);
}

if (config.runsInWidget) {
  Script.setWidget(await buildWidget());
} else if (PREVIEW) {
  const preview = await buildWidget();
  await preview.presentMedium();
} else {
  await openMiniApp();
}
Script.complete();
