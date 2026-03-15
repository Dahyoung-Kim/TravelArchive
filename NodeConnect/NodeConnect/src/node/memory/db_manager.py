import asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import datetime

class DBManager:
    _instance = None

    def __new__(cls, db_url="sqlite:///./default.db"):
        if cls._instance is None:
            cls._instance = super(DBManager, cls).__new__(cls)
            cls._instance._init_db(db_url)
        return cls._instance

    def _init_db(self, db_url):
        print(f"[DB Manager] 엔진 가동 (URL: {db_url})")
        self.engine = create_engine(db_url, connect_args={"check_same_thread": False})
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self._lock = asyncio.Lock()
        
        # 동적으로 테이블(모델)을 주입받을 빈 사전
        self._registry = {}

    # ==========================================
    # 외부 주입(Injection) 인터페이스
    # ==========================================
    def register_model(self, model_name: str, model_class):
        """외부에서 사용할 테이블(모델)을 매니저에게 가르쳐줍니다."""
        self._registry[model_name] = model_class
        print(f"[DB Manager] 모델 등록 완료: {model_name}")

    def create_tables(self, base_metadata):
        """외부에서 주입받은 뼈대(Base)를 바탕으로 실제 물리적 테이블을 생성합니다."""
        base_metadata.create_all(bind=self.engine)
        print("[DB Manager] 데이터베이스 테이블 물리적 생성 완료")

    # ==========================================
    # 실행 로직
    # ==========================================
    async def execute(self, payload: dict) -> dict:
        async with self._lock:
            return await asyncio.to_thread(self._sync_execute, payload)

    def _sync_execute(self, payload: dict) -> dict:
        action = payload.get("action")
        model_name = payload.get("model")
        data = payload.get("data", {})
        filters = payload.get("filters", {})

        # 주입받은 _registry 사전에서 클래스를 찾습니다.
        model_class = self._registry.get(model_name)
        if not model_class:
            return {"status": "error", "reason": f"등록되지 않은 모델: {model_name}"}

        db = self.SessionLocal()
        try:
            result_data = None

            # 1. CREATE (데이터 생성)
            if action == "CREATE":
                new_record = model_class(**data)
                db.add(new_record)
                db.commit()
                db.refresh(new_record)
                result_data = self._to_dict(new_record)

            # 2. READ (데이터 조회)
            elif action == "READ":
                query = db.query(model_class)
                for key, value in filters.items():
                    query = query.filter(getattr(model_class, key) == value)
                records = query.all()
                result_data = [self._to_dict(rec) for rec in records]

            # 3. UPDATE (데이터 수정)
            elif action == "UPDATE":
                query = db.query(model_class)
                for key, value in filters.items():
                    query = query.filter(getattr(model_class, key) == value)
                
                record = query.first()
                if record:
                    for key, value in data.items():
                        setattr(record, key, value)
                    db.commit()
                    db.refresh(record)
                    result_data = self._to_dict(record)
                else:
                    return {"status": "error", "reason": "업데이트할 대상을 찾지 못했습니다."}

            # 4. DELETE (데이터 삭제 - ORM 연쇄 삭제 작동 버전)
            elif action == "DELETE":
                query = db.query(model_class)
                for key, value in filters.items():
                    query = query.filter(getattr(model_class, key) == value)
                
                records_to_delete = query.all()
                deleted_count = len(records_to_delete)
                
                for record in records_to_delete:
                    db.delete(record)
                    
                db.commit()
                result_data = {"deleted_count": deleted_count}

            else:
                return {"status": "error", "reason": f"지원하지 않는 액션: {action}"}

            return {"status": "success", "data": result_data}

        except Exception as e:
            db.rollback()
            return {"status": "error", "reason": str(e)}
        finally:
            db.close()

    def _to_dict(self, obj):
        if not obj: return None
        result = {}
        for c in obj.__table__.columns:
            value = getattr(obj, c.name)
            
            if isinstance(value, datetime.datetime):
                result[c.name] = value.isoformat()
            else:
                result[c.name] = value
                
        return result

# 여기서 바로 인스턴스를 만들지 않고, 메인 시스템에서 초기화하도록 둡니다.