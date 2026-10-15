"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "./ui";

export function BillingConfirmation({ confirmed }: { confirmed: boolean }) {
  const router = useRouter();
  const [waiting, setWaiting] = useState(true);
  useEffect(() => {
    if (confirmed) return;
    let attempts = 0;
    const timer = setInterval(() => {
      router.refresh();
      if (++attempts >= 15) {
        clearInterval(timer);
        setWaiting(false);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [confirmed, router]);
  return (
    <Notice tone={confirmed ? "success" : "info"}>
      {confirmed ? (
        "Subscription confirmed. Your plan is active."
      ) : waiting ? (
        <>
          <span className="spinner" /> Confirming your subscription…
        </>
      ) : (
        <>
          Confirmation is taking longer.{" "}
          <button
            type="button"
            className="text-link"
            onClick={() => router.refresh()}
          >
            Refresh
          </button>
        </>
      )}
    </Notice>
  );
}
