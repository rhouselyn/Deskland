#!/usr/bin/env python3
"""
KuroCat Download Tracker & Analytics Dashboard for qianyi.one/kurocat
- Zero external dependencies (Python 3.10+ stdlib + sqlite3)
- Serves /kurocat/releases/* via Nginx X-Accel-Redirect (zero memory file streaming)
- Records every download event in SQLite (WAL) + append-only JSONL
- Smartly filters HEAD probes, multi-part Range chunks, and 15s duplicate hits
- Exposes public aggregate JSON (/kurocat/api/stats), GitHub outbound beacon (/kurocat/api/track-outbound),
  and token-protected interactive dashboard + CSV/JSON export (/kurocat/stats?token=...)
"""

from __future__ import annotations

import csv
import hmac
import html
import io
import json
import os
import re
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlparse
from urllib.request import Request, urlopen

CST = timezone(timedelta(hours=8))

HOST = os.environ.get("KUROCAT_TRACKER_HOST", "127.0.0.1")
PORT = int(os.environ.get("KUROCAT_TRACKER_PORT", "28460"))
RELEASES_ROOT = Path(os.environ.get("KUROCAT_RELEASES_ROOT", "/var/www/qianyi.one/kurocat/releases")).resolve()
DATA_DIR = Path(os.environ.get("KUROCAT_DATA_DIR", "/var/lib/kurocat-stats")).resolve()
DB_PATH = DATA_DIR / "downloads.db"
JSONL_PATH = DATA_DIR / "downloads.jsonl"
GITHUB_CACHE_PATH = DATA_DIR / "github_cache.json"
GITHUB_REPO = os.environ.get("KUROCAT_GITHUB_REPO", "qianyiai/kurocat").strip()
GITHUB_TOKEN = os.environ.get("KUROCAT_GITHUB_TOKEN", "").strip()
GITHUB_REFRESH_SEC = int(os.environ.get("KUROCAT_GITHUB_REFRESH_SEC", "180"))
STATS_TOKEN = os.environ.get("KUROCAT_STATS_TOKEN", "").strip()
DEDUP_WINDOW_SEC = 15

DB_LOCK = threading.Lock()
GITHUB_LOCK = threading.Lock()
GITHUB_CACHE: dict[str, Any] = {
    "github_downloads": 0,
    "github_win_downloads": 0,
    "github_mac_downloads": 0,
    "github_release_count": 0,
    "github_updated_at_cst": "",
    "fetched_at_unix": 0.0,
}
ALLOWED_FILENAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,120}$")


def load_github_cache_from_disk() -> None:
    if not GITHUB_CACHE_PATH.exists():
        return
    try:
        raw = json.loads(GITHUB_CACHE_PATH.read_text(encoding="utf-8"))
        if isinstance(raw, dict) and isinstance(raw.get("github_downloads"), int):
            with GITHUB_LOCK:
                GITHUB_CACHE.update(raw)
    except Exception:
        pass


def fetch_github_downloads_once() -> None:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "kurocat-dl-tracker/1.0 (+https://qianyi.one/kurocat/)",
    }
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"

    total = 0
    win = 0
    mac = 0
    release_count = 0

    for page in range(1, 6):
        url = f"https://api.github.com/repos/{GITHUB_REPO}/releases?per_page=100&page={page}"
        req = Request(url, headers=headers)
        with urlopen(req, timeout=12) as resp:
            items = json.loads(resp.read().decode("utf-8", errors="replace"))
        if not isinstance(items, list) or not items:
            break
        release_count += len(items)
        for rel in items:
            assets = rel.get("assets") or []
            for asset in assets:
                cnt = int(asset.get("download_count") or 0)
                name = str(asset.get("name") or "").lower()
                total += cnt
                if "macos" in name or name.endswith(".dmg") or name.endswith(".app.tar.gz"):
                    mac += cnt
                else:
                    win += cnt
        if len(items) < 100:
            break

    ts_unix, _, ts_cst, _ = now_utc_and_cst()
    snapshot = {
        "github_downloads": total,
        "github_win_downloads": win,
        "github_mac_downloads": mac,
        "github_release_count": release_count,
        "github_updated_at_cst": ts_cst,
        "fetched_at_unix": ts_unix,
    }
    with GITHUB_LOCK:
        GITHUB_CACHE.update(snapshot)
    try:
        tmp = GITHUB_CACHE_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, GITHUB_CACHE_PATH)
    except OSError:
        pass


