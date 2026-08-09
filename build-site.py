#!/usr/bin/env python3
"""
Build the prototype served at nbc-website-revamp.pages.dev.

THE APPROACH
    The proposal's whole premise is minimum change, so the prototype does not
    redesign anything. It takes nbc.org.nz's own pages — its markup, its
    stylesheets, its header, its slider, its footer — and injects only what
    the new functionality needs:

        1. a prototype banner
        2. a language switcher strip
        3. two extra navigation items (Bible, Find a passage)
        4. a mobile action bar
        5. noindex + canonical, so it never competes with the real site

    Nothing else about the existing pages is touched. What you see is today's
    site with the additions bolted on, which is exactly what the church would
    get.

    Pages that do not exist yet (the Bible reader, the passage finder, the
    three language landing pages, the first-visit page) are rendered inside
    the theme's own page shell so they look native rather than bolted on.

    Not attempted here: swapping the Vision/Values/CREED images for real HTML.
    On the live site those are slides inside a LayerSlider, so replacing them
    is a content edit in the WordPress admin, not a markup injection. The HTML
    replacements are in pages/ and can be reviewed at /preview.

USAGE
    python3 build-site.py            # uses cached copies in src/live/
    python3 build-site.py --fetch    # re-download the source pages first
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
LIVE = SRC / "live"
ASSETS = ROOT / "assets"

REPO_URL = "https://github.com/14H034160212/nbc-website-revamp"
REAL = "https://nbc.org.nz"

# Real pages mirrored as-is, with injections only.
#   output file : (path on nbc.org.nz, cache filename)
MIRRORS = {
    "index.html":       ("/", "home.html"),
    "sunday.html":      ("/services/", "services.html"),
    "who-we-are.html":  ("/who-we-are/", "who-we-are.html"),
    "contact.html":     ("/contact/", "contact.html"),
    "give.html":        ("/give-2/", "give-2.html"),
}

# Real URLs rewritten to their prototype equivalents. Everything else keeps
# pointing at the live site — those pages are unchanged by the proposal, and
# pretending otherwise would overstate what this is.
LINKMAP = {
    f"{REAL}/": "index.html",
    f"{REAL}/services/": "sunday.html",
    f"{REAL}/who-we-are/": "who-we-are.html",
    f"{REAL}/contact/": "contact.html",
    f"{REAL}/give-2/": "give.html",
}

LANGS = [
    ("en", "English", "index.html"),
    ("zh-Hans", "中文", "zh.html"),
    ("ko", "한국어", "ko.html"),
    ("mi", "Te Reo Māori", "mi.html"),
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


# --------------------------------------------------------------------------
# source pages
# --------------------------------------------------------------------------

def fetch_sources():
    LIVE.mkdir(parents=True, exist_ok=True)
    for path, cache in MIRRORS.values():
        req = urllib.request.Request(
            REAL + path,
            headers={"User-Agent": "Mozilla/5.0 (prototype build; nbc-website-revamp)"},
        )
        with urllib.request.urlopen(req, timeout=45) as r:
            html = r.read().decode("utf-8", "replace")
        (LIVE / cache).write_text(html, encoding="utf-8")
        print(f"  fetched {path:16s} -> src/live/{cache}  ({len(html):,} bytes)")


def source(cache):
    f = LIVE / cache
    if not f.exists():
        raise SystemExit(
            f"Missing {f}. Run: python3 build-site.py --fetch\n"
            "(The cached copies are not committed — they are the church's own markup.)"
        )
    return f.read_text(encoding="utf-8")


# --------------------------------------------------------------------------
# the injections
# --------------------------------------------------------------------------

def banner():
    return (
        '<div class="proto"><div class="proto__inner">'
        "<b>Prototype</b>"
        "<span>Unofficial redesign proposal &mdash; not affiliated with, reviewed by, "
        "or adopted by Northcote Baptist Church.</span>"
        f'<span class="proto__spacer"><a href="{REAL}/" rel="noopener">The real site &rarr;</a></span>'
        '<span><a href="package.html">About this package</a></span>'
        "</div></div>"
    )


def langbar(current):
    items = []
    for code, label, href in LANGS:
        cur = " is-current" if href == current else ""
        items.append(
            f'<li class="nbc-lang__item{cur}">'
            f'<a class="nbc-lang__link" href="{href}" lang="{code}" hreflang="{code}">{label}</a></li>'
        )
    return (
        '<div class="nbc-langbar"><div class="nbc-langbar__inner">'
        f'<ul class="nbc-lang">{"".join(items)}</ul>'
        "</div></div>"
    )


def actionbar():
    return f"""<nav class="nbc-actionbar" aria-label="Quick links">
