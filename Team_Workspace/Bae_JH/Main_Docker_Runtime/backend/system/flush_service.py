"""
flush_service.py
로그아웃 또는 창 닫기(beforeunload) 시
Redis 세션 상태를 Postgres로 플러시합니다.
"""
from datetime import datetime, timezone


class FlushService:

    @staticmethod
    async def flush_single_session(session_id: str, postgres, redis):
        """
        단일 세션의 Redis 메타를 Postgres Session 테이블에 반영 후 Redis 정리.
        SessionContainer의 teardown과는 별도로 메타 저장에 집중합니다.
        """
        from .session_cache import SessionCache
        meta = await SessionCache.get_session_meta(session_id, redis)
        if not meta:
            return

        now = datetime.now(tz=timezone.utc)
        await postgres.execute({
            "action":  "update",
            "model":   "Session",
            "filters": {"session_id": session_id},
            "data": {
                "title":           meta.get("name",  "새 세션"),
                "topic":           meta.get("topic", ""),
                "context_summary": meta.get("context", ""),
                "is_manual_title": meta.get("is_manual_title", "false") == "true",
                "updated_at":      now,
            },
        })
        await SessionCache.delete_session_cache(session_id, redis)

    @staticmethod
    async def flush_user_sessions(user_id: str, postgres, redis):
        """
        사용자의 모든 활성 세션을 Postgres로 플러시하고 Redis 정리.
        로그아웃 또는 창 닫기 시 호출.
        """
        from .session_cache import SessionCache
        session_ids = await SessionCache.get_active_session_ids(user_id, redis)

        for session_id in session_ids:
            try:
                await FlushService.flush_single_session(session_id, postgres, redis)
            except Exception as e:
                print(f"[FlushService] 세션 {session_id} 플러시 실패: {e}")
            await SessionCache.unmark_active(user_id, session_id, redis)

        await redis.execute({"action": "delete", "key": f"user:{user_id}:current_session"})
        print(f"[FlushService] {user_id}: {len(session_ids)}개 세션 플러시 완료")
