export default function MessageBubble({ message, streaming = false }) {
  const isUser = message.role === "user";
  const text = message.display_content ?? message.content ?? "";

  return (
    <div className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-brand flex items-center justify-center text-white text-xs font-bold shadow-soft mb-0.5">
          AI
        </div>
      )}

      {/* Bubble */}
      <div
        className={`
          max-w-[72%] rounded-2xl px-4 py-3 shadow-soft text-sm leading-relaxed
          ${isUser
            ? "bg-brand text-white rounded-br-sm"
            : "bg-white text-ink border border-gray-100 rounded-bl-sm"
          }
        `}
      >
        {streaming && !text ? (
          <span className="flex gap-1 items-center h-5">
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {text}
            {streaming && <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-middle" />}
          </div>
        )}
      </div>
    </div>
  );
}
