import {
  SignupRequestSchema,
  SignupResultSchema,
  type SignupRequest,
} from "@aeck/contracts";

import { requestApi } from "./api-client.ts";

export function signUp(
  input: SignupRequest,
  fetcher?: typeof fetch,
) {
  const request = SignupRequestSchema.parse(input);
  return requestApi("/api/platform/v1/signup", SignupResultSchema, {
    method: "POST",
    body: JSON.stringify(request),
    fetcher,
  });
}
