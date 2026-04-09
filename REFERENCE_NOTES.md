# REFERENCE_NOTES.md

> Extracted from `/reference/` on 2026-04-09. This is the source of truth for the irrigation audit app's domain model. Every enum, taxonomy, and report section below comes from files in that folder — nothing was invented.
>
> **If the data model ever needs to change, update the reference files first, then update this doc, then update the Prisma schema.**

---

## 1. Property / System / Zone hierarchy

The ground-truth hierarchy from `property_class.py`, `irr_system_class.py`, `zone_irr_class.py`, and `gpt_scratch3.py`:

```
Property
├── property_id
├── name, address, contact (PM), client
├── attributes (flexible metadata)
└── IrrigationSystem[] (a property can have MORE THAN ONE system)
    ├── sys_id
    ├── controller (brand + model + location)
    ├── wiring_type          # conventional | two-wire
    ├── water_source_type    # e.g. '1" metered potable', '1.5" metered potable', '2" metered potable', reclaimed
    ├── num_zones
    └── Zone[]
        ├── zone_id (int)
        ├── zone_name (optional string label)
        ├── zone_type        # spray | drip | bubbler | rotor | other
        ├── zone_size        # 0.75in | 1in | 1.5in | 2in | other
        ├── attributes
        └── audit[] findings
            ├── issue
            ├── component / element
            ├── solution
            └── cost / qty
```

**Critical:** a property has 1..N irrigation systems, and each system has 1..N zones. The audit-app DB schema in the build prompt has only `audit_zones` directly under `audits` — we need to add an `audit_systems` layer (or at minimum a `system_id` column on `audit_zones`) to stay faithful to the reference.

---

## 2. Zone types and sizes (canonical enums)

From `main6.py` / `gpt_scratch3.py`:

```python
zone_type = ["spray", "drip", "bubbler", "rotor", "other"]
zone_size = ["0.75in", "1in", "1.5in", "2in", "other"]
```

Landscape key in the Austin Oaks PDF uses single-letter codes:
- `D` = Drip
- `R` = Rotor
- `S` = Spray

---

## 3. Issue / deficiency categories (canonical)

From `main6.py` (use this as canonical — newer than the matrix):

```python
issue_types_l = [
    "maladjusted",
    "missing",
    "damaged/broken",
    "incorrect placement",
    "leak",
    "clog",
    "electrical issue",
]
```

The older `issue_element_sol_matrix.xlsx` uses a slightly different set (`missing`, `damaged`, `placement`, `leak`, `clog`, `wiring`, `electrical`). Mapping: `placement`→`incorrect placement`, `wiring`+`electrical`→`electrical issue`. **Use main6.py set; keep the matrix labels as aliases for backward compatibility when importing old data.**

Severity is **NOT explicitly graded** anywhere in the reference material. The Austin Oaks PDF uses color in cells (red/yellow/green) but without a key mapping color→severity. I'm proposing a derived severity system (High / Medium / Low) in the schema, but we should confirm with Tyler before baking it into reports. Candidate mapping derived from the issue type:

| Issue | Suggested default severity |
|---|---|
| leak | High |
| missing | High |
| damaged/broken | High |
| clog | High |
| electrical issue | High |
| incorrect placement | Medium |
| maladjusted | Medium |

(Severity should be overridable per-finding by the auditor.)

---

## 4. Components / elements (canonical)

From `main6.py`:

```python
gen_components_l = [
    "nozzle / drip tubing / emitters",
    "body",
    "valve/valve box",
    "accessory",
    "piping",
    "electrical",
    "other",
]
```

More granular element list from the `issue_element_sol_matrix` and Austin Oaks PDF (use these as **subtypes** of the categories above):

