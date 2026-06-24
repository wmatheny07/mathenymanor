import { useState } from "react";
import { relativeTime } from "./ChatPage";

export default function ConversationSidebar({
  open, conversations, activeId, onSelect, onNew, onDelete, agentLabel,
}) {
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <aside
      className={`
        shrink-0 flex flex-col bg-white border-r overflow-hidden
        transition-all duration-300 ease-in-out
        ${open ? "w-64" : "w-0"}
      `}
    >
      <div className="flex flex-col h-full min-w-64">
        {/* Header */}
        <div className="px-4 py-4 border-b">
          <p className="text-xs font-semibold uppercase tracking-wider text-inkLight mb-3">
            {agentLabel}
          </p>
          <button
            onClick={onNew}
            className="w-full flex items-center gap-2 bg-brand text-white text-sm font-medium px-3 py-2 rounded-lg hover:opacity-90 transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Chat
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.length === 0 ? (
            <p className="text-xs text-inkLight px-4 py-3">No conversations yet.</p>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeId;
              const isHovered = conv.id === hoveredId;
              const title = conv.title || "New conversation";
              const preview = conv.preview ? conv.preview.slice(0, 60) : null;

              return (
                <div
                  key={conv.id}
                  className={`
                    group relative flex items-start gap-2 px-3 py-2.5 mx-1 rounded-lg cursor-pointer
                    ${isActive ? "bg-gray-100" : "hover:bg-gray-50"}
                  `}
                  onClick={() => onSelect(conv.id)}
                  onMouseEnter={() => setHoveredId(conv.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? "text-ink" : "text-ink"}`}>
                      {title}
                    </p>
                    {preview && (
                      <p className="text-xs text-inkLight truncate mt-0.5">{preview}</p>
                    )}
                    <p className="text-xs text-inkLight mt-0.5">
                      {relativeTime(conv.updated_at)}
                    </p>
                  </div>

                  {/* Delete button — appears on hover */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-inkLight hover:text-red-500 p-0.5 rounded transition-opacity"
                    title="Delete"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
