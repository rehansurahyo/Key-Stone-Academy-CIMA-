export const DEFAULT_LEARNWORLDS_SCHOOL_URL = "https://learn.keystoneacademia.com/";

/** Public navigation configuration only; this does not authenticate a learner. */
export function resolveLearnWorldsSchoolUrl(value?: string): string {
  if (!value?.trim()) return DEFAULT_LEARNWORLDS_SCHOOL_URL;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) {
      return DEFAULT_LEARNWORLDS_SCHOOL_URL;
    }
    return url.href;
  } catch {
    return DEFAULT_LEARNWORLDS_SCHOOL_URL;
  }
}

export const LEARNWORLDS_SCHOOL_URL = resolveLearnWorldsSchoolUrl(
  process.env.NEXT_PUBLIC_LEARNWORLDS_SCHOOL_URL,
);
