"""UiFlow2 StickS3: copy this whole file into the Python editor and Run Once.
Change SERVER_IP to the PC's LAN IPv4 address. Keep the existing Wi-Fi setup.
"""
import M5
from M5 import Widgets
from machine import Pin
import network
import socket
import time
import json

try:
    import M5Things
except ImportError:
    M5Things = None

SERVER_IP = "192.168.0.235"  # PC LAN IPv4; update if it changes
SERVER_PORT = 8000
GPIO_NUMBERS = [3, 2, 4, 5]
DEBOUNCE_MS = 5
HEARTBEAT_MS = 250
RETRY_MS = 750

pins = []
stable = []
candidates = []
changed_at = []
labels = []
status = None
mask_label = None
wlan = None
last_mask = None
last_attempt = None
web_ok = False
last_drawn = None
access_labels = []
last_access_check = None
last_access_text = None
transport = None
last_display = None
last_status = None
battery_label = None
last_battery_check = None
last_battery_text = None


def update_battery(now):
    global last_battery_check, last_battery_text
    if last_battery_check is not None and time.ticks_diff(now, last_battery_check) < 10000:
        return
    last_battery_check = now
    try:
        level = int(M5.Power.getBatteryLevel())
        text = "BAT: {}%".format(level) if 0 <= level <= 100 else "BAT: --"
    except Exception:
        text = "BAT: --"
    try:
        if M5.Power.isCharging():
            text += " CHG"
    except Exception:
        pass
    if text != last_battery_text:
        battery_label.setText(text)
        last_battery_text = text


def update_access_code(now):
    global last_access_check, last_access_text
    if last_access_check is not None and time.ticks_diff(now, last_access_check) < 1000:
        return
    last_access_check = now
    if M5Things is None:
        text = "UNAVAILABLE"
    else:
        try:
            text = M5Things.accesscode() or "WAIT..."
            if isinstance(text, bytes):
                text = text.decode()
            text = str(text).strip() or "WAIT..."
        except Exception:
            text = "WAIT..."
    if text != last_access_text:
        # Short lines keep the code inside the 135px-wide display.
        access_labels[0].setText(text[:12])
        access_labels[1].setText(text[12:24])
        last_access_text = text


class ButtonTransport:
    """Persistent HTTP/1.1, nonblocking writes/reads; never wait for an ACK per key."""
    def __init__(self):
        self.connection = None
        self.tx = b""
        self.rx = b""
        self.pending = 0
        self.web_ok = False
        self.last_ack = 0
        self.awaiting_since = None

    def close(self):
        if self.connection is not None:
            self.connection.close()
        self.connection = None
        self.tx = b""
        self.rx = b""
        self.pending = 0
        self.web_ok = False
        self.awaiting_since = None

    def connect(self, now):
        self.close()
        self.connection = socket.socket()
        self.connection.settimeout(0.15)
        self.connection.connect((SERVER_IP, SERVER_PORT))
        try:
            self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except (AttributeError, OSError):
            pass
        self.connection.setblocking(False)
        self.last_ack = now

    def queue(self, mask):
        if self.pending >= 16:
            raise OSError("Input connection stalled")
        body = json.dumps({"button_mask": mask}).encode()
        self.tx += (
            "POST /api/device/input HTTP/1.1\r\n"
            "Host: {}:{}\r\n"
            "Content-Type: application/json\r\n"
            "Content-Length: {}\r\n"
            "Connection: keep-alive\r\n\r\n"
        ).format(SERVER_IP, SERVER_PORT, len(body)).encode() + body
        self.pending += 1

    def pump(self, now):
        if self.pending and self.awaiting_since is None:
            self.awaiting_since = now
        if self.tx:
            try:
                written = self.connection.send(self.tx)
                if written == 0:
                    raise OSError("Connection closed")
                self.tx = self.tx[written:]
            except OSError as error:
                if error.args[0] not in (11, 35, 10035, 115):
                    raise
        # Limit work per GPIO scan, even when many replies arrive together.
        for _ in range(4):
            try:
                chunk = self.connection.recv(1024)
            except OSError as error:
                if error.args[0] in (11, 35, 10035, 115):
                    break
                raise
            if not chunk:
                raise OSError("Connection closed")
            self.rx += chunk
        while b"\r\n\r\n" in self.rx:
            header, body = self.rx.split(b"\r\n\r\n", 1)
            if not header.startswith(b"HTTP/1.1 200 "):
                raise OSError("HTTP error")
            length = None
            for line in header.split(b"\r\n"):
                if line.lower().startswith(b"content-length:"):
                    length = int(line.split(b":", 1)[1].strip())
            if length is None or length > 1024:
                raise OSError("Invalid HTTP reply")
            if len(body) < length:
                break
            self.rx = body[length:]
            self.pending -= 1
            self.last_ack = now
            self.awaiting_since = now if self.pending else None
            self.web_ok = True
        if len(self.rx) > 8192 or (self.pending and time.ticks_diff(now, self.awaiting_since) > 1000):
            raise OSError("Server reply timeout")


