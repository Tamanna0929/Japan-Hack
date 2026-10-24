
from pathlib import Path
import pandas as pd

DATA = Path(__file__).resolve().parent / "processed"
FILE = DATA / "mirai_anime_dataset.csv"

df = pd.read_csv(FILE)

print("\n=== DATASET OVERVIEW ===")
print("File:", FILE)
print("Rows:", len(df))
print("Unique anime:", df["anime_title"].nunique())
print("Unique dates:", df["date"].nunique())
print("Date range:", df["date"].min(), "to", df["date"].max())

print("\n=== MATCHING STATUS ===")
print(df.groupby("anime_title")["anilist_match"].first().to_string())

print("\n=== TREND INTEREST QUALITY ===")
print("Missing values:", df["trend_interest"].isna().sum())
print("Zero values (%):")
zero_pct = (
    df.assign(is_zero=df["trend_interest"].eq(0))
    .groupby("anime_title")["is_zero"]
    .mean()
    .mul(100)
    .round(1)
)
print(zero_pct.sort_values(ascending=False).to_string())

print("\n=== NONZERO TREND OBSERVATIONS ===")
nonzero = df[df["trend_interest"] > 0]
print(nonzero.groupby("anime_title").size().to_string())

print("\n=== DUPLICATE CHECK ===")
print("Exact duplicate rows:", df.duplicated().sum())
print(
    "Duplicate anime-date pairs:",
    df.duplicated(subset=["anime_title", "date"]).sum()
)

print("\n=== DIAGNOSIS COMPLETE ===")
