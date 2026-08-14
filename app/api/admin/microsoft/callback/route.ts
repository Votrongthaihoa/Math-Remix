import { completeMicrosoftAuthorization, MicrosoftGraphError } from "../../../../../lib/microsoft-graph-server";
import { securityAdminClient } from "../../../../../lib/security-server";

const fallbackPath = "/admin/content";
const productionOrigin = "https://www.mathremix.pro.vn";

function redirect(path: string, status: "connected" | "error", code?: string) {
  const target = new URL(path.startsWith("/admin/") && !path.startsWith("//") ? path : fallbackPath, productionOrigin);
  target.searchParams.set("microsoft", status);
  if (code) target.searchParams.set("microsoftCode", code);
  return new Response(null, { status: 303, headers: { location: target.toString(), "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  const oauthError = url.searchParams.get("error")?.trim() ?? "";
  if (oauthError || !code || !state) return redirect(fallbackPath, "error", oauthError === "access_denied" ? "MICROSOFT_ACCESS_DENIED" : "MICROSOFT_CALLBACK_INVALID");
  const admin = securityAdminClient();
  if (!admin) return redirect(fallbackPath, "error", "SERVER_CONFIGURATION_REQUIRED");
  try {
    const connection = await completeMicrosoftAuthorization(admin, code, state);
    return redirect(connection.returnTo, "connected");
  } catch (error) {
    if (error instanceof MicrosoftGraphError) {
      console.error("[microsoft-callback] connection failed", { code: error.code, status: error.status });
      return redirect(fallbackPath, "error", error.code);
    }
    console.error("[microsoft-callback] unexpected failure", error);
    return redirect(fallbackPath, "error", "MICROSOFT_CALLBACK_FAILED");
  }
}
