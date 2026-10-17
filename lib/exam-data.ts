import type { ExamSubtask, WeightageUnit } from "./exam-subtasks";
export type Question = {
  section: number;
  timeMinutes: number;
  from: string;
  to: string;
  subject: string;
  intro: string;
  taskPrompt: string;
  subtasks?: ExamSubtask[];
  weightageUnit?: WeightageUnit;
  partA?: string;
  weightA?: string;
  partB?: string;
  weightB?: string;
  referenceDocTitle: string;
  referenceDocColor: string;
  referenceParagraphs: string[];
};


export const LEGACY_EXAM_ID = "00000000-0000-4000-8000-000000000001";

export const questionsData: Question[] = [
  {
    section: 1,
    timeMinutes: 60,
    from: "Agata Paluch, CFO",
    to: "Senior Finance Manager",
    subject: "Smart-Print Programme & Funding Approach",
    intro:
      "I've attached an extract from the latest capital plan outlining the proposed investment in our AI-driven Smart-Print ecosystem and the financing route being considered. As this represents a major shift in how we operate and how we position ourselves with investors, the Board wants clarity on the strategic implications and the funding signals involved.",
    taskPrompt: "Please prepare briefing papers for the following:",
    partA:
      "Consider how integrating AI into our printers may influence our long-term strategic direction and ecosystem positioning. (sub task - 60%)",
    weightA: "60%",
    partB:
      "Reflect on how we should incorporate sustainability perspective while evaluating the funding strategy. (sub task - 40%)",
    weightB: "40%",
    referenceDocTitle: "Green Initiative Capital Plan – Smart Print Ecosystem",
    referenceDocColor: "text-[#2e7d32]",
    referenceParagraphs: [
      "Kwirtmak has announced a major sustainability initiative aimed at reducing energy consumption and material waste across its global operations. Central to the plan is a proprietary AI platform designed to autonomously operate the entire fleet of printers, optimising performance, reducing downtime and minimising resource usage. The shift marks a significant evolution from selling standalone hardware to offering an integrated digital ecosystem built around software intelligence.",
      "To support this transition, the Board is proposing a substantial capital investment in the Smart-Print programme. The initiative is expected to reshape the company’s long-term business model, with a greater emphasis on recurring software revenues, data-driven services and ecosystem lock-in. Early internal projections suggest that the move could strengthen customer retention and create new revenue streams tied to predictive maintenance, automated workflows and sustainability reporting.",
      "The Board intends to finance the programme through the issuance of Corporate Green Bonds. The proposal has attracted attention from analysts, who note that the decision may signal a strong commitment to environmental performance and long-term sustainability goals. Some observers have questioned whether drawing on retained earnings might have been a simpler route, but others suggest that the use of Green Bonds could enhance credibility with investors focused on environmental impact and responsible financing.",
    ],
  },
  {
    section: 2,
    timeMinutes: 60,
    from: "Agata Paluch, CFO",
    to: "Senior Finance Manager",
    subject: "Activist Position & Shareholder Response",
    intro:
      "I've attached a recent open letter published by an activist fund outlining their concerns about our capital allocation and their intentions regarding Board leadership. With the situation gaining public attention, Investor Relations needs clarity on how these issues may influence perceptions of our performance and governance.",
    taskPrompt: "Please prepare briefing papers for the following:",
    partA:
      "Assess how the activist fund may use financial ratios to support their position and influence wider shareholder sentiment. (sub task - 60%)",
    weightA: "60%",
    partB:
      "Evaluate on the risks to the organisation if the Board chooses not to engage with the activist group. (sub task - 40%)",
    weightB: "40%",
    referenceDocTitle: "Ennland Telegraph – Markets & Governance Report",
    referenceDocColor: "text-[#c62828]",
    referenceParagraphs: [
      "Kwirtmak has come under renewed scrutiny after an activist hedge fund disclosed a 12% stake and issued a public letter criticising the company’s capital allocation approach. The fund argues that the legacy hardware division is suppressing group valuation and claims that shareholders have not been adequately rewarded despite recent strategic pivots. Their statement has sparked debate among analysts, many of whom are now revisiting the company’s recent financial performance.",
      "The activist group has demanded a substantial special dividend, stating that the company’s balance sheet can support a significant payout without compromising operational stability. They have also questioned whether the Board has been sufficiently decisive in reshaping the portfolio, suggesting that the current structure may be limiting returns. Market commentators note that the fund’s messaging appears designed to appeal to investors seeking short-term value realisation.",
      "In a more confrontational move, the activist fund has threatened to initiate a proxy campaign to replace Non-Executive Chair Madda Fedele if the Board does not respond to their demands. Governance specialists warn that such disputes can create uncertainty among institutional investors and may influence perceptions of leadership stability. Observers suggest that the Board’s handling of the situation will be closely watched in the coming weeks.",
    ],
  },
  {
    section: 3,
    timeMinutes: 60,
    from: "Agata Paluch, CFO",
    to: "Senior Finance Manager",
    subject: "Demerger Proposal & Organisational Impact",
    intro:
      "I've attached an internal analysis summarising the activist fund's latest proposal and the organisational tensions emerging as we accelerate the AI transition. With pressure building both externally and internally, the CEO wants clarity on the financial implications of the proposed demerger and the leadership approach required to stabilise the organisation.",
    taskPrompt: "Please prepare briefing papers for the following:",
    partA:
      "Consider how separating the Printing Materials division into a standalone listed entity may influence our financial position and long-term strategic coherence. (sub task - 40%)",
    weightA: "40%",
    partB:
      "Reflect on how leadership should respond to the cultural disruption arising from the shift toward an AI-driven operating model. (sub task - 60%)",
    weightB: "60%",
    referenceDocTitle: "Organisational Change & Demerger Analysis",
    referenceDocColor: "text-[#d32f2f]",
    referenceParagraphs: [
      "The activist hedge fund has intensified its campaign by calling for a full corporate spin-off of Kwirtmak’s highly profitable Printing Materials division. Their argument centres on the belief that the division’s performance is being undervalued within the wider group structure, and that a separate listing would unlock immediate shareholder value. Analysts note that the proposal comes at a time when the company is already navigating significant strategic change.",
      "Internally, the shift toward becoming an AI-driven, sustainability-focused technology company has created visible friction. Traditional mechanical engineering teams, long accustomed to hardware-centric operations, have expressed concerns about their future role and relevance. Several managers have reported rising resistance to new workflows, with some teams struggling to adapt to the software-first direction being championed by senior leadership.",
      "The combination of external pressure for structural change and internal uncertainty has raised questions about organisational cohesion. Observers warn that a demerger could weaken the integrated ecosystem that has historically linked hardware, materials and service offerings. At the same time, the cultural disruption triggered by the AI transition may require more active leadership involvement to maintain confidence and ensure alignment across the workforce.",
    ],
  },
];
