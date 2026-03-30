/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#00ffc3", // Cyan accent
        secondary: "#8b5cf6", // Purple
        accent: "#ec4899", // Pink
        success: "#10b981", // Green
        danger: "#ef4444", // Red
        dark: {
          950: "#0a0a0a",
          900: "#0e0e0e",
          800: "#1a1a1a",
          700: "#222",
          600: "#333",
          500: "#404040",
        },
        light: {
          50: "#fafafa",
          100: "#f5f5f5",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        blob: "blob 7s infinite",
        float: "float 3s ease-in-out infinite",
        shimmer: "shimmer 2s infinite",
        "spin-slow": "spin 8s linear infinite",
      },
      keyframes: {
        blob: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(30px, -50px) scale(1.1)" },
          "66%": { transform: "translate(-20px, 20px) scale(0.9)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
      },
      backdropBlur: {
        xs: "2px",
        sm: "4px",
        md: "8px",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(31, 38, 135, 0.37)",
        glow: "0 0 20px rgba(0, 255, 195, 0.2)",
        "glow-sm": "0 0 10px rgba(0, 255, 195, 0.1)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
    },
  },
  plugins: [],
}
