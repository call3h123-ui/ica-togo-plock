// Image URL obfuscation utilities
// Hides the pattern so EAN codes are not visible in URLs

const SALT = "ica_plock_2026_";

// Pattern to match ICA asset URLs and extract EAN
const ICA_URL_PATTERN = /^https?:\/\/assets\.icanet\.se\/[^\/]+\/(\d+)\.jpg$/;

/**
 * Encode an EAN to an obfuscated image ID for use with /api/image/[id]
 * This hides the EAN pattern from the URL
 */
export function encodeImageId(ean: string): string {
  // Add salt and encode to base64, then make URL-safe
  const salted = SALT + ean;
  // Use btoa for browser compatibility
  const encoded = typeof window !== 'undefined' 
    ? btoa(salted)
    : Buffer.from(salted).toString('base64');
  // Make URL safe: replace + with -, / with _, remove =
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Get the proxied image URL that hides the EAN pattern
 * Returns /api/image/{obfuscated_id} instead of the direct ICA URL
 */
export function getProxiedImageUrl(ean: string): string {
  // If it's already a data URL (base64), return as-is
  if (ean.startsWith('data:')) {
    return ean;
  }
  // If it's already a proxied URL, return as-is
  if (ean.startsWith('/api/image/')) {
    return ean;
  }
  // If it's already a full URL (http/https), check if it's an ICA URL we can proxy
  if (ean.startsWith('http://') || ean.startsWith('https://')) {
    const converted = convertLegacyImageUrl(ean);
    if (converted !== ean) {
      return converted;
    }
    // Other URLs - return as-is
    return ean;
  }
  // Assume it's an EAN - generate proxied URL
  const imageId = encodeImageId(ean);
  return `/api/image/${imageId}`;
}

/**
 * Convert legacy ICA asset URLs to proxied URLs
 * This handles existing products in the database with old URLs
 */
export function convertLegacyImageUrl(url: string): string {
  if (!url) return url;
  
  // Check if it's an ICA asset URL
  const match = url.match(ICA_URL_PATTERN);
  if (match) {
    const ean = match[1]; // Extract EAN from URL
    const imageId = encodeImageId(ean);
    return `/api/image/${imageId}`;
  }
  
  // Not an ICA URL, return as-is
  return url;
}

/**
 * Check if a URL is a proxied image URL
 */
export function isProxiedImageUrl(url: string): boolean {
  return url.startsWith('/api/image/');
}

/**
 * Get a safe image URL - converts any legacy URLs to proxied ones
 * Use this when displaying images to ensure EAN is never visible
 */
export function getSafeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  
  // Already a data URL (uploaded image) - safe
  if (url.startsWith('data:')) {
    return url;
  }
  
  // Already proxied - safe
  if (url.startsWith('/api/image/')) {
    return url;
  }
  
  // ICA URL - convert to proxy
  if (url.includes('assets.icanet.se')) {
    return convertLegacyImageUrl(url);
  }
  
  // Other URLs - return as-is (could be external images)
  return url;
}
