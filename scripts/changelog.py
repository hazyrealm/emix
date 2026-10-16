#!/usr/bin/env python3
"""Emix changelog tool. The reviewed release notes live in
packages/shared/changelog.json: the server publishes them at /api/changelog,
getemix.com/changelog renders them, and the app shows them in What's New.

  scripts/changelog.py draft [version]   add a draft entry built from the commits since the last tag
  scripts/changelog.py check             validate the file (also covered by the server tests)
  scripts/changelog.py notes <version>   print an entry as Markdown (GitHub release body)
  scripts/changelog.py status            show which entry the current version would announce

A draft is never served. Review it, rewrite anything technical, delete what
users shouldn't see, then set "status": "published" and commit. Users see it
once that commit is deployed (staging first, then `emixctl promote`).
"""
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILE = ROOT / "packages" / "shared" / "changelog.json"
SECTIONS = ["new", "improved", "fixed", "performance", "security"]
TITLES = {"new": "New", "improved": "Improved", "fixed": "Fixed", "performance": "Performance", "security": "Security"}
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")

# Commits users never need to hear about.
SKIP = re.compile(
    r"\[skip ci\]|^(chore|ci|test|tests|docs|build|style|refactor|deps|revert)(\(.*?\))?!?:|"
    r"^(merge|bump|release|handoff|readme|lint|typo|wip)\b|^v?\d+\.\d+\.\d+$|dependabot|lockfile|"
    r"\b(ci|workflow|eslint|vitest|typecheck|i18n allowlist)\b",
    re.I,
)
KIND = [
    ("security", re.compile(r"^(sec|security)(\(.*?\))?:|\b(security|vulnerab|cve-|xss|csrf|injection|harden)", re.I)),
    ("performance", re.compile(r"^perf(\(.*?\))?:|\b(faster|speed up|performance|optimi[sz]e|lighter|memory)\b", re.I)),
    ("fixed", re.compile(r"^fix(\(.*?\))?:|\b(fix|fixes|fixed|bug|crash|broken|regression|no longer)\b", re.I)),
    ("new", re.compile(r"^feat(\(.*?\))?:|^(add|adds|added|new|introduce|support)\b", re.I)),
]
# Developer shorthand to plain words.
PLAIN = [
    (r"\bWS\b", "connection"), (r"\bwebsocket\b", "connection"), (r"\bUI\b", "interface"),
    (r"\bDM(s)?\b", r"direct message\1"), (r"\bLiveKit\b", "calls"), (r"\bSFU\b", "call server"),
    (r"\bperms\b", "permissions"), (r"\bconfig\b", "settings"), (r"\bauth\b", "sign-in"),
]


def load():
    return json.loads(FILE.read_text(encoding="utf-8"))


def save(data):
    FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def vkey(v):
    return tuple(int(x) for x in v.split(".")) if SEMVER.match(v or "") else (-1,)


def validate(data):
    errors, seen = [], set()
    if not isinstance(data, list):
        return ["changelog must be a list"]
    for i, r in enumerate(data):
        at = f"release[{i}]"
        if not SEMVER.match(str(r.get("version", ""))):
            errors.append(f"{at}: version must be x.y.z")
        elif r["version"] in seen:
            errors.append(f"{at}: duplicate {r['version']}")
        seen.add(r.get("version"))
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(r.get("date", ""))):
            errors.append(f"{at}: date must be YYYY-MM-DD")
        if r.get("status") not in ("draft", "published"):
            errors.append(f"{at}: status must be draft or published")
        secs = r.get("sections") or {}
        for k in secs:
            if k not in SECTIONS:
                errors.append(f"{at}: unknown section {k}")
        if r.get("status") == "published" and not any(secs.get(k) for k in SECTIONS):
            errors.append(f"{at}: published with no items")
    return errors


