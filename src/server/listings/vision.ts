import { env } from "~/env";
import { cached } from "./cache";
import { fetchImageBytes } from "./media-fetch";

export type VisionPhoto = {
  id: string;
  score: number;
  summary: string;
  daylight: boolean;
  renovated: boolean;
  cluttered: boolean;
};

type VisionItem = {
  id: string;
  url: string;
};

export async function inspectListingPhotos(
  items: VisionItem[],
): Promise<VisionPhoto[]> {
  const key = env.OPENAI_API_KEY;
  const unique = items
    .filter((item) => item.id && item.url)
    .slice(0, 6);
  if (!key || unique.length === 0) return [];

  const cacheKey = `vision:${unique.map((item) => item.id).join(",")}`;
  return cached(cacheKey, 30 * 60 * 1000, () => inspectWithOpenAi(unique, key));
}

async function inspectWithOpenAi(
  items: VisionItem[],
  key: string,
): Promise<VisionPhoto[]> {
  const images = await Promise.all(
    items.map(async (item) => {
      const dataUrl = await fetchImageBytes(item.url);
      return dataUrl ? { id: item.id, dataUrl } : null;
    }),
  );
  const ready = images.filter((item): item is { id: string; dataUrl: string } => Boolean(item));
  if (!ready.length) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You score Korea rental listing interiors for foreigners. Return JSON {"items":[{"index":0,"score":0-100,"daylight":true,"renovated":true,"cluttered":false,"summary":"short English"}]} in photo order. Penalize floorplans, bathrooms-only, dark blurry shots, filthy or very old finishes. Reward daylight, clean renovated rooms, usable kitchen/bath.',
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Score these ${ready.length} listing photos in order.`,
              },
              ...ready.map((item) => ({
                type: "image_url" as const,
                image_url: { url: item.dataUrl, detail: "low" as const },
              })),
            ],
          },
        ],
      }),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return [];
    const parsed = JSON.parse(content) as {
      items?: Array<{
        index?: number;
        score?: number;
        daylight?: boolean;
        renovated?: boolean;
        cluttered?: boolean;
        summary?: string;
      }>;
    };
    return (parsed.items ?? []).flatMap((item) => {
      const source = ready[item.index ?? -1];
      if (!source || typeof item.score !== "number") return [];
      return [
        {
          id: source.id,
          score: Math.max(5, Math.min(98, Math.round(item.score))),
          summary:
            typeof item.summary === "string" && item.summary.trim()
              ? item.summary.trim()
              : "Checked interior photos",
          daylight: item.daylight === true,
          renovated: item.renovated === true,
          cluttered: item.cluttered === true,
        },
      ];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
