"""
FastAPI Dependency: JWT 검증 및 user_id 주입
"""
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

from backend.auth.jwt_utils import verify_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    """
    Authorization: Bearer {token} 헤더에서 user_id를 추출하여 반환.
    토큰 없거나 만료된 경우 HTTPException(401).
    반환: user_id 문자열 ("MEM:...", "KKO:...")
    """
    if not token:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    payload = verify_access_token(token)
    return payload["sub"]


async def get_optional_user(token: str = Depends(oauth2_scheme)) -> str | None:
    """
    인증 선택적 엔드포인트용. 토큰 없어도 None 반환.
    비로그인 상태는 None으로 처리.
    """
    if not token:
        return None
    try:
        payload = verify_access_token(token)
        return payload["sub"]
    except HTTPException:
        return None
