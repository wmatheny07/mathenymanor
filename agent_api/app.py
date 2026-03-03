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
from datetime import datetime, timezone  # ✅ needed for timestamps

load_dotenv(dotenv_path="/opt/config/runtime/.env.all")
app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
app.logger.setLevel(logging.INFO)
CORS(app, resources={r"/agents/*": {"origins": "https://agents.mathenymanor.com"}})
#CORS(app, resources={r"/api/agents/*": {"origins": "http://localhost:3001"}})

# Prefer env var, but fall back to docker service name `redis`
REDIS_URL = os.getenv("REDIS_URL") or "redis://redis:6379/0"

if not REDIS_URL:
    raise RuntimeError("REDIS_URL is not set and no default provided")

redis_client = redis.from_url(
    REDIS_URL,
    decode_responses=True,
)

SESSION_PREFIX = "agent:caringbridge:session:"
PROMPTASSIST_PREFIX = "agent:promptassist:session:"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days

# Initialize Anthropic client
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

def load_session_with_prefix(prefix: str, session_id: str) -> dict:
    key = prefix + session_id
    raw = redis_client.get(key)
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}

def save_session_with_prefix(prefix: str, session_id: str, state: dict) -> None:
    key = prefix + session_id
    state.setdefault(
        "updatedAt",
        datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )
    redis_client.setex(key, SESSION_TTL_SECONDS, json.dumps(state))

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
            completion = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=(
                    "You are compassionate, warm, clear, and accurate. "
                    "You help families write CaringBridge-style updates that are "
                    "honest about the medical journey but also hopeful and grateful."
                ),
                messages=local_messages,
            )

            full_text = completion.content[0].text.strip()
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

@app.route("/api/agents/promptassist", methods=["POST"])
def start_promptassist():
    data = request.get_json() or {}

    # Expect the frontend to send the final composed prompt
    prompt = (data.get("prompt") or "").strip()

    # Optional: structured fields (nice for debugging / saving)
    persona = data.get("persona", "")
    tone = data.get("tone", "professional")
    request_text = data.get("request", "")
    context = data.get("context", "")
    constraints = data.get("constraints", "")
    output_format = data.get("outputFormat", "")
    ask_first = bool(data.get("askFirst", True))

    session_id = data.get("sessionId") or str(uuid.uuid4())

    if not prompt:
        return jsonify({"error": "Missing 'prompt'"}), 400

    # 1) Load / init session state
    session_state = load_session_with_prefix(PROMPTASSIST_PREFIX, session_id)

    messages = session_state.get("messages", [])
    messages.append({"role": "user", "content": prompt})
    session_state["messages"] = messages

    # 2) reset streaming state
    session_state["content"] = ""
    session_state["done"] = False

    # Save inputs for transparency / debugging
    session_state["prompt"] = prompt
    session_state["persona"] = persona
    session_state["tone"] = tone
    session_state["request"] = request_text
    session_state["context"] = context
    session_state["constraints"] = constraints
    session_state["outputFormat"] = output_format
    session_state["askFirst"] = ask_first

    save_session_with_prefix(PROMPTASSIST_PREFIX, session_id, session_state)

    def generate_chunks(session_id: str):
        local_state = load_session_with_prefix(PROMPTASSIST_PREFIX, session_id) or {}
        local_messages = local_state.get("messages", [])

        app.logger.info(f"[promptassist] START generation for {session_id}")

        try:
            completion = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=(
                    "Please follow the upcoming guidance in providing the optimal response:\n"
                    "No follow up questions asked, please.\n"
                ),
                messages=local_messages,
            )

            full_text = (completion.content[0].text or "").strip()
            chunk_size = 150
            chunks = [full_text[i : i + chunk_size] for i in range(0, len(full_text), chunk_size)]

            content = local_state.get("content", "")
            app.logger.info(
                f"[promptassist] Generated {len(full_text)} chars in {len(chunks)} chunks for {session_id}"
            )

            for idx, chunk in enumerate(chunks):
                content += chunk
                local_state["content"] = content
                local_state["done"] = False
                save_session_with_prefix(PROMPTASSIST_PREFIX, session_id, local_state)

                app.logger.info(
                    f"[promptassist] Saved chunk {idx+1}/{len(chunks)} for {session_id} "
                    f"(content_len={len(content)})"
                )
                time.sleep(0.2)

            app.logger.info(f"[promptassist] FINISHED streaming for {session_id}")

        except Exception as e:
            app.logger.exception(f"[promptassist] ERROR during generation for {session_id}: {e}")
            content = local_state.get("content", "")
            content += f"\n\n[ERROR generating prompt assist response: {e}]"
            local_state["content"] = content

        finally:
            app.logger.info(f"[promptassist] Marking {session_id} done=True in finally")
            local_state["done"] = True
            try:
                save_session_with_prefix(PROMPTASSIST_PREFIX, session_id, local_state)
                app.logger.info(f"[promptassist] Saved final state for {session_id}")
            except Exception as e:
                app.logger.exception(f"[promptassist] FAILED to save final state for {session_id}: {e}")

    threading.Thread(target=generate_chunks, args=(session_id,), daemon=True).start()
    return jsonify({"session_id": session_id}), 200


@app.route("/api/agents/promptassist/<session_id>", methods=["GET"])
def get_promptassist_chunk(session_id):
    session_state = load_session_with_prefix(PROMPTASSIST_PREFIX, session_id)

    if not session_state:
        return jsonify({"content": "", "done": False, "updatedAt": None}), 200

    app.logger.info(
        f"[promptassist] GET chunk for {session_id} | done={session_state.get('done')} | "
        f"content_len={len(session_state.get('content', ''))}"
    )

    return jsonify(
        {
            "content": session_state.get("content", ""),
            "done": bool(session_state.get("done", False)),
            "updatedAt": session_state.get("updatedAt"),
            # Optional: return the saved prompt too (handy for UI verification)
            "prompt": session_state.get("prompt", ""),
        }
    ), 200

@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
    # For testing
    #app.run(host="0.0.0.0", port=9999, debug=True)