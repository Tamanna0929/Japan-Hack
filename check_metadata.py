
import pandas as pd
from pathlib import Path

folder = Path(__file__).parent
report_path = folder / "metadata_report.txt"

files = [
    "anime.csv",
    "airing_anime.csv",
    "anilist_seasonal_20261023.csv",
    "jikan_seasonal_20260826.csv",
]

with open(report_path, "w", encoding="utf-8") as report:
    for filename in files:
        path = folder / filename

        report.write("\n" + "=" * 60 + "\n")
        report.write(f"FILE: {filename}\n")

        try:
            df = pd.read_csv(path, low_memory=False)

            report.write(f"Shape: {df.shape}\n")
            report.write(f"Columns:\n")

            for col in df.columns:
                report.write(f"- {col}\n")

            report.write("\nFirst 2 rows:\n")
            report.write(
                df.head(2).to_string(
                    index=False,
                    max_cols=12,
                    max_colwidth=35
                )
            )
            report.write("\n")

            print(f"{filename}: {df.shape[0]} rows, "
                  f"{df.shape[1]} columns")

        except Exception as error:
            report.write(f"ERROR: {error}\n")
            print(f"Error reading {filename}: {error}")

print(f"\nFull report saved to: {report_path}")
