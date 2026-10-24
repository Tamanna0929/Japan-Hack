
from pathlib import Path
import pandas as pd

BASE = Path(__file__).resolve().parent
DATA = BASE / "processed"

TRENDS_INPUT = DATA / "google_trends_india.csv"
ANILIST_INPUT = DATA / "anilist_anime.csv"

TRENDS_OUTPUT = DATA / "india_trends_clean.csv"
MERGED_OUTPUT = DATA / "mirai_anime_dataset.csv"
REPORT_OUTPUT = DATA / "mirai_dataset_report.txt"


def load_trends():
    if not TRENDS_INPUT.exists():
        raise FileNotFoundError(
            f"Google Trends file not found: {TRENDS_INPUT}"
        )

    df = pd.read_csv(TRENDS_INPUT)

    required = {"date", "search_term", "trend_interest", "batch"}
    missing = required - set(df.columns)

    if missing:
        raise ValueError(
            f"Google Trends file is missing columns: {sorted(missing)}"
        )

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["trend_interest"] = pd.to_numeric(
        df["trend_interest"], errors="coerce"
    )
    df["search_term"] = df["search_term"].astype("string").str.strip()

    df = df.dropna(
        subset=["date", "trend_interest", "search_term", "batch"]
    ).copy()

    df = df[df["search_term"] != ""]

    df["is_reference"] = (
        df["search_term"].str.casefold() == "anime"
    )

    references = df[df["is_reference"]].copy()
    anime = df[~df["is_reference"]].copy()

    if references.empty:
        raise ValueError(
            "No 'anime' reference observations were found in Google Trends."
        )

    reference_summary = (
        references.groupby("batch")["trend_interest"]
        .agg(
            reference_mean="mean",
            reference_max="max",
            reference_count="count",
        )
        .reset_index()
    )

    print("\nGoogle Trends reference statistics:")
    print(reference_summary.to_string(index=False))

    anime = anime.merge(reference_summary, on="batch", how="left")

    anime["reference_ratio"] = (
        anime["trend_interest"]
        / anime["reference_mean"].where(
            anime["reference_mean"] != 0
        )
    )

    anime["reference_index"] = (
        anime["reference_ratio"] * 100
    ).round(3)

    anime = anime.rename(columns={"search_term": "anime_title"})
    anime = anime.drop(columns=["is_reference"], errors="ignore")

    anime.to_csv(TRENDS_OUTPUT, index=False, encoding="utf-8-sig")

    print(f"\nClean Trends observations: {len(anime):,}")
    print(f"Unique Trends search terms: {anime['anime_title'].nunique():,}")
    print(f"Saved: {TRENDS_OUTPUT}")

    return anime


def load_anilist():
    if not ANILIST_INPUT.exists():
        raise FileNotFoundError(
            f"AniList file not found: {ANILIST_INPUT}"
        )

    df = pd.read_csv(ANILIST_INPUT)

    required = {"anilist_id", "title_romaji"}
    missing = required - set(df.columns)

    if missing:
        raise ValueError(
            f"AniList file is missing columns: {sorted(missing)}"
        )

    df["anilist_id"] = pd.to_numeric(
        df["anilist_id"], errors="coerce"
    )

    df = df.dropna(subset=["anilist_id"]).copy()
    df["anilist_id"] = df["anilist_id"].astype("int64")

    # Keep one row per AniList ID.
    df = df.drop_duplicates(subset=["anilist_id"], keep="first")

    # English title is often absent; use romaji as a display fallback.
    if "title_english" not in df.columns:
        df["title_english"] = pd.NA

    df["display_title"] = (
        df["title_english"].astype("string").str.strip()
    )

    empty_titles = (
        df["display_title"].isna()
        | df["display_title"].eq("")
    )

    df.loc[empty_titles, "display_title"] = (
        df.loc[empty_titles, "title_romaji"]
    )

    # Do not fill scores, genres, or studios with invented values.
    print(f"\nUnique AniList records: {len(df):,}")
    print(
        "Missing English titles: "
        f"{df['title_english'].isna().sum():,}"
    )

    return df


def main():
    trends = load_trends()
    anilist = load_anilist()

    # Normalize titles for a conservative exact-title join.
    # This is not fuzzy matching and may leave alternate titles unmatched.
    trends["join_title"] = (
        trends["anime_title"]
        .astype("string")
        .str.casefold()
        .str.replace(r"[^a-z0-9]+", " ", regex=True)
        .str.strip()
    )

    anilist["join_title"] = (
        anilist["display_title"]
        .astype("string")
        .str.casefold()
        .str.replace(r"[^a-z0-9]+", " ", regex=True)
        .str.strip()
    )

    # Some titles may repeat in AniList. Avoid multiplying Trends rows.
    anilist_for_join = anilist.drop_duplicates(
        subset=["join_title"],
        keep="first",
    )

    merged = trends.merge(
        anilist_for_join,
        on="join_title",
        how="left",
        suffixes=("_trends", "_anilist"),
        indicator=True,
    )

    merged["anilist_match"] = (
        merged["_merge"] == "both"
    )

    merged = merged.drop(columns=["_merge", "join_title"])

    merged.to_csv(
        MERGED_OUTPUT,
        index=False,
        encoding="utf-8-sig",
    )

    matched = int(merged["anilist_match"].sum())
    total = len(merged)

    report = [
        "MIRAI DATASET BUILD REPORT",
        "==========================",
        f"Google Trends observations: {total}",
        f"Unique Trends titles: {trends['anime_title'].nunique()}",
        f"AniList unique IDs: {anilist['anilist_id'].nunique()}",
        f"Trends rows matched to AniList: {matched}",
        f"Trends rows not matched: {total - matched}",
        (
            "Match rate: "
            f"{(matched / total * 100):.2f}%"
            if total else "Match rate: N/A"
        ),
        "",
        "IMPORTANT LIMITATIONS",
        "- The title join is normalized exact matching, not fuzzy matching.",
        "- A title match does not prove the titles refer to the same release.",
        "- Google Trends interest is relative, not absolute search volume.",
        "- Reference-normalized values are exploratory proxies, not calibrated demand.",
        "- Current AniList scores/popularity are not pre-release features.",
        "- This merged file is not yet a trained predictive model.",
    ]

    REPORT_OUTPUT.write_text(
        "\n".join(report),
        encoding="utf-8",
    )

    print("\n===== MIRAI MERGE RESULTS =====")
    print(f"Trends observations: {total:,}")
    print(f"AniList matches: {matched:,}")
    print(f"Unmatched observations: {total - matched:,}")
    print(
        f"Match rate: {(matched / total * 100):.2f}%"
        if total else "Match rate: N/A"
    )
    print(f"\nMerged dataset: {MERGED_OUTPUT}")
    print(f"Report: {REPORT_OUTPUT}")

    print("\nSample merged records:")
    columns = [
        col for col in [
            "anime_title",
            "trend_interest",
            "reference_index",
            "display_title",
            "format",
            "genres",
            "start_year",
            "anilist_match",
        ]
        if col in merged.columns
    ]
    print(merged[columns].head(10).to_string(index=False))


if __name__ == "__main__":
    main()
