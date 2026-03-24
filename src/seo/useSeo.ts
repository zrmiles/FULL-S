import { useEffect } from 'react';

type SeoPayload = {
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
  structuredData?: Record<string, unknown> | null;
};

const SITE_NAME = 'MTUCI Voting App';
const DEFAULT_OG_IMAGE = '/social-preview.svg';

function upsertMeta(attribute: 'name' | 'property', key: string, content: string): void {
  const selector = `meta[${attribute}="${key}"]`;
  let tag = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    tag.setAttribute('data-seo-managed', '1');
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function upsertCanonical(href: string): void {
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('data-seo-managed', '1');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

function upsertStructuredData(payload: Record<string, unknown> | null | undefined): void {
  const scriptId = 'seo-structured-data';
  const existing = document.getElementById(scriptId);
  if (!payload) {
    existing?.remove();
    return;
  }

  let script = existing as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = scriptId;
    script.setAttribute('data-seo-managed', '1');
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(payload);
}

export function useSeo(payload: SeoPayload): void {
  useEffect(() => {
    const origin = window.location.origin;
    const canonicalUrl = `${origin}${payload.canonicalPath}`;
    const ogType = payload.ogType ?? 'website';
    const ogImage = payload.ogImage ?? `${origin}${DEFAULT_OG_IMAGE}`;

    document.title = payload.title;
    upsertMeta('name', 'description', payload.description);
    upsertMeta('name', 'robots', payload.robots);
    upsertMeta('property', 'og:title', payload.title);
    upsertMeta('property', 'og:description', payload.description);
    upsertMeta('property', 'og:type', ogType);
    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:locale', 'ru_RU');
    upsertMeta('property', 'og:image', ogImage);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', payload.title);
    upsertMeta('name', 'twitter:description', payload.description);
    upsertMeta('name', 'twitter:image', ogImage);
    upsertCanonical(canonicalUrl);
    upsertStructuredData(payload.structuredData);
  }, [payload]);
}
