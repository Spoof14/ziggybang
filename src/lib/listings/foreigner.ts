export function detectForeignerOk(
  ...parts: Array<string | undefined | null>
): boolean | undefined {
  const text = parts.filter((part): part is string => Boolean(part?.trim())).join("\n");
  if (!text.trim()) return undefined;
  const compact = text.replace(/\s+/g, "");
  const welcomed =
    /외국인(대)?환영|외국인가능|외국인전용|외국인ok|외국인OK/i.test(compact) ||
    /foreigners?\s+(are\s+)?welcome|welcome\s+foreigners?/i.test(text);
  const refused = /외국인(계약)?(불가|안됨|금지|사절)/i.test(compact);
  if (refused) return false;
  if (welcomed) return true;
  return undefined;
}

export function hasHangul(text: string): boolean {
  return /[가-힣]/.test(text);
}
