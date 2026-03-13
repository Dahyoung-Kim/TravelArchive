import asyncio
import os
import json

# 프로젝트 경로에 맞게 임포트 하세요
# from src.core.router import Router
from src.node.base.node import Node
from src.node.base.message import create_message

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, relationship
import datetime

# 앞서 만든 매니저와 노드 임포트 (파일 이름/경로에 맞게 수정 필요)
from src.node.memory.db_manager import DBManager
from src.node.memory.DB_node import DBProcessorNode

from dotenv import load_dotenv
load_dotenv()

# ==========================================
# 1. DB 테이블 모델링 (Base만 여기서 정의)
# ==========================================
Base = declarative_base()

class Session(Base):
    __tablename__ = "sessions"
    id = Column(String, primary_key=True, index=True)
    title = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.now)
    # 1:N 관계 설정
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sessions.id"))
    role = Column(String)
    content = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.now)
    # N:1 관계 설정
    session = relationship("Session", back_populates="messages")


# ==========================================
# 2. 노드 직접 테스트용 헬퍼 함수
# ==========================================
async def test_crud_node(db_node: Node, test_name: str, payload: dict):
    print(f"\n [TEST: {test_name}] 요청 전송 중...")
    
    msg = create_message(
        source="test_script", 
        kind="data", 
        data=json.dumps(payload), 
        target=db_node.node_id
    )
    
    await db_node.iface.from_router_q.put(msg)
    
    await db_node.tick()
    await db_node.tick()
    
    if not db_node.iface.to_router_q.empty():
        result_msg = await db_node.iface.to_router_q.get()
        
        # 여기가 핵심입니다! 딕셔너리면 그냥 쓰고, 문자열이면 파싱합니다.
        if isinstance(result_msg.data, dict):
            result_dict = result_msg.data
        elif isinstance(result_msg.data, str):
            try:
                result_dict = json.loads(result_msg.data)
            except json.JSONDecodeError:
                result_dict = {"raw_string": result_msg.data}
        else:
            result_dict = {"unknown_type": str(result_msg.data)}
            
        print(f" [결과] {json.dumps(result_dict, indent=2, ensure_ascii=False)}")
    else:
        print(" [결과] 응답이 없습니다 (에러 발생 가능성)")


# ==========================================
# 3. 메인 실행 함수
# ==========================================
async def main():
    print("=== DB 중앙 매니저 & 노드 테스트 시작 ===")

    # 1. DB 매니저 세팅 및 의존성 주입
    manager = DBManager(db_url="sqlite:///./test_chat.db")
    manager.register_model("Session", Session)
    manager.register_model("Message", Message)
    manager.create_tables(Base.metadata)

    # 2. DB 노드 생성 및 시작
    base_processor = DBProcessorNode(db_manager_instance=manager)
    db_node = Node(node_id="db_node_01", base=base_processor)
    await db_node.start()
    print("[SYSTEM] DB 노드 구동 완료.\n")

    test_session_id = "session_test_999"

    # --- [CRUD 테스트 1] CREATE : 새 세션 만들기 ---
    await test_crud_node(db_node, "CREATE Session", {
        "action": "CREATE",
        "model": "Session",
        "data": {
            "id": test_session_id,
            "title": "첫 번째 테스트 대화"
        }
    })

    # --- [CRUD 테스트 2] CREATE : 메시지 추가 ---
    await test_crud_node(db_node, "CREATE Message (User)", {
        "action": "CREATE",
        "model": "Message",
        "data": {
            "session_id": test_session_id,
            "role": "user",
            "content": "안녕하세요! 테스트 메시지입니다."
        }
    })

    # --- [CRUD 테스트 3] READ : 방금 넣은 메시지 조회 ---
    await test_crud_node(db_node, "READ Message", {
        "action": "READ",
        "model": "Message",
        "filters": {"session_id": test_session_id}
    })

    # --- [CRUD 테스트 4] UPDATE : 세션 제목 수정 ---
    await test_crud_node(db_node, "UPDATE Session Title", {
        "action": "UPDATE",
        "model": "Session",
        "filters": {"id": test_session_id},
        "data": {"title": "수정된 테스트 대화 이름"}
    })

    # --- [CRUD 테스트 5] DELETE : 세션 삭제 ---
    await test_crud_node(db_node, "DELETE Session", {
        "action": "DELETE",
        "model": "Session",
        "filters": {"id": test_session_id}
    })

    # (참고) DELETE 후 다시 READ를 해보면 빈 리스트([])가 나오는 것이 정상입니다.
    await test_crud_node(db_node, "READ Message (삭제 확인용)", {
        "action": "READ",
        "model": "Message",
        "filters": {"session_id": test_session_id}
    })

    await db_node.stop()
    print("\n=== ✨ DB 중앙 매니저 & 노드 테스트 완료 ===")

if __name__ == "__main__":
    asyncio.run(main())