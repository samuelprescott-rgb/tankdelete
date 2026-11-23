"""Package the approved frozen 1613 browser build, not the live working tree."""
import argparse
import hashlib
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
TOP = "TankDelete-1613/"
EXPECTED = {
    "assets/GameSession-NKc4J1be.js": "da7e8dabb0bab83e98fbb8ff36b7408528716b544b7b913cdb4f254fbcd87b95",
    "assets/river-r3-reference-D-c6X1oE.png": "b850e26694e45d5407c00cb350bfc8c84ea72fa72f3f80b0275efdd2051f3583",
}
digest = lambda data: hashlib.sha256(data).hexdigest()


def package(dist, output):
    files = {}
    for p in sorted(dist.rglob("*")):
        if p.is_symlink():
            raise ValueError("Refusing a linked asset: {}".format(p))
        if not p.is_file():
            continue
        rel = p.relative_to(dist).as_posix()
        top = rel.split("/")[0]
        if not (top in {"assets", "audio", "images", "fonts", "models"}
                or rel in {"index.html", ".vite/manifest.json"}
                or ("/" not in rel and rel.endswith("-LICENSE.txt"))):
            raise ValueError("Unexpected file in the frozen build: " + rel)
        if any(part.startswith(".") for part in rel.split("/")) and rel != ".vite/manifest.json":
            raise ValueError("Unexpected hidden asset: " + rel)
        files["web/" + rel] = p
    for rel, checksum in EXPECTED.items():
        if digest(files["web/" + rel].read_bytes()) != checksum:
            raise ValueError("Wrong build: " + rel)
    for rel in ("README.md", "play.py"):
        files[rel] = ROOT / "playtest" / rel
    output.parent.mkdir(parents=True, exist_ok=True)
    # Fixed timestamps and permissions; never clobber an earlier handoff.
    with ZipFile(output, "x") as z:
        def put(name, data):
            info = ZipInfo(TOP + name, (2026, 11, 22, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            z.writestr(info, data, compress_type=ZIP_DEFLATED, compresslevel=4)
        manifest = []
        for name, path in sorted(files.items()):
            data = path.read_bytes()
            put(name, data)
            manifest.append(digest(data) + "  " + name)
        put("SHA256SUMS", ("\n".join(manifest) + "\n").encode())
    with ZipFile(output) as check:
        if check.testzip() is not None:
            raise ValueError("ZIP integrity check failed")
    print("{} files + manifest; {} bytes; SHA-256 {}\n{}".format(
        len(files), output.stat().st_size, digest(output.read_bytes()), output))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dist", type=Path)
    parser.add_argument("output_zip", type=Path)
    opts = parser.parse_args()
    package(opts.dist.resolve(), opts.output_zip.resolve())
