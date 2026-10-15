import { ArrowUpRight } from "lucide-react";
import { PageHeading, Notice } from "@/components/ui";
const steps = [
  {
    title: "Start with ABN eligibility",
    text: "Check the Australian Business Register’s eligibility and application information.",
    url: "https://www.abr.gov.au/business-super-funds-charities/applying-abn",
    source: "Australian Business Register",
  },
  {
    title: "Consider your business name",
    text: "Review the official business-name registration guidance and its links to ASIC.",
    url: "https://business.gov.au/registrations/register-your-business-name",
    source: "business.gov.au",
  },
  {
    title: "Check GST registration guidance",
    text: "Review the ATO’s current criteria and responsibilities for your circumstances.",
    url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst",
    source: "Australian Taxation Office",
  },
  {
    title: "Find a registered professional",
    text: "Use the TPB register to check tax and BAS agent registration before engaging a professional.",
    url: "https://www.tpb.gov.au/public-register",
    source: "Tax Practitioners Board",
  },
];
export default function Guide() {
  return (
    <>
      <PageHeading
        title="A considered start."
        description="Official places to explore your Australian business setup."
      />
      <Notice>
        General information and official links. This does not register your
        business or provide legal, tax or financial advice.
      </Notice>
      <div className="card-grid">
        {steps.map((s, i) => (
          <article className="panel" key={s.url}>
            <span className="eyebrow">
              STEP {String(i + 1).padStart(2, "0")}
            </span>
            <h2 style={{ marginTop: 15 }}>{s.title}</h2>
            <p className="muted">{s.text}</p>
            <a
              href={s.url}
              className="text-link"
              target="_blank"
              rel="noreferrer"
            >
              {s.source}
              <ArrowUpRight size={15} />
            </a>
            <small style={{ display: "block", marginTop: 18, fontSize: 10 }}>
              Link reviewed 15/10/2026 · Confirm current guidance at source
            </small>
          </article>
        ))}
      </div>
    </>
  );
}
