from fastapi import WebSocket
from typing import Dict, List
import json
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # Map agent_id -> List of active WebSocket connections
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, agent_id: int):
        await websocket.accept()
        if agent_id not in self.active_connections:
            self.active_connections[agent_id] = []
        self.active_connections[agent_id].append(websocket)
        logger.info(f"WebSocket client connected to agent {agent_id}")

    def disconnect(self, websocket: WebSocket, agent_id: int):
        if agent_id in self.active_connections:
            if websocket in self.active_connections[agent_id]:
                self.active_connections[agent_id].remove(websocket)
            if not self.active_connections[agent_id]:
                del self.active_connections[agent_id]
        logger.info(f"WebSocket client disconnected from agent {agent_id}")

    async def broadcast(self, agent_id: int, message: dict):
        if agent_id not in self.active_connections:
            return
        
        dead_connections = []
        json_payload = json.dumps(message, default=str)

        for connection in self.active_connections[agent_id]:
            try:
                await connection.send_text(json_payload)
            except Exception as e:
                logger.warning(f"Error broadcasting to WS client: {e}")
                dead_connections.append(connection)

        for conn in dead_connections:
            self.disconnect(conn, agent_id)

ws_manager = ConnectionManager()
