// Client-safe Monday types + the PROPERTY_FIELDS metadata. Lives in its own
// file so client components (the onboarding step, the settings card) can
// import these without dragging the server-only pieces of `monday.ts`
// (Prisma, encryption) into the browser bundle.

export type PropertyField =
  | "address"
  | "pmName"
  | "pmEmail"
  | "pmPhone"
  | "city"
  | "state"
  | "zip";

export type ColumnMapping = Partial<Record<PropertyField, string>>;

export const PROPERTY_FIELDS: { id: PropertyField; label: string; required: boolean }[] = [
  { id: "address", label: "Address", required: false },
  { id: "pmName", label: "Property Manager Name", required: false },
  { id: "pmEmail", label: "Property Manager Email", required: false },
  { id: "pmPhone", label: "Property Manager Phone", required: false },
  { id: "city", label: "City", required: false },
  { id: "state", label: "State", required: false },
  { id: "zip", label: "Zip", required: false },
];

export type MondayColumn = {
  id: string;
  title: string;
  type: string;
};

export type MondayItem = {
  id: string;
  name: string;
  columnValues: Record<string, string | null>;
};
