import type { Preview } from "@storybook/react-vite";
import { ToastProvider } from "../src";
import "./storybook.css";

const preview: Preview = {
  parameters: {
    layout: "padded",
    backgrounds: { disable: true },
    a11y: { test: "error" },
  },
  decorators: [
    (Story) => (
      <ToastProvider>
        <div className="max-w-xl p-2">
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
};

export default preview;
