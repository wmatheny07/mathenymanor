from flask import Flask, request, jsonify
from flask_cors import CORS
import anthropic
import uuid
import time
import threading
import os
from dotenv import load_dotenv
import json
import redis
import logging
import psycopg2
import psycopg2.extras
from datetime import datetime, timezone

load_dotenv(dotenv_path="/opt/config/runtime/.env.all")
app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
app.logger.setLevel(logging.INFO)
CORS(app, origins=["https://agents.mathenymanor.com"])

# ── Redis ─────────────────────────────────────────────────────────────────────

REDIS_URL = os.getenv("REDIS_URL") or "redis://redis:6379/0"
redis_client = redis.from_url(REDIS_URL, decode_responses=True)
STREAM_TTL = 60 * 60 * 24 * 7

# ── Anthropic ─────────────────────────────────────────────────────────────────

claude = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# ── Postgres ──────────────────────────────────────────────────────────────────

DB_HOST     = os.getenv("DB_HOST", "postgres")
DB_PORT     = int(os.getenv("DB_PORT", "5432"))
DB_NAME     = os.getenv("DB_NAME", "analytics")
DB_USER     = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DEV_USER    = os.getenv("DEV_USER_EMAIL", "dev@mathenymanor.local")


def get_db():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASSWORD, connect_timeout=5,
    )


def ensure_schema():
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("""
                CREATE SCHEMA IF NOT EXISTS agents;

                CREATE TABLE IF NOT EXISTS agents.conversations (
                    id         SERIAL PRIMARY KEY,
                    user_email TEXT        NOT NULL,
                    agent_type TEXT        NOT NULL,
                    title      TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_conv_user
                    ON agents.conversations (user_email, updated_at DESC);

                CREATE TABLE IF NOT EXISTS agents.messages (
                    id              SERIAL PRIMARY KEY,
                    conversation_id INTEGER NOT NULL
                        REFERENCES agents.conversations(id) ON DELETE CASCADE,
                    role            TEXT NOT NULL,
                    content         TEXT NOT NULL,
                    display_content TEXT,
                    metadata        JSONB,
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_msg_conv
                    ON agents.messages (conversation_id, created_at);
            """)
        conn.commit()
        app.logger.info("Agent schema ready.")
    except Exception as e:
        app.logger.warning(f"Could not ensure schema (postgres may not be ready): {e}")
    finally:
        if conn:
            conn.close()


# ── Agent configs ─────────────────────────────────────────────────────────────

AGENTS = {
    "blogpost": {
        "system": (
            "You are compassionate, warm, clear, and accurate. "
            "You help families write CaringBridge-style updates that are "
            "honest about the medical journey but also hopeful and grateful."
        ),
    },
    "promptassist": {
        "system": (
            "You are an expert at crafting precise, effective prompts. "
            "Follow the user's guidance exactly. No follow-up questions."
        ),
    },
}


def build_first_user_message(agent_type: str, display_content: str, metadata: dict) -> str:
    """Build the full Claude-facing message for the first turn of a conversation."""
    if agent_type == "blogpost":
        tone = metadata.get("tone", "hopeful")
        return (
            f"You are helping my wife communicate updates about her ongoing cancer treatment "
            f"for choriocarcinoma.\n"
            f"Write a CaringBridge-style blog post with a {tone} tone from her perspective. "
            f"Provide a title for the blog post and also provide Facebook post text that can be "
            f"used when sharing on social media. Finally, close each blog post with #AmandaStrong.\n\n"
            f"Notes:\n{display_content}"
        )
    # For promptassist, the frontend sends the pre-built structured prompt as display_content
    return display_content


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_user_email() -> str:
    return request.headers.get("CF-Access-Authenticated-User-Email") or DEV_USER


def row_to_dict(row) -> dict:
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


