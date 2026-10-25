"""Exercise physical input -> HTTP -> WebSocket -> rendered virtual keys."""
import gc
import ast
import json
import socket
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
from pathlib import Path

import httpx
import uvicorn
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import main


def verify():
    with tempfile.TemporaryDirectory() as directory:
        main.DATA_DIR = Path(directory)
        main.SOUNDFONT_DIR = Path(directory) / "soundfonts"
        main.DATABASE_PATH = Path(directory) / "test.sqlite3"
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(main.app, log_level="error"))
        thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
        thread.start()
        try:
            deadline = time.monotonic() + 10
            while not server.started:
                if not thread.is_alive() or time.monotonic() > deadline:
                    raise RuntimeError("Test server did not start")
                time.sleep(0.01)
            base = f"http://127.0.0.1:{port}"
            device_code = ast.parse((main.PROJECT_DIR / "device" / "sticks3_buttons.py").read_text(encoding="utf-8"))
            transport_class = next(node for node in device_code.body if isinstance(node, ast.ClassDef) and node.name == "ButtonTransport")
            namespace = {"socket": socket, "json": json, "time": SimpleNamespace(ticks_diff=lambda a, b: a - b), "SERVER_IP": "127.0.0.1", "SERVER_PORT": port}
            exec(compile(ast.Module(body=[transport_class], type_ignores=[]), "device/transport", "exec"), namespace)
            transport = namespace["ButtonTransport"]()
            clock = lambda: int(time.monotonic() * 1000)
            transport.connect(clock())
            original_connection = transport.connection
            def send_mask(mask):
                transport.queue(mask)
                deadline = time.monotonic() + 1
                while transport.pending:
                    transport.pump(clock())
                    if time.monotonic() > deadline:
                        raise AssertionError("Persistent transport response timeout")
                    time.sleep(0.001)
            with httpx.Client(base_url=base) as client, sync_playwright() as playwright:
                for invalid in [-1, 16, True, "5", None]:
                    assert client.post("/api/device/input", json={"button_mask": invalid}).status_code == 400
                browser = playwright.chromium.launch(channel="msedge", headless=True)
                try:
                    page = browser.new_page()
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.goto(base + "/student")
                    page.wait_for_function("document.querySelector('#connection-pill').dataset.state === 'connected'")
                    page.keyboard.press("a")
                    page.keyboard.press("s")
                    page.keyboard.press("d")
                    page.keyboard.press("f")
                    assert page.locator("#combination-mask").inner_text() == "0000"
                    def virtual_button(pressed):
                        page.locator('[data-key-id="button-1"]').evaluate("""(button, pressed) => {
                          button.setPointerCapture = () => {};
                          button.dispatchEvent(new PointerEvent(pressed ? 'pointerdown' : 'pointerup', {pointerId:1, bubbles:true}));
                        }""", pressed)
                    for mask in [1, 2, 4, 8, 5, 15, 0]:
                        send_mask(mask)
                        page.wait_for_function("mask => document.querySelector('#combination-mask').textContent === mask.toString(2).padStart(4,'0')", arg=mask)
                        actual = page.locator('.arcade-button[aria-pressed="true"]').evaluate_all("buttons => buttons.map(button => button.dataset.keyId)")
                        assert actual == [f"button-{i + 1}" for i in range(4) if mask & (1 << i)]
                    # Releasing a physical key must not release the browser's own key.
                    virtual_button(True)
                    client.post("/api/device/input", json={"button_mask": 5})
                    page.wait_for_function("document.querySelector('#combination-mask').textContent === '0101'")
                    client.post("/api/device/input", json={"button_mask": 0})
                    page.wait_for_function("document.querySelector('#combination-mask').textContent === '0001'")
                    virtual_button(False)
                    page.wait_for_function("document.querySelector('#combination-mask').textContent === '0000'")
                    # A new browser receives the physical state without another edge.
                    client.post("/api/device/input", json={"button_mask": 8})
                    second = browser.new_page()
                    second.goto(base + "/student")
                    second.wait_for_function("document.querySelector('#combination-mask').textContent === '1000'")
                    # Local input is isolated, physical input is shared.
                    virtual_button(True)
                    page.wait_for_function("document.querySelector('#combination-mask').textContent === '1001'")
                    assert second.locator("#combination-mask").inner_text() == "1000"
                    virtual_button(False)
                    # Heartbeat silence releases the device; a new snapshot reconnects it.
                    client.post("/api/device/input", json={"button_mask": 5})
                    page.wait_for_function("document.querySelector('#combination-mask').textContent === '0101'")
                    page.wait_for_function("document.querySelector('#combination-mask').textContent === '0000'", timeout=4000)
                    second.wait_for_function("document.querySelector('#combination-mask').textContent === '0000'")
                    client.post("/api/device/input", json={"button_mask": 2})
                    page.wait_for_function("document.querySelector('#combination-mask').textContent === '0010'")
                    client.post("/api/device/input", json={"button_mask": 0})
                    # Multiple press/release edges can be sent before any response.
                    for mask in [1, 5, 0, 8, 0]:
                        transport.queue(mask)
                    deadline = time.monotonic() + 1
                    while transport.pending:
                        transport.pump(clock())
                        assert time.monotonic() < deadline
                        time.sleep(0.001)
                    assert transport.connection is original_connection
                    page.wait_for_function("document.querySelector('#combination-mask').textContent === '0000'")
                    assert not errors, errors
                finally:
                    browser.close()
        finally:
            if "transport" in locals():
                transport.close()
            server.should_exit = True
            thread.join(timeout=10)
            listener.close()
        gc.collect()
        print("PASS: physical masks, real HTTP/WebSocket/browser relay, local isolation, reconnect and timeout release")


if __name__ == "__main__":
    verify()
