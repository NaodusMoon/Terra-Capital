import type { Config } from "tailwindcss";

const config: Config = {
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        primary: "var(--color-primary)",
        "primary-contrast": "var(--color-primary-contrast)",
        secondary: "var(--color-secondary)",
        accent: "var(--color-accent)",
        warning: "var(--color-warning)",
        "warning-contrast": "var(--color-warning-contrast)",
        nav: "var(--color-nav)",
        "nav-foreground": "var(--color-nav-foreground)",
        surface: "var(--color-surface)",
        "surface-soft": "var(--color-surface-soft)",
        border: "var(--color-border)",
        muted: "var(--color-muted)",
      },
    },
  },
};

export default config;
