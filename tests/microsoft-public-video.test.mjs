import assert from "node:assert/strict";
import test from "node:test";
import { parseMicrosoftShareUrl } from "../lib/microsoft-share-url.ts";
import {
  inspectPublicMicrosoftVideo,
  MicrosoftPublicVideoError,
  resolvePublicMicrosoftPlayback,
} from "../lib/microsoft-public-video.ts";

const personalUrl = "https://onedrive.live.com/?id=ABC123%21104&cid=ABC123&authkey=%21public#ignored";
const businessUrl = "https://contoso-my.sharepoint.com/:v:/g/personal/teacher_contoso_com/Example?e=abc123#ignored";

test("recognizes only supported HTTPS Microsoft sharing hosts", () => {
  assert.equal(parseMicrosoftShareUrl(businessUrl)?.provider, "onedrive_business");
  assert.equal(parseMicrosoftShareUrl("https://contoso.sharepoint.com/:v:/s/math/Example")?.provider, "sharepoint");
  assert.equal(parseMicrosoftShareUrl(personalUrl)?.provider, "onedrive_personal");
  assert.equal(parseMicrosoftShareUrl("https://1drv.ms/v/s!abc")?.provider, "microsoft_short_link");
  assert.equal(parseMicrosoftShareUrl("http://contoso.sharepoint.com/video.mp4"), null);
  assert.equal(parseMicrosoftShareUrl("https://sharepoint.com.attacker.example/video.mp4"), null);
  assert.equal(parseMicrosoftShareUrl("https://user:pass@contoso.sharepoint.com/video.mp4"), null);
});

test("builds stable public playback URLs without Graph credentials", () => {
  const personal = resolvePublicMicrosoftPlayback(personalUrl);
  assert.equal(personal.mode, "native");
  assert.equal(personal.url, "https://onedrive.live.com/download?resid=ABC123%21104&authkey=%21public");

  const business = resolvePublicMicrosoftPlayback(businessUrl);
  assert.equal(business.mode, "native");
  assert.equal(new URL(business.url).searchParams.get("download"), "1");

  const embed = resolvePublicMicrosoftPlayback("https://onedrive.live.com/embed?resid=ABC123%21104&authkey=%21public");
  assert.equal(embed.mode, "embed");
});

test("inspects an anonymously playable OneDrive video without authorization headers", async () => {
  const requests = [];
  const fetcher = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    return new Response(null, {
      status: 200,
      headers: {
        "content-type": "video/mp4",
        "content-length": "123456",
        "content-disposition": "attachment; filename*=UTF-8''Bai%20giang%20ham%20so.mp4",
      },
    });
  };

  const metadata = await inspectPublicMicrosoftVideo(personalUrl, fetcher);
  assert.equal(metadata.provider, "onedrive_personal");
  assert.equal(metadata.name, "Bai giang ham so.mp4");
  assert.equal(metadata.mimeType, "video/mp4");
  assert.equal(metadata.size, 123456);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.redirect, "manual");
  assert.equal(requests[0].init.headers.authorization, undefined);
  assert.equal(JSON.stringify(requests).includes("MICROSOFT_CLIENT"), false);
});

test("resolves a public 1drv.ms link to a stable personal download URL", async () => {
  const requests = [];
  const fetcher = async url => {
    const value = String(url);
    requests.push(value);
    if (value.startsWith("https://1drv.ms/")) {
      return new Response(null, { status: 302, headers: { location: personalUrl } });
    }
    if (value.startsWith("https://onedrive.live.com/?")) {
      return new Response("viewer", { status: 200, headers: { "content-type": "text/html" } });
    }
    return new Response(null, {
      status: 200,
      headers: { "content-type": "video/mp4", "content-disposition": "attachment; filename=lesson.mp4" },
    });
  };

  const metadata = await inspectPublicMicrosoftVideo("https://1drv.ms/v/s!abc", fetcher);
  assert.equal(metadata.playbackUrl, "https://onedrive.live.com/download?resid=ABC123%21104&authkey=%21public");
  assert.equal(metadata.name, "lesson.mp4");
  assert.equal(requests.some(url => url.includes("/download?resid=")), true);
});

test("rejects links that still require a Microsoft sign-in", async () => {
  const fetcher = async () => new Response("sign in", { status: 200, headers: { "content-type": "text/html" } });
  await assert.rejects(
    inspectPublicMicrosoftVideo(businessUrl, fetcher),
    error => error instanceof MicrosoftPublicVideoError && error.code === "MICROSOFT_PUBLIC_LINK_REQUIRED" && error.status === 422,
  );
});

test("reports a private link clearly when Microsoft redirects to sign-in", async () => {
  const fetcher = async () => new Response(null, {
    status: 302,
    headers: { location: "https://login.microsoftonline.com/common/oauth2/authorize" },
  });
  await assert.rejects(
    inspectPublicMicrosoftVideo(businessUrl, fetcher),
    error => error instanceof MicrosoftPublicVideoError && error.code === "MICROSOFT_PUBLIC_LINK_REQUIRED",
  );
});

test("rejects non-video public downloads", async () => {
  const fetcher = async () => new Response(null, {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=document.pdf" },
  });
  await assert.rejects(
    inspectPublicMicrosoftVideo("https://onedrive.live.com/?id=ABC123%21105&authkey=%21public", fetcher),
    error => error instanceof MicrosoftPublicVideoError && error.code === "MICROSOFT_PUBLIC_NOT_VIDEO",
  );
});
