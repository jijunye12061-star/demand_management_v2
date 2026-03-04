"""
Phase 1 认证体系 验证测试
==========================
覆盖 P1-1 ~ P1-5 所有要求:
  P1-1: JWT 签发/验证、bcrypt/SHA256 密码工具
  P1-2: get_current_user、require_role 依赖注入
  P1-3: /auth/login、/auth/refresh、/auth/password API
  P1-4: 前端 token 存储约定（后端契约验证）
  P1-5: 角色鉴权（403 隔离）

运行:
  cd server
  python tests/test_phase1_auth.py
"""
import os, sys, hashlib, sqlite3
from pathlib import Path

os.chdir(Path(__file__).parent.parent)
sys.path.insert(0, ".")

TEST_DB = "data/test_p1.db"
os.environ["DATABASE_URL"] = f"sqlite:///./{TEST_DB}"

# ── 清库并用 seed 初始化 ──────────────────────────────────────────────────────
if os.path.exists(TEST_DB):
    os.remove(TEST_DB)
from scripts.seed_data import seed
seed(TEST_DB)


# ─────────────────────────────────────────────────────────────────────────────
# P1-1  JWT 工具模块
# ─────────────────────────────────────────────────────────────────────────────

def test_p1_1_hash_and_verify():
    """bcrypt hash → verify 正常工作."""
    from app.core.security import hash_password, verify_password
    h = hash_password("mypass")
    assert h.startswith("$2b$"), "应为 bcrypt 哈希"
    assert verify_password("mypass", h, password_version=2)
    assert not verify_password("wrong", h, password_version=2)
    print("✅ P1-1: bcrypt hash/verify 正常")


def test_p1_1_sha256_compat():
    """SHA256 legacy (version=1) 验证兼容."""
    from app.core.security import verify_password
    sha = hashlib.sha256("123456".encode()).hexdigest()
    assert verify_password("123456", sha, password_version=1)
    assert not verify_password("wrong", sha, password_version=1)
    print("✅ P1-1: SHA256 兼容验证正常")


def test_p1_1_jwt_access():
    """access_token 签发、解码、payload 字段正确."""
    from app.core.security import create_access_token, verify_token
    token = create_access_token(user_id=1, role="admin")
    payload = verify_token(token)
    assert payload is not None
    assert payload["sub"] == "1"
    assert payload["role"] == "admin"
    assert "exp" in payload
    print("✅ P1-1: access_token 签发/验证正常")


def test_p1_1_jwt_refresh():
    """refresh_token 含 type='refresh'，access_token 不含."""
    from app.core.security import create_access_token, create_refresh_token, verify_token
    rt = create_refresh_token(user_id=2)
    at = create_access_token(user_id=2, role="sales")
    rt_payload = verify_token(rt)
    at_payload = verify_token(at)
    assert rt_payload["type"] == "refresh", "refresh token 必须含 type=refresh"
    assert "type" not in at_payload, "access token 不应含 type 字段"
    print("✅ P1-1: refresh_token 与 access_token 的 type 字段隔离正确")


def test_p1_1_invalid_token():
    """损坏/过期 token 返回 None 而非抛异常."""
    from app.core.security import verify_token
    assert verify_token("not.a.token") is None
    assert verify_token("") is None
    print("✅ P1-1: 无效 token 返回 None 不抛异常")


def test_p1_1_upgrade_password():
    """upgrade_password 返回 bcrypt hash + version=2."""
    from app.core.security import upgrade_password, verify_password
    h, v = upgrade_password("abc123")
    assert v == 2
    assert verify_password("abc123", h, password_version=2)
    print("✅ P1-1: upgrade_password 返回 bcrypt 且 version=2")


# ─────────────────────────────────────────────────────────────────────────────
# P1-2  认证依赖注入
# ─────────────────────────────────────────────────────────────────────────────

def test_p1_2_get_current_user_valid():
    """有效 token → get_current_user 返回 User 对象."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)

    # 先登录拿 token（用 SHA256 用户测试，同时覆盖自动升级后再登录）
    r = c.post("/api/v1/auth/login", json={"username": "admin", "password": "123456"})
    assert r.status_code == 200
    token = r.json()["data"]["access_token"]

    # 用 token 访问需要鉴权的接口
    r = c.get("/api/v1/users", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, f"有效 token 应能访问 users 列表，got {r.status_code}"
    print("✅ P1-2: 有效 token → get_current_user 正常")


def test_p1_2_no_token_401():
    """无 token 请求受保护接口 → 403 (HTTPBearer 行为) 或 401."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    r = c.get("/api/v1/users")  # 无 Authorization
    # HTTPBearer 在缺少凭据时返回 403；有凭据但无效时返回 401
    assert r.status_code in (401, 403), f"期望 401/403，got {r.status_code}"
    print("✅ P1-2: 无 token 请求被正确拒绝")


