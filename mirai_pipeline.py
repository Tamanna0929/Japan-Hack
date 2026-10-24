"""
MIRAI integrated data pipeline
Run from the project root:
    .\.venv\Scripts\python.exe .\mirai_pipeline.py
Optional live collection:
    $env:YOUTUBE_API_KEY="YOUR_KEY"
    .\.venv\Scripts\python.exe .\mirai_pipeline.py --collect-youtube
    .\.venv\Scripts\python.exe .\mirai_pipeline.py --collect-trends

This pipeline:
- reuses existing MIRAI/AniList/Google Trends CSVs where present
- optionally collects YouTube trailer metadata (requires a YouTube Data API key)
- optionally collects Google Trends (pytrends can be rate-limited)
- creates editable templates for India streaming availability and market context
- outputs a merged title-level dataset, an exploratory score, and a report

Important:
- YouTube view counts are generally global, not India-specific.
- AniList popularity/favourites/ratings are post-release signals, not pre-release predictors.
- The score is an exploratory ranking, not a validated prediction model.
"""

from __future__ import annotations

import argparse
import os
import re
import time
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent
PROCESSED = ROOT / "processed"
PROCESSED.mkdir(exist_ok=True)

PRIMARY_DATASET = PROCESSED / "mirai_anime_dataset.csv"
SHORTLIST = PROCESSED / "anime_shortlist.csv"
ENRICHED = PROCESSED / "anime_enriched.csv"
ANILIST_FILE = PROCESSED / "anilist_anime.csv"
TRENDS_FILE = PROCESSED / "google_trends_india.csv"
YOUTUBE_FILE = PROCESSED / "youtube_anime_videos.csv"
STREAMING_FILE = PROCESSED / "streaming_availability_india.csv"
MARKET_CONTEXT_FILE = PROCESSED / "india_market_context.csv"

OUTPUT_DATASET = PROCESSED / "mirai_integrated_dataset.csv"
OUTPUT_SCORES = PROCESSED / "mirai_market_potential.csv"
OUTPUT_REPORT = PROCESSED / "mirai_pipeline_report.txt"

YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
ANILIST_URL = "https://graphql.anilist.co"


