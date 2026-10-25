from __future__ import annotations

import sqlite3
import re
import hashlib
import json
import asyncio
from contextlib import suppress
from server.input_bridge import InputBridge
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.datastructures import UploadFile as StarletteUploadFile


PROJECT_DIR = Path(__file__).resolve().parents[1]
WEB_DIR = PROJECT_DIR / "web"
DATA_DIR = PROJECT_DIR / "data"
SOUNDFONT_DIR = DATA_DIR / "soundfonts"
DATABASE_PATH = DATA_DIR / "music_game.sqlite3"
MAX_SOUNDFONT_BYTES = 100 * 1024 * 1024
ALLOWED_SOUNDFONT_SUFFIXES = {".sf2", ".dls"}
TRIAL_SONG_NOTES = [
    ("C4", 1), ("C4", 1), ("G4", 1), ("G4", 1),
    ("A4", 1), ("A4", 1), ("G4", 2),
    ("F4", 1), ("F4", 1), ("E4", 1), ("E4", 1),
    ("D4", 1), ("D4", 1), ("C4", 2),
]
SONG_PITCH_PATTERN = re.compile(r"^[A-G](?:[#b♯♭]?)(?:[3-5])$")


def initialize_database() -> None:
    """Create the local database and migrate older teacher settings when needed."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SOUNDFONT_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute("PRAGMA foreign_keys = OFF")

        table_exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'instruments'"
        ).fetchone()
        if table_exists:
            columns = {
                row[1] for row in connection.execute("PRAGMA table_info(instruments)")
            }
            if "soundfont_id" in columns and "soundfont_path" not in columns:
                old_rows = connection.execute(
                    "SELECT id, display_name, family, icon, enabled, created_at FROM instruments"
                ).fetchall()
                connection.execute("DROP TABLE IF EXISTS fingerings")
                connection.execute("DROP TABLE instruments")
                _create_tables(connection)
                connection.executemany(
                    """INSERT INTO instruments
                       (id, display_name, family, icon, enabled, created_at)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    old_rows,
                )
            else:
                _create_tables(connection)
        else:
            _create_tables(connection)

        # Older prototypes limited the stored fingering mask to 3 bits.
        # Rebuild only that table so existing instruments and fingering rows remain intact.
        fingering_schema = connection.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'fingerings'"
        ).fetchone()
        if fingering_schema and "BETWEEN 1 AND 7" in (fingering_schema[0] or "").upper():
            old_fingerings = connection.execute(
                "SELECT id, instrument_id, solfege, pitch_name, button_mask FROM fingerings"
            ).fetchall()
            connection.execute("DROP TABLE fingerings")
            _create_tables(connection)
            connection.executemany(
                """INSERT INTO fingerings
                   (id, instrument_id, solfege, pitch_name, button_mask)
                   VALUES (?, ?, ?, ?, ?)""",
                old_fingerings,
            )

        connection.execute("PRAGMA foreign_keys = ON")
        _seed_trial_song(connection)


