import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import ConversationSidebar from "./ConversationSidebar";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";

export const AGENT_META = {
  blogpost: {
    label: "CaringBridge Blog Assistant",
    description: "Turn medical notes into CaringBridge-style updates.",
    inputLabel: "Notes",
    placeholder: "Paste your notes from the doctor here...",
    defaultOptions: { tone: "hopeful" },
    options: [
      {
        key: "tone", label: "Tone", type: "select",
        choices: ["hopeful", "neutral", "optimistic", "compassionate"],
      },
    ],
  },
  promptassist: {
    label: "ChatGPT Prompt Assistant",
    description: "Craft precise, effective prompts for ChatGPT.",
    inputLabel: "Request",
    placeholder: "What do you want ChatGPT to do?",
    defaultOptions: {
      persona: "Helpful assistant",
      tone: "neutral",
      context: "",
      constraints: "",
      outputFormat: "bullets",
    },
    options: [
      { key: "persona", label: "Persona", type: "text", placeholder: "e.g. Financial advisor" },
      {
        key: "tone", label: "Tone", type: "select",
        choices: ["neutral", "friendly", "professional", "direct", "hopeful", "compassionate", "funny"],
      },
      { key: "context", label: "Context", type: "textarea", placeholder: "Relevant background..." },
      { key: "constraints", label: "Constraints", type: "textarea", placeholder: "Word count, budget, do/don't..." },
      {
        key: "outputFormat", label: "Format", type: "select",
        choices: ["bullets", "steps", "template", "prose"],
        labels: { bullets: "Bullets", steps: "Numbered steps", template: "Template", prose: "Prose" },
      },
    ],
  },
};

