import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // PLAN.md §14.2/§14.3: every LLM call goes through lib/llm/provider.ts, never
  // @google/genai directly, so swapping providers later is one adapter file + an
  // env change, not a route rewrite. lib/gemini/** is exempted below since it IS
  // the Gemini adapter's implementation.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@google/genai",
              message:
                "Import from '@/lib/llm/provider' instead - see PLAN.md §14. Only lib/gemini/** may import @google/genai directly.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/llm/**", "src/lib/gemini/**"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);

export default eslintConfig;
