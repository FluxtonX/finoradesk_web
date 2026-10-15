import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  FileText,
  Receipt,
  ChartNoAxesCombined,
  ShieldCheck,
  Leaf,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { pilotPlans } from "@/lib/domain/plans";
import { money } from "@/lib/domain/money";
export default function Landing() {
  return (
    <main id="main" className="landing">
      <nav className="landing-nav">
        <Brand />
        <div className="landing-links">
          <a href="#workspace">The workspace</a>
          <a href="#plans">Plans</a>
          <Link href="/auth" className="text-link">
            Sign in
          </Link>
          <Link href="/auth?mode=signup" className="button">
            Get started
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </nav>
      <section className="landing-hero">
        <div>
          <span className="pill">
            <Leaf size={13} />A FRESH PERSPECTIVE ON BUSINESS ADMIN
          </span>
          <h1>
            Your business.
            <br />A little more
            <br />
            <em>in balance.</em>
          </h1>
          <p>
            Bring invoices, expenses and everyday money records into one calm
            workspace. Made for Australian independents and small teams.
          </p>
          <div className="actions">
            <Link href="/auth?mode=signup" className="button">
              Create your workspace
              <ArrowRight size={16} />
            </Link>
            <a href="#workspace" className="text-link">
              Take a closer look
              <ArrowUpRight size={14} />
            </a>
          </div>
          <p style={{ fontSize: 11, marginTop: 20 }}>
            Australian focus · AUD · No bank connection needed
          </p>
        </div>
        <div
          className="landing-visual"
          aria-label="Illustration of an organised business workspace"
        >
          <div className="visual-sheet">
            <div className="visual-title">
              <Brand />
              <span className="eyebrow">A CLEARER DAY</span>
            </div>
            <span className="eyebrow">EVERYTHING IN ITS PLACE</span>
            <h2 style={{ fontSize: 27, marginTop: 12 }}>
              More clarity.
              <br />
              Less catching up.
            </h2>
            <div className="visual-steps" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <small>Invoices. Expenses. The bigger picture.</small>
          </div>
          <div className="visual-note">
            <ShieldCheck size={22} />
            <span>
              Your business records,
              <br />
              <strong>in your workspace.</strong>
            </span>
          </div>
        </div>
      </section>
      <section id="workspace" className="landing-section">
        <span className="eyebrow">A WORKSPACE THAT MAKES SENSE</span>
        <h2>
          Keep the everyday moving.
          <br />
          See what matters.
        </h2>
        <div className="card-grid">
          <article className="landing-feature">
            <FileText />
            <h3>From draft to paid.</h3>
            <p>
              Create invoices, download PDFs and track the payments you record.
            </p>
          </article>
          <article className="landing-feature">
            <Receipt />
            <h3>A home for every expense.</h3>
            <p>
              Keep categories, payment status and private receipt attachments
              together.
            </p>
          </article>
          <article className="landing-feature">
            <ChartNoAxesCombined />
            <h3>Know where things stand.</h3>
            <p>
              See recorded cash flow, outstanding invoices and management GST
              estimates.
            </p>
          </article>
        </div>
      </section>
      <section className="landing-section">
        <span className="eyebrow">SMALL STEPS. A CLEARER PICTURE.</span>
        <h2>
          Start with the work
          <br />
          you already do.
        </h2>
        <div className="step-list">
          {[
            ["01", "Make it yours", "Add your business and its GST settings."],
            [
              "02",
              "Send your first PDF",
              "Create a customer, issue an invoice and share the download.",
            ],
            [
              "03",
              "Keep records together",
              "Record payments, expenses and receipts.",
            ],
            [
              "04",
              "See the bigger picture",
              "Review your report and export your monthly summary.",
            ],
          ].map(([n, title, body]) => (
            <article key={n}>
              <div className="step-number">{n}</div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="plans" className="landing-section">
        <span className="eyebrow">ROOM TO GROW</span>
        <h2>
          Simple pilot plans.
          <br />
          Choose your starting point.
        </h2>
        <div className="card-grid">
          {pilotPlans(process.env).map((p, i) => (
            <article
              className={`panel ${i === 1 ? "plan-featured" : ""}`}
              key={p.id}
            >
              <span className="eyebrow">{p.name}</span>
              {i === 1 && (
                <span className="plan-tag" style={{ float: "right" }}>
                  FOR SMALL TEAMS
                </span>
              )}
              <div className="price">
                {money(p.cents)}
                <span> AUD / month</span>
              </div>
              <p className="muted">{p.description}</p>
              <ul className="feature-list">
                {p.features.map((f) => (
                  <li key={f}>
                    <Check size={14} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth?mode=signup"
                className={`button ${i === 1 ? "" : "button-secondary"}`}
              >
                Create an account
                <ArrowUpRight size={14} />
              </Link>
            </article>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 20 }}>
          Provisional pilot pricing. Account creation does not start a paid
          subscription. Live checkout is available only after billing and tax
          settings are configured. Email delivery and AI require their
          providers.
        </p>
      </section>
      <footer className="landing-footer">
        <Brand />
        <span>Finance administration, with room to breathe.</span>
        <span>Management records · Not tax or financial advice</span>
      </footer>
    </main>
  );
}