<a class="nbc-actionbar__link" href="sunday.html"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>Sunday 10am</span></a>
<a class="nbc-actionbar__link" href="{FILLS['MAP_URL']}" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg><span>Find us</span></a>
<a class="nbc-actionbar__link" href="give.html"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 6.6a4.3 4.3 0 0 0-6.1 0L12 9.3 9.3 6.6a4.3 4.3 0 1 0-6.1 6.1L12 21.5l8.8-8.8a4.3 4.3 0 0 0 0-6.1z"/></svg><span>Give</span></a>
</nav>"""


def nav_extras(current):
    """
    One new top-level item with a submenu, in the theme's own markup.

    Two top-level items would make nine, and the existing seven already reach
    the right edge at 1280px. A parent with children costs one slot and matches
    how About Us and Community are already organised.
    """
    kids = [("bible.html", "Read the Bible"), ("ask.html", "Find a Passage")]
    sub = "".join(
        f'<li class="menu-item menu-item-type-post_type menu-item-object-page '
        f'menu-item-depth-1{" current-menu-item" if href == current else ""}">'
        f'<a href="{href}"><span class="nav_item_wrap"><span class="nav_title">{title}'
        f"</span></span></a></li>"
        for href, title in kids
    )
    active = " current-menu-ancestor" if current in dict(kids) else ""
    return (
        f'<li class="menu-item menu-item-type-custom menu-item-object-custom '
        f'menu-item-has-children menu-item-depth-0 nbc-new{active}">'
        f'<a href="bible.html"><span class="nav_item_wrap"><span class="nav_title">Bible'
        f'</span></span></a><ul class="sub-menu">{sub}</ul></li>'
    )


HEAD_EXTRA = """<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="{canonical}">
<link rel="stylesheet" href="assets/addon.css">
"""


def inject(html, current, title=None, canonical=f"{REAL}/"):
    """Apply the five additions to a full page of real markup."""

    # -- head ---------------------------------------------------------------
    if title:
        html = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", html, count=1, flags=re.S)
    html = html.replace("</head>", HEAD_EXTRA.format(canonical=canonical) + "</head>", 1)

    # Drop any canonical/shortlink the real page carries, so ours is the only one.
    html = re.sub(r'<link rel="canonical"[^>]*/?>\s*(?=<meta name="robots")', "", html, count=1)

    # -- rewrite the links we have prototype pages for ----------------------
    for real_url, local in LINKMAP.items():
        html = html.replace(f'href="{real_url}"', f'href="{local}"')

    # -- body ---------------------------------------------------------------
    m = re.search(r"<body[^>]*>", html)
    if m:
        body_tag = m.group(0)
        # Mark the body so the action-bar footer padding applies.
        new_tag = re.sub(r'class="([^"]*)"', r'class="\1 nbc-has-actionbar"', body_tag) \
            if 'class="' in body_tag else body_tag[:-1] + ' class="nbc-has-actionbar">'
        html = html.replace(
            body_tag,
            new_tag
            + '<a class="nbc-skip" href="#middle">Skip to content</a>'
            + banner()
            + langbar(current),
            1,
        )

    # -- navigation ---------------------------------------------------------
    # The theme closes its menu with </ul></div></nav>; append before that.
    html = html.replace("</ul></div></nav>", nav_extras(current) + "</ul></div></nav>", 1)

    # -- action bar ---------------------------------------------------------
    html = html.replace("</body>", actionbar() + "</body>", 1)

    return html


# --------------------------------------------------------------------------
# new pages, rendered inside the theme's own shell
# --------------------------------------------------------------------------

START = "<!-- Start Content -->"
FINISH = "<!-- Finish Content -->"

ROW = """<div class="cmsmasters_row cmsmasters_color_scheme_default cmsmasters_row_boxed">
<div class="cmsmasters_row_outer_parent"><div class="cmsmasters_row_outer">
<div class="cmsmasters_row_inner"><div class="cmsmasters_row_margin">
<div class="cmsmasters_column one_first">
{heading}<div class="cmsmasters_text">{body}</div>
</div></div></div></div></div>"""


def shell_page(out, title, h1, body, lang="en", extra_js="", canonical=f"{REAL}/"):
    # h1=None means the body fragment already carries its own heading; emitting
    # a second one would give the page two competing titles.
    """Wrap our own content in a real page's header/footer."""
    raw = source("contact.html")
    a, b = raw.index(START), raw.index(FINISH)
    head, tail = raw[:a], raw[b:]

    page = (
        head
        + START
        + '\n<div class="middle_content entry" role="main">\n'
        + ROW.format(
            heading=(f'<div class="cmsmasters_heading_wrap">'
                     f'<h1 class="cmsmasters_heading">{h1}</h1></div>' if h1 else ""),
            body=body,
        )
        + "\n</div>\n"
        + tail
    )

    page = re.sub(r'<html([^>]*)\slang="[^"]*"', r'<html\1 lang="%s"' % lang, page, count=1)
    page = inject(page, out, title=title, canonical=canonical)
    if extra_js:
        page = page.replace("</body>", extra_js + "</body>", 1)

    (ROOT / out).write_text(page, encoding="utf-8")
    return out, len(page)


