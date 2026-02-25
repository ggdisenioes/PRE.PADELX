export type LocalizedField = {
  es?: string;
  en?: string;
};

type EncodedNewsPayload = {
  version: 2;
  title_i18n: LocalizedField;
  content_i18n: LocalizedField;
  image_urls: string[];
};

export type DecodedNews = {
  title: string;
  content: string;
  title_i18n: LocalizedField;
  content_i18n: LocalizedField;
  image_urls: string[];
  cover_image_url: string | null;
};

const PAYLOAD_PREFIX = "__PADELX_NEWS_V2__:";

const sanitizeText = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const sanitizeImageUrl = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const normalizeImages = (urls: unknown[]) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const clean = sanitizeImageUrl(raw);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
};

const parsePayload = (rawContent: string | null | undefined): EncodedNewsPayload | null => {
  if (!rawContent || !rawContent.startsWith(PAYLOAD_PREFIX)) return null;

  try {
    const parsed = JSON.parse(rawContent.slice(PAYLOAD_PREFIX.length));
    if (!parsed || typeof parsed !== "object") return null;

    const title_i18n = (parsed as any).title_i18n ?? {};
    const content_i18n = (parsed as any).content_i18n ?? {};
    const image_urls = Array.isArray((parsed as any).image_urls)
      ? normalizeImages((parsed as any).image_urls)
      : [];

    return {
      version: 2,
      title_i18n: {
        es: sanitizeText(title_i18n.es),
        en: sanitizeText(title_i18n.en),
      },
      content_i18n: {
        es: sanitizeText(content_i18n.es),
        en: sanitizeText(content_i18n.en),
      },
      image_urls,
    };
  } catch {
    return null;
  }
};

export const buildNewsContentPayload = (input: {
  title_i18n: LocalizedField;
  content_i18n: LocalizedField;
  image_urls: string[];
}) => {
  const payload: EncodedNewsPayload = {
    version: 2,
    title_i18n: {
      es: sanitizeText(input.title_i18n.es),
      en: sanitizeText(input.title_i18n.en),
    },
    content_i18n: {
      es: sanitizeText(input.content_i18n.es),
      en: sanitizeText(input.content_i18n.en),
    },
    image_urls: normalizeImages(input.image_urls),
  };

  return `${PAYLOAD_PREFIX}${JSON.stringify(payload)}`;
};

export const decodeNewsRecord = (raw: {
  title?: string | null;
  content?: string | null;
  image_url?: string | null;
}): DecodedNews => {
  const titleFallback = sanitizeText(raw.title);
  const contentFallback = sanitizeText(raw.content);
  const parsed = parsePayload(raw.content);
  const cover = sanitizeImageUrl(raw.image_url);

  const titleEs = sanitizeText(parsed?.title_i18n.es) || titleFallback;
  const titleEn =
    sanitizeText(parsed?.title_i18n.en) || titleEs || titleFallback;

  const contentEs = sanitizeText(parsed?.content_i18n.es) || contentFallback;
  const contentEn =
    sanitizeText(parsed?.content_i18n.en) || contentEs || contentFallback;

  const images = normalizeImages([
    ...(parsed?.image_urls ?? []),
    cover,
  ]);

  const coverImage = cover || images[0] || null;

  return {
    title: titleEs || titleEn,
    content: contentEs || contentEn,
    title_i18n: {
      es: titleEs || titleEn,
      en: titleEn || titleEs,
    },
    content_i18n: {
      es: contentEs || contentEn,
      en: contentEn || contentEs,
    },
    image_urls: images,
    cover_image_url: coverImage,
  };
};

export const resolveNewsText = (
  i18n: LocalizedField | undefined,
  locale: "es" | "en",
  fallback = ""
) => {
  if (!i18n) return fallback;
  const byLocale = sanitizeText(i18n[locale]);
  if (byLocale) return byLocale;
  const bySpanish = sanitizeText(i18n.es);
  if (bySpanish) return bySpanish;
  const byEnglish = sanitizeText(i18n.en);
  if (byEnglish) return byEnglish;
  return fallback;
};

export const ensureCoverAndImages = (input: {
  image_url?: string | null;
  image_urls?: string[] | null | undefined;
  defaultCoverUrl: string;
}) => {
  const preferredCover = sanitizeImageUrl(input.image_url);
  const candidates = normalizeImages([
    preferredCover,
    ...(input.image_urls ?? []),
  ]);

  if (candidates.length === 0) {
    candidates.push(input.defaultCoverUrl);
  }

  return {
    coverImageUrl: candidates[0],
    imageUrls: candidates,
  };
};
