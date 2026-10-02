import { createFileRoute } from "@tanstack/react-router";
import { StackManagementShell } from "@/components/StackManagementShell";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/stack-management/docs")({
  component: DocsPage,
});

// ── Section registry ──────────────────────────────────────────────────────────

type SectionId =
  | "what-is"
  | "roles"
  | "dashboard"
  | "subscriptions"
  | "create-sub"
  | "states"
  | "auto-renewal"
  | "members"
  | "currencies"
  | "reports";

interface NavItem {
  id: SectionId;
  group: string;
  title: string;
}

const NAV: NavItem[] = [
  { id: "what-is",      group: "Introducción",   title: "¿Qué es Stack Management?" },
  { id: "roles",        group: "Introducción",   title: "Roles y permisos" },
  { id: "dashboard",    group: "Dashboard",      title: "El dashboard" },
  { id: "subscriptions",group: "Suscripciones",  title: "¿Qué es una suscripción?" },
  { id: "create-sub",   group: "Suscripciones",  title: "Crear una suscripción" },
  { id: "states",       group: "Suscripciones",  title: "Estados y ciclos de facturación" },
  { id: "auto-renewal", group: "Suscripciones",  title: "Renovación automática" },
  { id: "members",      group: "Miembros",        title: "Licencias y asignaciones" },
  { id: "currencies",   group: "Monedas",         title: "COP y USD" },
  { id: "reports",      group: "Reportes",        title: "Exportar reportes" },
];

// ── Content components ────────────────────────────────────────────────────────

function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="font-display text-2xl font-semibold mb-2">{children}</h1>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-lg font-semibold mt-8 mb-3">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground leading-relaxed mb-4">{children}</p>;
}
function UL({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-2 mb-4 text-sm text-muted-foreground">{children}</ul>;
}
function LI({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
function Pill({ children, color = "muted" }: { children: React.ReactNode; color?: "muted" | "green" | "amber" | "red" | "violet" | "sky" }) {
  const cls: Record<string, string> = {
    muted:  "bg-muted text-muted-foreground",
    green:  "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    amber:  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    red:    "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    sky:    "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium font-mono", cls[color])}>
      {children}
    </span>
  );
}
function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 rounded-lg border-l-4 bg-muted/40 px-4 py-3 text-sm text-muted-foreground leading-relaxed"
      style={{ borderColor: "var(--sm-primary)" }}>
      {children}
    </div>
  );
}
function Divider() {
  return <hr className="my-6 border-border" />;
}

// ── Sections ─────────────────────────────────────────────────────────────────

