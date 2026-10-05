import { supabase } from "@/integrations/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProjectKind = "client" | "internal";
export type ProjectStatus = "active" | "paused" | "finished";

export type Project = {
  id: string;
  name: string;
  description: string | null;
  kind: ProjectKind;
  client_company: string | null;
  client_contact_name: string | null;
  client_contact_email: string | null;
  status: ProjectStatus;
  created_at: string;
};

export type CostSub = {
  id: string;
  name: string;
  vendor: string | null;
  service_url: string | null;
  amount: number;
  currency: string;
  billing_cycle: string;
  billing_interval_days: number | null;
  status: string;
  license_count: number | null;
  payment_method: "petty_cash" | "corporate_card";
};

export type Allocation = {
  id: string;
  project_id: string;
  subscription_id: string;
  allocation_pct: number;
};

export type CostLicense = {
  id: string;
  subscription_id: string;
  project_id: string | null;
  status: string;
  assigned_name: string | null;
  assigned_email: string | null;
  assignee_type: string;
};

export type PaymentRow = {
  subscription_id: string;
  amount: number;
  payment_date: string;
};

export type FxRate = { month: string; cop_per_usd: number };

export type CostData = {
  projects: Project[];
  subs: CostSub[];
  allocations: Allocation[];
  licenses: CostLicense[];
  payments: PaymentRow[];
  rates: FxRate[];
};

export type CostLine = {
  subscriptionId: string;
  name: string;
  vendor: string | null;
  serviceUrl: string | null;
  currency: string;
  /** This project's share of the subscription per month, in the subscription's own currency. */
  native: number;
  /** Same amount in USD, or null when it is in COP and no exchange rate is set. */
  usd: number | null;
  /** Share of the whole subscription (0–1). */
  fraction: number;
  /** How many licenses of this subscription are assigned directly to the project. */
  licenses: number;
  /** Allocation percentage chosen for the project, if any. */
  allocationPct: number | null;
};

export type ProjectCost = {
  usd: number;
  lines: CostLine[];
};

export type CostModel = {
  data: CostData;
  monthKey: string;
  rate: number | null;
  byProject: Map<string, ProjectCost>;
  unassigned: ProjectCost;
  totalUsd: number;
  assignedUsd: number;
  /** True when some active cost is in COP but there is no exchange rate to convert it. */
  missingRate: boolean;
  fractions: Map<string, SubFractions>;
};

export type SubFractions = {
  byProject: Map<string, { fraction: number; licenses: number; pct: number | null }>;
  unassigned: number;
};

// ── Formatting ────────────────────────────────────────────────────────────────

export const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

export const fmtNative = (n: number, currency: string) =>
  currency === "USD"
    ? fmtUSD(n)
    : new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      }).format(n);

