import { useState } from "react";
import { getSessionId } from "./sessionId";

export default function BlogPostAgent({ apiUrl, onBack }) {
  const [notes, setNotes] = useState("");
  const [tone, setTone] = useState("hopeful");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!apiUrl) return setError("API URL not defined");

    setLoading(true);
    setResult("");
    setError("");
    setProgress(0); // start progress when generation begins

    try {
      // Start blog post generation
      const sessionId = getSessionId();

      const startRes = await fetch(`${apiUrl}/agents/blogpost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, tone, sessionId }),  // 👈 send it
      });

      if (!startRes.ok) throw new Error("Failed to start blog post");
      const { session_id } = await startRes.json();

      // sanity check on session to ensure backend matches front end
      if (session_id !== sessionId) {
        console.warn("Backend returned a different session_id than requested");
      }

      // Poll for chunks
      let lastSentLength = 0;
      let idleCounter = 0;
      let done = false;

      while (!done) {
        let data;
        try {
          const chunkRes = await fetch(`${apiUrl}/agents/blogpost/${sessionId}`);
          if (!chunkRes.ok) throw new Error(`Chunk fetch failed: ${chunkRes.status}`);
          data = await chunkRes.json(); // only call once
        } catch (err) {
          console.error("Failed to fetch chunk", err);
          setError("Failed to fetch chunk. Please try again.");
          break;
        }

        const content = data.content || "";

        // Update result if new content is available
        if (content.length > lastSentLength) {
          setResult(content);
          lastSentLength = content.length;
          idleCounter = 0;
        } else {
          idleCounter += 1;
        }

        done = data.done === true;

        // Stop polling if done AND no new content for 3 polls
        if (done && idleCounter >= 3) break;

        // Smooth progress animation up to 95%
        setProgress((prev) => Math.min(prev + 5, 95));

        await new Promise((r) => setTimeout(r, 200));
      }

      // Complete progress
      setProgress(100);
    } catch (err) {
      console.error("Failed to generate blog post:", err);
      setError("Failed to generate blog post. Please try again.");
    } finally {
      setLoading(false);
      // Reset progress bar after short delay
      setTimeout(() => setProgress(0), 500);
    }
  };

  return (
    <div className="w-full max-w-2xl bg-white p-6 rounded-2xl shadow-md">
      <button onClick={onBack} className="text-blue-600 mb-4 underline hover:text-blue-800">
        ← Back to Agents
      </button>

      <h2 className="text-2xl font-semibold mb-4">CaringBridge Blog Assistant</h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full h-48 border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Paste notes from your doctor here..."
        />

        <select value={tone} onChange={(e) => setTone(e.target.value)} className="border p-2 rounded-lg">
          <option value="hopeful">Hopeful</option>
          <option value="neutral">Neutral</option>
          <option value="optimistic">Optimistic</option>
          <option value="compassionate">Compassionate</option>
        </select>

        <button
          type="submit"
          disabled={loading || !notes.trim()}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate Blog Post"}
        </button>
      </form>

      {/* Progress bar only visible while generating */}
      {loading && (
        <div className="mt-4 w-full bg-gray-200 h-2 rounded">
          <div className="bg-blue-600 h-2 rounded transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
      )}

      {error && <p className="text-red-500 mt-4">{error}</p>}

      {result && (
        <div className="mt-4 h-96 overflow-y-auto rounded-lg border bg-muted p-4">
          {/* <h3 className="text-lg font-semibold mb-2">Generated Post:</h3> */}
          <p className="whitespace-pre-wrap break-words">{result}</p>
        </div>
      )}
    </div>
  );
}