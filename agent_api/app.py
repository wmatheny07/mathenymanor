from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
import uuid
import time
import threading
import os
from dotenv import load_dotenv
import json
import redis
import logging
from datetime import datetime, timezone  # ✅ needed for timestamps

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
app.logger.setLevel(logging.INFO)
CORS(app, resources={r"/agents/*": {"origins": "https://agents.mathenymanor.com"}})

# ✅ Redis client pointing at your existing instance
redis_client = redis.from_url(
    os.environ.get("REDIS_URL", "redis://10.18.0.12:6379/0"),
    decode_responses=True,  # return str instead of bytes
)

SESSION_PREFIX = "agent:caringbridge:session:"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days

# Initialize OpenAI client
load_dotenv(dotenv_path="/opt/config/.env")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def load_session(session_id: str) -> dict:
    """Load session state from Redis, or return empty dict if none."""
    key = SESSION_PREFIX + session_id
    raw = redis_client.get(key)
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def save_session(session_id: str, state: dict) -> None:
    """Save session state into Redis with TTL."""
    key = SESSION_PREFIX + session_id
    state.setdefault(
        "updatedAt",
        datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )
    redis_client.setex(key, SESSION_TTL_SECONDS, json.dumps(state))


@app.route("/api/agents/blogpost", methods=["POST"])
def start_blog_post():
    data = request.get_json() or {}
    notes = data.get("notes", "")
    tone = data.get("tone", "hopeful")
    session_id = data.get("sessionId") or str(uuid.uuid4())

    # 1) Load / init session state
    session_state = load_session(session_id)

    prompt = f"""
You are helping my wife communicate updates about her ongoing cancer treatment for choriocarcinoma.
Write a CaringBridge-style blog post with a {tone} tone from her perspective. Provide a title for the blog post and also provide Facebook
post text that can be used when sharing on social media. Finally, close each blog post with #AmandaStrong.

Notes:
{notes}
""".strip()

    messages = session_state.get("messages", [])
    messages.append({"role": "user", "content": prompt})
    session_state["messages"] = messages

    # 2) reset streaming state
    session_state["content"] = ""
    session_state["done"] = False
    session_state["tone"] = tone
    session_state["notes"] = notes
    save_session(session_id, session_state)

    def generate_chunks(session_id: str):
        local_state = load_session(session_id) or {}
        local_messages = local_state.get("messages", [])

        app.logger.info(f"[blogpost] START generation for {session_id}")

        try:
            completion = client.chat.completions.create(
                model="gpt-5",  # or whatever you’re actually using
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are compassionate, warm, clear, and accurate. "
                            "You help families write CaringBridge-style updates that are "
                            "honest about the medical journey but also hopeful and grateful."
                        ),
                    },
                    *local_messages,
                ],
            )

            full_text = completion.choices[0].message.content.strip()
            chunk_size = 150
            chunks = [
                full_text[i : i + chunk_size]
                for i in range(0, len(full_text), chunk_size)
            ]

            content = local_state.get("content", "")
            app.logger.info(
                f"[blogpost] Generated {len(full_text)} chars "
                f"in {len(chunks)} chunks for {session_id}"
            )

            for idx, chunk in enumerate(chunks):
                content += chunk
                local_state["content"] = content
                local_state["done"] = False
                save_session(session_id, local_state)
                app.logger.info(
                    f"[blogpost] Saved chunk {idx+1}/{len(chunks)} for {session_id} "
                    f"(content_len={len(content)})"
                )
                time.sleep(0.2)

            app.logger.info(f"[blogpost] FINISHED streaming for {session_id}")

        except Exception as e:
            app.logger.exception(f"[blogpost] ERROR during generation for {session_id}: {e}")
            content = local_state.get("content", "")
            content += f"\n\n[ERROR generating blog post: {e}]"
            local_state["content"] = content

        finally:
            app.logger.info(f"[blogpost] Marking {session_id} done=True in finally")
            local_state["done"] = True
            try:
                save_session(session_id, local_state)
                app.logger.info(f"[blogpost] Saved final state for {session_id}")
            except Exception as e:
                app.logger.exception(
                    f"[blogpost] FAILED to save final state for {session_id}: {e}"
                )

    threading.Thread(target=generate_chunks, args=(session_id,), daemon=True).start()
    return jsonify({"session_id": session_id}), 200


@app.route("/api/agents/blogpost/<session_id>", methods=["GET"])
def get_blog_post_chunk(session_id):
    session_state = load_session(session_id)

    if not session_state:
        # still initializing or state missing – treat as "not done yet"
        return jsonify(
            {
                "content": "",
                "done": False,
                "updatedAt": None,
            }
        ), 200

    app.logger.info(
        f"[blogpost] GET chunk for {session_id} | done={session_state.get('done')} | "
        f"content_len={len(session_state.get('content', ''))}"
    )

    return jsonify(
        {
            "content": session_state.get("content", ""),
            "done": bool(session_state.get("done", False)),
            "updatedAt": session_state.get("updatedAt"),
        }
    ), 200


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)