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
import posixpath
import re
import shutil
import subprocess
import sys
import urllib.request
from html import escape, unescape
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

# The About Us submenu is where a first-visit page belongs, and it costs no
# top-level slot (see nav_extra for why there is only room for one). Anchored
# on the theme's own menu-item id, which is stable across the mirror.
ABOUT_SUBMENU = 'id="menu-item-4920"'

LANGS = [
    ("en", "English", ""),
    ("zh-Hans", "中文", "/zh"),
    ("ko", "한국어", "/ko"),
    ("mi", "Te Reo Māori", "/mi"),
]

# Pages translated in full. The rest of the site stays English and falls back,
# which is the tiered strategy in the proposal — not every page, just the ones
# a visitor needs. Mirrors Polylang's /zh/who-we-are/ URL shape.
TRANSLATED = ["/", "/who-we-are/", "/services/", "/contact/", "/give-2/",
              "/bible/", "/ask/", "/first-visit/"]

# The three feature pages are ours, not mirrored, so they are built first in
# English and then copied per language from that output.
OUR_PAGES = ["/bible/", "/ask/", "/first-visit/"]

# Titles for those pages. The mirrored pages get theirs from the dictionaries;
# ours are not in the source site, so they are listed here — otherwise a
# translated page keeps an English tab label, which is the same
# "content translated, chrome not" defect the nav fix removed.
OUR_TITLES = {
    "/bible/": {
        "en": "Online Bible", "zh-Hans": "在线圣经",
        "ko": "온라인 성경", "mi": "Te Paipera Tapu ā-ipurangi",
    },
    "/ask/": {
        "en": "Find a Passage", "zh-Hans": "按主题查经",
        "ko": "주제별 말씀 찾기", "mi": "Rapua he kupu",
    },
    "/first-visit/": {
        "en": "Planning your first visit", "zh-Hans": "第一次来",
        "ko": "첫 방문 안내", "mi": "Tō haerenga tuatahi",
    },
}
SITE_NAME = {"en": "Northcote Baptist Church", "zh-Hans": "北岸浸信会",
             "ko": "노스코트 뱁티스트 교회", "mi": "Northcote Baptist Church"}


def our_title(url_path, lang):
    title = f"{OUR_TITLES[url_path][lang]} - {SITE_NAME[lang]}"
    return title + " (prototype)" if lang == "en" else title

