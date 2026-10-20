"use client";
import { useId } from "react";
import { Minus, Plus } from "lucide-react";
import { quantityValue, stepQuantity } from "@/lib/domain/quantity";

export function QuantityInput({
  value,
  onChange,
  line,
}: {
  value: string;
  onChange: (value: string) => void;
  line: number;
}) {
  const id = useId(),
    amount = quantityValue(value);
  return (
    <div className="field">
      <label htmlFor={id}>Quantity</label>
      <div className="quantity-control">
        <button
          type="button"
          aria-label={`Decrease quantity for line ${line}`}
          disabled={amount === null || amount <= 10000n}
          onClick={() => onChange(stepQuantity(value, -1))}
        >
          <Minus size={14} aria-hidden="true" />
        </button>
        <input
          id={id}
          role="spinbutton"
          aria-label={`Quantity for line ${line}`}
          aria-valuemin={0.0001}
          aria-valuemax={1000000}
          aria-valuenow={amount === null ? undefined : Number(value)}
          inputMode="decimal"
          autoComplete="off"
          required
          maxLength={16}
          pattern="[0-9]+(\.[0-9]{1,4})?"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              onChange(stepQuantity(value, event.key === "ArrowUp" ? 1 : -1));
            }
          }}
        />
        <button
          type="button"
          aria-label={`Increase quantity for line ${line}`}
          disabled={amount !== null && amount >= 10000000000n}
          onClick={() => onChange(stepQuantity(value, 1))}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
