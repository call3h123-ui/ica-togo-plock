import { NextRequest, NextResponse } from "next/server";

// Simple obfuscation: base64 encode the EAN with a salt
const SALT = "ica_plock_2026_";

export function encodeImageId(ean: string): string {
  // Add salt and encode to base64, then make URL-safe
  const salted = SALT + ean;
  const encoded = Buffer.from(salted).toString('base64');
  // Make URL safe: replace + with -, / with _, remove =
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function decodeImageId(id: string): string | null {
  try {
    // Restore base64 padding and characters
    let base64 = id.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    // Remove salt and return EAN
    if (decoded.startsWith(SALT)) {
      return decoded.slice(SALT.length);
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ean = decodeImageId(id);
  
  if (!ean) {
    return new NextResponse("Invalid image ID", { status: 400 });
  }

  // Pad EAN to 13 digits
  const paddedEan = ean.padStart(13, '0');
  
  // Check if it's a base64 data URL (uploaded image)
  // In that case, the "ean" would start with "data:"
  if (ean.startsWith('data:')) {
    // For base64 images, redirect is not possible, just return error
    // Base64 images should be served directly, not through proxy
    return new NextResponse("Base64 images not supported via proxy", { status: 400 });
  }

  // Fetch from ICA assets
  const icaUrl = `https://assets.icanet.se/t_minbutik_preview,f_auto/${paddedEan}.jpg`;
  
  try {
    const response = await fetch(icaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ICA-ToGo-Plock/1.0)',
      },
    });

    if (!response.ok) {
      // If ICA doesn't have the image, return a placeholder or 404
      return new NextResponse("Image not found", { status: 404 });
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error("Error fetching image:", error);
    return new NextResponse("Error fetching image", { status: 500 });
  }
}
