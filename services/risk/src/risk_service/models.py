"""Model registry: XGBoost classifiers with exact TreeSHAP contributions (no shap/torch dependency).

Two demo models ship out of the box so the UI works before any real data arrives:
  fraud  - card-transaction fraud (Lloyds-style)
  churn  - customer churn / retention (Vanguard / insurance-style)
Replace them by POSTing a CSV to /train.
"""

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split

FEATURE_LABELS = {
    "amount": "Transaction amount",
    "hour": "Hour of day",
    "account_age_days": "Account age (days)",
    "txns_last_24h": "Transactions in last 24h",
    "distance_from_home_km": "Distance from home (km)",
    "is_foreign": "Foreign merchant",
    "tenure_months": "Tenure (months)",
    "monthly_premium": "Monthly premium",
    "claims_last_year": "Claims last year",
    "support_tickets_90d": "Support tickets (90d)",
    "price_increase_pct": "Price increase at renewal (%)",
    "has_autopay": "On autopay",
}


class Registry:
    def __init__(self, root: str) -> None:
        self.root = Path(root)
        self.models: dict[str, tuple[xgb.Booster, dict]] = {}

    def load(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        for d in sorted(self.root.iterdir()):
            if (d / "model.json").exists():
                b = xgb.Booster()
                b.load_model(d / "model.json")
                self.models[d.name] = (b, json.loads((d / "meta.json").read_text()))
        if "fraud" not in self.models:
            self.train(demo_fraud(), "is_fraud", "fraud", "Card fraud", "Probability this transaction is fraudulent")
        if "churn" not in self.models:
            self.train(demo_churn(), "churned", "churn", "Customer churn", "Probability this customer leaves at renewal")

    def list(self) -> list[dict]:
        return [self.public_meta(name) for name in self.models]

    def public_meta(self, name: str) -> dict:
        meta = self.models[name][1]
        return {
            "name": name,
            "title": meta["title"],
            "description": meta["description"],
            "target": meta["target"],
            "metrics": meta["metrics"],
            "features": [
                {"name": f, "label": FEATURE_LABELS.get(f, f.replace("_", " ").capitalize()), "example": meta["examples"][f]}
                for f in meta["features"]
            ],
        }

    def train(self, df: pd.DataFrame, target: str, name: str, title: str | None = None, description: str = "") -> dict:
        if not re.fullmatch(r"[a-z0-9_-]{1,40}", name):
            raise ValueError("model name must match [a-z0-9_-]{1,40}")
        y = df[target].astype(int).to_numpy()
        X = df.drop(columns=[target]).select_dtypes(include="number")
        if X.shape[1] == 0:
            raise ValueError("no numeric feature columns")
        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        clf = xgb.XGBClassifier(
            n_estimators=250, max_depth=4, learning_rate=0.08, subsample=0.9, colsample_bytree=0.9,
            # Fraud and churn are usually rare classes.
            scale_pos_weight=max(1.0, (y_tr == 0).sum() / max(1, (y_tr == 1).sum())),
            eval_metric="auc",
        )
        clf.fit(X_tr, y_tr)
        proba = clf.predict_proba(X_te)[:, 1]
        metrics = {
            "auc": round(float(roc_auc_score(y_te, proba)), 4),
            "f1": round(float(f1_score(y_te, proba > 0.5)), 4),
            "accuracy": round(float(accuracy_score(y_te, proba > 0.5)), 4),
            "positive_rate": round(float(y.mean()), 4),
            "n_rows": int(len(df)),
        }
        meta = {
            "title": title or name.replace("_", " ").capitalize(),
            "description": description,
            "target": target,
            "features": list(X.columns),
            "examples": {c: round(float(X[c].median()), 2) for c in X.columns},
            "metrics": metrics,
        }
        d = self.root / name
        d.mkdir(parents=True, exist_ok=True)
        booster = clf.get_booster()
        booster.save_model(d / "model.json")
        (d / "meta.json").write_text(json.dumps(meta, indent=2))
        self.models[name] = (booster, meta)
        return self.public_meta(name)

    def score(self, name: str, features: dict[str, float]) -> dict:
        booster, meta = self.models[name]
        cols = meta["features"]
        row = np.array([[float(features.get(c, meta["examples"][c])) for c in cols]])
        dm = xgb.DMatrix(row, feature_names=cols)
        score = float(booster.predict(dm)[0])
        # Exact TreeSHAP in log-odds space; the last column is the bias term.
        raw = booster.predict(dm, pred_contribs=True)[0]
        contributions = sorted(
            (
                {
                    "feature": c,
                    "label": FEATURE_LABELS.get(c, c),
                    "value": float(row[0][i]),
                    "contribution": round(float(raw[i]), 4),
                }
                for i, c in enumerate(cols)
            ),
            key=lambda d: abs(d["contribution"]),
            reverse=True,
        )
        band = "high" if score >= 0.7 else "medium" if score >= 0.35 else "low"
        return {"model": name, "score": round(score, 4), "band": band, "base_value": round(float(raw[-1]), 4), "contributions": contributions}


def demo_fraud(n: int = 6000, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    df = pd.DataFrame(
        {
            "amount": rng.lognormal(7, 1.2, n).round(2),
            "hour": rng.integers(0, 24, n),
            "account_age_days": rng.integers(1, 3000, n),
            "txns_last_24h": rng.poisson(2, n),
            "distance_from_home_km": rng.exponential(20, n).round(1),
            "is_foreign": rng.binomial(1, 0.08, n),
        }
    )
    logit = (
        -2.0 + 0.00012 * df.amount + 1.2 * ((df.hour < 5) | (df.hour > 22)) - 0.0012 * df.account_age_days
        + 0.35 * df.txns_last_24h + 0.012 * df.distance_from_home_km + 1.8 * df.is_foreign
    )
    df["is_fraud"] = rng.binomial(1, 1 / (1 + np.exp(-logit)))
    return df


def demo_churn(n: int = 6000, seed: int = 11) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    df = pd.DataFrame(
        {
            "tenure_months": rng.integers(1, 120, n),
            "monthly_premium": rng.normal(85, 25, n).clip(20).round(2),
            "claims_last_year": rng.poisson(0.4, n),
            "support_tickets_90d": rng.poisson(0.8, n),
            "price_increase_pct": rng.normal(6, 5, n).clip(-5, 30).round(1),
            "has_autopay": rng.binomial(1, 0.55, n),
        }
    )
    logit = (
        -0.8 - 0.025 * df.tenure_months + 0.01 * (df.monthly_premium - 85) + 0.35 * df.claims_last_year
        + 0.45 * df.support_tickets_90d + 0.11 * df.price_increase_pct - 0.9 * df.has_autopay
    )
    df["churned"] = rng.binomial(1, 1 / (1 + np.exp(-logit)))
    return df
