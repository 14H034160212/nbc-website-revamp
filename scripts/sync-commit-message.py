#!/usr/bin/env python3
"""
Write the commit message for a weekly sync, from what actually changed.

    git add -A && git commit -F <(python3 scripts/sync-commit-message.py)

Without this every sync commit reads "sync", and the history stops being a
record of the church's site and becomes noise. Naming the English pages that
moved makes `git log` answer "when did they change the youth page?".

Language copies are left out of the listing: /zh/services/ only ever changes
because /services/ did, so listing all four would say the same thing four
times.
"""
import re
import subprocess
import sys


def staged_pages():
    out = subprocess.run(["git", "diff", "--cached", "--name-only"],
                         capture_output=True, text=True).stdout.split()
    english, translated = set(), set()
    for path in out:
        if not path.endswith("index.html"):
            continue
        url = "/" + path[: -len("index.html")]
        if re.match(r"^/(zh|ko|mi)/", url):
            translated.add(url)
        else:
            english.add(url)
    return sorted(english), sorted(translated)


def main():
    english, translated = staged_pages()
    other = [f for f in subprocess.run(["git", "diff", "--cached", "--name-only"],
                                       capture_output=True, text=True).stdout.split()
             if not f.endswith("index.html")]

    if not english and not translated and not other:
        print("Sync from nbc.org.nz (no changes)")
        return

    lines = [f"Sync from nbc.org.nz ({len(english)} pages changed)", ""]
    lines.append("Automated weekly re-mirror. The content is the church's own; "
                 "this repo only re-applies the prototype's additions on top of it.")

    if english:
        lines += ["", "Pages that changed:"]
        lines += [f"  {u}" for u in english[:25]]
        if len(english) > 25:
            lines.append(f"  ... and {len(english) - 25} more")
    if translated:
        lines += ["", f"({len(translated)} language copies rebuilt to match.)"]
    if other:
        assets = [f for f in other if f.startswith("wp-content/")]
        if assets:
            lines += ["", f"{len(assets)} asset(s) updated."]

    print("\n".join(lines))


if __name__ == "__main__":
    main()
    sys.exit(0)
