#!/usr/bin/env python3
"""
Build the prototype served at nbc-website-revamp.pages.dev.

THE APPROACH
    Step 1 — copy nbc.org.nz as it stands. Every page in the site's own
    sitemap is mirrored with wget, together with its stylesheets, scripts,
    fonts and images, so the copy is self-contained and does not depend on
    the church's server. URLs keep the same shape: /who-we-are/, /services/,
    /ministries/kids/ and so on.

    Step 2 — change as little as possible on top of it. Each mirrored page
    gets five additions and nothing else:

        1. a prototype banner
        2. a language switcher strip
        3. one extra navigation item, Bible, with two children
        4. a mobile action bar
        5. noindex + canonical, so it never competes with the real site

    Pages that do not exist yet — the Bible reader, the passage finder, the
    three language landing pages, the first-visit page — are rendered inside
    the theme's own page shell, taken from a mirrored page, so they inherit
    the site's real styling rather than being bolted on.

WHY THE FILENAMES GET REWRITTEN
    WordPress serves assets with cache-busting query strings
    (style.css?ver=1.0.0). wget saves those as files with a literal "?" in
    the name and percent-encodes the links. A static host resolves the "?"
    as the start of a query string and returns 404, so both the filenames
    and the references are normalised here.

USAGE
    python3 build-site.py --fetch    # mirror nbc.org.nz into src/mirror/
    python3 build-site.py            # build the site from that mirror
"""

import json
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
MIRROR = SRC / "mirror"
ASSETS = ROOT / "assets"

REPO_URL = "https://github.com/14H034160212/nbc-website-revamp"
REAL = "https://nbc.org.nz"

# Files the host will not serve. Cloudflare Pages caps a single file at
# 25 MiB, and the home page slider carries a 38 MB intro video. It is left
# on the church's own server and referenced absolutely, exactly as a visitor
# streams it today.
TOO_BIG = 25 * 1024 * 1024

# Our own pages, and the page whose markup is borrowed as their shell.
SHELL_PAGE = "contact/index.html"

# New menu entries, as root-absolute paths so they work at every depth.
NEW_PAGES = [("/bible/", "Read the Bible"), ("/ask/", "Find a Passage")]

LANGS = [
    ("en", "English", "/"),
    ("zh-Hans", "中文", "/zh/"),
    ("ko", "한국어", "/ko/"),
    ("mi", "Te Reo Māori", "/mi/"),
]

# Values the live site does not publish anywhere. Shown as a visible marker
# rather than invented — a made-up address on a church site is worse than an
# obvious gap.
FILLS = {
    "STREET_ADDRESS": '<mark class="todo">Street address to be supplied</mark>',
    "PARKING": '<mark class="todo">Parking details to be supplied</mark>',
    "OFFICE_HOURS": '<mark class="todo">Office hours to be supplied</mark>',
    "BANK_ACCOUNT": '<mark class="todo">Account number — see nbc.org.nz/give-2</mark>',
    "MAP_URL": "https://www.google.com/maps/search/?api=1&query="
               "Northcote+Baptist+Church+Hillcrest+Auckland",
    "TE REO": "",
}


# ==========================================================================
# step 1: mirror
# ==========================================================================

def page_urls():
    """Every page in the site's own sitemap."""
    req = urllib.request.Request(
        f"{REAL}/page-sitemap.xml",
        headers={"User-Agent": "Mozilla/5.0 (site copy for redesign proposal)"},
    )
    with urllib.request.urlopen(req, timeout=45) as r:
        xml = r.read().decode("utf-8", "replace")
    urls = re.findall(r"<loc>([^<]+)</loc>", xml)
    return sorted(set(urls))


def fetch():
    urls = page_urls()
    print(f"  {len(urls)} pages listed in page-sitemap.xml")

    if MIRROR.exists():
        shutil.rmtree(MIRROR)
    MIRROR.mkdir(parents=True)

    listing = SRC / "_urls.txt"
    listing.write_text("\n".join(urls) + "\n", encoding="utf-8")

    # --wait/--limit-rate keep this gentle on a small church's server.
    cmd = [
        "wget", "--quiet", "-i", str(listing), "-P", str(MIRROR),
        "-nH", "-x", "-p", "-k", "-E",
        "--wait=0.3", "--random-wait", "--limit-rate=1500k",
        "--tries=2", "--timeout=25", "-e", "robots=off",
        "--user-agent=Mozilla/5.0 (site copy for redesign proposal)",
    ]
    subprocess.run(cmd, check=False)
    listing.unlink(missing_ok=True)

    files = list(MIRROR.rglob("*"))
    size = sum(f.stat().st_size for f in files if f.is_file())
    print(f"  mirrored {sum(1 for f in files if f.is_file())} files, {size / 1e6:.1f} MB")