export const monthKeyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const monthLabel = (key: string) =>
  new Date(`${key}-01T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

// ── Exchange rates ────────────────────────────────────────────────────────────

/** Rate for a month: that month if saved, otherwise the latest earlier one, otherwise the earliest saved. */
export function rateFor(rates: FxRate[], key: string): number | null {
  if (rates.length === 0) return null;
  const sorted = [...rates].sort((a, b) => a.month.localeCompare(b.month));
  let found: FxRate | null = null;
  for (const r of sorted) {
    if (r.month.slice(0, 7) <= key) found = r;
  }
  return Number((found ?? sorted[0]).cop_per_usd);
}

export function toUSD(amount: number, currency: string, rate: number | null): number | null {
  if (currency === "USD") return amount;
  return rate ? amount / rate : null;
}

// ── Monthly normalisation ─────────────────────────────────────────────────────

const CYCLE_FACTOR: Record<string, number> = {
  monthly: 1,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  annual: 1 / 12,
};

/** Price of ONE license per month, in the subscription's currency. Pay-as-you-go has no fixed price. */
export function unitMonthly(sub: CostSub): number {
  if (sub.billing_cycle === "pay_as_you_go") return 0;
  const factor =
    sub.billing_cycle === "custom"
      ? 30.4375 / (sub.billing_interval_days || 30)
      : (CYCLE_FACTOR[sub.billing_cycle] ?? 1);
  return Number(sub.amount) * factor;
}

/** Whole subscription per month in its own currency. Pay-as-you-go = what was actually paid this month. */
export function subMonthlyNative(sub: CostSub, payments: PaymentRow[], monthKey: string): number {
  if (sub.billing_cycle === "pay_as_you_go") {
    return payments
      .filter((p) => p.subscription_id === sub.id && p.payment_date.slice(0, 7) === monthKey)
      .reduce((s, p) => s + Number(p.amount), 0);
  }
  return unitMonthly(sub) * (sub.license_count ?? 1);
}

// ── Splitting a subscription between projects ─────────────────────────────────
//
// 1. Each active license assigned to a project sends its own seat price to that project.
// 2. What is left is split by the allocation percentages.
// 3. Whatever is not allocated stays "unassigned".

export function fractionsFor(
  sub: CostSub,
  allocations: Allocation[],
  licenses: CostLicense[],
): SubFractions {
  const active = licenses.filter((l) => l.status === "active");
  const seats = Math.max(sub.license_count ?? 0, active.length, 1);

  const licByProject = new Map<string, number>();
  for (const l of active) {
    if (l.project_id) licByProject.set(l.project_id, (licByProject.get(l.project_id) ?? 0) + 1);
  }
  const licenseShare = [...licByProject.values()].reduce((s, n) => s + n, 0) / seats;
  const remainder = Math.max(0, 1 - licenseShare);

  const byProject: SubFractions["byProject"] = new Map();
  for (const [projectId, n] of licByProject) {
    byProject.set(projectId, { fraction: n / seats, licenses: n, pct: null });
  }
  let allocatedPct = 0;
  for (const a of allocations) {
    allocatedPct += Number(a.allocation_pct);
    const prev = byProject.get(a.project_id);
    const f = (remainder * Number(a.allocation_pct)) / 100;
    byProject.set(a.project_id, {
      fraction: (prev?.fraction ?? 0) + f,
      licenses: prev?.licenses ?? 0,
      pct: Number(a.allocation_pct),
    });
  }
  return { byProject, unassigned: Math.max(0, remainder * (1 - allocatedPct / 100)) };
}

// ── Model ─────────────────────────────────────────────────────────────────────

export function buildCostModel(data: CostData, now = new Date()): CostModel {
  const monthKey = monthKeyOf(now);
  const rate = rateFor(data.rates, monthKey);

  const byProject = new Map<string, ProjectCost>();
  for (const p of data.projects) byProject.set(p.id, { usd: 0, lines: [] });
  const unassigned: ProjectCost = { usd: 0, lines: [] };
  const fractions = new Map<string, SubFractions>();
  let missingRate = false;

  for (const sub of data.subs) {
    const fr = fractionsFor(
      sub,
      data.allocations.filter((a) => a.subscription_id === sub.id),
      data.licenses.filter((l) => l.subscription_id === sub.id),
    );
    fractions.set(sub.id, fr);
    if (sub.status !== "active") continue;

    const total = subMonthlyNative(sub, data.payments, monthKey);
    if (total <= 0) continue;

    const push = (target: ProjectCost, fraction: number, licenses: number, pct: number | null) => {
      if (fraction <= 0) return;
      const native = total * fraction;
      const usd = toUSD(native, sub.currency, rate);
      if (usd === null) missingRate = true;
      target.lines.push({
        subscriptionId: sub.id,
        name: sub.name,
        vendor: sub.vendor,
        serviceUrl: sub.service_url,
        currency: sub.currency,
        native,
        usd,
        fraction,
        licenses,
        allocationPct: pct,
      });
      target.usd += usd ?? 0;
    };

    for (const [projectId, s] of fr.byProject) {
      const target = byProject.get(projectId);
      if (target) push(target, s.fraction, s.licenses, s.pct);
    }
    push(unassigned, fr.unassigned, 0, null);
  }

  const assignedUsd = [...byProject.values()].reduce((s, p) => s + p.usd, 0);
  return {
    data,
    monthKey,
    rate,
    byProject,
    unassigned,
    totalUsd: assignedUsd + unassigned.usd,
    assignedUsd,
    missingRate,
    fractions,
  };
}

/** What was actually paid per month for a project, in USD (cash basis). */
export function projectTrend(model: CostModel, projectId: string, months = 6) {
  const now = new Date();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    keys.push(monthKeyOf(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  const totals = new Map(keys.map((k) => [k, 0]));
  const subsById = new Map(model.data.subs.map((s) => [s.id, s]));

  for (const p of model.data.payments) {
    const key = p.payment_date.slice(0, 7);
    if (!totals.has(key)) continue;
    const sub = subsById.get(p.subscription_id);
    const share = model.fractions.get(p.subscription_id)?.byProject.get(projectId)?.fraction ?? 0;
    if (!sub || share <= 0) continue;
    const usd = toUSD(Number(p.amount) * share, sub.currency, rateFor(model.data.rates, key));
    totals.set(key, (totals.get(key) ?? 0) + (usd ?? 0));
  }
  return keys.map((k) => ({
    month: k,
    label: monthLabel(k),
    usd: Math.round((totals.get(k) ?? 0) * 100) / 100,
  }));
}

// ── Loading ───────────────────────────────────────────────────────────────────

export async function loadCostData(): Promise<CostData> {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [projects, subs, allocations, licenses, payments, rates] = await Promise.all([
    db.from("sm_projects").select("*").order("name"),
    db
      .from("subscriptions")
      .select(
        "id, name, vendor, service_url, amount, currency, billing_cycle, billing_interval_days, status, license_count, payment_method",
      ),
    db.from("sm_project_subscriptions").select("id, project_id, subscription_id, allocation_pct"),
    db
      .from("sm_license_assignments")
      .select(
        "id, subscription_id, project_id, status, assigned_name, assigned_email, assignee_type",
      )
      .eq("status", "active"),
    db
      .from("subscription_payment_logs")
      .select("subscription_id, amount, payment_date")
      .gte("payment_date", since),
    db.from("sm_fx_rates").select("month, cop_per_usd").order("month"),
  ]);

  for (const r of [projects, subs, allocations, licenses, payments, rates]) {
    if (r.error) throw new Error(r.error.message);
  }
  return {
    projects: projects.data ?? [],
    subs: subs.data ?? [],
    allocations: allocations.data ?? [],
    licenses: licenses.data ?? [],
    payments: payments.data ?? [],
    rates: rates.data ?? [],
  };
}
