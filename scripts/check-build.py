#!/usr/bin/env python3
"""
Sanity-check a freshly built site before it is allowed to ship.

    python3 scripts/check-build.py                 # human output
    python3 scripts/check-build.py --summary FILE  # write GitHub's job summary
    python3 scripts/check-build.py --determinism   # also rebuild and diff (writes!)

Written for the weekly sync (.github/workflows/sync.yml), which rebuilds from
whatever nbc.org.nz looks like that morning. The church can edit their site any
day, and some of those edits break things here in ways that are quiet:

  * a page disappears from the sitemap, so a link into it 404s
  * a paragraph is rewritten, so its translation stops matching and a page
    listed as translated quietly serves English again
  * the mirror fails halfway and the build produces a site with three pages

None of those raise an exception. Each one is a check below.

Exit codes:
    0  everything passed
    1  something is broken enough that it should not ship
    2  it can ship, but a translation went stale and someone has to look
"""
import collections
import json
import posixpath
import re
import subprocess
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Below this, assume the mirror failed rather than that the church deleted
# nine tenths of their website.
MIN_PAGES = 150

problems = []   # blocks the deploy
warnings = []   # ships, but says so loudly


def load_build_module():
    """Import build-site.py's definitions without running main()."""
    src = (ROOT / "build-site.py").read_text(encoding="utf-8").split("def main(")[0]
    mod = types.ModuleType("buildsite")
    mod.__file__ = str(ROOT / "build-site.py")
    exec(compile(src, str(ROOT / "build-site.py"), "exec"), mod.__dict__)
    return mod


def page_files():
    return [p for p in ROOT.rglob("index.html")
            if "src/" not in p.relative_to(ROOT).as_posix()]


def check_page_count(pages):
    if len(pages) < MIN_PAGES:
        problems.append(
            f"only {len(pages)} pages built (expected at least {MIN_PAGES}) — "
            "the mirror probably failed rather than the site shrinking")
    return len(pages)


def check_links(pages):
    """Every relative href/src must resolve to a file that exists."""
    bad = collections.Counter()
    example = {}
    extra = [ROOT / "package.html", ROOT / "preview.html"]
    for p in pages + [f for f in extra if f.exists()]:
        base = "/" + p.relative_to(ROOT).as_posix()
        html = p.read_text(errors="replace")
        for value in set(re.findall(r'(?:href|src)="([^"]+)"', html)):
            if re.match(r"https?:|//|#|mailto:|tel:|data:|javascript:", value):
                continue
            target = value.split("#")[0].split("?")[0]
            if not target:
                continue
            resolved = posixpath.normpath(
                posixpath.join(posixpath.dirname(base), target)).lstrip("/")
            fp = ROOT / resolved
            if fp.is_dir():
                fp = fp / "index.html"
            if not fp.exists():
                bad[value] += 1
                example.setdefault(value, base)
    if bad:
        detail = ", ".join(f"{v} (on {example[v]})" for v, _ in bad.most_common(5))
        problems.append(f"{sum(bad.values())} broken references: {detail}")
    return sum(bad.values())


def check_translations(mod):
    """
    The one that matters after a content edit.

    A page in TRANSLATED promises its content is in the reader's language. If
    the church rewrites a paragraph, the dictionary key stops matching and that
    promise quietly becomes false. This does not block the deploy — fresher
    content is still worth having — but it has to be visible.
    """
    stale = {}
    for code in ("zh-Hans", "ko"):
        table = mod.load_dictionary(code)
        for url in mod.TRANSLATED:
            f = ROOT / (url.strip("/") + "/index.html").lstrip("/")
            if not f.exists():
                problems.append(f"{url} is listed as translated but was not built")
                continue
            stats = {"hit": set(), "miss": set()}
            mod.translate_page(f.read_text(errors="replace"), table, stats)
            miss = {s for s in stats["miss"] if not mod.deliberately_english(s)}
            if miss:
                stale.setdefault(code, {})[url] = sorted(miss)
    if stale:
        total = sum(len(v) for m in stale.values() for v in m.values())
        warnings.append(f"{total} string(s) on translated pages no longer match "
                        "the dictionary — the English has changed underneath them")
    return stale


def check_our_pages():
    """The three pages we author must exist in all four languages."""
    for url in ("/bible/", "/ask/", "/first-visit/"):
        for prefix in ("", "/zh", "/ko", "/mi"):
            f = ROOT / (prefix + url).strip("/") / "index.html"
            if not f.exists():
                problems.append(f"missing {prefix + url}")


def check_determinism():
    """
    A second build must produce no diff.

    Opt-in, because it is the one check here that *writes*. A checker that
    mutates the tree it is checking will eventually be run at the wrong moment
    and blame the source for its own side effect — which is exactly what
    happened the first time this ran against a hand-edited page. The sync
    workflow does not need it: the build it just ran is the only build.
    """
    before = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT,
                            capture_output=True, text=True).stdout
    subprocess.run([sys.executable, "build-site.py"], cwd=ROOT,
                   capture_output=True, text=True)
    after = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT,
                           capture_output=True, text=True).stdout
    if before != after:
        problems.append("the build is not deterministic — a second run changed the output")


def main():
    mod = load_build_module()
    pages = page_files()

    count = check_page_count(pages)
    broken = check_links(pages)
    check_our_pages()
    stale = check_translations(mod)
    if "--determinism" in sys.argv:
        check_determinism()

    print(f"pages built        {count}")
    print(f"broken references  {broken}")
    for code, urls in stale.items():
        for url, misses in urls.items():
            print(f"stale translation  [{code}] {url}")
            for s in misses[:4]:
                print(f"                     {s[:72]}")

    for p in problems:
        print(f"FAIL  {p}")
    for w in warnings:
        print(f"WARN  {w}")

    if "--summary" in sys.argv:
        lines = ["## Sync check", "",
                 f"- pages built: **{count}**",
                 f"- broken references: **{broken}**"]
        if stale:
            lines += ["", "### Translations that went stale", "",
                      "The English on these pages changed, so they are serving "
                      "English again in places while still being advertised as "
                      "translated. Nothing is auto-translated on purpose — a "
                      "machine translation of a church's words about faith, "
                      "live and unreviewed, is worse than the English. So these "
                      "need a person.", ""]
            for code, urls in stale.items():
                lines.append(f"**{code}** — {sum(len(v) for v in urls.values())} "
                             f"string(s) on {len(urls)} page(s)")
                for url in urls:
                    lines.append(f"  - {url}")
            # Paste-ready, and NOT truncated: a key that has lost a character
            # is a key that will never match again. Full strings, JSON-escaped,
            # with empty values to fill in.
            lines += ["", "### Paste into src/i18n/", ""]
            for code, urls in stale.items():
                keys = sorted({s for v in urls.values() for s in v})
                block = json.dumps({k: "" for k in keys}, ensure_ascii=False, indent=2)
                # Trim the outer braces so it drops straight into the existing file.
                inner = "\n".join(block.split("\n")[1:-1])
                lines += [f"`src/i18n/{code}.json`", "", "```json", inner, "```", ""]
        for p in problems:
            lines.append(f"- ❌ {p}")
        if not problems and not stale:
            lines.append("- ✅ nothing to look at")
        Path(sys.argv[sys.argv.index("--summary") + 1]).write_text(
            "\n".join(lines) + "\n", encoding="utf-8")

    if problems:
        return 1
    if warnings:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
