"""
router.py
세션과 관련된 모든 로직.

facade.py 의 각 라우트 함수가 직접 구현 대신 이 클래스를 호출합니다.
  Router.*  — 세션 생명주기, 메시지, 지도, 메모, 플래너, 파일 등 모든 세션 작업

데이터 저장 구조:
  - 세션 메타/대화 기록  → Postgres (Sessions, Conversations 테이블)
  - 세션 메타 캐시       → Redis  (session:{id}:meta)
  - 지도/메모/플랜/기간  → Redis  (session:{id}:markers 등, TTL 24h)
  - 임시 세션           → 프로세스 메모리 (_temp_sessions)
"""

import os
import uuid
import json
import asyncio
from datetime import date, datetime, timezone
from typing import Dict, List, Optional

from fastapi import UploadFile
from fastapi.responses import StreamingResponse, PlainTextResponse

from ..session_container import SessionContainer
from ..system.db_interface import PostgresDBInterface
from ..system.session_cache import SessionCache
from ..system.flush_service import FlushService


# ── 인메모리 SessionContainer 풀 ────────────────────────────
_active_sessions: Dict[str, SessionContainer] = {}

# ── 비로그인 임시 세션 (DB 저장 없음) ──────────────────────
_temp_sessions:   Dict[str, SessionContainer] = {}

# ── 팀 채팅 SSE 구독 큐 ─────────────────────────────────────
# session_id → [asyncio.Queue, ...]  (각 클라이언트 연결마다 Queue 1개)
_session_sse_queues: Dict[str, List[asyncio.Queue]] = {}

# MockDBInterface (임시 세션 전용)
class _MockDB:
    async def load_personalization(self, user_id): return ""
    async def load_session_data(self, session_id): return {}
    async def append_messages(self, session_id, messages): pass
    async def save_session_state(self, session_id, topic, name, context, is_manual_title): pass
    async def get_chat_history(self, session_id): return []


# ============================================================
# Router
# ============================================================

