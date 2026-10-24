
from pathlib import Path
import pandas as pd

BASE = Path(__file__).resolve().parent
INPUT = BASE / "processed" / "india_state_trends.csv"
OUTPUT = BASE / "processed" / "state_anime_summary.csv"

df = pd.read_csv(INPUT)
df["trend_interest"] = pd.to_numeric(
    df["trend_interest"], errors="coerce"
)

summary = (
    df.groupby(["state", "anime_title"])
    .agg(
        average_interest=("trend_interest", "mean"),
        peak_interest=("trend_interest", "max"),
        observations=("trend_interest", "count"),
        weeks_with_interest=(
            "trend_interest",
            lambda x: (x > 0).sum()
        )
    )
    .reset_index()
)

summary["average_interest"] = summary["average_interest"].round(2)

summary = summary.sort_values(
    ["state", "average_interest"],
    ascending=[True, False]
)

summary.to_csv(OUTPUT, index=False)

print("State-level anime analysis complete.")
print("Saved to:", OUTPUT)
print("\nTop anime by state:")
print(
    summary.groupby("state", group_keys=False)
    .head(3)
    .to_string(index=False)
)
