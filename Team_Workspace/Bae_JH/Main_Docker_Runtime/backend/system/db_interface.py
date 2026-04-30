"""
db_interface.py
SessionContainer에 주입되는 실제 DB 인터페이스.
MockDBInterface를 대체하며 Postgres + Redis를 통한 실제 영속성을 제공합니다.
"""
import json
import uuid
from datetime import datetime, timezone
from typing import List


PROFILE_CACHE_TTL = 3600 * 24   # 24시간
SESSION_META_TTL  = 3600 * 8    # 8시간


class PostgresDBInterface:
    """SessionContainer.db_interface 로 주입되는 실제 구현체."""

    def __init__(self, postgres, redis, user_id: str = None):
        self.postgres = postgres
        self.redis    = redis
        self.user_id  = user_id

    # ─────────────────────────────────────────────────────────
    # 개인화 정보 로드
    # ─────────────────────────────────────────────────────────

    async def load_personalization(self, user_id: str) -> str:
        """Redis 캐시 우선, fallback Postgres UserPreferences."""
        cache_key = f"user:{user_id}:profile"
        cached = await self.redis.execute({
            "action": "hget", "key": cache_key, "field": "personalized_topics"
        })
        if cached.get("status") == "success" and cached.get("value"):
            return cached["value"]

        result = await self.postgres.execute({
            "action": "read", "model": "UserPreferences", "filters": {"user_id": user_id}
        })
        if result.get("status") == "success" and result.get("data"):
            prefs = result["data"][0]
            raw   = prefs.get("personalized_topics") or {}
            text  = json.dumps(raw, ensure_ascii=False) if isinstance(raw, dict) else str(raw or "")
            if text:
                await self.redis.execute({
                    "action": "hset", "key": cache_key,
                    "field": "personalized_topics", "value": text,
                    "ttl": PROFILE_CACHE_TTL,
                })
            return text
        return ""

    # ─────────────────────────────────────────────────────────
    # 세션 메타데이터 로드
    # ─────────────────────────────────────────────────────────

    async def load_session_data(self, session_id: str) -> dict:
        """Redis 캐시 우선, fallback Postgres Sessions."""
        cache_key = f"session:{session_id}:meta"
        cached = await self.redis.execute({"action": "hgetall", "key": cache_key})
        if cached.get("status") == "success" and cached.get("data"):
            d = cached["data"]
            if d:
                return {
                    "topic":           d.get("topic",           "새로운 대화"),
                    "name":            d.get("name",            "새 세션"),
                    "context":         d.get("context",         ""),
                    "is_manual_title": d.get("is_manual_title", "false") == "true",
                }

        result = await self.postgres.execute({
            "action": "read", "model": "Session", "filters": {"session_id": session_id}
        })
        if result.get("status") == "success" and result.get("data"):
            s = result["data"][0]
            data = {
                "topic":           s.get("topic")          or "새로운 대화",
                "name":            s.get("title")          or "새 세션",
                "context":         s.get("context_summary") or "",
                "is_manual_title": s.get("is_manual_title", False),
            }
            # Redis에 캐시
            await self.redis.execute({
                "action": "hset", "key": cache_key,
                "mapping": {
                    "topic":           data["topic"],
                    "name":            data["name"],
                    "context":         data["context"],
                    "is_manual_title": "true" if data["is_manual_title"] else "false",
                },
                "ttl": SESSION_META_TTL,
            })
            return data
        return {}

    # ─────────────────────────────────────────────────────────
    # 대화 기록 저장
    # ─────────────────────────────────────────────────────────

    async def append_messages(self, session_id: str, messages: List[dict]):
        """대화 메시지를 Postgres Conversation 테이블에 저장."""
        now = datetime.now(tz=timezone.utc)
        for msg in messages:
            role        = msg.get("role", "user")
            sender_type = "user" if role == "user" else "ai"
            await self.postgres.execute({
                "action": "create", "model": "Conversation",
                "data": {
                    "message_id":   "msg_" + str(uuid.uuid4())[:12],
                    "session_id":   session_id,
                    "sender_id":    self.user_id if sender_type == "user" else None,
                    "sender_type":  sender_type,
                    "message_type": "text",
                    "content":      msg.get("content", ""),
                    "created_at":   now,
                },
            })

    # ─────────────────────────────────────────────────────────
    # 세션 상태 저장
    # ─────────────────────────────────────────────────────────

    async def save_session_state(self, session_id: str, topic: str, name: str,
                                  context: str, is_manual_title: bool):
        """세션 메타를 Redis + Postgres에 동시 저장."""
        cache_key = f"session:{session_id}:meta"
        await self.redis.execute({
            "action": "hset", "key": cache_key,
            "mapping": {
                "topic":           topic,
                "name":            name,
                "context":         context,
                "is_manual_title": "true" if is_manual_title else "false",
            },
            "ttl": SESSION_META_TTL,
        })

        now = datetime.now(tz=timezone.utc)
        await self.postgres.execute({
            "action": "update", "model": "Session",
            "filters": {"session_id": session_id},
            "data": {
                "title":           name,
                "is_manual_title": is_manual_title,
                "topic":           topic,
                "context_summary": context,
                "updated_at":      now,
            },
        })

    # ─────────────────────────────────────────────────────────
    # 대화 기록 조회
    # ─────────────────────────────────────────────────────────

    async def get_chat_history(self, session_id: str) -> List[dict]:
        """Postgres Conversation 테이블에서 대화 기록 조회."""
        result = await self.postgres.execute({
            "action": "read", "model": "Conversation",
            "filters": {"session_id": session_id},
        })
        if result.get("status") != "success":
            return []
        msgs = []
        for row in result.get("data", []):
            role = "user" if row.get("sender_type") == "user" else "bot"
            msgs.append({"role": role, "content": row.get("content", "")})
        return msgs
