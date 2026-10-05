/**
 * Official TRM (COP per 1 USD) from Banco de la República via datos.gov.co.
 * Returns the latest rate published on or before `onOrBefore` (YYYY-MM-DD).
 * Same source Petty Cash uses for USD invoices.
 */
export async function fetchTRM(onOrBefore: string): Promise<{ rate: number; date: string } | null> {
  try {
    const target = `${onOrBefore}T23:59:59.000`;
    const url =
      `https://www.datos.gov.co/resource/32sa-8pi3.json` +
      `?$where=vigenciadesde%20%3C%3D%20'${target}'` +
      `&$order=vigenciadesde%20DESC&$limit=1`;
    const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
    const data = await r.json();
    if (Array.isArray(data) && data[0]?.valor) {
      return {
        rate: parseFloat(data[0].valor),
        date: String(data[0].vigenciadesde ?? "").slice(0, 10),
      };
    }
  } catch {
    /* network or API failure: caller falls back to a saved or manual rate */
  }
  return null;
}
