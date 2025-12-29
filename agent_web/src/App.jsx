import React, { useState } from "react";
import Navbar from "./components/Navbar";
import BlogPostAgent from "./BlogPostAgent";

export default function App() {
  const [agent, setAgent] = useState(null);
  const apiUrl = import.meta.env.VITE_API_URL;

  const agents = [
    {
      id: "blogpost",
      name: "CaringBridge Blog Assistant",
      description: "Turn medical notes into CaringBridge-style updates."
    }
  ];

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-12">
        {!agent && (
          <div className="grid grid-cols-1 gap-6">
            {agents.map((a) => (
              <button
                key={a.id}
                onClick={() => setAgent(a.id)}
                className="bg-white p-6 rounded-2xl shadow-soft flex flex-col items-start text-left hover:shadow-md transition"
              >
                <h2 className="text-xl font-semibold">{a.name}</h2>
                <p className="text-inkLight mt-2">{a.description}</p>
              </button>
            ))}
          </div>
        )}

        {agent === "blogpost" && (
          <BlogPostAgent 
            apiUrl={apiUrl} 
            onBack={() => setAgent(null)} 
          />
        )}
      </main>
    </div>
  );
}