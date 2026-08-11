import assert from "node:assert/strict";

export async function createAdminIssuedSmokeSession({ admin, client, email }) {
  const generated = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  assert.equal(generated.error, null, generated.error?.message ?? "failed to generate smoke sign-in link");

  const tokenHash = generated.data.properties?.hashed_token;
  assert.ok(tokenHash, "smoke sign-in link did not return a token hash");

  const verified = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  assert.equal(verified.error, null, verified.error?.message ?? "failed to verify smoke sign-in link");
  assert.ok(verified.data.session?.access_token, "smoke sign-in did not return an access token");
  return verified.data.session;
}
