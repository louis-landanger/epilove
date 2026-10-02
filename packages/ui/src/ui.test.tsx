import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, ChoiceGroup, IconButton, OtpInput, SchoolChip, TextField } from "./index";

describe("Button", () => {
  it("is disabled and busy while loading", () => {
    render(<Button loading>Envoyer</Button>);
    const button = screen.getByRole("button", { name: /Envoyer/ });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });
});

describe("IconButton", () => {
  it("always has an accessible name", () => {
    render(<IconButton label="Fermer">x</IconButton>);
    expect(screen.getByRole("button", { name: "Fermer" })).toBeTruthy();
  });
});

describe("TextField", () => {
  it("links the label and exposes the error", () => {
    render(<TextField label="Email d'école" error="Adresse invalide" />);
    const input = screen.getByLabelText("Email d'école");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("Adresse invalide");
  });
});

describe("ChoiceGroup", () => {
  it("toggles multiple choices", async () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<Array<"love" | "friends">>([]);
      return (
        <ChoiceGroup
          label="Je cherche"
          multiple
          value={value}
          onChange={(next) => {
            setValue(next);
            onChange(next);
          }}
          choices={[
            { value: "love", label: "Love" },
            { value: "friends", label: "Amis" },
          ]}
        />
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Love" }));
    await userEvent.click(screen.getByRole("button", { name: "Amis" }));
    expect(onChange).toHaveBeenLastCalledWith(["love", "friends"]);
    expect(screen.getByRole("group", { name: "Je cherche" })).toBeTruthy();
  });
});

describe("OtpInput", () => {
  it("reports the complete code", async () => {
    const onComplete = vi.fn();
    function Harness() {
      const [value, setValue] = useState("");
      return <OtpInput label="Code" value={value} onChange={setValue} onComplete={onComplete} />;
    }
    render(<Harness />);
    const [firstSlot] = screen.getAllByRole("textbox");
    if (!firstSlot) throw new Error("no slot");
    await userEvent.click(firstSlot);
    await userEvent.keyboard("123456");
    expect(onComplete).toHaveBeenCalledWith("123456");
  });
});

describe("SchoolChip", () => {
  it("shows the school name next to a decorative glyph", () => {
    render(<SchoolChip school="isg" name="ISG" />);
    expect(screen.getByText("ISG")).toBeTruthy();
  });
});
