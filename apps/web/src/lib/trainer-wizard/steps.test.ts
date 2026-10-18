import { describe, expect, it } from "vitest";
import { editPath, isEditableStep, isWizardStep, nextPath, previousPath, stepNumber, WIZARD_DONE_PATH, WIZARD_START_PATH, WIZARD_STEPS } from "./steps";

describe("wizard steps", () => {
  it("follow the order of screens.md flow 4.1", () => {
    expect(WIZARD_STEPS).toEqual(["profile", "format", "locations", "region", "cancellation", "payment", "prices", "certificates"]);
    expect(WIZARD_START_PATH).toBe("/onboarding/trainer/profile");
  });

  it("lead from one screen to the next and to the result after the last", () => {
    expect(nextPath("profile")).toBe("/onboarding/trainer/format");
    expect(nextPath("certificates")).toBe(WIZARD_DONE_PATH);
    expect(previousPath("profile")).toBeNull();
    expect(previousPath("format")).toBe("/onboarding/trainer/profile");
    expect(stepNumber("region")).toBe(4);
  });

  it("know only their own names, so done and anything else are not steps", () => {
    expect(isWizardStep("payment")).toBe(true);
    expect(isWizardStep("done")).toBe(false);
    expect(isWizardStep("price-grid")).toBe(false);
  });
});

describe("profile sections", () => {
  it("edit the wizard's own answers, without prices and documents", () => {
    expect(isEditableStep("locations")).toBe(true);
    expect(isEditableStep("prices")).toBe(false);
    expect(isEditableStep("certificates")).toBe(false);
    expect(editPath("region")).toBe("/trainer/profile/region");
  });
});
