type AuthPaginationLimitInput = {
  page: number;
  pageSize: number;
  userCount: number;
  usersSeen: number;
  total: unknown;
  nextPage: unknown;
};

/**
 * Reports whether a full final Auth page may have been truncated.
 *
 * Auth's pagination metadata is optional across deployed versions. At the
 * configured page limit, only a reported total that exactly matches the users
 * seen (and no later nextPage) can prove that the roster is complete.
 */
export function authPaginationHasMoreAtLimit(input: AuthPaginationLimitInput) {
  if (input.userCount < input.pageSize) return false;
  const reportedTotal = input.total === null || input.total === undefined || input.total === ""
    ? null
    : Number(input.total);
  const reportedNextPage = input.nextPage === null || input.nextPage === undefined || input.nextPage === ""
    ? null
    : Number(input.nextPage);
  const providerConfirmsComplete = reportedTotal !== null && Number.isFinite(reportedTotal)
    && reportedTotal === input.usersSeen
    && !(reportedNextPage !== null && Number.isInteger(reportedNextPage) && reportedNextPage > input.page);
  return !providerConfirmsComplete;
}
