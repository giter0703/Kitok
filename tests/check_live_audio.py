"""Read-only diagnostic against the running server and its actual soundfonts."""
import json
import httpx
from playwright.sync_api import sync_playwright

base = "http://127.0.0.1:8000"
with httpx.Client(trust_env=False) as client:
    instruments = client.get(base + "/api/instruments").json()
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    try:
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(base + "/student")
        page.wait_for_function("!document.querySelector('#instrument-select').disabled")
        for instrument in instruments:
            page.locator("#instrument-select").select_option(str(instrument["id"]))
            if "켜기" in page.locator("#audio-enable").inner_text():
                page.locator("#audio-enable").click()
            page.wait_for_function("document.querySelector('#sound-status').textContent.includes('음색 준비 완료') || document.querySelector('#sound-status').textContent.includes('음원 준비 실패')", timeout=25000)
            print(json.dumps({"instrument": instrument["display_name"], "preset": instrument["preset"], "status": page.locator("#sound-status").inner_text()}, ensure_ascii=True))
        print(json.dumps({"browser_errors": errors}, ensure_ascii=True))
    finally:
        browser.close()