def plain(subject):
    s = re.sub(r"^\w+(\(.*?\))?!?:\s*", "", subject.strip())   # conventional prefix
    s = re.sub(r"\s*\(#\d+\)$", "", s)                        # PR number
    s = re.sub(r"\s*\[[^\]]*\]\s*$", "", s)                    # trailing tags
    s = s.split(";")[0].strip().rstrip(".")
    for pat, rep in PLAIN:
        s = re.sub(pat, rep, s, flags=re.I)
    return s[:1].upper() + s[1:] if s else s


def classify(subject):
    for kind, pat in KIND:
        if pat.search(subject):
            return kind
    return "improved"


def git(*args):
    return subprocess.run(["git", "-C", str(ROOT), *args], check=True, capture_output=True, text=True).stdout


def draft(version):
    if not SEMVER.match(version):
        sys.exit(f"not a version: {version}")
    data = load()
    existing = next((r for r in data if r["version"] == version), None)
    if existing and existing["status"] == "published":
        sys.exit(f"{version} is already published; edit it by hand if it needs changes")
    try:
        prev = git("describe", "--tags", "--abbrev=0", "--match", "v*", "HEAD").strip()
    except subprocess.CalledProcessError:
        prev = ""
    if prev == f"v{version}":
        prev = git("describe", "--tags", "--abbrev=0", "--match", "v*", f"{prev}^").strip()
    rng = f"{prev}..HEAD" if prev else "HEAD"
    subjects = [s for s in git("log", "--no-merges", "--format=%s", rng).splitlines() if s.strip()]
    sections = {k: [] for k in SECTIONS}
    skipped = 0
    for s in subjects:
        if SKIP.search(s):
            skipped += 1
            continue
        text = plain(s)
        if text and text not in sections[classify(s)]:
            sections[classify(s)].append(text)
    entry = {
        "version": version,
        "date": date.today().isoformat(),
        "status": "draft",
        "title": "",
        "summary": "",
        "sections": {k: v for k, v in sections.items() if v},
    }
    data = [r for r in data if r["version"] != version]
    data.append(entry)
    data.sort(key=lambda r: vkey(r["version"]), reverse=True)
    save(data)
    kept = sum(len(v) for v in entry["sections"].values())
    print(f"Draft {version}: {kept} item(s) from {len(subjects)} commit(s) since {prev or 'the beginning'} ({skipped} internal skipped).")
    print(f"Edit {FILE.relative_to(ROOT)}: reword items for users, remove anything unfinished or internal,")
    print('add a title and summary, set "status": "published", then commit and deploy.')


def notes(version):
    r = next((r for r in load() if r["version"] == version), None)
    if not r or r["status"] != "published":
        return ""
    out = []
    if r.get("title"):
        out.append(f"**{r['title']}**\n")
    if r.get("summary"):
        out.append(r["summary"] + "\n")
    for k in SECTIONS:
        items = r["sections"].get(k) or []
        if items:
            out.append(f"### {TITLES[k]}\n")
            out += [f"- {i if isinstance(i, str) else i['text']}" for i in items]
            out.append("")
    out.append("Full changelog: https://getemix.com/changelog/")
    return "\n".join(out)


def main(argv):
    cmd = argv[1] if len(argv) > 1 else "status"
    current = json.loads((ROOT / "package.json").read_text())["version"]
    if cmd == "draft":
        draft(argv[2] if len(argv) > 2 else current)
    elif cmd == "check":
        errs = validate(load())
        print("\n".join(errs) if errs else "changelog.json is valid")
        sys.exit(1 if errs else 0)
    elif cmd == "notes":
        print(notes(argv[2] if len(argv) > 2 else current))
    elif cmd == "status":
        data = load()
        shown = [r for r in data if r["status"] == "published" and vkey(r["version"]) <= vkey(current)]
        drafts = [r["version"] for r in data if r["status"] == "draft"]
        print(f"version {current}: announces {shown[0]['version'] if shown else 'nothing'}"
              + (f"; drafts: {', '.join(drafts)}" if drafts else ""))
        if not any(r["version"] == current and r["status"] == "published" for r in data):
            print(f"warning: no published entry for {current}; users will see the previous release as the latest")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv)
