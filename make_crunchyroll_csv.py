import json
import re
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "processed" / "anime_data.txt"
OUTPUT = ROOT / "processed" / "crunchyroll_india_availability.csv"

print(f"Reading: {SOURCE}")

with SOURCE.open("r", encoding="utf-8-sig") as f:
    data = json.load(f)

if isinstance(data, dict):
    data = data.get("data", data.get("anime", []))

if not isinstance(data, list):
    raise ValueError("Expected a JSON list of anime records.")

rows = []

for item in data:
    if not isinstance(item, dict):
        continue

    platforms = item.get("platform", [])
    platform_urls = item.get("platform_url", [])

    if isinstance(platforms, str):
        platforms = [platforms]
    if isinstance(platform_urls, str):
        platform_urls = [platform_urls]

    platforms = platforms or []
    platform_urls = platform_urls or []

    for i, platform in enumerate(platforms):
        platform_name = str(platform).strip()

        if "crunchyroll" not in platform_name.casefold():
            continue

        url = str(platform_urls[i]) if i < len(platform_urls) else ""

        rows.append({
            "title": item.get("title", ""),
            "alternate_titles": " | ".join(
                str(x) for x in (item.get("title_alt") or [])
            ) if isinstance(item.get("title_alt"), list)
              else str(item.get("title_alt", "")),
            "genres": " | ".join(
                str(x) for x in (item.get("genres") or [])
            ) if isinstance(item.get("genres"), list)
              else str(item.get("genres", "")),
            "episodes": item.get("eps", ""),
            "release_info": item.get("premiered", ""),
            "platform": platform_name,
            "platform_url": url,
            "source": "AnistreamIN",
            "source_url": "https://github.com/SAM10795/AnistreamIN",
            "availability_note": (
                "Listed in AnistreamIN's India streaming catalogue; "
                "verify current title availability on Crunchyroll India."
            )
        })

df = pd.DataFrame(rows)

if df.empty:
    print("No Crunchyroll records found.")
    print("Available keys in first record:")
    print(list(data[0].keys()) if data else "Dataset is empty")
else:
    df = df.drop_duplicates(subset=["title", "platform_url"])
    df = df.sort_values("title", key=lambda s: s.astype(str).str.casefold())
    df.to_csv(OUTPUT, index=False, encoding="utf-8-sig")

    print(f"\nSUCCESS: Saved {len(df)} Crunchyroll records.")
    print(f"Output: {OUTPUT}")
    print("\nPreview:")
    print(df[["title", "platform", "platform_url"]].head(10).to_string(index=False))
