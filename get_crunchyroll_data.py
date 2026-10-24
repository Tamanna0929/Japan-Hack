import pandas as pd
import requests
from pathlib import Path

url = "https://sam10795.github.io/AnistreamIN/index.html"
out = Path("processed")
out.mkdir(exist_ok=True)

print("Downloading public anime catalogue...")
r = requests.get(url, timeout=30)
r.raise_for_status()

from bs4 import BeautifulSoup
soup = BeautifulSoup(r.text, "html.parser")

scripts = [
    s.get("src") for s in soup.find_all("script") if s.get("src")
]

print("Page downloaded.")
print("JavaScript files discovered:", len(scripts))

for script in scripts:
    print(" -", script)

(out / "anistreamin_page.html").write_text(r.text, encoding="utf-8")
print("\nSaved webpage to processed/anistreamin_page.html")
print("Next we need to identify the catalogue data source.")
