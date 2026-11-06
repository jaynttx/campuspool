"""Tiny in-process WebSocket hub. Mutations call push() after commit; clients re-fetch on 'refresh'.

Limitation: connections live in this process only. Running several server workers needs a shared
broker (for example Redis pub/sub); see the README.
"""

import asyncio
import json
from collections.abc import Iterable

from fastapi import WebSocket


class Hub:
    def __init__(self) -> None:
        self.loop: asyncio.AbstractEventLoop | None = None
        self.conns: dict[int, set[WebSocket]] = {}

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop

    async def connect(self, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self.conns.setdefault(user_id, set()).add(ws)

    def disconnect(self, user_id: int, ws: WebSocket) -> None:
        group = self.conns.get(user_id)
        if group:
            group.discard(ws)
            if not group:
                self.conns.pop(user_id, None)

    async def _send(self, user_ids: list[int] | None, payload: dict) -> None:
        text = json.dumps(payload)
        targets = list(self.conns) if user_ids is None else user_ids
        for uid in targets:
            for ws in list(self.conns.get(uid, ())):
                try:
                    await ws.send_text(text)
                except Exception:
                    self.disconnect(uid, ws)

    def push(self, user_ids: Iterable[int], payload: dict) -> None:
        """Thread-safe: callable from sync endpoints."""
        if self.loop is not None:
            asyncio.run_coroutine_threadsafe(self._send(sorted(set(user_ids)), payload), self.loop)

    def push_all(self, payload: dict) -> None:
        if self.loop is not None:
            asyncio.run_coroutine_threadsafe(self._send(None, payload), self.loop)


hub = Hub()
