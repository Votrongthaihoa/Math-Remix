# OneDrive and SharePoint lesson videos

Math Remix plays Microsoft-hosted lesson videos in its native `<video>` player. The application does not proxy video bytes through Vercel.

## Runtime flow

1. An administrator connects the Microsoft work account once through delegated OAuth.
2. The course builder sends a pasted sharing link to the authenticated admin API.
3. Microsoft Graph resolves the link with `/shares/{encodedUrl}/driveItem`.
4. Math Remix stores the stable sharing URL plus `driveId` and `itemId`.
5. When an authorized learner opens the lesson, the server checks the active account, published lesson, enrollment, and signed content token.
6. The server requests `/drives/{driveId}/items/{itemId}/content` and receives a 302 preauthenticated Microsoft CDN URL.
7. Only that short-lived HTTPS URL is returned to the native player. It is never persisted in Postgres.

## Entra application

- Tenant ID: configure `MICROSOFT_TENANT_ID` on the server.
- Client ID: configure `MICROSOFT_CLIENT_ID` on the server.
- Client secret: configure `MICROSOFT_CLIENT_SECRET` on the server.
- Delegated Graph permissions: `User.Read` and `Files.ReadWrite`.
- Redirect URI (Web): `https://www.mathremix.pro.vn/api/admin/microsoft/callback`.
- Runtime scopes also request `openid`, `profile`, and `offline_access`.

Do not enable implicit grant. Do not expose Microsoft credentials through `NEXT_PUBLIC_*` variables.

## Token storage

Apply `supabase/migrations/20260814021906_microsoft_graph_delegated_connection.sql` only after explicit production approval. The table has RLS forced, no policies for browser roles, and all privileges revoked from `public`, `anon`, and `authenticated`.

Access and refresh tokens are encrypted with AES-256-GCM before database storage. Configure a random 32-byte base64url key as `MICROSOFT_TOKEN_ENCRYPTION_KEY`. Rotating this key invalidates the stored connection and requires the administrator to connect Microsoft again.

The earlier `20260814003030_onedrive_lesson_video_resources.sql` migration remains part of history because it introduced the `onedrive_video` resource type. Do not replay or rewrite an applied migration.

## Security boundary

- Refresh/access tokens never reach browser code.
- Temporary CDN URLs are returned only after the normal Math Remix authorization checks.
- Redirects are accepted only over HTTPS and only for supported Microsoft host suffixes.
- Video bytes go directly from Microsoft to the learner's browser.
- A temporary media URL can still be seen in browser developer tools; this is access control, not DRM.
- If the delegated account loses access or the refresh token is revoked, the administrator must reconnect Microsoft.

## Official references

- [Access shared DriveItems](https://learn.microsoft.com/en-us/graph/api/shares-get?view=graph-rest-1.0)
- [Download DriveItem content](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0)
- [Microsoft identity platform authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
