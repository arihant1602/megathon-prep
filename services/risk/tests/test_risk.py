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


def test_extras(tmp_path, monkeypatch):
    monkeypatch.setenv("INTERNAL_API_KEY", "")
    from risk_service import main

    main.settings.cache_clear()
    main.registry.root = tmp_path
    main.registry.models.clear()
    with TestClient(main.app) as c:
        cf = c.post("/counterfactual", json={"model": "fraud", "features": {"is_foreign": 1, "account_age_days": 10, "hour": 3, "amount": 40000}}).json()
        assert cf["changes"] and cf["end_score"] < cf["start_score"]
        fair = c.get("/fairness", params={"model": "churn", "group_feature": "has_autopay"}).json()
        assert len(fair["groups"]) == 2 and fair["disparate_impact"] is not None
        csv = c.get("/synthesize", params={"model": "churn", "n": 50}).text
        assert csv.count("\n") == 51
        sim = c.post("/simulate", json={"years": 10, "paths": 500}).json()
        assert len(sim["years"]) == 11 and sim["years"][-1]["p90"] >= sim["years"][-1]["p10"]
