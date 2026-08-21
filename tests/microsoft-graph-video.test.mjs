import assert from "node:assert/strict";
import test from "node:test";
import {
  completeMicrosoftAuthorization,
  createMicrosoftAuthorizationUrl,
  ensureMicrosoftGraphHlsFolders,
  inspectMicrosoftGraphVideo,
  isAllowedMicrosoftDownloadUrl,
  resolveMicrosoftGraphPlayback,
  uploadMicrosoftGraphHlsFile,
} from "../lib/microsoft-graph-server.ts";

const envNames = [
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_TOKEN_ENCRYPTION_KEY",
  "MICROSOFT_REDIRECT_URI",
];

function fakeAdmin(adminId) {
  let connection = null;
  return {
    connection: () => connection,
    from(table) {
      if (table === "profiles") {
        return {
          select() {
            return {
              eq() {
                return { maybeSingle: async () => ({ data: { id: adminId, role: "admin", status: "active", account_status: "active" }, error: null }) };
              },
            };
          },
        };
      }
      if (table === "microsoft_graph_connections") {
        return {
          select() {
            return { eq() { return { maybeSingle: async () => ({ data: connection, error: null }) }; } };
          },
          async upsert(row) {
            connection = { ...row };
            return { error: null };
          },
          update(values) {
            return {
              async eq() {
                connection = { ...connection, ...values };
                return { error: null };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

test("delegated OAuth resolves a SharePoint item and returns only an allowed temporary playback URL", async () => {
  const previous = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  process.env.MICROSOFT_TENANT_ID = "tenant-id";
  process.env.MICROSOFT_CLIENT_ID = "client-id";
  process.env.MICROSOFT_CLIENT_SECRET = "server-secret";
  process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");
  process.env.MICROSOFT_REDIRECT_URI = "https://www.mathremix.pro.vn/api/admin/microsoft/callback";
  const adminId = "00000000-0000-4000-8000-000000000001";
  const admin = fakeAdmin(adminId);
  const requests = [];
  const shareUrl = "https://contoso-my.sharepoint.com/:v:/g/personal/teacher_contoso_com/Example?e=abc123";
  const temporaryUrl = "https://public.dm.files.1drv.com/y4m/video.mp4?tempauth=short-lived";
  const fetcher = async (url, init = {}) => {
    const value = String(url);
    requests.push({ value, init });
    if (value.includes("/oauth2/v2.0/token")) {
      return Response.json({ access_token: "delegated-access-token", refresh_token: "delegated-refresh-token", expires_in: 3600, scope: "Files.ReadWrite User.Read" });
    }
    if (value.endsWith("/me?$select=id,userPrincipalName,mail")) {
      return Response.json({ id: "microsoft-user-id", userPrincipalName: "teacher@contoso.com" });
    }
    if (value.includes("/shares/") && value.includes("/driveItem")) {
      assert.equal(init.headers.authorization, "Bearer delegated-access-token");
      assert.equal(init.headers.prefer, "redeemSharingLinkIfNecessary");
      return Response.json({
        id: "item-id",
        name: "Bài giảng.mp4",
        size: 123456,
        webUrl: shareUrl,
        file: { mimeType: "video/mp4" },
        video: { duration: 90000, width: 1920, height: 1080 },
        parentReference: { driveId: "drive-id" },
      });
    }
    if (value.includes("/drives/drive-id/items/item-id/content")) {
      assert.equal(init.redirect, "manual");
      assert.equal(init.headers.authorization, "Bearer delegated-access-token");
      return new Response(null, { status: 302, headers: { location: temporaryUrl } });
    }
    throw new Error(`Unexpected request ${value}`);
  };

  try {
    const authorizationUrl = new URL(await createMicrosoftAuthorizationUrl(adminId, "/admin/content/courses/course-id"));
    assert.equal(authorizationUrl.hostname, "login.microsoftonline.com");
    assert.match(authorizationUrl.searchParams.get("scope") || "", /offline_access/);
    assert.match(authorizationUrl.searchParams.get("scope") || "", /Files\.ReadWrite/);
    assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
    const connection = await completeMicrosoftAuthorization(admin, "authorization-code", authorizationUrl.searchParams.get("state"), fetcher);
    assert.equal(connection.returnTo, "/admin/content/courses/course-id");
    assert.equal(connection.principal, "teacher@contoso.com");
    assert.notEqual(admin.connection().access_token_ciphertext, "delegated-access-token");
    assert.notEqual(admin.connection().refresh_token_ciphertext, "delegated-refresh-token");
    assert.equal(JSON.stringify(admin.connection()).includes("server-secret"), false);

    const metadata = await inspectMicrosoftGraphVideo(shareUrl, admin, fetcher);
    assert.equal(metadata.driveId, "drive-id");
    assert.equal(metadata.itemId, "item-id");
    assert.equal(metadata.mimeType, "video/mp4");
    assert.equal(metadata.playbackMode, "native");
    const playbackUrl = await resolveMicrosoftGraphPlayback(metadata.driveId, metadata.itemId, admin, fetcher);
    assert.equal(playbackUrl, temporaryUrl);
    assert.equal(requests.some(request => request.value === temporaryUrl), false);

    const hlsRequests = [];
    const hlsFetcher = async (url, init = {}) => {
      const value = String(url);
      hlsRequests.push({ value, init });
      if (value.endsWith("/me/drive/root?$select=id")) return Response.json({ id: "root-id" });
      if (value.endsWith(":/content")) return Response.json({ id: "master-id", size: 3 }, { status: 201 });
      if (value.includes("/me/drive/root:/")) return new Response(null, { status: 404 });
      if (value.endsWith("/children") && init.method === "POST") {
        const body = JSON.parse(String(init.body));
        return Response.json({ id: `${body.name}-id`, name: body.name, folder: {} }, { status: 201 });
      }
      throw new Error(`Unexpected HLS request ${value}`);
    };
    const folders = await ensureMicrosoftGraphHlsFolders("lesson01", admin, hlsFetcher);
    assert.equal(folders.folderPath, "VideoVault/lesson01");
    assert.equal(folders.ready, true);
    assert.equal(hlsRequests.some(request => /\/1080p|\/720p/.test(request.value)), false);
    const uploaded = await uploadMicrosoftGraphHlsFile("lesson01", "index.m3u8", new Uint8Array([1, 2, 3]).buffer, admin, hlsFetcher);
    assert.deepEqual(uploaded, { path: "index.m3u8", size: 3, uploaded: true });
    assert.equal(hlsRequests.some(request => request.value.includes("VideoVault/lesson01/index.m3u8")), true);
  } finally {
    for (const name of envNames) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test("temporary playback URL allowlist rejects lookalikes and insecure redirects", () => {
  assert.equal(isAllowedMicrosoftDownloadUrl("https://public.dm.files.1drv.com/video.mp4?tempauth=x"), true);
  assert.equal(isAllowedMicrosoftDownloadUrl("https://contoso-my.sharepoint.com/video.mp4?tempauth=x"), true);
  assert.equal(isAllowedMicrosoftDownloadUrl("https://files.1drv.com.attacker.example/video.mp4"), false);
  assert.equal(isAllowedMicrosoftDownloadUrl("http://public.dm.files.1drv.com/video.mp4"), false);
  assert.equal(isAllowedMicrosoftDownloadUrl("https://user:pass@public.dm.files.1drv.com/video.mp4"), false);
});
