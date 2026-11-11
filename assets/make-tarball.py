"""Build a prebuilt install tarball of the plugin (runtime files only).

Excludes dev-only paths (test/, docs/, market/, .git/, root .dsh/ runtime state)
but INCLUDES the bundled workflow assets under assets/.dsh/ (required at runtime).
No credentials, no bytecode caches, no lockfiles.
"""
import os
import tarfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(ROOT), "dsh-novel-mode.tgz")
EXCLUDE_TOP = {".git", "test", "docs", "market", "__pycache__"}
EXCLUDE_FILES = {"package-lock.json"}


def wanted(rel):
    parts = rel.replace("\\", "/").split("/")
    if parts[0] in EXCLUDE_TOP:
        return False
    # Root-level runtime checkpoint dir is excluded; the bundled assets/.dsh is NOT.
    if parts[0] == ".dsh":
        return False
    name = parts[-1]
    if name in EXCLUDE_FILES or name.endswith(".pyc"):
        return False
    if name in {"fanqie-auth.json", "fanqienovel_auth.json", "publish_result.json"}:
        return False
    return True


def main():
    if os.path.exists(OUT):
        os.remove(OUT)
    # pnpm strips the FIRST path segment when extracting a tgz. A root-level
    # layout therefore flattens every subdirectory (lib/x.js -> x.js) and the
    # installed plugin cannot find its own files. npm/pnpm tarballs require a
    # single top-level `package/` wrapper (upstream maintainer feedback on
    # awesome-dsh-plugin PR #13689).
    PREFIX = "package/"
    count = 0
    with tarfile.open(OUT, "w:gz") as tar:
        for dirpath, dirnames, filenames in os.walk(ROOT):
            rel_dir = os.path.relpath(dirpath, ROOT).replace("\\", "/")
            if rel_dir == ".":
                dirnames[:] = [d for d in dirnames if d not in EXCLUDE_TOP and d != ".dsh"]
            for name in filenames:
                full = os.path.join(dirpath, name)
                rel = os.path.relpath(full, ROOT).replace("\\", "/")
                if wanted(rel):
                    tar.add(full, arcname=PREFIX + rel)
                    count += 1
    with tarfile.open(OUT) as t:
        names = t.getnames()
    assert names, "tarball is empty"
    bad = [n for n in names if not n.startswith(PREFIX)]
    assert not bad, f"entries without {PREFIX} prefix: {bad[:5]}"
    print("wrote", OUT, "entries=", count, "prefix=", PREFIX)
    print("skills=", sum(1 for n in names if n.endswith("SKILL.md")))
    print("ps1=", sum(1 for n in names if n.endswith(".ps1")))
    print("png=", [n for n in names if n.endswith(".png")])


if __name__ == "__main__":
    main()
