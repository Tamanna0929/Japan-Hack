
import pandas as pd
from pathlib import Path

folder = Path(__file__).parent
output_folder = folder / "processed"
output_folder.mkdir(exist_ok=True)

df = pd.read_csv(folder / "anime.csv")

print("Original records:", len(df))

df = df.drop_duplicates(subset="anime_id", keep="first").copy()

for col in ["name", "genre", "type"]:
    df[col] = df[col].astype("string").str.strip()

df["genre"] = df["genre"].fillna("Unknown")
df["type"] = df["type"].fillna("Unknown")

for col in ["anime_id", "episodes", "rating", "members"]:
    df[col] = pd.to_numeric(df[col], errors="coerce")

df.loc[~df["rating"].between(0, 10), "rating"] = float("nan")

df = df.dropna(subset=["anime_id", "name"])
df = df[df["name"].str.len() > 0].copy()

df.to_csv(output_folder / "anime_clean.csv", index=False)

print("Clean records:", len(df))
print("Missing ratings:", df["rating"].isna().sum())
print("Duplicate IDs:", df["anime_id"].duplicated().sum())
print("Saved to:", output_folder / "anime_clean.csv")
