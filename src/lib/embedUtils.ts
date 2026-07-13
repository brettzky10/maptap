export type EmbedProvider = "sketchfab" | "youtube" | "vimeo" | "generic";

export interface NormalizedEmbed {
  url: string;
  provider: EmbedProvider;
}

/**
 * Accepts whatever a person pastes — a share link, a model page, or an
 * already-correct embed URL — and returns the URL that actually belongs in
 * an <iframe src>, plus which provider it recognized (so the renderer can
 * set the right `allow`/fullscreen attributes).
 */
export function normalizeEmbedUrl(input: string): NormalizedEmbed {
  const trimmed = input.trim();
  if (!trimmed) return { url: "", provider: "generic" };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { url: trimmed, provider: "generic" };
  }

  const host = parsed.hostname.replace(/^www\./, "");

  // Sketchfab: share links look like
  //   sketchfab.com/3d-models/<slug>-<32-hex-id>
  //   sketchfab.com/models/<32-hex-id>
  // both normalize to sketchfab.com/models/<id>/embed
  if (host === "sketchfab.com") {
    if (/\/models\/[a-f0-9]+\/embed\/?$/.test(parsed.pathname)) {
      return { url: trimmed, provider: "sketchfab" };
    }
    const idMatch = parsed.pathname.match(/([a-f0-9]{32})/i);
    if (idMatch) {
      return { url: `https://sketchfab.com/models/${idMatch[1]}/embed`, provider: "sketchfab" };
    }
    return { url: trimmed, provider: "sketchfab" };
  }

  // YouTube: youtube.com/watch?v=ID, youtu.be/ID, or already youtube.com/embed/ID
  if (host === "youtube.com" || host === "youtu.be") {
    if (/\/embed\//.test(parsed.pathname)) return { url: trimmed, provider: "youtube" };
    const id = host === "youtu.be" ? parsed.pathname.slice(1) : parsed.searchParams.get("v");
    if (id) return { url: `https://www.youtube.com/embed/${id}`, provider: "youtube" };
    return { url: trimmed, provider: "youtube" };
  }

  // Vimeo: vimeo.com/ID -> player.vimeo.com/video/ID
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    if (host === "player.vimeo.com") return { url: trimmed, provider: "vimeo" };
    const id = parsed.pathname.match(/(\d+)/)?.[1];
    if (id) return { url: `https://player.vimeo.com/video/${id}`, provider: "vimeo" };
    return { url: trimmed, provider: "vimeo" };
  }

  return { url: trimmed, provider: "generic" };
}

/** iframe `allow` string per provider — Sketchfab in particular needs xr-spatial-tracking for its orbit controls to behave. */
export function embedAllowAttribute(provider: EmbedProvider): string {
  switch (provider) {
    case "sketchfab":
      return "autoplay; fullscreen; xr-spatial-tracking";
    case "youtube":
      return "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    case "vimeo":
      return "autoplay; fullscreen; picture-in-picture";
    default:
      return "autoplay; fullscreen";
  }
}
