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

export interface Country {
  code: string;
  code3: string;
  name: string;
  name_fr: string;
  name_en: string;
  shipping_cents: number;
  tax_rate_pct: number;
  customs_cents: number;
  message_client: string | null;
}

export async function getCountries(lang = 'fr'): Promise<Country[]> {
  try {
    const res = await fetch(`${API_BASE}/public/countries?lang=${lang}`, { cache: 'no-store' });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// ── Auth (client-side) ──

export async function authSignup(email: string, password: string, first_name: string, last_name: string, phone?: string) {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, first_name, last_name, phone }),
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

export async function authLogin(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

export async function authResendActivation(email: string) {
  const res = await fetch(`${API_BASE}/auth/resend-activation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

export async function authRequestPasswordReset(email: string) {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

export async function authResetPassword(token: string, newPassword: string) {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

// ── Checkout (client-side) ──

export async function checkoutCalculate(items: { product_id: string; quantity: number }[], country_code: string) {
  const res = await fetch(`${API_BASE}/public/checkout/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, country_code }),
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

export async function checkoutCreateIntent(body: {
  items: { product_id: string; quantity: number }[];
  email: string;
  shipping_address: Record<string, any>;
  billing_address?: Record<string, any>;
  billing_same_as_shipping: boolean;
}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('xamiot_token') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/public/checkout/create-intent`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

// ── Addresses (client-side, authenticated) ──

export async function getMyAddresses(token: string) {
  const res = await fetch(`${API_BASE}/me/addresses`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function createAddress(token: string, address: Record<string, any>) {
  const res = await fetch(`${API_BASE}/me/addresses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(address),
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

function defaultConfig(): SiteConfig {
  return {
    site_name: 'XamIoT', support_email: '', logo_url: null, logo_height: 40,
    appstore_url: 'https://apps.apple.com', googleplay_url: 'https://play.google.com',
    nav_appstore_logo: null, nav_googleplay_logo: null,
  };
}

export async function getStripeConfig(): Promise<{ publishable_key: string | null; mode: string }> {
  try {
    const res = await fetch(`${API_BASE}/public/stripe/config`, { cache: 'no-store' });
    if (!res.ok) return { publishable_key: null, mode: 'test' };
    return res.json();
  } catch {
    return { publishable_key: null, mode: 'test' };
  }
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
