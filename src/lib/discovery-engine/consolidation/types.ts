// Source-neutral multi-platform consolidation model (Part 8). A SourceOutlet is the common
// normalised shape every platform parser produces; consolidation groups likely-same outlets
// across sources WITHOUT ever merging on name alone, and retains every source observation.

export type SourceName = "just_eat" | "uber_eats" | "deliveroo";

export interface SourceOutlet {
  source: SourceName;
  source_outlet_id: string;
  source_url: string | null;
  name: string;
  brand: string | null;
  address: string | null;
  postcode: string | null;         // normalised full postcode where available
  latitude: number | null;
  longitude: number | null;
  phone: string | null;            // normalised comparison value where available
  rating: number | null;
  review_count: number | null;
  cuisines: string[];
  is_delivery: boolean | null;
  is_collection: boolean | null;
  delivery_cost: number | null;
  minimum_order: number | null;
  eta_minutes: number | null;
  is_sponsored: boolean | null;
  halal_flag: boolean | null;
  logo_url: string | null;
  observed_at: string;
}

export type MatchStatus =
  | "confirmed_same"     // strong evidence (phone, or full postcode + strong name, or same URL)
  | "probable_same"      // coordinate proximity + name overlap
  | "ambiguous_manual"   // weak/conflicting — needs human review
  | "separate_branch"    // same brand, different location
  | "source_conflict";   // matched but a field materially conflicts

export interface ConsolidatedCandidate {
  id: string;
  name: string;
  brand: string | null;
  postcode: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  sources: SourceOutlet[];              // every source observation retained
  sourceNames: SourceName[];
  matchStatus: MatchStatus;
  confidence: number;                   // 0..1
  evidence: string[];                   // why they were merged
  conflicts: string[];                  // materially conflicting fields
  ratingsBySource: Record<string, { rating: number | null; count: number | null }>;
  firstSeen: string;
  lastSeen: string;
}