# Details the live site does not publish. The address and parking came from
# OpenStreetMap (the building is tagged place_of_worship at this number),
# corroborated by three NZ directories and by the phone number matching the
# one on nbc.org.nz — not from the church, so it is worth one confirming
# glance before this goes live.
#
# Anything still unknown is rendered as a visible <mark class="todo"> rather
# than invented: a made-up address on a church site is worse than an obvious
# gap. Office hours are the one remaining unknown, and rather than carry a
# marker they are simply not claimed anywhere — see README.
FILLS = {
    "STREET_ADDRESS": "67 Eban Avenue",
    "MAP_URL": "https://www.google.com/maps/search/?api=1&query=67+Eban+Avenue%2C+Hillcrest%2C+Auckland+0627%2C+New+Zealand",
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

# Chrome we add ourselves. It is injected after the translation pass, so it is
# not covered by the dictionaries and has to carry its own strings — otherwise
# a Korean page gets an English mobile bar, which is the same "content
# translated, chrome not" complaint twice over.
CHROME = {
    "en": {
        "proto": "Prototype",
        "disclaimer": "Unofficial redesign proposal &mdash; not affiliated with, "
                      "reviewed by, or adopted by Northcote Baptist Church.",
        "real": "The real site &rarr;",
        "about": "About this package",
        "skip": "Skip to content",
        "sunday": "Sunday 10am", "findus": "Find us", "give": "Give",
    },
    "zh-Hans": {
        "proto": "原型",
        "disclaimer": "非官方改版提案 &mdash; 与 Northcote Baptist Church 无关联，"
                      "未经其审阅或采用。",
        "real": "访问真实网站 &rarr;",
        "about": "关于这份方案",
        "skip": "跳到正文",
        "sunday": "主日 10:00", "findus": "地图", "give": "奉献",
    },
    "ko": {
        "proto": "프로토타입",
        "disclaimer": "비공식 리디자인 제안입니다 &mdash; Northcote Baptist Church와 "
                      "제휴 관계가 없으며 검토하거나 채택한 바 없습니다.",
        "real": "실제 웹사이트 &rarr;",
        "about": "이 제안에 대하여",
        "skip": "본문으로 건너뛰기",
        "sunday": "주일 오전 10시", "findus": "찾아오는 길", "give": "헌금",
    },
    # te reo entries are the ones a native speaker confirmed; the rest stay
    # English rather than being guessed. See MI_NOTE.
    "mi": {
        "proto": "Prototype",
        "disclaimer": "Unofficial redesign proposal &mdash; not affiliated with, "
                      "reviewed by, or adopted by Northcote Baptist Church.",
        "real": "The real site &rarr;",
        "about": "About this package",
        "skip": "Peke ki te ihirangi",
        "sunday": "Rātapu 10am", "findus": "Kimihia mātou", "give": "Koha",
    },
}


def chrome(lang, key):
    return CHROME.get(lang, CHROME["en"]).get(key, CHROME["en"][key])


def banner(lang="en"):
    return (
        '<div class="proto"><div class="proto__inner">'
        f"<b>{chrome(lang, 'proto')}</b>"
        f"<span>{chrome(lang, 'disclaimer')}</span>"
        f'<span class="proto__spacer"><a href="{REAL}/" rel="noopener">'
        f"{chrome(lang, 'real')}</a></span>"
        f'<span><a href="/package.html">{chrome(lang, "about")}</a></span>'
        "</div></div>"
    )


# Shown on a language link when the current page has no translation, so the
# link is visibly a redirect rather than appearing broken.
NO_TRANSLATION = {
    "zh-Hans": "本页暂无中文版 — 前往中文首页",
    "ko": "이 페이지는 한국어 번역이 없습니다 — 한국어 홈으로 이동합니다",
    "mi": "This page has no te reo Māori version yet — goes to the te reo home page",
    "en": "",
}


def langbar(url_path, lang="en"):
    """
    Point each language at the *same* page where a translation exists.

    Where it does not, fall back to that language's home page — the way
    Polylang does. Pointing at the current URL instead (the obvious reading of
    "fall back to English") produces a link that navigates nowhere, which reads
    as broken rather than as "this page is English only".
    """
    base = url_path
    for _, _, prefix in LANGS:
        if prefix and base.startswith(prefix + "/"):
            base = base[len(prefix):]
            break

    translated = base in TRANSLATED
    items = []
    for code, label, prefix in LANGS:
        if not prefix:                       # English is the source
            target, hint = base, ""
        elif translated:
            target, hint = prefix + base, ""
        else:
            target, hint = prefix + "/", NO_TRANSLATION.get(code, "")

        classes = "nbc-lang__item"
        if code == lang:
            classes += " is-current"
        if hint:
            classes += " is-fallback"
        title = f' title="{hint}"' if hint else ""

        items.append(
            f'<li class="{classes}">'
            f'<a class="nbc-lang__link" href="{target}" lang="{code}" hreflang="{code}"{title}>{label}</a></li>'
        )
    return (
        '<div class="nbc-langbar"><div class="nbc-langbar__inner">'
        f'<ul class="nbc-lang">{"".join(items)}</ul></div></div>'
    )


def actionbar(prefix="", lang="en"):
    c = lambda k: chrome(lang, k)
    return f"""<nav class="nbc-actionbar" aria-label="Quick links">
<a class="nbc-actionbar__link" href="{prefix}/services/"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>{c('sunday')}</span></a>
<a class="nbc-actionbar__link" href="{FILLS['MAP_URL']}" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg><span>{c('findus')}</span></a>
<a class="nbc-actionbar__link" href="{prefix}/give-2/"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 6.6a4.3 4.3 0 0 0-6.1 0L12 9.3 9.3 6.6a4.3 4.3 0 1 0-6.1 6.1L12 21.5l8.8-8.8a4.3 4.3 0 0 0 0-6.1z"/></svg><span>{c('give')}</span></a>
</nav>"""


NAV_LABELS = {
    "en": ("Bible", "Read the Bible", "Find a Passage"),
    "zh-Hans": ("圣经", "在线读经", "按主题查经"),
    "ko": ("성경", "온라인 성경", "주제별 말씀 찾기"),
    "mi": ("Te Paipera Tapu", "Pānui i te Paipera", "Rapua he kupu"),
}


def nav_extra(current, lang="en"):
    """
    One new top-level item with a submenu, in the theme's own markup.

    Two top-level items would make nine, and the existing seven already reach
    the right edge at 1280px. A parent with children costs one slot and matches
    how About Us and Community are already organised.

    Labels follow the page language — this item is injected after the
    translation pass, so it would otherwise stay English on a translated page.
    """
    parent, read, find = NAV_LABELS.get(lang, NAV_LABELS["en"])
    # Point at that language's copy of the page, so the chrome around the
    # reader is translated too — a Korean page linking to an English-framed
    # Bible was the same "content translated, header not" bug twice over.
    prefix = next((p for c, _, p in LANGS if c == lang and p), "")
    kids = [(f"{prefix}/bible/", read), (f"{prefix}/ask/", find)]

    sub = "".join(
        f'<li class="menu-item menu-item-type-post_type menu-item-object-page '
        f'menu-item-depth-1{" current-menu-item" if href == current else ""}">'
        f'<a href="{href}"><span class="nav_item_wrap"><span class="nav_title">{title}'
        f"</span></span></a></li>"
        for href, title in kids
    )
    ancestor = " current-menu-ancestor" if current.endswith(("/bible/", "/ask/")) else ""
    return (
        f'<li class="menu-item menu-item-type-custom menu-item-object-custom '
        f'menu-item-has-children menu-item-depth-0 nbc-new{ancestor}">'
        f'<a href="{prefix}/bible/"><span class="nav_item_wrap"><span class="nav_title">{parent}'
        f'</span></span></a><ul class="sub-menu">{sub}</ul></li>'
    )


def about_child(html, current, lang="en"):
    """
    Add "Planning your first visit" as the first child of the About Us submenu.

    Without this the page is built in four languages, advertised in the langbar
    and in hreflang, and reachable only by typing the URL. It cannot be a ninth
    top-level item (see nav_extra), and About Us is where a church would file it
    anyway — beside Who We Are and On Sunday.
    """
    prefix = next((p for c, _, p in LANGS if c == lang and p), "")
    href = f"{prefix}/first-visit/"
    label = OUR_TITLES["/first-visit/"][lang]
    item = (
        f'<li class="menu-item menu-item-type-post_type menu-item-object-page '
        f'menu-item-depth-1 nbc-new{" current-menu-item" if href == current else ""}">'
        f'<a href="{href}"><span class="nav_item_wrap"><span class="nav_title">{label}'
        f"</span></span></a></li>"
    )
    # Anchored on the About Us <li>, then its first sub-menu open tag.
    i = html.find(ABOUT_SUBMENU)
    if i == -1:
        return html
    j = html.find('<ul class="sub-menu">', i)
    if j == -1:
        return html
    j += len('<ul class="sub-menu">')
    return html[:j] + item + html[j:]


HEAD_EXTRA = (
    '<meta name="robots" content="noindex, nofollow">\n'
    '<link rel="canonical" href="{canonical}">\n'
    '<link rel="stylesheet" href="/assets/addon.css">\n'
)


def inject(html, url_path, canonical, title=None, lang="en"):
    if title:
        html = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", html, count=1, flags=re.S)

    # Our canonical should be the only one.
    html = re.sub(r'<link rel="canonical"[^>]*>', "", html, count=1)
    html = html.replace("</head>", HEAD_EXTRA.format(canonical=canonical)
                        + hreflang_links(url_path) + "</head>", 1)

    if lang != "en":
        html = re.sub(r'(<html[^>]*?)\slang="[^"]*"', r'\1 lang="%s"' % lang, html, count=1)

    m = re.search(r"<body[^>]*>", html)
    if m:
        tag = m.group(0)
        new = (re.sub(r'class="([^"]*)"', r'class="\1 nbc-has-actionbar"', tag)
               if 'class="' in tag else tag[:-1] + ' class="nbc-has-actionbar">')
        html = html.replace(
            tag,
            new + f'<a class="nbc-skip" href="#middle">{chrome(lang, "skip")}</a>'
                + banner(lang) + langbar(url_path, lang),
            1,
        )

    # The theme closes its menu with </ul></div></nav>.
    html = html.replace("</ul></div></nav>", nav_extra(url_path, lang) + "</ul></div></nav>", 1)
    html = about_child(html, url_path, lang)
    # /services/ and /give-2/ are both translated, so the mobile bar can stay
    # in-language on a translated page.
    lang_prefix = next((p for c, _, p in LANGS if c == lang and p), "")
    html = html.replace("</body>", actionbar(lang_prefix, lang) + "</body>", 1)
    return html


def hreflang_links(url_path):
    """Tell search engines these pages are alternates of one another."""
    base = url_path
    for _, _, prefix in LANGS:
        if prefix and base.startswith(prefix + "/"):
            base = base[len(prefix):]
            break
    if base not in TRANSLATED:
        return ""
    out = [f'<link rel="alternate" hreflang="{code}" href="{REAL}{prefix}{base}">'
           for code, _, prefix in LANGS]
    out.append(f'<link rel="alternate" hreflang="x-default" href="{REAL}{base}">')
    return "\n".join(out) + "\n"


# ==========================================================================
# step 2d: translated copies — same markup, text nodes only
# ==========================================================================

# Text between tags, excluding anything inside a script/style/comment. The
# negative lookahead keeps us out of tags themselves.
TEXT_NODE = re.compile(r">([^<>]+)<")
SKIP_REGION = re.compile(r"<(script|style|noscript)\b.*?</\1>", re.S | re.I)


def load_dictionary(lang):
    data = json.loads((SRC / "i18n" / f"{lang}.json").read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_") and v}


def translate_page(html, table, stats):
    """
    Replace visible text with its translation, leaving every tag, attribute,
    image, script and stylesheet untouched.

    Matching is exact on the collapsed-whitespace string, so a translation only
    ever applies where the English it was written for actually appears — no
    substring surprises, and an untranslated string is reported rather than
    silently machine-translated.
    """
    # Protect script/style bodies from substitution by blanking them out first
    # and restoring afterwards.
    holes = []

    def stash(m):
        holes.append(m.group(0))
        return f"\x00{len(holes) - 1}\x00"

    guarded = SKIP_REGION.sub(stash, html)

    # <title> lives in <head>, outside the body text pass — handle it here so a
    # translated page does not show an English tab label.
    def swap_title(m):
        key = re.sub(r"\s+", " ", unescape(m.group(1))).strip()
        if key in table:
            stats["hit"].add(key)
            return "<title>" + escape(table[key], quote=False) + "</title>"
        stats["miss"].add(key)
        return m.group(0)

    guarded = re.sub(r"<title>(.*?)</title>", swap_title, guarded, count=1, flags=re.S)

    def swap(m):
        raw = m.group(1)
        key = re.sub(r"\s+", " ", unescape(raw)).strip()
        if len(key) < 2 or not re.search(r"[A-Za-z]{2}", key):
            return m.group(0)
        if key in table:
            stats["hit"].add(key)
            # Preserve the original leading/trailing whitespace so inline
            # layout (spacing between elements) is unchanged.
            lead = raw[: len(raw) - len(raw.lstrip())]
            tail = raw[len(raw.rstrip()):]
            return ">" + lead + escape(table[key], quote=False) + tail + "<"
        stats["miss"].add(key)
        return m.group(0)

    out = TEXT_NODE.sub(swap, guarded)
    return re.sub(r"\x00(\d+)\x00", lambda m: holes[int(m.group(1))], out)


COVERAGE = {}

# Strings the report should not flag, because something other than the
# dictionaries is responsible for them. Without this the report cries wolf on
# 20-odd entries and stops being read — which is how a real miss hides.
WIDGET_STRINGS = {
    # Swapped client-side by the Bible reader / passage finder from their own
    # tables, so the English in the markup is only what a reader sees for the
    # few milliseconds before the widget paints.
    "Book", "Chapter", "Version", "Interface", "Language", "Side by side",
    "English", "Scripture text served by", "getBible API", "How this works",
    "Online Bible", "Find a Passage",
    # Injected after the translation pass, from CHROME / NAV_LABELS / OUR_TITLES.
    "Prototype", "The real site →", "About this package", "Skip to content",
    "Sunday 10am", "Find us", "Give", "Bible", "Read the Bible",
    "Planning your first visit",
    "Unofficial redesign proposal — not affiliated with, reviewed by, "
    "or adopted by Northcote Baptist Church.",
    # Proper nouns and data that are the same in every language.
    "Northcote Baptist Church", "Anna Hart Photography", "office@nbc.org.nz",
    "67 Eban Avenue", "Aroha", "Whanaungatanga", "Manaakitanga", "Pono",
}


def deliberately_english(s):
    # Page titles are built from OUR_TITLES, not the dictionaries.
    return s in WIDGET_STRINGS or s.endswith(("(prototype)", "Baptist Church"))

# `javascript:` must be excluded for the same reason PAGE_LINK excludes it: the
# theme uses href="javascript:void(0);" for four inert controls, and shifting
# one by a ../ turns an inert control into a link to a path that 404s.
REL_ASSET = re.compile(
    r'((?:href|src)=)(["\'])((?!https?:|//|#|mailto:|tel:|data:|javascript:|/)[^"\']*)\2')

# Background images live in inline style attributes and in the theme's own
# <style> blocks, not just href/src — a page whose hero photo silently vanishes
# is the symptom of missing these.
REL_CSS_URL = re.compile(
    r"""(url\(\s*)(['"]?)((?!https?:|//|data:|#|/)[^'")]+)(\2\s*\))""")


PAGE_LINK = re.compile(
    r'(href=)(["\'])((?!https?:|//|#|mailto:|tel:|data:|javascript:)[^"\']*)\2')


def relink_within_language(html, prefix, orig_url):
    """
    Rewrite internal page links on a translated page, resolved against the
    page's ORIGINAL location and emitted root-absolute.

    Two things go wrong if you instead shift relative links by one `../`, the
    way asset paths are shifted:

    * A self-link (`index.html` on /services/) has no leading `../` to shift,
      so `../index.html` resolves to /zh/ — the nav item for the page you are
      on sends you to the language home instead.
    * A bare `#` becomes `../index.html#`.

    Root-absolute output sidesteps the depth question entirely: a link to a
    translated page gets the language prefix, everything else points at the
    English original, which is genuinely where that content lives.
    """
    def fix(m):
        attr, quote, value = m.group(1), m.group(2), m.group(3)

        # Fragment-only and empty hrefs (the theme's dropdown parents) stay put.
        if not value or value.startswith("#"):
            return m.group(0)

        page, hashmark, fragment = value.partition("#")
        # The theme's dropdown parents are href="#", which wget rewrites to
        # "index.html#". Resolving that lands on the current page; it must stay
        # inert or "About Us" navigates instead of opening its submenu.
        if hashmark and not fragment:
            return f'{attr}{quote}#{quote}'
        if not page.endswith(("/", "index.html")):
            return m.group(0)                      # an asset, not a page

        target = posixpath.normpath(posixpath.join(orig_url, page))
        if target.endswith("/index.html"):
            target = target[: -len("index.html")]
        elif target == "/index.html":
            target = "/"
        if not target.endswith("/"):
            target += "/"

        if target in TRANSLATED:
            target = prefix + target
        return f'{attr}{quote}{target}{"#" + fragment if fragment else ""}{quote}'

    return PAGE_LINK.sub(fix, html)


def fix_depth(html, extra):
    """
    Add `extra` levels of ../ to every relative reference.

    A translated page lives one directory deeper than its English original
    (/zh/services/ vs /services/), so wp-content paths that resolved from the
    original no longer do.
    """
    up = "../" * extra
    html = REL_ASSET.sub(lambda m: m.group(1) + m.group(2) + up + m.group(3) + m.group(2), html)
    return REL_CSS_URL.sub(lambda m: m.group(1) + m.group(2) + up + m.group(3) + m.group(4), html)


MI_NOTE = (
    '<div style="background:#f7f7f9;border-top:1px solid #e4e4e4;'
    'padding:16px 20px;font:14px/1.65 \'Source Sans Pro\',Arial,sans-serif;'
    'color:#5c5d69;text-align:center">'
    '<b lang="mi">He kupu whakamārama</b> &middot; Only short, standard phrases on this '
    'page are in te reo Māori. The longer text stays in English on purpose — we would '
    'rather publish a little te reo well than a lot of it badly. If you speak te reo and '
    'would help us finish it, please '
    '<a href="mailto:office@nbc.org.nz" style="color:#216ea3">get in touch</a>.'
    "</div>"
)


# ==========================================================================
# step 2e: our own pages, inside the theme's shell
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

    # The shell is /contact/, and its nav links are relative to /contact/. A
    # feature page is a sibling directory, so `href="index.html"` — the Contact
    # item's self-link — would quietly resolve to /ask/, /bible/ or
    # /first-visit/: the Contact menu item pointing at the page you are on.
    # Resolving against /contact/ and emitting root-absolute settles it at
    # every depth, and in every language once relink runs again downstream.
    shell = relink_within_language(shell, "", "/" + SHELL_PAGE[: -len("index.html")])
    # ...and its "you are here" markers belong to /contact/, not to us.
    shell = shell.replace(" current-menu-item page_item page-item-347 current_page_item", "")

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
                  f'<link rel="canonical" href="{REAL}/{out_dir}/">', page, count=1)
    # The shell is /contact/, so its alternates point there. Swap in this
    # page's own set — otherwise every feature page declares itself a
    # duplicate of the home page and an alternate of the contact page.
    page = re.sub(r'<link rel="alternate" hreflang="[^"]*"[^>]*>\n?', "", page)
    page = page.replace("</head>", hreflang_links(f"/{out_dir}/") + "</head>", 1)
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

    # -- inject into every mirrored page, and build the translated copies ----
    translated_count = 0
    for f in sorted(pages):
        rel = f.relative_to(ROOT).as_posix()
        url_path = "/" + rel[: -len("index.html")]
        html = strip_query_links(f.read_text(encoding="utf-8", errors="replace"))

        # Files we removed for size stay on the church's own server.
        for gone in dropped:
            html = re.sub(r'(?:\.\./)*' + re.escape(gone), f"{REAL}/{gone}", html)

        # Translated copies first, from the same source markup.
        if url_path in TRANSLATED:
            for code, _, prefix in LANGS:
                if not prefix:
                    continue
                table = load_dictionary(code)
                stats = {"hit": set(), "miss": set()}
                out = translate_page(html, table, stats)
                # One directory deeper than the English page, so every relative
                # asset path needs one more ../ to resolve.
                out = relink_within_language(out, prefix, url_path)
                out = fix_depth(out, 1)
                out = inject(out, prefix + url_path,
                             REAL + prefix + url_path, lang=code)
                if code == "mi":
                    out = out.replace("</body>", MI_NOTE + "</body>", 1)
                target = ROOT / (prefix + url_path).strip("/") / "index.html"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(out, encoding="utf-8")
                translated_count += 1
                COVERAGE.setdefault(code, {"hit": set(), "miss": set()})
                COVERAGE[code]["hit"] |= stats["hit"]
                COVERAGE[code]["miss"] |= stats["miss"]

        f.write_text(inject(html, url_path, REAL + url_path), encoding="utf-8")

    print(f"  mirrored {len(pages)} pages, renamed {renamed} query-string assets, "
          f"rewrote {touched} stylesheets")
    mirrored_translated = len([p for p in TRANSLATED if p not in OUR_PAGES])
    print(f"  built {translated_count} translated pages "
          f"({mirrored_translated} mirrored pages x {len(LANGS) - 1} languages)")
    if dropped:
        for gone in dropped:
            print(f"  left on the church's server (over {TOO_BIG // 1024 // 1024} MB): {gone}")

    # -- our own pages ------------------------------------------------------
    made = [
        new_page("bible", our_title("/bible/", "en"), "Online Bible",
                 "<p>Read any chapter in two languages side by side. Free to use, no "
                 "account needed. Choose a version on the left and, if you want a "
                 "parallel column, a second one beside it.</p>"
                 + fragment(ROOT / "nbc-bible-reader.html")),
        new_page("ask", our_title("/ask/", "en"),
                 "Find a Passage", fragment(SRC / "ask.html"),
                 extra_js='<script src="/assets/ask.js"></script>'),
        new_page("first-visit", our_title("/first-visit/", "en"),
                 None, fragment(ROOT / "pages" / "first-visit.html", own_heading=True)),
    ]
    # No bespoke /zh/ /ko/ /mi/ landing pages: those are now translated copies
    # of the real pages, built in the mirror loop above. pages/welcome-*.html
    # remain in the repo as the cheaper Tier-0 option (one hand-written page per
    # language) for a church that does not want to translate whole pages yet.
    for path, size in made:
        print(f"  new page {path:16s} {size:>8,} bytes")

    # -- language copies of our own pages -----------------------------------
    for url_path in OUR_PAGES:
        english = (ROOT / url_path.strip("/") / "index.html").read_text(encoding="utf-8")
        for code, _, prefix in LANGS:
            if not prefix:
                continue
            table = load_dictionary(code)
            stats = {"hit": set(), "miss": set()}
            out = translate_page(english, table, stats)
            # Same two steps, in the same order, as the mirror loop above:
            # page links resolved against the ORIGINAL url and emitted
            # root-absolute, then assets shifted one level deeper. Skipping
            # the first left the nav on these pages pointing at English pages
            # and turned the theme's inert href="#" parents into links home.
            out = relink_within_language(out, prefix, url_path)
            out = fix_depth(out, 1)
            # The widget reads this to pick its own interface and edition.
            out = out.replace("<body ", f'<body data-page-lang="{code}" ', 1)
            # The English copy already carries the injections; swap the
            # per-language bits rather than injecting a second time.
            out = re.sub(r"<title>.*?</title>",
                         f"<title>{our_title(url_path, code)}</title>",
                         out, count=1, flags=re.S)
            out = re.sub(r'<link rel="canonical"[^>]*>',
                         f'<link rel="canonical" href="{REAL}{prefix}{url_path}">',
                         out, count=1)
            out = re.sub(r'<div class="nbc-langbar">.*?</div></div>',
                         langbar(prefix + url_path, code), out, count=1, flags=re.S)
            out = re.sub(r'<li class="menu-item menu-item-type-custom menu-item-object-custom '
                         r'menu-item-has-children menu-item-depth-0 nbc-new.*?</ul></li>',
                         nav_extra(prefix + url_path, code), out, count=1, flags=re.S)
            out = re.sub(r'<li class="menu-item menu-item-type-post_type '
                         r'menu-item-object-page menu-item-depth-1 nbc-new.*?</li>',
                         "", out, count=1, flags=re.S)
            out = about_child(out, prefix + url_path, code)
            out = re.sub(r'<nav class="nbc-actionbar".*?</nav>',
                         lambda _: actionbar(prefix, code), out, count=1, flags=re.S)
            out = re.sub(r'<div class="proto">.*?</div></div>', lambda _: banner(code),
                         out, count=1, flags=re.S)
            out = re.sub(r'(<a class="nbc-skip" href="#middle">)[^<]*',
                         lambda m: m.group(1) + chrome(code, "skip"), out, count=1)
            out = re.sub(r'<html([^>]*?)\slang="[^"]*"', r'<html\1 lang="%s"' % code, out, count=1)
            if code == "mi":
                out = out.replace("</body>", MI_NOTE + "</body>", 1)
            target = ROOT / (prefix + url_path).strip("/") / "index.html"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(out, encoding="utf-8")
            COVERAGE.setdefault(code, {"hit": set(), "miss": set()})
            COVERAGE[code]["hit"] |= stats["hit"]
            COVERAGE[code]["miss"] |= stats["miss"]
        print(f"  language copies {url_path:12s} x{len(LANGS) - 1}")

    # Reported last, so it covers our own pages too — they carry the newest
    # copy and are exactly where an untranslated string is most likely to hide.
    for code in COVERAGE:
        hit, miss = COVERAGE[code]["hit"], COVERAGE[code]["miss"]
        miss = {k for k in miss if not deliberately_english(k)}
        total = len(hit) + len(miss)
        print(f"    {code:8s} {len(hit):3d}/{total} strings translated")
        if miss and code != "mi":
            for k in sorted(miss)[:8]:
                print(f"             untranslated: {k[:70]}")


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
