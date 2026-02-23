#!/usr/bin/env python3
import asyncio
import json
import sys
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

try:
    import websockets
except ImportError as exc:
    raise SystemExit(
        "Missing dependency: websockets. Install with: pip install -r requirements.txt"
    ) from exc

Command = str
JsonObject = Dict[str, Any]


@dataclass
class GlobalOptions:
    port: int = 8765
    timeout_ms: int = 70000
    session_id: Optional[str] = None
    pretty: bool = False


@dataclass
class ParsedArgs:
    command: Command
    options: GlobalOptions
    url: Optional[str]
    focus: bool
    tab_id: Optional[int]
    tool_name: Optional[str]
    tool_args: JsonObject


def parse_bool(value: str, flag: str) -> bool:
    if value == "true":
        return True
    if value == "false":
        return False
    raise ValueError(f"{flag} must be true or false")


def parse_int(value: str, flag: str) -> int:
    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(f"{flag} must be an integer") from exc


def require_value(argv: List[str], index: int, flag: str) -> str:
    if index + 1 >= len(argv):
        raise ValueError(f"{flag} requires a value")
    return argv[index + 1]


def parse_args(argv: List[str]) -> ParsedArgs:
    options = GlobalOptions()
    command: Optional[Command] = None
    url: Optional[str] = None
    focus = True
    tab_id: Optional[int] = None
    tool_name: Optional[str] = None
    tool_args: JsonObject = {}

    i = 0
    while i < len(argv):
        token = argv[i]

        if token.startswith("--"):
            if token == "--pretty":
                options.pretty = True
                i += 1
                continue

            value = require_value(argv, i, token)
            if token == "--port":
                options.port = parse_int(value, token)
            elif token == "--timeout-ms":
                options.timeout_ms = parse_int(value, token)
            elif token == "--session-id":
                options.session_id = value
            elif token == "--url":
                url = value
            elif token == "--focus":
                focus = parse_bool(value, token)
            elif token == "--tab-id":
                tab_id = parse_int(value, token)
            elif token == "--tool-name":
                tool_name = value
            elif token == "--args-json":
                try:
                    parsed = json.loads(value)
                except json.JSONDecodeError as exc:
                    raise ValueError("--args-json must be valid JSON") from exc
                if not isinstance(parsed, dict):
                    raise ValueError("--args-json must be a JSON object")
                tool_args = parsed
            else:
                raise ValueError(f"Unknown flag: {token}")

            i += 2
            continue

        if command is None:
            if token in {"list-tabs", "open-tab", "discover-tools", "call-tool"}:
                command = token
            else:
                raise ValueError(f"Unknown command: {token}")
            i += 1
            continue

        raise ValueError(f"Unexpected positional argument: {token}")

    if command is None:
        raise ValueError(
            "Missing command. Use one of: list-tabs, open-tab, discover-tools, call-tool"
        )

    if options.port < 8765 or options.port > 8785:
        raise ValueError("--port must be in range 8765-8785")

    if options.timeout_ms <= 0:
        raise ValueError("--timeout-ms must be > 0")

    if command == "open-tab" and not url:
        raise ValueError("open-tab requires --url <url>")

    if command in {"discover-tools", "call-tool"} and tab_id is None:
        raise ValueError(f"{command} requires --tab-id <id>")

    if command == "call-tool" and not tool_name:
        raise ValueError("call-tool requires --tool-name <name>")

    return ParsedArgs(
        command=command,
        options=options,
        url=url,
        focus=focus,
        tab_id=tab_id,
        tool_name=tool_name,
        tool_args=tool_args,
    )


def merge_session_id(payload: JsonObject, session_id: Optional[str]) -> JsonObject:
    if session_id is None:
        return payload
    merged = dict(payload)
    merged["sessionId"] = session_id
    return merged


