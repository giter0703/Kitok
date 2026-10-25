"""Run with: python tests/verify_editor.py (httpx and playwright required)."""
import gc
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from server import main


def verify():
    with tempfile.TemporaryDirectory() as directory:
        main.DATA_DIR = Path(directory)
        main.SOUNDFONT_DIR = Path(directory) / "soundfonts"
        main.DATABASE_PATH = Path(directory) / "test.sqlite3"
        # Exercise the old constraint migration and compare all stored columns.
        with sqlite3.connect(main.DATABASE_PATH) as db:
            db.execute("CREATE TABLE song_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, song_id INTEGER NOT NULL, position INTEGER NOT NULL, pitch TEXT NOT NULL, beats REAL NOT NULL CHECK (beats IN (0.5, 1, 2, 4)), UNIQUE(song_id, position))")
            db.execute("INSERT INTO song_notes VALUES (100, 999, 0, 'C4', 2)")
        main.initialize_database()
        with sqlite3.connect(main.DATABASE_PATH) as db:
            assert db.execute("SELECT * FROM song_notes WHERE id=100").fetchone() == (100, 999, 0, "C4", 2)
        db.close()
        main.initialize_database()
        durations = [4, 2, 1, .5, .25, 3, 1.5, .75, .125, .0625, 8]
        notes = [{"pitch": pitch, "beats": beats} for pitch in ["C4", "R"] for beats in durations]
        payload = {"title": "Duration regression", "bpm": 80, "notes": notes}
        with TestClient(main.app) as client:
            assert client.get("/api/editor-settings").json() == {"advanced_tools": False}
            assert client.put("/api/teacher/editor-settings", json={"advanced_tools": True}).json() == {"advanced_tools": True}
            response = client.post("/api/teacher/songs", json=payload)
            assert response.status_code == 200, response.text
            song_id = response.json()["id"]
            assert next(song for song in client.get("/api/songs").json() if song["id"] == song_id)["notes"] == notes
            assert client.put("/api/teacher/editor-settings", json={"advanced_tools": False}).status_code == 200
            assert client.put(f"/api/teacher/songs/{song_id}", json=payload).status_code == 200
            for invalid in [0, .3, float("inf")]:
                bad = dict(payload, notes=[{"pitch": "R", "beats": invalid}])
                if invalid != float("inf"):
                    assert client.post("/api/teacher/songs", json=bad).status_code == 400
            headers = {"X-Owner-Token": "test-owner-token-0123456789abcdef"}
            student = client.post("/api/student/songs", json=dict(payload, author_name="Test"), headers=headers)
            assert student.status_code == 200, student.text
            assert client.get("/api/student/songs", headers=headers).json()[0]["notes"] == notes
            assert client.post("/api/student/songs", json=dict(payload, author_name="  "), headers=headers).status_code == 400
            student_id = student.json()["id"]
            assert client.post(f"/api/student/songs/{student_id}/submit", headers=headers).status_code == 200
            assert client.post(f"/api/teacher/songs/{student_id}/publish").status_code == 200
            assert client.put(f"/api/teacher/songs/{student_id}", json=payload).status_code == 200
            main.initialize_database()
            published = {song["id"]: song for song in client.get("/api/songs").json()}
            assert published[song_id]["composer_type"] == "teacher"
            assert published[student_id]["composer_type"] == "student"
            assert published[student_id]["author_name"] == "Test"
            from playwright.sync_api import sync_playwright
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(channel="msedge", headless=True)
                page = browser.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                def route_request(route):
                    request = route.request
                    response = client.request(request.method, request.url.replace("http://testserver", ""), content=request.post_data_buffer, headers={k: v for k, v in request.headers.items() if k.lower() not in {"host", "content-length"}})
                    route.fulfill(status=response.status_code, headers={k: v for k, v in response.headers.items() if k.lower() not in {"content-length", "content-encoding"}}, body=response.content)
                page.context.route("**/*", route_request)
                page.add_init_script("""window.oscillators = [];
                  const original = AudioContext.prototype.createOscillator;
                  AudioContext.prototype.createOscillator = function(...args) {
                    window.oscillators.push(performance.now());
                    return original.apply(this, args);
                  };""")
                page.goto("http://testserver/")
                page.wait_for_function("document.querySelectorAll('.song-note-row').length > 0")
                assert page.locator(".note-tool:not([hidden])").count() == 8
                assert page.locator(".note-tool svg.note-tool-icon").count() == 16
                assert page.locator("#student-key-panel").is_visible()
                assert not page.locator("#student-play-panel").is_visible()
                assert page.locator(".arcade-buttons").is_visible()
                page.locator("#student-play-tab").click()
                assert page.locator("#student-play-panel").is_visible()
                assert not page.locator("#student-key-panel").is_visible()
                assert not page.locator(".arcade-buttons").is_visible()
                assert not page.locator(".instrument-panel").is_visible()
                assert not page.locator(".footer-note").is_visible()
                page.reload()
                page.wait_for_function("document.querySelector('#student-play-tab').getAttribute('aria-pressed') === 'true'")
                page.wait_for_function("document.querySelectorAll('#practice-staff .score-note').length > 0")
                assert page.locator("#practice-staff .staff-line").count() >= 5
                assert not page.locator("#teacher-settings").is_visible()
                assert not page.locator("#teacher-modal").is_visible()
                page.locator("#student-compose-open").click()
                page.wait_for_url("**/student/compose")
                page.wait_for_function("!document.querySelector('#student-composer-modal').hidden")
                assert page.locator("#student-composer-modal").is_visible()
                assert not page.locator(".app-shell").is_visible()
                assert page.locator("#song-form").is_visible()
                assert not page.locator("#advanced-tools").is_visible()
                page.locator("#song-title-input").fill("Student staff composition")
                page.locator("#student-author-name").fill("")
                page.locator("#save-song").click()
                page.wait_for_function("document.querySelector('#song-form-feedback').dataset.state === 'error'")
                page.locator("#student-author-name").fill("Staff Composer")
                page.locator('.note-tool[data-beats="0.5"][data-rest="false"]').click()
                page.locator("#save-song").click()
                page.wait_for_function("document.querySelector('#song-form-feedback').dataset.state === 'success'")
                page.reload()
                page.wait_for_function("document.querySelectorAll('#student-song-list .student-work-item').length > 0")
                page.locator("#student-song-list .icon-action").first.click()
                assert page.locator("#student-author-name").input_value() == "Staff Composer"
                assert page.locator(".song-note-row").count() == 2
                page.locator("#song-meter-input").select_option("3/4")
                page.locator("#toggle-note-list").click()
                page.locator(".song-note-beats").first.select_option("4")
                assert page.locator('#score-staff .score-note[data-note-index="0"]').count() == 2
                assert page.locator("#score-staff .note-tie").count() >= 1
                page.locator(".song-note-pitch").first.select_option("R")
                assert page.locator("#score-staff .note-tie").count() == 0
                assert page.locator("#score-staff .score-rest").count() == 2
                page.locator("#fill-measure-rests").click()
                assert page.locator("#fill-measure-rests").is_disabled()
                assert page.locator(".song-note-pitch").last.input_value() == "R"
                assert page.locator(".song-note-beats").last.input_value() == "1.5"
                assert page.locator("#score-staff .bar-line").count() == 2
                page.locator("#submit-student-song").click()
                page.wait_for_function("document.querySelector('#song-form-feedback').dataset.state === 'success'")
                assert "Staff Composer" in page.locator("#student-song-list").inner_text()
                page.locator("#close-student-composer").click()
                page.wait_for_url("**/student")
                page.wait_for_function("document.querySelectorAll('#practice-song-select optgroup').length === 2")
                assert "Test" in page.locator('#practice-song-select optgroup[label="학생 작곡"]').inner_text()
                page.goto("http://testserver/teacher")
                page.wait_for_function("!document.querySelector('#teacher-modal').hidden")
                assert not page.locator(".app-shell").is_visible()
                assert page.locator("#instrument-admin-view").is_visible()
                page.locator("#teacher-tab-songs").click()
                page.locator("#song-origin-filter").select_option("student")
                page.wait_for_function("document.querySelectorAll('.song-admin-item').length === 2")
                assert "교사 작곡" not in page.locator("#song-admin-list").inner_text()
                assert "Staff Composer" in page.locator("#song-admin-list").inner_text()
                page.locator("#song-origin-filter").select_option("teacher")
                assert "학생 작곡" not in page.locator("#song-admin-list").inner_text()
                page.locator("#song-origin-filter").select_option("all")
                page.locator("#advanced-tools").check()
                page.wait_for_function("document.querySelectorAll('.note-tool:not([hidden])').length === 16")
                button = page.locator('.note-tool[data-beats="0.5"][data-rest="false"]')
                before = page.locator(".song-note-row").count()
                button.click()
                button.click()
                assert page.locator(".song-note-row").count() == before + 2
                assert page.locator(".song-note-beats").last.input_value() == "0.5"
                assert button.get_attribute("draggable") != "true"
                page.locator('.note-tool[data-beats="0.25"][data-rest="true"]').click()
                assert page.locator(".song-note-row").count() == before + 3
                assert page.locator(".song-note-pitch").last.input_value() == "R"
                assert page.locator(".song-note-beats").last.input_value() == "0.25"
                # Clicking a staff note opens its own editor without adding a note.
                page.locator('#score-staff .score-note[data-note-index="1"]').click()
                assert page.locator("#song-list-editor").is_visible()
                assert page.locator(".song-note-row").count() == before + 3
                assert page.locator(".song-note-row.is-selected").count() == 1
                old_pitch = page.locator(".song-note-pitch").nth(1).input_value()
                page.locator("#score-staff").evaluate("""svg => {
                  const rect = svg.getBoundingClientRect();
                  const bottom = Number(svg.querySelectorAll('.staff-line')[4].getAttribute('y1'));
                  window.hoverPoint = {clientX: rect.left + rect.width * 0.75, clientY: rect.top + (bottom - 10) * rect.height / Number(svg.getAttribute('height'))};
                  svg.dispatchEvent(new PointerEvent('pointermove', {bubbles: true, ...window.hoverPoint}));
                }""")
                assert page.locator(".staff-pitch-preview").get_attribute("data-pitch") == "F4"
                assert "F4" in page.locator(".staff-pitch-preview text").text_content()
                assert page.locator(".staff-pitch-preview").get_attribute("data-source-pitch") == old_pitch
                assert "\u2192" in page.locator(".staff-pitch-preview > text").text_content()
                assert page.locator(".song-note-pitch").nth(1).input_value() == old_pitch
                page.locator("#score-staff").evaluate("""svg => {
                  const rect = svg.getBoundingClientRect();
                  const bottom = Number(svg.querySelectorAll('.staff-line')[4].getAttribute('y1'));
                  svg.dispatchEvent(new MouseEvent('click', {bubbles: true, clientX: rect.left + rect.width * 0.75, clientY: rect.top + (bottom - 10) * rect.height / Number(svg.getAttribute('height'))}));
                }""")
                assert page.locator(".song-note-pitch").nth(1).input_value() == "F4"
                assert page.locator(".staff-pitch-preview").count() == 0
                page.locator(".song-note-row").nth(1).locator(".song-note-pitch").select_option("D4")
                page.locator(".song-note-row").nth(1).locator(".song-note-beats").select_option("2")
                assert page.locator('#score-staff .score-note[data-note-index="1"]').get_attribute("aria-label").find("D4") >= 0
                assert page.locator(".song-note-beats").nth(1).input_value() == "2"
                page.locator('.note-tool[data-beats="1"][data-rest="false"]').click()
                assert page.locator(".song-note-row").count() == before + 4
                assert page.locator(".song-note-beats").nth(1).input_value() == "2"
                # Reset the scratch composition before the existing round-trip checks.
                page.locator("#reset-song-form").click()
                page.locator("#toggle-note-list").click()
                page.locator(".song-note-beats").first.select_option("0.75")
                page.locator(".song-note-pitch").first.select_option("R")
                assert page.locator("#score-staff .score-rest").count() == 1
                page.locator("#advanced-tools").uncheck()
                page.wait_for_function("document.querySelectorAll('.note-tool:not([hidden])').length === 8")
                assert page.locator(".song-note-beats").first.input_value() == "0.75"
                page.locator("#song-title-input").fill("Browser regression")
                page.locator("#preview-song").click()
                page.wait_for_function("!document.querySelector('#stop-preview-song').disabled")
                page.wait_for_function("document.querySelector('#stop-preview-song').disabled")
                assert page.evaluate("window.oscillators.length") == 0
                page.locator("#advanced-tools").check()
                page.wait_for_function("document.querySelectorAll('.note-tool:not([hidden])').length === 16")
                page.locator(".song-note-beats").first.select_option("0.25")
                page.locator(".song-note-pitch").first.select_option("C4")
                page.locator("#preview-song").click()
                page.wait_for_function("document.querySelector('#stop-preview-song').disabled")
                assert page.evaluate("window.oscillators.length") == 1
                page.locator(".song-note-beats").first.select_option("0.75")
                page.locator(".song-note-pitch").first.select_option("R")
                page.locator("#advanced-tools").uncheck()
                page.wait_for_function("document.querySelectorAll('.note-tool:not([hidden])').length === 8")
                page.locator("#save-song").click()
                page.wait_for_function("document.querySelector('#song-title-input').value === ''")
                saved = next(song for song in client.get("/api/songs").json() if song["title"] == "Browser regression")
                assert saved["notes"] == [{"pitch": "R", "beats": .75}]
                legacy = page.locator(".song-admin-item").filter(has_text="Duration regression")
                legacy.locator(".icon-action").first.click()
                actual = page.locator(".song-note-row").evaluate_all("rows => rows.map(row => ({pitch: row.querySelector('.song-note-pitch').value, beats: Number(row.querySelector('.song-note-beats').value)}))")
                assert actual == notes
                assert page.locator("#score-staff .score-note").count() >= len(notes)
                assert page.locator("#score-staff .staff-line").count() > 5
                assert page.locator("#score-staff .staff-line").count() % 5 == 0
                assert page.locator("#score-staff .score-clef").count() == page.locator("#score-staff .staff-line").count() // 5
                page.locator('#score-staff .score-note[data-note-index="20"]').first.click()
                assert page.locator(".song-note-row").nth(20).evaluate("row => row.classList.contains('is-selected')")
                assert page.locator(".song-note-row").count() == len(notes)

                # Bar lines follow elapsed musical time, never wrapping or an unfinished end.
                total_beats = sum(note["beats"] for note in notes)
                for numerator in [2, 3, 4]:
                    page.locator("#song-meter-input").select_option(f"{numerator}/4")
                    boundaries = page.locator("#score-staff .bar-line").evaluate_all("bars => bars.map(bar => Number(bar.dataset.beat))")
                    assert boundaries == [numerator * index for index in range(1, int(total_beats // numerator) + 1)], boundaries
                    unchanged = page.locator(".song-note-row").evaluate_all("rows => rows.map(row => ({pitch: row.querySelector('.song-note-pitch').value, beats: Number(row.querySelector('.song-note-beats').value)}))")
                    assert unchanged == notes
                    fragments = page.locator("#score-staff .score-note").evaluate_all("elements => elements.map(el => ({row: Number(el.dataset.staffRow), source: Number(el.dataset.noteIndex), start: Number(el.dataset.startTick), beats: Number(el.dataset.beats), measure: Number(el.dataset.measure)}))")
                    totals = [0] * len(notes)
                    measure_totals = {}
                    for index, fragment in enumerate(fragments):
                        ticks = round(fragment["beats"] * 16)
                        assert fragment["start"] % (numerator * 16) + ticks <= numerator * 16
                        if index and fragment["row"] != fragments[index - 1]["row"]:
                            assert fragment["start"] % (numerator * 16) == 0
                        totals[fragment["source"]] += fragment["beats"]
                        measure_totals[fragment["measure"]] = measure_totals.get(fragment["measure"], 0) + fragment["beats"]
                    assert totals == [note["beats"] for note in notes]
                    assert all(value == numerator for measure, value in measure_totals.items() if measure != max(measure_totals))
                    assert page.locator("#score-staff .note-tie").count() > 0

                # Rest editing identifies both the selected rest and the resulting solfege.
                page.locator('#score-staff .score-note[data-note-index="11"]').first.click()
                page.locator("#score-staff").evaluate("""svg => {
                  const rect = svg.getBoundingClientRect();
                  const bottom = Number(svg.querySelectorAll('.staff-line')[4].getAttribute('y1'));
                  svg.dispatchEvent(new PointerEvent('pointermove', {bubbles: true, clientX: rect.left + rect.width * 0.75, clientY: rect.top + (bottom - 10) * rect.height / Number(svg.getAttribute('height'))}));
                }""")
                assert page.locator(".staff-pitch-preview").get_attribute("data-source-pitch") == "R"
                assert "\uc27c\ud45c" in page.locator(".staff-pitch-preview > text").text_content()
                assert page.locator(".song-note-pitch").nth(11).input_value() == "R"
                # Stable staff coordinates and readable spacing while pitch changes.
                baseline = page.locator("#score-staff .staff-line").evaluate_all("lines => lines.slice(0,5).map(line => line.getAttribute('y1'))")
                for pitch in ["B5", "C3", "C4"]:
                    page.locator(".song-note-pitch").first.select_option(pitch)
                    assert page.locator("#score-staff .staff-line").evaluate_all("lines => lines.slice(0,5).map(line => line.getAttribute('y1'))") == baseline
                gaps = page.locator("#score-staff .score-note").evaluate_all("""elements => {
                  const notes = elements.filter(el => el.querySelector('ellipse')).map(el => ({row: el.dataset.staffRow, x: Number(el.querySelector('ellipse').getAttribute('cx'))}));
                  return notes.slice(1).flatMap((note, i) => note.row === notes[i].row ? [note.x - notes[i].x] : []);
                }""")
                assert all(gap >= 53.9 for gap in gaps), gaps
                assert not errors, errors
                with page.context.expect_page() as opened:
                    page.locator("#close-settings").click()
                student_page = opened.value
                student_page.on("pageerror", lambda error: errors.append(str(error)))
                student_page.wait_for_url("**/student")
                student_page.wait_for_function("document.querySelectorAll('#practice-song-select option').length > 1")
                assert page.url == "http://testserver/teacher"
                assert page.locator("#teacher-modal").is_visible()
                assert student_page.locator(".app-shell").is_visible()
                assert not student_page.locator("#student-play-panel").is_visible()
                student_page.locator("#student-play-tab").click()
                assert student_page.locator("#student-play-panel").is_visible()
                student_page.locator("#student-keys-tab").click()
                assert not student_page.locator("#student-play-panel").is_visible()
                assert student_page.locator(".arcade-buttons").is_visible()
                assert student_page.locator(".instrument-panel").is_visible()
                assert student_page.locator("#teacher-screen-link").count() == 0
                assert not student_page.locator("#teacher-settings").is_visible()
                changed = dict(payload, title="Teacher preview update")
                assert client.put(f"/api/teacher/songs/{song_id}", json=changed).status_code == 200
                student_page.reload()
                student_page.wait_for_function("Array.from(document.querySelectorAll('#practice-song-select option')).some(option => option.textContent.includes('Teacher preview update'))")
                student_page.locator('[data-student-tab="compose"]').click()
                student_page.wait_for_url("**/student/compose")
                student_page.wait_for_function("!document.querySelector('#student-composer-modal').hidden")
                assert student_page.locator("#teacher-screen-link").count() == 0
                assert not student_page.locator("#teacher-settings").is_visible()
                assert page.url == "http://testserver/teacher"
                assert not errors, errors
                browser.close()
        gc.collect()
        print("PASS: migration, API round trips, teacher/student saving, student composition, author validation, composer classification, browser settings, rest rendering, preview audio, legacy preservation")


if __name__ == "__main__":
    verify()
