const SCALE = 10000n;
const MAX = 1000000n * SCALE;

export function quantityValue(value: string): bigint | null {
  if (value.length > 16 || !/^\d+(?:\.\d{1,4})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const scaled = BigInt(whole) * SCALE + BigInt(fraction.padEnd(4, "0"));
  return scaled > 0n && scaled <= MAX ? scaled : null;
}

export function stepQuantity(value: string, direction: 1 | -1): string {
  const current = quantityValue(value);
  if (current === null) return direction === 1 ? "1" : value;
  const next = current + BigInt(direction) * SCALE;
  if (next <= 0n || next > MAX) return value;
  const fraction = (next % SCALE)
    .toString()
    .padStart(4, "0")
    .replace(/0+$/, "");
  return `${next / SCALE}${fraction ? `.${fraction}` : ""}`;
}
