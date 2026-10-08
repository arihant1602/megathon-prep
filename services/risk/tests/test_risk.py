from fastapi.testclient import TestClient


def test_models_score_and_direction(tmp_path, monkeypatch):
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    monkeypatch.setenv("INTERNAL_API_KEY", "")
    from risk_service import main

    main.settings.cache_clear()
    main.registry.root = tmp_path
    with TestClient(main.app) as c:
        assert {m["name"] for m in c.get("/models").json()} >= {"fraud", "churn"}
        risky = c.post("/score", json={"model": "fraud", "features": {"is_foreign": 1, "account_age_days": 10, "hour": 3}}).json()
        safe = c.post("/score", json={"model": "fraud", "features": {"is_foreign": 0, "account_age_days": 2500, "hour": 14}}).json()
        assert risky["score"] > safe["score"]
        churny = c.post("/score", json={"model": "churn", "features": {"tenure_months": 2, "price_increase_pct": 25, "has_autopay": 0}}).json()
        loyal = c.post("/score", json={"model": "churn", "features": {"tenure_months": 100, "price_increase_pct": 0, "has_autopay": 1}}).json()
        assert churny["score"] > loyal["score"]
        assert c.post("/score", json={"model": "nope", "features": {}}).status_code == 404