def read_csv_safe(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    try:
        return pd.read_csv(path, low_memory=False)
    except Exception as exc:
        print(f"[WARN] Could not read {path.name}: {exc}")
        return pd.DataFrame()


def norm_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    text = str(value).casefold().strip()
    text = re.sub(r"[\W_]+", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def first_existing_dataset() -> pd.DataFrame:
    for path in (PRIMARY_DATASET, ENRICHED, SHORTLIST):
        df = read_csv_safe(path)
        if not df.empty:
            print(f"[INFO] Base anime list: {path.relative_to(ROOT)} ({len(df):,} rows)")
            return df
    raise FileNotFoundError(
        "No base dataset found. Expected processed/mirai_anime_dataset.csv, "
        "processed/anime_enriched.csv, or processed/anime_shortlist.csv."
    )


def get_title_column(df: pd.DataFrame) -> str:
    for candidate in ("anime_title", "display_title", "title_english", "name", "title_romaji"):
        if candidate in df.columns and df[candidate].notna().any():
            return candidate
    raise ValueError(f"No recognizable title column in base dataset. Columns: {list(df.columns)}")


def make_anime_list(base: pd.DataFrame) -> pd.DataFrame:
    title_col = get_title_column(base)
    result = base.copy()
    result["anime_title"] = result[title_col].astype(str).str.strip()
    result = result[result["anime_title"].ne("") & result["anime_title"].ne("nan")].copy()

    # If the base is a time series, collapse it to one record per title for collection.
    preferred = [
        "anime_title", "title_english", "title_romaji", "title_native", "display_title",
        "anilist_id", "mal_id", "format", "genres", "tags", "start_year", "season",
        "season_year", "episodes", "duration_minutes", "source_material", "average_score",
        "mean_score", "popularity", "favourites", "studios", "country_of_origin", "url",
        "site_url", "anilist_match", "members", "score"
    ]
    for col in preferred:
        if col not in result.columns:
            result[col] = np.nan

    # Sort by available popularity/members, preserving first non-null metadata per title.
    sort_col = next((c for c in ("members", "popularity", "favourites") if c in result.columns and result[c].notna().any()), None)
    if sort_col:
        result = result.sort_values(sort_col, ascending=False, na_position="last")
    result = result.groupby(result["anime_title"].map(norm_text), as_index=False, sort=False).first()
    result["title_key"] = result["anime_title"].map(norm_text)
    return result


def collect_youtube(anime: pd.DataFrame, api_key: str, max_titles: int = 100) -> pd.DataFrame:
    records: list[dict[str, Any]] = []
    titles = anime["anime_title"].dropna().astype(str).drop_duplicates().head(max_titles).tolist()
    session = requests.Session()

    for index, title in enumerate(titles, start=1):
        params = {
            "part": "snippet",
            "q": f"{title} official trailer anime",
            "type": "video",
            "maxResults": 5,
            "key": api_key,
            "safeSearch": "moderate",
        }
        try:
            response = session.get(YOUTUBE_SEARCH_URL, params=params, timeout=25)
            response.raise_for_status()
            items = response.json().get("items", [])
            video_ids = [x.get("id", {}).get("videoId") for x in items if x.get("id", {}).get("videoId")]
            if not video_ids:
                print(f"[YT] {index}/{len(titles)}: no videos for {title}")
                continue

            stats_response = session.get(
                YOUTUBE_VIDEOS_URL,
                params={"part": "snippet,statistics,contentDetails", "id": ",".join(video_ids), "key": api_key},
                timeout=25,
            )
            stats_response.raise_for_status()
            by_id = {x["id"]: x for x in stats_response.json().get("items", [])}

            for item in items:
                video_id = item.get("id", {}).get("videoId")
                if not video_id or video_id not in by_id:
                    continue
                video = by_id[video_id]
                snippet = video.get("snippet", {})
                stats = video.get("statistics", {})
                records.append({
                    "anime_title": title,
                    "title_key": norm_text(title),
                    "video_id": video_id,
                    "video_title": snippet.get("title"),
                    "channel_title": snippet.get("channelTitle"),
                    "published_at": snippet.get("publishedAt"),
                    "view_count": pd.to_numeric(stats.get("viewCount"), errors="coerce"),
                    "like_count": pd.to_numeric(stats.get("likeCount"), errors="coerce"),
                    "comment_count": pd.to_numeric(stats.get("commentCount"), errors="coerce"),
                    "video_url": f"https://www.youtube.com/watch?v={video_id}",
                    "source": "YouTube Data API",
                })
            print(f"[YT] {index}/{len(titles)}: collected results for {title}")
            time.sleep(0.15)
        except Exception as exc:
            print(f"[WARN] YouTube collection failed for '{title}': {exc}")
            if "quota" in str(exc).casefold() or "403" in str(exc):
                print("[WARN] YouTube API may have hit quota/permission limits; stopping collection.")
                break

    return pd.DataFrame(records)


def collect_google_trends(anime: pd.DataFrame, max_titles: int = 40) -> pd.DataFrame:
    try:
        from pytrends.request import TrendReq
    except ImportError as exc:
        raise RuntimeError("pytrends is not installed. Run: .\\.venv\\Scripts\\python.exe -m pip install pytrends") from exc

    titles = anime["anime_title"].dropna().astype(str).drop_duplicates().head(max_titles).tolist()
    pytrends = TrendReq(hl="en-IN", tz=330, timeout=(10, 30))
    rows: list[pd.DataFrame] = []

    # Compare a maximum of four titles per request with the same reference term.
    for start in range(0, len(titles), 4):
        batch = titles[start:start + 4]
        keywords = batch + ["anime"]
        try:
            pytrends.build_payload(keywords, cat=0, timeframe="today 5-y", geo="IN", gprop="")
            trends = pytrends.interest_over_time()
            if trends.empty:
                print(f"[TRENDS] Empty batch {start // 4 + 1}; skipping.")
                continue
            trends = trends.drop(columns=["isPartial"], errors="ignore").reset_index()
            trends = trends.melt(id_vars=["date"], var_name="search_term", value_name="trend_interest")
            trends["batch"] = start // 4 + 1
            trends["is_reference"] = trends["search_term"].str.casefold().eq("anime")
            rows.append(trends)
            print(f"[TRENDS] Batch {start // 4 + 1}: {', '.join(batch)}")
        except Exception as exc:
            print(f"[WARN] Google Trends batch {start // 4 + 1} failed: {exc}")
        time.sleep(6)

    if not rows:
        return pd.DataFrame()
    return pd.concat(rows, ignore_index=True)


def create_templates() -> None:
    if not STREAMING_FILE.exists():
        pd.DataFrame(columns=[
            "anime_title", "platform", "available_in_india", "hindi_dub",
            "tamil_dub", "telugu_dub", "other_languages", "checked_date", "source_url"
        ]).to_csv(STREAMING_FILE, index=False)
        print(f"[TEMPLATE] Created {STREAMING_FILE.relative_to(ROOT)}")
    if not MARKET_CONTEXT_FILE.exists():
        pd.DataFrame([
            {
                "metric": "Indian anime audience estimate",
                "value": np.nan,
                "unit": "as reported",
                "year": np.nan,
                "geography": "India",
                "source_name": "Enter source/report name",
                "source_url": "Enter exact report URL",
                "notes": "Do not treat this as title-level ground truth."
            },
            {
                "metric": "Indian digital video audience",
                "value": np.nan,
                "unit": "as reported",
                "year": np.nan,
                "geography": "India",
                "source_name": "Enter source/report name",
                "source_url": "Enter exact report URL",
                "notes": "Record the report's definition and sample."
            }
        ]).to_csv(MARKET_CONTEXT_FILE, index=False)
        print(f"[TEMPLATE] Created {MARKET_CONTEXT_FILE.relative_to(ROOT)}")


def latest_per_title(df: pd.DataFrame, title_col: str = "anime_title") -> pd.DataFrame:
    if df.empty or title_col not in df.columns:
        return pd.DataFrame()
    data = df.copy()
    data["title_key"] = data[title_col].map(norm_text)
    data = data[data["title_key"].ne("")]
    if "date" in data.columns:
        data["date"] = pd.to_datetime(data["date"], errors="coerce")
        data = data.sort_values("date")
    return data.groupby("title_key", as_index=False).last()


def build_trend_features(trends: pd.DataFrame) -> pd.DataFrame:
    if trends.empty or not {"search_term", "trend_interest"}.issubset(trends.columns):
        return pd.DataFrame(columns=["title_key", "trend_mean", "trend_recent_mean", "trend_nonzero_pct", "trend_momentum", "trend_observations"])
    data = trends.copy()
    data["title_key"] = data["search_term"].map(norm_text)
    data["trend_interest"] = pd.to_numeric(data["trend_interest"], errors="coerce")
    if "is_reference" in data.columns:
        data = data[~data["is_reference"].fillna(False).astype(bool)]
    output = []
    for key, group in data.groupby("title_key"):
        series = group.sort_values("date")["trend_interest"].dropna() if "date" in group.columns else group["trend_interest"].dropna()
        recent = series.tail(13)
        prior = series.iloc[-26:-13]
        recent_mean = float(recent.mean()) if len(recent) else np.nan
        prior_mean = float(prior.mean()) if len(prior) else np.nan
        output.append({
            "title_key": key,
            "trend_mean": float(series.mean()) if len(series) else np.nan,
            "trend_recent_mean": recent_mean,
            "trend_nonzero_pct": float((series > 0).mean() * 100) if len(series) else np.nan,
            "trend_momentum": (recent_mean - prior_mean) if pd.notna(recent_mean) and pd.notna(prior_mean) else np.nan,
            "trend_observations": int(series.notna().sum()),
        })
    return pd.DataFrame(output)


def aggregate_youtube(youtube: pd.DataFrame) -> pd.DataFrame:
    cols = ["title_key", "youtube_video_count", "youtube_views_sum", "youtube_views_max", "youtube_likes_sum", "youtube_latest_publish"]
    if youtube.empty or "title_key" not in youtube.columns:
        return pd.DataFrame(columns=cols)
    data = youtube.copy()
    for col in ("view_count", "like_count", "comment_count"):
        if col in data:
            data[col] = pd.to_numeric(data[col], errors="coerce")
        else:
            data[col] = np.nan
    data["published_at"] = pd.to_datetime(data.get("published_at"), errors="coerce", utc=True)
    return data.groupby("title_key", as_index=False).agg(
        youtube_video_count=("video_id", "nunique"),
        youtube_views_sum=("view_count", "sum"),
        youtube_views_max=("view_count", "max"),
        youtube_likes_sum=("like_count", "sum"),
        youtube_latest_publish=("published_at", "max"),
    )


def merge_sources(anime: pd.DataFrame, trends: pd.DataFrame, youtube: pd.DataFrame,
                  streaming: pd.DataFrame, context: pd.DataFrame) -> pd.DataFrame:
    result = anime.copy()
    result = result.merge(build_trend_features(trends), on="title_key", how="left")
    result = result.merge(aggregate_youtube(youtube), on="title_key", how="left")

    if not streaming.empty and "anime_title" in streaming.columns:
        stream = streaming.copy()
        stream["title_key"] = stream["anime_title"].map(norm_text)
        # One row per title; multiple platforms are retained as a readable joined field.
        aggregations = {}
        for col in ("platform", "available_in_india", "hindi_dub", "tamil_dub", "telugu_dub", "other_languages", "source_url"):
            if col in stream.columns:
                aggregations[col] = lambda s: " | ".join(sorted(set(s.dropna().astype(str))))
        if aggregations:
            stream = stream.groupby("title_key", as_index=False).agg(aggregations)
            stream = stream.rename(columns={c: f"streaming_{c}" for c in aggregations})
            result = result.merge(stream, on="title_key", how="left")

    if not context.empty:
        # Market context is report-level, not title-level. Include it in the report rather than
        # duplicating market-wide values into every anime row.
        pass
    return result


def percentile_score(series: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    if numeric.notna().sum() == 0:
        return pd.Series(np.nan, index=series.index)
    return numeric.rank(pct=True, method="average") * 100


def make_scores(merged: pd.DataFrame) -> pd.DataFrame:
    result = merged.copy()
    # Prefer actual search-demand metrics; missing/zero signals remain explicitly visible.
    for col in ("trend_mean", "trend_recent_mean", "trend_nonzero_pct", "youtube_views_sum",
                "youtube_likes_sum", "popularity", "favourites", "average_score", "mean_score"):
        if col not in result:
            result[col] = np.nan
        result[col] = pd.to_numeric(result[col], errors="coerce")

    result["search_score"] = percentile_score(result["trend_mean"].fillna(0))
    result["momentum_score"] = percentile_score(result["trend_momentum"].fillna(0))
    result["youtube_engagement_score"] = percentile_score(np.log1p(result["youtube_views_sum"].clip(lower=0).fillna(0)))
    result["metadata_popularity_score"] = percentile_score(np.log1p(result["popularity"].clip(lower=0).fillna(0)))
    result["rating_score"] = percentile_score(result["average_score"].fillna(result["mean_score"]))

    # Weighted exploratory score. YouTube is global engagement, not India-specific demand.
    result["market_potential_score"] = (
        0.40 * result["search_score"].fillna(0)
        + 0.15 * result["momentum_score"].fillna(0)
        + 0.20 * result["youtube_engagement_score"].fillna(0)
        + 0.15 * result["metadata_popularity_score"].fillna(0)
        + 0.10 * result["rating_score"].fillna(0)
    ).round(2)

    if "trend_nonzero_pct" in result:
        result["search_signal_status"] = np.select(
            [
                result["trend_observations"].fillna(0).eq(0) if "trend_observations" in result else pd.Series(True, index=result.index),
                result["trend_nonzero_pct"].fillna(0).eq(0),
                result["trend_nonzero_pct"].fillna(0).lt(10),
            ],
            ["No trend data", "All observed values are zero", "Sparse search signal"],
            default="Search signal present",
        )
    else:
        result["search_signal_status"] = "No trend data"

    # Explicit warning to prevent a post-release score being misrepresented as a pre-release forecast.
    result["interpretation"] = "Exploratory relative score; not a validated forecast"
    return result.sort_values("market_potential_score", ascending=False, na_position="last")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the integrated MIRAI dataset and exploratory score.")
    parser.add_argument("--collect-youtube", action="store_true", help="Collect YouTube data; requires YOUTUBE_API_KEY environment variable.")
    parser.add_argument("--collect-trends", action="store_true", help="Collect Google Trends data; may be rate-limited.")
    parser.add_argument("--max-titles", type=int, default=40, help="Maximum number of titles to collect per live source.")
    args = parser.parse_args()

    create_templates()
    base = first_existing_dataset()
    anime = make_anime_list(base)
    print(f"[INFO] Unique anime titles: {len(anime):,}")

    # Merge any available AniList metadata by title key, without replacing already populated values.
    anilist = read_csv_safe(ANILIST_FILE)
    if not anilist.empty:
        title_col = next((c for c in ("title_english", "title_romaji", "name", "anime_title") if c in anilist.columns), None)
        if title_col:
            ani = anilist.copy()
            ani["title_key"] = ani[title_col].map(norm_text)
            ani = ani[ani["title_key"].ne("")].drop_duplicates("title_key", keep="first")
            meta_cols = [c for c in ("format", "genres", "tags", "start_year", "season", "season_year", "episodes",
                                     "duration_minutes", "source_material", "average_score", "mean_score",
                                     "popularity", "favourites", "studios", "country_of_origin", "url", "site_url",
                                     "anilist_id", "mal_id") if c in ani.columns]
            if meta_cols:
                anime = anime.merge(ani[["title_key"] + meta_cols], on="title_key", how="left", suffixes=("", "_anilist"))
                for col in meta_cols:
                    alt = f"{col}_anilist"
                    if alt in anime.columns:
                        if col in anime.columns:
                            anime[col] = anime[col].where(anime[col].notna(), anime[alt])
                        else:
                            anime[col] = anime[alt]
                        anime.drop(columns=[alt], inplace=True)

    trends = read_csv_safe(TRENDS_FILE)
    if args.collect_trends:
        new_trends = collect_google_trends(anime, max_titles=args.max_titles)
        if not new_trends.empty:
            # Save a separate raw collection to preserve the original Trends file.
            new_path = PROCESSED / "google_trends_india_new.csv"
            new_trends.to_csv(new_path, index=False)
            trends = pd.concat([trends, new_trends], ignore_index=True) if not trends.empty else new_trends
            print(f"[SAVED] {new_path.relative_to(ROOT)}")

    youtube = read_csv_safe(YOUTUBE_FILE)
    if args.collect_youtube:
        api_key = os.getenv("YOUTUBE_API_KEY", "").strip()
        if not api_key:
            raise EnvironmentError(
                "YOUTUBE_API_KEY is missing. In PowerShell run:\n"
                '$env:YOUTUBE_API_KEY="YOUR_GOOGLE_CLOUD_API_KEY"\n'
                "Then rerun with --collect-youtube."
            )
        new_youtube = collect_youtube(anime, api_key, max_titles=args.max_titles)
        if not new_youtube.empty:
            new_youtube.to_csv(YOUTUBE_FILE, index=False)
            youtube = new_youtube
            print(f"[SAVED] {YOUTUBE_FILE.relative_to(ROOT)}")
        else:
            print("[WARN] No YouTube rows collected; existing file, if any, was preserved.")

    # Normalize source titles and combine existing + newly collected Trends.
    if not trends.empty:
        if "search_term" in trends.columns:
            trends["search_term"] = trends["search_term"].astype(str)
        if "date" in trends.columns:
            trends["date"] = pd.to_datetime(trends["date"], errors="coerce")
        if "trend_interest" in trends.columns:
            trends["trend_interest"] = pd.to_numeric(trends["trend_interest"], errors="coerce")
        trends = trends.drop_duplicates(subset=[c for c in ("date", "search_term", "batch") if c in trends.columns])

    if not youtube.empty:
        if "anime_title" in youtube.columns:
            youtube["title_key"] = youtube["anime_title"].map(norm_text)
        elif "title_key" not in youtube.columns:
            youtube["title_key"] = ""

    streaming = read_csv_safe(STREAMING_FILE)
    context = read_csv_safe(MARKET_CONTEXT_FILE)

    merged = merge_sources(anime, trends, youtube, streaming, context)
    scores = make_scores(merged)

    scores.to_csv(OUTPUT_DATASET, index=False)
    scores.to_csv(OUTPUT_SCORES, index=False)

    lines = [
        "MIRAI INTEGRATED PIPELINE REPORT",
        "=" * 34,
        f"Unique anime titles: {len(anime):,}",
        f"Trend source rows: {len(trends):,}",
        f"YouTube video rows: {len(youtube):,}",
        f"Streaming availability rows: {len(streaming):,}",
        f"Market context rows: {len(context):,}",
        "",
        "Top 10 by exploratory relative score:",
    ]
    title_col = "anime_title" if "anime_title" in scores.columns else scores.columns[0]
    for _, row in scores.head(10).iterrows():
        lines.append(
            f"- {row.get(title_col, 'Unknown')}: {row.get('market_potential_score', np.nan)} "
            f"(search signal: {row.get('search_signal_status', 'unknown')})"
        )
    lines += [
        "",
        "LIMITATIONS",
        "- This is an exploratory weighted ranking, not a trained or validated prediction model.",
        "- YouTube statistics are typically global and may not represent Indian demand.",
        "- AniList popularity, favourites, and ratings are post-release signals; do not use them as pre-release features.",
        "- Google Trends is relative, sampled/normalized search interest; zero does not prove no audience.",
        "- Market-context research is report-level and does not create title-level ground truth.",
        "- Streaming availability template must be filled from verified official sources.",
        "",
        f"Integrated dataset: {OUTPUT_DATASET.relative_to(ROOT)}",
        f"Score file: {OUTPUT_SCORES.relative_to(ROOT)}",
    ]
    OUTPUT_REPORT.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))
    print(f"\n[DONE] Saved {OUTPUT_DATASET.relative_to(ROOT)}")
    print(f"[DONE] Saved {OUTPUT_SCORES.relative_to(ROOT)}")
    print(f"[DONE] Saved {OUTPUT_REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
