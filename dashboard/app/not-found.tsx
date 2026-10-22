import Link from "next/link";
export default function NotFound() {
  return (
    <div className="full-state">
      <div className="state">
        <h1>A little off the beaten path.</h1>
        <p>This page isn’t part of your workspace.</p>
        <Link href="/" className="button button-primary">
          Back to your community
        </Link>
      </div>
    </div>
  );
}
