"""
Phase 0 Verification Test
=========================
Tests the full chain: seed → migrate → model mapping → API startup → business logic
"""
import os
import sys
import sqlite3
from pathlib import Path

# Run from server/ directory
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ".")

# Use test DB
TEST_DB = "data/test_verify.db"
os.environ["DATABASE_URL"] = f"sqlite:///./{TEST_DB}"

# Clean slate
if os.path.exists(TEST_DB):
    os.remove(TEST_DB)


def test_p0_1_seed():
    """P0-1/P0-3: seed_data creates DB with correct schema including withdraw_reason."""
    from scripts.seed_data import seed
    seed(TEST_DB)

    conn = sqlite3.connect(TEST_DB)
    # Verify all tables exist
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    for t in ["users", "requests", "teams", "organizations", "team_org_mapping", "download_logs"]:
        assert t in tables, f"Missing table: {t}"

    # Verify withdraw_reason column exists
    req_cols = {r[1] for r in conn.execute("PRAGMA table_info(requests)")}
    assert "withdraw_reason" in req_cols, "Missing withdraw_reason in requests"

    # Verify password_version column exists
    user_cols = {r[1] for r in conn.execute("PRAGMA table_info(users)")}
    assert "password_version" in user_cols, "Missing password_version in users"

    # Verify data
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 5
    assert conn.execute("SELECT COUNT(*) FROM requests").fetchone()[0] >= 5
    assert conn.execute("SELECT COUNT(*) FROM teams").fetchone()[0] == 2
    assert conn.execute("SELECT COUNT(*) FROM organizations").fetchone()[0] == 5

    # Verify withdrawn test data
    row = conn.execute("SELECT status, withdraw_reason FROM requests WHERE title='退回测试需求'").fetchone()
    assert row[0] == "withdrawn", f"Expected withdrawn, got {row[0]}"
    assert row[1] is not None, "withdraw_reason should be set"

    # Verify attachments exist on disk
    att_rows = conn.execute("SELECT id, attachment_path FROM requests WHERE attachment_path IS NOT NULL").fetchall()
    assert len(att_rows) == 2, f"Expected 2 requests with attachments, got {len(att_rows)}"
    for rid, att_path in att_rows:
        full = Path("data") / att_path
        assert full.exists(), f"Attachment file missing: {full}"
        assert full.stat().st_size > 0, f"Attachment file empty: {full}"

    # Verify download logs
    dl_count = conn.execute("SELECT COUNT(*) FROM download_logs").fetchone()[0]
    assert dl_count == 5, f"Expected 5 download logs, got {dl_count}"

    conn.close()
    print("✅ P0-1/P0-3: seed_data — tables, columns, data, attachments, download_logs all correct")


def test_p0_5_migrate():
    """P0-5: migrate_v3 is idempotent and creates indexes."""
    from scripts.migrate_v3 import migrate
    # Run twice to verify idempotence
    migrate(TEST_DB)
    migrate(TEST_DB)

    conn = sqlite3.connect(TEST_DB)
    indexes = {r[1] for r in conn.execute("SELECT * FROM sqlite_master WHERE type='index'") if r[1]}
    expected = {"idx_req_status", "idx_req_sales", "idx_req_researcher", "idx_dl_request", "idx_dl_user"}
    for idx in expected:
        assert idx in indexes, f"Missing index: {idx}"
    conn.close()
    print("✅ P0-5: migrate_v3 — idempotent, indexes created")


def test_p0_2_model_query():
    """P0-2/P0-3: SQLAlchemy models can query seeded data."""
    # Force reimport with test DB
    from importlib import reload
    import app.core.config
    reload(app.core.config)
    import app.core.database
    reload(app.core.database)

    from app.core.database import SessionLocal
    from app.models import User, Request, Team, Organization, TeamOrgMapping, DownloadLog

    db = SessionLocal()

    users = db.query(User).all()
    assert len(users) == 5, f"Expected 5 users, got {len(users)}"
    admin = db.query(User).filter(User.username == "admin").first()
    assert admin.role == "admin"
    assert admin.password_version == 1  # SHA256 legacy

    requests = db.query(Request).all()
    assert len(requests) >= 5

    # Verify withdraw_reason is accessible via ORM
    withdrawn = db.query(Request).filter(Request.status == "withdrawn").first()
    assert withdrawn is not None, "Should have a withdrawn request"
    assert withdrawn.withdraw_reason is not None

    teams = db.query(Team).all()
    assert len(teams) == 2

    orgs = db.query(Organization).all()
    assert len(orgs) == 5

    mappings = db.query(TeamOrgMapping).all()
    assert len(mappings) == 6  # 3 for team1 + 3 for team2

    db.close()
    print("✅ P0-2/P0-3: Model query — all 6 models work, withdraw_reason accessible")


def test_p0_1_api_startup():
    """P0-1: FastAPI app starts and /docs is accessible."""
    from fastapi.testclient import TestClient
    from app.main import app

    c = TestClient(app)
    # Root endpoint
    r = c.get("/")
    assert r.status_code == 200
    data = r.json()
    assert data["data"]["service"] == "OpenSpec API"

    # OpenAPI schema loads
    r = c.get("/openapi.json")
    assert r.status_code == 200
    schema = r.json()
    assert "/api/v1/auth/login" in str(schema)
    assert "/api/v1/requests/{request_id}/withdraw" in str(schema)
    assert "/api/v1/requests/{request_id}/resubmit" in str(schema)

    print("✅ P0-1: API startup — root OK, OpenAPI schema contains all endpoints")


