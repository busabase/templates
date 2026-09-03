import { CMS_BASES } from "../app/js/schema.js";

/**
 * Would `createBusabaseCms({ folderId })` accept this Folder?
 *
 * The same comparison the SDK runs before it will read a Folder, run early and
 * reported as advice instead of as a thrown error on the website's first render.
 * Codes rather than sentences: the browser owns the wording, in both languages.
 */

type LiveField = { slug: string; type: string; required?: boolean };
type LiveBase = { key: string; slug: string; name: string; fields: LiveField[] | null };

export type SchemaProblem = {
  code: "base-missing" | "field-missing" | "field-type" | "field-required";
  tone: "danger" | "warn";
  base: string;
  field?: string;
  expected?: string;
  actual?: string;
};

export function diffSchema(live: LiveBase[]) {
  return CMS_BASES.map((expected) => {
    const actual = live.find((candidate) => candidate.key === expected.role);
    const problems: SchemaProblem[] = [];

    if (!actual || actual.fields === null) {
      problems.push({ code: "base-missing", tone: "danger", base: expected.role });
    } else {
      const bySlug = new Map(actual.fields.map((field) => [field.slug, field]));
      for (const field of expected.fields) {
        const found = bySlug.get(field.slug);
        if (!found) {
          // A missing optional field is repairable on first read with
          // `lazyCreate`; a missing required one stops setup before that.
          problems.push({
            code: "field-missing",
            tone: field.required ? "danger" : "warn",
            base: expected.role,
            field: field.slug,
          });
          continue;
        }
        if (found.type !== field.type) {
          problems.push({
            code: "field-type",
            tone: "danger",
            base: expected.role,
            field: field.slug,
            expected: field.type,
            actual: found.type,
          });
        } else if (field.required && !found.required) {
          problems.push({
            code: "field-required",
            tone: "danger",
            base: expected.role,
            field: field.slug,
          });
        }
      }
    }

    return {
      key: expected.role,
      name: expected.name,
      slug: actual?.slug ?? "",
      fieldCount: expected.fields.length,
      tone: problems.some((problem) => problem.tone === "danger")
        ? "danger"
        : problems.length
          ? "warn"
          : "ok",
      problems,
    };
  });
}

export const schemaIsClean = (health: ReturnType<typeof diffSchema>) =>
  health.every((base) => base.tone === "ok");
