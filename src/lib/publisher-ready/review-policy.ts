import { digest, type Issue } from "./source-ledger";
export function auditSelected(
  runId: string,
  chapterId: string,
  percent: number,
): boolean {
  return (
    (parseInt(digest([runId, chapterId]).slice(0, 8), 16) / 0x100000000) * 100 <
    percent
  );
}
export function needsPremium(issues: Issue[], audit: boolean): boolean {
  return (
    audit ||
    issues.some(
      (i) => i.uncertainty || i.severity === "serious" || i.kind !== "craft",
    )
  );
}