function buildPromptAssistContent(inputText, options) {
  const parts = [
    `You are: ${options.persona || "Helpful assistant"}`,
    `Tone: ${options.tone || "neutral"}`,
    `Task: ${inputText || "[No request provided]"}`,
  ];
  if (options.context?.trim()) parts.push(`Context:\n${options.context}`);
  if (options.constraints?.trim()) parts.push(`Constraints:\n${options.constraints}`);
  const formatLabel = {
    bullets: "Bulleted list", steps: "Numbered steps",
    template: "Template with placeholders", prose: "Prose format",
  }[options.outputFormat] || "Prose format";
  parts.push(`Output format: ${formatLabel}`);
  return parts.join("\n\n");
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export { relativeTime };

export default function ChatPage({ apiUrl, agentType }) {
  const navigate = useNavigate();
  const meta = AGENT_META[agentType];

  // Redirect unknown agent types
  useEffect(() => {
    if (!meta) navigate("/");
  }, [meta, navigate]);

  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState(null); // null | string
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const messagesEndRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamingContent, scrollToBottom]);

  // ── Conversation management ─────────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    if (!apiUrl) return;
    try {
      const res = await fetch(`${apiUrl}/conversations?agent=${agentType}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } catch {}
  }, [apiUrl, agentType]);

  useEffect(() => {
    setActiveConvId(null);
    setMessages([]);
    setStreamingContent(null);
    fetchConversations();
  }, [agentType, fetchConversations]);

  const loadConversation = useCallback(async (convId) => {
    if (!apiUrl) return;
    try {
      const res = await fetch(`${apiUrl}/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveConvId(convId);
        setMessages(data.messages ?? []);
        setStreamingContent(null);
      }
    } catch {}
  }, [apiUrl]);

  const startNewChat = useCallback(async () => {
    if (!apiUrl) return null;
    try {
      const res = await fetch(`${apiUrl}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_type: agentType }),
      });
      if (res.ok) {
        const conv = await res.json();
        setActiveConvId(conv.id);
        setMessages([]);
        setStreamingContent(null);
        await fetchConversations();
        return conv.id;
      }
    } catch {}
    return null;
  }, [apiUrl, agentType, fetchConversations]);

  const deleteConversation = useCallback(async (convId) => {
    if (!apiUrl) return;
    try {
      await fetch(`${apiUrl}/conversations/${convId}`, { method: "DELETE" });
    } catch {}
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (activeConvId === convId) {
      setActiveConvId(null);
      setMessages([]);
      setStreamingContent(null);
    }
  }, [apiUrl, activeConvId]);

  // ── Sending messages ────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (inputText, options) => {
    if (!inputText.trim() || streamingContent !== null) return;

    const isFirst = messages.length === 0;

    // For promptassist, build the full structured prompt as the claude content.
    // The display content (what the user typed) is sent separately.
    const claudeContent = (agentType === "promptassist" && isFirst)
      ? buildPromptAssistContent(inputText, options)
      : inputText;

    // Ensure we have a conversation
    let convId = activeConvId;
    if (!convId) {
      convId = await startNewChat();
      if (!convId) return;
    }

    // Optimistic user bubble — show display text immediately
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: tempId,
      role: "user",
      display_content: inputText,
      content: claudeContent,
      metadata: isFirst ? options : null,
      created_at: new Date().toISOString(),
    }]);
    setStreamingContent("");

    try {
      const res = await fetch(`${apiUrl}/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: claudeContent,
          metadata: isFirst ? options : {},
          is_first: isFirst,
        }),
      });

      if (!res.ok) throw new Error("Send failed");
      const data = await res.json();
      const { session_id, user_message } = data;

      // Replace temp bubble with the persisted one (keep display_content)
      if (user_message) {
        setMessages((prev) => prev.map((m) =>
          m.id === tempId
            ? { ...user_message, display_content: inputText }
            : m
        ));
      }

      // Poll for streaming response
      let lastLen = 0;
      let idle = 0;

      while (true) {
        const poll = await fetch(`${apiUrl}/conversations/${convId}/stream?session_id=${session_id}`);
        if (!poll.ok) break;
        const { content, done } = await poll.json();

        if (content.length > lastLen) {
          setStreamingContent(content);
          lastLen = content.length;
          idle = 0;
        } else {
          idle++;
        }

        if (done && idle >= 3) {
          setMessages((prev) => [...prev, {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content,
            created_at: new Date().toISOString(),
          }]);
          setStreamingContent(null);
          fetchConversations();
          break;
        }

        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (err) {
      console.error("sendMessage error:", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setStreamingContent(null);
    }
  }, [apiUrl, agentType, activeConvId, messages.length, streamingContent, startNewChat, fetchConversations]);

  if (!meta) return null;

  return (
    <div className="flex h-full overflow-hidden">
      <ConversationSidebar
        open={sidebarOpen}
        conversations={conversations}
        activeId={activeConvId}
        onSelect={loadConversation}
        onNew={startNewChat}
        onDelete={deleteConversation}
        agentLabel={meta.label}
      />

      {/* Main panel */}
      <div className="flex flex-col flex-1 min-w-0 bg-bg">
        {/* Top bar */}
        <div className="shrink-0 bg-white border-b px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="text-inkLight hover:text-ink p-1 rounded"
            title="Toggle sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <span className="font-semibold text-ink">{meta.label}</span>
          <button
            onClick={() => navigate("/")}
            className="ml-auto text-sm text-inkLight hover:text-ink"
          >
            ← Agents
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {messages.length === 0 && streamingContent === null && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-2xl font-semibold text-ink mb-2">{meta.label}</p>
              <p className="text-inkLight text-sm">{meta.description}</p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {streamingContent !== null && (
            <MessageBubble
              message={{ role: "assistant", content: streamingContent, created_at: new Date().toISOString() }}
              streaming
            />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 bg-white border-t px-4 py-3">
          <ChatInput
            agentType={agentType}
            meta={meta}
            onSend={sendMessage}
            disabled={streamingContent !== null}
            isFirstMessage={messages.length === 0}
          />
        </div>
      </div>
    </div>
  );
}