class Harness:
    def __init__(self, options: GlobalOptions):
        self.options = options
        self.server = None
        self.socket = None
        self.connection_future: Optional[asyncio.Future[None]] = None
        self.connect_future: Optional[asyncio.Future[JsonObject]] = None
        self.pending_calls: Dict[str, asyncio.Future[Any]] = {}
        self.pending_requests: Dict[str, asyncio.Future[JsonObject]] = {}
        self.tabs: Dict[int, JsonObject] = {}
        self.browser: Optional[JsonObject] = None

    @property
    def timeout_seconds(self) -> float:
        return self.options.timeout_ms / 1000

    async def start(self) -> None:
        self.connection_future = asyncio.get_running_loop().create_future()
        try:
            self.server = await websockets.serve(
                self._handle_connection, "localhost", self.options.port
            )
        except OSError as exc:
            if exc.errno in {48, 98, 10048}:
                raise RuntimeError(
                    f"Port {self.options.port} is already in use. Choose another port in the allowed range 8765-8785."
                ) from exc
            raise
        await asyncio.wait_for(self.connection_future, timeout=self.timeout_seconds)

    async def _handle_connection(self, websocket) -> None:
        if self.socket is not None:
            await websocket.close(code=1000, reason="Already connected")
            return

        self.socket = websocket
        if self.connection_future and not self.connection_future.done():
            self.connection_future.set_result(None)

        try:
            async for raw in websocket:
                if isinstance(raw, bytes):
                    text = raw.decode("utf-8", errors="ignore")
                else:
                    text = raw
                await self._handle_message(text)
        except Exception:
            pass
        finally:
            if self.socket is websocket:
                self.socket = None
                self._reject_all(RuntimeError("Extension disconnected"))

    async def _handle_message(self, raw: str) -> None:
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            return

        if not isinstance(message, dict):
            return

        msg_type = message.get("type")
        if not isinstance(msg_type, str):
            return

        if msg_type == "ping":
            await self._safe_send({"type": "pong"})
            return

        if msg_type == "connected":
            browser = message.get("browser")
            tabs = message.get("tabs")
            if isinstance(browser, dict):
                self.browser = browser
            self.tabs.clear()
            if isinstance(tabs, list):
                for tab in tabs:
                    if isinstance(tab, dict) and isinstance(tab.get("id"), int):
                        self.tabs[tab["id"]] = tab

            if self.connect_future and not self.connect_future.done():
                self.connect_future.set_result(
                    {
                        "browser": self.browser or {},
                        "tabs": self.list_tabs(),
                    }
                )
            return

        if msg_type == "tabCreated":
            tab = message.get("tab")
            if isinstance(tab, dict) and isinstance(tab.get("id"), int):
                self.tabs[tab["id"]] = tab
            request_id = message.get("requestId")
            if isinstance(request_id, str):
                future = self.pending_requests.get(request_id)
                if future and not future.done():
                    future.set_result(tab if isinstance(tab, dict) else {})
            return

        if msg_type == "tabFocused":
            tab_id = message.get("tabId")
            if isinstance(tab_id, int):
                existing = self.tabs.get(tab_id, {"id": tab_id})
                tools = message.get("tools")
                merged = dict(existing)
                if isinstance(tools, list):
                    merged["tools"] = tools
                self.tabs[tab_id] = merged

            request_id = message.get("requestId")
            if isinstance(request_id, str):
                future = self.pending_requests.get(request_id)
                if future and not future.done():
                    resolved_tab = self.tabs.get(tab_id, {"id": tab_id}) if isinstance(tab_id, int) else {}
                    future.set_result(resolved_tab)
            return

        if msg_type == "tabUpdated":
            tab = message.get("tab")
            if isinstance(tab, dict) and isinstance(tab.get("id"), int):
                self.tabs[tab["id"]] = tab
            return

        if msg_type == "tabClosed":
            tab_id = message.get("tabId")
            if isinstance(tab_id, int):
                self.tabs.pop(tab_id, None)
            return

        if msg_type == "toolsChanged":
            tab_id = message.get("tabId")
            tools = message.get("tools")
            if isinstance(tab_id, int):
                existing = self.tabs.get(tab_id, {"id": tab_id})
                merged = dict(existing)
                merged["tools"] = tools if isinstance(tools, list) else []
                self.tabs[tab_id] = merged
            return

        if msg_type == "toolsDiscovered":
            call_id = message.get("callId")
            if isinstance(call_id, str):
                future = self.pending_calls.get(call_id)
                if future and not future.done():
                    future.set_result(
                        {
                            "tabId": message.get("tabId"),
                            "tools": message.get("tools") if isinstance(message.get("tools"), list) else [],
                        }
                    )
            return

        if msg_type == "toolResult":
            call_id = message.get("callId")
            if isinstance(call_id, str):
                future = self.pending_calls.get(call_id)
                if future and not future.done():
                    error = message.get("error")
                    if isinstance(error, str):
                        future.set_exception(RuntimeError(error))
                    else:
                        future.set_result(message.get("result"))
            return

        if msg_type == "disconnected":
            self._reject_all(RuntimeError("Extension sent disconnected event"))

    async def ensure_connected_snapshot(self) -> JsonObject:
        if self.browser is not None:
            return {"browser": self.browser, "tabs": self.list_tabs()}

        if self.socket is None:
            raise RuntimeError("Extension socket is not connected")

        if self.connect_future is None:
            self.connect_future = asyncio.get_running_loop().create_future()
            await self._send(merge_session_id({"type": "connect"}, self.options.session_id))

        try:
            return await asyncio.wait_for(self.connect_future, timeout=self.timeout_seconds)
        except asyncio.TimeoutError as exc:
            self.connect_future = None
            raise RuntimeError(f"connect timed out after {self.options.timeout_ms}ms") from exc
        finally:
            if self.connect_future and self.connect_future.done():
                self.connect_future = None

    def list_tabs(self) -> List[JsonObject]:
        return list(self.tabs.values())

    async def open_tab(self, url: str, focus: bool) -> JsonObject:
        await self.ensure_connected_snapshot()

        request_id = f"request_{uuid.uuid4()}"
        future = asyncio.get_running_loop().create_future()
        self.pending_requests[request_id] = future

        await self._send(
            merge_session_id(
                {
                    "type": "openTab",
                    "url": url,
                    "focus": focus,
                    "requestId": request_id,
                },
                self.options.session_id,
            )
        )

        try:
            return await asyncio.wait_for(future, timeout=self.timeout_seconds)
        except asyncio.TimeoutError as exc:
            raise RuntimeError(f"openTab timed out after {self.options.timeout_ms}ms") from exc
        finally:
            self.pending_requests.pop(request_id, None)

    async def discover_tools(self, tab_id: int) -> JsonObject:
        await self.ensure_connected_snapshot()

        call_id = f"call_{uuid.uuid4()}"
        future = asyncio.get_running_loop().create_future()
        self.pending_calls[call_id] = future

        await self._send(
            merge_session_id(
                {
                    "type": "discoverTools",
                    "callId": call_id,
                    "tabId": tab_id,
                },
                self.options.session_id,
            )
        )

        try:
            result = await asyncio.wait_for(future, timeout=self.timeout_seconds)
            return result if isinstance(result, dict) else {"tabId": tab_id, "tools": []}
        except asyncio.TimeoutError as exc:
            raise RuntimeError(f"discoverTools timed out after {self.options.timeout_ms}ms") from exc
        finally:
            self.pending_calls.pop(call_id, None)

    async def call_tool(self, tab_id: int, tool_name: str, args: JsonObject) -> Any:
        await self.ensure_connected_snapshot()

        call_id = f"call_{uuid.uuid4()}"
        future = asyncio.get_running_loop().create_future()
        self.pending_calls[call_id] = future

        await self._send(
            merge_session_id(
                {
                    "type": "callTool",
                    "callId": call_id,
                    "tabId": tab_id,
                    "toolName": tool_name,
                    "args": args,
                },
                self.options.session_id,
            )
        )

        try:
            return await asyncio.wait_for(future, timeout=self.timeout_seconds)
        except asyncio.TimeoutError as exc:
            raise RuntimeError(f"callTool timed out after {self.options.timeout_ms}ms") from exc
        finally:
            self.pending_calls.pop(call_id, None)

    async def _send(self, payload: JsonObject) -> None:
        if self.socket is None:
            raise RuntimeError("Extension socket is not connected")
        await self.socket.send(json.dumps(payload))

    async def _safe_send(self, payload: JsonObject) -> None:
        try:
            if self.socket is not None:
                await self.socket.send(json.dumps(payload))
        except Exception:
            pass

    def _reject_all(self, error: Exception) -> None:
        if self.connect_future and not self.connect_future.done():
            self.connect_future.set_exception(error)

        for key, future in list(self.pending_calls.items()):
            if not future.done():
                future.set_exception(error)
            self.pending_calls.pop(key, None)

        for key, future in list(self.pending_requests.items()):
            if not future.done():
                future.set_exception(error)
            self.pending_requests.pop(key, None)

        if self.connection_future and not self.connection_future.done():
            self.connection_future.set_exception(error)

    async def close(self) -> None:
        self._reject_all(RuntimeError("Harness shutting down"))

        if self.socket is not None:
            try:
                await self.socket.close()
            except Exception:
                pass
            self.socket = None

        if self.server is not None:
            self.server.close()
            await self.server.wait_closed()
            self.server = None


