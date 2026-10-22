"use client";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  LoaderCircle,
  Search,
  ShieldX,
  WifiOff,
} from "lucide-react";
import { Button } from "./ui/button";
import { RequestError } from "@/lib/client";
export function Loading({ label = "Loading your workspace" }: { label?: string }) {
  return (
    <div className="state" role="status">
      <LoaderCircle className="spin" size={28} />
      <p>{label}</p>
      <span>Getting everything in place.</span>
    </div>
  );
}
export function Failure({ error, retry }: { error: Error; retry?: () => void }) {
  const denied = error instanceof RequestError && error.status === 403;
  return (
    <div className="state" role="alert">
      {denied ? <ShieldX size={32} /> : <WifiOff size={32} />}
      <h2>{denied ? "A little more access is needed" : "We couldn’t connect"}</h2>
      <p>{error.message}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="state empty">
      <span className="empty-icon">
        <Search size={24} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Notice({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "error" | "warning";
}) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {tone === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      <div>{children}</div>
    </div>
  );
}
export function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-input">
      <Search size={16} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button aria-label="Clear search" onClick={() => onChange("")}>
          ×
        </button>
      )}
    </div>
  );
}
export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="text-link" href={href}>
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
