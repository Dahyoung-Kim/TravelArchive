import os
import redis.asyncio as redis
from typing import Optional, Any

class RedisManager:
    _instances = {}

    def __new__(cls, redis_url=None):
        # 환경 변수에서 URL을 가져오거나 기본값 설정
        # 형식 예시: redis://:password@localhost:6379/0
        if redis_url is None:
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

        if redis_url not in cls._instances:
            instance = super(RedisManager, cls).__new__(cls)
            instance._init_redis(redis_url)
            cls._instances[redis_url] = instance
        
        return cls._instances[redis_url]

    def _init_redis(self, redis_url: str):
        print(f"[RedisManager] 순수 비동기 인메모리 엔진 가동 (URL: {redis_url})")
        
        # decode_responses=True: Redis에서 byte 형태가 아닌 파이썬 string 형태로 즉시 반환받기 위함
        # connection_pool을 내부적으로 자동 관리하여 효율성을 극대화합니다.
        self.redis = redis.from_url(redis_url, decode_responses=True)

    async def execute(self, payload: dict) -> dict:
        """
        노드로부터 전달받은 payload를 분석하여 비동기로 Redis 명령을 수행합니다.
        락(Lock)이 없으므로 수천 개의 코루틴이 동시에 이 메서드를 호출해도 블로킹되지 않습니다.
        """
        action = payload.get("action")
        key = payload.get("key")
        
        if not action or not key:
            return {"status": "error", "reason": "Payload must contain 'action' and 'key'"}

        try:
            # 1. 값 저장 (SET 및 SETEX)
            if action == "set":
                value = payload.get("value")
                ttl = payload.get("ttl") # 만료 시간(초 단위), JWT Refresh Token 저장 시 필수
                
                if value is None:
                    return {"status": "error", "reason": "Value is required for 'set' action"}
                
                # 객체나 딕셔너리가 들어올 경우를 대비해 안전하게 문자열 변환 (또는 JSON 덤프 가능)
                if isinstance(value, (dict, list)):
                    import json
                    value = json.dumps(value)
                else:
                    value = str(value)

                if ttl:
                    # 지정된 시간 후 자동으로 키가 삭제되도록 설정
                    await self.redis.setex(key, ttl, value)
                else:
                    await self.redis.set(key, value)
                
                return {"status": "success", "action": "set", "key": key}
                
            # 2. 값 조회 (GET)
            elif action == "get":
                value = await self.redis.get(key)
                # 키가 없으면 value는 None을 반환합니다.
                return {"status": "success", "action": "get", "key": key, "value": value}
                
            # 3. 키 삭제 (DELETE) - 로그아웃 시 Refresh Token 폐기에 사용
            elif action == "delete":
                result = await self.redis.delete(key)
                return {"status": "success", "action": "delete", "key": key, "deleted_count": result}
                
            # 4. 키 존재 여부 확인 (EXISTS)
            elif action == "exists":
                result = await self.redis.exists(key)
                return {"status": "success", "action": "exists", "key": key, "exists": bool(result)}
                
            else:
                return {"status": "error", "reason": f"Unsupported action: {action}"}
                
        except redis.RedisError as re:
            # Redis 관련 연결 오류, 타임아웃 등의 예외 처리
            print(f"[RedisManager] Redis Error: {str(re)}")
            return {"status": "error", "reason": f"Redis internal error: {str(re)}"}
        except Exception as e:
            # 기타 예기치 못한 파이썬 런타임 에러 처리
            print(f"[RedisManager] Unexpected Error: {str(e)}")
            return {"status": "error", "reason": f"Unexpected error: {str(e)}"}

    async def close(self):
        """서버가 Graceful Shutdown 될 때 커넥션 풀을 안전하게 닫기 위한 메서드"""
        print("[RedisManager] 커넥션 풀 종료 및 자원 반환")
        await self.redis.aclose()