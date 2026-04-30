"""
Auth 서비스: 회원가입, 로그인, 토큰 갱신, 로그아웃 비즈니스 로직
게스트 로그인 없음 — 로그인/비로그인 이분 구조
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException

from module.node.memory.postgres_manager import PostgresManager
from module.node.memory.redis_manager import RedisManager
from .jwt_utils import (
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
)
from .password_utils import hash_password, verify_password

TTL_MEMBER = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7")) * 24 * 3600  # 7일


async def signup(postgres: PostgresManager, data: dict) -> dict:
    """
    자체 계정(MEM) 회원가입.
    data: { email, password, nickname }
    """
    email    = data.get("email", "").strip()
    password = data.get("password", "")
    nickname = data.get("nickname", "").strip()

    if not email or not password:
        raise HTTPException(status_code=400, detail="이메일과 비밀번호는 필수입니다")

    # 이메일 중복 확인
    dup = await postgres.execute({
        "action": "read", "model": "UserProfile", "filters": {"email": email}
    })
    if dup.get("status") == "success" and dup.get("data"):
        raise HTTPException(status_code=409, detail="이미 가입된 이메일입니다")

    user_id = "MEM:" + str(uuid.uuid4())
    now     = datetime.now(tz=timezone.utc)

    for step, payload in [
        ("users", {
            "action": "create", "model": "User",
            "data": {"user_id": user_id, "user_type": "MEM", "status": "active", "created_at": now},
        }),
        ("user_profile", {
            "action": "create", "model": "UserProfile",
            "data": {"user_id": user_id, "email": email, "nickname": nickname, "updated_at": now},
        }),
        ("user_security", {
            "action": "create", "model": "UserSecurity",
            "data": {"user_id": user_id, "password_hash": hash_password(password), "login_fail_count": 0},
        }),
        ("user_preferences", {
            "action": "create", "model": "UserPreferences",
            "data": {"user_id": user_id, "updated_at": now},
        }),
    ]:
        result = await postgres.execute(payload)
        if result.get("status") != "success":
            raise HTTPException(status_code=500, detail=f"{step} 생성 실패: {result.get('reason')}")

    return {"user_id": user_id, "status": "success"}


async def login(postgres: PostgresManager, redis: RedisManager, email: str, pw: str) -> dict:
    """자체 계정(MEM) 로그인."""
    # 이메일로 프로필 조회
    prof_result = await postgres.execute({
        "action": "read", "model": "UserProfile", "filters": {"email": email}
    })
    if prof_result.get("status") != "success" or not prof_result.get("data"):
        raise HTTPException(status_code=401, detail="존재하지 않는 계정입니다")

    profile  = prof_result["data"][0]
    user_id  = profile["user_id"]
    nickname = profile.get("nickname", "")

    # user_type 확인 — MEM만 비밀번호 로그인 허용
    user_result = await postgres.execute({
        "action": "read", "model": "User", "filters": {"user_id": user_id}
    })
    if user_result.get("status") == "success" and user_result.get("data"):
        if user_result["data"][0].get("user_type") != "MEM":
            raise HTTPException(status_code=400, detail="SNS 연동 계정입니다. 카카오 로그인을 이용해주세요")

    # 보안 정보 조회
    sec_result = await postgres.execute({
        "action": "read", "model": "UserSecurity", "filters": {"user_id": user_id}
    })
    if sec_result.get("status") != "success" or not sec_result.get("data"):
        raise HTTPException(status_code=500, detail="보안 정보 조회 실패")

    sec = sec_result["data"][0]
    now = datetime.now(tz=timezone.utc)

    # 계정 잠금 확인
    if sec.get("locked_until"):
        locked_until = sec["locked_until"]
        if isinstance(locked_until, str):
            locked_until = datetime.fromisoformat(locked_until.replace("Z", "+00:00"))
        if locked_until > now:
            raise HTTPException(status_code=403, detail="계정이 잠겨 있습니다. 잠시 후 다시 시도하세요")

    # 비밀번호 검증
    if not verify_password(pw, sec["password_hash"]):
        fail_count = sec.get("login_fail_count", 0) + 1
        update_data = {"login_fail_count": fail_count}
        if fail_count >= 5:
            update_data["locked_until"] = now + timedelta(minutes=30)
        await postgres.execute({
            "action": "update", "model": "UserSecurity",
            "filters": {"user_id": user_id}, "data": update_data,
        })
        if fail_count >= 5:
            raise HTTPException(status_code=403, detail="로그인 5회 실패. 계정이 30분간 잠겼습니다")
        raise HTTPException(status_code=401, detail=f"비밀번호가 일치하지 않습니다 ({fail_count}/5)")

    # 로그인 성공 갱신
    await postgres.execute({
        "action": "update", "model": "UserSecurity",
        "filters": {"user_id": user_id},
        "data": {"last_login_at": now, "login_fail_count": 0},
    })

    access_token, refresh_token, jti = _issue_tokens(user_id)
    await redis.execute({
        "action": "set", "key": f"auth:refresh:{jti}", "value": user_id, "ttl": TTL_MEMBER,
    })

    return {
        "access_token":  access_token,
        "refresh_token": refresh_token,
        "user_id":       user_id,
        "type":          "MEM",
        "nickname":      nickname,
        "email":         email,
        "status":        "success",
    }


async def refresh_token_service(redis: RedisManager, refresh_token: str) -> dict:
    """Refresh Token → 새 Access Token 발급."""
    payload = verify_refresh_token(refresh_token)
    user_id = payload["sub"]
    jti     = payload["jti"]

    result = await redis.execute({"action": "get", "key": f"auth:refresh:{jti}"})
    if result.get("status") != "success" or result.get("value") is None:
        raise HTTPException(status_code=401, detail="만료되었거나 로그아웃된 토큰입니다")

    new_access_token = create_access_token(user_id)
    return {"access_token": new_access_token, "status": "success"}


async def logout(redis: RedisManager, refresh_token: str) -> None:
    """로그아웃: Refresh Token JTI 삭제 → 이후 갱신 차단."""
    try:
        payload = verify_refresh_token(refresh_token)
        jti = payload.get("jti")
        if jti:
            await redis.execute({"action": "delete", "key": f"auth:refresh:{jti}"})
    except HTTPException:
        pass  # 이미 만료/잘못된 토큰도 성공 처리


def _issue_tokens(user_id: str) -> tuple[str, str, str]:
    """Access Token + Refresh Token 동시 발급. (access, refresh, jti) 반환."""
    access_token          = create_access_token(user_id)
    refresh_token, jti    = create_refresh_token(user_id)
    return access_token, refresh_token, jti
