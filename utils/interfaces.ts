export interface HistoryRow {
  id: number;  // ← was string
  query_type?: string;
  target: string;
  native_status: string;
  native_items_count: number;
  native_duration_ms: number;
  native_error?: string;
  brightdata_status: string;
  brightdata_items_count: number;
  brightdata_duration_ms: number;
  brightdata_error?: string;
  created_at: string;
  native_data?: unknown;
  brightdata_data?: unknown;
}