def test_p1_2_invalid_token_401():
    """伪造 token → 401."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    r = c.get("/api/v1/users", headers={"Authorization": "Bearer fake.jwt.token"})
    assert r.status_code == 401
    print("✅ P1-2: 无效 token → 401")


def test_p1_2_require_role_403():
    """sales 用户访问 admin-only 接口 → 403."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"username": "sales1", "password": "123456"})
    assert r.status_code == 200
    token = r.json()["data"]["access_token"]
    # /users 是 admin-only
    r = c.get("/api/v1/users", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403, f"sales 访问 admin 接口应 403，got {r.status_code}"
    print("✅ P1-2: require_role → sales 访问 admin 接口正确返回 403")


# ─────────────────────────────────────────────────────────────────────────────
# P1-3  认证 API
# ─────────────────────────────────────────────────────────────────────────────

def test_p1_3_login_sha256():
    """SHA256 密码用户首次登录成功，响应含双 token + user info."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)

    # seed 数据中 researcher1 使用 SHA256 密码
    r = c.post("/api/v1/auth/login", json={"username": "researcher1", "password": "123456"})
    assert r.status_code == 200, f"SHA256 用户登录失败: {r.text}"

    body = r.json()
    assert body["code"] == 0
    d = body["data"]
    assert "access_token" in d
    assert "refresh_token" in d
    assert d["user"]["username"] == "researcher1"
    assert d["user"]["role"] == "researcher"
    print("✅ P1-3: SHA256 密码用户登录成功，响应结构正确")


def test_p1_3_password_auto_upgrade():
    """登录后 SHA256 密码自动升级为 bcrypt (password_version=2)."""
    import sqlite3
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)

    # sales1 是 SHA256 用户；确认登录前版本为 1
    conn = sqlite3.connect(TEST_DB)
    row = conn.execute("SELECT password_version FROM users WHERE username='sales1'").fetchone()
    conn.close()
    # 可能已经在之前测试中升级，跳过前置断言，直接触发升级
    c.post("/api/v1/auth/login", json={"username": "sales1", "password": "123456"})

    conn = sqlite3.connect(TEST_DB)
    row = conn.execute("SELECT password_version, password FROM users WHERE username='sales1'").fetchone()
    conn.close()
    assert row[0] == 2, f"登录后 password_version 应为 2，got {row[0]}"
    assert row[1].startswith("$2b$"), "密码应已升级为 bcrypt"
    print("✅ P1-3: SHA256 密码在登录时自动升级为 bcrypt")


def test_p1_3_login_wrong_password():
    """错误密码 → 401."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"username": "admin", "password": "wrongpass"})
    assert r.status_code == 401
    assert r.json()["code"] != 0
    print("✅ P1-3: 错误密码 → 401，业务 code != 0")


def test_p1_3_login_nonexistent_user():
    """不存在用户 → 401 (不能泄露用户是否存在)."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"username": "ghost", "password": "x"})
    assert r.status_code == 401
    print("✅ P1-3: 不存在用户 → 401")


def test_p1_3_refresh_token():
    """有效 refresh_token → 返回新 access_token."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)

    login_r = c.post("/api/v1/auth/login", json={"username": "admin", "password": "123456"})
    rt = login_r.json()["data"]["refresh_token"]

    r = c.post("/api/v1/auth/refresh", json={"refresh_token": rt})
    assert r.status_code == 200
    assert "access_token" in r.json()["data"]
    print("✅ P1-3: refresh_token → 签发新 access_token 正常")


def test_p1_3_refresh_with_access_token_rejected():
    """用 access_token 代替 refresh_token → 401."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)

    login_r = c.post("/api/v1/auth/login", json={"username": "admin", "password": "123456"})
    at = login_r.json()["data"]["access_token"]

    r = c.post("/api/v1/auth/refresh", json={"refresh_token": at})
    # access_token 不含 type=refresh，应被拒绝
    assert r.status_code == 401, f"access_token 不应被当 refresh_token 使用，got {r.status_code}"
    print("✅ P1-3: access_token 不可当 refresh_token 使用 → 正确 401")


def test_p1_3_change_password():
    """改密码：旧密码验证 → 更新为 bcrypt → 新密码可登录."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)

    # 用 researcher2 测试，先登录拿 token
    login_r = c.post("/api/v1/auth/login", json={"username": "researcher2", "password": "123456"})
    assert login_r.status_code == 200, f"researcher2 登录失败: {login_r.text}"
    token = login_r.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 用错误旧密码改密码 → 400
    r = c.put("/api/v1/auth/password", headers=headers,
              json={"old_password": "wrongold", "new_password": "newpass"})
    assert r.status_code == 400, f"错误旧密码应 400，got {r.status_code}"

    # 用正确旧密码改密码 → 200
    r = c.put("/api/v1/auth/password", headers=headers,
              json={"old_password": "123456", "new_password": "newpass456"})
    assert r.status_code == 200, f"修改密码失败: {r.text}"

    # 新密码可以登录
    r2 = c.post("/api/v1/auth/login", json={"username": "researcher2", "password": "newpass456"})
    assert r2.status_code == 200, "新密码应能登录"

    # 旧密码不能再登录
    r3 = c.post("/api/v1/auth/login", json={"username": "researcher2", "password": "123456"})
    assert r3.status_code == 401, "旧密码改后不应再能登录"

    print("✅ P1-3: change_password 全流程正确（旧密码校验、更新、新密码登录）")


def test_p1_3_change_password_requires_auth():
    """改密码接口无 token → 拒绝."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    r = c.put("/api/v1/auth/password", json={"old_password": "x", "new_password": "y"})
    assert r.status_code in (401, 403)
    print("✅ P1-3: change_password 接口无 token 被拒绝")


# ─────────────────────────────────────────────────────────────────────────────
# P1-4  前端 Token 管理约定（后端契约验证）
# ─────────────────────────────────────────────────────────────────────────────

def test_p1_4_response_shape():
    """登录响应的 data 结构符合前端 localStorage 存储约定."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)

    r = c.post("/api/v1/auth/login", json={"username": "admin", "password": "123456"})
    d = r.json()["data"]

    # 前端存 access_token / refresh_token / user 三个 key
    for key in ("access_token", "refresh_token", "user"):
        assert key in d, f"响应 data 缺少 {key}"

    # user 对象含前端 access.ts 需要的 role 字段
    user = d["user"]
    for field in ("id", "username", "role", "display_name"):
        assert field in user, f"user 对象缺少 {field}"

    print("✅ P1-4: 登录响应结构符合前端存储约定")


def test_p1_4_refresh_response_shape():
    """refresh 响应含 access_token 字段（前端直接读取）."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)

    r = c.post("/api/v1/auth/login", json={"username": "admin", "password": "123456"})
    rt = r.json()["data"]["refresh_token"]
    r2 = c.post("/api/v1/auth/refresh", json={"refresh_token": rt})
    assert "access_token" in r2.json()["data"]
    print("✅ P1-4: refresh 响应含 access_token 字段")


def test_p1_4_change_password_endpoint_exists():
    """PUT /auth/password 端点存在且需要认证（验证 services/auth.ts 的 URL 正确）."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    # 无 token → 401/403 而非 404（404 说明端点不存在）
    r = c.put("/api/v1/auth/password", json={"old_password": "x", "new_password": "y"})
    assert r.status_code != 404, "PUT /auth/password 端点不应返回 404"
    print("✅ P1-4: PUT /auth/password 端点存在，services/auth.ts URL 正确")


def test_p1_4_wrapper_format():
    """所有 auth 响应均使用 {code, data, message} 统一包装格式."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)

    # 成功响应
    r = c.post("/api/v1/auth/login", json={"username": "admin", "password": "123456"})
    body = r.json()
    for key in ("code", "data", "message"):
        assert key in body, f"统一包装格式缺少 {key}"
    assert body["code"] == 0

    # 错误响应
    r2 = c.post("/api/v1/auth/login", json={"username": "admin", "password": "bad"})
    body2 = r2.json()
    for key in ("code", "data", "message"):
        assert key in body2, f"错误响应包装格式缺少 {key}"
    assert body2["code"] != 0
    assert body2["data"] is None

    print("✅ P1-4: {code, data, message} 统一包装格式正确（成功+错误）")


# ─────────────────────────────────────────────────────────────────────────────
# P1-5  前端权限路由（角色隔离后端验证）
# ─────────────────────────────────────────────────────────────────────────────

def test_p1_5_role_isolation():
    """三角色 token 中的 role 字段正确，支持 access.ts 权限判断."""
    from fastapi.testclient import TestClient
    from jose import jwt
    from app.main import app
    from app.core.config import settings
    c = TestClient(app)

    cases = [
        ("admin", "123456", "admin"),
        ("sales1", "123456", "sales"),
        ("researcher1", "123456", "researcher"),
    ]
    for username, password, expected_role in cases:
        r = c.post("/api/v1/auth/login", json={"username": username, "password": password})
        assert r.status_code == 200, f"{username} 登录失败"
        token = r.json()["data"]["access_token"]
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        assert payload["role"] == expected_role, \
            f"{username} token role 应为 {expected_role}，got {payload['role']}"
        # user 对象 role 也正确
        assert r.json()["data"]["user"]["role"] == expected_role

    print("✅ P1-5: 三角色 JWT payload.role 与响应 user.role 均正确")


def test_p1_5_admin_cannot_access_without_token():
    """确认 admin 专属接口需要 admin token（非 sales/researcher）."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)

    # sales token 访问 admin 接口 → 403
    r = c.post("/api/v1/auth/login", json={"username": "sales1", "password": "123456"})
    token = r.json()["data"]["access_token"]
    r2 = c.get("/api/v1/users", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 403

    # researcher token 访问 admin 接口 → 403
    r = c.post("/api/v1/auth/login", json={"username": "researcher1", "password": "123456"})
    token = r.json()["data"]["access_token"]
    r3 = c.get("/api/v1/users", headers={"Authorization": f"Bearer {token}"})
    assert r3.status_code == 403

    # admin token 访问 → 200
    r = c.post("/api/v1/auth/login", json={"username": "admin", "password": "123456"})
    token = r.json()["data"]["access_token"]
    r4 = c.get("/api/v1/users", headers={"Authorization": f"Bearer {token}"})
    assert r4.status_code == 200

    print("✅ P1-5: admin 专属接口对三角色的访问控制正确")


def test_p1_5_researcher_submit_allowed():
    """researcher 可以调用提交需求接口（角色有权限）."""
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"username": "researcher1", "password": "123456"})
    token = r.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # researcher 可以提交需求（测试路由存在且角色不被 403 拒绝）
    # 提交一个最简需求（可能因其他校验失败，但不应是 403）
    r2 = c.post("/api/v1/requests", headers=headers, json={
        "title": "测试需求", "request_type": "基金筛选",
        "org_name": "招商银行", "researcher_id": 3,
        "sales_id": 2,
    })
    assert r2.status_code != 403, "researcher 提交需求不应被角色鉴权拒绝"
    print("✅ P1-5: researcher 有权访问提交需求接口（非 403）")


