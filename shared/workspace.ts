export const LEAD_CATEGORIES = ["Outreach planning", "Service availability", "Data quality concern"] as const;
export const ASSESSMENTS = ["Documented-count signal only", "Insufficient coverage", "Baseline disagreement", "No operational conclusion"] as const;
export const NEXT_STEPS = ["Request independent aggregate data", "Check reporting coverage", "Review uncertainty with an analyst", "No further action"] as const;
export type Role = "analyst" | "planner";
export type QueueState = "new" | "possible_duplicate" | "verified" | "rejected";
export interface QueueItem {
  id: string; title: string; source: string; source_ref: string; district: string;
  event_date: string | null; publication_date: string; first_seen_at: string; status: QueueState;
  duplicate_of: string | null; verified_at: string | null; reviewer_role: string | null;
  synthetic: true;
}
export interface Lead {
  id: string; created_at: string; district: string; category: string;
  status: "new" | "reviewed" | "closed"; synthetic: true;
}
export interface Brief {
  id: string; district: string; horizon_days: 7 | 28; assessment: string;
  next_step: string; updated_at: string; role: Role; connection: string | null; synthetic: true;
}
