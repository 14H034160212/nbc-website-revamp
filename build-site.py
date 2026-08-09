#!/usr/bin/env python3
"""
Generate the standalone preview pages served by Cloudflare Pages.

The files in pages/ and nbc-bible-reader.html are *fragments* — they are
meant to be pasted into a WordPress "Custom HTML" block, so they carry no
<!doctype>, <head> or <meta viewport>. Browsers will render a fragment
anyway, but in quirks mode and without mobile scaling, which makes for a
poor demo. This script wraps them in real documents.

    python3 build-site.py

Writes:
    bible.html      the Bible reader as a full page, hitting the live API
    preview.html    every paste-in block rendered with the child theme CSS

index.html is hand-written and is not touched by this script.
"""

from pathlib import Path

ROOT = Path(__file__).parent

HEAD = """<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="robots" content="index, follow">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><text y='14' font-size='14'>{icon}</text></svg>">
<style>
/* This demo has no Google Fonts link, so the theme's Fjalla One and
   Crimson Text fall back to system faces. On the real site those webfonts
   are already loaded by the parent theme. */
html {{ -webkit-text-size-adjust: 100%; }}
body {{ margin: 0; background: #fff; color: #5c5d69;
       font-family: 'Source Sans Pro', -apple-system, BlinkMacSystemFont,
                    'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }}
.demo-bar {{
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px;
  padding: 11px clamp(16px, 4vw, 34px);
  background: #22242d; color: #c3c8d6;
  font-size: 13px; line-height: 1.4;
}}
.demo-bar a {{ color: #8fbde0; }}
.demo-bar strong {{ color: #fff; font-weight: 600; }}
.demo-bar span {{ margin-left: auto; opacity: .7; }}
.demo-wrap {{ padding: clamp(24px, 5vw, 52px) clamp(16px, 4vw, 34px) 80px; }}
</style>
{extra_css}
</head>
<body>
<p class="demo-bar">
  <strong>{banner}</strong>
  <a href="./">← Back to the package</a>
  <a href="https://github.com/14H034160212/nbc-website-revamp">Source on GitHub</a>
  <span>{note}</span>
</p>
"""

FOOT = "\n</body>\n</html>\n"


def build_bible():
    frag = (ROOT / "nbc-bible-reader.html").read_text(encoding="utf-8")
    html = HEAD.format(
        lang="en",
        title="Online Bible — multilingual, side by side",
        desc="A drop-in multilingual Bible reader for church websites. "
             "Free, no API key, no plugin. English, 中文, 한국어, Te Reo Māori and more.",
        icon="📖",
        extra_css="",
        banner="Live demo",
        note="Reads from api.getbible.net — all 66 books, 117 translations",
    )
    html += '<div class="demo-wrap">\n' + frag + "\n</div>" + FOOT
    (ROOT / "bible.html").write_text(html, encoding="utf-8")
    return "bible.html", len(html)


BLOCKS = [
    ("vision-mission-values", "Vision, Mission &amp; Values",
     "Replaces NBC_vision-mission-values.jpg and two more — the text is now real text"),
    ("creed", "CREED wheel",
     "Replaces Creed.jpg — a 2 KB inline SVG instead of a 39 KB photograph"),
    ("strategic-principles", "Strategic Principles",
     "Replaces NBC-Strategic-Principles.jpg — all six principles as real text"),
    ("first-visit", "Planning your first visit",
     "New page. The one a first-time visitor looks for and the site does not have"),
    ("welcome-zh", "中文欢迎页",
     "New page at /zh/ — translated from the church's own service and kids pages"),
    ("welcome-ko", "한국어 환영 페이지",
     "New page at /ko/ — have a Korean speaker check the tone before publishing"),
    ("welcome-mi", "Te Reo Māori",
     "New page at /mi/ — deliberately bilingual; see the note inside the file"),
]


def build_preview():
    css = (ROOT / "my-religion-child" / "style.css").read_text(encoding="utf-8")

    extra = (
        "<style>\n" + css + "\n</style>\n"
        "<style>\n"
        ".blk-head{position:sticky;top:0;z-index:40;display:flex;flex-wrap:wrap;"
        "align-items:baseline;gap:4px 14px;padding:10px clamp(16px,4vw,34px);"
        "background:#eff1f5;border-top:1px solid #dce0e8;border-bottom:1px solid #dce0e8}\n"
        ".blk-head code{font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;"
        "color:#22242d;background:#fff;border:1px solid #dce0e8;border-radius:3px;padding:2px 7px}\n"
        ".blk-head em{font-style:normal;font-size:13px;color:#6b7186}\n"
        ".blk-body{padding:clamp(22px,4vw,44px) clamp(16px,4vw,34px) clamp(34px,5vw,60px)}\n"
        "</style>\n"
    )

    html = HEAD.format(
        lang="en",
        title="Paste-in blocks — preview",
        desc="Every Custom HTML block in the package, rendered with the child theme stylesheet.",
        icon="🧩",
        extra_css=extra,
        banner="Block previews",
        note="Rendered with my-religion-child/style.css applied",
    )

    for slug, title, note in BLOCKS:
        frag = (ROOT / "pages" / f"{slug}.html").read_text(encoding="utf-8")
        html += (
            f'\n<div class="blk-head"><code>pages/{slug}.html</code>'
            f"<em>{note}</em></div>\n"
            f'<div class="blk-body entry-content">\n{frag}\n</div>\n'
        )

    html += FOOT
    (ROOT / "preview.html").write_text(html, encoding="utf-8")
    return "preview.html", len(html)


if __name__ == "__main__":
    for name, size in (build_bible(), build_preview()):
        print(f"wrote {name}  ({size:,} bytes)")
