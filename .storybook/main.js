import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
export default {
  stories: ["../src/**/*.stories.@(js|jsx|ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-themes"],
  framework: { name: "@storybook/nextjs-vite", options: {} },
  viteFinal: async (config) => ({
    ...config,
    resolve: { ...config.resolve, alias: { ...config.resolve?.alias, "@": join(root, "../src") } },
  }),
};
