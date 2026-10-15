import { PageHeading } from "@/components/ui";
import { Calculators } from "@/components/calculators";
export default function CalculatorPage() {
  return (
    <>
      <PageHeading
        title="A little working-out space."
        description="Clear inputs. Transparent assumptions. Useful answers."
      />
      <Calculators />
    </>
  );
}
