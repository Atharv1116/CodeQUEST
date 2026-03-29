/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#7C3AED", // Neon Purple
        secondary: "#A78BFA",
        cta: "#F43F5E", // Rose action
        success: "#10b981",
        danger: "#ef4444",
        background: "#0F0F23",
        text: "#E2E8F0",
        dark: {
          950: "#050510",
          900: "#0F0F23", // Match background
          800: "#1A1A33",
          700: "#262645",
          600: "#33335A",
          500: "#404070",
        },
      },
      fontFamily: {
        heading: ['"Russo One"', 'sans-serif'],
        body: ['"Chakra Petch"', 'sans-serif'],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        blob: "blob 7s infinite",
        float: "float 3s ease-in-out infinite",
        shimmer: "shimmer 2s infinite",
        "spin-slow": "spin 8s linear infinite",
        glitch: "glitch 1.5s infinite",
        "neon-blink": "neon-blink 3s infinite alternate",
        scanline: "scanline 8s linear infinite",
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
        glitch: {
          "0%": { transform: "translate(0)" },
          "20%": { transform: "translate(-2px, 2px)" },
          "40%": { transform: "translate(-2px, -2px)" },
          "60%": { transform: "translate(2px, 2px)" },
          "80%": { transform: "translate(2px, -2px)" },
          "100%": { transform: "translate(0)" },
        },
        "neon-blink": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.8 },
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
      },
      backdropBlur: {
        xs: "2px",
        sm: "4px",
        md: "8px",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(124, 58, 237, 0.2)",
        glow: "0 0 20px rgba(124, 58, 237, 0.3)",
        "glow-sm": "0 0 10px rgba(124, 58, 237, 0.2)",
        "glow-cta": "0 0 20px rgba(244, 63, 94, 0.4)",
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
