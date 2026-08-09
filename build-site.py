#!/usr/bin/env python3
"""
Build the prototype site served at nbc-website-revamp.pages.dev.

WHAT THIS BUILDS AND WHY
    The deliverables in pages/ and nbc-bible-reader.html are *fragments* —
    they are written to be pasted into a WordPress "Custom HTML" block, so
    they carry no <!doctype>, <head> or viewport. This script wraps them in
    a shared layout so the whole redesign can be clicked through as a real
    site, without WordPress.

    Header, navigation, footer and the client-side language switcher exist
    only in the prototype. On nbc.org.nz the parent theme supplies the
    chrome and Polylang supplies the languages — see README.md.

USAGE
    python3 build-site.py
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
ASSETS = ROOT / "assets"

SITE_URL = "https://nbc-website-revamp.pages.dev"
REPO_URL = "https://github.com/14H034160212/nbc-website-revamp"
REAL_SITE = "https://nbc.org.nz/"

# Values the live site does not publish. Rendered as a visible marker rather
# than quietly invented — an invented address on a church site is worse than
# an obvious gap.
FILLS = {
    "STREET_ADDRESS": '<mark class="todo">Street address to be supplied</mark>',
    "PARKING": '<mark class="todo">Parking details to be supplied</mark>',
    "OFFICE_HOURS": '<mark class="todo">Office hours to be supplied</mark>',
    "BANK_ACCOUNT": '<mark class="todo">Account number — see nbc.org.nz/give-2</mark>',
    "MAP_URL": "https://www.google.com/maps/search/?api=1&query="
               "Northcote+Baptist+Church+Hillcrest+Auckland",
    "TE REO": "",
}

BRAND_MARK = (
    '<svg class="brand__mark" viewBox="0 0 40 40" aria-hidden="true" focusable="false">'
    '<g fill="none" stroke="#d14f42" stroke-width="1.6" stroke-linejoin="round">'
    '<path d="M16 3h8l-4 6z"/><path d="M16 3l4 6-8 5z"/><path d="M24 3l-4 6 8 5z"/>'
    '<path d="M4 14h32l-16 10z"/><path d="M20 24v13"/>'
    "</g></svg>"
)

NAV = [
    ("index.html", "nav.home", "Home"),
    ("sunday.html", "nav.sunday", "On Sunday"),
    ("first-visit.html", "nav.visit", "First visit"),
    ("bible.html", "nav.bible", "Bible"),
    ("ask.html", "nav.ask", "Find a passage"),
    ("contact.html", "nav.contact", "Contact"),
]
NAV_CTA = ("give.html", "nav.give", "Give")


# --------------------------------------------------------------------------
# assets
# --------------------------------------------------------------------------

FORM_CSS = """
/* ---- prototype-only form + unfilled-value marker ----------------------- */
.proto-form { display: grid; gap: 16px; max-width: 34rem; margin: 26px 0 0; }
.proto-form label { display: grid; gap: 5px; }
.proto-form label span {
	font-family: 'Fjalla One', Arial, sans-serif;
	font-size: .74rem; letter-spacing: .11em; text-transform: uppercase;
	color: var(--nbc-ink);
}
.proto-form input, .proto-form select, .proto-form textarea {
	width: 100%; padding: 10px 13px; font-size: 1rem; font-family: inherit;
	color: var(--nbc-ink); background: #fff;
	border: 1px solid var(--nbc-line); border-radius: 3px;
}
.proto-form textarea { resize: vertical; }
.proto-form button { justify-self: start; border: 0; cursor: pointer; }
.proto-form__note {
	margin: 0; padding: 12px 16px; background: #f7f7f9;
	border-left: 2px solid var(--nbc-blue);
	font-size: .88rem; line-height: 1.6;
}