class Router:

    # ── 비로그인 임시 챗봇 ──────────────────────────────────

    @staticmethod
    async def send_temp_message(temp_session_id: str, message: str) -> StreamingResponse:
        """비로그인 또는 로그인 후 임시채팅 전용. DB/Redis 저장 없음."""
        if temp_session_id not in _temp_sessions:
            container = SessionContainer(
                session_id=temp_session_id,
                user_id="TEMP",
                db_interface=_MockDB(),
            )
            await container.initialize_session(is_new=True)
            _temp_sessions[temp_session_id] = container

        container = _temp_sessions[temp_session_id]

        async def _stream():
            response_text = await container.process_user_input(message)
            for char in response_text:
                yield char
                await asyncio.sleep(0.03)

        return StreamingResponse(_stream(), media_type="text/plain")

    # ── 여행(Trip) 목록 — facade에서 Loader 직접 호출 후 반환 ─

    @staticmethod
    async def get_trip_list(postgres, user_id: str) -> dict:
        from ..loader.loader import Loader
        trips = await Loader.get_trip_list(postgres, user_id)
        return {"trips": trips}

    # ── 세션 목록 ────────────────────────────────────────────

    @staticmethod
    async def get_session_list(trip_id: Optional[str], user_id: str,
                                postgres, mode: str = "personal") -> dict:
        from ..loader.loader import Loader
        sessions = await Loader.get_session_list(postgres, user_id, trip_id, mode)
        return {"sessions": sessions}

    # ── 세션 생성 ────────────────────────────────────────────

    @staticmethod
    async def create_session(first_message: str, mode: str, user_id: str,
                              trip_id: Optional[str], postgres, redis) -> dict:
        session_id = "session_" + str(uuid.uuid4())[:8]
        title      = first_message[:20] + "..." if len(first_message) > 20 else first_message
        today      = date.today().isoformat()

        # Postgres에 세션 레코드 저장
        from ..loader.loader import Loader
        await Loader.create_session_record(postgres, session_id, user_id, {
            "title":   title,
            "trip_id": trip_id,
            "mode":    mode,
        })

        # SessionContainer 생성 + Redis 활성 세션 등록
        db_iface = PostgresDBInterface(postgres, redis, user_id)
        container = SessionContainer(
            session_id=session_id,
            user_id=user_id,
            db_interface=db_iface,
        )
        await container.initialize_session(is_new=True)
        _active_sessions[session_id] = container

        await SessionCache.mark_active(user_id, session_id, redis)
        await SessionCache.set_current_session(user_id, session_id, redis)
        await SessionCache.cache_session_meta(session_id, {
            "name":            title,
            "topic":           "새로운 대화",
            "context":         "",
            "is_manual_title": "false",
            "trip_id":         trip_id or "",
            "user_id":         user_id,
            "mode":            mode,
        }, redis)

        # trip_id가 있으면 trip color 조회
        trip_color = None
        if trip_id:
            trips = await Loader.get_trip_list(postgres, user_id)
            for t in trips:
                if t.get("trip_id") == trip_id:
                    trip_color = t.get("color")
                    break

        return {
            "id":          session_id,
            "title":       title,
            "mode":        mode,
            "trip_id":     trip_id,
            "trip_color":  trip_color,
            "user_id":     user_id,
            "created_at":  today,
        }

    # ── 세션 삭제 ────────────────────────────────────────────

    @staticmethod
    async def delete_session(session_id: str, user_id: str,
                              postgres, redis) -> dict:
        from ..loader.loader import Loader
        result = await Loader.leave_or_delete_session(postgres, session_id, user_id)

        await SessionCache.unmark_active(user_id, session_id, redis)

        if result.get("deleted"):
            # 실제 세션 삭제 시에만 컨테이너/캐시 정리
            if session_id in _active_sessions:
                try:
                    await _active_sessions[session_id].teardown()
                except Exception:
                    pass
                del _active_sessions[session_id]
            await FlushService.flush_single_session(session_id, postgres, redis)

        return {"success": True, "deleted": result.get("deleted", False)}

    # ── 세션 제목 변경 ────────────────────────────────────────

    @staticmethod
    async def update_session_title(session_id: str, title: str, user_id: str,
                                    postgres, redis) -> dict:
        # Redis 메타 갱신
        meta = await SessionCache.get_session_meta(session_id, redis) or {}
        meta["name"] = title
        meta["is_manual_title"] = "true"
        await SessionCache.cache_session_meta(session_id, meta, redis)

        # 활성 컨테이너에도 반영
        if session_id in _active_sessions:
            _active_sessions[session_id].session_name  = title
            _active_sessions[session_id].is_manual_title = True

        # Postgres 갱신
        from ..loader.loader import Loader
        await Loader.update_session_record(postgres, session_id, {
            "title":           title,
            "is_manual_title": True,
        })

        return {"success": True, "title": title}

    # ── 세션 모드 변경 ────────────────────────────────────────

    @staticmethod
    async def update_session_mode(session_id: str, mode: str, user_id: str,
                                   postgres, redis) -> dict:
        from ..loader.loader import Loader
        from fastapi import HTTPException
        # 개인 전환은 마스터만 가능
        if mode == "personal":
            role = await Loader.get_session_role(postgres, session_id, user_id)
            if role != "master":
                raise HTTPException(status_code=403, detail="마스터만 개인 플래너로 전환할 수 있습니다")
        await Loader.update_session_record(postgres, session_id, {"mode": mode})

        # Redis 메타 갱신 (send_message 모드 분기가 최신 값을 읽도록)
        meta = await SessionCache.get_session_meta(session_id, redis) or {}
        meta["mode"] = mode
        await SessionCache.cache_session_meta(session_id, meta, redis)

        # 팀 → 개인 전환: 마스터 제외 참여자 전부 제거
        if mode == "personal":
            await postgres.execute({
                "action": "raw_sql",
                "sql": """
                    DELETE FROM session_participants
                    WHERE session_id = :sid AND role != 'master'
                """,
                "params": {"sid": session_id},
            })

        return {"success": True, "mode": mode}

    # ── 세션 초대 ────────────────────────────────────────────

    @staticmethod
    async def invite_user(session_id: str, invitee: str, user_id: str,
                           postgres) -> dict:
        from ..loader.loader import Loader
        return await Loader.invite_to_session(postgres, session_id, user_id, invitee)

    # ── 채팅 공유 ────────────────────────────────────────────

    @staticmethod
    async def share_chat(session_id: str, user_id: str) -> dict:
        return {"success": True, "share_url": f"/share/{session_id}"}

    # ── 메시지 전송 (스트리밍) ───────────────────────────────

    @staticmethod
    async def send_message(session_id: str, message: str, user_id: str,
                            postgres, redis) -> StreamingResponse:
        # ── 세션 모드 확인 (Redis 캐시 → Postgres fallback) ──
        meta = await SessionCache.get_session_meta(session_id, redis)
        session_mode = (meta or {}).get("mode", "")
        if not session_mode or session_mode in ("None", "none", ""):
            r = await postgres.execute({
                "action": "read", "model": "Session",
                "filters": {"session_id": session_id},
            })
            session_mode = (r.get("data") or [{}])[0].get("mode", "personal")

        if session_mode == "team":
            return await Router._handle_team_message(session_id, user_id, message, postgres)

        # ── 개인 모드: AI 스트리밍 ────────────────────────────
        prev_id = await SessionCache.get_current_session(user_id, redis)
        if prev_id and prev_id != session_id and prev_id in _active_sessions:
            try:
                await _active_sessions[prev_id].teardown()
            except Exception:
                pass
            del _active_sessions[prev_id]

        await SessionCache.set_current_session(user_id, session_id, redis)

        if session_id not in _active_sessions:
            db_iface = PostgresDBInterface(postgres, redis, user_id)
            container = SessionContainer(
                session_id=session_id,
                user_id=user_id,
                db_interface=db_iface,
            )
            await container.initialize_session(is_new=False)
            _active_sessions[session_id] = container
            await SessionCache.mark_active(user_id, session_id, redis)

        container = _active_sessions[session_id]

        async def _stream():
            response_text = await container.process_user_input(message)
            for char in response_text:
                yield char
                await asyncio.sleep(0.03)

        return StreamingResponse(_stream(), media_type="text/plain")

    @staticmethod
    async def _handle_team_message(session_id: str, user_id: str,
                                    message: str, postgres) -> StreamingResponse:
        """팀 모드: AI 없이 메시지 저장 + SSE 브로드캐스트."""
        now    = datetime.now(tz=timezone.utc)
        msg_id = "msg_" + str(uuid.uuid4())[:12]

        await postgres.execute({
            "action": "create", "model": "Conversation",
            "data": {
                "message_id":   msg_id,
                "session_id":   session_id,
                "sender_id":    user_id,
                "sender_type":  "user",
                "message_type": "text",
                "content":      message,
                "created_at":   now,
            },
        })

        event_data = json.dumps({
            "type":      "message",
            "sender_id": user_id,
            "content":   message,
            "msg_id":    msg_id,
            "ts":        now.isoformat(),
        }, ensure_ascii=False)

        for q in list(_session_sse_queues.get(session_id, [])):
            try:
                q.put_nowait(event_data)
            except asyncio.QueueFull:
                pass

        async def _ack():
            yield message

        return StreamingResponse(_ack(), media_type="text/plain")

    # ── 팀 채팅 SSE 구독 ─────────────────────────────────────

    @staticmethod
    async def subscribe_session_events(session_id: str, user_id: str) -> StreamingResponse:
        """팀 세션 실시간 이벤트 스트림 (Server-Sent Events)."""
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        _session_sse_queues.setdefault(session_id, []).append(q)

        async def _gen():
            try:
                yield f"data: {json.dumps({'type': 'connected', 'session_id': session_id})}\n\n"
                while True:
                    try:
                        data = await asyncio.wait_for(q.get(), timeout=25)
                        yield f"data: {data}\n\n"
                    except asyncio.TimeoutError:
                        yield f"data: {json.dumps({'type': 'keepalive'})}\n\n"
            except asyncio.CancelledError:
                pass
            finally:
                try:
                    _session_sse_queues.get(session_id, []).remove(q)
                except (ValueError, AttributeError):
                    pass

        return StreamingResponse(
            _gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # ── 대화 기록 조회 ────────────────────────────────────────

    @staticmethod
    async def get_chat_history(session_id: str, postgres) -> dict:
        from ..loader.loader import Loader
        msgs = await Loader.get_conversation_history(postgres, session_id)
        # 세션 모드 조회 (프론트가 SSE 여부 판단에 사용)
        r = await postgres.execute({
            "action": "raw_sql",
            "sql": 'SELECT "mode" FROM sessions WHERE session_id = :sid',
            "params": {"sid": session_id},
        })
        session_mode = (r.get("data") or [{}])[0].get("mode", "personal")
        return {"messages": msgs, "mode": session_mode}

    # ── 대화 다운로드 ────────────────────────────────────────

    @staticmethod
    async def download_chat(session_id: str, postgres) -> PlainTextResponse:
        from ..loader.loader import Loader
        history = await Loader.get_conversation_history(postgres, session_id)

        content = f"--- 대화 기록 ({session_id}) ---\n"
        for msg in history:
            role = "사용자" if msg.get("role") == "user" else "봇"
            content += f"[{role}]\n{msg.get('content', '')}\n\n"

        headers = {"Content-Disposition": f"attachment; filename=chat_{session_id}.txt"}
        return PlainTextResponse(content, headers=headers)

    # ── 파일 업로드 ──────────────────────────────────────────

    @staticmethod
    async def upload_files(session_id: str, files: List[UploadFile],
                            user_id: str) -> dict:
        base   = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        up_dir = os.path.join(base, "uploads")
        os.makedirs(up_dir, exist_ok=True)

        names = []
        for file in files:
            dest = os.path.join(up_dir, file.filename)
            with open(dest, "wb+") as f:
                f.write(await file.read())
            names.append(file.filename)

        return {"success": True, "uploaded_files": names}

    # ── 지도 마커 (Redis) ────────────────────────────────────

    @staticmethod
    async def add_map_marker(session_id: str, marker_id: str,
                              lat: float, lng: float, title: str,
                              user_id: str, redis) -> dict:
        markers = await SessionCache.get_markers(session_id, redis)
        markers = [m for m in markers if m.get("marker_id") != marker_id]
        markers.append({"marker_id": marker_id, "lat": lat, "lng": lng, "title": title})
        await SessionCache.save_markers(session_id, markers, redis)
        return {"success": True, "marker_id": marker_id}

    @staticmethod
    async def delete_map_marker(session_id: str, marker_id: str,
                                 user_id: str, redis) -> dict:
        markers = await SessionCache.get_markers(session_id, redis)
        markers = [m for m in markers if m.get("marker_id") != marker_id]
        await SessionCache.save_markers(session_id, markers, redis)
        return {"success": True}

    @staticmethod
    async def save_map_markers(session_id: str, markers: List[dict],
                                user_id: str, redis) -> dict:
        normalized = []
        for m in markers:
            mid = m.get("marker_id") or m.get("id")
            if mid:
                normalized.append({
                    "marker_id": mid,
                    "lat":       m.get("lat", 0),
                    "lng":       m.get("lng", 0),
                    "title":     m.get("title", ""),
                })
        await SessionCache.save_markers(session_id, normalized, redis)
        return {"success": True}

    @staticmethod
    async def get_map_markers(session_id: str, user_id: str, redis) -> dict:
        markers = await SessionCache.get_markers(session_id, redis)
        return {"markers": markers}

    # ── 여행 기간 (Redis) ────────────────────────────────────

    @staticmethod
    async def save_trip_range(session_id: str, ranges: List[dict],
                               user_id: str, redis) -> dict:
        await SessionCache.save_ranges(session_id, ranges, redis)
        return {"success": True}

    @staticmethod
    async def get_trip_range(session_id: str, user_id: str, redis) -> dict:
        ranges = await SessionCache.get_ranges(session_id, redis)
        return {"ranges": ranges}

    # ── 메모 (Redis) ─────────────────────────────────────────

    @staticmethod
    async def save_memo(session_id: str, date_key: str, memo: str,
                         user_id: str, redis) -> dict:
        await SessionCache.save_memo(session_id, date_key, memo, redis)
        return {"success": True}

    @staticmethod
    async def get_memo(session_id: str, date_key: str, user_id: str, redis) -> dict:
        memo = await SessionCache.get_memo(session_id, date_key, redis)
        return {"memo": memo}

    # ── 플래너 (Redis) ───────────────────────────────────────

    @staticmethod
    async def save_plan(session_id: str, date_key: str, plan: List[dict],
                         user_id: str, redis) -> dict:
        await SessionCache.save_plan(session_id, date_key, plan, redis)
        return {"success": True}

    @staticmethod
    async def get_plan(session_id: str, date_key: str, user_id: str, redis) -> dict:
        plan = await SessionCache.get_plan(session_id, date_key, redis)
        return {"plan": plan}

    # ── 캘린더 인디케이터 (Redis) ────────────────────────────

    @staticmethod
    async def get_indicators(session_id: str, year: int, month: int,
                              user_id: str, redis) -> list:
        return await SessionCache.get_indicators(session_id, year, month, redis)
