# Azure AD / Microsoft Graph — Setup request

Hand this document to whoever has Global Admin (or Application Administrator + Cloud Application Administrator) on the **staffingglobalorg** tenant.

The Petty Cash app (Cashflow Companion) needs an Azure AD app registration so its backend can read and write a specific SharePoint Excel workbook on behalf of the tenant.

## What to create

### 1. Register the application
- Portal: https://entra.microsoft.com → **Applications** → **App registrations** → **New registration**
- **Name:** `Petty Cash Sync`
- **Supported account types:** *Accounts in this organizational directory only (single tenant)*
- **Redirect URI:** *leave empty for now* (we use client-credentials flow, no redirect needed)

### 2. Add API permissions (Application, not Delegated)
Inside the registered app → **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**:

| Permission | Reason |
|---|---|
| `Files.ReadWrite.All` | Read and write the workbook content via the Excel API |
| `Sites.ReadWrite.All` | Resolve the SharePoint sharing link to a drive/item ID |

Then click **Grant admin consent for staffingglobalorg**. Both permissions must show a green check.

> We are intentionally NOT requesting `Files.ReadWrite.All` (Delegated) — this app runs server-side without a logged-in user.

### 3. Create a client secret
- App registration → **Certificates & secrets** → **Client secrets** → **New client secret**
- **Description:** `petty-cash-edge-fn`
- **Expires:** 24 months (set a calendar reminder to rotate)
- **Copy the *Value*** immediately. It is shown only once.

### 4. Restrict the app to one workbook (recommended, optional)
By default `Files.ReadWrite.All` lets the app touch any file in the tenant. To scope it down to just our workbook, configure a **Sites.Selected** policy via the Graph API or via **SharePoint admin → Active sites → [site] → Permissions**. Skip if your security team is OK with the broader scope; otherwise ask the security team to lock the app to the SharePoint site that hosts the Petty Cash workbook only.

## What to send back to the dev team

Send these four values via your secrets manager or 1Password (NEVER over email/Slack in plain text):

| Name | What it is | Example shape |
|---|---|---|
| `MS_TENANT_ID` | Directory (tenant) ID from the app overview page | `00000000-0000-0000-0000-000000000000` |
| `MS_CLIENT_ID` | Application (client) ID from the app overview page | `00000000-0000-0000-0000-000000000000` |
| `MS_CLIENT_SECRET` | The Value field from step 3 | `aBc~123...` |
| `MS_WORKBOOK_URL` | The SharePoint sharing URL of the workbook | `https://staffingglobalorg.sharepoint.com/:x:/g/IQBase7E4...` |

That is everything. We will resolve drive/item IDs from the URL on first run.

## Estimated time
~15 minutes if the admin already knows their way around Entra, plus the consent click.
