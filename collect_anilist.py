
import time
from pathlib import Path

import pandas as pd
import requests

BASE = Path(__file__).resolve().parent
OUTPUT_DIR = BASE / "processed"
OUTPUT_DIR.mkdir(exist_ok=True)
OUTPUT_FILE = OUTPUT_DIR / "anilist_anime.csv"

API_URL = "https://graphql.anilist.co"
PER_PAGE = 50
MAX_PAGES = 100

QUERY = """
query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
        pageInfo {
            hasNextPage
        }
        media(type: ANIME, sort: ID_DESC) {
            id
            idMal
            title {
                romaji
                english
                native
            }
            format
            status
            description(asHtml: false)
            startDate {
                year
                month
                day
            }
            season
            seasonYear
            episodes
            duration
            countryOfOrigin
            source
            genres
            tags {
                name
            }
            averageScore
            meanScore
            popularity
            favourites
            studios {
                nodes {
                    name
                }
            }
            isAdult
            siteUrl
        }
    }
}
"""


def convert_anime(anime):
    title = anime.get("title") or {}
    start_date = anime.get("startDate") or {}
    studios = anime.get("studios") or {}

    return {
        "anilist_id": anime.get("id"),
        "mal_id": anime.get("idMal"),
        "title_romaji": title.get("romaji"),
        "title_english": title.get("english"),
        "title_native": title.get("native"),
        "format": anime.get("format"),
        "status": anime.get("status"),
        "description": anime.get("description"),
        "start_year": start_date.get("year"),
        "start_month": start_date.get("month"),
        "start_day": start_date.get("day"),
        "season": anime.get("season"),
        "season_year": anime.get("seasonYear"),
        "episodes": anime.get("episodes"),
        "duration": anime.get("duration"),
        "country_of_origin": anime.get("countryOfOrigin"),
        "source": anime.get("source"),
        "genres": "|".join(anime.get("genres") or []),
        "tags": "|".join(
            tag["name"]
            for tag in (anime.get("tags") or [])
            if tag.get("name")
        ),
        "average_score": anime.get("averageScore"),
        "mean_score": anime.get("meanScore"),
        "popularity": anime.get("popularity"),
        "favourites": anime.get("favourites"),
        "studios": "|".join(
            studio["name"]
            for studio in (studios.get("nodes") or [])
            if studio.get("name")
        ),
        "is_adult": anime.get("isAdult"),
        "site_url": anime.get("siteUrl"),
    }


def main():
    if OUTPUT_FILE.exists():
        existing = pd.read_csv(OUTPUT_FILE)
        print(f"Existing records: {len(existing)}")

        if "anilist_id" not in existing.columns:
            raise RuntimeError(
                "Existing CSV has no anilist_id column. "
                "The original file has been left untouched."
            )
    else:
        existing = pd.DataFrame()

    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "MIRAI-Anime-Market-Research/1.0",
    })

    new_records = []
    seen_ids = set()

    if not existing.empty:
        seen_ids = set(
            pd.to_numeric(
                existing["anilist_id"], errors="coerce"
            ).dropna().astype(int)
        )

    try:
        for page in range(1, MAX_PAGES + 1):
            payload = {
                "query": QUERY,
                "variables": {
                    "page": page,
                    "perPage": PER_PAGE,
                },
            }

            data = None

            for attempt in range(5):
                try:
                    response = session.post(
                        API_URL,
                        json=payload,
                        timeout=45,
                    )

                    if response.status_code == 429:
                        wait = 30 * (attempt + 1)
                        print(
                            f"Rate limited. Waiting {wait} seconds..."
                        )
                        time.sleep(wait)
                        continue

                    if not response.ok:
                        print(
                            "AniList API response:",
                            response.text,
                        )
                        response.raise_for_status()

                    result = response.json()

                    if result.get("errors"):
                        raise RuntimeError(
                            f"AniList GraphQL error: "
                            f"{result['errors']}"
                        )

                    data = result["data"]["Page"]
                    break

                except Exception as exc:
                    if attempt == 4:
                        raise RuntimeError(
                            f"Page {page} failed after 5 attempts: "
                            f"{exc}"
                        ) from exc

                    wait = 3 * (attempt + 1)
                    print(
                        f"Page {page}, attempt {attempt + 1} "
                        f"failed: {exc}. Retrying in {wait}s..."
                    )
                    time.sleep(wait)

            if data is None:
                break

            page_records = []

            for anime in data["media"]:
                record = convert_anime(anime)
                anime_id = record["anilist_id"]

                if anime_id is not None and anime_id not in seen_ids:
                    page_records.append(record)
                    seen_ids.add(anime_id)

            new_records.extend(page_records)

            # Save after every page so progress is retained.
            if page_records:
                combined = pd.concat(
                    [
                        existing,
                        pd.DataFrame(new_records),
                    ],
                    ignore_index=True,
                    sort=False,
                )

                combined = combined.drop_duplicates(
                    subset=["anilist_id"],
                    keep="first",
                )

                combined.to_csv(
                    OUTPUT_FILE,
                    index=False,
                    encoding="utf-8-sig",
                )

            print(
                f"Page {page}/{MAX_PAGES}: "
                f"{len(page_records)} new records; "
                f"{len(seen_ids)} unique IDs seen"
            )

            if not data["pageInfo"]["hasNextPage"]:
                break

            # Stay conservative with API request frequency.
            time.sleep(2.2)

    finally:
        session.close()

    # Final merge, retaining existing records and adding new ones.
    if not existing.empty or new_records:
        combined = pd.concat(
            [existing, pd.DataFrame(new_records)],
            ignore_index=True,
            sort=False,
        )

        combined = combined.drop_duplicates(
            subset=["anilist_id"],
            keep="first",
        )

        combined.to_csv(
            OUTPUT_FILE,
            index=False,
            encoding="utf-8-sig",
        )

    final_count = (
        len(pd.read_csv(OUTPUT_FILE))
        if OUTPUT_FILE.exists()
        else 0
    )

    print("\nCollection finished.")
    print(f"Total unique records saved: {final_count}")
    print(f"Output: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
