// sessionId.js
export function getSessionId() {
  let id = window.localStorage.getItem("cb_session_id");
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem("cb_session_id", id);
  }
  return id;
}