def save_message(conn, conversation_id: int, role: str, content: str,
                 display_content: str = None, metadata: dict = None) -> dict:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            INSERT INTO agents.messages
                (conversation_id, role, content, display_content, metadata)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, role, content, display_content, metadata, created_at
        """, (
            conversation_id, role, content, display_content,
            json.dumps(metadata) if metadata else None,
        ))
        row = row_to_dict(cur.fetchone())
        cur.execute(
            "UPDATE agents.conversations SET updated_at = NOW() WHERE id = %s",
            (conversation_id,),
        )
    return row


def load_claude_history(conn, conversation_id: int) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT role, content FROM agents.messages
            WHERE conversation_id = %s ORDER BY created_at
        """, (conversation_id,))
        return [{"role": r["role"], "content": r["content"]} for r in cur.fetchall()]


# ── Conversation endpoints ────────────────────────────────────────────────────

@app.route("/api/conversations", methods=["POST"])
def create_conversation():
    user_email = get_user_email()
    data = request.get_json() or {}
    agent_type = data.get("agent_type", "")
    if agent_type not in AGENTS:
        return jsonify({"error": "Invalid agent_type"}), 400

    conn = None
    try:
        conn = get_db()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO agents.conversations (user_email, agent_type)
                VALUES (%s, %s)
                RETURNING id, agent_type, title, created_at, updated_at
            """, (user_email, agent_type))
            row = row_to_dict(cur.fetchone())
        conn.commit()
        return jsonify(row), 201
    except Exception as e:
        app.logger.exception(f"create_conversation error: {e}")
        return jsonify({"error": "Server error"}), 500
    finally:
        if conn:
            conn.close()


@app.route("/api/conversations", methods=["GET"])
def list_conversations():
    user_email = get_user_email()
    agent_type = request.args.get("agent")
    conn = None
    try:
        conn = get_db()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            params = [user_email]
            agent_filter = "AND c.agent_type = %s" if agent_type else ""
            if agent_type:
                params.append(agent_type)
            cur.execute(f"""
                SELECT c.id, c.agent_type, c.title, c.updated_at,
                    (SELECT COALESCE(display_content, content)
                     FROM agents.messages
                     WHERE conversation_id = c.id AND role = 'user'
                     ORDER BY created_at LIMIT 1) AS preview
                FROM agents.conversations c
                WHERE c.user_email = %s {agent_filter}
                ORDER BY c.updated_at DESC
                LIMIT 50
            """, params)
            rows = [row_to_dict(r) for r in cur.fetchall()]
        return jsonify({"conversations": rows}), 200
    except Exception as e:
        app.logger.exception(f"list_conversations error: {e}")
        return jsonify({"conversations": []}), 200
    finally:
        if conn:
            conn.close()


@app.route("/api/conversations/<int:conv_id>", methods=["GET"])
def get_conversation(conv_id):
    user_email = get_user_email()
    conn = None
    try:
        conn = get_db()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT id, agent_type, title, created_at, updated_at
                FROM agents.conversations
                WHERE id = %s AND user_email = %s
            """, (conv_id, user_email))
            conv = cur.fetchone()
            if not conv:
                return jsonify({"error": "Not found"}), 404
            cur.execute("""
                SELECT id, role, content, display_content, metadata, created_at
                FROM agents.messages
                WHERE conversation_id = %s
                ORDER BY created_at
            """, (conv_id,))
            messages = [row_to_dict(r) for r in cur.fetchall()]
        result = row_to_dict(conv)
        result["messages"] = messages
        return jsonify(result), 200
    except Exception as e:
        app.logger.exception(f"get_conversation {conv_id} error: {e}")
        return jsonify({"error": "Server error"}), 500
    finally:
        if conn:
            conn.close()


@app.route("/api/conversations/<int:conv_id>", methods=["DELETE"])
def delete_conversation(conv_id):
    user_email = get_user_email()
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM agents.conversations WHERE id = %s AND user_email = %s",
                (conv_id, user_email),
            )
        conn.commit()
        return jsonify({"ok": True}), 200
    except Exception as e:
        app.logger.exception(f"delete_conversation {conv_id} error: {e}")
        return jsonify({"ok": False}), 500
    finally:
        if conn:
            conn.close()


