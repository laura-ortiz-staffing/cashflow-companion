import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { monthKeyOf, monthLabel, rateFor, type FxRate } from "@/lib/sm-costs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeftRight } from "lucide-react";

const fmtRate = (n: number) =>
  new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function ExchangeRateCard({
  rates,
  isSuperAdmin,
  onSaved,
}: {
  rates: FxRate[];
  isSuperAdmin: boolean;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const key = monthKeyOf(new Date());
  const exact = rates.find((r) => r.month.slice(0, 7) === key);
  const effective = rateFor(rates, key);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(exact ? String(exact.cop_per_usd) : "");
  }, [exact]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(value.replace(",", "."));
    if (!user || !n || n <= 0) {
      toast.error("Enter a valid rate, for example 4000.");
      return;
    }
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("sm_fx_rates")
      .upsert({ month: `${key}-01`, cop_per_usd: n, set_by: user.id }, { onConflict: "month" });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logAction({
      action: "sm_fx_rate.saved",
      entity_type: "sm_fx_rate",
      entity_id: key,
      new_state: { cop_per_usd: n },
    });
    toast.success("Exchange rate saved");
    onSaved();
  };

  const history = [...rates].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 6);

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-display text-base">Exchange rate</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Petty cash is paid in COP, so we convert it to USD with the official TRM (Banco de la
        República), the same one Petty Cash uses for USD invoices. It is fetched automatically once
        a month and saved. You only need to type a rate to override it.
      </p>

      {isSuperAdmin ? (
        <form onSubmit={save} className="mt-4 flex items-end gap-2">
          <div className="flex-1">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {monthLabel(key)} · COP per 1 USD (override)
            </div>
            <Input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 4000"
            />
          </div>
          <Button
            type="submit"
            disabled={busy}
            style={{ background: "var(--sm-primary)", color: "var(--sm-primary-fg)" }}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </form>
      ) : (
        <div className="mt-4 font-display text-2xl">
          {effective ? `COP ${fmtRate(effective)}` : "Not set"}
        </div>
      )}

      {!exact && effective && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          The official TRM for {monthLabel(key)} could not be fetched. Using COP{" "}
          {fmtRate(effective)} from the most recent month. Try again later or type a rate.
        </p>
      )}
      {!effective && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          The official TRM could not be fetched, so petty cash (COP) costs are left out of the USD
          totals. Try again later or type a rate.
        </p>
      )}

      {history.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {history.map((r) => (
            <span
              key={r.month}
              className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {monthLabel(r.month.slice(0, 7))} · {fmtRate(Number(r.cop_per_usd))}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
