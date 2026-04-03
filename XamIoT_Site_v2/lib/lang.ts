// Server-side: read lang from cookie or default
export function getLang(cookieStore: { get: (k: string) => { value: string } | undefined }): 'fr' | 'en' | 'es' {
  const val = cookieStore.get('lang')?.value;
  return (['fr', 'en', 'es'] as const).includes(val as any) ? (val as 'fr' | 'en' | 'es') : 'fr';
}

// Labels avec drapeaux
export const LANG_LABELS: Record<string, string> = { fr: '🇫🇷 FR', en: '🇬🇧 EN', es: '🇪🇸 ES' };
