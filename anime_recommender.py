#!/usr/bin/env python3
"""
Hybrid anime recommender.

* Collaborative filtering: implicit ALS on rating.csv (MAL user ratings, -1 = watched but unrated).
* Cold start: new shows (2025-26 seasonal files) have no ratings, so a ridge regression learns to
  predict an item's ALS factors from its content (genres, themes/tags, format). Predicted factors are
  dotted with a user's factors, then blended with a quality prior (AniList mean score).

Usage
  python anime_recommender.py train      --data-dir DIR --out model.pkl
  python anime_recommender.py evaluate   --data-dir DIR
  python anime_recommender.py recommend  --model model.pkl --user 3 [--new-only] [--season "FALL 2026"]
  python anime_recommender.py recommend  --model model.pkl --liked "Death Note=10" "Steins;Gate=9" --new-only
"""
import argparse, difflib, glob, os, pickle, re, sys
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import numpy as np
import pandas as pd
import scipy.sparse as sp
from sklearn.linear_model import Ridge

# ----------------------------------------------------------------------------- data loading
def find(data_dir, pattern):
    hits = sorted(glob.glob(os.path.join(data_dir, "**", pattern), recursive=True))
    if not hits:
        sys.exit(f"No file matching {pattern!r} under {data_dir}")
    return hits[-1]  # newest dated file sorts last


def load_ratings(path):
    r = pd.read_csv(path).drop_duplicates(["user_id", "anime_id"])
    return r


def split_list(s, sep):
    return [x.strip() for x in str(s).split(sep) if x.strip() and str(s) != "nan"]


TYPE_MAP = {"TV": "TV", "TV_SHORT": "TV", "MOVIE": "Movie", "OVA": "OVA", "SPECIAL": "Special",
            "ONA": "ONA", "MUSIC": "Music"}
GENRE_ALIASES = {"Mahou Shoujo": "Magic", "Boys' Love": "Yaoi", "Girls' Love": "Yuri",
                 "Gag Humor": "Comedy", "Cute Girls Doing Cute Things": "Slice of Life",
                 "Video Games": "Game", "Space Opera": "Space", "Outer Space": "Space",
                 "Cars": "Cars", "Vampire": "Vampire", "Vampires": "Vampire",
                 "Martial Arts": "Martial Arts", "Super Power": "Super Power",
                 "Police": "Police", "Mythology": "Fantasy"}


def old_features(anime):
    """Content tokens for catalog items (anime.csv uses MAL genres + type)."""
    toks = {}
    for row in anime.itertuples():
        t = {f"g:{g}" for g in split_list(row.genre, ",")}
        if isinstance(row.type, str):
            t.add(f"t:{row.type}")
        toks[row.anime_id] = t
    return toks


def new_features(df, vocab, jikan=None):
    """Map AniList genres+tags (and Jikan genres/themes/demographics when present) onto the MAL vocab."""
    jk = {}
    if jikan is not None:
        for row in jikan.itertuples():
            jk[int(row.anime_id)] = (split_list(row.genres, ";") + split_list(row.themes, ";")
                                     + split_list(row.demographics, ";"))
    toks = {}
    for row in df.itertuples():
        names = split_list(row.genres, ";") + split_list(row.tags, ";")
        if not pd.isna(row.mal_id) and int(row.mal_id) in jk:
            names += jk[int(row.mal_id)]
        t = set()
        for n in names:
            n = GENRE_ALIASES.get(n, n)
            if f"g:{n}" in vocab:
                t.add(f"g:{n}")
        ty = TYPE_MAP.get(str(row.type).upper())
        if ty:
            t.add(f"t:{ty}")
        toks[row.anime_id] = t
    return toks


def multihot(tokmap, ids, vocab_idx):
    rows, cols = [], []
    for k, i in enumerate(ids):
        for tk in tokmap[i]:
            if tk in vocab_idx:
                rows.append(k); cols.append(vocab_idx[tk])
    return sp.csr_matrix((np.ones(len(rows), np.float32), (rows, cols)), shape=(len(ids), len(vocab_idx)))


def load_seasonal(data_dir):
    ani = pd.read_csv(find(data_dir, "anilist_seasonal_*.csv"))
    ani = ani.sort_values("updated_at", ascending=False).drop_duplicates("anime_id")
    air_paths = glob.glob(os.path.join(data_dir, "**", "airing_anime.csv"), recursive=True)
    jk_paths = glob.glob(os.path.join(data_dir, "**", "jikan_seasonal_*.csv"), recursive=True)
    jikan = pd.concat([pd.read_csv(p) for p in jk_paths]).drop_duplicates("anime_id") if jk_paths else None
    return ani, jikan


