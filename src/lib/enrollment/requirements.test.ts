/*
 * Author: Gian Mandac
 * Created Date: 20261116
 */
import { describe, expect, it } from "vitest";
import { gradeNumber, isCatholic, requirementsFor, splitChecklist, summarizeChecklist } from "./requirements";

const keys = (profile: Parameters<typeof requirementsFor>[0]) => requirementsFor(profile).map((item) => item.key);

describe("dynamic requirement checklist", () => {
  it("reads grade numbers and treats preschool levels as ungraded", () => {
    expect(gradeNumber("Grade 7")).toBe(7);
    expect(gradeNumber("Grade 12")).toBe(12);
    expect(gradeNumber("Kindergarten")).toBeNull();
  });

  it("asks returning students only for the report card", () => {
    expect(keys({ department: "jhs", applicant_type: "old", grade_level: "Grade 9" })).toEqual(["report-card"]);
  });

  it("adds the entrance exam for kindergarten but not nursery", () => {
    expect(keys({ department: "preschool", applicant_type: "new", grade_level: "Kindergarten" })).toContain("entrance-exam");
    expect(keys({ department: "preschool", applicant_type: "new", grade_level: "Nursery" })).not.toContain("entrance-exam");
  });

  it("follows the Grade 7 and senior high admission rules", () => {
    expect(keys({ department: "jhs", applicant_type: "new", grade_level: "Grade 7" }))
      .toEqual(expect.arrayContaining(["entrance-exam", "psa-birth-certificate", "good-moral", "recommendation-form"]));
    expect(keys({ department: "shs", applicant_type: "new", grade_level: "Grade 11" }))
      .toEqual(expect.arrayContaining(["good-moral", "recommendation-form", "esc-certificate", "ncae-result"]));
    expect(keys({ department: "grade_school", applicant_type: "new", grade_level: "Grade 1" })).not.toContain("good-moral");
  });

  it("treats returnees and new students outside entry grades as transferees", () => {
    expect(keys({ department: "grade_school", applicant_type: "returnee", grade_level: "Grade 3" })).not.toContain("good-moral");
    expect(keys({ department: "grade_school", applicant_type: "new", grade_level: "Grade 5" })).toContain("good-moral");
    expect(keys({ department: "jhs", applicant_type: "returnee", grade_level: "Grade 9" })).toContain("esc-certificate");
  });

  it("counts only required items toward completion", () => {
    const requirements = requirementsFor({ department: "jhs", applicant_type: "old", grade_level: "Grade 8" });
    expect(summarizeChecklist(requirements, {})).toEqual({ received: 0, required: 1, complete: false });
    expect(summarizeChecklist(requirements, { "report-card": true })).toEqual({ received: 1, required: 1, complete: true });
    const grade7 = requirementsFor({ department: "jhs", applicant_type: "new", grade_level: "Grade 7" });
    const split = splitChecklist(grade7, { "psa-birth-certificate": true });
    expect(split.received.map((item) => item.key)).toEqual(["psa-birth-certificate"]);
    expect(split.missing.map((item) => item.key)).not.toContain("marriage-certificate");
  });
});

describe("checklist follows the enrollment form answers", () => {
  const label = (profile: Parameters<typeof requirementsFor>[0], key: string) => requirementsFor(profile).find((item) => item.key === key);
  const grade7 = { department: "jhs", applicant_type: "new", grade_level: "Grade 7" };

  it("asks Catholic applicants for a baptismal certificate and others for a certificate of dedication", () => {
    expect(label({ ...grade7, religion: "Roman Catholic" }, "baptismal-certificate")?.label).toBe("Baptismal certificate");
    expect(label({ ...grade7, religion: "Iglesia ni Cristo" }, "baptismal-certificate")?.label).toBe("Certificate of dedication (non-Catholic applicants)");
    expect(label({ ...grade7, religion: "Non-Catholic" }, "baptismal-certificate")?.label).toContain("dedication");
    expect(label(grade7, "baptismal-certificate")?.label).toContain("Baptismal certificate, or certificate of dedication");
    expect([isCatholic("catholic"), isCatholic("Born Again Christian"), isCatholic(" ")]).toEqual([true, false, null]);
  });

  it("requires a preschooler's report card only when a former school was given", () => {
    const nursery = { department: "preschool", applicant_type: "new", grade_level: "Nursery" };
    expect(label(nursery, "report-card")).toMatchObject({ optional: true });
    expect(label({ ...nursery, last_school_name: "  " }, "report-card")).toMatchObject({ optional: true });
    const attended = label({ ...nursery, last_school_name: "Little Stars Learning Center" }, "report-card");
    expect(attended?.optional).toBeFalsy();
    expect(attended?.label).toContain("former school");
  });

  it("keeps the same requirement keys so saved checklist ticks still apply", () => {
    const before = requirementsFor(grade7).map((item) => item.key);
    expect(requirementsFor({ ...grade7, religion: "Baptist", last_school_name: "X" }).map((item) => item.key)).toEqual(before);
  });
});

