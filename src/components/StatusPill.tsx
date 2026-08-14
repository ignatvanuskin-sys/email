import { leadStatusLabels, uiLabel } from "@/lib/uiLabels";

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    New: "blue", Analyzed: "gray", Contacted: "blue", Replied: "gray",
    Interested: "warm", "Not Now": "gray", Client: "green", Lost: "cold", Unsubscribed: "red",
  };
  return <span className={`badge ${map[status] ?? "gray"}`}>{uiLabel(leadStatusLabels, status)}</span>;
}