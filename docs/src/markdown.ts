/**
 * The resolved model as Markdown reference documentation.
 *
 * Two sources, because the model alone cannot tell the whole story: the
 * resolved model carries the structure (tables, columns, types, flags,
 * relations, indexes), while the prose lives in `Meta { note = "…" }`,
 * which `skema-hir` drops during resolution. `getNote` is the port that
 * bridges the gap - the same shape `DiagramHost` (`@skema/diagram`) is:
 * this package asks for a note by `file`+`name`, and each host maps its own
 * `Meta` shape onto that lookup however it already has one (a `skema/model`
 * LSP response's `metas` for `skema-vscode`, the browser store's own
 * per-kind maps for `skema-editor`). Neither host's shape crosses this
 * boundary - only the lookup does.
 *
 * The output is real Markdown rather than HTML directly: the same text can
 * be copied out, and an export feature has nothing new to build.
 */
import type {
  ExportedEnum,
  ExportedExampleRow,
  ExportedField,
  ExportedFlag,
  ExportedGroup,
  ExportedModel,
  ExportedTable,
} from "@skema/model";

/** A declaration's own note, by the file it is declared in and its name -
 *  the pair that identifies a declaration project-wide. `undefined` for
 *  "no note", not `""` - keeps a host's lookup a plain `Map.get`. */
export type NoteLookup = (file: string, name: string) => string | undefined;

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function qualified(namespace: string, name: string): string {
  return namespace ? `${namespace}.${name}` : name;
}

/** `varchar(120)`, or the relationship exactly as it is written. */
function typeOf(field: ExportedField): string {
  const relation = field.relation;
  if (relation) {
    const arrow = relation.kind === "ManyToOne" ? "<" : relation.kind === "OneToOne" ? "-" : ">";
    return `${arrow}${qualified(relation.targetNamespace, relation.targetTable)}.${relation.targetField}`;
  }
  return field.ty.args.length > 0
    ? `${field.ty.name}(${field.ty.args.join(", ")})`
    : field.ty.name;
}

/** Every flag as written: `pk`, `default=0`. Skips a flag set to `false`,
 *  which is how an explicitly negated one arrives. */
function flagLabels(flags: ExportedFlag[]): string {
  return flags
    .filter((flag) => flag.value !== false)
    .map((flag) => (flag.value === true ? flag.name : `${flag.name}=${flag.value}`))
    .join(", ");
}

function isBackReference(field: ExportedField): boolean {
  return field.relation?.kind === "ManyToOne";
}

/** A `Record`'s value for one field, linked to its relation's target table
 *  section when the field is a relationship. */
function exampleCell(field: ExportedField, row: ExportedExampleRow): string {
  const flag = row.values.find((value) => value.name === field.name);
  if (!flag) return "";

  const text = cell(typeof flag.value === "boolean" ? String(flag.value) : flag.value);
  const relation = field.relation;
  return relation ? `[${text}](#${qualified(relation.targetNamespace, relation.targetTable)})` : text;
}

/** One table per `Example` block, columns matching the Columns table above
 *  (back-references excluded the same way). */