const SECTIONS: Record<SectionId, React.ReactNode> = {
  "what-is": (
    <>
      <H1>¿Qué es Stack Management?</H1>
      <P>
        Stack Management es el módulo de la plataforma donde puedes controlar todas las herramientas
        y servicios digitales que la empresa paga por suscripción: software, plataformas SaaS,
        licencias de uso, etc.
      </P>
      <P>
        Desde aquí puedes ver cuánto se está pagando, a quién está asignada cada licencia,
        cuándo vence el próximo cobro y exportar reportes para revisión o auditoría.
      </P>
      <Divider />
      <H2>¿Para qué sirve?</H2>
      <UL>
        <LI>Registrar cada suscripción que paga la empresa y hacer seguimiento de sus pagos.</LI>
        <LI>Asignar licencias a empleados, clientes o proyectos específicos.</LI>
        <LI>Activar renovación automática para que los pagos recurrentes se registren solos.</LI>
        <LI>Generar reportes filtrables por fecha, método de pago o tipo de asignación.</LI>
        <LI>Mantener el historial completo aunque una suscripción se cancele o pause.</LI>
      </UL>
    </>
  ),

  "roles": (
    <>
      <H1>Roles y permisos</H1>
      <P>
        Stack Management tiene dos niveles de acceso. Lo que puedes ver y hacer depende del rol
        que te hayan asignado.
      </P>
      <Divider />
      <H2>Super Admin</H2>
      <P>Tiene acceso completo a toda la plataforma.</P>
      <UL>
        <LI>Crear, editar y eliminar suscripciones.</LI>
        <LI>Registrar pagos y subir invoices.</LI>
        <LI>Asignar y revocar licencias.</LI>
        <LI>Ver y exportar reportes.</LI>
        <LI>Pausar, cancelar y reactivar suscripciones.</LI>
        <LI>Invitar y administrar usuarios.</LI>
      </UL>
      <H2>Viewer</H2>
      <P>Puede consultar la información pero no realizar cambios.</P>
      <UL>
        <LI>Ver el dashboard, suscripciones, miembros y reportes.</LI>
        <LI>Exportar reportes en PDF y Excel.</LI>
        <LI>No puede crear, editar ni eliminar nada.</LI>
      </UL>
      <Callout>
        Si necesitas que te cambien el rol o que te den acceso, contacta a un Super Admin.
      </Callout>
    </>
  ),

  "dashboard": (
    <>
      <H1>El dashboard</H1>
      <P>
        Es la primera pantalla que ves al entrar a Stack Management. Muestra un resumen rápido
        del estado de todas las suscripciones activas.
      </P>
      <Divider />
      <H2>Tarjetas de resumen</H2>
      <UL>
        <LI><strong>Active subscriptions:</strong> cuántas suscripciones están activas en este momento.</LI>
        <LI><strong>Due this month:</strong> cuántas suscripciones tienen fecha de cobro en los próximos 30 días.</LI>
        <LI><strong>Monthly petty cash:</strong> el total mensual estimado de suscripciones pagadas con caja menor (en COP).</LI>
        <LI><strong>Due this week:</strong> cobros que vencen en los próximos 7 días.</LI>
      </UL>
      <H2>¿Qué hacer desde el dashboard?</H2>
      <P>
        El dashboard es solo informativo. Para ver el detalle de cada suscripción, ve a
        la sección <strong>Subscriptions</strong> en el menú lateral.
      </P>
    </>
  ),

  "subscriptions": (
    <>
      <H1>¿Qué es una suscripción?</H1>
      <P>
        Una suscripción representa cualquier servicio o herramienta que la empresa paga de forma
        recurrente: mensual, trimestral, semestral o anual. Por ejemplo: Slack, Adobe, GitHub,
        Notion, etc.
      </P>
      <Divider />
      <H2>¿Qué información tiene cada suscripción?</H2>
      <UL>
        <LI><strong>Nombre del servicio:</strong> el nombre de la herramienta (ej. "Slack").</LI>
        <LI><strong>Nombre del plan:</strong> el tier o plan contratado (ej. "Business", "Pro").</LI>
        <LI><strong>Proveedor:</strong> la empresa que ofrece el servicio.</LI>
        <LI><strong>Monto:</strong> el precio por licencia o unidad.</LI>
        <LI><strong>Cantidad de licencias:</strong> cuántas unidades se están pagando. El total mostrado es precio × cantidad.</LI>
        <LI><strong>Método de pago:</strong> caja menor (COP) o tarjeta corporativa (USD).</LI>
        <LI><strong>Ciclo de facturación:</strong> con qué frecuencia se cobra.</LI>
        <LI><strong>Próxima fecha de cobro:</strong> cuándo vence el siguiente pago.</LI>
      </UL>
      <H2>Historial de pagos</H2>
      <P>
        Cada suscripción guarda un registro de todos los pagos realizados, incluyendo fecha,
        monto, método y si fue registrado automáticamente o de forma manual. Este historial
        se conserva incluso si la suscripción se cancela o pausa.
      </P>
    </>
  ),

  "create-sub": (
    <>
      <H1>Crear una suscripción</H1>
      <P>
        Solo los Super Admin pueden crear suscripciones. Entra a <strong>Create</strong> en el
        menú lateral y completa el formulario.
      </P>
      <Divider />
      <H2>Campos del formulario</H2>
      <UL>
        <LI><strong>Service name (obligatorio):</strong> nombre de la herramienta.</LI>
        <LI><strong>Plan name (opcional):</strong> el nombre del plan o tier contratado.</LI>
        <LI><strong>Vendor (opcional):</strong> empresa proveedora del servicio.</LI>
        <LI><strong>Amount:</strong> precio por licencia o unidad.</LI>
        <LI><strong>License count:</strong> número de licencias. El total cobrado será amount × license count.</LI>
        <LI><strong>Currency:</strong> COP para caja menor, USD para tarjeta corporativa.</LI>
        <LI><strong>Billing cycle:</strong> mensual, trimestral, semestral, anual o personalizado.</LI>
        <LI><strong>Next billing date:</strong> la próxima fecha de cobro.</LI>
        <LI><strong>Auto-renewal:</strong> activa el pago automático al llegar la fecha de cobro.</LI>
      </UL>
      <Callout>
        Si activas Auto-renewal, el sistema registra el pago automáticamente el día de facturación.
        Puedes agregar la referencia de la invoice después desde el historial de pagos.
      </Callout>
    </>
  ),

  "states": (
    <>
      <H1>Estados y ciclos de facturación</H1>
      <Divider />
      <H2>Estados de una suscripción</H2>
      <P>Cada suscripción puede estar en uno de estos estados:</P>
      <div className="space-y-3 mb-6">
        {[
          { pill: "Active",    color: "green"  as const, desc: "La suscripción está vigente y se hace seguimiento de sus pagos." },
          { pill: "Paused",    color: "amber"  as const, desc: "Temporalmente pausada. No se registran pagos pero el historial se conserva." },
          { pill: "Cancelled", color: "red"    as const, desc: "Cancelada. El historial completo (pagos, licencias, invoices) se conserva y puedes reactivarla." },
          { pill: "Draft",     color: "muted"  as const, desc: "En borrador. Aún no está activa." },
          { pill: "Expired",   color: "muted"  as const, desc: "Venció sin renovación." },
        ].map(({ pill, color, desc }) => (
          <div key={pill} className="flex items-start gap-3">
            <Pill color={color}>{pill}</Pill>
            <span className="text-sm text-muted-foreground leading-relaxed">{desc}</span>
          </div>
        ))}
      </div>
      <H2>¿Cómo buscar suscripciones canceladas?</H2>
      <P>
        En la lista de Subscriptions, los filtros de estado están visibles como pills en la parte
        superior. Haz clic en <Pill color="red">Cancelled</Pill> para ver las canceladas.
        Al entrar al detalle, puedes ver todo el historial y reactivarla con el botón <strong>Reactivate</strong>.
      </P>
      <Divider />
      <H2>Ciclos de facturación</H2>
      <UL>
        <LI><strong>Monthly:</strong> se cobra una vez al mes.</LI>
        <LI><strong>Quarterly:</strong> se cobra cada 3 meses.</LI>
        <LI><strong>Semiannual:</strong> se cobra cada 6 meses.</LI>
        <LI><strong>Annual:</strong> se cobra una vez al año.</LI>
        <LI><strong>Custom:</strong> se define un intervalo en días.</LI>
        <LI><strong>Pay as you go:</strong> sin ciclo fijo; no aplica renovación automática.</LI>
      </UL>
    </>
  ),

  "auto-renewal": (
    <>
      <H1>Renovación automática</H1>
      <P>
        Cuando una suscripción tiene activado <strong>Auto-renewal</strong>, el sistema registra
        el pago automáticamente en la fecha de facturación, sin necesidad de hacerlo manualmente.
      </P>
      <Divider />
      <H2>¿Cómo funciona?</H2>
      <UL>
        <LI>Cada día a las 8:00 AM (UTC), el sistema revisa qué suscripciones con auto-renewal tienen fecha de cobro igual o anterior a hoy.</LI>
        <LI>Para cada una de esas suscripciones, registra automáticamente el pago por el monto total (precio × licencias).</LI>
        <LI>La próxima fecha de facturación se avanza al mismo día del mes siguiente (o el ciclo que corresponda), sin que el día cambie con el tiempo.</LI>
        <LI>No se duplican pagos: si ya se registró un pago para esa fecha, el sistema no lo vuelve a crear.</LI>
      </UL>
      <H2>Pagos automáticos en el historial</H2>
      <P>
        Los pagos generados automáticamente aparecen en el historial con el badge{" "}
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono tracking-wider bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">AUTO</span>.
        Si necesitas agregar el número de invoice o una nota, haz clic en <strong>Add invoice reference</strong> que aparece debajo del pago.
      </P>
      <Callout>
        Auto-renewal no impide subir invoices ni registrar pagos manuales. La opción de registrar
        un pago manual sigue disponible en cualquier momento.
      </Callout>
    </>
  ),

  "members": (
    <>
      <H1>Licencias y asignaciones</H1>
      <P>
        Cada suscripción puede tener licencias asignadas a personas o proyectos. Desde la sección
        <strong> Members</strong> puedes ver todas las asignaciones en un solo lugar.
      </P>
      <Divider />
      <H2>Tipos de asignación</H2>
      <div className="space-y-3 mb-6">
        {[
          { pill: "Employee", color: "muted"  as const, desc: "Una licencia asignada a un empleado de la empresa. Se puede incluir su correo electrónico." },
          { pill: "Client",   color: "sky"    as const, desc: "Una licencia asignada a un cliente externo." },
          { pill: "Project",  color: "violet" as const, desc: "Una licencia asignada a un proyecto o cuenta específica." },
        ].map(({ pill, color, desc }) => (
          <div key={pill} className="flex items-start gap-3">
            <Pill color={color}>{pill}</Pill>
            <span className="text-sm text-muted-foreground leading-relaxed">{desc}</span>
          </div>
        ))}
      </div>
      <H2>Asignar una licencia</H2>
      <P>
        Puedes asignar una licencia desde dos lugares:
      </P>
      <UL>
        <LI>Desde el detalle de una suscripción, en el panel de licencias a la derecha.</LI>
        <LI>Desde la página <strong>Members</strong>, usando el botón <strong>Assign license</strong> en la parte superior.</LI>
      </UL>
      <P>
        Al asignar, seleccionas el tipo (Employee, Client o Project), el nombre, y opcionalmente
        un correo electrónico y una referencia.
      </P>
      <H2>Revocar una licencia</H2>
      <P>
        Desde el detalle de la suscripción, expande la licencia asignada y haz clic en
        <strong> Revoke</strong>. El historial de la suscripción no se ve afectado.
      </P>
    </>
  ),

  "currencies": (
    <>
      <H1>COP y USD</H1>
      <P>
        Stack Management maneja dos monedas: pesos colombianos (COP) para pagos con caja menor,
        y dólares americanos (USD) para pagos con tarjeta corporativa.
      </P>
      <Divider />
      <H2>¿Cómo se muestran los montos?</H2>
      <P>
        Para evitar confusión al compartir reportes internacionalmente, los montos no usan el
        símbolo <strong>$</strong> (que se asocia al dólar). En cambio, se muestran con el
        prefijo de moneda explícito:
      </P>
      <div className="my-4 space-y-2">
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <span className="font-mono text-sm font-semibold" style={{ color: "var(--sm-primary)" }}>COP 150.000</span>
          <span className="text-sm text-muted-foreground">Pago con caja menor en pesos colombianos.</span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <span className="font-mono text-sm font-semibold" style={{ color: "var(--sm-primary)" }}>USD 29.99</span>
          <span className="text-sm text-muted-foreground">Pago con tarjeta corporativa en dólares.</span>
        </div>
      </div>
      <H2>Método de pago por moneda</H2>
      <UL>
        <LI>Las suscripciones con <strong>Petty cash</strong> como método de pago se manejan en COP.</LI>
        <LI>Las suscripciones con <strong>Corporate card</strong> se manejan en USD.</LI>
      </UL>
      <Callout>
        En los reportes, los totales de COP y USD se muestran por separado para no mezclar monedas.
      </Callout>
    </>
  ),

  "reports": (
    <>
      <H1>Exportar reportes</H1>
      <P>
        La sección <strong>Reports</strong> en el menú lateral permite generar un resumen
        filtrable de pagos y asignaciones de licencias.
      </P>
      <Divider />
      <H2>Filtros disponibles</H2>
      <UL>
        <LI><strong>Rango de fechas:</strong> puedes elegir mes actual, mes anterior, últimos 3 meses o un rango personalizado.</LI>
        <LI><strong>Método de pago:</strong> todos, caja menor (COP) o tarjeta corporativa (USD).</LI>
        <LI><strong>Tipo de asignación:</strong> todos, empleados, clientes o proyectos.</LI>
      </UL>
      <H2>Exportar en PDF</H2>
      <P>
        Haz clic en el botón <strong>PDF</strong>. Se abrirá el diálogo de impresión del navegador.
        Selecciona "Guardar como PDF" como destino. Los filtros y botones se ocultan
        automáticamente en el PDF para que solo aparezca el contenido del reporte.
      </P>
      <H2>Exportar en Excel</H2>
      <P>
        Haz clic en <strong>Excel</strong>. Se descarga un archivo .xlsx con dos hojas:
      </P>
      <UL>
        <LI><strong>Payments:</strong> lista de todos los pagos en el período filtrado con fecha, suscripción, método y monto.</LI>
        <LI><strong>Assignees:</strong> lista de todas las licencias asignadas con tipo, nombre, correo y suscripción.</LI>
      </UL>
    </>
  ),
};

