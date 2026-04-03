const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://apixam.holiceo.com';

export interface CmsPage {
  id: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  show_in_menu: boolean;
  show_in_footer: boolean;
  sort_order: number;
  featured_media_url: string | null;
  title: string;
  content: string | null;
  content_after: string | null;
  seo_title: string | null;
  seo_description: string | null;
  menu_label: string | null;
}

export interface MenuItem {
  id: string;
  slug: string;
  menu_label: string | null;
  title: string;
  sort_order: number;
}

export interface SiteConfig {
  site_name: string;
  support_email: string;
  logo_url: string | null;
  logo_height: number;
  appstore_url: string;
  googleplay_url: string;
  nav_appstore_logo: string | null;
  nav_googleplay_logo: string | null;
}

export async function getFooterItems(lang = 'fr'): Promise<MenuItem[]> {
  try {
    const res = await fetch(`${API_BASE}/public/menu?footer=1&lang=${lang}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getMenuItems(lang = 'fr'): Promise<MenuItem[]> {
  try {
    const res = await fetch(`${API_BASE}/public/menu?lang=${lang}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getPages(lang = 'fr'): Promise<CmsPage[]> {
  try {
    const res = await fetch(`${API_BASE}/public/pages?lang=${lang}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getPageBySlug(slug: string, lang = 'fr'): Promise<CmsPage | null> {
  try {
    const res = await fetch(`${API_BASE}/public/pages/${slug}?lang=${lang}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  compare_price_cents: number | null;
  price_eur: number;
  compare_price_eur: number | null;
  stock_qty: number;
  is_physical: boolean;
  featured_media_url: string | null;
  featured_media_alt: string | null;
  category_slug: string | null;
  category_name: string | null;
  seo_title: string | null;
}

export async function getProducts(lang = 'fr'): Promise<Product[]> {
  try {
    const res = await fetch(`${API_BASE}/public/products?lang=${lang}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getProductBySlug(slug: string, lang = 'fr'): Promise<Product | null> {
  try {
    const res = await fetch(`${API_BASE}/public/products/${slug}?lang=${lang}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function defaultConfig(): SiteConfig {
  return {
    site_name: 'XamIoT', support_email: '', logo_url: null, logo_height: 40,
    appstore_url: 'https://apps.apple.com', googleplay_url: 'https://play.google.com',
    nav_appstore_logo: null, nav_googleplay_logo: null,
  };
}

export async function getSiteConfig(): Promise<SiteConfig> {
  try {
    const res = await fetch(`${API_BASE}/public/config`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return defaultConfig();
    return res.json();
  } catch {
    return defaultConfig();
  }
}
