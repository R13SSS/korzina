// «Корзина» — виджет для Scriptable (iPhone).
// Показывает текущую корзину с сайта на GitHub Pages: сумму, товары с картинками
// и сколько запросов ждут обработки. Нажатие на виджет открывает сайт.
// Работает без VPN. Если сети нет, показывает последнюю загруженную версию.

const GITHUB_USER = "r13sss";
const SITE = "https://" + GITHUB_USER + ".github.io/korzina/";

const C = {
  bg: Color.dynamic(new Color("#f1f0ec"), new Color("#1b1b1b")),
  ink: Color.dynamic(new Color("#151515"), new Color("#f2f2f2")),
  mute: Color.dynamic(new Color("#6d6b66"), new Color("#9d9d9d")),
  sale: Color.dynamic(new Color("#e3441b"), new Color("#ff7a4d"))
};

function rub(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₽";
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

async function loadImages(items) {
  return Promise.all(items.map(async function (it) {
    try {
      return await new Request(SITE + it.img).loadImage();
    } catch (e) {
      return null;
    }
  }));
}

function addText(stack, text, size, color, weight) {
  const t = stack.addText(text);
  if (weight === "bold") t.font = Font.boldSystemFont(size);
  else if (weight === "semibold") t.font = Font.semiboldSystemFont(size);
  else t.font = Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return t;
}

function addThumb(stack, img, size) {
  const box = stack.addStack();
  box.backgroundColor = Color.white();
  box.cornerRadius = size * 0.28;
  box.setPadding(3, 3, 3, 3);
  if (img) {
    const im = box.addImage(img);
    im.imageSize = new Size(size - 6, size - 6);
    im.applyFittingContentMode();
  } else {
    box.size = new Size(size, size);
  }
}

async function build() {
  const family = config.widgetFamily || "medium";
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.url = SITE;
  w.setPadding(14, 14, 14, 14);
  w.refreshAfterDate = new Date(Date.now() + 20 * 60 * 1000);

  const loaded = await loadCart();
  const data = loaded.data;
  if (!data || !data.lists || !data.lists.length) {
    addText(w, "Корзина", 16, C.ink, "bold");
    w.addSpacer(6);
    const t = addText(w, "Нет связи с сайтом", 12, C.mute, "regular");
    t.lineLimit = 3;
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
  const countLine = items.length + " товаров · экономия " + rub(old - sum);

  // Шапка: название и сумма
  const head = w.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  addText(head, family === "small" ? "Корзина" : list.title, family === "small" ? 14 : 16, C.ink, "bold");
  if (family !== "small") {
    head.addSpacer();
    addText(head, rub(sum), 17, C.ink, "bold");
  }

  if (family === "small") {
    w.addSpacer(4);
    addText(w, rub(sum), 22, C.ink, "bold");
    addText(w, items.length + " товаров", 12, C.mute, "regular");
    w.addSpacer();
    const row = w.addStack();
    row.spacing = 5;
    const imgs = await loadImages(items.slice(0, 3));
    imgs.forEach(function (img) { addThumb(row, img, 34); });
  } else if (family === "medium") {
    w.addSpacer(2);
    addText(w, countLine, 12, C.mute, "regular");
    w.addSpacer();
    const row = w.addStack();
    row.spacing = 6;
    const imgs = await loadImages(items.slice(0, 6));
    imgs.forEach(function (img) { addThumb(row, img, 42); });
  } else {
    w.addSpacer(2);
    addText(w, countLine, 12, C.mute, "regular");
    w.addSpacer(10);
    const shown = items.slice(0, 7);
    const imgs = await loadImages(shown);
    shown.forEach(function (it, i) {
      const r = w.addStack();
      r.layoutHorizontally();
      r.centerAlignContent();
      r.spacing = 8;
      addThumb(r, imgs[i], 30);
      addText(r, it.name, 13, C.ink, "semibold");
      r.addSpacer();
      addText(r, rub(it.price * it.qty), 13, it.old ? C.sale : C.ink, "semibold");
      w.addSpacer(5);
    });
    if (items.length > shown.length) {
      addText(w, "и ещё " + (items.length - shown.length) + "…", 12, C.mute, "regular");
    }
    w.addSpacer();
  }

  if (pending > 0 || loaded.offline) {
    w.addSpacer(6);
    const note = pending > 0 ? "Ждут обработки: " + pending : "Без сети — старая версия";
    addText(w, note, 11, pending > 0 ? C.ink : C.mute, "semibold");
  }
  return w;
}

const widget = await build();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
