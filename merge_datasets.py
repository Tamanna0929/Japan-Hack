
import pandas as pd
from pathlib import Path

folder = Path(__file__).parent
processed = folder / "processed"
processed.mkdir(exist_ok=True)

# Load the cleaned historical anime dataset
base = pd.read_csv(processed / "anime_clean.csv")

# Standardize IDs before matching
base["anime_id"] = pd.to_numeric(
    base["anime_id"], errors="coerce"
).astype("Int64")

print("Historical anime records:", len(base))

# --------------------------------------------------
# 1. Merge AniList seasonal metadata using mal_id
# --------------------------------------------------
ani = pd.read_csv(
    folder / "anilist_seasonal_20261023.csv",
    low_memory=False
)

ani["mal_id"] = pd.to_numeric(
    ani["mal_id"], errors="coerce"
).astype("Int64")

# Exclude records explicitly marked as adult
if "is_adult" in ani.columns:
    adult = ani["is_adult"].astype(str).str.lower().isin(
        ["true", "1", "yes"]
    )
    ani = ani.loc[~adult].copy()

# Keep useful metadata only
ani_columns = [
    "mal_id", "title", "english_title", "studios",
    "genres", "tags", "synopsis", "source",
    "season", "season_year", "streaming_sites",
    "trailer_site", "trailer_id", "site_url"
]

ani_columns = [
    col for col in ani_columns if col in ani.columns
]

ani = ani[ani_columns].copy()

# One row per MAL ID, avoiding duplicate matches
ani = ani.dropna(subset=["mal_id"])
ani = ani.drop_duplicates(subset=["mal_id"], keep="first")

ani = ani.rename(columns={
    col: f"anilist_{col}"
    for col in ani.columns
    if col != "mal_id"
})

enriched = base.merge(
    ani,
    left_on="anime_id",
    right_on="mal_id",
    how="left",
    validate="one_to_one"
)

enriched = enriched.drop(columns=["mal_id"], errors="ignore")

print("AniList matches:", enriched["anilist_title"].notna().sum()
      if "anilist_title" in enriched.columns else 0)

# --------------------------------------------------
# 2. Add Jikan metadata using its MAL anime ID
# --------------------------------------------------
jikan = pd.read_csv(
    folder / "jikan_seasonal_20260826.csv",
    low_memory=False
)

jikan["anime_id"] = pd.to_numeric(
    jikan["anime_id"], errors="coerce"
).astype("Int64")

jikan_columns = [
    "anime_id", "english_title", "studios", "producers",
    "themes", "demographics", "trailer_url", "image_url"
]

jikan_columns = [
    col for col in jikan_columns if col in jikan.columns
]

jikan = jikan[jikan_columns].copy()
jikan = jikan.dropna(subset=["anime_id"])
jikan = jikan.drop_duplicates(subset=["anime_id"], keep="first")

jikan = jikan.rename(columns={
    col: f"jikan_{col}"
    for col in jikan.columns
    if col != "anime_id"
})

enriched = enriched.merge(
    jikan,
    on="anime_id",
    how="left",
    validate="one_to_one"
)

print("Jikan matches:", enriched["jikan_english_title"].notna().sum()
      if "jikan_english_title" in enriched.columns else 0)

# Save
output = processed / "anime_enriched.csv"
enriched.to_csv(output, index=False)

print("\nMerge complete.")
print("Final records:", len(enriched))
print("Final columns:", len(enriched.columns))
print("Saved to:", output)
print("\nSample:")
print(enriched.head(5).to_string(index=False, max_cols=10))
