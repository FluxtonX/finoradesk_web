"use client";
import { useState } from "react";
import { Field, Notice } from "./ui";
import {
  parseMoney,
  taxAmounts,
  money,
  percentMargin,
  breakEvenUnits,
  runwayMonths,
  roundRatio,
} from "@/lib/domain/money";
const kinds = [
  ["gst", "GST"],
  ["margin", "Margin / markup"],
  ["break-even", "Break-even"],
  ["runway", "Cash runway"],
  ["loan", "Loan illustration"],
] as const;
export function Calculators() {
  const [kind, setKind] = useState<string>("gst"),
    [values, setValues] = useState<Record<string, string>>({}),
    [mode, setMode] = useState("exclusive");
  function field(key: string, label: string) {
    return (
      <Field label={label}>
        <input
          inputMode="decimal"
          value={values[key] ?? ""}
          placeholder="0.00"
          onChange={(e) => setValues({ ...values, [key]: e.target.value })}
        />
      </Field>
    );
  }
  let output = "",
    formula = "",
    error = "";
  const hasValues = Object.values(values).some(Boolean);
  try {
    if (hasValues) {
      const a = parseMoney(values.a || "0"),
        b = parseMoney(values.b || "0"),
        c = parseMoney(values.c || "0");
      if (kind === "gst") {
        const t = taxAmounts(
          BigInt(a),
          mode === "inclusive" ? "inclusive" : "exclusive",
        );
        output = `${money(t.total_cents)} total · ${money(t.tax_cents)} GST`;
        formula =
          "Exclusive: GST = base ÷ 10. Inclusive: GST = total ÷ 11. Rounded to cents.";
      }
      if (kind === "margin") {
        output = `${percentMargin(a, b)}% margin`;
        if (b > 0)
          output += ` · ${Number(roundRatio(BigInt(a - b) * 10000n, BigInt(b))) / 100}% markup`;
        formula =
          "Margin = (revenue − cost) ÷ revenue × 100. Markup uses cost as the denominator.";
      }
      if (kind === "break-even") {
        output = `${breakEvenUnits(a, b, c)} units`;
        formula =
          "Fixed costs ÷ (selling price − variable cost), rounded up to whole units.";
      }
      if (kind === "runway") {
        output = `${runwayMonths(a, b)} months`;
        formula =
          "Available cash ÷ monthly net cash outflow. Assumes a constant outflow.";
      }
      if (kind === "loan") {
        const months = Number(values.months || "0");
        if (!Number.isInteger(months) || months < 1 || months > 600)
          throw new Error("Enter a term between 1 and 600 months.");
        const rate = BigInt(parseMoney(values.rate || "0")),
          den = 120000n,
          principal = BigInt(a);
        if (rate > 100000n) throw new Error("Check the annual interest rate.");
        const payment =
          rate === 0n
            ? roundRatio(principal, BigInt(months))
            : roundRatio(
                principal * rate * (den + rate) ** BigInt(months),
                den * ((den + rate) ** BigInt(months) - den ** BigInt(months)),
              );
        output = `${money(Number(payment))} / month`;
        formula =
          "Fixed-rate amortising loan; equal monthly payments. Excludes fees, rate changes and lender-specific rounding. Illustration only.";
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Check the inputs.";
  }
  return (
    <>
      <div className="toolbar">
        {kinds.map(([id, label]) => (
          <button
            className={`button button-small ${kind === id ? "" : "button-secondary"}`}
            key={id}
            onClick={() => {
              setKind(id);
              setValues({});
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="panel narrow">
        <h2>{kinds.find(([id]) => id === kind)?.[1]} calculator</h2>
        <p className="muted">
          Enter your assumptions. Calculations run locally and do not change
          your records.
        </p>
        <div className="field-grid">
          {kind === "gst" && (
            <>
              {field(
                "a",
                mode === "inclusive"
                  ? "GST-inclusive amount AUD"
                  : "Base amount AUD",
              )}
              <Field label="Treatment">
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="exclusive">Add 10% GST</option>
                  <option value="inclusive">Extract included GST</option>
                </select>
              </Field>
            </>
          )}
          {kind === "margin" && (
            <>
              {field("a", "Revenue AUD")}
              {field("b", "Cost AUD")}
            </>
          )}
          {kind === "break-even" && (
            <>
              {field("a", "Fixed costs AUD")}
              {field("b", "Selling price per unit AUD")}
              {field("c", "Variable cost per unit AUD")}
            </>
          )}
          {kind === "runway" && (
            <>
              {field("a", "Available cash AUD")}
              {field("b", "Monthly net cash outflow AUD")}
            </>
          )}
          {kind === "loan" && (
            <>
              {field("a", "Loan principal AUD")}
              <Field label="Annual rate %">
                <input
                  inputMode="decimal"
                  value={values.rate ?? ""}
                  onChange={(e) =>
                    setValues({ ...values, rate: e.target.value })
                  }
                />
              </Field>
              <Field label="Term in months">
                <input
                  inputMode="numeric"
                  value={values.months ?? ""}
                  onChange={(e) =>
                    setValues({ ...values, months: e.target.value })
                  }
                />
              </Field>
            </>
          )}
        </div>
        {output && (
          <output className="output" style={{ display: "block" }}>
            {output}
          </output>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {formula && <div className="formula">{formula}</div>}
        <p className="muted" style={{ fontSize: 11, marginTop: 20 }}>
          Illustrative business planning only. Results depend on your inputs and
          are not tax, lending or financial advice.
        </p>
      </section>
    </>
  );
}
