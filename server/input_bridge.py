"""One classroom controller, merged with each browser's own virtual buttons."""
import asyncio
import time
from fastapi import WebSocket


class InputBridge:
    timeout_seconds = 1.5

    def __init__(self):
        self.device_mask = 0
        self.last_seen = 0.0
        self.clients = {}

    async def send(self, socket, message):
        client = self.clients.get(socket)
        if client is None:
            return
        async with client["lock"]:
            await socket.send_json(message)

    async def state(self, socket, event="device_state", key_id=None):
        client = self.clients.get(socket)
        if client is None:
            return
        mask = client["mask"] | self.device_mask
        await self.send(socket, {
            "type": "input_state", "last_event": event, "key_id": key_id,
            "button_mask": mask, "device_mask": self.device_mask,
            "held_buttons": [f"button-{i + 1}" for i in range(4) if mask & (1 << i)],
        })

    async def connect(self, socket: WebSocket):
        await socket.accept()
        self.clients[socket] = {"mask": 0, "lock": asyncio.Lock()}
        await self.state(socket)

    async def broadcast(self, event="device_state"):
        for socket in list(self.clients):
            try:
                await self.state(socket, event)
            except Exception:
                self.clients.pop(socket, None)

    async def device(self, mask):
        self.last_seen = time.monotonic()
        if mask != self.device_mask:
            self.device_mask = mask
            await self.broadcast()

    async def expire(self):
        if self.device_mask and time.monotonic() - self.last_seen > self.timeout_seconds:
            self.device_mask = 0
            await self.broadcast("device_timeout")

    async def watchdog(self):
        while True:
            await asyncio.sleep(0.25)
            await self.expire()