- **Heads / emitters**
  - Spray head (sizes: 4", 6", 12"; spray-body)
  - Rotor head / rotor body (e.g., RB 5004)
  - Bubbler head
  - Nozzle (including MP — multi-pattern)
  - Emitter (drip)
- **Piping**
  - Main piping / mainline
  - Lateral piping / lateral line
  - Drip tubing
- **Valves & boxes**
  - Valve (subtypes: standard, premium)
  - Valve box (sizes: sm, med, lg)
  - Solenoid
- **Control & power**
  - Controller (subtypes: standard, premium; brands: Rainbird, Rainbird ESPME, Hunter, Toro, Weathermatic)
  - Field wire
  - Electrical wiring
  - Remote wired control
- **Water source**
  - Meter
  - Backflow device
  - Rain / freeze sensor

---

## 5. Solution / repair classifications

From `main6.py`:

```python
solution_type_l = [
    "adjust (Time only)",
    "adjust (T+M)",
    "replace (T+M)",
    "repair (T+M)",
    "relocate (Time only)",
    "troubleshoot / discovery (time only)",
    "other (Time only)",
    "other (T+M)",
]
```

Normalized into two orthogonal fields:

- **solution_action**: `adjust | replace | repair | relocate | troubleshoot | other`
- **cost_model**: `time_only | time_materials` (aka T+M)

**Units of measure** from the XLSX report templates:
- `ea` — discrete items (heads, nozzles, emitters, valves, valve boxes)
- `sf` — linear / area components (drip tubing, field wire — the old reports use "square feet" even for linear items; preserve that quirk)
- `(blank)` — system-level findings with no countable unit (e.g., general electrical troubleshooting)

---

## 6. Issue × Element × Solution matrix (from `issue_element_sol_matrix.xlsx`)

| # | Issue | Element | Sub-element | Solution | Cost model |
|---|---|---|---|---|---|
| 1 | missing | nozzle | — | adjust | time, time_materials |
| 2 | damaged | spray head | sm, med, lg | replace | time_materials |
| 3 | placement | drip tubing | — | repair | time_materials |
| 4 | leak | bubbler | — | relocate | time_materials |
| 5 | clog | emitter | — | troubleshoot | time |
| 6 | wiring | valve | standard, premium | other | time, time_materials |
| 7 | electrical | valve box | sm, med, lg | — | — |
| — | — | lateral piping | — | — | — |
| — | — | main piping | — | — | — |
| — | — | electrical | — | — | — |
| — | — | controller | standard, premium | — | — |
| — | — | other | — | — | — |

Rows 8–13 have no issue→solution mapping in the matrix (they're component definitions awaiting mapping). In the UI these should still be selectable — the auditor picks issue + element + solution independently, and the matrix only constrains the *suggested* solution, not the allowed one.

---

## 7. Canonical deficiency checklist (Austin Oaks PDF)

This is the row list from the Austin Oaks paper-audit form. **Use this as the pre-seeded "quick-pick" list in the mobile audit UI**, organized into sections:

### Turf / shrub heads
- Missing head 4" / 6" / 12"
- Broken head 4" / 6" / 12"
- Leaking seal @ head 4" / 6" / 12"
- Head blocked by plants
- Sunken head
- Tilted head
- Incorrect nozzle MP
- Clogged nozzle MP
- Broken nozzle MP
- Broken nozzle / emitter

### Drip / misc
- Cut drip
- Clogged nozzle / emitter

### Valve / valve box
- Valve box lid missing
- Valve box crushed

### Mainline / lateral / electrical
- Major mainline break
- Mainline break
- Lateral line break
- Major lateral break
- Leaking / stuck valve (in-zone)
- Valve not activating (in-zone)
- Solenoid (short)
- Cut field wire

### Additions (new work, not deficiencies)
- Add 4" head
- Add 6" head
- Add 12" head

### Free-form
- Notes / additional work

Each checklist item maps cleanly onto `(issue, element, element_size)` from sections 3–4. The mapping should live in a seeded `quick_pick_findings` table so admins can customize per org.

---

## 8. Audit report structure

Two sources: the Austin Oaks PDF (paper inspection form) and `audit_report.xlsx` (digital output).

### 8a. Austin Oaks PDF structure
Single-property inspection form with a grid layout:

**Header block:**
- Company: Strata Landscape / BrightView
- Title: "Irrigation Inspection Report"
- Job name, Job #, Tech, Date, Time
- Controller (location, brand/model, # stations)
- Meter location / number / reading
- Status of backflow (color-coded)
- Rain / freeze sensor (Y/N)
- Remote wired (type or "none installed")
- Status of controller
- Power to unit (Y/N)

**Deficiency grid:**
- Rows = the checklist items from section 7
- Columns = stations / zones (the Austin Oaks form has columns 1..64)
- Cells contain counts or tallies
- Right-most columns: total qty and total cost per row

**Landscape key** on the form: `D` = drip, `R` = rotor, `S` = spray.

### 8b. Digital report columns (`audit_report.xlsx`)

```
Property ID | System ID# | Zone ID# | Zone Size + Type | Issue Found | Component | Proposed Solution | Qty | UOM | Unit Price | Ext Price
```

`Unit Price` and `Ext Price` are **blank** when the auditor submits — the estimator fills them in after the fact. `Ext Price = Qty × Unit Price`.

### 8c. Client-facing PDF report (to be generated by the app)

Match the Austin Oaks look and the build-prompt spec:

1. **Cover page** — property name, address, audit date, auditor, company logo
2. **Executive summary** — overall score (if scoring is enabled), total findings, total repair estimate
3. **System/zone sections** — one block per system, then zone-by-zone finding tables with columns: component / deficiency / severity / qty / recommended repair / unit price / ext price
4. **Photo evidence pages** — one finding per "card" with photo + caption
5. **Itemized pricing summary** — subtotals by system, by zone, by category, grand total
6. **Footer on every page** — company name, confidentiality notice, page numbers

---

## 9. Property CSV column reference

### `strata_properties.csv` / `Maintenance_Clients_*.xlsx` (treat as the superset source)
Columns: `Name, Clients, Client Status, Billing Status, Contract, PDF, Terms, Program, Crew, Contact, Phone, Email, Location, Num Zones`

- **Client Status** values observed: `Bid Sent, Good Standing, Review Needed, Paused, Canceled, Enhancement, Rebid Property`
- **Billing Status** values: `New Project, Billed, Stop Service`
- **Program tier** values: `Basic, Select, Premium, Custom, (null)`
- **Terms** values: `Due on Receipt, Net 30`
- **Crew** values: named (Ruben, Saul, Ricardo) or `TBD`

### `property_data.csv`
`property_id, prop_name, client, address, num_zones`

### `strata_data.csv` (denormalized — one row per property with nested JSON)
`property_id, name, client, address, contact, attributes, irrigation_systems, zones`

### `system_data.csv`
`property_id, num_zones, sys_id, controller, wire_type`

### `zone_data.csv`
`property_id, sys_id, num_zones, zone_id, zone_type, zone_size`

### `prop_w_zone_data.csv` / `properties_with_zones.csv`
Same columns as `strata_properties.csv` plus aggregate zone count per property.

---

## 10. Existing Python class definitions (verbatim ground truth)

### `property_class.py`
```python
class Property:
    def __init__(self, name="", address="", contact=""):
        self.name = name
        self.address = address
        self.contact = contact
        self.systems = {}
```

### `zone_irr_class.py`
```python
class Zone:
    def __init__(self, id, type, size, audit):
        self.id = int(id)
        self.type = type
        self.size = size
        self.audit = []
```

### `irr_system_class.py`
```python
class Irrigation_system:
    def __init__(self, id, controller, wiring_type, water_source_type, num_zones):
        self.id = int(id)
        self.controller = controller
        self.wiring_type = wiring_type
        self.water_source_type = water_source_type
        self.num_zones = int(num_zones)
        self.zones = {}
        self.audit = {}  # {Zone #: [audit_report], Zone #: [audit_report], ...}
```

### `gpt_scratch3.py` (enhanced — most complete class shapes)
```python
class Zone:
    def __init__(self, sys_id, zone_id, zone_name, type, size, attributes, audit):
        self.sys_id = sys_id
        self.zone_id = zone_id
        self.zone_name = zone_name
        self.type = type
        self.size = size
        self.attributes = attributes
        self.audit = audit
        self.issues = {}
    def record_issue(self, issue, description, quantity):
        ...

class IrrigationSystem:
    def __init__(self, sys_id, controller, wire_type, water_source, attributes, audit):
        self.sys_id = sys_id
        self.controller = controller
        self.wire_type = wire_type
        self.water_source = water_source
        self.attributes = attributes
        self.audit = audit
        self.zones = []

class Property:
    def __init__(self, property_id, prop_name, address, contact, attributes, audit):
        self.property_id = property_id
        self.prop_name = prop_name
        self.address = address
        self.contact = contact
        self.attributes = attributes
        self.audit = audit
        self.irrigation_systems = []
```

### `scratch.py`
```python
class AuditItem:
    def __init__(self, issue, component, solution):
        self.issue = issue
        self.component = component
        self.solution = solution
```

---

## 11. Discrepancies and open questions

1. **Scoring methodology** — No formal rubric exists in the reference. The build prompt asks for an executive-summary score; need to confirm with Tyler whether to (a) skip scoring in v1, (b) derive it from finding counts weighted by severity, or (c) match a scheme he'll provide.

2. **Severity levels** — Not explicitly present. See section 3 for the proposed default mapping — needs confirmation.

3. **Issue taxonomy drift** — `issue_element_sol_matrix.xlsx` and `main6.py` disagree on labels. Decision: main6.py wins as canonical; matrix labels become aliases.

4. **Zone count sanity** — Some property rows show 206 / 255 / 219 zones. That's an aggregate across multiple irrigation systems on the same property, not a single controller. The UI needs to show per-system zone counts, not just a property-level total, or users will be confused.

5. **Matrix completeness** — Issue×Element matrix only covers 7 rows; elements like piping, controller, lateral piping, electrical have no solution mapping. Treat the matrix as a *suggestion layer*, not a constraint.

6. **System-level findings** — The reference has findings attached to zones, but the Austin Oaks form also has system-level rows (mainline break, meter status, controller status). Schema needs a way to attach a finding to a system without requiring a zone — probably `audit_findings.zone_id` should be nullable with a `system_id` fallback.

7. **UOM quirk** — Drip tubing and field wire are measured in "sf" in the old XLSX reports even though they're linear. Preserve as-is to match report expectations; don't "correct" to `lf`.

8. **Duplicate Python files** — `reference/` has multiple `main*.py` and `scratch*.py` files. They're iterative drafts. `main6.py` and `gpt_scratch3.py` are the latest versions for enums and class shapes respectively. Earlier versions should be ignored.

---

## 12. Implications for the build-prompt DB schema

The build prompt's proposed schema needs these adjustments to match the reference:

1. **Add `audit_systems` table** between `audits` and `audit_zones`, carrying `controller`, `wiring_type`, `water_source_type`, `num_zones`, and system-level status flags (backflow, rain sensor, power to unit, meter location/number/reading).
2. **`audit_findings.zone_id` should be nullable**, with a `system_id` fallback, to model system-level findings like "mainline break".
3. **Seed `component_types`, `deficiency_categories`, and `repair_classifications`** from sections 3–5 of this doc.
4. **Add a `quick_pick_findings` seed table** from section 7 so the mobile UI can offer tappable Austin-Oaks-style shortcuts.
5. **Store `severity` as an enum `high | medium | low`** with defaults per issue (section 3), overridable per finding.
6. **Use `unit_of_measure` enum `ea | sf | none`** to match the XLSX quirk.
7. **`finding.component_type` and `component_subtype`** map to the category/element distinction in section 4.