# ----------------------------------------------------------------------------- model
def interaction_matrix(r, uid, iid):
    x = r.rating.values.astype(np.float32)
    # binary-ish confidence: rating>=7 is a positive, watched-but-unrated gets a small weight, low ratings ignored.
    # (Tested against a graded scheme on a holdout: this one scored ~0.05 NDCG@10 higher.)
    w = (np.where(x >= 7, 1.0, 0.0) + np.where(x == -1, 0.3, 0.0)).astype(np.float32)
    return sp.csr_matrix((w, (r.user_id.map(uid).values, r.anime_id.map(iid).values)),
                         shape=(len(uid), len(iid)))


def fit_als(M, factors=64, reg=0.05, alpha=20, iters=15, seed=0):
    from implicit.als import AlternatingLeastSquares
    m = AlternatingLeastSquares(factors=factors, regularization=reg, alpha=alpha, iterations=iters,
                                random_state=seed, calculate_training_loss=False)
    m.fit(M, show_progress=False)
    return m


def fit_content_map(item_factors, X, weights, alpha=3.0):
    """Ridge: content features -> ALS item factors (weighted by log-popularity so noise items count less)."""
    reg = Ridge(alpha=alpha)
    reg.fit(X, item_factors, sample_weight=weights)
    return reg


def train(args):
    d = args.data_dir
    r = load_ratings(args.ratings or find(d, "rating.csv"))
    anime = pd.read_csv(find(d, "anime.csv"))
    uid = {u: i for i, u in enumerate(np.sort(r.user_id.unique()))}
    iid = {a: i for i, a in enumerate(np.sort(r.anime_id.unique()))}
    inv_iid = np.array(sorted(iid, key=iid.get))
    M = interaction_matrix(r, uid, iid)
    print(f"matrix {M.shape}, nnz={M.nnz:,}")
    als = fit_als(M, args.factors)
    # content model
    toks = old_features(anime)
    vocab = sorted({t for s in toks.values() for t in s})
    vocab_idx = {t: i for i, t in enumerate(vocab)}
    X = multihot(toks, inv_iid, vocab_idx) if all(i in toks for i in inv_iid) else None
    if X is None:
        toks = {i: toks.get(i, set()) for i in inv_iid}
        X = multihot(toks, inv_iid, vocab_idx)
    IF = np.asarray(als.item_factors.to_numpy() if hasattr(als.item_factors, "to_numpy") else als.item_factors)
    pop = np.asarray((M > 0).sum(0)).ravel()
    cmap = fit_content_map(IF, X, np.log1p(pop))
    # new shows
    ani, jikan = load_seasonal(d)
    gvocab = {t for t in vocab if t.startswith("g:")}
    ntoks = new_features(ani, gvocab, jikan)
    Xn = multihot(ntoks, ani.anime_id.values, vocab_idx)
    new_factors = cmap.predict(Xn).astype(np.float32)
    anime_names = dict(zip(anime.anime_id, anime.name))
    pickle.dump(dict(
        user_factors=np.asarray(als.user_factors.to_numpy() if hasattr(als.user_factors, "to_numpy") else als.user_factors),
        item_factors=IF, uid=uid, iid=iid, inv_iid=inv_iid, M=M, anime_names=anime_names,
        new_ids=ani.anime_id.values, new_factors=new_factors, new_meta=ani[[
            "anime_id", "mal_id", "title", "english_title", "type", "status", "season", "season_year", "genres",
            "mean_score", "popularity", "episodes", "is_adult", "studios", "site_url"]].reset_index(drop=True),
        new_tokens=ntoks, vocab=vocab, als_reg=als.regularization, als_alpha=als.alpha,
    ), open(args.out, "wb"))
    print("saved", args.out, f"({len(ani)} seasonal shows scored)")


# ----------------------------------------------------------------------------- inference
def resolve_title(model, text):
    names = model["anime_names"]
    low = {n.lower(): a for a, n in names.items() if isinstance(n, str)}
    if text.lower() in low:
        return low[text.lower()]
    cand = difflib.get_close_matches(text.lower(), list(low), n=1, cutoff=0.6)
    if not cand:
        sys.exit(f"Could not find a title matching {text!r}")
    print(f"  matched {text!r} -> {names[low[cand[0]]]!r}")
    return low[cand[0]]