mark.todo {
	background: #fff4d6; color: #6b5316; padding: 1px 6px;
	border-radius: 2px; font-size: .92em; font-style: normal;
	box-decoration-break: clone; -webkit-box-decoration-break: clone;
}
"""


def build_assets():
    ASSETS.mkdir(exist_ok=True)

    css = "\n\n".join([
        (ROOT / "my-religion-child" / "style.css").read_text(encoding="utf-8"),
        (SRC / "chrome.css").read_text(encoding="utf-8"),
        (SRC / "ask.css").read_text(encoding="utf-8"),
        FORM_CSS,
    ])
    (ASSETS / "site.css").write_text(css, encoding="utf-8")

    (ASSETS / "site.js").write_text(
        (SRC / "site.js").read_text(encoding="utf-8"), encoding="utf-8"
    )

    books = json.loads((SRC / "booknames.json").read_text(encoding="utf-8"))
    books["names"] = {k: [n.lstrip("﻿") for n in v] for k, v in books["names"].items()}
    ask = (SRC / "ask.js").read_text(encoding="utf-8").replace(
        "/*__BOOKDATA__*/", json.dumps(books, ensure_ascii=False, separators=(",", ":"))
    )
    assert "__BOOKDATA__" not in ask
    (ASSETS / "ask.js").write_text(ask, encoding="utf-8")

    return [("assets/site.css", len(css)), ("assets/site.js", 0), ("assets/ask.js", len(ask))]


# --------------------------------------------------------------------------
# layout
# --------------------------------------------------------------------------

def head(title, desc, page, lang, extra_head="", force_lang=""):
    force_attr = f' data-force-lang="{force_lang}"' if force_lang else ""
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<!-- This prototype must never compete with the real church website in search. -->
<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="{REAL_SITE}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><text y='14' font-size='14'>&#9962;</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fjalla+One&family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=Source+Sans+3:wght@300;400;600;700&display=swap">
<style>
/* The parent theme calls the body face "Source Sans Pro"; Google now serves
   it as "Source Sans 3". Alias it so the theme's own font stacks resolve. */
@font-face {{ font-family: 'Source Sans Pro'; src: local('Source Sans 3'); }}
</style>
<link rel="stylesheet" href="assets/site.css">
{extra_head}
</head>
<body class="nbc-has-actionbar" data-page="{page}"{force_attr}>

<a class="nbc-skip" href="#nbc-main">Skip to content</a>

<div class="proto">
  <div class="proto__inner">
    <b>Prototype</b>
    <span>Unofficial redesign proposal — not affiliated with, reviewed by, or adopted by Northcote Baptist Church.</span>
    <span class="proto__spacer"><a href="{REAL_SITE}" rel="noopener">The real site →</a></span>
    <span><a href="package.html">About this package</a></span>
  </div>
</div>

<div class="nbc-langbar">
  <div class="nbc-langbar__inner" style="display:block;text-align:right">
    <div data-lang-switcher style="display:flex;justify-content:flex-end"></div>
    <p class="lang-note" id="lang-note" style="margin-left:auto" hidden></p>
  </div>
</div>

<header class="site-head">
  <div class="site-head__inner">
    <a class="brand" href="index.html">
      {BRAND_MARK}
      <span class="brand__name"><b>northcote</b><span>baptist church</span></span>
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Menu"><span></span></button>
    <nav class="site-nav" id="site-nav" aria-label="Main">
      <ul>
{{nav_items}}
      </ul>
    </nav>
  </div>
</header>

<main id="nbc-main" tabindex="-1">
"""


def nav_html(page):
    out = []
    for href, key, fallback in NAV:
        cur = ' aria-current="page"' if href == page else ""
        out.append(f'        <li><a href="{href}"{cur} data-i18n="{key}">{fallback}</a></li>')
    href, key, fallback = NAV_CTA
    cur = ' aria-current="page"' if href == page else ""
    out.append(f'        <li><a class="is-cta" href="{href}"{cur} data-i18n="{key}">{fallback}</a></li>')
    return "\n".join(out)


