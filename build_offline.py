"""Собирает офлайн-версию «Корзины»: один HTML-файл с данными и картинками внутри.

Запуск: python3 build_offline.py [путь_к_результату]
"""
import base64
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "korzina.html"


def data_uri(rel_path: str) -> str:
    raw = (ROOT / rel_path).read_bytes()
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")


def main() -> None:
    data = json.loads((ROOT / "data" / "cart.json").read_text(encoding="utf-8"))
    for lst in data["lists"]:
        for item in lst["items"]:
            if item.get("img") and not item["img"].startswith("data:"):
                item["img"] = data_uri(item["img"])

    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    marker = "<script>\n{"
    if marker not in html:
        raise SystemExit("Не нашёл место для вставки данных в index.html")
    html = html.replace(
        marker,
        f'<script id="cart-data" type="application/json">{payload}</script>\n' + marker,
        1,
    )
    OUT.write_text(html, encoding="utf-8")
    print(f"Готово: {OUT} ({OUT.stat().st_size // 1024} КБ)")


if __name__ == "__main__":
    main()