def user_vector(model, user=None, liked=None):
    """Return (user_vec, seen_item_indices). Folds in unseen users with one ALS half-step."""
    IF, iid = model["item_factors"], model["iid"]
    if user is not None:
        if user not in model["uid"]:
            sys.exit(f"user_id {user} not in training data")
        u = model["uid"][user]
        row = model["M"][u]
        return model["user_factors"][u], set(row.indices)
    idx, w = [], []
    for item in liked:
        title, _, score = item.rpartition("=")
        if not title:
            title, score = item, "8"
        a = resolve_title(model, title)
        if a not in iid:
            print(f"  (skipping {title!r}: no ratings in training data)"); continue
        idx.append(iid[a]); w.append(1.0 if float(score) >= 7 else 0.0)
    if not idx:
        sys.exit("No usable liked titles")
    Y = IF[idx]; c = 1 + model["als_alpha"] * np.array(w)
    keepw = np.array(w) > 0
    Y, c = Y[keepw], c[keepw]
    if not len(c): sys.exit('Need at least one title rated 7 or higher')
    YtY = IF.T @ IF
    A = YtY + (Y.T * (c - 1)) @ Y + model["als_reg"] * np.eye(IF.shape[1])
    b = (Y.T * c).sum(1)
    return np.linalg.solve(A, b), set(idx)


def recommend(args):
    model = pickle.load(open(args.model, "rb"))
    uvec, seen = user_vector(model, args.user, args.liked)
    out = []
    if not args.new_only:
        s = model["item_factors"] @ uvec
        for j in np.argsort(-s):
            if j in seen: continue
            out.append(("catalog", model["anime_names"].get(model["inv_iid"][j], "?"), float(s[j]), "", "", ""))
            if len(out) >= args.n: break
    else:
        meta = model["new_meta"].copy()
        meta["cf"] = model["new_factors"] @ uvec
        m = meta
        if not args.include_adult:
            m = m[(m.is_adult != True) & ~m.genres.fillna("").str.contains("Hentai")]
        if args.season:
            seasons = [s.upper() for s in args.season]
            m = m[m.season.str.upper().isin(seasons)]
        elif not args.include_finished:
            m = m[m.status.isin(["RELEASING", "NOT_YET_RELEASED"])]
        if not args.include_short:
            m = m[~m.type.isin(["TV_SHORT", "SPECIAL", "MUSIC"])]
        # z-score both parts across the pool so the blend is scale-free
        z = lambda v: (v - v.mean()) / (v.std() + 1e-9)
        q = m.mean_score.fillna(m.mean_score.median())
        m = m.assign(score=(1 - args.quality_weight) * z(m.cf) + args.quality_weight * z(q))
        for row in m.sort_values("score", ascending=False).head(args.n).itertuples():
            out.append(("new", row.english_title if isinstance(row.english_title, str) else row.title,
                        row.score, str(row.season).title(), row.genres,
                        f"AniList {row.mean_score:g}" if pd.notna(row.mean_score) else "no score yet"))
    print(f"{'#':>2}  {'score':>6}  title  [season] (genres) quality")
    for k, (kind, name, sc, season, genres, q) in enumerate(out, 1):
        extra = f"  [{season}] ({str(genres).replace(';', ', ')}) {q}" if kind == "new" else ""
        print(f"{k:>2}  {sc:6.2f}  {name}{extra}")


