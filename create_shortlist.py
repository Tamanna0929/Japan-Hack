
import pandas as pd
from pathlib import Path

folder = Path(__file__).parent
input_file = folder / "processed" / "anime_clean.csv"
output_folder = folder / "processed"

df = pd.read_csv(input_file)

# Keep records with valid popularity and rating data
df["members"] = pd.to_numeric(df["members"], errors="coerce")
df["rating"] = pd.to_numeric(df["rating"], errors="coerce")

df = df.dropna(subset=["name", "members", "rating"])
df = df[df["rating"].between(0, 10)]
df = df[df["members"] > 0]

# Remove duplicate anime IDs
df = df.drop_duplicates(subset=["anime_id"])

# Select the 50 most popular anime
shortlist = df.sort_values(
    "members", ascending=False
).head(50).copy()

# Save the shortlist
output_file = output_folder / "anime_shortlist.csv"
shortlist.to_csv(output_file, index=False)

print("Shortlist created successfully.")
print("Number of anime:", len(shortlist))
print("Saved to:", output_file)

print("\nSelected anime:")
print(
    shortlist[["anime_id", "name", "genre", "rating", "members"]]
    .head(20)
    .to_string(index=False)
)