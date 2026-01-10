// Image URL obfuscation utilities
// Hides the pattern so EAN codes are not visible in URLs

const SALT = "ica_plock_2026_";

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
  // If it's already a full URL (http/https), return as-is for now
  // In future could proxy these too
  if (ean.startsWith('http://') || ean.startsWith('https://')) {
    return ean;
  }
  // Generate proxied URL
  const imageId = encodeImageId(ean);
  return `/api/image/${imageId}`;
}

/**
 * Check if a URL is a proxied image URL
 */
export function isProxiedImageUrl(url: string): boolean {
  return url.startsWith('/api/image/');
}