def test_login_and_auth():
    """P1 quick check: login with SHA256 password works."""
    from fastapi.testclient import TestClient
    from app.main import app

    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"username": "admin", "password": "123456"})
    assert r.status_code == 200
    body = r.json()
    assert body["code"] == 0
    assert body["data"]["user"]["role"] == "admin"
    token = body["data"]["access_token"]

    # Authenticated request
    headers = {"Authorization": f"Bearer {token}"}
    r = c.get("/api/v1/users/researchers", headers=headers)
    assert r.status_code == 200
    assert r.json()["code"] == 0

    print("✅ Auth: login + JWT authenticated request works")


def test_withdraw_flow():
    """Business logic: withdraw writes reason + keeps researcher_id."""
    from app.core.database import SessionLocal
    from app.models import User, Request
    from app.services.request_service import withdraw_request

    db = SessionLocal()

    # Find a pending request assigned to researcher1 (id=4)
    req = db.query(Request).filter(Request.status == "pending", Request.researcher_id == 4).first()
    assert req, "Need a pending request for researcher1"
    req_id = req.id
    researcher = db.get(User, 4)

    withdraw_request(db, req_id, researcher, "客户要求变更了，请重新确认")

    req = db.get(Request, req_id)
    assert req.status == "withdrawn", f"Expected withdrawn, got {req.status}"
    assert req.researcher_id == 4, "researcher_id should be preserved"
    assert req.withdraw_reason == "客户要求变更了，请重新确认"

    db.close()
    print("✅ Withdraw: status=withdrawn, researcher_id preserved, reason written")


def test_resubmit_flow():
    """Business logic: resubmit clears reason, sets pending."""
    from app.core.database import SessionLocal
    from app.models import User, Request
    from app.services.request_service import resubmit_request

    db = SessionLocal()

    req = db.query(Request).filter(Request.status == "withdrawn").first()
    assert req, "Need a withdrawn request"
    req_id = req.id
    sales = db.get(User, req.sales_id)

    resubmit_request(db, req_id, sales, {"title": "修改后的标题", "researcher_id": 5})

    req = db.get(Request, req_id)
    assert req.status == "pending"
    assert req.withdraw_reason is None
    assert req.title == "修改后的标题"
    assert req.researcher_id == 5

    db.close()
    print("✅ Resubmit: status=pending, reason cleared, fields updated")


def test_cancel_from_withdrawn():
    """Business logic: cancel allows withdrawn status (not just pending)."""
    from app.core.database import SessionLocal
    from app.models import User, Request
    from app.services.request_service import withdraw_request, cancel_request

    db = SessionLocal()

    # Get a pending request, withdraw it, then cancel
    req = db.query(Request).filter(Request.status == "pending", Request.researcher_id == 4).first()
    if not req:
        # Create a fresh one
        req = Request(
            title="取消测试", request_type="基金筛选", org_name="招商银行",
            sales_id=2, researcher_id=4, created_by=2, status="pending",
        )
        db.add(req)
        db.commit()
        db.refresh(req)

    req_id = req.id
    researcher = db.get(User, 4)
    sales = db.get(User, req.sales_id)

    # Withdraw first
    withdraw_request(db, req_id, researcher, "不做了")
    req = db.get(Request, req_id)
    assert req.status == "withdrawn"

    # Cancel from withdrawn
    cancel_request(db, req_id, sales)
    req = db.get(Request, req_id)
    assert req.status == "canceled", f"Expected canceled, got {req.status}"

    db.close()
    print("✅ Cancel: withdrawn → canceled works")


def test_withdraw_api_endpoint():
    """API layer: POST /withdraw requires reason body."""
    from fastapi.testclient import TestClient
    from app.main import app

    c = TestClient(app)
    # Login as researcher1
    r = c.post("/api/v1/auth/login", json={"username": "researcher1", "password": "123456"})
    token = r.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Try withdraw without reason → should fail (422 validation)
    r = c.post("/api/v1/requests/999/withdraw", headers=headers, json={})
    assert r.status_code == 422, f"Missing reason should be validation error, got {r.status_code}"

    # Try withdraw with reason (invalid request_id → 400)
    r = c.post("/api/v1/requests/999/withdraw", headers=headers, json={"reason": "test"})
    assert r.status_code == 400

    print("✅ API: withdraw endpoint validates reason body correctly")


if __name__ == "__main__":
    print("=" * 60)
    print("Phase 0 Verification")
    print("=" * 60)

    test_p0_1_seed()
    test_p0_5_migrate()
    test_p0_2_model_query()
    test_p0_1_api_startup()
    test_login_and_auth()
    test_withdraw_flow()
    test_resubmit_flow()
    test_cancel_from_withdrawn()
    test_withdraw_api_endpoint()

    # Cleanup
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)
    for f in [TEST_DB + "-wal", TEST_DB + "-shm"]:
        if os.path.exists(f):
            os.remove(f)

    print("\n" + "=" * 60)
    print("🎉 Phase 0 ALL PASSED — 9/9 tests")
    print("=" * 60)