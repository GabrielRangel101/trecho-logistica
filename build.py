"""Embute data.json + geometria + app.js no template e gera index.html (arquivo único)."""
import json, sys
from geo import OUTLINE, VORONOI_W
t = open("template.html", encoding="utf-8").read()
data = open("data.json", encoding="utf-8").read()
geo = json.dumps({"outline": OUTLINE, "w": VORONOI_W}, separators=(",", ":"))
app = open("app.js", encoding="utf-8").read()
mesa = "\n".join(open(f, encoding="utf-8").read() for f in ("mesa_core.js", "mesa_tools.js", "mesa_ui.js"))
app = app.replace("/*__MESA__*/", mesa)
# URL pública (ex.: python build.py --url https://gabrielrangel101.github.io/trecho/): og:image e og:url precisam ser absolutos para o LinkedIn
url = sys.argv[sys.argv.index("--url") + 1].rstrip("/") + "/" if "--url" in sys.argv else ""
t = t.replace("%%OG_IMAGE%%", url + "og.png").replace("%%OG_URL%%", f'<meta property="og:url" content="{url}">\n<link rel="canonical" href="{url}">\n' if url else "")
t = t.replace("/*__DATA__*/null", data).replace("/*__GEO__*/null", geo).replace("/*__APP__*/", app)
open("index.html", "w", encoding="utf-8").write(t)
print("index.html", len(t) // 1024, "KB")
