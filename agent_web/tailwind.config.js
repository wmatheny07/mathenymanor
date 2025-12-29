module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: "#FF385C",
        bg: "#F7F7F8",
        ink: "#111827",
        inkLight: "#6B7280"
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem"
      },
      boxShadow: {
        soft: "0 8px 28px rgba(15, 23, 42, 0.06)"
      }
    }
  },
  plugins: []
};