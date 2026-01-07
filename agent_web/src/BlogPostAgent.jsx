import { useMemo, useState } from "react";
import { getSessionId } from "./sessionId";
import { useNavigate } from "react-router-dom";

export default function BlogPostAgent({ apiUrl }) {
  const navigate = useNavigate();

  // Inputs
  const [notes, setNotes] = useState("");
  const [tone, setTone] = useState("hopeful");

  // Output
  const [builtPrompt, setBuiltPrompt] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  // Show exactly what you’re sending
  const prompt = useMemo(() => {
    return `
You are helping my wife communicate updates about her ongoing cancer treatment for choriocarcinoma.
Write a CaringBridge-style blog post with a ${tone} tone from her perspective. Provide a title for the blog post and also provide Facebook
post text that can be used when sharing on social media. Finally, close each blog post with #AmandaStrong.

Notes:
${notes || "[No notes provided]"}
    `.trim();
  }, [tone, notes]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!apiUrl) return setError("API URL not defined");
    if (!notes.trim()) return setError("Please paste notes to generate a post.");

    setLoading(true);
    setResult("");
    setError("");
    setProgress(0);

    const sessionId = getSessionId();
    setBuiltPrompt(prompt);

    try {
      const startRes = await fetch(`${apiUrl}/agents/blogpost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, tone, sessionId }),
      });

      if (!startRes.ok) throw new Error("Failed to start blog post");
      const { session_id } = await startRes.json();

      if (session_id && session_id !== sessionId) {
        console.warn("Backend returned a different session_id than requested");
      }

      let lastSentLength = 0;
      let idleCounter = 0;

      while (true) {
        const chunkRes = await fetch(`${apiUrl}/agents/blogpost/${sessionId}`);
        if (!chunkRes.ok) throw new Error(`Chunk fetch failed: ${chunkRes.status}`);
        const data = await chunkRes.json();

        const content = data.content || "";

        if (content.length > lastSentLength) {
          setResult(content);
          lastSentLength = content.length;
          idleCounter = 0;
        } else {
          idleCounter += 1;
        }

        const done = data.done === true;
        if (done && idleCounter >= 3) break;

        setProgress((prev) => Math.min(prev + 5, 95));
        await new Promise((r) => setTimeout(r, 200));
      }

      setProgress(100);
    } catch (err) {
      console.error("Failed to generate blog post:", err);
      setError("Failed to generate blog post. Please try again.");
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(0), 700);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate("/")}
          className="text-blue-600 underline hover:text-blue-800"
        >
          ← Back to Agents
        </button>
        <h2 className="text-2xl font-semibold">CaringBridge Blog Assistant</h2>
        <div />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Inputs */}
        <div className="bg-white rounded-2xl shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Inputs</h3>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full h-56 border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Paste notes from your doctor here..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Tone</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full border p-2 rounded-lg"
              >
                <option value="hopeful">Hopeful</option>
                <option value="neutral">Neutral</option>
                <option value="optimistic">Optimistic</option>
                <option value="compassionate">Compassionate</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || !notes.trim()}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? "Generating..." : "Generate Blog Post"}
            </button>
          </form>

          {error && <p className="text-red-500 mt-4">{error}</p>}
        </div>

        {/* RIGHT: Prompt + Progress + Response */}
        <div className="bg-white rounded-2xl shadow-md p-6 flex flex-col min-h-[520px]">
          <h3 className="text-lg font-semibold mb-3">Prompt + Response</h3>

          <div className="mb-4">
            <p className="text-sm font-medium mb-1">Prompt being sent</p>
            <div className="rounded-lg border bg-gray-50 p-3 max-h-44 overflow-auto">
              <pre className="whitespace-pre-wrap text-sm break-words">
                {builtPrompt || prompt}
              </pre>
            </div>
          </div>

          {loading && (
            <div className="mb-4">
              <p className="text-sm font-medium mb-1">Progress</p>
              <div className="w-full bg-gray-200 h-2 rounded">
                <div
                  className="bg-blue-600 h-2 rounded transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <p className="text-sm font-medium mb-1">Response</p>
          <div className="flex-1 rounded-lg border bg-gray-50 p-3 overflow-auto">
            {result ? (
              <div className="whitespace-pre-wrap break-words text-sm">{result}</div>
            ) : (
              <p className="text-gray-500 text-sm">Run a request to see the response here.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}