def get_github_stats_snapshot() -> dict[str, Any]:
    with GITHUB_LOCK:
        return dict(GITHUB_CACHE)


def start_github_sync_thread() -> None:
    load_github_cache_from_disk()

    def _worker() -> None:
        while True:
            try:
                fetch_github_downloads_once()
            except Exception as exc:
                print(f"[github-sync] refresh failed (keeping cached value): {exc}", flush=True)
            time.sleep(max(60, GITHUB_REFRESH_SEC))

    t = threading.Thread(target=_worker, name="github-dl-sync", daemon=True)
    t.start()


def now_utc_and_cst() -> tuple[float, str, str, str]:
    ts = time.time()
    dt_utc = datetime.fromtimestamp(ts, tz=timezone.utc)
    dt_cst = dt_utc.astimezone(CST)
    return (
        ts,
        dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        dt_cst.strftime("%Y-%m-%d %H:%M:%S"),
        dt_cst.strftime("%Y-%m-%d"),
    )


def init_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with DB_LOCK:
        conn = sqlite3.connect(DB_PATH, timeout=15)
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS downloads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts_unix REAL NOT NULL,
                    ts_utc TEXT NOT NULL,
                    ts_cst TEXT NOT NULL,
                    day_cst TEXT NOT NULL,
                    source TEXT NOT NULL,
                    version TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    file_size INTEGER NOT NULL DEFAULT 0,
                    method TEXT NOT NULL,
                    range_header TEXT NOT NULL DEFAULT '',
                    counted INTEGER NOT NULL,
                    reason TEXT NOT NULL,
                    ip TEXT NOT NULL,
                    country TEXT NOT NULL,
                    referer TEXT NOT NULL DEFAULT '',
                    user_agent TEXT NOT NULL DEFAULT '',
                    device TEXT NOT NULL DEFAULT ''
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_dl_ts ON downloads(ts_unix DESC);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_dl_counted_src ON downloads(counted, source, day_cst);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_dl_dedup ON downloads(ip, filename, source, counted, ts_unix);")
            conn.commit()
        finally:
            conn.close()


def classify_platform(filename: str) -> str:
    low = filename.lower()
    if "macos" in low or low.endswith(".dmg") or low.endswith(".app.tar.gz"):
        return "macOS 通用版"
    if "win7" in low:
        return "Windows 7 兼容整合包"
    if "linux" in low or low.endswith(".deb") or low.endswith(".appimage"):
        if "arm64" in low or "aarch64" in low:
            return "Linux / 麒麟版 (ARM64)"
        return "Linux / 麒麟版 (x86_64)"
    if "108key" in low:
        return "Windows 108键安装版"
    if "setup.exe" in low or low.endswith(".msi"):
        return "Windows 65%安装版"
    if "windows-x64.exe" in low:
        return "Windows 绿色单文件"
    return "其他安装包"


def parse_device(ua: str) -> str:
    u = ua or ""
    low = u.lower()
    if not u:
        return "未知客户端"

    os_label = "其他系统"
    if "iphone" in low or "ipad" in low:
        os_label = "iOS"
    elif "android" in low:
        os_label = "Android"
    elif "windows" in low:
        os_label = "Windows"
    elif "mac os x" in low or "macintosh" in low:
        os_label = "macOS"
    elif "linux" in low:
        os_label = "Linux"

    client = ""
    if "micromessenger" in low:
        client = "微信"
    elif "aweme" in low or "bytedance" in low:
        client = "抖音"
    elif "edg/" in low:
        client = "Edge"
    elif "chrome/" in low and "edg/" not in low:
        client = "Chrome"
    elif "firefox/" in low:
        client = "Firefox"
    elif "safari/" in low and "chrome/" not in low:
        client = "Safari"
    elif "curl/" in low:
        return "curl"
    elif "wget/" in low:
        return "wget"
    elif "powershell" in low:
        return "PowerShell"
    elif "aria2" in low:
        return "aria2"
    elif "idm" in low or "internet download manager" in low:
        return "IDM"
    elif "python" in low:
        return "Python"

    return f"{os_label} · {client}" if client else os_label