function exampleSection(columns: ExportedField[], examples: ExportedExampleRow[]): string[] {
  const lines = [
    "**Examples**",
    "",
    `| ${columns.map((field) => cell(field.name)).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
  ];
  for (const row of examples) {
    lines.push(`| ${columns.map((field) => exampleCell(field, row)).join(" | ")} |`);
  }
  lines.push("");
  return lines;
}

function tableSection(table: ExportedTable, getNote: NoteLookup): string[] {
  const lines: string[] = [`### ${table.name}`, ""];

  const note = getNote(table.file, table.name);
  if (note) lines.push(note, "");

  const physical = [table.physical.database, table.physical.schema, table.physical.table]
    .filter(Boolean)
    .join(".");
  const facts = [`Defined in \`${table.file}\``];
  if (physical) facts.push(`physical name \`${physical}\``);
  lines.push(facts.join(" · "), "");

  // Back-references create no column (`docs/07`), so they are listed
  // separately rather than mixed into the column table - a reader looking
  // for what the database will have must not find them here.
  const columns = table.fields.filter((f) => !isBackReference(f));
  if (columns.length > 0) {
    lines.push("| Column | Type | Flags | Description |", "| --- | --- | --- | --- |");
    for (const field of columns) {
      lines.push(
        `| \`${cell(field.name)}\` | \`${cell(typeOf(field))}\` | ${cell(flagLabels(field.flags))} | ${cell(field.note ?? "")} |`,
      );
    }
    lines.push("");
  }

  if (columns.length > 0 && table.examples.length > 0) {
    lines.push(...exampleSection(columns, table.examples));
  }

  const backReferences = table.fields.filter(isBackReference);
  if (backReferences.length > 0) {
    lines.push(
      "**Referenced by** (back-references, no column on this table):",
      "",
      ...backReferences.map(
        (field) =>
          `- \`${field.name}\` - ${field.relation?.targetTable ?? "?"}.${field.relation?.targetField ?? "?"}`,
      ),
      "",
    );
  }

  if (table.indexes.length > 0) {
    lines.push("| Index | Columns | Flags |", "| --- | --- | --- |");
    for (const index of table.indexes) {
      lines.push(
        `| ${cell(index.name ?? "(unnamed)")} | ${cell(index.columns.join(", "))} | ${cell(flagLabels(index.flags))} |`,
      );
    }
    lines.push("");
  }

  return lines;
}

function enumSection(entry: ExportedEnum, getNote: NoteLookup): string[] {
  const lines: string[] = [`### ${entry.name}`, ""];
  const note = getNote(entry.file, entry.name);
  if (note) lines.push(note, "");

  lines.push(
    `Stored as \`${entry.storedType}\`, defined in \`${entry.file}\``,
    "",
    "| Value | Label | Stored as |",
    "| --- | --- | --- |",
    ...entry.entries.map(
      (item) =>
        `| \`${cell(item.name)}\` | ${cell(item.label ?? "")} | \`${cell(item.value ?? item.name)}\` |`,
    ),
    "",
  );
  return lines;
}

function groupSection(group: ExportedGroup, getNote: NoteLookup): string[] {
  const lines: string[] = [`### ${group.name}`, ""];
  const note = getNote(group.file, group.name);
  if (note) lines.push(note, "");
  lines.push(
    ...group.members.map(
      (member) => `- ${member.kind} \`${qualified(member.namespace, member.name)}\``,
    ),
    "",
  );
  return lines;
}

/** Tables grouped by the `Document` namespace they belong to, since that
 *  is how a model is organized in the first place (`docs/02`). */
function byNamespace<T extends { namespace: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = item.namespace || "(no document)";
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

export function modelToMarkdown(model: ExportedModel, getNote: NoteLookup): string {
  const lines: string[] = ["# Model documentation", ""];

  const counts = [
    `${model.tables.length} tables`,
    `${model.enums.length} enums`,
    `${model.groups.length} groups`,
  ];
  lines.push(counts.join(" · "), "");

  if (model.tables.length === 0 && model.enums.length === 0) {
    lines.push("_Nothing to document yet - declare a `Table` to get started._");
    return lines.join("\n");
  }

  for (const [namespace, tables] of byNamespace(model.tables)) {
    lines.push(`## ${namespace}`, "");
    for (const table of tables) lines.push(...tableSection(table, getNote));
  }

  if (model.enums.length > 0) {
    lines.push("## Enums", "");
    for (const entry of model.enums) lines.push(...enumSection(entry, getNote));
  }

  if (model.groups.length > 0) {
    lines.push("## Groups", "");
    for (const group of model.groups) lines.push(...groupSection(group, getNote));
  }

  return lines.join("\n");
}
