import { useMemo, useState } from "react";
import { getSessionId } from "./sessionId";
import { useNavigate } from "react-router-dom";

export default function PromptAssist({ apiUrl }) {
  const navigate = useNavigate();

  // Inputs
  const [persona, setPersona] = useState("Helpful assistant");
  const [tone, setTone] = useState("neutral");
  const [request, setRequest] = useState("");
  const [context, setContext] = useState("");
  const [constraints, setConstraints] = useState("");
  const [format, setFormat] = useState("bullets");

  // Output
  const [runPrompt, setRunPrompt] = useState(""); // ✅ last completed run
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  // Build the prompt locally so you can show EXACTLY what you're sending.
  const prompt = useMemo(() => {
    const parts = [];

    parts.push(`You are: ${persona}`);
    parts.push(`Tone: ${tone}`);
    parts.push(`Task: ${request || "[No request provided]"}`);

    if (context.trim()) parts.push(`Context:\n${context}`);
    if (constraints.trim()) parts.push(`Constraints:\n${constraints}`);

    parts.push(
      `Output format: ${
        format === "bullets"
          ? "Bulleted list"
          : format === "steps"
          ? "Numbered steps"
          : format == "templates"
          ? "Template with placeholders"
          : "Prose format"
      }`
    );

    // parts.push(
    //   `If anything is ambiguous, ask up to 3 clarifying questions first.`
    // );

    return parts.join("\n\n").trim();
  }, [persona, tone, request, context, constraints, format]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!apiUrl) return setError("API URL not defined");
    if (!request.trim()) return setError("Please enter a request.");

    setLoading(true);
    setResult("");
    setError("");
    setProgress(0);

    const sessionId = getSessionId();
    setRunPrompt(prompt); // show the exact prompt being sent

    try {
      const startRes = await fetch(`${apiUrl}/agents/promptassist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          // send BOTH structured inputs AND the final prompt
          persona,
          tone,
          request,
          context,
          constraints,
          format,
          prompt,
        }),
      });

      if (!startRes.ok) throw new Error("Failed to start response...");
      const { session_id } = await startRes.json();

      if (session_id && session_id !== sessionId) {
        console.warn("Backend returned a different session_id than requested");
      }

      // Poll
      let lastLen = 0;
      let idle = 0;

      while (true) {
        const chunkRes = await fetch(`${apiUrl}/agents/promptassist/${sessionId}`);
        if (!chunkRes.ok) throw new Error(`Chunk fetch failed: ${chunkRes.status}`);
        const data = await chunkRes.json();

        const content = data.content || "";

        if (content.length > lastLen) {
          setResult(content);
          lastLen = content.length;
          idle = 0;
        } else {
          idle += 1;
        }

        const done = data.done === true;
        if (done && idle >= 3) break;

        setProgress((p) => Math.min(p + 4, 95));
        await new Promise((r) => setTimeout(r, 200));
      }

      setProgress(100);
    } catch (err) {
      console.error(err);
      setError("Failed to generate response. Please try again.");
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
        <h2 className="text-2xl font-semibold">ChatGPT Prompt Assistant</h2>
        <div />
      </div>

      {/* 2-column layout on desktop, 1-column on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Inputs */}
        <div className="bg-white rounded-2xl shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Inputs</h3>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Persona / Role
              </label>
              <input
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                className="w-full border rounded-lg p-2"
                placeholder="e.g., Financial planning assistant"
              />
              <p className="text-xs text-gray-500 mt-1">
                Who should ChatGPT “be” while responding?
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Tone</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full border rounded-lg p-2"
              >
                <option value="neutral">Neutral</option>
                <option value="friendly">Friendly</option>
                <option value="professional">Professional</option>
                <option value="direct">Direct</option>
                <option value="hopeful">Hopeful</option>
                <option value="compassionate">Compassionate</option>
                <option value="funny">Funny</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Request</label>
              <textarea
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                className="w-full h-28 border rounded-lg p-2"
                placeholder="e.g., Provide me with a 5-year financial plan to maximize savings."
              />
              <p className="text-xs text-gray-500 mt-1">
                What you want done (be specific).
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Context</label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="w-full h-24 border rounded-lg p-2"
                placeholder="Relevant background, constraints, facts..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Constraints / Guardrails
              </label>
              <textarea
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                className="w-full h-20 border rounded-lg p-2"
                placeholder="Budget, word count, do/don’t, assumptions..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Output Format
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full border rounded-lg p-2"
              >
                <option value="bullets">Bullets</option>
                <option value="steps">Numbered Steps</option>
                <option value="template">Template</option>
                <option value="prose">Prose</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || !request.trim()}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? "Generating..." : "Generate"}
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
              <p className="text-xs text-gray-500 mb-1">
                {runPrompt ? "Prompt used for last run" : "Live preview (not yet sent)"}
              </p>
              <pre className="whitespace-pre-wrap text-sm break-words">
                {runPrompt}
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
              <div className="whitespace-pre-wrap break-words text-sm">
                {result}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">
                Run a request to see the response here.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}