def write_json(payload: JsonObject, pretty: bool) -> None:
    if pretty:
        print(json.dumps(payload, indent=2))
    else:
        print(json.dumps(payload, separators=(",", ":")))


async def run(argv: List[str]) -> int:
    try:
        parsed = parse_args(argv)
    except Exception as error:
        write_json({"ok": False, "error": str(error)}, True)
        return 1

    harness = Harness(parsed.options)

    try:
        await harness.start()
        snapshot = await harness.ensure_connected_snapshot()

        if parsed.command == "list-tabs":
            write_json(
                {
                    "ok": True,
                    "port": parsed.options.port,
                    "browser": snapshot.get("browser"),
                    "tabs": harness.list_tabs(),
                },
                parsed.options.pretty,
            )
            return 0

        if parsed.command == "open-tab":
            tab = await harness.open_tab(parsed.url or "", parsed.focus)
            write_json({"ok": True, "tab": tab}, parsed.options.pretty)
            return 0

        if parsed.command == "discover-tools":
            discovered = await harness.discover_tools(parsed.tab_id or 0)
            write_json(
                {
                    "ok": True,
                    "tabId": parsed.tab_id,
                    "tools": discovered.get("tools", []),
                },
                parsed.options.pretty,
            )
            return 0

        if parsed.command == "call-tool":
            result = await harness.call_tool(
                parsed.tab_id or 0,
                parsed.tool_name or "",
                parsed.tool_args,
            )
            write_json(
                {
                    "ok": True,
                    "tabId": parsed.tab_id,
                    "toolName": parsed.tool_name,
                    "result": result,
                },
                parsed.options.pretty,
            )
            return 0

        write_json({"ok": False, "error": f"Unknown command: {parsed.command}"}, parsed.options.pretty)
        return 1
    except Exception as error:
        write_json({"ok": False, "error": str(error)}, parsed.options.pretty)
        return 1
    finally:
        await harness.close()


def main() -> None:
    exit_code = asyncio.run(run(sys.argv[1:]))
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
