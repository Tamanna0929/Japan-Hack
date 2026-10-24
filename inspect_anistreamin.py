from pathlib import Path
import re

p = Path("processed/anistreamin_page.html")
html = p.read_text(encoding="utf-8")

print("=== DATA FILE REFERENCES ===")
for item in sorted(set(re.findall(
    r"""["']([^"']+\.(?:json|csv|js)(?:\?[^"']*)?)["']""",
    html,
    re.I
))):
    print(item)

print("\n=== ANIME / PLATFORM REFERENCES ===")
for word in ["crunchyroll", "anime_data", ".json", ".csv", "fetch("]:
    print(f"{word}: {html.lower().count(word.lower())} occurrences")

print("\n=== PAGE TEXT PREVIEW ===")
print(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))[:1800])