# ==========================================================================
# step 2: normalise the copy
# ==========================================================================

QUERY_IN_NAME = re.compile(r"\?.*$")


def strip_query_filenames(root):
    """
    style.css?ver=1.0.0.css -> style.css

    Left alone, a static host reads the "?" as the start of a query string
    and never finds the file.
    """
    renamed = 0
    for f in sorted(root.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if not f.is_file() or "?" not in f.name:
            continue
        clean = QUERY_IN_NAME.sub("", f.name)
        target = f.with_name(clean)
        if target.exists():
            f.unlink()
        else:
            f.rename(target)
        renamed += 1
    return renamed


# WordPress emits its own tags single-quoted (href='...') while the theme and
# page builder use double quotes, so both have to be handled.
LINK_ATTR = re.compile(r'((?:href|src|data-src|poster)=)(["\'])([^"\']*)\2')
CSS_URL = re.compile(r"""(url\(\s*['"]?)([^'")]+)(['"]?\s*\))""")
SRCSET = re.compile(r'(srcset=)(["\'])([^"\']*)\2')

ABSOLUTE = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//|#)", re.I)


def clean_ref(value):
    """Drop the cache-busting query from a relative reference."""
    if ABSOLUTE.match(value):
        return value
    return re.split(r"%3F|\?", value, maxsplit=1)[0]


def strip_query_links(text):
    text = LINK_ATTR.sub(
        lambda m: m.group(1) + m.group(2) + clean_ref(m.group(3)) + m.group(2), text)
    text = CSS_URL.sub(
        lambda m: m.group(1) + clean_ref(m.group(2)) + m.group(3), text)

    def fix_srcset(m):
        out = []
        for part in m.group(3).split(","):
            part = part.strip()
            if not part:
                continue
            bits = part.split()
            bits[0] = clean_ref(bits[0])
            out.append(" ".join(bits))
        return m.group(1) + m.group(2) + ", ".join(out) + m.group(2)

    return SRCSET.sub(fix_srcset, text)


def drop_oversized(site_root):
    """
    Delete files the host will refuse, and point their references home.

    Only the copied output is scanned — src/mirror/ is the source of truth and
    must keep everything, or the next build would have nothing to copy.
    """
    dropped = []
    for top in ("wp-content", "wp-includes"):
        for f in (site_root / top).rglob("*"):
            if f.is_file() and f.stat().st_size > TOO_BIG:
                dropped.append(f.relative_to(site_root).as_posix())
                f.unlink()
    return dropped


# ==========================================================================
# step 2b: the five additions
# ==========================================================================

def banner():
    return (
        '<div class="proto"><div class="proto__inner">'
        "<b>Prototype</b>"
        "<span>Unofficial redesign proposal &mdash; not affiliated with, reviewed by, "
        "or adopted by Northcote Baptist Church.</span>"
        f'<span class="proto__spacer"><a href="{REAL}/" rel="noopener">The real site &rarr;</a></span>'
        '<span><a href="/package.html">About this package</a></span>'
        "</div></div>"
    )


def langbar(current):
    items = "".join(
        f'<li class="nbc-lang__item{" is-current" if href == current else ""}">'
        f'<a class="nbc-lang__link" href="{href}" lang="{code}" hreflang="{code}">{label}</a></li>'
        for code, label, href in LANGS
    )
    return (
        '<div class="nbc-langbar"><div class="nbc-langbar__inner">'
        f'<ul class="nbc-lang">{items}</ul></div></div>'
    )


def actionbar():
    return f"""<nav class="nbc-actionbar" aria-label="Quick links">
<a class="nbc-actionbar__link" href="/services/"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>Sunday 10am</span></a>
<a class="nbc-actionbar__link" href="{FILLS['MAP_URL']}" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg><span>Find us</span></a>
<a class="nbc-actionbar__link" href="/give-2/"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 6.6a4.3 4.3 0 0 0-6.1 0L12 9.3 9.3 6.6a4.3 4.3 0 1 0-6.1 6.1L12 21.5l8.8-8.8a4.3 4.3 0 0 0 0-6.1z"/></svg><span>Give</span></a>
</nav>"""


def nav_extra(current):
    """
    One new top-level item with a submenu, in the theme's own markup.

    Two top-level items would make nine, and the existing seven already reach
    the right edge at 1280px. A parent with children costs one slot and matches
    how About Us and Community are already organised.
    """
    sub = "".join(
        f'<li class="menu-item menu-item-type-post_type menu-item-object-page '
        f'menu-item-depth-1{" current-menu-item" if href == current else ""}">'
        f'<a href="{href}"><span class="nav_item_wrap"><span class="nav_title">{title}'
        f"</span></span></a></li>"
        for href, title in NEW_PAGES
    )
    ancestor = " current-menu-ancestor" if current in dict(NEW_PAGES) else ""
    return (
        f'<li class="menu-item menu-item-type-custom menu-item-object-custom '
        f'menu-item-has-children menu-item-depth-0 nbc-new{ancestor}">'
        f'<a href="/bible/"><span class="nav_item_wrap"><span class="nav_title">Bible'
        f'</span></span></a><ul class="sub-menu">{sub}</ul></li>'
    )


HEAD_EXTRA = (
    '<meta name="robots" content="noindex, nofollow">\n'
    '<link rel="canonical" href="{canonical}">\n'
    '<link rel="stylesheet" href="/assets/addon.css">\n'
)


def inject(html, url_path, canonical, title=None):
    if title:
        html = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", html, count=1, flags=re.S)

    # Our canonical should be the only one.
    html = re.sub(r'<link rel="canonical"[^>]*>', "", html, count=1)
    html = html.replace("</head>", HEAD_EXTRA.format(canonical=canonical) + "</head>", 1)

    m = re.search(r"<body[^>]*>", html)
    if m:
        tag = m.group(0)
        new = (re.sub(r'class="([^"]*)"', r'class="\1 nbc-has-actionbar"', tag)
               if 'class="' in tag else tag[:-1] + ' class="nbc-has-actionbar">')
        html = html.replace(
            tag,
            new + '<a class="nbc-skip" href="#middle">Skip to content</a>'
                + banner() + langbar(url_path),
            1,
        )

    # The theme closes its menu with </ul></div></nav>.
    html = html.replace("</ul></div></nav>", nav_extra(url_path) + "</ul></div></nav>", 1)
    html = html.replace("</body>", actionbar() + "</body>", 1)
    return html


# ==========================================================================
# step 2c: our own pages, inside the theme's shell
# ==========================================================================

START, FINISH = "<!-- Start Content -->", "<!-- Finish Content -->"

ROW = """<div class="cmsmasters_row cmsmasters_color_scheme_default cmsmasters_row_boxed">
<div class="cmsmasters_row_outer_parent"><div class="cmsmasters_row_outer">
<div class="cmsmasters_row_inner"><div class="cmsmasters_row_margin">
<div class="cmsmasters_column one_first">
{heading}<div class="cmsmasters_text">{body}</div>
</div></div></div></div></div>"""

INCLUDE_RE = re.compile(r"<!--INCLUDE:([^>]+?)-->")


def fragment(path, own_heading=False):
    text = Path(path).read_text(encoding="utf-8")
    text = INCLUDE_RE.sub(lambda m: fragment(ROOT / m.group(1).strip()), text)
    for key, val in FILLS.items():
        text = text.replace("{{" + key + "}}", val)
    if own_heading:
        # In WordPress the page title supplies the h1, so these fragments open
        # at h2. Standing alone they need a real h1 or the document has none.
        text = re.sub(r'<h2(\s+class="nbc-(?:welcome|visit)__title"[^>]*)>(.*?)</h2>',
                      r"<h1\1>\2</h1>", text, count=1, flags=re.S)
    return text


def new_page(out_dir, title, h1, body, lang="en", extra_js=""):
    """`out_dir` is a directory like "bible" -> /bible/index.html."""
    shell = (ROOT / SHELL_PAGE).read_text(encoding="utf-8")
    a, b = shell.index(START), shell.index(FINISH)

    page = (
        shell[:a]
        + START
        + '\n<div class="middle_content entry" role="main">\n'
        + ROW.format(
            heading=(f'<div class="cmsmasters_heading_wrap">'
                     f'<h1 class="cmsmasters_heading">{h1}</h1></div>' if h1 else ""),
            body=body,
        )
        + "\n</div>\n"
        + shell[b:]
    )
    page = re.sub(r'<html([^>]*)\slang="[^"]*"', r'<html\1 lang="%s"' % lang, page, count=1)

    # The shell already carries the injections from the mirrored page; swap the
    # per-page bits (title, canonical, current language, current menu item).
    page = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", page, count=1, flags=re.S)
    page = re.sub(r'<link rel="canonical"[^>]*>',
                  f'<link rel="canonical" href="{REAL}/">', page, count=1)
    page = re.sub(r'<div class="nbc-langbar">.*?</div></div>', langbar(f"/{out_dir}/"),
                  page, count=1, flags=re.S)
    page = re.sub(r'<li class="menu-item menu-item-type-custom menu-item-object-custom '
                  r'menu-item-has-children menu-item-depth-0 nbc-new.*?</ul></li>',
                  nav_extra(f"/{out_dir}/"), page, count=1, flags=re.S)

    if extra_js:
        page = page.replace("</body>", extra_js + "</body>", 1)

    target = ROOT / out_dir / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(page, encoding="utf-8")
    return f"/{out_dir}/", len(page)


# ==========================================================================
# assets
# ==========================================================================

def build_assets():
    ASSETS.mkdir(exist_ok=True)
    (ASSETS / "addon.css").write_text(
        (SRC / "addon.css").read_text(encoding="utf-8"), encoding="utf-8")

    books = json.loads((SRC / "booknames.json").read_text(encoding="utf-8"))
    books["names"] = {k: [n.lstrip("﻿") for n in v] for k, v in books["names"].items()}
    ask = (SRC / "ask.js").read_text(encoding="utf-8").replace(
        "/*__BOOKDATA__*/", json.dumps(books, ensure_ascii=False, separators=(",", ":")))
    assert "__BOOKDATA__" not in ask
    (ASSETS / "ask.js").write_text(ask, encoding="utf-8")
    print("  assets/addon.css, assets/ask.js")


# ==========================================================================
# build
# ==========================================================================

GENERATED = ["wp-content", "wp-includes", "assets", "bible", "ask", "zh", "ko", "mi",
             "first-visit"]


def clean_output():
    """Remove the previous build so deleted pages do not linger."""
    for name in GENERATED:
        p = ROOT / name
        if p.is_dir():
            shutil.rmtree(p)
    for f in ROOT.glob("*.html"):
        if f.name not in {"nbc-bible-reader.html", "nbc-proposal.html"}:
            f.unlink()
    # Mirrored page directories: anything holding only an index.html we made.
    for d in ROOT.iterdir():
        if d.is_dir() and d.name not in {".git", "src", "pages", "my-religion-child",
                                         "content", ".claude"} and (d / "index.html").exists():
            shutil.rmtree(d)


def build():
    if not MIRROR.exists():
        raise SystemExit("No mirror yet. Run: python3 build-site.py --fetch")

    clean_output()
    build_assets()

    # -- copy the mirror into place ----------------------------------------
    # The copied page list is collected here rather than globbed back off disk:
    # a glob like */*/index.html also matches src/mirror/index.html, and the
    # injection loop would then rewrite the source of truth on every build.
    pages = []
    for src in MIRROR.rglob("*"):
        if src.is_dir():
            continue
        rel = src.relative_to(MIRROR)
        dest = ROOT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        if dest.name == "index.html":
            pages.append(dest)

    renamed = strip_query_filenames(ROOT / "wp-content") + \
        strip_query_filenames(ROOT / "wp-includes")
    dropped = drop_oversized(ROOT)

    # -- normalise every text asset ----------------------------------------
    touched = 0
    for f in list((ROOT / "wp-content").rglob("*.css")) + \
            list((ROOT / "wp-includes").rglob("*.css")):
        f.write_text(strip_query_links(f.read_text(encoding="utf-8", errors="replace")),
                     encoding="utf-8")
        touched += 1

    # -- inject into every mirrored page ------------------------------------
    for f in sorted(pages):
        rel = f.relative_to(ROOT).as_posix()
        url_path = "/" + rel[: -len("index.html")]
        html = strip_query_links(f.read_text(encoding="utf-8", errors="replace"))

        # Files we removed for size stay on the church's own server.
        for gone in dropped:
            html = re.sub(r'(?:\.\./)*' + re.escape(gone), f"{REAL}/{gone}", html)

        f.write_text(inject(html, url_path, REAL + url_path), encoding="utf-8")

    print(f"  mirrored {len(pages)} pages, renamed {renamed} query-string assets, "
          f"rewrote {touched} stylesheets")
    if dropped:
        for gone in dropped:
            print(f"  left on the church's server (over {TOO_BIG // 1024 // 1024} MB): {gone}")

    # -- our own pages ------------------------------------------------------
    made = [
        new_page("bible", "Online Bible — Northcote Baptist Church (prototype)",
                 "Online Bible",
                 "<p>Read any chapter in two languages side by side. Free to use, no "
                 "account needed. Choose a version on the left and, if you want a "
                 "parallel column, a second one beside it.</p>"
                 + fragment(ROOT / "nbc-bible-reader.html")),
        new_page("ask", "Find a Passage — Northcote Baptist Church (prototype)",
                 "Find a Passage", fragment(SRC / "ask.html"),
                 extra_js='<script src="/assets/ask.js"></script>'),
        new_page("first-visit",
                 "Planning your first visit — Northcote Baptist Church (prototype)",
                 None, fragment(ROOT / "pages" / "first-visit.html", own_heading=True)),
    ]
    for out, src, lang, title in [
        ("zh", "welcome-zh.html", "zh-Hans", "中文 — 北岸浸信会（原型）"),
        ("ko", "welcome-ko.html", "ko", "한국어 — 노스코트 뱁티스트 교회 (프로토타입)"),
        ("mi", "welcome-mi.html", "mi", "Te Reo Māori — Northcote Baptist Church (prototype)"),
    ]:
        made.append(new_page(out, title, None,
                             fragment(ROOT / "pages" / src, own_heading=True), lang=lang))
    for path, size in made:
        print(f"  new page {path:16s} {size:>8,} bytes")


def build_preview():
    css = (ROOT / "my-religion-child" / "style.css").read_text(encoding="utf-8")
    blocks = [
        ("vision-mission-values", "替换 NBC_vision-mission-values.jpg 等三张图"),
        ("creed", "替换 Creed.jpg，轮盘改为 2 KB 内联 SVG"),
        ("strategic-principles", "替换 NBC-Strategic-Principles.jpg"),
        ("first-visit", "新页面：第一次来"),
        ("welcome-zh", "新页面 /zh/"),
        ("welcome-ko", "新页面 /ko/"),
        ("welcome-mi", "新页面 /mi/，有意做成双语"),
    ]
    html = f"""<!doctype html>
<html lang="zh-Hans"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>粘贴区块预览</title><meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fjalla+One&family=Crimson+Text:wght@400;600&family=Source+Sans+3:wght@300;400;600;700&display=swap">
<style>@font-face{{font-family:'Source Sans Pro';src:local('Source Sans 3');}}</style>
<style>{css}</style>
<style>body{{margin:0;background:#fff}}
.blk-head{{position:sticky;top:0;z-index:40;padding:10px clamp(16px,4vw,34px);background:#eff1f5;
border-top:1px solid #dce0e8;border-bottom:1px solid #dce0e8;display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline}}
.blk-head code{{font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#22242d;background:#fff;
border:1px solid #dce0e8;border-radius:3px;padding:2px 7px}}
.blk-head em{{font-style:normal;font-size:13px;color:#6b7186}}
.blk-body{{padding:clamp(22px,4vw,44px) clamp(16px,4vw,34px) clamp(34px,5vw,60px)}}</style>
</head><body>
<p style="margin:0;padding:11px clamp(16px,4vw,34px);background:#22242d;color:#c3c8d6;
font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
<b style="color:#fff">区块预览</b> &middot; <a href="/" style="color:#8fbde0">← 回到站点原型</a>
&middot; <a href="{REPO_URL}" style="color:#8fbde0">Source on GitHub</a></p>
"""
    for slug, note in blocks:
        html += (f'<div class="blk-head"><code>pages/{slug}.html</code><em>{note}</em></div>'
                 f'<div class="blk-body entry-content">{fragment(ROOT / "pages" / f"{slug}.html")}</div>')
    html += "\n</body></html>\n"
    (ROOT / "preview.html").write_text(html, encoding="utf-8")
    print(f"  preview.html      {len(html):>8,} bytes")


def build_package():
    html = (SRC / "package.html").read_text(encoding="utf-8")
    (ROOT / "package.html").write_text(html, encoding="utf-8")
    print(f"  package.html      {len(html):>8,} bytes")


if __name__ == "__main__":
    if "--fetch" in sys.argv:
        fetch()
    build()
    build_preview()
    build_package()