FOOT = f"""
</main>

<footer class="site-foot">
  <div class="shell">
    <div class="foot-grid">
      <div>
        <h3 data-i18n="foot.visit">Visit</h3>
        <p data-i18n="foot.when">Sundays, 10:00am — finishes around 11:15am</p>
        <p data-i18n="foot.where">Hillcrest, Auckland, New Zealand</p>
        <p><a href="first-visit.html" data-i18n="nav.visit">First visit</a></p>
      </div>
      <div>
        <h3 data-i18n="foot.explore">Explore</h3>
        <ul>
          <li><a href="sunday.html" data-i18n="nav.sunday">On Sunday</a></li>
          <li><a href="bible.html" data-i18n="nav.bible">Bible</a></li>
          <li><a href="ask.html" data-i18n="nav.ask">Find a passage</a></li>
          <li><a href="give.html" data-i18n="nav.give">Give</a></li>
        </ul>
      </div>
      <div>
        <h3 data-i18n="foot.contact">Contact</h3>
        <ul>
          <li><a href="tel:+6494807064">(09) 480 7064</a></li>
          <li><a href="mailto:office@nbc.org.nz">office@nbc.org.nz</a></li>
          <li><a href="contact.html" data-i18n="nav.contact">Contact</a></li>
        </ul>
      </div>
      <div>
        <h3 data-i18n="foot.langs">Your language</h3>
        <ul>
          <li><a href="index.html">English</a></li>
          <li><a href="zh.html" lang="zh-Hans">&#20013;&#25991;</a></li>
          <li><a href="ko.html" lang="ko">&#54620;&#44397;&#50612;</a></li>
          <li><a href="mi.html" lang="mi">Te Reo M&#257;ori</a></li>
        </ul>
      </div>
    </div>
    <p class="foot-bottom">
      This is an unofficial prototype of a redesign proposal. It is not affiliated
      with, reviewed by, or adopted by Northcote Baptist Church, and it is excluded
      from search engines. Content and photographs belong to the church and are shown
      here to illustrate the proposed layout. The real site is at
      <a href="{REAL_SITE}" rel="noopener">nbc.org.nz</a> ·
      <a href="package.html">what is in this package</a> ·
      <a href="{REPO_URL}" rel="noopener">source</a>
    </p>
  </div>
</footer>

<nav class="nbc-actionbar" aria-label="Quick links">
  <a class="nbc-actionbar__link" href="sunday.html">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
    <span data-i18n="bar.sunday">Sunday 10am</span>
  </a>
  <a class="nbc-actionbar__link" href="{FILLS['MAP_URL']}" rel="noopener">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
    <span data-i18n="bar.find">Find us</span>
  </a>
  <a class="nbc-actionbar__link" href="give.html">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 6.6a4.3 4.3 0 0 0-6.1 0L12 9.3 9.3 6.6a4.3 4.3 0 1 0-6.1 6.1L12 21.5l8.8-8.8a4.3 4.3 0 0 0 0-6.1z"/></svg>
    <span data-i18n="bar.give">Give</span>
  </a>
</nav>

<script src="assets/site.js"></script>
{{extra_js}}
</body>
</html>
"""


INCLUDE_RE = re.compile(r"<!--INCLUDE:([^>]+?)-->")


def body_of(path):
    """Read a body fragment, expanding <!--INCLUDE:...--> and {{FILLS}}."""
    text = Path(path).read_text(encoding="utf-8")
    text = INCLUDE_RE.sub(lambda m: body_of(ROOT / m.group(1).strip()), text)
    for key, val in FILLS.items():
        text = text.replace("{{" + key + "}}", val)
    return text


def page(out, title, desc, body_path, lang="en", extra_js="", wrap=None,
         force_lang="", promote_heading=False):
    body = body_of(body_path)
    if promote_heading:
        # In WordPress the page title supplies the h1, so these fragments open
        # at h2. Standing alone they need a real h1 or the document has none.
        body = re.sub(r'<h2(\s+class="nbc-(?:welcome|visit)__title"[^>]*)>(.*?)</h2>',
                      r'<h1\1>\2</h1>', body, count=1, flags=re.S)
    if wrap:
        body = wrap.replace("{body}", body)
    html = (
        head(title, desc, out, lang, force_lang=force_lang).replace("{nav_items}", nav_html(out))
        + body
        + FOOT.replace("{extra_js}", extra_js)
    )
    (ROOT / out).write_text(html, encoding="utf-8")
    return out, len(html)


SHELL = '<div class="shell shell--narrow"><div class="page-head"><p class="page-head__kicker">{kicker}</p><h1>{h1}</h1></div>{body}</div>'


