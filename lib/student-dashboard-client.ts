export type DashboardWidgetClient = {
  getUserInfo: () => Promise<unknown>;
  getCompleted: () => Promise<unknown>;
  getCourses: () => Promise<unknown>;
  getExamRooms: () => Promise<unknown>;
  getMyResults: () => Promise<unknown>;
};

export type DashboardWidgetSnapshot = {
  userInfo: unknown | null;
  completed: unknown | null;
  courses: unknown | null;
  examRooms: unknown | null;
  myResults: unknown | null;
  failed: string[];
};

/** Fetch independent dashboard widgets without letting one stale API break the shell. */
export async function fetchDashboardWidgets(client: DashboardWidgetClient): Promise<DashboardWidgetSnapshot> {
  const entries = [
    ["userInfo", client.getUserInfo],
    ["completed", client.getCompleted],
    ["courses", client.getCourses],
    ["examRooms", client.getExamRooms],
    ["myResults", client.getMyResults],
  ] as const;
  const settled = await Promise.allSettled(entries.map(([, load]) => load()));
  const snapshot: DashboardWidgetSnapshot = { userInfo: null, completed: null, courses: null, examRooms: null, myResults: null, failed: [] };
  settled.forEach((result, index) => {
    const key = entries[index][0];
    if (result.status === "fulfilled") snapshot[key] = result.value;
    else snapshot.failed.push(key);
  });
  return snapshot;
}
