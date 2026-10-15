import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Finoredesk · A clearer day for your business",
    template: "%s · Finoredesk",
  },
  description:
    "Invoices, expenses and a clearer view of your Australian business. Built for freelancers and small service teams.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-AU">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