def extract_client_info(handler: BaseHTTPRequestHandler) -> tuple[str, str, str, str]:
    h = handler.headers
    ip = (h.get("CF-Connecting-IP") or "").strip()
    if not ip:
        xff = (h.get("X-Forwarded-For") or "").strip()
        if xff:
            ip = xff.split(",")[0].strip()
    if not ip:
        ip = (h.get("X-Real-IP") or "").strip() or handler.client_address[0]

    country = (h.get("CF-IPCountry") or "").strip().upper() or "Unknown"
    referer = (h.get("Referer") or "").strip()[:512]
    ua = (h.get("User-Agent") or "").strip()[:512]
    return ip[:64], country[:16], referer, ua


def should_count_download(
    conn: sqlite3.Connection,
    *,
    method: str,
    range_header: str,
    ip: str,
    filename: str,
    source: str,
    ts_unix: float,
) -> tuple[int, str]:
    if method != "GET" and source == "qianyi_cdn":
        return 0, "head"

    if source == "qianyi_cdn" and range_header:
        rh = range_header.strip().lower()
        if rh.startswith("bytes="):
            first_spec = rh[6:].split(",")[0].strip()
            if not first_spec.startswith("0-"):
                return 0, "range_chunk"
            end_part = first_spec[2:].strip()
            if end_part.isdigit() and int(end_part) <= 64:
                return 0, "range_probe"

    row = conn.execute(
        """
        SELECT ts_unix FROM downloads
        WHERE ip = ? AND filename = ? AND source = ? AND counted = 1 AND ts_unix >= ?
        ORDER BY ts_unix DESC LIMIT 1
        """,
        (ip, filename, source, ts_unix - DEDUP_WINDOW_SEC),
    ).fetchone()
    if row is not None:
        return 0, f"dedup_{DEDUP_WINDOW_SEC}s"

    return 1, "ok"


