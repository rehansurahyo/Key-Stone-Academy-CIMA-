import type { ExamLevel } from "./exam-levels";

// Latest links supplied by Keystone on 7 November 2026. These are public
// navigation links, not a grant of course enrolment or mock access.
export const STUDENT_RESOURCES: Record<ExamLevel, { course: string; whatsapp: string }> = {
  OCS: { course: "https://learn.keystoneacademia.com/course/cima-ocs-nov-26-mini-course", whatsapp: "https://chat.whatsapp.com/GkJVkYiR0TzFL9JZXghiTP" },
  MCS: { course: "https://learn.keystoneacademia.com/course/cimamcsminicourse", whatsapp: "https://chat.whatsapp.com/GiFJUGbQRNADkEeQ544hx5" },
  SCS: { course: "https://learn.keystoneacademia.com/course/cima-scs-nov-26-mini-course", whatsapp: "https://chat.whatsapp.com/JLy3GBvLVJhJ9oUKfOMmHC" },
};
