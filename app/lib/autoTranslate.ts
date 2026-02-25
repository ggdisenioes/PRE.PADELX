export type SupportedLocale = "es" | "en";

const GOOGLE_TRANSLATE_ENDPOINT =
  "https://translate.googleapis.com/translate_a/single";

const sanitize = (value: string) => value.replace(/\s+/g, " ").trim();

const parseGoogleResponse = (data: any): string => {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return "";
  return data[0]
    .map((part: any) => (Array.isArray(part) && typeof part[0] === "string" ? part[0] : ""))
    .join("")
    .trim();
};

export async function translateText({
  text,
  source,
  target,
}: {
  text: string;
  source: SupportedLocale;
  target: SupportedLocale;
}): Promise<string> {
  const clean = sanitize(text);
  if (!clean) return "";
  if (source === target) return clean;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const url = new URL(GOOGLE_TRANSLATE_ENDPOINT);
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", source);
    url.searchParams.set("tl", target);
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", clean);

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return clean;
    const json = await response.json();
    const translated = parseGoogleResponse(json);
    return translated || clean;
  } catch {
    return clean;
  }
}

export async function buildBilingualNewsText({
  sourceLocale,
  title,
  content,
}: {
  sourceLocale: SupportedLocale;
  title: string;
  content: string;
}): Promise<{
  titleEs: string;
  titleEn: string;
  contentEs: string;
  contentEn: string;
}> {
  const cleanTitle = sanitize(title);
  const cleanContent = sanitize(content);

  if (sourceLocale === "es") {
    const [titleEn, contentEn] = await Promise.all([
      translateText({ text: cleanTitle, source: "es", target: "en" }),
      translateText({ text: cleanContent, source: "es", target: "en" }),
    ]);
    return {
      titleEs: cleanTitle,
      titleEn: titleEn || cleanTitle,
      contentEs: cleanContent,
      contentEn: contentEn || cleanContent,
    };
  }

  const [titleEs, contentEs] = await Promise.all([
    translateText({ text: cleanTitle, source: "en", target: "es" }),
    translateText({ text: cleanContent, source: "en", target: "es" }),
  ]);

  return {
    titleEs: titleEs || cleanTitle,
    titleEn: cleanTitle,
    contentEs: contentEs || cleanContent,
    contentEn: cleanContent,
  };
}