def _create_tables(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS soundfonts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            display_name TEXT NOT NULL,
            file_path TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS instruments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            display_name TEXT NOT NULL,
            family TEXT NOT NULL DEFAULT '',
            icon TEXT NOT NULL DEFAULT '🎵',
            soundfont_path TEXT,
            soundfont_id INTEGER,
            bank_number INTEGER NOT NULL DEFAULT 0,
            preset_bank_lsb INTEGER NOT NULL DEFAULT 0,
            preset_number INTEGER,
            preset_name TEXT,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS fingerings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            instrument_id INTEGER NOT NULL,
            solfege TEXT NOT NULL,
            pitch_name TEXT NOT NULL,
            pitch_names TEXT NOT NULL DEFAULT '[]',
            button_mask INTEGER NOT NULL CHECK (button_mask BETWEEN 1 AND 15),
            FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
            UNIQUE (instrument_id, solfege),
            UNIQUE (instrument_id, button_mask)
        );

        CREATE TABLE IF NOT EXISTS songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            bpm INTEGER NOT NULL CHECK (bpm BETWEEN 40 AND 200),
            description TEXT NOT NULL DEFAULT '',
            clef TEXT NOT NULL DEFAULT 'treble',
            time_numerator INTEGER NOT NULL DEFAULT 4,
            time_denominator INTEGER NOT NULL DEFAULT 4,
            status TEXT NOT NULL DEFAULT 'published',
            owner_token_hash TEXT,
            author_name TEXT NOT NULL DEFAULT '',
            review_note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS song_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            song_id INTEGER NOT NULL,
            position INTEGER NOT NULL,
            pitch TEXT NOT NULL,
            beats REAL NOT NULL,
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
            UNIQUE (song_id, position)
        );

        CREATE TABLE IF NOT EXISTS app_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """
    )
    columns = {row[1] for row in connection.execute("PRAGMA table_info(instruments)")}
    migrations = {
        "soundfont_id": "INTEGER",
        "preset_bank_lsb": "INTEGER NOT NULL DEFAULT 0",
        "preset_name": "TEXT",
    }
    for column, sql_type in migrations.items():
        if column not in columns:
            connection.execute(f"ALTER TABLE instruments ADD COLUMN {column} {sql_type}")

    # Remove the prototype duration constraint without changing any note values.
    schema = connection.execute("SELECT sql FROM sqlite_master WHERE name = 'song_notes'").fetchone()
    if schema and "CHECK" in schema[0].upper():
        connection.execute("ALTER TABLE song_notes RENAME TO song_notes_legacy")
        connection.execute("""CREATE TABLE song_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, song_id INTEGER NOT NULL,
            position INTEGER NOT NULL, pitch TEXT NOT NULL, beats REAL NOT NULL,
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
            UNIQUE (song_id, position))""")
        connection.execute("INSERT INTO song_notes SELECT * FROM song_notes_legacy")
        connection.execute("DROP TABLE song_notes_legacy")

    fingering_columns = {row[1] for row in connection.execute("PRAGMA table_info(fingerings)")}
    if "pitch_names" not in fingering_columns:
        connection.execute("ALTER TABLE fingerings ADD COLUMN pitch_names TEXT NOT NULL DEFAULT '[]'")
    song_columns = {row[1] for row in connection.execute("PRAGMA table_info(songs)")}
    song_migrations = {
        "clef": "TEXT NOT NULL DEFAULT 'treble'",
        "time_numerator": "INTEGER NOT NULL DEFAULT 4",
        "time_denominator": "INTEGER NOT NULL DEFAULT 4",
        "status": "TEXT NOT NULL DEFAULT 'published'",
        "owner_token_hash": "TEXT",
        "author_name": "TEXT NOT NULL DEFAULT ''",
        "review_note": "TEXT NOT NULL DEFAULT ''",
    }
    for column, sql_type in song_migrations.items():
        if column not in song_columns:
            connection.execute(f"ALTER TABLE songs ADD COLUMN {column} {sql_type}")


def _seed_trial_song(connection: sqlite3.Connection) -> None:
    seeded = connection.execute(
        "SELECT value FROM app_metadata WHERE key = 'trial_song_seeded'"
    ).fetchone()
    if seeded:
        return
    now = datetime.now(timezone.utc).isoformat()
    cursor = connection.execute(
        "INSERT INTO songs (title, bpm, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        ("반짝반짝 작은 별", 80, "첫 부분 · 키캡으로 음과 박자를 연습해요.", now, now),
    )
    connection.executemany(
        "INSERT INTO song_notes (song_id, position, pitch, beats) VALUES (?, ?, ?, ?)",
        [(cursor.lastrowid, index, pitch, beats) for index, (pitch, beats) in enumerate(TRIAL_SONG_NOTES)],
    )
    connection.execute(
        "INSERT INTO app_metadata (key, value) VALUES ('trial_song_seeded', '1')"
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    app.state.input_bridge = InputBridge()
    watchdog = asyncio.create_task(app.state.input_bridge.watchdog())
    try:
        yield
    finally:
        watchdog.cancel()
        with suppress(asyncio.CancelledError):
            await watchdog


app = FastAPI(title="키캡 악기 합주", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


@app.get("/")
@app.get("/student")
@app.get("/student/compose")
@app.get("/teacher")
def home() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


@app.get("/api/editor-settings")
def editor_settings() -> dict:
    with sqlite3.connect(DATABASE_PATH) as connection:
        row = connection.execute("SELECT value FROM app_metadata WHERE key = 'advanced_tools'").fetchone()
    return {"advanced_tools": bool(row and row[0] == "1")}


@app.put("/api/teacher/editor-settings")
def update_editor_settings(payload: dict) -> dict:
    value = payload.get("advanced_tools")
    if not isinstance(value, bool):
        raise HTTPException(status_code=400, detail="advanced_tools must be boolean")
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute("INSERT OR REPLACE INTO app_metadata (key, value) VALUES ('advanced_tools', ?)", ("1" if value else "0",))
    return {"advanced_tools": value}


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "message": "음악 게임 서버가 실행 중입니다."}


@app.get("/api/instruments")
def list_instruments() -> list[dict[str, object]]:
    """Return active teacher-created profiles and their fingering maps."""
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            SELECT id, display_name, family, icon, soundfont_id,
                   bank_number, preset_bank_lsb, preset_number, preset_name
            FROM instruments
            WHERE enabled = 1
            ORDER BY display_name COLLATE NOCASE
            """
        ).fetchall()
        instruments = []
        for row in rows:
            item = dict(row)
            item["fingerings"] = [
                {"solfege": fingering["solfege"], "pitch_name": fingering["pitch_name"],
                 "pitch_names": json.loads(fingering["pitch_names"]) or [fingering["pitch_name"]],
                 "button_mask": fingering["button_mask"]}
                for fingering in connection.execute(
                    """SELECT solfege, pitch_name, pitch_names, button_mask
                       FROM fingerings WHERE instrument_id = ? ORDER BY id""",
                    (row["id"],),
                ).fetchall()
            ]
            item["preset"] = (
                {
                    "bankMSB": row["bank_number"],
                    "bankLSB": row["preset_bank_lsb"],
                    "program": row["preset_number"],
                    "name": row["preset_name"],
                }
                if row["soundfont_id"] is not None and row["preset_number"] is not None
                else None
            )
            instruments.append(item)
    return instruments


