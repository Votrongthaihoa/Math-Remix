// Test-only live binding used by auth-client tests. The production module
// imports `supabase` as an ES module binding, so changing this value lets every
// test exercise both configured and missing-configuration branches without
// cache-busting the production module (which would duplicate coverage files).
export let supabase = null;

export function setSupabase(value) {
  supabase = value;
}
