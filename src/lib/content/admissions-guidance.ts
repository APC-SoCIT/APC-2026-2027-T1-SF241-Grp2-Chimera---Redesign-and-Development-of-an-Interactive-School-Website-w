// Only publish school-approved dates here. A reference school year is not an open-intake claim.
export const admissionsDates = {
  schoolYearReference: "2026–2027",
  opens: null as string | null,
  closes: null as string | null,
  classesBegin: null as string | null,
};

export const admissionsSteps = [
  { title: "Choose your group and prepare", body: "Use the checklist for your child's entry level. Gather the documents and photocopies, and note any examination or scholarship requirements." },
  { title: "Submit documents for review", body: "Bring the required documents to the Admission Office. Keep a copy of your submitted requirements and ask which next steps apply to your applicant group." },
  { title: "Complete the required assessment", body: "Where an entrance examination is listed, arrange it with the school. Any additional interview or assessment arrangements must be confirmed for your child." },
  { title: "Review fees and complete enrollment", body: "Request the current fee sheet. After the school confirms admission, follow its payment and enrollment instructions and obtain confirmation of completion." },
];

export const admissionsFaqs = [
  { question: "Is an entrance examination required?", answer: "The published checklists list entrance examinations for kindergarten, incoming Grade 1, incoming Grade 7, senior high school, and transferee/returnee applicants. The preschool checklist specifies kindergarten only; the continuing-student checklist lists the report card. Examination dates and any interview arrangements are confirmed separately." },
  { question: "Which checklist covers Grades 2–6 and 8–10?", answer: "Use Transferees & returnees when entering these grades from another school or returning after studying elsewhere. Students already continuing at SNCS use Continuing SNCS students. The transferee checklist also covers other transfer entry levels, with grade-specific conditions stated beside each document." },
  { question: "Do you accept transferees during the school year?", answer: "The school publishes transferee requirements, but a mid-year intake policy and current grade-level openings are not stated in the available guidance. Use the inquiry form below to request availability for your intended start date before making arrangements." },
  { question: "Are siblings given priority?", answer: "A sibling-priority admissions policy is not confirmed in the published guidance. Mention that a sibling is already studying at SNCS in your inquiry and ask whether priority or any family arrangements apply." },
  { question: "How can I obtain current tuition and payment information?", answer: "Choose Current fee sheet in the inquiry form below and include your child's exact grade and the school year. The request is addressed to the Finance Office. Ask for tuition, other charges, included materials, payment dates, and any applicable discounts." },
  { question: "Can I arrange a campus visit?", answer: "Choose Campus visit in the inquiry form and add a preferred date. The school will need to confirm availability and arrangements; preparing the email does not book an appointment." },
];
