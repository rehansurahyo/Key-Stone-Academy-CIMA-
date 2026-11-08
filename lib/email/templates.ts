import { LEVEL_NAMES, type ExamLevel } from "@/lib/exam-levels";
import { STUDENT_RESOURCES } from "@/lib/student-resources";

export type EmailKind = "trial_welcome" | "trial_submission" | "trial_feedback" | "enrolled_invitation";
export type EmailContent = { kind: EmailKind; fullName: string; level: ExamLevel; examName?: string; passwordLink?: string; portalOrigin: string };
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function renderEmail(input: EmailContent) {
  const { kind, level } = input, firstName = input.fullName.trim().split(/\s+/)[0] || "Student";
  const dashboard = `${input.portalOrigin}/dashboard`, resources = STUDENT_RESOURCES[level];
  const paragraphs: string[] = [], links: { label: string; url: string }[] = [];
  let subject: string;
  switch (kind) {
    case "trial_welcome":
      subject = `${level}: Welcome to Keystone Academia | Your Free CIMA ${level} Mock Exam Is Ready`;
      paragraphs.push("Welcome to Keystone Academia!", `Thank you for registering for our FREE CIMA ${LEVEL_NAMES[level]} (${level}) Mock Exam.`, "Your free mock is designed to help you practise under real exam conditions and identify areas for improvement.", "Your dashboard is available immediately. Before starting, check the mock instructions and timer, choose a quiet place and allow enough uninterrupted time to complete it. Attempt the exam independently and submit your answers before time runs out.");
      links.push({ label: `Access your free ${level} mock`, url: dashboard }, { label: `Free ${level} mini-course`, url: resources.course }, { label: `Join our free ${level} WhatsApp group`, url: resources.whatsapp });
      break;
    case "trial_submission":
      subject = `Your Free CIMA ${level} Mock Exam Has Been Submitted`;
      paragraphs.push(`Thank you for completing your FREE CIMA ${LEVEL_NAMES[level]} (${level}) Mock Exam with Keystone Academia.`, `Your answers${input.examName ? ` for ${input.examName}` : ""} have been submitted successfully.`, "Our team will review your answers and provide feedback to help you identify your strengths and areas for improvement. We will email you as soon as your feedback is ready. No further action is needed at this stage.", "In the meantime, continue your revision and practise applying your knowledge to case study scenarios.");
      break;
    case "trial_feedback":
      subject = `Your Free CIMA ${level} Mock Exam Feedback Is Ready`;
      paragraphs.push(`Your FREE CIMA ${LEVEL_NAMES[level]} (${level}) Mock Exam feedback is now available!`, `Our team has reviewed your answers${input.examName ? ` for ${input.examName}` : ""}, and you can now access your published feedback on the exam dashboard.`, "Review the comments carefully, identify areas for improvement, revise the relevant technical topics and practise applying your knowledge to case study scenarios.", "Need more exam practice? Keystone Academia offers additional mock exams with tutor feedback and structured tuition to help you prepare.");
      links.push({ label: "View your mock exam feedback", url: dashboard }, { label: "Explore our programmes", url: level === "MCS" ? "https://keystoneacademia.com/cima-mcs/" : "https://keystoneacademia.com/" });
      break;
    case "enrolled_invitation":
      if (!input.passwordLink) throw new Error("A secure password link is required.");
      subject = `Your Keystone Academia CIMA ${level} Mocks Are Ready`;
      paragraphs.push(`Welcome to the Keystone Academia CIMA ${level} Mock Exam Portal!`, `Your enrolled ${LEVEL_NAMES[level]} student account is ready. Use the secure, single-use link below to choose your own password. If you already have an account, this link lets you choose a new password.`, "This secure link expires. If it has expired, ask the Keystone team to send a fresh invitation.", "After setting your password, sign in with this email address. Read the mock instructions before starting and allow enough uninterrupted time for the exam.");
      links.push({ label: "Set your password", url: input.passwordLink }, { label: "Student portal sign in", url: `${input.portalOrigin}/student/login` });
      break;
    default: throw new Error("Unsupported email type.");
  }
  if (kind !== "enrolled_invitation") paragraphs.push("To view your trial progress and feedback, use the same browser and device you used when registering.");
  const closing = ["If you have any questions, reply to this email and our team will help.", "All the best with your preparation!", "Team Keystone Academia"];
  const text = [`Hi ${firstName},`, ...paragraphs, ...links.map(link => `${link.label}: ${link.url}`), ...closing, "https://keystoneacademia.com/"].join("\n\n");
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"></head><body style="margin:0;background:#eef2f6;font-family:Arial,sans-serif;color:#334155"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;table-layout:fixed;background:white;border-radius:12px;overflow:hidden"><tr><td style="background:#0b2545;color:#fbbf24;padding:24px;font-size:18px;font-weight:bold;border-top:4px solid #fbbf24">KEYSTONE ACADEMIA</td></tr><tr><td style="padding:24px;line-height:1.6;font-size:15px;overflow-wrap:anywhere;word-break:break-word"><p>Hi ${escape(firstName)},</p>${paragraphs.map(paragraph => `<p>${escape(paragraph)}</p>`).join("")}${links.map(link => `<p><a href="${escape(link.url)}" style="display:inline-block;background:#0b2545;color:white;text-decoration:none;border-radius:6px;padding:12px 18px;max-width:100%;box-sizing:border-box">${escape(link.label)}</a></p>`).join("")}${closing.map(paragraph => `<p>${escape(paragraph)}</p>`).join("")}<p><a href="https://keystoneacademia.com/" style="color:#0b2545">keystoneacademia.com</a></p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
