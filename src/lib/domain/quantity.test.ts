import { describe, expect, it } from "vitest";
import { quantityValue, stepQuantity } from "./quantity";

describe("invoice quantity stepping", () => {
  it("increments and decrements whole quantities", () => {
    expect(stepQuantity("1", 1)).toBe("2");
    expect(stepQuantity("2", -1)).toBe("1");
  });
  it("preserves four decimal places without binary rounding", () => {
    expect(stepQuantity("1.0001", 1)).toBe("2.0001");
    expect(stepQuantity("1.5", -1)).toBe("0.5");
    expect(stepQuantity("0.1250", 1)).toBe("1.125");
  });
  it("keeps quantities positive and within the calculation engine's bound", () => {
    expect(stepQuantity("1", -1)).toBe("1");
    expect(stepQuantity("0.5", -1)).toBe("0.5");
    expect(stepQuantity("1000000", 1)).toBe("1000000");
    expect(stepQuantity("999999.5", 1)).toBe("999999.5");
  });
  it("handles a blank or invalid field and validates typed values", () => {
    expect(stepQuantity("", 1)).toBe("1");
    expect(stepQuantity("", -1)).toBe("");
    for (const invalid of [
      "0",
      "-1",
      "1e3",
      "1.00001",
      "1000001",
      "99999999999999999999999999999",
    ])
      expect(quantityValue(invalid)).toBeNull();
    expect(quantityValue("0.0001")).toBe(1n);
  });
});
