from pathlib import Path
import requests
import re

html = Path("processed/anistreamin_page.html").read_text(encoding="utf-8")

scripts = re.findall(
    r'<script\b[^>]*\bsrc=["\']([^"\']+)["\']',
    html,
    flags=re.I
)

print("JavaScript files:")
for src in scripts:
    if src.startswith("//"):
        url = "https:" + src
    elif src.startswith("http"):
        url = src
    else:
        url = "https://sam10795.github.io" + (
            src if src.startswith("/") else "/AnistreamIN/" + src
        )

    print("\nChecking:", url)

    try:
        r = requests.get(url, timeout=30)
        print("Status:", r.status_code)

        if r.ok and any(
            word in r.text.lower()
            for word in ["crunchyroll", "anime_data", "platform"]
        ):
            print("Potential catalogue script found!")
            print(r.text[:1200])
    except requests.RequestException as e:
        print("Could not fetch:", e)
