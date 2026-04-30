"""
loader.py
DB와 관련된 모든 로직.

facade.py 의 각 라우트 함수가 직접 구현 대신 이 클래스를 호출합니다.
  Loader.lifespan   — FastAPI lifespan (DB 초기화/정리)
  Loader.*          — 인증·계정·여행·세션·팀·설정 등 DB 접근이 필요한 모든 작업
"""

import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import FastAPI, HTTPException


# ============================================================
# Loader — DB 로직 전담
# ============================================================

class Loader:

    # ── 앱 수명 주기 ────────────────────────────────────────

    @staticmethod
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """PostgreSQL + Redis 초기화 → app.state 주입 → 종료 시 정리."""
        from module.node.memory.postgres_manager import PostgresManager
        from module.node.memory.redis_manager   import RedisManager
        from module.node.memory.postgres_tables import (
            User, UserProfile, UserSecurity, UserOAuth, UserPreferences,
            Team, TeamMember,
            Trip,
            Session, SessionParticipant, Conversation,
            Notification,
        )

        postgres = PostgresManager()
        redis    = RedisManager()

        for name, model in [
            ("User",                User),
            ("UserProfile",         UserProfile),
            ("UserSecurity",        UserSecurity),
            ("UserOAuth",           UserOAuth),
            ("UserPreferences",     UserPreferences),
            ("Team",                Team),
            ("TeamMember",          TeamMember),
            ("Trip",                Trip),
            ("Session",             Session),
            ("SessionParticipant",  SessionParticipant),
            ("Conversation",        Conversation),
            ("Notification",        Notification),
        ]:
            postgres.register_model(name, model)

        app.state.postgres = postgres
        app.state.redis    = redis
        print("[Loader] PostgreSQL & Redis 초기화 완료")
        yield
        await redis.close()
        print("[Loader] 앱 종료 완료")

    # ── 인증 ────────────────────────────────────────────────

    @staticmethod
    async def signup(postgres, data: dict):
        from ..auth import auth_service
        result = await auth_service.signup(postgres, data)
        # 회원가입 성공 시 개인 팀 자동 생성
        try:
            from ..system.team_service import TeamService
            await TeamService.ensure_personal_team(result["user_id"], postgres)
        except Exception as e:
            print(f"[Loader] 개인 팀 생성 실패 (무시): {e}")
        return result

    @staticmethod
    async def login(postgres, redis, user_id: str, password: str):
        from ..auth import auth_service
        return await auth_service.login(postgres, redis, user_id, password)

    @staticmethod
    async def refresh_token(redis, refresh_token: str):
        from ..auth import auth_service
        return await auth_service.refresh_token_service(redis, refresh_token)

    @staticmethod
    async def logout(postgres, redis, refresh_token: str, user_id: Optional[str] = None):
        """로그아웃: 세션 플러시 후 Refresh Token 폐기."""
        if user_id:
            try:
                from ..system.flush_service import FlushService
                await FlushService.flush_user_sessions(user_id, postgres, redis)
            except Exception as e:
                print(f"[Loader] 세션 플러시 실패 (무시): {e}")
        from ..auth import auth_service
        await auth_service.logout(redis, refresh_token)

    # ── 사용자 정보 ─────────────────────────────────────────

    @staticmethod
    async def get_my_info(postgres, user_id: str) -> dict:
        result = await postgres.execute({
            "action": "read", "model": "UserProfile",
            "filters": {"user_id": user_id},
        })
        if result.get("status") == "success" and result.get("data"):
            p = result["data"][0]
            return {
                "status":    "success",
                "user_id":   user_id,
                "user_type": user_id.split(":")[0],
                "nickname":  p.get("nickname", ""),
                "email":     p.get("email", ""),
            }
        raise HTTPException(status_code=404, detail="사용자 정보를 찾을 수 없습니다")

    @staticmethod
    async def get_account_info(postgres, user_id: Optional[str]) -> dict:
        if not user_id:
            return {"status": "unauthenticated", "user_id": None}
        result = await postgres.execute({
            "action": "read", "model": "UserProfile",
            "filters": {"user_id": user_id},
        })
        if result.get("status") == "success" and result.get("data"):
            p = result["data"][0]
            return {
                "status":    "success",
                "user_id":   user_id,
                "user_type": user_id.split(":")[0],
                "nickname":  p.get("nickname", ""),
                "email":     p.get("email", ""),
            }
        return {"status": "success", "user_id": user_id, "user_type": user_id.split(":")[0]}

    # ── 설정 ────────────────────────────────────────────────

    @staticmethod
    async def get_settings(user_id: str) -> dict:
        return {"status": "success", "data": {}}

    @staticmethod
    async def update_settings(user_id: str, settings: dict) -> dict:
        print(f"[Loader] {user_id} 설정 업데이트: {settings}")
        return {"status": "success"}

    # ── 여행(Trip) ───────────────────────────────────────────

    @staticmethod
    async def get_trip_list(postgres, user_id: str) -> list:
        """사용자가 속한 팀의 모든 여행 목록 반환 (color 포함)."""
        result = await postgres.execute({
            "action": "raw_sql",
            "sql": """
                SELECT tr.trip_id, tr.title, tr.color, tr.destination,
                       tr.start_date, tr.end_date, tr.status,
                       tr.team_id, tr.created_by, tr.created_at
                FROM trips tr
                JOIN team_members tm ON tr.team_id = tm.team_id
                WHERE tm.user_id = :user_id AND tr.status != 'deleted'
                ORDER BY tr.created_at DESC
            """,
            "params": {"user_id": user_id},
        })
        return result.get("data", [])

    @staticmethod
    async def create_trip(postgres, user_id: str, data: dict) -> dict:
        """새 여행 생성. 사용자의 개인 팀에 귀속."""
        from ..system.team_service import TeamService
        team_id = await TeamService.ensure_personal_team(user_id, postgres)

        trip_id = "trip_" + str(uuid.uuid4())[:8]
        now     = datetime.now(tz=timezone.utc)

        await postgres.execute({
            "action": "create", "model": "Trip",
            "data": {
                "trip_id":     trip_id,
                "team_id":     team_id,
                "created_by":  user_id,
                "title":       data.get("title", "새 여행"),
                "color":       data.get("color"),
                "destination": data.get("destination"),
                "start_date":  data.get("start_date"),
                "end_date":    data.get("end_date"),
                "status":      "planning",
                "created_at":  now,
                "updated_at":  now,
            },
        })
        return {
            "trip_id": trip_id,
            "title":   data.get("title", "새 여행"),
            "color":   data.get("color"),
            "team_id": team_id,
        }

    @staticmethod
    async def update_trip(postgres, trip_id: str, user_id: str, data: dict) -> dict:
        now = datetime.now(tz=timezone.utc)
        update_data = {"updated_at": now}
        for field in ("title", "color", "destination", "start_date", "end_date", "status"):
            if field in data:
                update_data[field] = data[field]

        result = await postgres.execute({
            "action":  "update", "model": "Trip",
            "filters": {"trip_id": trip_id},
            "data":    update_data,
        })
        return {"success": True, "trip_id": trip_id}

    @staticmethod
    async def delete_trip(postgres, trip_id: str, user_id: str) -> dict:
        await postgres.execute({
            "action":  "update", "model": "Trip",
            "filters": {"trip_id": trip_id, "created_by": user_id},
            "data":    {"status": "deleted", "updated_at": datetime.now(tz=timezone.utc)},
        })
        return {"success": True}

    # ── 세션 ────────────────────────────────────────────────

    @staticmethod
    async def get_session_list(postgres, user_id: str,
                                trip_id: Optional[str] = None,
                                mode: str = "personal") -> list:
        """
        사용자의 세션 목록 반환.
        trip_id=None → 전체, trip_id='none' → 기타(trip 없는 세션), trip_id=값 → 해당 여행 세션
        """
        # "mode"는 PostgreSQL 18에서 ordered-set aggregate로 파싱될 수 있어 반드시 쿼팅
        base_where = """
            sp_me.user_id = :user_id
            AND s."mode" = :mode
            AND s.is_active = true
        """
        if trip_id == "none":
            sql = f"""
                SELECT s.session_id, s.title, s.topic, s."mode",
                       s.trip_id, s.is_manual_title, s.created_at, s.updated_at,
                       NULL AS trip_color, NULL AS trip_title,
                       sp_me.role AS user_role
                FROM sessions s
                JOIN session_participants sp_me
                  ON sp_me.session_id = s.session_id AND sp_me.user_id = :user_id
                WHERE {base_where}
                  AND s.trip_id IS NULL
                ORDER BY s.updated_at DESC
            """
            params = {"user_id": user_id, "mode": mode}
        elif trip_id:
            sql = f"""
                SELECT s.session_id, s.title, s.topic, s."mode",
                       s.trip_id, s.is_manual_title, s.created_at, s.updated_at,
                       tr.color AS trip_color, tr.title AS trip_title,
                       sp_me.role AS user_role
                FROM sessions s
                JOIN session_participants sp_me
                  ON sp_me.session_id = s.session_id AND sp_me.user_id = :user_id
                LEFT JOIN trips tr ON s.trip_id = tr.trip_id
                WHERE {base_where}
                  AND s.trip_id = :trip_id
                ORDER BY s.updated_at DESC
            """
            params = {"user_id": user_id, "mode": mode, "trip_id": trip_id}
        else:
            sql = f"""
                SELECT s.session_id, s.title, s.topic, s."mode",
                       s.trip_id, s.is_manual_title, s.created_at, s.updated_at,
                       tr.color AS trip_color, tr.title AS trip_title,
                       sp_me.role AS user_role
                FROM sessions s
                JOIN session_participants sp_me
                  ON sp_me.session_id = s.session_id AND sp_me.user_id = :user_id
                LEFT JOIN trips tr ON s.trip_id = tr.trip_id
                WHERE {base_where}
                ORDER BY s.updated_at DESC
            """
            params = {"user_id": user_id, "mode": mode}

        result = await postgres.execute({"action": "raw_sql", "sql": sql, "params": params})
        return result.get("data", [])

    @staticmethod
    async def create_session_record(postgres, session_id: str,
                                     user_id: str, data: dict) -> dict:
        """Postgres에 세션 레코드 생성 + SessionParticipant(master) 추가."""
        now = datetime.now(tz=timezone.utc)
        title = data.get("title", "새 세션")

        await postgres.execute({
            "action": "create", "model": "Session",
            "data": {
                "session_id":      session_id,
                "trip_id":         data.get("trip_id"),
                "created_by":      user_id,
                "mode":            data.get("mode", "personal"),
                "title":           title,
                "is_manual_title": False,
                "is_active":       True,
                "created_at":      now,
                "updated_at":      now,
            },
        })
        await postgres.execute({
            "action": "create", "model": "SessionParticipant",
            "data": {
                "session_id":   session_id,
                "user_id":      user_id,
                "role":         "master",
                "joined_at":    now,
                "last_read_at": now,
            },
        })
        return {"session_id": session_id, "title": title}

    @staticmethod
    async def update_session_record(postgres, session_id: str, data: dict) -> dict:
        now = datetime.now(tz=timezone.utc)
        update_data = {"updated_at": now}
        for field in ("title", "is_manual_title", "topic", "context_summary",
                       "trip_id", "mode", "is_active"):
            if field in data:
                update_data[field] = data[field]

        await postgres.execute({
            "action":  "update", "model": "Session",
            "filters": {"session_id": session_id},
            "data":    update_data,
        })
        return {"success": True}

    @staticmethod
    async def delete_session_record(postgres, session_id: str) -> dict:
        await postgres.execute({
            "action":  "update", "model": "Session",
            "filters": {"session_id": session_id},
            "data":    {"is_active": False, "updated_at": datetime.now(tz=timezone.utc)},
        })
        return {"success": True}

    @staticmethod
    async def leave_or_delete_session(postgres, session_id: str, user_id: str) -> dict:
        """
        마스터: 다른 참여자가 있으면 가입순 다음 참여자에게 마스터 이전 후 자신만 제거.
                혼자라면 세션 자체를 비활성화.
        비마스터: 참여자 목록에서만 제거.
        """
        r = await postgres.execute({
            "action": "raw_sql",
            "sql": """
                SELECT user_id, role, joined_at
                FROM session_participants
                WHERE session_id = :sid
                ORDER BY joined_at ASC
            """,
            "params": {"sid": session_id},
        })
        participants = r.get("data", [])

        me = next((p for p in participants if p["user_id"] == user_id), None)
        if not me:
            return {"success": True, "deleted": False}

        others = [p for p in participants if p["user_id"] != user_id]

        if me["role"] == "master":
            if not others:
                # 혼자 → 세션 삭제
                await postgres.execute({
                    "action":  "update", "model": "Session",
                    "filters": {"session_id": session_id},
                    "data":    {"is_active": False, "updated_at": datetime.now(tz=timezone.utc)},
                })
                return {"success": True, "deleted": True}
            else:
                # 가입순 첫 번째 참여자에게 마스터 이전
                next_master = others[0]["user_id"]
                await postgres.execute({
                    "action":  "update", "model": "SessionParticipant",
                    "filters": {"session_id": session_id, "user_id": next_master},
                    "data":    {"role": "master"},
                })
        # 자신을 참여자 목록에서 제거
        await postgres.execute({
            "action": "raw_sql",
            "sql": "DELETE FROM session_participants WHERE session_id = :sid AND user_id = :uid",
            "params": {"sid": session_id, "uid": user_id},
        })
        return {"success": True, "deleted": False}

    @staticmethod
    async def get_session_role(postgres, session_id: str, user_id: str) -> Optional[str]:
        """세션에서 사용자의 role 반환 (없으면 None)."""
        r = await postgres.execute({
            "action": "raw_sql",
            "sql": "SELECT role FROM session_participants WHERE session_id = :sid AND user_id = :uid",
            "params": {"sid": session_id, "uid": user_id},
        })
        rows = r.get("data", [])
        return rows[0]["role"] if rows else None

    # ── 대화 기록 ────────────────────────────────────────────

    @staticmethod
    async def get_conversation_history(postgres, session_id: str) -> list:
        result = await postgres.execute({
            "action": "raw_sql",
            "sql": """
                SELECT sender_id, sender_type, content, created_at
                FROM conversations
                WHERE session_id = :sid
                ORDER BY created_at ASC
            """,
            "params": {"sid": session_id},
        })
        msgs = []
        for row in result.get("data", []):
            role = "user" if row.get("sender_type") == "user" else "bot"
            msgs.append({
                "role":       role,
                "content":    row.get("content", ""),
                "created_at": row.get("created_at"),
                "sender_id":  row.get("sender_id"),
            })
        return msgs

    # ── 팀 ──────────────────────────────────────────────────

    @staticmethod
    async def get_team_list(postgres, user_id: str) -> list:
        from ..system.team_service import TeamService
        return await TeamService.get_user_teams(user_id, postgres)

    @staticmethod
    async def create_team(postgres, user_id: str, name: str) -> dict:
        from ..system.team_service import TeamService
        return await TeamService.create_team(user_id, name, postgres)

    @staticmethod
    async def get_team_sessions(postgres, team_id: str) -> list:
        from ..system.team_service import TeamService
        return await TeamService.get_team_sessions(team_id, postgres)

    @staticmethod
    async def search_users(postgres, q: str) -> dict:
        """닉네임으로 사용자 검색 (ILIKE)."""
        result = await postgres.execute({
            "action": "raw_sql",
            "sql": """
                SELECT up.user_id, up.nickname
                FROM user_profile up
                JOIN users u ON up.user_id = u.user_id
                WHERE up.nickname ILIKE :q AND u.status = 'active'
                LIMIT 10
            """,
            "params": {"q": f"%{q}%"},
        })
        return {"users": result.get("data", [])}

    @staticmethod
    async def invite_to_session(postgres, session_id: str,
                                 inviter_id: str, invitee_id: str) -> dict:
        from ..system.team_service import TeamService
        return await TeamService.invite_user_to_session(
            session_id, inviter_id, invitee_id, postgres)

    # ── 알림 ────────────────────────────────────────────────

    @staticmethod
    async def get_notifications(postgres, user_id: str) -> list:
        result = await postgres.execute({
            "action": "raw_sql",
            "sql": """
                SELECT n.notification_id, n.type, n.reference_type, n.reference_id,
                       n.message, n.is_read, n.created_at,
                       up.nickname AS inviter_nickname
                FROM notifications n
                LEFT JOIN user_profile up ON up.user_id = n.reference_id
                    AND n.type = 'session_invite'
                    AND n.reference_type = 'user'
                WHERE n.user_id = :user_id
                ORDER BY n.created_at DESC
                LIMIT 50
            """,
            "params": {"user_id": user_id},
        })
        return result.get("data", [])

    @staticmethod
    async def accept_session_invite(postgres, notification_id: str, user_id: str) -> dict:
        result = await postgres.execute({
            "action": "raw_sql",
            "sql": """
                SELECT notification_id, reference_type, reference_id, type
                FROM notifications
                WHERE notification_id = :nid AND user_id = :uid
            """,
            "params": {"nid": notification_id, "uid": user_id},
        })
        rows = result.get("data", [])
        if not rows:
            raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다")

        notif = rows[0]
        if notif["type"] != "session_invite" or notif["reference_type"] != "session":
            raise HTTPException(status_code=400, detail="세션 초대 알림이 아닙니다")

        session_id = notif["reference_id"]

        exists = await postgres.execute({
            "action": "read", "model": "SessionParticipant",
            "filters": {"session_id": session_id, "user_id": user_id},
        })
        if not (exists.get("status") == "success" and exists.get("data")):
            now = datetime.now(tz=timezone.utc)
            await postgres.execute({
                "action": "create", "model": "SessionParticipant",
                "data": {
                    "session_id":   session_id,
                    "user_id":      user_id,
                    "role":         "participant",
                    "joined_at":    now,
                    "last_read_at": now,
                },
            })

        await postgres.execute({
            "action": "update", "model": "Notification",
            "filters": {"notification_id": notification_id},
            "data": {"is_read": True},
        })
        return {"success": True, "session_id": session_id}

    @staticmethod
    async def dismiss_notification(postgres, notification_id: str, user_id: str) -> dict:
        await postgres.execute({
            "action":  "update", "model": "Notification",
            "filters": {"notification_id": notification_id, "user_id": user_id},
            "data":    {"is_read": True},
        })
        return {"success": True}
