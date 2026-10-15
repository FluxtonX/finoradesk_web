export type PlanId = "starter" | "growth" | "business";
export interface Plan {
  id: PlanId;
  name: string;
  cents: number;
  description: string;
  features: string[];
  seats: number;
}
export function pilotPlans(
  env: Record<string, string | undefined> = {},
): Plan[] {
  const price = (key: string, fallback: number) => {
    const n = Number(env[key]);
    return Number.isSafeInteger(n) && n >= 100 && n <= 1000000 ? n : fallback;
  };
  return [
    {
      id: "starter",
      name: "Starter",
      cents: price("PILOT_STARTER_CENTS", 1900),
      description: "For your independent business.",
      seats: 1,
      features: [
        "Invoices and recorded payments",
        "Expenses and private receipts",
        "Standard reports and calculators",
        "1 active user",
      ],
    },
    {
      id: "growth",
      name: "Growth",
      cents: price("PILOT_GROWTH_CENTS", 4900),
      description: "A little more room for your team.",
      seats: 5,
      features: [
        "Everything in Starter",
        "Up to 5 active users",
        "CSV import and export",
        "Shared business workspace",
        "Receivables ageing and supplier reports",
      ],
    },
    {
      id: "business",
      name: "Business",
      cents: price("PILOT_BUSINESS_CENTS", 9900),
      description: "For a growing service business.",
      seats: 15,
      features: [
        "Everything in Growth",
        "Up to 15 active users",
        "Role-based team permissions",
        "Activity history and support tracking",
        "Invoice and expense review queue",
      ],
    },
  ];
}
export const PLAN_NOTICE =
  "Pilot prices are adjustable. Invoice approvals are opt-in and require two admins. Email delivery requires a connected sender. Subscription tax treatment and terms must be confirmed before live checkout.";
