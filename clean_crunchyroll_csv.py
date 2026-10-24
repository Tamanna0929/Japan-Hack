from pathlib import Path
import pandas as pd

path = Path("processed/crunchyroll_india_availability.csv")
df = pd.read_csv(path, encoding="utf-8-sig")

before = len(df)

df["title_key"] = df["title"].astype(str).str.strip().str.casefold()
df = df.drop_duplicates(subset=["title_key", "platform_url"])
df = df.drop(columns=["title_key"])

df.to_csv(path, index=False, encoding="utf-8-sig")

print("CLEANUP COMPLETE")
print(f"Rows before: {before}")
print(f"Rows after: {len(df)}")
print(f"Duplicates removed: {before - len(df)}")
print(f"Saved to: {path}")
