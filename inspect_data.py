
import pandas as pd
from pathlib import Path

folder = Path(__file__).parent
report = folder / "dataset_report.txt"

with open(report, "w", encoding="utf-8") as out:
    for file in sorted(folder.rglob("*.csv")):
        try:
            df = pd.read_csv(file, low_memory=False)

            out.write("\n" + "=" * 70 + "\n")
            out.write(f"FILE: {file.relative_to(folder)}\n")
            out.write(f"ROWS: {len(df)}\n")
            out.write(f"COLUMNS: {df.columns.tolist()}\n")
            out.write(f"MISSING VALUES:\n{df.isnull().sum().to_string()}\n")
            out.write(f"DUPLICATES: {df.duplicated().sum()}\n")
            out.write(f"FIRST 3 ROWS:\n{df.head(3).to_string(index=False)}\n")

        except Exception as e:
            out.write(f"\nERROR: {file.name}: {e}\n")

print(f"Report saved to: {report}")
