export type MicrosoftShareProvider = "sharepoint" | "onedrive_business" | "onedrive_personal" | "microsoft_short_link";

export type MicrosoftShareLink = {
  url: string;
  provider: MicrosoftShareProvider;
  label: string;
};

const SHAREPOINT_HOST = /(^|\.)sharepoint\.com$/i;

export function parseMicrosoftShareUrl(value: string): MicrosoftShareLink | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  url.hash = "";
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");

  if (SHAREPOINT_HOST.test(hostname)) {
    const personalPath = url.pathname.toLowerCase().includes("/personal/");
    return {
      url: url.toString(),
      provider: personalPath ? "onedrive_business" : "sharepoint",
      label: personalPath ? "OneDrive for Business" : "SharePoint",
    };
  }
  if (hostname === "onedrive.live.com") {
    return { url: url.toString(), provider: "onedrive_personal", label: "OneDrive Personal" };
  }
  if (hostname === "1drv.ms") {
    return { url: url.toString(), provider: "microsoft_short_link", label: "Liên kết Microsoft rút gọn" };
  }
  return null;
}

export function encodeMicrosoftSharingUrl(value: string) {
  const parsed = parseMicrosoftShareUrl(value);
  if (!parsed) throw new Error("Liên kết phải là URL chia sẻ HTTPS của OneDrive hoặc SharePoint.");
  const bytes = new TextEncoder().encode(parsed.url);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `u!${btoa(binary).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
}
