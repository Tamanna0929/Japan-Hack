import json
import time
from pathlib import Path

import pandas as pd
import requests

out = Path("processed")
out.mkdir(exist_ok=True)

url = "https://raw.githubusercontent.com/SAM10795/AnistreamIN/master/anime_data.js"
target = out / "anime_data.js"

session = requests.Session()
session.headers.update({"User-Agent": "Mozilla/5.0 MIRAI-research"})

for attempt in range(1, 6):
    try:
        print(f"Download attempt {attempt}/5...")
        response = session.get(url, timeout=90)
        response.raise_for_status()

        if len(response.content) < 1000:
            raise ValueError("Downloaded file is unexpectedly small.")

        target.write_bytes(response.content)
        print(f"Downloaded {len(response.content):,} bytes.")
        break

    except Exception as exc:
        print("Download failed:", exc)
        if attempt == 5:
            raise SystemExit(
                "\nDownload failed after 5 attempts. "
                "Open the raw URL in your browser and save it manually."
            )
        time.sleep(3)

try:
    data = json.loads(target.read_text(encoding="utf-8-sig"))
except Exception as exc:
    raise SystemExit(
        f"File downloaded, but JSON parsing failed: {exc}\n"
        "The file may use a JavaScript wrapper instead of plain JSON."
    )

if not isinstance(data, list) or not data:
    raise SystemExit("Expected a non-empty JSON list of anime records.")

df = pd.json_normalize(data)
csv_path = out / "anistreamin_anime_catalogue.csv"
df.to_csv(csv_path, index=False, encoding="utf-8-sig")

print("\nSUCCESS")
print("Anime records:", len(df))
print("CSV saved to:", csv_path.resolve())
print("\nColumns:")
print(df.columns.tolist())
print("\nFirst 5 records:")
print(df.head().to_string(index=False))

print("\nPlatform-related columns:")
matches = [
    c for c in df.columns
    if any(w in c.lower() for w in
           ["platform", "stream", "crunchyroll", "availability"])
]
print(matches if matches else "None found")
