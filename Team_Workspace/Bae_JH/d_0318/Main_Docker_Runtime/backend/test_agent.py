import os
import asyncio

from dotenv import load_dotenv
from lib.node.llm.gpt_node import GPTProcessor
from lib.node.base.node import Node
from lib.node.base.message import create_message

# .env 파일 경로가 facade.py와 다르다면 맞춰서 로드해주세요
load_dotenv() 

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
gpt_node = Node(
    node_id="gpt", 
    base=GPTProcessor(
        persona="마크다운, 이모티콘, 이모지를 절대 사용하지 말 것.\n",
        api_key=OPENAI_API_KEY
    )
)

async def run_node_interaction(target_node, input_data):
    """
    노드에 데이터를 넣고, 결과가 나올 때까지 기다려 데이터를 반환하는 핵심 함수
    (StreamChunk 분할 조립 로직 추가)
    """
    msg = create_message(
        source="facade_api",
        kind="data",
        data=input_data,
        target=target_node.node_id
    )

    await target_node.iface.from_router_q.put(msg)

    full_response = ""
    is_done = False

    # LLM 응답이 완전히 끝날 때까지 틱(tick)과 큐(Queue) 확인을 반복합니다.
    while not is_done:
        await target_node.tick()

        while not target_node.iface.to_router_q.empty():
            result_msg = await target_node.iface.to_router_q.get()

            # 1. 응답이 길어 StreamChunk 객체로 여러 번 나뉘어 들어오는 경우
            if type(result_msg.data).__name__ == "StreamChunk":
                chunk = result_msg.data
                full_response += chunk.data  # 분할된 텍스트를 이어 붙임
                
                if chunk.is_end:  # 마지막 청크인 경우 루프 종료
                    is_done = True
            
            # 2. 응답이 짧아 일반 문자열(str)로 한 번에 들어오는 경우
            elif isinstance(result_msg.data, str):
                full_response = result_msg.data
                is_done = True
            
            # 3. 노드 인터페이스에서 에러를 뱉은 경우
            elif result_msg.kind == "error":
                full_response = f"Error: {result_msg.data}"
                is_done = True

        # 비동기 GPT API 호출이 처리될 시간을 주기 위해 짧게 대기합니다.
        if not is_done:
            await asyncio.sleep(0.05)

    return full_response


class TestNode:
    def __init__(self):
        self.node = gpt_node

    async def ask(self, message: str):
        result = await run_node_interaction(self.node, message)
        return result