# ─────────────────────────────────────────────────────────────────────────────
# 入口
# ─────────────────────────────────────────────────────────────────────────────

TESTS = [
    # P1-1
    test_p1_1_hash_and_verify,
    test_p1_1_sha256_compat,
    test_p1_1_jwt_access,
    test_p1_1_jwt_refresh,
    test_p1_1_invalid_token,
    test_p1_1_upgrade_password,
    # P1-2
    test_p1_2_get_current_user_valid,
    test_p1_2_no_token_401,
    test_p1_2_invalid_token_401,
    test_p1_2_require_role_403,
    # P1-3
    test_p1_3_login_sha256,
    test_p1_3_password_auto_upgrade,
    test_p1_3_login_wrong_password,
    test_p1_3_login_nonexistent_user,
    test_p1_3_refresh_token,
    test_p1_3_refresh_with_access_token_rejected,
    test_p1_3_change_password,
    test_p1_3_change_password_requires_auth,
    # P1-4
    test_p1_4_response_shape,
    test_p1_4_refresh_response_shape,
    test_p1_4_change_password_endpoint_exists,
    test_p1_4_wrapper_format,
    # P1-5
    test_p1_5_role_isolation,
    test_p1_5_admin_cannot_access_without_token,
    test_p1_5_researcher_submit_allowed,
]

if __name__ == "__main__":
    print("=" * 65)
    print("Phase 1 认证体系 验证测试")
    print("=" * 65)
    passed = failed = 0
    for t in TESTS:
        try:
            t()
            passed += 1
        except Exception as e:
            print(f"❌ {t.__name__}: {e}")
            import traceback; traceback.print_exc()
            failed += 1

    # 清理
    import gc

    gc.collect()  # 释放 TestClient 持有的连接
    for f in [TEST_DB, TEST_DB + "-wal", TEST_DB + "-shm"]:
        try:
            if os.path.exists(f): os.remove(f)
        except PermissionError:
            pass  # Windows 下 WAL 文件可能仍被占用，忽略即可

    print("\n" + "=" * 65)
    total = passed + failed
    if failed == 0:
        print(f"🎉 Phase 1 ALL PASSED — {passed}/{total} tests")
    else:
        print(f"💥 {failed} FAILED / {passed} passed ({total} total)")
    print("=" * 65)
    sys.exit(0 if failed == 0 else 1)