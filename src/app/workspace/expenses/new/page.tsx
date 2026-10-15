import { requireWriter } from "@/lib/server/context";
import { categories } from "@/lib/server/repository";
import { ExpenseEditor } from "@/components/expense-editor";
import { PageHeading } from "@/components/ui";
export default async function NewExpense() {
  const c = await requireWriter(),
    cats = await categories();
  return (
    <>
      <PageHeading
        title="Record an expense."
        description="One less thing to keep in your head."
      />
      <ExpenseEditor organization={c.organization} categories={cats} />
    </>
  );
}
