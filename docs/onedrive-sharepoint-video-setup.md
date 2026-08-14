# OneDrive / SharePoint lesson videos

The course builder supports Microsoft-hosted video resources through the official Microsoft Graph API. Admins paste one stable sharing URL; the database stores that URL plus the stable drive/item identifiers. Learner playback URLs are resolved on demand and are never persisted.

## Supported in this release

- SharePoint Online video sharing links.
- OneDrive for Business links hosted on `*.sharepoint.com`.
- Microsoft `1drv.ms` short links when Microsoft Graph can resolve them in the configured tenant.
- OneDrive Personal links are detected but rejected with an actionable message. Personal files require delegated user authorization and secure refresh-token storage; application-only credentials are not silently substituted.

## Microsoft Entra configuration

Create a server-side Microsoft Entra application and configure these deployment secrets:

```text
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
```

Never prefix these variables with `NEXT_PUBLIC_`.

The Graph sharing-link endpoint currently documents `Files.ReadWrite.All` as the least privileged application permission for `GET /shares/{encodedSharingUrl}/driveItem`. Grant only the documented permission needed for this flow and complete admin consent in the intended tenant. The normal drive-item content lookup needs file read permission. Re-check Microsoft Graph permissions before production rollout because the sharing endpoint's least-privileged scope can change.

## Data and playback flow

1. The admin route validates the host and resolves `driveId`, `itemId`, MIME type, filename, size, and video metadata.
2. `lesson_resources` stores the original stable sharing URL, stable identifiers, and non-secret metadata.
3. The existing content token, active-account, publication, and enrollment checks run before playback resolution.
4. Microsoft Graph returns `@microsoft.graph.downloadUrl`, a short-lived preauthenticated URL.
5. The browser's HTML5 player requests that URL directly from Microsoft/CDN and supports byte ranges for seeking.
6. The player resolves a fresh URL once automatically after a media error and also exposes a manual retry.

The application does not proxy video bytes, store Graph access tokens, or store temporary CDN URLs. Resolver results are cached briefly in process memory and concurrent requests for the same item are deduplicated.

## Database rollout

Apply `supabase/migrations/20260814003030_onedrive_lesson_video_resources.sql` only after reviewing it and verifying the live project through a project-scoped Supabase connection. The migration is forward-only and does not rewrite existing resources or policies.

## Official references

- [Access shared items](https://learn.microsoft.com/en-us/graph/api/shares-get?view=graph-rest-1.0)
- [Download driveItem content](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0)
- [Preview a driveItem](https://learn.microsoft.com/en-us/graph/api/driveitem-preview?view=graph-rest-1.0)
- [OAuth 2.0 client credentials flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow)