INCLUDE_RE = re.compile(r"<!--INCLUDE:([^>]+?)-->")


def fragment(path, own_heading=False):
    text = Path(path).read_text(encoding="utf-8")
    text = INCLUDE_RE.sub(lambda m: fragment(ROOT / m.group(1).strip()), text)
    for key, val in FILLS.items():
        text = text.replace("{{" + key + "}}", val)
    if own_heading:
        # In WordPress the page title supplies the h1, so these fragments open at
        # h2. Standing alone they need a real h1 or the document has none.
        text = re.sub(r'<h2(\s+class="nbc-(?:welcome|visit)__title"[^>]*)>(.*?)</h2>',
                      r'<h1\1>\2</h1>', text, count=1, flags=re.S)
    return text


# --------------------------------------------------------------------------
# assets
# --------------------------------------------------------------------------

def build_assets():
    ASSETS.mkdir(exist_ok=True)
    (ASSETS / "addon.css").write_text(
        (SRC / "addon.css").read_text(encoding="utf-8"), encoding="utf-8"
    )

    books = json.loads((SRC / "booknames.json").read_text(encoding="utf-8"))
    books["names"] = {k: [n.lstrip("﻿") for n in v] for k, v in books["names"].items()}
    ask = (SRC / "ask.js").read_text(encoding="utf-8").replace(
        "/*__BOOKDATA__*/", json.dumps(books, ensure_ascii=False, separators=(",", ":"))
    )
    assert "__BOOKDATA__" not in ask
    (ASSETS / "ask.js").write_text(ask, encoding="utf-8")
    print("  assets/addon.css\n  assets/ask.js")


# --------------------------------------------------------------------------
# build
# --------------------------------------------------------------------------

def build():
    made = []

    for out, (path, cache) in MIRRORS.items():
        html = inject(source(cache), out, canonical=REAL + path)
        (ROOT / out).write_text(html, encoding="utf-8")
        made.append((out, len(html), "mirror of " + path))

    made.append(shell_page(
        "bible.html",
        "Online Bible — Northcote Baptist Church (prototype)",
        "Online Bible",
        '<p>Read any chapter in two languages side by side. Free to use, no account '
        'needed. Choose a version on the left and, if you want a parallel column, '
        'a second one beside it.</p>'
        + fragment(ROOT / "nbc-bible-reader.html"),
    ) + ("new page",))

    made.append(shell_page(
        "ask.html",
        "Find a Passage — Northcote Baptist Church (prototype)",
        "Find a Passage",
        fragment(SRC / "ask.html"),
        extra_js='<script src="assets/ask.js"></script>',
    ) + ("new page",))

    made.append(shell_page(
        "first-visit.html",
        "Planning your first visit — Northcote Baptist Church (prototype)",
        None,
        fragment(ROOT / "pages" / "first-visit.html", own_heading=True),
    ) + ("new page",))

    for out, src, lang, title in [
        ("zh.html", "welcome-zh.html", "zh-Hans", "中文 — 北岸浸信会（原型）"),
        ("ko.html", "welcome-ko.html", "ko", "한국어 — 노스코트 뱁티스트 교회 (프로토타입)"),
        ("mi.html", "welcome-mi.html", "mi", "Te Reo Māori — Northcote Baptist Church (prototype)"),
    ]:
        made.append(shell_page(
            out, title, None, fragment(ROOT / "pages" / src, own_heading=True), lang=lang
        ) + ("new page",))

    return made


def build_preview():
    """Every paste-in block, with the child theme stylesheet applied."""
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
<b style="color:#fff">区块预览</b> &middot; <a href="index.html" style="color:#8fbde0">← 回到站点原型</a>
&middot; <a href="{REPO_URL}" style="color:#8fbde0">Source on GitHub</a></p>
"""
    for slug, note in blocks:
        html += (f'<div class="blk-head"><code>pages/{slug}.html</code><em>{note}</em></div>'
                 f'<div class="blk-body entry-content">{fragment(ROOT / "pages" / f"{slug}.html")}</div>')
    html += "\n</body></html>\n"
    (ROOT / "preview.html").write_text(html, encoding="utf-8")
    return "preview.html", len(html), "block previews"


def build_package():
    html = (SRC / "package.html").read_text(encoding="utf-8")
    (ROOT / "package.html").write_text(html, encoding="utf-8")
    return "package.html", len(html), "package description"


if __name__ == "__main__":
    if "--fetch" in sys.argv:
        fetch_sources()
    build_assets()
    for name, size, note in build() + [build_preview(), build_package()]:
        print(f"  {name:20s} {size:>8,} bytes   {note}")
