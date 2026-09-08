import { describe, expect, it } from "vitest";
import { formatConversationText } from "@/tui/presentation";

describe("TUI conversation presentation", () => {
  it("removes terminal-unfriendly Markdown while preserving readable content", () => {
    const text = "## Market\n\n- **BNB:** cautious. [Federal Reserve calendar](https://www.federalreserve.gov/monetarypolicy.htm)\n- Use `small size`.";
    expect(formatConversationText(text)).toBe("Market\n\n- BNB: cautious. Federal Reserve calendar\n- Use small size.");
  });
});
