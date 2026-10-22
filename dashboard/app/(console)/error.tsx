"use client";
import { Failure } from "@/components/shared";
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return <Failure error={error} retry={reset} />;
}
