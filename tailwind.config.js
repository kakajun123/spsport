/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "var(--ground)",
        surface: "var(--surface)",
        raised: "var(--color-paper-2)",
        muted: "var(--muted)",
        ink: "var(--text)",
        // 品牌色：球场绿（badminton / billiard 的对象色），Accent ladder 用
        brand: {
          DEFAULT: "var(--color-accent)",
          soft: "var(--color-accent-soft)",
          track: "var(--color-accent-track)",
          ink: "var(--color-brand-strong)",
        },
        positive: "var(--color-success)",
        negative: "var(--color-error)",
        warning: "var(--color-warning)",
      },
      fontFamily: {
        sans: ["var(--font-body)"],
      },
      borderRadius: {
        card: "8px",
        control: "6px",
      },
    },
  },
  plugins: [],
};
