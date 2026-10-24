
from pathlib import Path
import pandas as pd

BASE = Path(__file__).resolve().parent
INPUT = BASE / "processed" / "india_trends_clean.csv"
OUTPUT = BASE / "processed" / "india_trends_summary.csv"

df = pd.read_csv(INPUT)
df["date"] = pd.to_datetime(df["date"], errors="coerce")
df["trend_interest"] = pd.to_numeric(
    df["trend_interest"], errors="coerce"
)

df = df.dropna(subset=["date", "trend_interest", "anime_title"])
df = df.sort_values("date")

latest_date = df["date"].max()
recent_start = latest_date - pd.Timedelta(days=90)

summary = (
    df.groupby("anime_title")
    .agg(
        observations=("trend_interest", "count"),
        average_interest=("trend_interest", "mean"),
        peak_interest=("trend_interest", "max"),
    )
    .reset_index()
)

recent = (
    df[df["date"] >= recent_start]
    .groupby("anime_title")["trend_interest"]
    .mean()
    .rename("recent_90d_interest")
)

summary = summary.merge(
    recent, on="anime_title", how="left"
)

summary["average_interest"] = summary["average_interest"].round(2)
summary["peak_interest"] = summary["peak_interest"].round(2)
summary["recent_90d_interest"] = summary["recent_90d_interest"].round(2)

summary = summary.sort_values(
    "average_interest", ascending=False
)

summary.to_csv(OUTPUT, index=False)

print("India Trends summary created.")
print("Titles analyzed:", len(summary))
print("Latest observation:", latest_date.date())
print("Saved to:", OUTPUT)
print(summary.to_string(index=False))
