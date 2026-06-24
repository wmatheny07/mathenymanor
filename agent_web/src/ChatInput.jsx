import { useState, useRef, useEffect } from "react";

export default function ChatInput({ agentType, meta, onSend, disabled, isFirstMessage }) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState(meta.defaultOptions);
  const [optionsOpen, setOptionsOpen] = useState(isFirstMessage);
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  // Show options on first message for promptassist, close after first send
  useEffect(() => {
    if (agentType === "promptassist") setOptionsOpen(isFirstMessage);
  }, [isFirstMessage, agentType]);

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim(), options);
    setText("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const setOption = (key, value) => setOptions((o) => ({ ...o, [key]: value }));

  return (
    <div className="flex flex-col gap-2">
      {/* Options panel */}
      {meta.options.length > 0 && (
        <div>
          <button
            onClick={() => setOptionsOpen((o) => !o)}
            className="text-xs text-inkLight hover:text-ink flex items-center gap-1"
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              className={`transition-transform ${optionsOpen ? "rotate-90" : ""}`}
            >
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            {optionsOpen ? "Hide options" : "Options"}
          </button>

          {optionsOpen && (
            <div className="mt-2 p-3 bg-gray-50 rounded-xl border flex flex-wrap gap-3">
              {meta.options.map((opt) => (
                <div key={opt.key} className="flex flex-col gap-1 min-w-0">
                  <label className="text-xs font-medium text-inkLight">{opt.label}</label>
                  {opt.type === "select" ? (
                    <select
                      value={options[opt.key] ?? ""}
                      onChange={(e) => setOption(opt.key, e.target.value)}
                      className="text-xs border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand"
                    >
                      {opt.choices.map((c) => (
                        <option key={c} value={c}>
                          {opt.labels?.[c] ?? c.charAt(0).toUpperCase() + c.slice(1)}
                        </option>
                      ))}
                    </select>
                  ) : opt.type === "textarea" ? (
                    <textarea
                      value={options[opt.key] ?? ""}
                      onChange={(e) => setOption(opt.key, e.target.value)}
                      placeholder={opt.placeholder}
                      rows={2}
                      className="text-xs border rounded-lg px-2 py-1 bg-white w-48 resize-none focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  ) : (
                    <input
                      type="text"
                      value={options[opt.key] ?? ""}
                      onChange={(e) => setOption(opt.key, e.target.value)}
                      placeholder={opt.placeholder}
                      className="text-xs border rounded-lg px-2 py-1 bg-white w-40 focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Textarea + send */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={meta.placeholder}
          disabled={disabled}
          className="flex-1 resize-none border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50 bg-white"
          style={{ minHeight: "48px", maxHeight: "200px" }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="shrink-0 bg-brand text-white rounded-xl p-3 hover:opacity-90 transition disabled:opacity-40"
          title="Send (Enter)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
      <p className="text-xs text-inkLight">Enter to send · Shift+Enter for new line</p>
    </div>
  );
}