// ── Page ──────────────────────────────────────────────────────────────────────

function DocsPage() {
  const [active, setActive] = useState<SectionId>("what-is");

  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <StackManagementShell>
      <div className="flex min-h-[calc(100vh-4rem)] gap-0">
        {/* Sidebar nav */}
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-24 space-y-5">
            {groups.map((group) => (
              <div key={group}>
                <div className="mb-1.5 px-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {group}
                </div>
                <div className="space-y-0.5">
                  {NAV.filter((n) => n.group === group).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActive(item.id)}
                      className={cn(
                        "w-full rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
                        active === item.id
                          ? "font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                      )}
                      style={active === item.id ? { color: "var(--sm-primary)", background: "color-mix(in srgb, var(--sm-primary) 8%, transparent)" } : undefined}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Mobile nav */}
        <div className="mb-4 md:hidden w-full">
          <select
            value={active}
            onChange={(e) => setActive(e.target.value as SectionId)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          >
            {NAV.map((item) => (
              <option key={item.id} value={item.id}>
                {item.group} — {item.title}
              </option>
            ))}
          </select>
        </div>

        {/* Divider */}
        <div className="hidden md:block w-px bg-border mx-6 shrink-0" />

        {/* Content */}
        <div className="min-w-0 flex-1 pb-16">
          {/* Breadcrumb */}
          <div className="mb-6 font-mono text-xs text-muted-foreground">
            Stack Management{" "}
            <span className="mx-1 opacity-40">/</span>{" "}
            {NAV.find((n) => n.id === active)?.group}{" "}
            <span className="mx-1 opacity-40">/</span>{" "}
            <span style={{ color: "var(--sm-primary)" }}>{NAV.find((n) => n.id === active)?.title}</span>
          </div>

          <div className="prose-sm max-w-2xl">
            {SECTIONS[active]}
          </div>

          {/* Prev / Next */}
          <div className="mt-12 flex justify-between border-t pt-6">
            {(() => {
              const idx = NAV.findIndex((n) => n.id === active);
              const prev = NAV[idx - 1];
              const next = NAV[idx + 1];
              return (
                <>
                  <div>
                    {prev && (
                      <button
                        onClick={() => setActive(prev.id)}
                        className="group flex flex-col text-left"
                      >
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Anterior</span>
                        <span className="mt-0.5 text-sm font-medium group-hover:underline" style={{ color: "var(--sm-primary)" }}>
                          ← {prev.title}
                        </span>
                      </button>
                    )}
                  </div>
                  <div>
                    {next && (
                      <button
                        onClick={() => setActive(next.id)}
                        className="group flex flex-col text-right"
                      >
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Siguiente</span>
                        <span className="mt-0.5 text-sm font-medium group-hover:underline" style={{ color: "var(--sm-primary)" }}>
                          {next.title} →
                        </span>
                      </button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </StackManagementShell>
  );
}
