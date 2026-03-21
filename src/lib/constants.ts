export const STATUS_COLORS: Record<string, string> = {
  draft: "#a0978a",
  in_progress: "#E05D3A",
  complete: "#059669",
  outlined: "#a0978a",
  generating: "#E05D3A",
  generated: "#059669",
  edited: "#7a7369",
  uploading: "#E05D3A",
  downloading: "#E05D3A",
  fetching: "#E05D3A",
  transcribing: "#7a7369",
  done: "#059669",
  failed: "#dc2626",
};

export const STATUS_LABELS: Record<string, string> = {
  uploading: "Uploading...",
  downloading: "Downloading...",
  fetching: "Fetching transcript...",
  transcribing: "Transcribing...",
  done: "Done",
  failed: "Failed",
};

export const SPEAKER_COLORS = ["#E05D3A", "#8b8276", "#1A1816", "#a0978a"];