def record_event(
    *,
    source: str,
    version: str,
    filename: str,
    file_size: int,
    method: str,
    range_header: str,
    ip: str,
    country: str,
    referer: str,
    ua: str,
) -> dict[str, Any]:
    ts_unix, ts_utc, ts_cst, day_cst = now_utc_and_cst()
    platform = classify_platform(filename)
    device = parse_device(ua)

    with DB_LOCK:
        conn = sqlite3.connect(DB_PATH, timeout=15)
        try:
            counted, reason = should_count_download(
                conn,
                method=method,
                range_header=range_header,
                ip=ip,
                filename=filename,
                source=source,
                ts_unix=ts_unix,
            )
            cur = conn.execute(
                """
                INSERT INTO downloads (
                    ts_unix, ts_utc, ts_cst, day_cst, source, version, filename, platform,
                    file_size, method, range_header, counted, reason, ip, country, referer, user_agent, device
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ts_unix, ts_utc, ts_cst, day_cst, source, version, filename, platform,
                    file_size, method, range_header[:128], counted, reason, ip, country, referer, ua, device,
                ),
            )
            row_id = cur.lastrowid
            conn.commit()
        finally:
            conn.close()

        entry = {
            "id": row_id,
            "ts_utc": ts_utc,
            "ts_cst": ts_cst,
            "source": source,
            "version": version,
            "filename": filename,
            "platform": platform,
            "file_size": file_size,
            "method": method,
            "range": range_header[:128],
            "counted": counted,
            "reason": reason,
            "ip": ip,
            "country": country,
            "referer": referer,
            "device": device,
            "user_agent": ua,
        }
        try:
            with JSONL_PATH.open("a", encoding="utf-8") as fp:
                fp.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except OSError:
            pass

    return entry


def query_stats(*, include_raw: bool = False, limit: int = 200) -> dict[str, Any]:
    _, _, now_cst_str, today_cst = now_utc_and_cst()
    today_dt = datetime.now(CST).date()
    days_14 = [(today_dt - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(13, -1, -1)]

    with DB_LOCK:
        conn = sqlite3.connect(DB_PATH, timeout=15)
        conn.row_factory = sqlite3.Row
        try:
            total_cdn = conn.execute(
                "SELECT COUNT(*) FROM downloads WHERE counted = 1 AND source = 'qianyi_cdn'"
            ).fetchone()[0]
            today_cdn = conn.execute(
                "SELECT COUNT(*) FROM downloads WHERE counted = 1 AND source = 'qianyi_cdn' AND day_cst = ?",
                (today_cst,),
            ).fetchone()[0]
            unique_ips = conn.execute(
                "SELECT COUNT(DISTINCT ip) FROM downloads WHERE counted = 1 AND source = 'qianyi_cdn'"
            ).fetchone()[0]
            gh_clicks = conn.execute(
                "SELECT COUNT(*) FROM downloads WHERE counted = 1 AND source = 'github_outbound'"
            ).fetchone()[0]
            today_gh_clicks = conn.execute(
                "SELECT COUNT(*) FROM downloads WHERE counted = 1 AND source = 'github_outbound' AND day_cst = ?",
                (today_cst,),
            ).fetchone()[0]

            by_file_rows = conn.execute(
                """
                SELECT filename, platform, COUNT(*) AS cnt,
                       SUM(CASE WHEN day_cst = ? THEN 1 ELSE 0 END) AS today_cnt
                FROM downloads
                WHERE counted = 1 AND source = 'qianyi_cdn'
                GROUP BY filename, platform
                ORDER BY cnt DESC, filename ASC
                """,
                (today_cst,),
            ).fetchall()
            by_file = [
                {
                    "filename": r["filename"],
                    "platform": r["platform"],
                    "count": r["cnt"],
                    "today": r["today_cnt"] or 0,
                }
                for r in by_file_rows
            ]

            by_day_map = {d: 0 for d in days_14}
            for r in conn.execute(
                """
                SELECT day_cst, COUNT(*) AS cnt
                FROM downloads
                WHERE counted = 1 AND source = 'qianyi_cdn' AND day_cst >= ?
                GROUP BY day_cst
                """,
                (days_14[0],),
            ).fetchall():
                if r["day_cst"] in by_day_map:
                    by_day_map[r["day_cst"]] = r["cnt"]
            by_day = [{"day": d, "count": by_day_map[d]} for d in days_14]

            by_country = [
                {"country": r["country"], "count": r["cnt"]}
                for r in conn.execute(
                    """
                    SELECT country, COUNT(*) AS cnt
                    FROM downloads
                    WHERE counted = 1 AND source = 'qianyi_cdn'
                    GROUP BY country
                    ORDER BY cnt DESC
                    LIMIT 20
                    """
                ).fetchall()
            ]

            where_clause = "" if include_raw else "WHERE counted = 1"
            recent_rows = conn.execute(
                f"""
                SELECT id, ts_cst, source, version, filename, platform, method,
                       counted, reason, ip, country, referer, device, user_agent
                FROM downloads
                {where_clause}
                ORDER BY id DESC
                LIMIT ?
                """,
                (max(1, min(limit, 500)),),
            ).fetchall()
            recent = [dict(r) for r in recent_rows]
        finally:
            conn.close()

    return {
        "updated_at_cst": now_cst_str,
        "today_cst": today_cst,
        "total_downloads": total_cdn,
        "today_downloads": today_cdn,
        "unique_ips": unique_ips,
        "github_clicks": gh_clicks,
        "today_github_clicks": today_gh_clicks,
        "by_file": by_file,
        "by_day_14d": by_day,
        "by_country": by_country,
        "recent": recent,
    }


def render_dashboard_html(data: dict[str, Any], token: str, show_raw: bool) -> str:
    tok_q = quote(token, safe="")
    total = data["total_downloads"]
    today = data["today_downloads"]
    uips = data["unique_ips"]
    gh_clicks = data["github_clicks"]

    file_rows_html = ""
    if data["by_file"]:
        for item in data["by_file"]:
            pct = (item["count"] / total * 100.0) if total > 0 else 0.0
            file_rows_html += (
                f'<div class="bar-item">'
                f'  <div class="bar-head">'
                f'    <span class="bar-name"><strong>{html.escape(item["platform"])}</strong> '
                f'      <code>{html.escape(item["filename"])}</code></span>'
                f'    <span class="bar-meta">{item["count"]} 次（今日 +{item["today"]} · {pct:.1f}%）</span>'
                f'  </div>'
                f'  <div class="bar-track"><div class="bar-fill" style="width:{pct:.1f}%"></div></div>'
                f'</div>'
            )
    else:
        file_rows_html = '<div class="empty">暂无下载记录，发生首次下载后将实时显示。</div>'

    max_day = max((d["count"] for d in data["by_day_14d"]), default=1) or 1
    day_bars_html = ""
    for d in data["by_day_14d"]:
        h_pct = max(4, round((d["count"] / max_day) * 100)) if d["count"] > 0 else 2
        short_day = d["day"][5:]
        day_bars_html += (
            f'<div class="day-col" title="{d["day"]}: {d["count"]} 次">'
            f'  <span class="day-cnt">{d["count"] if d["count"] > 0 else ""}</span>'
            f'  <div class="day-bar-wrap"><div class="day-bar{" active" if d["count"] > 0 else ""}" style="height:{h_pct}%"></div></div>'
            f'  <span class="day-lbl">{short_day}</span>'
            f'</div>'
        )

    country_html = "".join(
        f'<span class="geo-pill">{html.escape(c["country"])} <strong>{c["count"]}</strong></span>'
        for c in data["by_country"]
    ) or '<span class="muted">暂无数据</span>'

    table_rows = ""
    for r in data["recent"]:
        src_badge = (
            '<span class="badge badge-lime">直链</span>'
            if r["source"] == "qianyi_cdn"
            else '<span class="badge badge-blue">GitHub外链</span>'
        )
        status_note = "" if r["counted"] else f' <span class="badge badge-dim">{html.escape(r["reason"])}</span>'
        ref = r["referer"] or "-"
        if len(ref) > 52:
            ref_disp = ref[:49] + "..."
        else:
            ref_disp = ref
        table_rows += (
            f'<tr class="{"row-raw" if not r["counted"] else ""}">'
            f'  <td class="mono">{html.escape(r["ts_cst"])}</td>'
            f'  <td><div><strong>{html.escape(r["platform"])}</strong></div><div class="sub-mono">{html.escape(r["filename"])}</div></td>'
            f'  <td>{src_badge}{status_note}</td>'
            f'  <td class="mono">{html.escape(r["country"])}</td>'
            f'  <td class="mono">{html.escape(r["ip"])}</td>'
            f'  <td>{html.escape(r["device"])}</td>'
            f'  <td class="ref-cell" title="{html.escape(ref)}">{html.escape(ref_disp)}</td>'
            f'</tr>'
        )
    if not table_rows:
        table_rows = '<tr><td colspan="7" class="empty">暂无记录</td></tr>'

    toggle_raw_href = f"/kurocat/stats?token={tok_q}&raw={'0' if show_raw else '1'}"
    toggle_raw_label = "仅看有效下载" if show_raw else "包含探测/分片"

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow" />
  <title>KuroCat 下载监控面板 · qianyi.one</title>
  <style>
    :root {{
      --bg: #000;
      --surface: #0d0d10;
      --elev: #15151a;
      --border: rgba(255,255,255,0.09);
      --text: #f5f5f7;
      --sub: #8b8b93;
      --dim: #66666e;
      --lime: #d4f044;
      --blue: #2997ff;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
      line-height: 1.5;
    }}
    .wrap {{ max-width: 1220px; margin: 0 auto; padding: 26px 18px 64px; }}
    .topbar {{
      display: flex; align-items: center; justify-content: space-between;
      gap: 14px; flex-wrap: wrap; margin-bottom: 24px;
    }}
    .title-area h1 {{ margin: 0; font-size: 22px; letter-spacing: -0.02em; }}
    .title-area p {{ margin: 4px 0 0; font-size: 12.5px; color: var(--sub); }}
    .toolbar {{ display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }}
    .btn {{
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 500;
      border: 1px solid var(--border); background: var(--elev); color: var(--text);
      text-decoration: none; cursor: pointer; font-family: inherit;
    }}
    .btn:hover {{ border-color: rgba(255,255,255,0.28); }}
    .btn-lime {{ background: var(--lime); color: #090a07; border-color: transparent; font-weight: 700; }}
    .kpi-grid {{
      display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px;
    }}
    .card {{
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 18px; padding: 18px 20px;
    }}
    .kpi-lbl {{ font-size: 12px; color: var(--sub); }}
    .kpi-val {{ font-size: 32px; font-weight: 700; letter-spacing: -0.03em; margin-top: 6px; }}
    .kpi-val.lime {{ color: var(--lime); }}
    .kpi-sub {{ font-size: 11.5px; color: var(--dim); margin-top: 4px; }}
    .grid-2 {{ display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 16px; margin-bottom: 18px; }}
    h2 {{ margin: 0 0 14px; font-size: 15px; font-weight: 650; }}
    .bar-item {{ margin-bottom: 13px; }}
    .bar-head {{ display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; flex-wrap: wrap; margin-bottom: 5px; }}
    .bar-name code {{ color: var(--sub); font-size: 11px; margin-left: 4px; }}
    .bar-meta {{ color: var(--sub); font-size: 12px; }}
    .bar-track {{ height: 7px; border-radius: 999px; background: rgba(255,255,255,0.07); overflow: hidden; }}
    .bar-fill {{ height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--lime), #84e84c); }}
    .chart {{ display: flex; align-items: flex-end; gap: 6px; height: 145px; padding-top: 18px; }}
    .day-col {{ flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; height: 100%; }}
    .day-cnt {{ font-size: 10.5px; color: var(--sub); height: 16px; }}
    .day-bar-wrap {{ flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }}
    .day-bar {{ width: 70%; max-width: 24px; border-radius: 6px 6px 2px 2px; background: rgba(255,255,255,0.1); }}
    .day-bar.active {{ background: linear-gradient(180deg, var(--lime), rgba(212,240,68,0.45)); }}
    .day-lbl {{ font-size: 10px; color: var(--dim); margin-top: 6px; }}
    .geo-wrap {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }}
    .geo-pill {{ font-size: 12px; padding: 4px 10px; border-radius: 999px; background: var(--elev); border: 1px solid var(--border); color: var(--sub); }}
    .geo-pill strong {{ color: var(--text); margin-left: 4px; }}
    .table-head {{ display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }}
    .search-input {{
      background: var(--elev); border: 1px solid var(--border); color: var(--text);
      padding: 6px 12px; border-radius: 999px; font-size: 12.5px; outline: none; width: 220px;
    }}
    .table-scroll {{ overflow-x: auto; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 12.5px; }}
    th, td {{ text-align: left; padding: 10px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }}
    th {{ color: var(--sub); font-weight: 600; font-size: 11.5px; white-space: nowrap; }}
    .mono {{ font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 11.5px; white-space: nowrap; }}
    .sub-mono {{ font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 10.5px; color: var(--dim); }}
    .ref-cell {{ max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--sub); }}
    .badge {{ display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 11px; font-weight: 600; white-space: nowrap; }}
    .badge-lime {{ background: rgba(212,240,68,0.16); color: var(--lime); }}
    .badge-blue {{ background: rgba(41,151,255,0.18); color: #84caff; }}
    .badge-dim {{ background: rgba(255,255,255,0.08); color: var(--sub); }}
    .row-raw {{ opacity: 0.52; }}
    .empty {{ text-align: center; color: var(--dim); padding: 26px 10px; }}
    .muted {{ color: var(--dim); font-size: 12px; }}
    @media (max-width: 900px) {{
      .kpi-grid {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
      .grid-2 {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">
      <div class="title-area">
        <h1>🐈‍⬛ KuroCat 下载监控面板（qianyi.one）</h1>
        <p>更新时间：{html.escape(data["updated_at_cst"])}（北京时间） · 自动过滤 HEAD 探测、续传分片与 15 秒内重复请求</p>
      </div>
      <div class="toolbar">
        <a class="btn" href="/kurocat/">返回官网</a>
        <a class="btn" href="{toggle_raw_href}">{toggle_raw_label}</a>
        <a class="btn" href="/kurocat/stats?token={tok_q}&format=json" target="_blank">JSON</a>
        <a class="btn" href="/kurocat/stats?token={tok_q}&format=csv">导出 CSV</a>
        <button class="btn btn-lime" type="button" onclick="location.reload()">刷新数据</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="card">
        <div class="kpi-lbl">qianyi.one 总下载次数</div>
        <div class="kpi-val lime">{total}</div>
        <div class="kpi-sub">站内高速直链有效下载</div>
      </div>
      <div class="card">
        <div class="kpi-lbl">今日下载（北京时间）</div>
        <div class="kpi-val">{today}</div>
        <div class="kpi-sub">统计日 {html.escape(data["today_cst"])}</div>
      </div>
      <div class="card">
        <div class="kpi-lbl">独立下载 IP 数</div>
        <div class="kpi-val">{uips}</div>
        <div class="kpi-sub">按 Cloudflare 真实访客 IP 去重</div>
      </div>
      <div class="card">
        <div class="kpi-lbl">GitHub 外链点击</div>
        <div class="kpi-val">{gh_clicks}</div>
        <div class="kpi-sub">今日 +{data["today_github_clicks"]}（页面官方源按钮）</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h2>各安装包下载分布</h2>
        {file_rows_html}
      </div>
      <div class="card">
        <h2>近 14 天下载趋势（北京时间）</h2>
        <div class="chart">{day_bars_html}</div>
        <div class="geo-wrap">
          <span class="muted" style="align-self:center;">地区分布：</span>
          {country_html}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-head">
        <h2 style="margin:0;">实时下载明细（最新 {len(data["recent"])} 条）</h2>
        <input id="filter-input" class="search-input" type="search" placeholder="筛选文件名 / IP / 地区 / 设备..." />
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>北京时间</th>
              <th>安装包</th>
              <th>渠道</th>
              <th>地区</th>
              <th>真实 IP</th>
              <th>设备 / 客户端</th>
              <th>来源 Referer</th>
            </tr>
          </thead>
          <tbody id="records-body">
            {table_rows}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  <script>
    const inp = document.getElementById('filter-input');
    const tbody = document.getElementById('records-body');
    if (inp && tbody) {{
      inp.addEventListener('input', () => {{
        const q = inp.value.trim().toLowerCase();
        tbody.querySelectorAll('tr').forEach((tr) => {{
          tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? '' : 'none';
        }});
      }});
    }}
  </script>
</body>
</html>
"""


def render_csv(rows: list[dict[str, Any]]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["ID", "北京时间", "渠道", "版本", "安装包", "平台分类", "计入次数", "状态原因", "地区", "真实IP", "设备客户端", "来源Referer", "UserAgent"])
    for r in rows:
        writer.writerow([
            r["id"], r["ts_cst"], r["source"], r["version"], r["filename"], r["platform"],
            r["counted"], r["reason"], r["country"], r["ip"], r["device"], r["referer"], r["user_agent"],
        ])
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


class TrackerHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        # Quiet stdout; all events are persisted in SQLite & JSONL
        return

    def _send_bytes(self, status: int, content_type: str, body: bytes, extra_headers: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD" and body:
            self.wfile.write(body)

    def _check_admin_token(self, qs: dict[str, list[str]]) -> str | None:
        if not STATS_TOKEN:
            return None
        cand = (qs.get("token", [""])[0] or self.headers.get("X-Stats-Token") or "").strip()
        if cand and hmac.compare_digest(cand, STATS_TOKEN):
            return cand
        return None

    def _handle_release_file(self, rel_path: str) -> None:
        clean_rel = unquote(rel_path).lstrip("/")
        if not clean_rel or ".." in clean_rel.split("/"):
            self._send_bytes(HTTPStatus.NOT_FOUND, "text/plain; charset=utf-8", b"Not Found")
            return

        target = (RELEASES_ROOT / clean_rel).resolve()
        try:
            target.relative_to(RELEASES_ROOT)
        except ValueError:
            self._send_bytes(HTTPStatus.FORBIDDEN, "text/plain; charset=utf-8", b"Forbidden")
            return

        if not target.is_file():
            self._send_bytes(HTTPStatus.NOT_FOUND, "text/plain; charset=utf-8", b"Not Found")
            return

        parts = clean_rel.split("/")
        version = parts[0] if len(parts) >= 2 else "unknown"
        filename = target.name
        file_size = target.stat().st_size
        ip, country, referer, ua = extract_client_info(self)
        range_hdr = self.headers.get("Range") or ""

        record_event(
            source="qianyi_cdn",
            version=version,
            filename=filename,
            file_size=file_size,
            method=self.command,
            range_header=range_hdr,
            ip=ip,
            country=country,
            referer=referer,
            ua=ua,
        )

        # Delegate actual file transfer to Nginx internal sendfile location
        accel_path = "/_kurocat_releases/" + quote(clean_rel, safe="/")
        self.send_response(HTTPStatus.OK)
        self.send_header("X-Accel-Redirect", accel_path)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/kurocat/releases/"):
            self._handle_release_file(parsed.path[len("/kurocat/releases/"):])
            return
        if parsed.path == "/kurocat/api/stats":
            self._send_bytes(HTTPStatus.OK, "application/json; charset=utf-8", b"", {"Cache-Control": "no-store"})
            return
        self._send_bytes(HTTPStatus.NOT_FOUND, "text/plain; charset=utf-8", b"")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path.startswith("/kurocat/releases/"):
            self._handle_release_file(path[len("/kurocat/releases/"):])
            return

        if path == "/kurocat/api/stats":
            valid_token = self._check_admin_token(qs)
            if not valid_token:
                self._send_bytes(
                    HTTPStatus.FORBIDDEN,
                    "application/json; charset=utf-8",
                    b'{"error":"forbidden"}',
                    {"Cache-Control": "no-store"},
                )
                return
            data = query_stats(include_raw=False, limit=1)
            gh = get_github_stats_snapshot()
            qianyi_dl = int(data["total_downloads"])
            github_dl = int(gh.get("github_downloads") or 0)
            safe_payload = {
                "total_downloads": qianyi_dl,
                "qianyi_downloads": qianyi_dl,
                "today_downloads": int(data["today_downloads"]),
                "github_downloads": github_dl,
                "github_win_downloads": int(gh.get("github_win_downloads") or 0),
                "github_mac_downloads": int(gh.get("github_mac_downloads") or 0),
                "combined_downloads": qianyi_dl + github_dl,
                "github_clicks": int(data["github_clicks"]),
                "by_file": {x["filename"]: x["count"] for x in data["by_file"]},
                "updated_at_cst": data["updated_at_cst"],
                "github_updated_at_cst": gh.get("github_updated_at_cst") or "",
            }
            body = json.dumps(safe_payload, ensure_ascii=False).encode("utf-8")
            self._send_bytes(
                HTTPStatus.OK,
                "application/json; charset=utf-8",
                body,
                {"Cache-Control": "no-store"},
            )
            return

        if path in ("/kurocat/stats", "/kurocat/stats/"):
            valid_token = self._check_admin_token(qs)
            if not valid_token:
                self._send_bytes(
                    HTTPStatus.FORBIDDEN,
                    "text/plain; charset=utf-8",
                    b"403 Forbidden: valid ?token=... required",
                    {"Cache-Control": "no-store"},
                )
                return

            show_raw = qs.get("raw", ["0"])[0] == "1"
            fmt = qs.get("format", ["html"])[0].lower()
            limit = int(qs.get("limit", ["250"])[0]) if qs.get("limit", ["250"])[0].isdigit() else 250
            data = query_stats(include_raw=show_raw, limit=limit)

            if fmt == "json":
                body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
                self._send_bytes(
                    HTTPStatus.OK,
                    "application/json; charset=utf-8",
                    body,
                    {"Cache-Control": "no-store"},
                )
                return

            if fmt == "csv":
                csv_bytes = render_csv(data["recent"])
                fname = f"kurocat-downloads-{data['today_cst'].replace('-', '')}.csv"
                self._send_bytes(
                    HTTPStatus.OK,
                    "text/csv; charset=utf-8",
                    csv_bytes,
                    {
                        "Cache-Control": "no-store",
                        "Content-Disposition": f'attachment; filename="{fname}"',
                    },
                )
                return

            page = render_dashboard_html(data, valid_token, show_raw).encode("utf-8")
            self._send_bytes(
                HTTPStatus.OK,
                "text/html; charset=utf-8",
                page,
                {"Cache-Control": "no-store"},
            )
            return

        self._send_bytes(HTTPStatus.NOT_FOUND, "text/plain; charset=utf-8", b"Not Found")

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/kurocat/api/track-outbound":
            self._send_bytes(HTTPStatus.NOT_FOUND, "text/plain; charset=utf-8", b"Not Found")
            return

        try:
            length = min(4096, int(self.headers.get("Content-Length") or "0"))
            raw = self.rfile.read(length) if length > 0 else b"{}"
            payload = json.loads(raw.decode("utf-8", errors="replace"))
        except Exception:
            self._send_bytes(HTTPStatus.BAD_REQUEST, "text/plain; charset=utf-8", b"Bad Request")
            return

        filename = str(payload.get("filename") or "").strip()
        version = str(payload.get("version") or "unknown").strip()[:32]
        if not ALLOWED_FILENAME_RE.match(filename):
            self._send_bytes(HTTPStatus.BAD_REQUEST, "text/plain; charset=utf-8", b"Invalid filename")
            return

        ip, country, referer, ua = extract_client_info(self)
        record_event(
            source="github_outbound",
            version=version,
            filename=filename,
            file_size=0,
            method="POST",
            range_header="",
            ip=ip,
            country=country,
            referer=referer,
            ua=ua,
        )
        self._send_bytes(HTTPStatus.NO_CONTENT, "text/plain; charset=utf-8", b"", {"Cache-Control": "no-store"})


def main() -> None:
    init_storage()
    start_github_sync_thread()
    server = ThreadingHTTPServer((HOST, PORT), TrackerHandler)
    print(f"kurocat-dl-tracker listening on http://{HOST}:{PORT} (root={RELEASES_ROOT}, db={DB_PATH})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
