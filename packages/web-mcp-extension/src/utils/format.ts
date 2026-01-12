/**
 * Format a source URL for display (strips protocol, trailing slash)
 */
export function formatSourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host + parsed.pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
}

/**
 * Check if a string looks like a URL
 */
export function isUrl(str: string): boolean {
  return str.includes('://') || str.startsWith('www.');
}