def setup():
    global status, mask_label, wlan, transport, battery_label
    M5.begin()
    Widgets.fillScreen(0x000000)
    Widgets.Label("WEB BUTTONS", 5, 5, 1.0, 0xFFFFFF, 0x000000, Widgets.FONTS.DejaVu12)
    status = Widgets.Label("WAIT", 5, 27, 1.0, 0x00FF88, 0x000000, Widgets.FONTS.DejaVu12)
    battery_label = Widgets.Label("BAT: --", 5, 45, 1.0, 0xFFFFFF, 0x000000, Widgets.FONTS.DejaVu12)
    update_battery(time.ticks_ms())
    now = time.ticks_ms()
    for index, gpio in enumerate(GPIO_NUMBERS):
        pin = Pin(gpio, Pin.IN, Pin.PULL_UP)
        pressed = pin.value() == 0
        pins.append(pin)
        stable.append(pressed)
        candidates.append(pressed)
        changed_at.append(now)
        labels.append(Widgets.Label("", 5, 65 + index * 25, 1.0, 0xFFFFFF, 0x000000, Widgets.FONTS.DejaVu12))
    mask_label = Widgets.Label("MASK: 0", 5, 174, 1.0, 0xFFFFFF, 0x000000, Widgets.FONTS.DejaVu12)
    Widgets.Label("ACCESS CODE", 5, 194, 1.0, 0xAAAAAA, 0x000000, Widgets.FONTS.DejaVu12)
    access_labels.append(Widgets.Label("WAIT...", 5, 209, 1.0, 0xFFFF66, 0x000000, Widgets.FONTS.DejaVu12))
    access_labels.append(Widgets.Label("", 5, 224, 1.0, 0xFFFF66, 0x000000, Widgets.FONTS.DejaVu12))
    update_access_code(time.ticks_ms())
    # Reuse UiFlow2's existing Wi-Fi connection; do not reset or reconfigure it.
    wlan = network.WLAN(network.STA_IF)
    try:
        wlan.config(pm=network.WLAN.PM_NONE)
    except (AttributeError, OSError, ValueError):
        pass  # Some firmware versions do not expose power-management settings.
    transport = ButtonTransport()


def loop():
    global last_mask, last_attempt, web_ok, last_drawn, last_display, last_status
    M5.update()
    now = time.ticks_ms()
    for index, pin in enumerate(pins):
        pressed = pin.value() == 0
        if pressed != candidates[index]:
            candidates[index] = pressed
            changed_at[index] = now
        if time.ticks_diff(now, changed_at[index]) >= DEBOUNCE_MS:
            stable[index] = candidates[index]

    mask = 0
    for index, pressed in enumerate(stable):
        if pressed:
            mask |= 1 << index
    if mask != last_drawn and (last_display is None or time.ticks_diff(now, last_display) >= 33):
        for index, pressed in enumerate(stable):
            labels[index].setText("B{} G{}: {}".format(index + 1, GPIO_NUMBERS[index], "DOWN" if pressed else "UP"))
        mask_label.setText("MASK: {}".format(mask))
        last_drawn = mask
        last_display = now

    if wlan.isconnected():
        try:
            if transport.connection is None:
                if last_attempt is None or time.ticks_diff(now, last_attempt) >= RETRY_MS:
                    last_attempt = now
                    transport.connect(now)
                    last_mask = None
            if transport.connection is not None:
                if mask != last_mask or time.ticks_diff(now, last_attempt) >= HEARTBEAT_MS:
                    transport.queue(mask)
                    last_mask = mask
                    last_attempt = now
                transport.pump(now)
        except Exception as error:
            transport.close()
            last_attempt = now
            print("WEB ERROR:", error)
        text = "WEB OK" if transport.web_ok else "WEB NG"
    else:
        transport.close()
        text = "WIFI NG"
    if text != last_status:
        status.setText(text)
        last_status = text
    update_access_code(now)
    update_battery(now)
    time.sleep_ms(2)


if __name__ == "__main__":
    setup()
    while True:
        loop()
