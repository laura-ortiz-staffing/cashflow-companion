// Shared Microsoft Graph helper used by graph-bootstrap, graph-push, graph-pull.
// Uses client-credentials flow (Application permissions); requires Azure AD admin
// consent on Files.ReadWrite.All + Sites.ReadWrite.All.
//
// All env vars are read lazily so a missing secret only breaks the call that
// needs it, not the function cold-start.

const GRAPH = "https://graph.microsoft.com/v1.0";
const LOGIN = "https://login.microsoftonline.com";

interface CachedToken {
  token: string;
  expiresAt: number;
}
let cachedToken: CachedToken | null = null;

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) {
    return cachedToken.token;
  }
  const tenant = env("MS_TENANT_ID");
  const clientId = env("MS_CLIENT_ID");
  const clientSecret = env("MS_CLIENT_SECRET");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const r = await fetch(`${LOGIN}/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`token: ${r.status} ${await r.text()}`);
  const j = await r.json();
  cachedToken = {
    token: j.access_token,
    expiresAt: Date.now() + j.expires_in * 1000,
  };
  return cachedToken.token;
}

async function graph<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const r = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, {
    ...init,
    headers,
  });
  if (r.status === 204) return undefined as T;
  const text = await r.text();
  if (!r.ok) throw new Error(`graph ${r.status} ${path}: ${text.slice(0, 500)}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

// Encode a SharePoint sharing URL into the format Graph expects for /shares.
function encodeSharingUrl(url: string): string {
  const b64 = btoa(url);
  return "u!" + b64.replace(/=+$/, "").replaceAll("/", "_").replaceAll("+", "-");
}

export interface DriveItem {
  id: string;
  name: string;
  parentReference: { driveId: string };
  webUrl: string;
}

export async function resolveSharedItem(sharingUrl: string): Promise<{
  driveId: string;
  itemId: string;
  webUrl: string;
}> {
  const enc = encodeSharingUrl(sharingUrl);
  const item = await graph<DriveItem>(`/shares/${enc}/driveItem`);
  return {
    driveId: item.parentReference.driveId,
    itemId: item.id,
    webUrl: item.webUrl,
  };
}

// ---------- workbook tables -------------------------------------------------

interface ExcelTable {
  id: string;
  name: string;
}

export async function listTables(driveId: string, itemId: string): Promise<ExcelTable[]> {
  const j = await graph<{ value: ExcelTable[] }>(
    `/drives/${driveId}/items/${itemId}/workbook/tables`,
  );
  return j.value;
}

export async function listTableRows(
  driveId: string,
  itemId: string,
  tableName: string,
): Promise<Array<{ index: number; values: unknown[] }>> {
  const j = await graph<{ value: Array<{ index: number; values: unknown[][] }> }>(
    `/drives/${driveId}/items/${itemId}/workbook/tables('${encodeURIComponent(tableName)}')/rows?$top=5000`,
  );
  return j.value.map((r) => ({ index: r.index, values: r.values[0] }));
}

export async function listTableColumns(
  driveId: string,
  itemId: string,
  tableName: string,
): Promise<string[]> {
  const j = await graph<{ value: Array<{ name: string }> }>(
    `/drives/${driveId}/items/${itemId}/workbook/tables('${encodeURIComponent(tableName)}')/columns`,
  );
  return j.value.map((c) => c.name);
}

export async function addRow(
  driveId: string,
  itemId: string,
  tableName: string,
  values: unknown[],
): Promise<{ index: number }> {
  const r = await graph<{ index: number }>(
    `/drives/${driveId}/items/${itemId}/workbook/tables('${encodeURIComponent(tableName)}')/rows/add`,
    { method: "POST", body: JSON.stringify({ values: [values] }) },
  );
  return r;
}

export async function getRowByIndex(
  driveId: string,
  itemId: string,
  tableName: string,
  index: number,
): Promise<unknown[] | null> {
  try {
    const j = await graph<{ values: unknown[][] }>(
      `/drives/${driveId}/items/${itemId}/workbook/tables('${encodeURIComponent(tableName)}')/rows/itemAt(index=${index})`,
    );
    return j.values?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function patchRowByIndex(
  driveId: string,
  itemId: string,
  tableName: string,
  index: number,
  values: unknown[],
): Promise<void> {
  await graph(
    `/drives/${driveId}/items/${itemId}/workbook/tables('${encodeURIComponent(tableName)}')/rows/itemAt(index=${index})`,
    { method: "PATCH", body: JSON.stringify({ values: [values] }) },
  );
}

export async function deleteRowByIndex(
  driveId: string,
  itemId: string,
  tableName: string,
  index: number,
): Promise<void> {
  await graph(
    `/drives/${driveId}/items/${itemId}/workbook/tables('${encodeURIComponent(tableName)}')/rows/itemAt(index=${index})`,
    { method: "DELETE" },
  );
}

// Find row by matching a value in a key column. Returns the row index or null.
export async function findRowIndex(
  driveId: string,
  itemId: string,
  tableName: string,
  keyColumn: string,
  keyValue: string,
): Promise<number | null> {
  const cols = await listTableColumns(driveId, itemId, tableName);
  const colIdx = cols.findIndex((c) => c.toLowerCase() === keyColumn.toLowerCase());
  if (colIdx < 0) return null;
  const rows = await listTableRows(driveId, itemId, tableName);
  const target = String(keyValue).trim().toLowerCase();
  for (const r of rows) {
    const v = r.values[colIdx];
    if (v != null && String(v).trim().toLowerCase() === target) return r.index;
  }
  return null;
}

// ---------- subscriptions (change notifications) ---------------------------

export interface Subscription {
  id: string;
  resource: string;
  expirationDateTime: string;
  notificationUrl: string;
  clientState?: string;
}

export async function createSubscription(input: {
  resource: string;
  notificationUrl: string;
  clientState: string;
  expirationDateTime: string;
  changeType?: string;
}): Promise<Subscription> {
  return await graph<Subscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      changeType: input.changeType ?? "updated",
      notificationUrl: input.notificationUrl,
      resource: input.resource,
      expirationDateTime: input.expirationDateTime,
      clientState: input.clientState,
    }),
  });
}

export async function renewSubscription(
  id: string,
  expirationDateTime: string,
): Promise<Subscription> {
  return await graph<Subscription>(`/subscriptions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ expirationDateTime }),
  });
}

export async function deleteSubscription(id: string): Promise<void> {
  await graph(`/subscriptions/${id}`, { method: "DELETE" });
}
