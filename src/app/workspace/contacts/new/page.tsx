import { requireWriter } from "@/lib/server/context";
import { ContactForm } from "@/components/contact-form";
import { PageHeading } from "@/components/ui";
export default async function NewContact({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  await requireWriter();
  const kind =
    (await searchParams).kind === "supplier" ? "supplier" : "customer";
  return (
    <>
      <PageHeading
        title={`Add a ${kind}.`}
        description="The details that keep good business moving."
      />
      <ContactForm kind={kind} />
    </>
  );
}
