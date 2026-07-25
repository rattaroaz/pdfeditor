import { afterEach, describe, expect, it } from "vitest";
import {
  getPasswordPromptState,
  requestPassword,
  resolvePasswordPrompt,
} from "./passwordPrompt";

describe("passwordPrompt", () => {
  afterEach(() => {
    resolvePasswordPrompt(null);
  });

  it("resolves with the submitted password", async () => {
    const pending = requestPassword({
      title: "Password required",
      message: "Enter password",
    });
    expect(getPasswordPromptState()?.title).toBe("Password required");
    resolvePasswordPrompt("secret");
    await expect(pending).resolves.toBe("secret");
    expect(getPasswordPromptState()).toBeNull();
  });

  it("resolves null on cancel", async () => {
    const pending = requestPassword({
      title: "Protect PDF",
      message: "Set a password",
      confirm: true,
    });
    resolvePasswordPrompt(null);
    await expect(pending).resolves.toBeNull();
  });
});
