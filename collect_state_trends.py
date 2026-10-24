
import time
from pathlib import Path

import pandas as pd
from pytrends.request import TrendReq

BASE = Path(__file__).resolve().parent
OUTPUT_DIR = BASE / "processed"
OUTPUT_DIR.mkdir(exist_ok=True)
OUTPUT_FILE = OUTPUT_DIR / "india_state_trends.csv"

# Google Trends geographic codes for Indian states/UTs.
# These are examples to start with; we will expand after confirming results.
REGIONS = {
    "Delhi": "IN-DL",
    "Maharashtra": "IN-MH",
    "Karnataka": "IN-KA",
    "Tamil Nadu": "IN-TN",
    "Telangana": "IN-TG",
    "West Bengal": "IN-WB",
    "Uttar Pradesh": "IN-UP",
    "Kerala": "IN-KL",
    "Gujarat": "IN-GJ",
    "Punjab": "IN-PB",
}

TERMS = ["Naruto", "Death Note", "One Piece"]

pytrends = TrendReq(
    hl="en-IN",
    tz=330,
    timeout=(10, 30)
)

rows = []

for state, geo in REGIONS.items():
    print(f"Collecting: {state} ({geo})")

    for term in TERMS:
        try:
            pytrends.build_payload(
                kw_list=[term],
                timeframe="today 5-y",
                geo=geo
            )

            data = pytrends.interest_over_time()

            if not data.empty and term in data.columns:
                for date, value in data[term].items():
                    rows.append({
                        "state": state,
                        "geo": geo,
                        "anime_title": term,
                        "date": date,
                        "trend_interest": int(value)
                    })

                print(f"  collected {term}: {len(data)} weeks")
            else:
                print(f"  no data for {term}")

        except Exception as error:
            print(f"  failed {term}: {error}")

        time.sleep(2)

if rows:
    result = pd.DataFrame(rows)
    result.to_csv(OUTPUT_FILE, index=False)
    print("\nState-level collection complete.")
    print("Rows:", len(result))
    print("Saved to:", OUTPUT_FILE)
    print(result.head(10).to_string(index=False))
else:
    print("No data collected. Google Trends may be rate-limiting requests.")
