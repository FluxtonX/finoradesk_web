import { describe, it, expect } from "vitest";
import { parseCsv, validateImport, csvRow, csvCell } from "./csv";
describe("CSV transfer", () => {
  it("round trips quoted commas, multiline fields and quotes", () => {
    const source = [
      ["name", "notes"],
      ["Business, one", 'Line 1\nLine "2"'],
    ];
    expect(parseCsv(source.map(csvRow).join(""))).toEqual(source);
  });
  it("accepts BOM and CRLF", () =>
    expect(parseCsv("\uFEFFname,email\r\nAlex,alex@example.test\r\n")).toEqual([
      ["name", "email"],
      ["Alex", "alex@example.test"],
    ]));
  it("rejects malformed quotes, mismatched columns and duplicate headers", () => {
    for (const value of [
      'a,b\n"open,b',
      "a,b\nx",
      "a,a\nx,y",
      'a,b\n"x"junk,y',
    ])
      expect(() => parseCsv(value)).toThrow();
  });
  it("bounds file size and row count", () => {
    expect(() => parseCsv("a\n" + "x".repeat(2 * 1024 * 1024))).toThrow("2 MB");
    expect(() => parseCsv("a\n" + "x\n".repeat(1001))).toThrow("1,000");
  });
  it("validates contacts and counts repeated rows", () => {
    const rows = parseCsv(
      "name,email\nAlex,alex@example.test\nAlex,alex@example.test\nBad,no-email\n",
    );
    const p = validateImport("customers", rows, {
      name: "name",
      email: "email",
    });
    expect(p.values).toHaveLength(1);
    expect(p.duplicates).toBe(1);
    expect(p.errors[0].row).toBe(4);
  });
  it("rejects impossible AU dates and missing paid dates", () => {
    const rows = parseCsv(
      "description,date,amount,status\nOffice,31/02/2026,10.00,unknown\nTravel,15/10/2026,20.00,paid",
    );
    const p = validateImport("expenses", rows, {
      description: "description",
      date: "date",
      amount: "amount",
      status: "status",
    });
    expect(p.errors).toHaveLength(2);
  });
  it("does not allow CSV data to supply tenant IDs", () => {
    const p = validateImport(
      "customers",
      parseCsv("name,organization_id\nAlex,evil"),
      { name: "name" },
    );
    expect(p.values[0]).not.toHaveProperty("organization_id");
  });
  it("protects spreadsheet formulas including leading whitespace", () => {
    for (const value of ["=1+1", " +SUM(A1)", "@x", "-cmd", "\t=evil"])
      expect(csvCell(value).startsWith("'")).toBe(true);
    expect(csvCell(-120)).toBe("-120");
  });
});
