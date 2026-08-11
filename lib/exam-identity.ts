import { supabase } from "./supabase";

export type CandidateIdentity = {
  candidateName: string;
  candidateId: string;
  candidateEmail: string;
};

type CandidateIdentityOptions = {
  fallbackName?: string;
  profileId?: string;
};

function metadataValue(metadata: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Load the display identity used by the exam renderer from the learner profile. */
export async function loadCandidateIdentity({ fallbackName = "Học viên", profileId }: CandidateIdentityOptions = {}): Promise<CandidateIdentity> {
  const fallback = { candidateName: fallbackName, candidateId: "", candidateEmail: "" };
  if (!supabase) return fallback;

  let currentUserId = "";
  let currentUserEmail = "";
  let metadata: Record<string, unknown> | undefined;
  if (!profileId) {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return fallback;
    currentUserId = data.user.id;
    currentUserEmail = data.user.email ?? "";
    metadata = data.user.user_metadata as Record<string, unknown> | undefined;
    profileId = data.user.id;
  } else {
    const { data } = await supabase.auth.getUser();
    if (data.user?.id === profileId) {
      currentUserId = data.user.id;
      currentUserEmail = data.user.email ?? "";
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,student_code")
    .eq("id", profileId)
    .maybeSingle();

  const profileName = typeof profile?.full_name === "string" ? profile.full_name.trim() : "";
  const profileCode = typeof profile?.student_code === "string" ? profile.student_code.trim() : "";
  const metadataName = metadataValue(metadata, ["full_name", "name", "username"]);
  const metadataCode = metadataValue(metadata, ["student_code", "studentCode"]);

  return {
    candidateName: profileName || (profileId === currentUserId ? metadataName : "") || fallbackName,
    candidateId: profileCode || (profileId === currentUserId ? metadataCode : ""),
    candidateEmail: profileId === currentUserId ? currentUserEmail : "",
  };
}
