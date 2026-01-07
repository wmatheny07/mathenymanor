import { Routes, Route, useNavigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import BlogPostAgent from "./BlogPostAgent";
import PromptAssist from "./PromptAssist";

console.log("render App");

export default function App() {
  /* const apiUrl = import.meta.env.VITE_API_URL; */
  /* For testing */
  const apiUrl = "http://localhost:8000/api";
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-12">
        <Routes>
          {/* Agent selector page */}
          <Route
            path="/"
            element={
              <div className="grid grid-cols-1 gap-6">
                <button
                  onClick={() => navigate("/blogpost")}
                  className="bg-white p-6 rounded-2xl shadow-soft text-left"
                >
                  <h2 className="text-xl font-semibold">
                    CaringBridge Blog Assistant
                  </h2>
                  <p className="text-inkLight mt-2">
                    Turn medical notes into CaringBridge-style updates.
                  </p>
                </button>

                <button
                  onClick={() => navigate("/promptassist")}
                  className="bg-white p-6 rounded-2xl shadow-soft text-left"
                >
                  <h2 className="text-xl font-semibold">
                    ChatGPT Prompt Assistant
                  </h2>
                  <p className="text-inkLight mt-2">
                    Assistance with crafting ChatGPT prompts.
                  </p>
                </button>
              </div>
            }
          />

          {/* Agent pages */}
          <Route
            path="/blogpost"
            element={<BlogPostAgent apiUrl={apiUrl} />}
          />

          <Route
            path="/promptassist"
            element={<PromptAssist apiUrl={apiUrl} />}
          />
        </Routes>
      </main>
    </div>
  );
}