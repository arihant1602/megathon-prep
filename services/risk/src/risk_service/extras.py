"""Finance extras: live transaction stream, Monte Carlo portfolio simulator."""

import asyncio
import json

import numpy as np

CITIES = [
    ("Mumbai", 19.076, 72.877), ("Delhi", 28.704, 77.102), ("Bengaluru", 12.972, 77.594), ("Hyderabad", 17.385, 78.487),
    ("Chennai", 13.083, 80.271), ("Kolkata", 22.573, 88.364), ("Pune", 18.520, 73.857), ("Ahmedabad", 23.023, 72.571),
    ("Jaipur", 26.912, 75.787), ("Lucknow", 26.847, 80.947), ("Kochi", 9.931, 76.267), ("Guwahati", 26.144, 91.736),
    ("Bhopal", 23.259, 77.413), ("Patna", 25.594, 85.137), ("Visakhapatnam", 17.687, 83.218),
]
MERCHANTS = ["Grocery", "Fuel", "Electronics", "Travel", "Jewellery", "Pharmacy", "Online marketplace", "Restaurant", "Crypto exchange"]


async def transaction_stream(registry, rate_per_sec: float = 2.0):
    """Synthetic card transactions, scored live. About 1 in 10 is generated to look suspicious."""
    rng = np.random.default_rng()
    i = 0
    while True:
        i += 1
        city, lat, lon = CITIES[rng.integers(len(CITIES))]
        odd = rng.random() < 0.1
        feats = {
            "amount": float(round(rng.lognormal(10.5 if odd else 7, 1.0), 2)),
            "hour": int(rng.choice([1, 2, 3, 4]) if odd else rng.integers(8, 23)),
            "account_age_days": int(rng.integers(1, 60) if odd else rng.integers(200, 3000)),
            "txns_last_24h": int(rng.poisson(9 if odd else 2)),
            "distance_from_home_km": float(round(rng.exponential(300 if odd else 10), 1)),
            "is_foreign": int(rng.random() < (0.6 if odd else 0.04)),
        }
        res = registry.score("fraud", feats)
        yield {
            "id": f"TXN-{i:06d}",
            "city": city,
            "lat": lat + float(rng.normal(0, 0.08)),
            "lon": lon + float(rng.normal(0, 0.08)),
            "merchant": MERCHANTS[rng.integers(len(MERCHANTS))],
            "features": feats,
            "score": res["score"],
            "band": res["band"],
            "top_reason": res["contributions"][0]["label"],
        }
        await asyncio.sleep(1 / rate_per_sec)


def sse(gen):
    async def events():
        async for item in gen:
            yield f"data: {json.dumps(item)}\n\n"

    return events()


ASSETS = {  # long-run annual return and volatility assumptions (editable in the request)
    "equity": (0.12, 0.18),
    "debt": (0.07, 0.04),
    "gold": (0.08, 0.14),
}


def simulate(initial: float, monthly: float, years: int, weights: dict[str, float], goal: float | None,
             inflation: float = 0.05, paths: int = 3000, assumptions: dict | None = None, seed: int | None = None) -> dict:
    a = {**ASSETS, **(assumptions or {})}
    w = np.array([weights.get(k, 0.0) for k in a])
    if w.sum() <= 0:
        raise ValueError("weights must sum to more than 0")
    w = w / w.sum()
    mu = np.array([a[k][0] for k in a]) / 12
    sd = np.array([a[k][1] for k in a]) / np.sqrt(12)
    rng = np.random.default_rng(seed)
    months = years * 12
    # Monthly asset returns (independent assets: a simple, explainable model), rebalanced monthly.
    r = rng.normal(mu, sd, size=(paths, months, len(a))) @ w
    value = np.full(paths, float(initial))
    yearly = [np.percentile(value, [10, 50, 90])]
    for m in range(months):
        value = value * (1 + r[:, m]) + monthly
        if (m + 1) % 12 == 0:
            yearly.append(np.percentile(value, [10, 50, 90]))
    invested = initial + monthly * months
    real = value / (1 + inflation) ** years
    return {
        "years": [{"year": y, "p10": round(float(p[0])), "p50": round(float(p[1])), "p90": round(float(p[2]))} for y, p in enumerate(yearly)],
        "invested": round(invested),
        "median_final": round(float(np.median(value))),
        "median_final_real": round(float(np.median(real))),
        "prob_goal": round(float((value >= goal).mean()), 4) if goal else None,
        "prob_loss": round(float((value < invested).mean()), 4),
        "weights": {k: round(float(x), 3) for k, x in zip(a, w)},
        "assumptions": {k: {"return": v[0], "volatility": v[1]} for k, v in a.items()},
    }
