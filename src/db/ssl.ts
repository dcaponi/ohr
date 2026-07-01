/**
 * TLS setting for the Postgres connection, chosen from the connection host:
 *  - local dev (localhost) and Railway's private network (*.railway.internal):
 *    no TLS — traffic is local/internal.
 *  - everything else (Neon, Railway public proxy, other hosts): require TLS but
 *    don't verify the cert. Neon presents a valid cert; Railway's Postgres image
 *    uses a self-signed one, so cert verification would fail there. This is a
 *    pragmatic demo-grade setting (encrypt in transit, skip CA verification).
 */
export function sslFor(url: string): false | { rejectUnauthorized: boolean } {
  if (/localhost|127\.0\.0\.1|\.railway\.internal/.test(url)) return false;
  return { rejectUnauthorized: false };
}
