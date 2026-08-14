import assert from "node:assert/strict";
import test from "node:test";
import { encodeMicrosoftSharingUrl, parseMicrosoftShareUrl } from "../lib/microsoft-share-url.ts";
import { inspectMicrosoftShareVideo, MicrosoftGraphVideoError, resolveMicrosoftVideoPlayback } from "../lib/microsoft-graph-video.ts";

const businessUrl = "https://contoso-my.sharepoint.com/:v:/g/personal/teacher_contoso_com/Example?e=abc123#ignored";

function configuredEnvironment() {
  process.env.MICROSOFT_TENANT_ID = "contoso.onmicrosoft.com";
  process.env.MICROSOFT_CLIENT_ID = "00000000-0000-4000-8000-000000000001";
  process.env.MICROSOFT_CLIENT_SECRET = "test-secret-never-returned";
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("recognizes only supported HTTPS Microsoft sharing hosts", () => {
  assert.equal(parseMicrosoftShareUrl(businessUrl)?.provider, "onedrive_business");
  assert.equal(parseMicrosoftShareUrl("https://contoso.sharepoint.com/:v:/s/math/Example")?.provider, "sharepoint");
  assert.equal(parseMicrosoftShareUrl("https://onedrive.live.com/?id=abc")?.provider, "onedrive_personal");
  assert.equal(parseMicrosoftShareUrl("https://1drv.ms/v/s!abc")?.provider, "microsoft_short_link");
  assert.equal(parseMicrosoftShareUrl("http://contoso.sharepoint.com/video.mp4"), null);
  assert.equal(parseMicrosoftShareUrl("https://sharepoint.com.attacker.example/video.mp4"), null);
  assert.equal(parseMicrosoftShareUrl("https://user:pass@contoso.sharepoint.com/video.mp4"), null);
});
test("encodes sharing URLs using the documented u! unpadded base64url format", () => {
  const normalized = parseMicrosoftShareUrl(businessUrl).url;
  const expected = `u!${Buffer.from(normalized, "utf8").toString("base64url")}`;
  assert.equal(encodeMicrosoftSharingUrl(businessUrl), expected);
  assert.equal(expected.includes("="), false);
});

test("personal OneDrive fails cleanly until delegated Microsoft auth is configured", async () => {
  await assert.rejects(
    inspectMicrosoftShareVideo("https://onedrive.live.com/?id=abc"),
    error => error instanceof MicrosoftGraphVideoError && error.code === "ONEDRIVE_PERSONAL_REQUIRES_DELEGATED_AUTH" && error.status === 422,
  );
});

test("resolves business metadata and playback without exposing Graph credentials", async () => {
  configuredEnvironment();
  const requests = [];
  const fetcher = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if (String(url).includes("/oauth2/v2.0/token")) {
      assert.equal(String(init.body).includes("client_secret=test-secret-never-returned"), true);
      return jsonResponse({ access_token: "graph-access-token", expires_in: 3600 });
    }
    if (String(url).includes("/shares/")) return jsonResponse({
      id: "item-123",
      name: "Bai giang ham so.mp4",
      size: 123456,
      webUrl: "https://contoso.sharepoint.com/video",
      file: { mimeType: "video/mp4" },
      video: { duration: 125000, width: 1920, height: 1080 },
      parentReference: { driveId: "drive-123", driveType: "business" },
    });
    return jsonResponse({
      id: "item-123",
      name: "Bai giang ham so.mp4",
      file: { mimeType: "video/mp4" },
      parentReference: { driveId: "drive-123", driveType: "business" },
      "@microsoft.graph.downloadUrl": "https://cdn.example.invalid/temporary-video-url",
    });
  };

  const metadata = await inspectMicrosoftShareVideo(businessUrl, fetcher);
  assert.equal(metadata.driveId, "drive-123");
  assert.equal(metadata.itemId, "item-123");
  assert.equal(metadata.durationMs, 125000);
  assert.equal(JSON.stringify(metadata).includes("graph-access-token"), false);
  assert.equal(JSON.stringify(metadata).includes("test-secret-never-returned"), false);

  const playback = await resolveMicrosoftVideoPlayback({ shareUrl: businessUrl, driveId: metadata.driveId, itemId: metadata.itemId, forceRefresh: true }, fetcher);
  assert.equal(playback.playbackUrl, "https://cdn.example.invalid/temporary-video-url");
  assert.equal(requests.some(request => request.url.includes("/drives/drive-123/items/item-123")), true);
  assert.equal(requests.filter(request => request.url.includes("/oauth2/v2.0/token")).length, 1);
});

test("rejects a shared item that is not a video", async () => {
  configuredEnvironment();
  const fetcher = async url => String(url).includes("/oauth2/v2.0/token")
    ? jsonResponse({ access_token: "graph-access-token", expires_in: 3600 })
    : jsonResponse({ id: "pdf-1", name: "document.pdf", file: { mimeType: "application/pdf" }, parentReference: { driveId: "drive-1", driveType: "business" } });
  await assert.rejects(
    inspectMicrosoftShareVideo("https://contoso.sharepoint.com/:b:/s/math/abc", fetcher),
    error => error instanceof MicrosoftGraphVideoError && error.code === "MICROSOFT_NOT_A_VIDEO",
  );
});
