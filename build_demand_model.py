
from pathlib import Path
import pandas as pd
import numpy as np
import json

BASE = Path(__file__).resolve().parent
DATA = BASE / "processed"
DATA.mkdir(exist_ok=True)

# Load historical anime metadata
anime = pd.read_csv(DATA / "anime_clean.csv")
trends = pd.read_csv(DATA / "google_trends_india.csv")

# Clean numeric fields
for col in ["rating", "members"]:
    anime[col] = pd.to_numeric(anime[col], errors="coerce")

anime = anime.dropna(subset=["name", "rating", "members"])
anime = anime.drop_duplicates(subset=["anime_id"])

# Aggregate Google Trends signals
trends["trend_interest"] = pd.to_numeric(
    trends["trend_interest"], errors="coerce"
)

trend_summary = (
    trends.groupby("anime_title")["trend_interest"]
    .mean()
    .reset_index()
)

# Match titles conservatively using normalized names
def normalize_title(value):
    return str(value).lower().strip()

anime["match_title"] = anime["name"].map(normalize_title)
trend_summary["match_title"] = (
    trend_summary["anime_title"].map(normalize_title)
)

anime = anime.merge(
    trend_summary[["match_title", "trend_interest"]],
    on="match_title",
    how="left"
)

# Normalize features to percentiles
anime["quality_pct"] = anime["rating"].rank(pct=True) * 100
anime["popularity_pct"] = anime["members"].rank(pct=True) * 100

if anime["trend_interest"].notna().sum() > 1:
    anime["india_interest_pct"] = (
        anime["trend_interest"].rank(pct=True) * 100
    )
else:
    anime["india_interest_pct"] = np.nan

# Do not silently treat missing Trends data as zero.
# Use a neutral midpoint for this baseline and retain a coverage flag.
anime["has_india_signal"] = anime["india_interest_pct"].notna()
anime["india_interest_pct"] = anime["india_interest_pct"].fillna(50)

# Initial transparent score, not a trained prediction
anime["market_potential_score"] = (
    0.40 * anime["india_interest_pct"]
    + 0.35 * anime["popularity_pct"]
    + 0.25 * anime["quality_pct"]
).round(2)

anime = anime.sort_values(
    "market_potential_score", ascending=False
)

output_csv = DATA / "market_potential_baseline.csv"
anime.to_csv(output_csv, index=False)

top = anime[
    [
        "name", "rating", "members", "trend_interest",
        "has_india_signal", "market_potential_score"
    ]
].head(25)

output_json = BASE / "titles.json"
top.to_json(output_json, orient="records", indent=2)

print("MIRAI baseline created.")
print("Historical titles scored:", len(anime))
print("Titles with matched Trends signals:",
      int(anime["has_india_signal"].sum()))
print("CSV:", output_csv)
print("JSON:", output_json)
print("\nTop 15 titles:")
print(top.head(15).to_string(index=False))
