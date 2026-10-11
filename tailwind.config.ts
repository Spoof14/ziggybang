import { type Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

export default {
  content: ["./src/**/*.tsx"],
  theme: {
    extend: {
      // Layout is keyed on width AND height: browser zoom shrinks both (1280x800 at 250% is ~512x320 css px).
      // `desk` = side panel + map; `mobile` = full-width stacked layout; `short`/`tiny` = low viewports.
      screens: {
        desk: { raw: "(min-width: 1024px) and (min-height: 540px)" },
        mobile: { raw: "(max-width: 1023px), (max-height: 539px)" },
        short: { raw: "(max-height: 539px)" },
        tiny: { raw: "(max-height: 379px)" },
        narrow: { raw: "(max-width: 420px)" },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", ...fontFamily.sans],
      },
    },
  },
  plugins: [],
} satisfies Config;
