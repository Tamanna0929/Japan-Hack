from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent
INPUT = ROOT / "processed" / "crunchyroll_india_availability.csv"
OUTPUT = ROOT / "processed" / "crunchyroll_india_availability_clean.csv"
REPORT = ROOT / "processed" / "crunchyroll_dataset_report.txt"

if not INPUT.exists():
    raise FileNotFoundError(f"Dataset not found: {INPUT}")

df = pd.read_csv(INPUT, encoding="utf-8-sig")

required = ["title", "platform", "platform_url"]
missing = [col for col in required if col not in df.columns]
if missing:
    raise ValueError(f"Missing required columns: {missing}")

# Normalize text fields.
for col in df.select_dtypes(include="object").columns:
    df[col] = df[col].fillna("").astype(str).str.strip()

# Remove empty titles and non-Crunchyroll entries.
df = df[df["title"].ne("")]
df = df[df["platform"].str.contains("crunchyroll", case=False, na=False)]

# Remove duplicate title/platform URL combinations.
df = df.drop_duplicates(
    subset=["title", "platform_url"],
    keep="first"
)

# Add useful fields for MIRAI analysis.
df["title_normalized"] = (
    df["title"].str.casefold().str.replace(r"\s+", " ", regex=True).str.strip()
)
df["has_genre_data"] = df["genres"].ne("") if "genres" in df.columns else False
df["has_episode_data"] = df["episodes"].ne("") if "episodes" in df.columns else False
df["has_platform_url"] = df["platform_url"].str.startswith(
    ("https://", "http://")
)

df = df.sort_values("title_normalized").reset_index(drop=True)
df.insert(0, "record_id", range(1, len(df) + 1))

df.to_csv(OUTPUT, index=False, encoding="utf-8-sig")

report = [
    "MIRAI - Crunchyroll Catalogue Dataset Report",
    "=" * 45,
    f"Input rows: {len(pd.read_csv(INPUT, encoding='utf-8-sig'))}",
    f"Clean output rows: {len(df)}",
    f"Unique normalized titles: {df['title_normalized'].nunique()}",
    f"Rows with genre data: {int(df['has_genre_data'].sum())}",
    f"Rows with episode data: {int(df['has_episode_data'].sum())}",
    f"Rows with platform URLs: {int(df['has_platform_url'].sum())}",
    "",
    "Source: AnistreamIN",
    "Repository: https://github.com/SAM10795/AnistreamIN",
    "Caveat: Catalogue entries are not proof of current availability.",
    "Verify individual titles on Crunchyroll India before making claims.",
    "",
    "First 15 records:",
    df[["title", "genres", "platform_url"]].head(15).to_string(index=False)
]

REPORT.write_text("\n".join(report), encoding="utf-8")

print("\nSUCCESS — Crunchyroll dataset cleaned.")
print(f"Rows: {len(df)}")
print(f"Unique titles: {df['title_normalized'].nunique()}")
print(f"CSV: {OUTPUT}")
print(f"Report: {REPORT}")
print("\nPreview:")
print(df[["title", "platform", "platform_url"]].head(10).to_string(index=False))
