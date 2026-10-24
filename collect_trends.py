
import time
from pathlib import Path

import pandas as pd
from pytrends.request import TrendReq

BASE_DIR = Path(__file__).resolve().parent
INPUT_FILE = BASE_DIR / "processed" / "anime_shortlist.csv"
OUTPUT_DIR = BASE_DIR / "processed"
OUTPUT_FILE = OUTPUT_DIR / "google_trends_india.csv"

# A common search term used in every request for relative comparison.
REFERENCE_TERM = "anime"

df = pd.read_csv(INPUT_FILE)

titles = (
    df.sort_values("members", ascending=False)["name"]
    .dropna()
    .astype(str)
    .drop_duplicates()
    .head(10)
    .tolist()
)

if not titles:
    raise ValueError("No anime titles found in anime_shortlist.csv")

print("India-only Google Trends collection")
print("Reference term:", REFERENCE_TERM)
print("Anime selected:", len(titles))

pytrends = TrendReq(
    hl="en-IN",
    tz=330,
    timeout=(10, 30)
)

all_results = []

# Four anime + one reference term per request.
for start in range(0, len(titles), 4):
    batch = titles[start:start + 4]
    batch_number = start // 4 + 1
    keywords = batch + [REFERENCE_TERM]

    print(f"\nBatch {batch_number}: {batch}")

    try:
        pytrends.build_payload(
            kw_list=keywords,
            cat=0,
            timeframe="today 5-y",
            geo="IN",
            gprop=""
        )

        trends = pytrends.interest_over_time()

        if trends.empty:
            print("No data returned. Skipping batch.")
            time.sleep(5)
            continue

        trends = trends.drop(columns=["isPartial"], errors="ignore")
        trends.index.name = "date"
        trends = trends.reset_index()

        # Keep the reference series so batches can be compared later.
        trends_long = trends.melt(
            id_vars=["date"],
            var_name="search_term",
            value_name="trend_interest"
        )

        trends_long["batch"] = batch_number
        trends_long["is_reference"] = (
            trends_long["search_term"].str.casefold()
            == REFERENCE_TERM.casefold()
        )

        all_results.append(trends_long)
        print("Retrieved observations:", len(trends_long))

    except Exception as error:
        print(f"Batch {batch_number} failed: {error}")

    time.sleep(5)

if not all_results:
    raise RuntimeError(
        "No Trends data collected. Wait and retry if Google Trends "
        "rate-limited the requests."
    )

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

result = pd.concat(all_results, ignore_index=True)
result = result.drop_duplicates(
    subset=["date", "search_term", "batch"]
)
result.to_csv(OUTPUT_FILE, index=False)

print("\nCollection complete.")
print("Rows:", len(result))
print("Unique search terms:", result["search_term"].nunique())
print("Batches:", sorted(result["batch"].unique()))
print("Saved to:", OUTPUT_FILE)
print("\nReference observations by batch:")
print(
    result[result["is_reference"]]
    .groupby("batch")["trend_interest"]
    .agg(["count", "mean", "max"])
    .to_string()
)