def _validate_song_payload(
    payload: object,
) -> tuple[str, int, str, str, int, int, list[tuple[str, float]]]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="곡 정보 형식이 올바르지 않습니다.")

    title = str(payload.get("title", "")).strip()
    description = str(payload.get("description", "")).strip()
    clef = str(payload.get("clef", "treble")).strip()
    raw_meter = str(payload.get("time_signature", "4/4")).strip()
    try:
        bpm = int(payload.get("bpm"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="빠르기는 숫자로 입력해 주세요.") from None
    raw_notes = payload.get("notes")
    meter_parts = raw_meter.split("/")
    if clef not in {"treble", "bass"}:
        raise HTTPException(status_code=400, detail="높은음자리표 또는 낮은음자리표를 선택해 주세요.")
    if len(meter_parts) != 2 or meter_parts[1] != "4" or meter_parts[0] not in {"2", "3", "4"}:
        raise HTTPException(status_code=400, detail="박자표는 2/4, 3/4, 4/4 중에서 선택해 주세요.")
    time_numerator, time_denominator = int(meter_parts[0]), int(meter_parts[1])

    if not title or len(title) > 60:
        raise HTTPException(status_code=400, detail="곡 이름은 1~60자로 입력해 주세요.")
    if not 40 <= bpm <= 200:
        raise HTTPException(status_code=400, detail="빠르기는 40~200 BPM으로 입력해 주세요.")
    if len(description) > 200:
        raise HTTPException(status_code=400, detail="곡 설명은 200자 이내로 입력해 주세요.")
    if not isinstance(raw_notes, list) or not 1 <= len(raw_notes) <= 64:
        raise HTTPException(status_code=400, detail="곡에는 1~64개의 음을 입력해 주세요.")

    notes: list[tuple[str, float]] = []
    allowed_durations = {0.0625, 0.125, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 8.0}
    for index, raw_note in enumerate(raw_notes, start=1):
        if not isinstance(raw_note, dict):
            raise HTTPException(status_code=400, detail=f"{index}번째 음 정보가 올바르지 않습니다.")
        pitch = str(raw_note.get("pitch", "")).strip()
        try:
            beats = float(raw_note.get("beats"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"{index}번째 음의 박자 길이를 확인해 주세요.") from None
        if pitch != "R" and not SONG_PITCH_PATTERN.fullmatch(pitch):
            raise HTTPException(status_code=400, detail=f"{index}번째 음의 음높이가 올바르지 않습니다.")
        if beats not in allowed_durations:
            raise HTTPException(status_code=400, detail=f"{index}: unsupported note duration")
        notes.append((pitch, beats))
    return title, bpm, description, clef, time_numerator, time_denominator, notes


def _read_songs(
    connection: sqlite3.Connection,
    *,
    statuses: tuple[str, ...] = ("published",),
    owner_token_hash: str | None = None,
) -> list[dict[str, object]]:
    connection.row_factory = sqlite3.Row
    status_placeholders = ",".join("?" for _ in statuses)
    sql = (
        "SELECT id, title, bpm, description, clef, time_numerator, time_denominator, "
        "status, author_name, review_note, "
        "CASE WHEN owner_token_hash IS NOT NULL THEN 'student' ELSE 'teacher' END AS composer_type "
        "FROM songs WHERE status IN (" + status_placeholders + ")"
    )
    params: list[object] = list(statuses)
    if owner_token_hash is not None:
        sql += " AND owner_token_hash = ?"
        params.append(owner_token_hash)
    sql += " ORDER BY id"
    song_rows = connection.execute(sql, params).fetchall()
    result = []
    for song in song_rows:
        notes = connection.execute(
            "SELECT pitch, beats FROM song_notes WHERE song_id = ? ORDER BY position",
            (song["id"],),
        ).fetchall()
        result.append({
            "id": song["id"],
            "title": song["title"],
            "bpm": song["bpm"],
            "description": song["description"],
            "clef": song["clef"],
            "time_signature": f"{song['time_numerator']}/{song['time_denominator']}",
            "status": song["status"],
            "author_name": song["author_name"],
            "composer_type": song["composer_type"],
            "review_note": song["review_note"],
            "notes": [{"pitch": note["pitch"], "beats": note["beats"]} for note in notes],
        })
    return result


@app.get("/api/songs")
def list_songs() -> list[dict[str, object]]:
    with sqlite3.connect(DATABASE_PATH) as connection:
        return _read_songs(connection)


def _token_hash(token: str | None) -> str:
    if not token or len(token) < 24 or len(token) > 128:
        raise HTTPException(status_code=401, detail="학생 작품 보관함을 확인할 수 없습니다. 브라우저를 새로고침해 주세요.")
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _student_song_owner(connection: sqlite3.Connection, song_id: int, owner_hash: str) -> sqlite3.Row:
    connection.row_factory = sqlite3.Row
    row = connection.execute(
        "SELECT id, status FROM songs WHERE id = ? AND owner_token_hash = ?",
        (song_id, owner_hash),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="내 작품을 찾을 수 없습니다.")
    if row["status"] not in {"draft", "changes_requested"}:
        raise HTTPException(status_code=409, detail="제출했거나 공개된 곡은 수정할 수 없습니다.")
    return row


@app.get("/api/student/songs")
def list_student_songs(x_owner_token: str | None = Header(default=None)) -> list[dict[str, object]]:
    owner_hash = _token_hash(x_owner_token)
    with sqlite3.connect(DATABASE_PATH) as connection:
        return _read_songs(
            connection,
            statuses=("draft", "submitted", "changes_requested", "published"),
            owner_token_hash=owner_hash,
        )


@app.post("/api/student/songs")
async def create_student_song(
    request: Request, x_owner_token: str | None = Header(default=None)
) -> dict[str, object]:
    owner_hash = _token_hash(x_owner_token)
    payload = await request.json()
    author_name = str(payload.get("author_name", "")).strip() if isinstance(payload, dict) else ""
    if not author_name or len(author_name) > 20:
        raise HTTPException(status_code=400, detail="이름표에 사용할 별명을 1~20자로 입력해 주세요.")
    title, bpm, description, clef, numerator, denominator, notes = _validate_song_payload(payload)
    now = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(DATABASE_PATH) as connection:
        cursor = connection.execute(
            """INSERT INTO songs
               (title, bpm, description, clef, time_numerator, time_denominator,
                status, owner_token_hash, author_name, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)""",
            (title, bpm, description, clef, numerator, denominator, owner_hash, author_name, now, now),
        )
        song_id = cursor.lastrowid
        connection.executemany(
            "INSERT INTO song_notes (song_id, position, pitch, beats) VALUES (?, ?, ?, ?)",
            [(song_id, index, pitch, beats) for index, (pitch, beats) in enumerate(notes)],
        )
    return {"id": song_id, "status": "draft", "message": "내 작품으로 저장했습니다."}


@app.put("/api/student/songs/{song_id}")
async def update_student_song(
    song_id: int, request: Request, x_owner_token: str | None = Header(default=None)
) -> dict[str, str]:
    owner_hash = _token_hash(x_owner_token)
    payload = await request.json()
    author_name = str(payload.get("author_name", "")).strip() if isinstance(payload, dict) else ""
    if not author_name or len(author_name) > 20:
        raise HTTPException(status_code=400, detail="별명을 1~20자로 입력해 주세요.")
    title, bpm, description, clef, numerator, denominator, notes = _validate_song_payload(payload)
    now = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(DATABASE_PATH) as connection:
        _student_song_owner(connection, song_id, owner_hash)
        connection.execute(
            """UPDATE songs SET title = ?, bpm = ?, description = ?, clef = ?,
               time_numerator = ?, time_denominator = ?, author_name = ?,
               status = 'draft', review_note = '', updated_at = ? WHERE id = ?""",
            (title, bpm, description, clef, numerator, denominator, author_name, now, song_id),
        )
        connection.execute("DELETE FROM song_notes WHERE song_id = ?", (song_id,))
        connection.executemany(
            "INSERT INTO song_notes (song_id, position, pitch, beats) VALUES (?, ?, ?, ?)",
            [(song_id, index, pitch, beats) for index, (pitch, beats) in enumerate(notes)],
        )
    return {"message": "내 작품을 저장했습니다."}


@app.post("/api/student/songs/{song_id}/submit")
def submit_student_song(song_id: int, x_owner_token: str | None = Header(default=None)) -> dict[str, str]:
    owner_hash = _token_hash(x_owner_token)
    with sqlite3.connect(DATABASE_PATH) as connection:
        _student_song_owner(connection, song_id, owner_hash)
        connection.execute(
            "UPDATE songs SET status = 'submitted', review_note = '', updated_at = ? WHERE id = ?",
            (datetime.now(timezone.utc).isoformat(), song_id),
        )
    return {"message": "선생님께 작품을 제출했습니다."}


@app.get("/api/teacher/songs")
def list_teacher_songs() -> list[dict[str, object]]:
    with sqlite3.connect(DATABASE_PATH) as connection:
        return _read_songs(connection, statuses=("published", "submitted", "changes_requested"))


@app.post("/api/teacher/songs")
async def create_song(request: Request) -> dict[str, object]:
    title, bpm, description, clef, numerator, denominator, notes = _validate_song_payload(await request.json())
    now = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(DATABASE_PATH) as connection:
        cursor = connection.execute(
            """INSERT INTO songs
               (title, bpm, description, clef, time_numerator, time_denominator, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?)""",
            (title, bpm, description, clef, numerator, denominator, now, now),
        )
        song_id = cursor.lastrowid
        connection.executemany(
            "INSERT INTO song_notes (song_id, position, pitch, beats) VALUES (?, ?, ?, ?)",
            [(song_id, index, pitch, beats) for index, (pitch, beats) in enumerate(notes)],
        )
    return {"id": song_id, "message": "연습곡을 저장했습니다."}


@app.put("/api/teacher/songs/{song_id}")
async def update_song(song_id: int, request: Request) -> dict[str, str]:
    title, bpm, description, clef, numerator, denominator, notes = _validate_song_payload(await request.json())
    now = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(DATABASE_PATH) as connection:
        cursor = connection.execute(
            """UPDATE songs SET title = ?, bpm = ?, description = ?, clef = ?,
               time_numerator = ?, time_denominator = ?, updated_at = ? WHERE id = ? AND status = 'published'""",
            (title, bpm, description, clef, numerator, denominator, now, song_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="연습곡을 찾을 수 없습니다.")
        connection.execute("DELETE FROM song_notes WHERE song_id = ?", (song_id,))
        connection.executemany(
            "INSERT INTO song_notes (song_id, position, pitch, beats) VALUES (?, ?, ?, ?)",
            [(song_id, index, pitch, beats) for index, (pitch, beats) in enumerate(notes)],
        )
    return {"message": "연습곡을 수정했습니다."}


@app.delete("/api/teacher/songs/{song_id}")
def delete_song(song_id: int) -> dict[str, str]:
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        cursor = connection.execute("DELETE FROM songs WHERE id = ? AND status = 'published'", (song_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="연습곡을 찾을 수 없습니다.")
    return {"message": "연습곡을 삭제했습니다."}


@app.post("/api/teacher/songs/{song_id}/publish")
def publish_student_song(song_id: int) -> dict[str, str]:
    with sqlite3.connect(DATABASE_PATH) as connection:
        cursor = connection.execute(
            "UPDATE songs SET status = 'published', review_note = '', updated_at = ? "
            "WHERE id = ? AND status IN ('submitted', 'changes_requested')",
            (datetime.now(timezone.utc).isoformat(), song_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="제출된 학생 작품을 찾을 수 없습니다.")
    return {"message": "학생 작품을 공용 연습곡으로 공개했습니다."}


@app.post("/api/teacher/songs/{song_id}/request-changes")
def request_student_song_changes(song_id: int, payload: dict[str, object]) -> dict[str, str]:
    note = str(payload.get("note", "")).strip()[:200] or "수정한 뒤 다시 제출해 주세요."
    with sqlite3.connect(DATABASE_PATH) as connection:
        cursor = connection.execute(
            "UPDATE songs SET status = 'changes_requested', review_note = ?, updated_at = ? "
            "WHERE id = ? AND status = 'submitted'",
            (note, datetime.now(timezone.utc).isoformat(), song_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="제출된 학생 작품을 찾을 수 없습니다.")
    return {"message": "학생에게 수정 요청을 보냈습니다."}


@app.get("/api/soundfonts")
def list_soundfonts() -> list[dict[str, object]]:
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            "SELECT id, display_name, file_path, created_at FROM soundfonts ORDER BY id DESC"
        ).fetchall()
    return [
        {
            "id": row["id"],
            "display_name": row["display_name"],
            "size_bytes": Path(row["file_path"]).stat().st_size
            if Path(row["file_path"]).is_file()
            else 0,
            "created_at": row["created_at"],
        }
        for row in rows
    ]


@app.post("/api/teacher/soundfonts")
async def upload_soundfont(request: Request) -> dict[str, object]:
    form = await request.form()
    upload = form.get("file")
    if not isinstance(upload, StarletteUploadFile) or not upload.filename:
        raise HTTPException(status_code=400, detail="SoundFont 파일을 선택해 주세요.")

    suffix = Path(upload.filename).suffix.lower()
    if suffix not in ALLOWED_SOUNDFONT_SUFFIXES:
        raise HTTPException(status_code=400, detail="SF2 또는 DLS 파일만 등록할 수 있어요.")
    data = await upload.read(MAX_SOUNDFONT_BYTES + 1)
    if len(data) > MAX_SOUNDFONT_BYTES:
        raise HTTPException(status_code=413, detail="파일 크기는 100MB 이하여야 합니다.")
    if not data:
        raise HTTPException(status_code=400, detail="선택한 파일이 비어 있어요.")

    soundfont_id = uuid4().hex
    file_path = SOUNDFONT_DIR / f"{soundfont_id}{suffix}"
    display_name = Path(upload.filename).name[:160]
    file_path.write_bytes(data)
    created_at = datetime.now(timezone.utc).isoformat()
    try:
        with sqlite3.connect(DATABASE_PATH) as connection:
            cursor = connection.execute(
                "INSERT INTO soundfonts (display_name, file_path, created_at) VALUES (?, ?, ?)",
                (display_name, str(file_path), created_at),
            )
            database_id = cursor.lastrowid
    except Exception:
        file_path.unlink(missing_ok=True)
        raise
    return {
        "id": database_id,
        "display_name": display_name,
        "size_bytes": len(data),
        "message": "음원 파일을 등록했습니다.",
    }


@app.get("/api/soundfonts/{soundfont_id}/file")
def get_soundfont_file(soundfont_id: int) -> FileResponse:
    with sqlite3.connect(DATABASE_PATH) as connection:
        row = connection.execute(
            "SELECT display_name, file_path FROM soundfonts WHERE id = ?", (soundfont_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="음원 파일을 찾을 수 없습니다.")
    file_path = Path(row[1]).resolve()
    if not file_path.is_relative_to(SOUNDFONT_DIR.resolve()) or not file_path.is_file():
        raise HTTPException(status_code=404, detail="저장된 음원 파일을 찾을 수 없습니다.")
    return FileResponse(file_path, filename=Path(row[0]).name)


@app.delete("/api/teacher/soundfonts/{soundfont_id}")
def delete_soundfont(soundfont_id: int) -> dict[str, str]:
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            "UPDATE instruments SET soundfont_id = NULL, preset_number = NULL, preset_name = NULL "
            "WHERE soundfont_id = ?",
            (soundfont_id,),
        )
        row = connection.execute(
            "SELECT file_path FROM soundfonts WHERE id = ?", (soundfont_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="음원 파일을 찾을 수 없습니다.")
        connection.execute("DELETE FROM soundfonts WHERE id = ?", (soundfont_id,))
    Path(row[0]).unlink(missing_ok=True)
    return {"message": "음원 파일을 삭제했습니다. 이 파일을 쓰던 악기의 음색 설정도 해제했습니다."}


def _validate_instrument_payload(
    payload: object,
) -> tuple[str, str, str, list[tuple[str, str, int, str]], int | None, dict[str, object] | None]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="입력 형식이 올바르지 않습니다.")

    display_name = str(payload.get("display_name", "")).strip()
    family = str(payload.get("family", "")).strip()
    icon = str(payload.get("icon", "🎵")).strip() or "🎵"
    raw_soundfont_id = payload.get("soundfont_id")
    soundfont_id = None if raw_soundfont_id in (None, "") else raw_soundfont_id
    preset = payload.get("preset")
    raw_fingerings = payload.get("fingerings")
    if not display_name or len(display_name) > 40:
        raise HTTPException(status_code=400, detail="악기 이름은 1~40자로 입력해 주세요.")
    if len(family) > 40:
        raise HTTPException(status_code=400, detail="악기 분류는 40자 이내로 입력해 주세요.")
    if soundfont_id is not None and (
        isinstance(soundfont_id, bool) or not isinstance(soundfont_id, int) or soundfont_id < 1
    ):
        raise HTTPException(status_code=400, detail="음원 파일 선택을 확인해 주세요.")
    if soundfont_id is None:
        preset = None
    else:
        if not isinstance(preset, dict):
            raise HTTPException(status_code=400, detail="선택한 음원의 악기 음색을 골라 주세요.")
        for key in ("program", "bankMSB", "bankLSB"):
            value = preset.get(key)
            if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 127:
                raise HTTPException(status_code=400, detail="음색 정보가 올바르지 않습니다.")
        preset_name = str(preset.get("name", "")).strip()
        if not preset_name or len(preset_name) > 120:
            raise HTTPException(status_code=400, detail="음색 이름을 확인해 주세요.")
        preset = {
            "program": preset["program"],
            "bankMSB": preset["bankMSB"],
            "bankLSB": preset["bankLSB"],
            "name": preset_name,
        }
    if not isinstance(raw_fingerings, list) or not raw_fingerings:
        raise HTTPException(status_code=400, detail="계이름과 운지법을 하나 이상 추가해 주세요.")
    if len(raw_fingerings) > 15:
        raise HTTPException(status_code=400, detail="네 버튼으로 만들 수 있는 서로 다른 운지법은 최대 15개입니다.")

    validated = []
    masks: dict[int, str] = {}
    note_names: set[str] = set()
    for fingering in raw_fingerings:
        if not isinstance(fingering, dict):
            raise HTTPException(status_code=400, detail="계이름 운지 정보가 올바르지 않습니다.")
        note_name = str(fingering.get("solfege", "")).strip()
        if not note_name or len(note_name) > 20:
            raise HTTPException(status_code=400, detail="계이름 이름은 1~20자로 입력해 주세요.")
        normalized_name = note_name.casefold()
        if normalized_name in note_names:
            raise HTTPException(status_code=400, detail=f"계이름 이름이 중복되었습니다: {note_name}")
        note_names.add(normalized_name)
        pitch_name = str(fingering.get("pitch_name", "")).strip()
        pitch_names = fingering.get("pitch_names", [pitch_name])
        if not isinstance(pitch_names, list) or not 1 <= len(pitch_names) <= 4:
            raise HTTPException(status_code=400, detail=f"{note_name}의 음높이는 1~4개를 선택해 주세요.")
        normalized_pitches = []
        midi_values = set()
        for raw_pitch in pitch_names:
            if not isinstance(raw_pitch, str) or not SONG_PITCH_PATTERN.fullmatch(raw_pitch):
                raise HTTPException(status_code=400, detail=f"{note_name}의 음높이가 올바르지 않습니다.")
            pitch = raw_pitch.replace("♯", "#").replace("♭", "b")
            semitone = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[pitch[0]]
            midi = (int(pitch[-1]) + 1) * 12 + semitone + (1 if "#" in pitch else -1 if "b" in pitch else 0)
            if midi in midi_values:
                raise HTTPException(status_code=400, detail=f"{note_name}에 같은 음높이가 중복되었습니다.")
            midi_values.add(midi)
            normalized_pitches.append(pitch)
        pitch_name = normalized_pitches[0]
        buttons = fingering.get("buttons")
        if not pitch_name or len(pitch_name) > 8:
            raise HTTPException(status_code=400, detail=f"{note_name}의 음높이를 선택해 주세요.")
        if not isinstance(buttons, list) or not buttons:
            raise HTTPException(status_code=400, detail=f"{note_name}의 버튼 조합을 하나 이상 선택해 주세요.")
        if (
            any(isinstance(button, bool) or not isinstance(button, int) or button not in (1, 2, 3, 4) for button in buttons)
            or len(set(buttons)) != len(buttons)
        ):
            raise HTTPException(status_code=400, detail=f"{note_name}의 버튼 선택을 확인해 주세요.")
        mask = sum(1 << (button - 1) for button in buttons)
        if mask in masks:
            previous_name = masks[mask]
            button_names = "+".join(str(button) for button in buttons)
            raise HTTPException(
                status_code=400,
                detail=f"운지법 겹침: {previous_name}와 {note_name}이 버튼 {button_names} 조합으로 겹칩니다.",
            )
        masks[mask] = note_name
        validated.append((note_name, pitch_name, mask, json.dumps(normalized_pitches)))

    return display_name, family, icon, validated, soundfont_id, preset


def _save_fingerings(
    connection: sqlite3.Connection, instrument_id: int, fingerings: list[tuple[str, str, int, str]]
) -> None:
    connection.execute("DELETE FROM fingerings WHERE instrument_id = ?", (instrument_id,))
    connection.executemany(
        """INSERT INTO fingerings (instrument_id, solfege, pitch_name, button_mask, pitch_names)
           VALUES (?, ?, ?, ?, ?)""",
        [(instrument_id, solfege, pitch_name, mask, pitches) for solfege, pitch_name, mask, pitches in fingerings],
    )


@app.post("/api/teacher/instruments")
async def create_instrument(request: Request) -> dict[str, object]:
    display_name, family, icon, fingerings, soundfont_id, preset = _validate_instrument_payload(
        await request.json()
    )
    created_at = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(DATABASE_PATH) as connection:
        if soundfont_id is not None and connection.execute(
            "SELECT 1 FROM soundfonts WHERE id = ?", (soundfont_id,)
        ).fetchone() is None:
            raise HTTPException(status_code=404, detail="선택한 음원 파일을 찾을 수 없습니다.")
        cursor = connection.execute(
            """INSERT INTO instruments
               (display_name, family, icon, soundfont_id, bank_number,
                preset_bank_lsb, preset_number, preset_name, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                display_name, family, icon, soundfont_id,
                preset["bankMSB"] if preset else 0,
                preset["bankLSB"] if preset else 0,
                preset["program"] if preset else None,
                preset["name"] if preset else None,
                created_at,
            ),
        )
        instrument_id = cursor.lastrowid
        _save_fingerings(connection, instrument_id, fingerings)
    return {"id": instrument_id, "message": "악기와 운지표를 저장했습니다."}


@app.put("/api/teacher/instruments/{instrument_id}")
async def update_instrument(instrument_id: int, request: Request) -> dict[str, str]:
    display_name, family, icon, fingerings, soundfont_id, preset = _validate_instrument_payload(
        await request.json()
    )
    with sqlite3.connect(DATABASE_PATH) as connection:
        if soundfont_id is not None and connection.execute(
            "SELECT 1 FROM soundfonts WHERE id = ?", (soundfont_id,)
        ).fetchone() is None:
            raise HTTPException(status_code=404, detail="선택한 음원 파일을 찾을 수 없습니다.")
        existing = connection.execute(
            "SELECT id FROM instruments WHERE id = ?", (instrument_id,)
        ).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="악기를 찾을 수 없습니다.")
        connection.execute(
            """UPDATE instruments SET display_name = ?, family = ?, icon = ?,
               soundfont_id = ?, bank_number = ?, preset_bank_lsb = ?,
               preset_number = ?, preset_name = ?
               WHERE id = ?""",
            (
                display_name, family, icon, soundfont_id,
                preset["bankMSB"] if preset else 0,
                preset["bankLSB"] if preset else 0,
                preset["program"] if preset else None,
                preset["name"] if preset else None,
                instrument_id,
            ),
        )
        _save_fingerings(connection, instrument_id, fingerings)
    return {"message": "악기와 운지표를 수정했습니다."}


@app.delete("/api/teacher/instruments/{instrument_id}")
def delete_instrument(instrument_id: int) -> dict[str, str]:
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        cursor = connection.execute("DELETE FROM instruments WHERE id = ?", (instrument_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="악기를 찾을 수 없습니다.")
    return {"message": "악기를 삭제했습니다."}


@app.post("/api/device/input")
async def device_input(payload: dict) -> dict:
    mask = payload.get("button_mask")
    if isinstance(mask, bool) or not isinstance(mask, int) or not 0 <= mask <= 15:
        raise HTTPException(status_code=400, detail="button_mask는 0~15 정수여야 합니다.")
    await app.state.input_bridge.device(mask)
    return {"ok": True, "button_mask": mask}


@app.websocket("/ws")
async def game_socket(websocket: WebSocket) -> None:
    """Receive press/release events and report the currently held virtual keys."""
    bridge = app.state.input_bridge
    await bridge.connect(websocket)

    try:
        while True:
            message = await websocket.receive_json()
            if not isinstance(message, dict):
                await bridge.send(websocket, {"type": "error", "message": "알 수 없는 버튼 입력입니다."})
                continue
            event_type = message.get("type")
            key_id = message.get("key_id")

            if event_type in {"key_down", "key_up"} and key_id in {
                "button-1",
                "button-2",
                "button-3",
                "button-4",
            }:
                bit = 1 << (int(key_id[-1]) - 1)
                if event_type == "key_down":
                    bridge.clients[websocket]["mask"] |= bit
                else:
                    bridge.clients[websocket]["mask"] &= ~bit
                await bridge.state(websocket, event_type, key_id)
            else:
                await bridge.send(websocket,
                    {"type": "error", "message": "알 수 없는 버튼 입력입니다."}
                )
    except WebSocketDisconnect:
        pass
    finally:
        bridge.clients.pop(websocket, None)


app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
