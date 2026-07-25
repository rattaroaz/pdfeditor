import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordDialog } from "./PasswordDialog";
import { requestPassword, resolvePasswordPrompt } from "@/lib/passwordPrompt";

describe("PasswordDialog", () => {
  beforeEach(() => {
    resolvePasswordPrompt(null);
  });

  afterEach(() => {
    resolvePasswordPrompt(null);
  });

  it("renders nothing when no prompt is pending", () => {
    render(<PasswordDialog />);
    expect(screen.queryByTestId("password-dialog")).not.toBeInTheDocument();
  });

  it("submits password and resolves the pending request", async () => {
    const user = userEvent.setup();
    const pending = requestPassword({
      title: "Password required",
      message: "Enter the password",
    });
    render(<PasswordDialog />);

    expect(await screen.findByTestId("password-dialog")).toBeInTheDocument();
    await user.type(screen.getByTestId("password-input"), "secret");
    await user.click(screen.getByTestId("password-submit"));

    await expect(pending).resolves.toBe("secret");
    await waitFor(() => {
      expect(screen.queryByTestId("password-dialog")).not.toBeInTheDocument();
    });
  });

  it("shows mismatch when confirm passwords differ", async () => {
    const user = userEvent.setup();
    const pending = requestPassword({
      title: "Protect PDF",
      message: "Set a password",
      confirm: true,
    });
    render(<PasswordDialog />);

    await user.type(screen.getByTestId("password-input"), "one");
    await user.type(screen.getByTestId("password-confirm-input"), "two");
    await user.click(screen.getByTestId("password-submit"));

    expect(screen.getByTestId("password-mismatch")).toBeInTheDocument();
    resolvePasswordPrompt(null);
    await expect(pending).resolves.toBeNull();
  });

  it("cancels and resolves null", async () => {
    const user = userEvent.setup();
    const pending = requestPassword({
      title: "Password required",
      message: "Enter the password",
    });
    render(<PasswordDialog />);
    await user.click(screen.getByTestId("password-cancel"));
    await expect(pending).resolves.toBeNull();
  });
});
