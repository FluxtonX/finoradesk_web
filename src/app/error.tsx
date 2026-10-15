"use client";
import { Notice } from "@/components/ui";
export default function ErrorPage(_props: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="standalone">
      <div className="panel">
        <h1>We couldn’t load this page.</h1>
        <Notice tone="error">
          Check your connection and retry. If this continues, confirm the hosted
          setup is complete.
        </Notice>
        <button className="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    </main>
  );
}