# ── Message send + streaming ──────────────────────────────────────────────────

@app.route("/api/conversations/<int:conv_id>/messages", methods=["POST"])
def send_message(conv_id):
    user_email = get_user_email()
    data = request.get_json() or {}
    display_content = (data.get("content") or "").strip()
    metadata = data.get("metadata") or {}
    is_first = bool(data.get("is_first", False))

    if not display_content:
        return jsonify({"error": "Missing content"}), 400

    conn = None
    try:
        conn = get_db()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, agent_type FROM agents.conversations WHERE id = %s AND user_email = %s",
                (conv_id, user_email),
            )
            conv = cur.fetchone()
        if not conv:
            return jsonify({"error": "Not found"}), 404

        agent_type = conv["agent_type"]

        # Build the content Claude actually receives
        if is_first:
            claude_content = build_first_user_message(agent_type, display_content, metadata)
            # Auto-title from first message
            title = display_content[:60].rstrip()
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE agents.conversations SET title = %s WHERE id = %s",
                    (title, conv_id),
                )
        else:
            claude_content = display_content

        # Save user message (content = what Claude sees, display_content = what UI shows)
        user_msg = save_message(
            conn, conv_id, "user",
            content=claude_content,
            display_content=display_content,
            metadata=metadata if is_first else None,
        )

        # Load full history for Claude within the same transaction so the
        # just-inserted row is included without needing a second round-trip.
        history = load_claude_history(conn, conv_id)
        conn.commit()

    except Exception as e:
        app.logger.exception(f"send_message {conv_id} error: {e}")
        return jsonify({"error": "Server error"}), 500
    finally:
        if conn:
            conn.close()

    session_id = str(uuid.uuid4())
    stream_key = f"agent:stream:{session_id}"
    redis_client.setex(stream_key, STREAM_TTL, json.dumps({"content": "", "done": False}))

    system_prompt = AGENTS[agent_type]["system"]

    def generate(conv_id: int, session_id: str, history: list, system_prompt: str):
        stream_key = f"agent:stream:{session_id}"
        state = {"content": "", "done": False}
        full_text = ""

        try:
            completion = claude.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=system_prompt,
                messages=history,
            )
            full_text = (completion.content[0].text or "").strip()
            chunk_size = 150
            content = ""
            for chunk in [full_text[i: i + chunk_size] for i in range(0, len(full_text), chunk_size)]:
                content += chunk
                state["content"] = content
                redis_client.setex(stream_key, STREAM_TTL, json.dumps(state))
                time.sleep(0.2)

        except Exception as e:
            app.logger.exception(f"[generate] error for {session_id}: {e}")
            state["content"] += f"\n\n[Error: {e}]"
            full_text = state["content"]

        finally:
            state["done"] = True
            redis_client.setex(stream_key, STREAM_TTL, json.dumps(state))
            if full_text and not full_text.startswith("\n\n[Error"):
                c = None
                try:
                    c = get_db()
                    save_message(c, conv_id, "assistant", content=full_text)
                    c.commit()
                except Exception as e:
                    app.logger.exception(f"Failed to save assistant message: {e}")
                finally:
                    if c:
                        c.close()

    threading.Thread(
        target=generate, args=(conv_id, session_id, history, system_prompt), daemon=True
    ).start()

    return jsonify({"session_id": session_id, "user_message": user_msg}), 200


@app.route("/api/conversations/<int:conv_id>/stream", methods=["GET"])
def stream_poll(conv_id):
    session_id = request.args.get("session_id", "")
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400
    raw = redis_client.get(f"agent:stream:{session_id}")
    if not raw:
        return jsonify({"content": "", "done": False}), 200
    try:
        state = json.loads(raw)
    except json.JSONDecodeError:
        state = {"content": "", "done": False}
    return jsonify({"content": state.get("content", ""), "done": bool(state.get("done", False))}), 200


# ── Health ────────────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


# ── Startup ───────────────────────────────────────────────────────────────────

ensure_schema()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
