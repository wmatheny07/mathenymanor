import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import ChatPage from "./ChatPage";
import { AGENT_META } from "./ChatPage";

const CHAT_ROUTES = ["/blogpost", "/promptassist"];

export default function App() {
  const apiUrl = import.meta.env.VITE_API_URL;
  const navigate = useNavigate();
  const location = useLocation();
  const isChatPage = CHAT_ROUTES.includes(location.pathname);

  return (
    <div className={`flex flex-col h-full bg-bg ${isChatPage ? "overflow-hidden" : ""}`}>
      <Navbar />

      {isChatPage ? (
        /* Chat routes get the full remaining height with no padding */
        <div className="flex-1 min-h-0">
          <Routes>
            <Route path="/blogpost"     element={<ChatPage apiUrl={apiUrl} agentType="blogpost" />} />
            <Route path="/promptassist" element={<ChatPage apiUrl={apiUrl} agentType="promptassist" />} />
          </Routes>
        </div>
      ) : (
        <main className="max-w-7xl mx-auto px-6 py-12 w-full">
          <Routes>
            <Route
              path="/"
              element={
                <div className="grid grid-cols-1 gap-4 max-w-lg">
                  {Object.entries(AGENT_META).map(([type, meta]) => (
                    <button
                      key={type}
                      onClick={() => navigate(`/${type}`)}
                      className="bg-white p-6 rounded-2xl shadow-soft text-left hover:shadow-md transition"
                    >
                      <h2 className="text-xl font-semibold text-ink">{meta.label}</h2>
                      <p className="text-inkLight mt-2 text-sm">{meta.description}</p>
                    </button>
                  ))}
                </div>
              }
            />
          </Routes>
        </main>
      )}
    </div>
  );
}
