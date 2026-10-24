from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent
PROCESSED = ROOT / "processed"

CATALOGUE = PROCESSED / "crunchyroll_india_availability.csv"
MIRAI = PROCESSED / "mirai_integrated_dataset.csv"
FALLBACKS = [
    PROCESSED / "mirai_market_potential.csv",
    PROCESSED / "mirai_anime_dataset.csv",
    PROCESSED / "anime_enriched.csv",
    PROCESSED / "anime_shortlist.csv",
]

OUTPUT = PROCESSED / "mirai_integrated_with_streaming.csv"
REPORT = PROCESSED / "streaming_integration_report.txt"


def read_csv(path):
    return pd.read_csv(path, encoding="utf-8-sig")


def normalize(series):
    return (
        series.fillna("")
        .astype(str)
        .str.casefold()
        .str.replace(r"[^a-z0-9]", "", regex=True)
    )


def main():
    if not CATALOGUE.exists():
        raise FileNotFoundError(f"Missing catalogue: {CATALOGUE}")

    catalogue = read_csv(CATALOGUE)
    if "title" not in catalogue.columns:
        raise ValueError("Crunchyroll CSV must contain a 'title' column.")

    base_path = MIRAI if MIRAI.exists() else next(
        (p for p in FALLBACKS if p.exists()), None
    )

    if base_path is None:
        raise FileNotFoundError(
            "No MIRAI dataset found. Expected mirai_integrated_dataset.csv "
            "or one of the fallback datasets in processed."
        )

    anime = read_csv(base_path)

    title_column = next(
        (c for c in ["title", "anime_title", "name"] if c in anime.columns),
        None,
    )
    if title_column is None:
        raise ValueError(
            f"No title column found in {base_path.name}. "
            f"Columns: {list(anime.columns)}"
        )

    # Catalogue-level deduplication
    catalogue["title"] = catalogue["title"].fillna("").astype(str).str.strip()
    catalogue = catalogue[catalogue["title"] != ""].copy()
    catalogue["_key"] = normalize(catalogue["title"])
    catalogue = catalogue.drop_duplicates("_key", keep="first")

    # Use verified catalogue title matches only; do not infer availability
    anime["_key"] = normalize(anime[title_column])
    catalogue["_key"] = normalize(catalogue["title"])

    lookup = catalogue.drop_duplicates("_key").set_index("_key")
    anime["crunchyroll_catalogue_match"] = anime["_key"].isin(lookup.index)

    for column in ["platform", "platform_url", "source", "source_url"]:
        if column in lookup.columns:
            mapping = lookup[column].to_dict()
            anime[f"crunchyroll_{column}"] = anime["_key"].map(mapping)
        else:
            anime[f"crunchyroll_{column}"] = ""

    anime["streaming_availability_note"] = anime[
        "crunchyroll_catalogue_match"
    ].map({
        True: "Listed in the supplied AnistreamIN catalogue; verify current India availability.",
        False: "No exact title match in the supplied Crunchyroll catalogue; this does not prove unavailability.",
    })

    matched = int(anime["crunchyroll_catalogue_match"].sum())
    total = len(anime)

    anime.drop(columns=["_key"], inplace=True)
    anime.to_csv(OUTPUT, index=False, encoding="utf-8-sig")

    report = [
        "MIRAI Crunchyroll Catalogue Integration",
        f"Base dataset: {base_path.name}",
        f"Base rows: {total}",
        f"Crunchyroll catalogue rows: {len(catalogue)}",
        f"Exact normalized title matches: {matched}",
        f"Match coverage: {matched / total * 100:.2f}%" if total else "Match coverage: N/A",
        "",
        "Limitations:",
        "- Catalogue is third-party AnistreamIN data, not an official Crunchyroll export.",
        "- Current title availability must be verified on Crunchyroll India.",
        "- No exact match does not mean a title is unavailable.",
        "- Matching normalizes punctuation and spacing but does not resolve all aliases.",
        "",
        f"Output: {OUTPUT.name}",
    ]
    REPORT.write_text("\n".join(report), encoding="utf-8")

    print("\n".join(report))
    print("\nPreview:")
    cols = [title_column, "crunchyroll_catalogue_match",
            "crunchyroll_platform_url"]
    print(anime[cols].head(10).to_string(index=False))


if __name__ == "__main__":
    main()
