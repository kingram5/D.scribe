export const STATUS_COLORS: Record<string, string> = {
  draft: "#a0978a",
  in_progress: "#d4b895",
  complete: "#191816",
  outlined: "#a0978a",
  generating: "#d4b895",
  generated: "#191816",
  edited: "#7a7369",
  uploading: "#d4b895",
  downloading: "#d4b895",
  fetching: "#d4b895",
  transcribing: "#7a7369",
  done: "#191816",
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

export const SPEAKER_COLORS = ["#d4b895", "#8b8276", "#1c1c1c", "#a0978a"];
