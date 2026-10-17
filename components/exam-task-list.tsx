import { formatWeightage, getSubtasks, subtaskLabel, type ExamSubtask, type WeightageUnit } from "@/lib/exam-subtasks";

type TaskQuestion = { subtasks?: ExamSubtask[]; weightageUnit?: WeightageUnit; partA?: string; partB?: string; weightA?: string; weightB?: string };
export function ExamTaskList({ question }: { question: TaskQuestion }) {
  return <ol className="space-y-2">{getSubtasks(question).map((task, index) => {
    const label = subtaskLabel(index);
    const description = task.description.replace(/^\s*[a-z]+\)\s*/, "").replace(/\s*\(sub task\s*-\s*[\d.]+%\)\s*$/, "");
    return <li key={index} className="whitespace-pre-wrap"><strong>({label}) </strong>{description}<span className="ml-2 font-semibold text-[#133E68]">[sub task ({label}) = {formatWeightage(task.weightage, question.weightageUnit)}]</span></li>;
  })}</ol>;
}
