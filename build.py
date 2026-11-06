"""Inline src/logic.js into src/app.html -> index.html (the single file that gets published)."""
from pathlib import Path

root = Path(__file__).parent
html = (root / "src/app.html").read_text(encoding="utf-8")
logic = (root / "src/logic.js").read_text(encoding="utf-8")
assert "/*LOGIC*/" in html
(root / "index.html").write_text(html.replace("/*LOGIC*/", logic), encoding="utf-8")
print("wrote index.html", len(html) + len(logic), "bytes")
