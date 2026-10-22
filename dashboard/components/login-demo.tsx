"use client";
import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
export function LoginDemo() {
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <Button
        className="demo-signin"
        variant="secondary"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          try {
            const res = await fetch("/api/demo", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            if (!res.ok) throw new Error("Demo could not start");
            window.location.href = "/";
          } catch (e) {
            setError(e instanceof Error ? e.message : "Demo unavailable");
            setLoading(false);
          }
        }}
      >
        {loading ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          <>
            Explore the demo workspace <ArrowRight size={17} />
          </>
        )}
      </Button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
