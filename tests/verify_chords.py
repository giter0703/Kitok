"""Chord persistence, teacher editing and browser note-on/note-off regression."""
import gc
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright
from server import main


def verify():
    with tempfile.TemporaryDirectory() as directory:
        main.DATA_DIR = Path(directory)
        main.SOUNDFONT_DIR = Path(directory) / "soundfonts"
        main.DATABASE_PATH = Path(directory) / "test.sqlite3"
        with TestClient(main.app) as client:
            payload = {"display_name": "Chord regression", "fingerings": [
                {"solfege": "도", "pitch_name": "C4", "buttons": [1]},
                {"solfege": "도·미", "pitch_names": ["C4", "E4"], "buttons": [1, 3]},
            ]}
            response = client.post("/api/teacher/instruments", json=payload)
            assert response.status_code == 200, response.text
            instrument_id = response.json()["id"]
            main.initialize_database()
            stored = client.get("/api/instruments").json()[0]["fingerings"]
            assert stored[0]["pitch_names"] == ["C4"]
            assert stored[1]["pitch_names"] == ["C4", "E4"]
            for pitches in [[], ["C4"] * 5, ["C4", "C4"], ["C#4", "Db4"], ["invalid"]]:
                bad = dict(payload, fingerings=[dict(payload["fingerings"][1], pitch_names=pitches)])
                assert client.post("/api/teacher/instruments", json=bad).status_code == 400
            upload = client.post("/api/teacher/soundfonts", files={"file": ("test.sf2", b"test-fixture")})
            assert upload.status_code == 200, upload.text
            sf_payload = dict(payload, display_name="SF chord", soundfont_id=upload.json()["id"],
                              preset={"program": 0, "bankMSB": 0, "bankLSB": 0, "name": "Test"})
            sf = client.post("/api/teacher/instruments", json=sf_payload)
            assert sf.status_code == 200, sf.text
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(channel="msedge", headless=True)
                context = browser.new_context()
                errors = []
                context.on("page", lambda page: page.on("pageerror", lambda error: errors.append(str(error))))
                def route_request(route):
                    request = route.request
                    if request.url.split("?")[0].endswith("/audio_engine.js"):
                        route.fulfill(content_type="application/javascript", body="""
                          window.midiCalls = []; window.forceStops = 0;
                          export async function loadSoundfont() { return [{program:0, bankMSB:0, bankLSB:0, name:'Test'}]; }
                          export async function selectSoundfontPreset() {}
                          export async function playMidiNote(note) { window.midiCalls.push(['on',note]); }
                          export function releaseMidiNote(note) { window.midiCalls.push(['off',note]); }
                          export function silenceAllNotes() { window.forceStops++; }
                          export function suspendSound() {}
                        """)
                        return
                    response = client.request(request.method, request.url.replace("http://testserver", ""),
                                              content=request.post_data_buffer, headers={k: v for k, v in request.headers.items() if k.lower() not in {"host", "content-length"}})
                    route.fulfill(status=response.status_code, headers={k: v for k, v in response.headers.items() if k.lower() not in {"content-length", "content-encoding"}}, body=response.content)
                context.route("**/*", route_request)
                context.add_init_script("""
                  window.voices = [];
                  const create = AudioContext.prototype.createOscillator;
                  AudioContext.prototype.createOscillator = function() {
                    const oscillator = create.call(this);
                    const voice = { oscillator, stopped: false, frequency: null };
                    const setFrequency = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
                    oscillator.frequency.setValueAtTime = (value, time) => { voice.frequency = value; return setFrequency(value, time); };
                    const stop = oscillator.stop.bind(oscillator);
                    oscillator.stop = (...args) => { voice.stopped = true; stop(...args); };
                    window.voices.push(voice);
                    return oscillator;
                  };
                  window.WebSocket = class extends EventTarget {
                    static OPEN = 1;
                    readyState = 1;
                    held = new Set();
                    constructor() { super(); window.testSocket = this; setTimeout(() => this.dispatchEvent(new Event('open')),0); }
                    send(raw) {
                      const event = JSON.parse(raw);
                      if (event.type === 'key_down') this.held.add(event.key_id);
                      else this.held.delete(event.key_id);
                      const mask = [...this.held].reduce((sum,id) => sum + (1 << (Number(id.slice(-1))-1)),0);
                      this.dispatchEvent(new MessageEvent('message', {data: JSON.stringify({type:'input_state', held_buttons:[...this.held], button_mask:mask, last_event:event.type, key_id:event.key_id})}));
                    }
                  };
                """)
                page = context.new_page()
                page.goto("http://testserver/teacher")
                item = page.locator(".admin-instrument-item").filter(has_text="Chord regression")
                item.locator(".icon-action").first.click()
                row = page.locator(".fingering-row").nth(1)
                assert row.locator(".pitch-select").count() == 2
                row.locator(".add-chord-pitch").click()
                row.locator(".add-chord-pitch").click()
                assert row.locator(".pitch-select").count() == 4
                assert row.locator(".add-chord-pitch").is_disabled()
                for _ in range(3):
                    row.get_by_role("button", name="혼합음 제거").last.click()
                assert row.locator(".pitch-select").count() == 1
                row.locator(".add-chord-pitch").click()
                assert row.locator(".pitch-select").count() == 2
                row.locator(".pitch-select").nth(1).select_option("G4")
                page.locator("#add-fingering-row").click()
                assert row.locator(".pitch-select").nth(1).input_value() == "G4"
                page.locator(".fingering-row").last.locator(".remove-fingering-button").click()
                page.locator("#save-instrument").click()
                page.wait_for_function("document.querySelector('#form-feedback').dataset.state === 'success'")
                stored = next(item for item in client.get("/api/instruments").json() if item["id"] == instrument_id)
                assert stored["fingerings"][1]["pitch_names"] == ["C4", "G4"]
                page.goto("http://testserver/student")
                def physical(pressed, number):
                    page.evaluate("""([pressed, number]) => window.testSocket.send(JSON.stringify({
                      type: pressed ? 'key_down' : 'key_up', key_id: 'button-' + number
                    }))""", [pressed, number])
                page.locator("#instrument-select").select_option(str(instrument_id))
                # First virtual key press starts audio without a separate enable click.
                key = page.locator('[data-key-id="button-1"]')
                key.hover()
                page.mouse.down()
                page.wait_for_function("window.voices.some(v => !v.stopped && Math.abs(v.frequency - 261.63) < 1)")
                assert "도" in page.locator("#combination-value").inner_text()
                page.mouse.up()
                assert page.evaluate("window.voices.every(v => v.stopped)")
                page.locator("#audio-enable").click()
                physical(True, 1)
                assert page.evaluate("window.voices.every(v => v.stopped)")
                physical(False, 1)
                page.locator("#audio-enable").click()
                physical(True, 1)
                physical(True, 3)
                page.wait_for_function("window.voices.filter(v => !v.stopped).length === 2")
                frequencies = page.evaluate("window.voices.filter(v => !v.stopped).map(v => v.frequency)")
                assert abs(frequencies[0] - 261.63) < 1 and abs(frequencies[1] - 392) < 1, frequencies
                physical(False, 3)
                physical(False, 1)
                assert page.evaluate("window.voices.every(v => v.stopped)")
                page.locator("#instrument-select").select_option(str(sf.json()["id"]))
                page.wait_for_function("document.querySelector('#sound-status').textContent.includes('음색 준비 완료')")
                physical(True, 1)
                physical(True, 3)
                assert page.evaluate("window.midiCalls.slice(-2)") == [["on", 60], ["on", 64]]
                physical(False, 1)
                physical(False, 3)
                assert page.evaluate("window.midiCalls.slice(-2)") == [["off", 60], ["off", 64]]
                assert page.evaluate("window.forceStops") > 0
                assert not errors, errors
                browser.close()
        gc.collect()
        print("PASS: chord validation, persistence, teacher editing, oscillator mixing/release, SoundFont note-on/off")


if __name__ == "__main__":
    verify()
