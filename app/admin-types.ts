export type AdminProfileRow = {
  id: string;
  full_name: string;
  student_code: string;
  role: "student" | "admin";
  status: "active" | "locked";
  created_at: string;
  email: string;
};

export type AdminCourseRow = {
  id: string;
  title: string;
  description: string;
  cover_url: string | null;
  cover_color: string;
  published: boolean;
  sort_order: number;
  created_at: string;
};

export type AdminLessonRow = {
  id: string;
  title: string;
  published: boolean;
  chapters: { course_id: string } | { course_id: string }[] | null;
};

export type AdminEnrollmentRow = {
  student_id: string;
  course_id: string;
};

export type AdminExamRoomRow = {
  id: string;
  title: string;
  published: boolean;
  access_mode: "open" | "assigned";
};

export type AdminExamEnrollmentRow = {
  student_id: string;
  room_id: string;
};
