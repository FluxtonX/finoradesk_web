import Link from "next/link";
import { EmptyArt } from "@/components/brand";
export default function NotFound() {
  return (
    <main id="main" className="standalone">
      <div className="panel empty-state">
        <EmptyArt />
        <h1>Nothing at this address.</h1>
        <p>The page or record may have moved.</p>
        <Link href="/workspace" className="button">
          Back to workspace
        </Link>
      </div>
    </main>
  );
}
