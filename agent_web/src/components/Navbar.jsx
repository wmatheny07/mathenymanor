import React from "react";

export default function Navbar() {
  return (
    <header className="w-full bg-white/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand flex items-center justify-center text-white font-bold shadow-soft"></div>
          <div>
            <div className="text-sm font-semibold">Matheny Manor</div>
            <div className="text-xs text-inkLight">AI Agents</div>
          </div>
        </div>

        <nav className="flex items-center gap-4">
          <a href="#" className="text-sm text-inkLight hover:text-ink">Agents</a>
          <a href="#" className="text-sm text-inkLight hover:text-ink">Settings</a>
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">MM</div>
        </nav>
      </div>
    </header>
  );
}