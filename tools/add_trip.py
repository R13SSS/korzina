"""Записывает чек похода в магазин в data/history.json.

Запускается GitHub Action'ом на новый issue. Чек лежит в теле issue в комментарии
<!-- korzina-trip {...} -->, его формирует кнопка «Отправить чек» на сайте.
Обрабатываются только issue владельца репозитория.

Локальная проверка: python3 tools/add_trip.py --event event.json --no-git
"""
import argparse
import datetime as dt
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CART = ROOT / "data" / "cart.json"
HISTORY = ROOT / "data" / "history.json"
CATS = ["Еда", "Сладкое", "Снеки", "Молочное", "Напитки", "Бытовое", "Другое"]
MARK = re.compile(r"<!--\s*korzina-trip\s*(\{.*?\})\s*-->", re.S)


def num(v, lo, hi):
    x = float(v)
    if not (lo <= x <= hi):
        raise ValueError(f"число вне диапазона: {x}")
    return round(x, 2)


def clean(s):
    return re.sub(r"[<>]", "", str(s)).strip()[:80] or "Без названия"


def parse_trip(body, cart):
    m = MARK.search(body or "")
    if not m:
        return None
    raw = json.loads(m.group(1))
    lst = next((l for l in cart.get("lists", []) if l.get("id") == raw.get("list")), None)
    groups = {g["id"]: g for g in (lst or {}).get("groups", [])}
    by_id = {it["id"]: it for it in (lst or {}).get("items", [])}
    items = []
    for row in (raw.get("p") or [])[:100]:
        it = by_id.get(str(row[0]))
        if not it:
            continue
        items.append({
            "name": it["name"],
            "qty": num(row[2], 0.01, 100),
            "sum": num(row[1], 0, 100000),
            "cat": groups.get(it.get("group"), {}).get("cat", "Еда"),
            "planned": True,
        })
    for row in (raw.get("x") or [])[:100]:
        cat = row[3] if len(row) > 3 and row[3] in CATS else "Другое"
        items.append({
            "name": clean(row[0]),
            "qty": num(row[2], 0.01, 100),
            "sum": num(row[1], 0, 100000),
            "cat": cat,
            "planned": False,
        })
    if not items:
        return None
    total = round(sum(i["sum"] for i in items), 2)
    extra = round(sum(i["sum"] for i in items if not i["planned"]), 2)
    return {
        "list": raw.get("list"),
        "title": (lst or {}).get("title", ""),
        "store": (lst or {}).get("store", ""),
        "date_client": raw.get("date"),
        "items": items,
        "total": total,
        "extra": extra,
    }


def iso_date(client, fallback):
    try:
        dt.datetime.fromisoformat(str(client).replace("Z", "+00:00"))
        return client
    except ValueError:
        return fallback


def github(method, url, token, payload=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(payload).encode() if payload else None)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def git(*args):
    subprocess.run(["git", *args], cwd=ROOT, check=True)


def commit_and_push(number):
    git("config", "user.name", "github-actions[bot]")
    git("config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com")
    git("add", "data/history.json")
    git("commit", "-m", f"Расходы: чек из issue #{number}")
    for attempt in range(3):
        try:
            git("pull", "--rebase", "origin", "main")
            git("push", "origin", "HEAD:main")
            return
        except subprocess.CalledProcessError:
            if attempt == 2:
                raise


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--event", default=os.environ.get("GITHUB_EVENT_PATH"))
    ap.add_argument("--no-git", action="store_true", help="не коммитить и не трогать issue (для проверки)")
    args = ap.parse_args()

    event = json.loads(pathlib.Path(args.event).read_text(encoding="utf-8"))
    issue = event["issue"]
    repo = os.environ.get("GITHUB_REPOSITORY", "R13SSS/korzina")
    owner, name = repo.split("/")
    if issue["user"]["login"].lower() != owner.lower():
        print("Не владелец репозитория — пропускаю")
        return

    cart = json.loads(CART.read_text(encoding="utf-8"))
    try:
        trip = parse_trip(issue.get("body"), cart)
    except (ValueError, TypeError, IndexError, json.JSONDecodeError) as e:
        print(f"Чек не разобрался: {e}")
        trip = None
    if not trip:
        print("Чека в issue нет")
        return

    history = json.loads(HISTORY.read_text(encoding="utf-8")) if HISTORY.exists() else {"trips": []}
    trips = history.setdefault("trips", [])
    number = issue["number"]
    if not any(t.get("id") == number for t in trips):
        trip_record = {"id": number, "date": iso_date(trip.pop("date_client"), issue["created_at"]), **trip}
        trips.insert(0, trip_record)
        trips.sort(key=lambda t: str(t.get("date", "")), reverse=True)
        HISTORY.write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Записал чек #{number}: {trip_record['total']} ₽")
        if not args.no_git:
            commit_and_push(number)
    else:
        print(f"Чек #{number} уже записан")

    if args.no_git:
        return
    token = os.environ["GITHUB_TOKEN"]
    share = round(trip["extra"] / trip["total"] * 100) if trip["total"] else 0
    site = f"https://{owner.lower()}.github.io/{name}/#spend"
    text = (f"✅ Записал в расходы: {len(trip['items'])} поз. на {trip['total']:.0f} ₽, "
            f"из них вне списка {trip['extra']:.0f} ₽ ({share}%).\n\nСмотри вкладку «Расходы»: {site}")
    api = f"https://api.github.com/repos/{repo}/issues/{number}"
    github("POST", api + "/comments", token, {"body": text})
    github("PATCH", api, token, {"state": "closed", "state_reason": "completed"})


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001 — лог в Actions важнее падения без объяснений
        print(f"Ошибка: {e}", file=sys.stderr)
        raise