def build_pages():
    made = []

    made.append(page(
        "index.html",
        "Northcote Baptist Church — prototype redesign",
        "Sundays at 10am in Hillcrest, Auckland. An intergenerational, multicultural church.",
        SRC / "home.html",
    ))

    made.append(page(
        "sunday.html", "On Sunday — Northcote Baptist Church (prototype)",
        "What happens on a Sunday morning: timing, children's programmes, morning tea.",
        SRC / "sunday.html",
    ))

    made.append(page(
        "first-visit.html", "Planning your first visit — Northcote Baptist Church (prototype)",
        "Everything a first-time visitor needs to know before Sunday.",
        ROOT / "pages" / "first-visit.html",
        wrap='<div class="shell shell--narrow"><div class="band">{body}</div></div>',
        promote_heading=True,
    ))

    made.append(page(
        "bible.html", "Online Bible — multilingual, side by side",
        "Read the Bible in English, 中文, 한국어, Te Reo Māori and more — two languages side by side.",
        ROOT / "nbc-bible-reader.html",
        wrap='<div class="shell"><div class="page-head"><p class="page-head__kicker" '
             'data-i18n="nav.bible">Bible</p><h1>Read in two languages at once</h1></div>'
             '<div class="band band--flush">{body}</div></div>',
    ))

    made.append(page(
        "ask.html", "Find a passage — Northcote Baptist Church (prototype)",
        "Pick what is going on and read where the Bible speaks to it, in your language beside English.",
        SRC / "ask.html",
        extra_js='<script src="assets/ask.js"></script>',
    ))

    for slug, src, lang, title in [
        ("zh.html", "welcome-zh.html", "zh-Hans", "中文 — 北岸浸信会（原型）"),
        ("ko.html", "welcome-ko.html", "ko", "한국어 — 노스코트 뱁티스트 교회 (프로토타입)"),
        ("mi.html", "welcome-mi.html", "mi", "Te Reo Māori — Northcote Baptist Church (prototype)"),
    ]:
        made.append(page(
            slug, title,
            "Sundays at 10am in Hillcrest, Auckland.",
            ROOT / "pages" / src, lang=lang, force_lang=lang,
            wrap='<div class="shell shell--narrow"><div class="band">{body}</div></div>',
            promote_heading=True,
        ))

    made.append(page(
        "contact.html", "Contact — Northcote Baptist Church (prototype)",
        "Phone, email and how to reach someone who speaks your language.",
        SRC / "contact.html",
    ))

    made.append(page(
        "give.html", "Give — Northcote Baptist Church (prototype)",
        "How giving works, and why visitors are never asked.",
        SRC / "give.html",
    ))

    return made


# --------------------------------------------------------------------------
# developer-facing pages (kept out of the church site's navigation)
# --------------------------------------------------------------------------

DEV_HEAD = """<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><text y='14' font-size='14'>{icon}</text></svg>">
{extra}
</head>
<body>
<p style="margin:0;padding:11px clamp(16px,4vw,34px);background:#22242d;color:#c3c8d6;
          font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <b style="color:#fff">{banner}</b>
  &nbsp;·&nbsp; <a href="index.html" style="color:#8fbde0">← 回到站点原型</a>
  &nbsp;·&nbsp; <a href="{repo}" style="color:#8fbde0">Source on GitHub</a>
</p>
"""


def build_preview():
    css = (ASSETS / "site.css").read_text(encoding="utf-8")
    blocks = [
        ("vision-mission-values", "替换 NBC_vision-mission-values.jpg 等三张图"),
        ("creed", "替换 Creed.jpg，轮盘改为 2 KB 内联 SVG"),
        ("strategic-principles", "替换 NBC-Strategic-Principles.jpg"),
        ("first-visit", "新页面：第一次来"),
        ("welcome-zh", "新页面 /zh/"),
        ("welcome-ko", "新页面 /ko/"),
        ("welcome-mi", "新页面 /mi/，有意做成双语"),
    ]
    extra = (
        f"<style>{css}</style>"
        "<style>body{margin:0;background:#fff}"
        ".blk-head{position:sticky;top:0;z-index:40;padding:10px clamp(16px,4vw,34px);"
        "background:#eff1f5;border-top:1px solid #dce0e8;border-bottom:1px solid #dce0e8;"
        "display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline}"
        ".blk-head code{font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#22242d;"
        "background:#fff;border:1px solid #dce0e8;border-radius:3px;padding:2px 7px}"
        ".blk-head em{font-style:normal;font-size:13px;color:#6b7186}"
        ".blk-body{padding:clamp(22px,4vw,44px) clamp(16px,4vw,34px) clamp(34px,5vw,60px)}"
        "</style>"
    )
    html = DEV_HEAD.format(lang="zh-Hans", title="粘贴区块预览", icon="&#129513;",
                           extra=extra, banner="区块预览", repo=REPO_URL)
    for slug, note in blocks:
        frag = body_of(ROOT / "pages" / f"{slug}.html")
        html += (f'<div class="blk-head"><code>pages/{slug}.html</code><em>{note}</em></div>'
                 f'<div class="blk-body entry-content">{frag}</div>')
    html += "\n</body>\n</html>\n"
    (ROOT / "preview.html").write_text(html, encoding="utf-8")
    return "preview.html", len(html)


def build_package():
    """The former landing page, kept for whoever is going to deploy this."""
    src = ROOT / "src" / "package.html"
    html = src.read_text(encoding="utf-8")
    (ROOT / "package.html").write_text(html, encoding="utf-8")
    return "package.html", len(html)


if __name__ == "__main__":
    for name, size in build_assets():
        print(f"  {name}")
    for name, size in build_pages():
        print(f"  {name:22s} {size:>7,} bytes")
    for fn in (build_preview, build_package):
        name, size = fn()
        print(f"  {name:22s} {size:>7,} bytes")