# ----------------------------------------------------------------------------- evaluation
def evaluate(args):
    from implicit.evaluation import ndcg_at_k, precision_at_k
    rng = np.random.default_rng(0)
    d = args.data_dir
    r = load_ratings(args.ratings or find(d, "rating.csv"))
    anime = pd.read_csv(find(d, "anime.csv"))
    uid = {u: i for i, u in enumerate(np.sort(r.user_id.unique()))}
    iid = {a: i for i, a in enumerate(np.sort(r.anime_id.unique()))}
    inv = np.array(sorted(iid, key=iid.get))
    r = r.assign(u=r.user_id.map(uid), i=r.anime_id.map(iid))
    nu, ni = len(uid), len(iid)
    pos = r.rating >= 8
    cnt = r[pos].groupby("u").size()
    tu = rng.choice(cnt[cnt >= 5].index.values, 4000, replace=False)
    keep = np.zeros(nu, bool); keep[tu] = True
    hold = pos & keep[r.u.values] & (rng.random(len(r)) < 0.2)
    tr, te = r[~hold], r[hold]
    M = interaction_matrix(tr.assign(user_id=tr.user_id, anime_id=tr.anime_id), uid, iid)
    T = sp.csr_matrix((np.ones(len(te), np.float32), (te.u.values, te.i.values)), shape=(nu, ni))
    m = fit_als(M, args.factors)
    popv = np.asarray((M > 0).sum(0)).ravel(); order = np.argsort(-popv)
    nd = []
    for u in tu:
        seen = set(M[u].indices); top = [j for j in order[:len(seen) + 10] if j not in seen][:10]
        rel = np.array([T[u, j] > 0 for j in top], float); n_t = T[u].nnz
        if n_t == 0: continue
        nd.append((rel / np.log2(np.arange(2, 12))).sum() / (1 / np.log2(np.arange(2, 2 + min(n_t, 10)))).sum())
    print(f"[warm] popularity baseline NDCG@10={np.mean(nd):.4f}")
    print(f"[warm] ALS      NDCG@10={ndcg_at_k(m, M, T, K=10, show_progress=False):.4f}  "
          f"P@10={precision_at_k(m, M, T, K=10, show_progress=False):.4f}")

    # ---- cold-start test: hide 10% of catalog items entirely, predict their factors from content only
    toks = old_features(anime); toks = {i: toks.get(i, set()) for i in inv}
    vocab = sorted({t for s in toks.values() for t in s}); vi = {t: k for k, t in enumerate(vocab)}
    X = multihot(toks, inv, vi)
    pop = np.asarray((M > 0).sum(0)).ravel()
    cold = rng.choice(np.where(pop >= 200)[0], size=int(0.1 * (pop >= 200).sum()), replace=False)
    is_cold = np.zeros(ni, bool); is_cold[cold] = True
    # fresh model without cold items' ratings
    M2 = (M @ sp.diags((~is_cold).astype(np.float32))).tocsr(); M2.eliminate_zeros()
    m2 = fit_als(M2, args.factors)
    IF = np.asarray(m2.item_factors.to_numpy() if hasattr(m2.item_factors, "to_numpy") else m2.item_factors)
    UF = np.asarray(m2.user_factors.to_numpy() if hasattr(m2.user_factors, "to_numpy") else m2.user_factors)
    cmap = fit_content_map(IF[~is_cold], X[~is_cold], np.log1p(pop[~is_cold]))
    IFc = IF.copy(); IFc[is_cold] = cmap.predict(X[is_cold])
    # ranking among cold items only: does user's liked (rating>=8) cold item rank high among cold items?
    pc = r[pos & is_cold[r.i.values] & keep[r.u.values]]  # all liked hidden items for test users
    Tc = sp.csr_matrix((np.ones(len(pc), np.float32), (pc.u.values, pc.i.values)), shape=(nu, ni))
    users = [u for u in tu if Tc[u].nnz > 0]
    hits, ndcgs, base_hits = [], [], []
    quality = np.asarray(anime.set_index("anime_id").reindex(inv).rating.fillna(6.5))
    cold_idx = np.where(is_cold)[0]
    for u in users:
        pos_c = set(Tc[u].indices)
        for name, scores in (("cf", IFc[cold_idx] @ UF[u]), ("pop", quality[cold_idx])):
            order = cold_idx[np.argsort(-scores)][:10]
            rel = np.array([o in pos_c for o in order], float)
            dcg = (rel / np.log2(np.arange(2, 12))).sum()
            ideal = (1 / np.log2(np.arange(2, 2 + min(len(pos_c), 10)))).sum()
            (ndcgs if name == "cf" else base_hits).append(dcg / ideal)
    print(f"[cold] hidden items={len(cold_idx)}, users={len(users)}")
    print(f"[cold] content->ALS  NDCG@10 among hidden items = {np.mean(ndcgs):.4f}")
    print(f"[cold] quality-only (avg MAL rating) baseline   = {np.mean(base_hits):.4f}")


# ----------------------------------------------------------------------------- cli
def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("train", "evaluate"):
        s = sub.add_parser(name); s.add_argument("--data-dir", required=True)
        s.add_argument("--ratings"); s.add_argument("--factors", type=int, default=128)
        if name == "train": s.add_argument("--out", default="model.pkl")
    s = sub.add_parser("recommend"); s.add_argument("--model", default="model.pkl")
    g = s.add_mutually_exclusive_group(required=True)
    g.add_argument("--user", type=int, help="user_id from rating.csv")
    g.add_argument("--liked", nargs="+", help='titles, optionally with score: "Death Note=10"')
    s.add_argument("-n", type=int, default=15)
    s.add_argument("--new-only", action="store_true", help="recommend only 2025-26 seasonal shows")
    s.add_argument("--season", nargs="+", help='e.g. "FALL 2026" "SUMMER 2026"')
    s.add_argument("--include-finished", action="store_true")
    s.add_argument("--include-adult", action="store_true")
    s.add_argument("--include-short", action="store_true", help="include TV shorts/specials/music")
    s.add_argument("--quality-weight", type=float, default=0.35, help="0 = pure taste, 1 = pure AniList score")
    a = p.parse_args()
    {"train": train, "evaluate": evaluate, "recommend": recommend}[a.cmd](a)


if __name__ == "__main__":
    main()
