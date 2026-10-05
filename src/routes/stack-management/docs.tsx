import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
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
  | "payments"
  | "edit-sub"
  | "projects"
  | "ai-usage"
  | "invitations"
  | "users"
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
  { id: "what-is", group: "Overview", title: "What is Stack Management?" },
  { id: "roles", group: "Overview", title: "Roles & permissions" },
  { id: "dashboard", group: "Dashboard", title: "The dashboard" },
  { id: "subscriptions", group: "Subscriptions", title: "What is a subscription?" },
  { id: "create-sub", group: "Subscriptions", title: "Creating a subscription" },
  { id: "payments", group: "Subscriptions", title: "Payments & invoices" },
  { id: "edit-sub", group: "Subscriptions", title: "Editing & changing status" },
  { id: "states", group: "Subscriptions", title: "Status & billing cycles" },
  { id: "auto-renewal", group: "Subscriptions", title: "Auto-renewal" },
  { id: "members", group: "Members", title: "Licenses & assignments" },
  { id: "currencies", group: "Currencies", title: "COP and USD" },
  { id: "reports", group: "Reports", title: "Exporting reports" },
  { id: "projects", group: "Projects", title: "Projects & costs" },
  { id: "ai-usage", group: "AI Usage", title: "Tracking AI spend" },
  { id: "invitations", group: "Administration", title: "Inviting people" },
  { id: "users", group: "Administration", title: "Managing user access" },
];

// ── Content primitives ────────────────────────────────────────────────────────

function H1({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-display text-3xl font-semibold tracking-tight mb-3 text-foreground">
      {children}
    </h1>
  );
}
function Lead({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-base text-muted-foreground leading-relaxed mb-6 border-b border-border pb-6">
      {children}
    </p>
  );
}
function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-lg font-semibold mt-8 mb-3 text-foreground">{children}</h2>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground leading-relaxed mb-4">{children}</p>;
}
function UL({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-2.5 mb-5">{children}</ul>;
}
function LI({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm text-muted-foreground">
      <span
        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: "var(--sm-primary)" }}
      />
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
function Badge({
  children,
  color = "muted",
}: {
  children: React.ReactNode;
  color?: "muted" | "green" | "amber" | "red" | "violet" | "sky";
}) {
  const cls: Record<string, string> = {
    muted: "bg-muted text-muted-foreground",
    green: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        cls[color],
      )}
    >
      {children}
    </span>
  );
}
function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="my-5 rounded-lg border bg-muted/30 px-4 py-3.5 text-sm text-muted-foreground leading-relaxed"
      style={{ borderLeftWidth: 3, borderLeftColor: "var(--sm-primary)" }}
    >
      {children}
    </div>
  );
}
function StatusRow({
  badge,
  color,
  desc,
}: {
  badge: string;
  color: "green" | "amber" | "red" | "muted" | "violet" | "sky";
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <Badge color={color}>{badge}</Badge>
      <span className="text-sm text-muted-foreground leading-relaxed">{desc}</span>
    </div>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

const SECTIONS: Record<SectionId, React.ReactNode> = {
  "what-is": (
    <>
      <H1>What is Stack Management?</H1>
      <Lead>
        Stack Management is the module where you track every digital tool and subscription the
        company pays for — software, SaaS platforms, licenses, and more.
      </Lead>
      <H2>What can you do here?</H2>
      <UL>
        <LI>Register each subscription the company pays and track its payments over time.</LI>
        <LI>Assign licenses to employees, clients, or specific projects.</LI>
        <LI>Enable auto-renewal so recurring payments are logged automatically.</LI>
        <LI>Generate reports filterable by date, payment method, or assignee type.</LI>
        <LI>Keep the full history even when a subscription is cancelled or paused.</LI>
      </UL>
      <H2>How to navigate</H2>
      <P>
        Use the left sidebar to move between sections: Dashboard, Subscriptions, Projects, Create,
        Members, Reports, Docs, Q&A, AI, Invitations, and Users. Create, Invitations, and Users only
        appear for Super Admins. Your current section is always highlighted.
      </P>
    </>
  ),

  roles: (
    <>
      <H1>Roles & permissions</H1>
      <Lead>
        There are two access levels in Stack Management. What you can see and do depends on the role
        assigned to your account.
      </Lead>
      <H2>Super Admin</H2>
      <P>Full access to everything in the platform.</P>
      <UL>
        <LI>Create, edit, and delete subscriptions.</LI>
        <LI>Register payments and upload invoices.</LI>
        <LI>Assign and revoke licenses.</LI>
        <LI>View and export reports.</LI>
        <LI>Pause, cancel, and reactivate subscriptions.</LI>
        <LI>Invite and manage users.</LI>
      </UL>
      <H2>Viewer</H2>
      <P>Read-only access — can browse but cannot make changes.</P>
      <UL>
        <LI>View the dashboard, subscriptions, members, and reports.</LI>
        <LI>Export reports as PDF or Excel.</LI>
        <LI>Cannot create, edit, or delete anything.</LI>
      </UL>
      <Callout>If you need your role changed or access granted, contact a Super Admin.</Callout>
    </>
  ),

  dashboard: (
    <>
      <H1>The dashboard</H1>
      <Lead>
        The first screen you see when you open Stack Management. It gives you a quick snapshot of
        all active subscriptions.
      </Lead>
      <H2>Summary cards</H2>
      <UL>
        <LI>
          <strong>Active subscriptions —</strong> how many subscriptions are currently active.
        </LI>
        <LI>
          <strong>Due this month —</strong> subscriptions with a billing date in the next 30 days.
        </LI>
        <LI>
          <strong>Monthly petty cash —</strong> the estimated monthly total for petty cash
          subscriptions (in COP).
        </LI>
        <LI>
          <strong>Due this week —</strong> payments due in the next 7 days.
        </LI>
      </UL>
      <Callout>
        The dashboard is read-only. To view or act on a specific subscription, go to
        <strong> Subscriptions</strong> in the left sidebar.
      </Callout>
    </>
  ),

  subscriptions: (
    <>
      <H1>What is a subscription?</H1>
      <Lead>
        A subscription represents any recurring service or tool the company pays for — monthly,
        quarterly, semi-annually, or annually. Examples: Slack, Adobe, GitHub, Notion.
      </Lead>
      <H2>Key fields</H2>
      <UL>
        <LI>
          <strong>Service name —</strong> the name of the tool (e.g. "Slack").
        </LI>
        <LI>
          <strong>Plan name —</strong> the tier or plan contracted (e.g. "Business", "Pro").
        </LI>
        <LI>
          <strong>Vendor —</strong> the company providing the service.
        </LI>
        <LI>
          <strong>Amount —</strong> the price per license or unit.
        </LI>
        <LI>
          <strong>License count —</strong> how many units are being paid. The total shown is amount
          × license count.
        </LI>
        <LI>
          <strong>Payment method —</strong> petty cash (COP) or corporate card (USD).
        </LI>
        <LI>
          <strong>Billing cycle —</strong> how often the charge recurs.
        </LI>
        <LI>
          <strong>Next billing date —</strong> when the next payment is due.
        </LI>
      </UL>
      <H2>Payment history</H2>
      <P>
        Each subscription stores a log of every payment made, including the date, amount, method,
        and whether it was registered automatically or manually. This history is preserved even when
        a subscription is cancelled or paused.
      </P>
    </>
  ),

  "create-sub": (
    <>
      <H1>Creating a subscription</H1>
      <Lead>
        Only Super Admins can create subscriptions. Go to <strong>Create</strong> in the left
        sidebar and fill in the form.
      </Lead>
      <H2>Form fields</H2>
      <UL>
        <LI>
          <strong>Service name (required) —</strong> the name of the tool.
        </LI>
        <LI>
          <strong>Plan name (optional) —</strong> the plan or tier contracted.
        </LI>
        <LI>
          <strong>Vendor (optional) —</strong> the service provider company.
        </LI>
        <LI>
          <strong>Amount —</strong> price per license or unit.
        </LI>
        <LI>
          <strong>License count —</strong> number of licenses. Total charged = amount × count.
        </LI>
        <LI>
          <strong>Currency —</strong> COP for petty cash, USD for corporate card.
        </LI>
        <LI>
          <strong>Billing cycle —</strong> monthly, quarterly, semi-annual, annual, or custom.
        </LI>
        <LI>
          <strong>Next billing date —</strong> the upcoming payment date.
        </LI>
        <LI>
          <strong>Auto-renewal —</strong> turns on automatic payment registration on the billing
          date.
        </LI>
      </UL>
      <Callout>
        When Auto-renewal is on, the system logs the payment automatically on the billing date. You
        can add the invoice reference afterward from the payment history.
      </Callout>
    </>
  ),

  states: (
    <>
      <H1>Status & billing cycles</H1>
      <Lead>
        Every subscription has a status that reflects its current state, and a billing cycle that
        defines how often it recurs.
      </Lead>
      <H2>Subscription statuses</H2>
      <div className="space-y-2.5 mb-6">
        <StatusRow
          badge="Active"
          color="green"
          desc="The subscription is live and payments are tracked."
        />
        <StatusRow
          badge="Paused"
          color="amber"
          desc="Temporarily paused. No payments are tracked but the full history is kept."
        />
        <StatusRow
          badge="Cancelled"
          color="red"
          desc="Cancelled. The complete history — payments, licenses, invoices — is preserved and the subscription can be reactivated."
        />
        <StatusRow badge="Draft" color="muted" desc="Not yet active." />
        <StatusRow badge="Expired" color="muted" desc="The subscription ended without renewal." />
      </div>
      <H2>Finding cancelled subscriptions</H2>
      <P>
        In the Subscriptions list, the status filter pills appear at the top of the page. Click{" "}
        <Badge color="red">Cancelled</Badge> to see cancelled subscriptions. Opening one shows the
        full history, and a <strong>Reactivate</strong> button lets you restore it.
      </P>
      <H2>Billing cycles</H2>
      <UL>
        <LI>
          <strong>Monthly —</strong> billed once a month.
        </LI>
        <LI>
          <strong>Quarterly —</strong> billed every 3 months.
        </LI>
        <LI>
          <strong>Semi-annual —</strong> billed every 6 months.
        </LI>
        <LI>
          <strong>Annual —</strong> billed once a year.
        </LI>
        <LI>
          <strong>Custom —</strong> a fixed interval defined in days.
        </LI>
        <LI>
          <strong>Pay as you go —</strong> no fixed cycle; auto-renewal does not apply.
        </LI>
      </UL>
    </>
  ),

  "auto-renewal": (
    <>
      <H1>Auto-renewal</H1>
      <Lead>
        When a subscription has Auto-renewal turned on, the system registers the payment
        automatically on the billing date — no manual action needed.
      </Lead>
      <H2>How it works</H2>
      <UL>
        <LI>
          Every day at 8:00 AM UTC, the system checks which auto-renewal subscriptions have a
          billing date on or before today.
        </LI>
        <LI>
          For each one, it automatically logs a payment for the full amount (price × licenses).
        </LI>
        <LI>
          The next billing date advances to the same day of the month in the following cycle — it
          never drifts even across months with different lengths.
        </LI>
        <LI>
          Duplicate payments are prevented: if a payment was already recorded for that date, the
          system skips it.
        </LI>
      </UL>
      <H2>Auto-generated payments in history</H2>
      <P>
        Payments created automatically appear in the history with an{" "}
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono tracking-wider bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-semibold">
          AUTO
        </span>{" "}
        badge. If you need to attach an invoice number or note, click{" "}
        <strong>Add invoice reference</strong> below the payment row.
      </P>
      <Callout>
        Auto-renewal does not prevent manual payments or invoice uploads. The{" "}
        <strong>Register payment</strong> button remains available at all times.
      </Callout>
    </>
  ),

  payments: (
    <>
      <H1>Payments & invoices</H1>
      <Lead>
        Every time the company pays for a subscription, the payment is saved in that subscription's
        history together with its invoice, so you can always see what was paid and when.
      </Lead>
      <H2>Registering a payment</H2>
      <P>
        Only Super Admins can register payments. Open the subscription from{" "}
        <strong>Subscriptions</strong>, click <strong>Register payment</strong>, and fill in:
      </P>
      <UL>
        <LI>
          <strong>Invoice / Receipt (optional) —</strong> upload the file and the app reads it for
          you and fills in the fields it finds, such as the date and the invoice number. Always
          double-check them.
        </LI>
        <LI>
          <strong>Amount —</strong> in the subscription's currency (COP or USD).
        </LI>
        <LI>
          <strong>Payment date —</strong> when the payment was made.
        </LI>
        <LI>
          <strong>Payment method —</strong> petty cash or corporate card.
        </LI>
        <LI>
          <strong>Reference —</strong> a transaction ID, invoice number, or similar.
        </LI>
        <LI>
          <strong>Notes (optional) —</strong> anything worth remembering.
        </LI>
      </UL>
      <H2>Payment history</H2>
      <P>
        The detail page lists every payment, newest first. Payments created by auto-renewal carry an
        AUTO badge, and you can attach an invoice reference to them afterward.
      </P>
      <Callout>
        Payments are never lost when a subscription is paused, cancelled, or reactivated.
      </Callout>
    </>
  ),

  "edit-sub": (
    <>
      <H1>Editing & changing status</H1>
      <Lead>
        Everything about a subscription can be changed later from its detail page. Only Super Admins
        can make changes; Viewers can see the page but not edit it.
      </Lead>
      <H2>Editing details</H2>
      <P>
        Open the subscription and click <strong>Edit</strong>. You can change the service name,
        vendor, billing cycle, payment method, amount, next billing date, auto-renewal, category,
        renewal date, service URL, and notes.
      </P>
      <H2>Reminders</H2>
      <P>
        In the edit form, <strong>Reminders</strong> lets you choose how many days before the
        billing date you want to be warned about an upcoming charge.
      </P>
      <H2>Pause, cancel, and reactivate</H2>
      <UL>
        <LI>
          <strong>Pause / Resume —</strong> Pause stops tracking payments for now; the Resume button
          puts it back to active.
        </LI>
        <LI>
          <strong>Cancel —</strong> marks the subscription as cancelled. Nothing is deleted.
        </LI>
        <LI>
          <strong>Reactivate —</strong> appears on cancelled or expired subscriptions and sets them
          back to active with all history intact.
        </LI>
      </UL>
      <P>Each of these asks for confirmation before it is applied.</P>
    </>
  ),

  projects: (
    <>
      <H1>Projects & costs</H1>
      <Lead>
        A project groups the costs of one client or one internal initiative, so you can see exactly
        how much it costs per month in software and licenses.
      </Lead>
      <H2>What a project has</H2>
      <UL>
        <LI>
          <strong>Name and description.</strong>
        </LI>
        <LI>
          <strong>Type —</strong> a <Badge color="sky">Client</Badge> project or an{" "}
          <Badge color="violet">Internal</Badge> initiative.
        </LI>
        <LI>
          <strong>Client details —</strong> company, contact name, and contact email (client
          projects only).
        </LI>
        <LI>
          <strong>Status —</strong> Active, Paused, or Finished.
        </LI>
      </UL>
      <H2>Connecting costs to a project</H2>
      <P>
        Only Super Admins can create projects and link costs. There are two ways to connect a cost:
      </P>
      <UL>
        <LI>
          <strong>Subscriptions —</strong> open a project and click{" "}
          <strong>Link subscription</strong>, or use the <strong>Projects</strong> panel on a
          subscription's page. Choose what percentage of the tool belongs to the project. A tool
          shared by three projects could be 50%, 30%, and 20%. The percentages of one tool can never
          add up to more than 100%.
        </LI>
        <LI>
          <strong>Licenses —</strong> when you assign a license, pick a project in the optional{" "}
          <strong>Project</strong> field. That seat's price counts toward the project.
        </LI>
      </UL>
      <H2>How the numbers are calculated</H2>
      <UL>
        <LI>
          Everything is shown <strong>per month in USD</strong>.
        </LI>
        <LI>
          Annual plans are divided by 12, quarterly by 3, and semi-annual by 6. Price × number of
          licenses gives the cost of the whole tool.
        </LI>
        <LI>
          Seats assigned straight to a project are taken out first. The rest is split by the
          percentages.
        </LI>
        <LI>
          Whatever is left over is <strong>unassigned</strong>, so nothing gets lost.
        </LI>
        <LI>Pay-as-you-go tools count what was actually paid this month.</LI>
        <LI>
          Petty cash is paid in COP, so it is converted with the official <strong>TRM</strong> from
          Banco de la República, the same one Petty Cash uses for USD invoices. It is fetched
          automatically once a month and saved. The current month uses the latest published TRM;
          past months use the TRM of their last day. A Super Admin can override a month's rate on
          the Projects page. If the TRM cannot be fetched, COP costs are left out of the totals and
          a warning is shown.
        </LI>
      </UL>
      <H2>Where to see it</H2>
      <UL>
        <LI>
          <strong>Projects page —</strong> every project with its monthly cost, plus totals for what
          is assigned and what is not.
        </LI>
        <LI>
          <strong>A project's page —</strong> client data, each tool and what it costs the project,
          the licenses assigned to it, and a chart of what was paid in the last 6 months.
        </LI>
        <LI>
          <strong>Dashboard —</strong> a card showing the costs that are not assigned to any project
          yet.
        </LI>
      </UL>
      <Callout>
        The chart shows real payments, so an annual plan appears as one tall bar in the month it was
        paid. The monthly cost at the top spreads it evenly across the year.
      </Callout>
    </>
  ),

  "ai-usage": (
    <>
      <H1>Tracking AI spend</H1>
      <Lead>
        The <strong>AI</strong> page shows how much the company spends on AI tools. OpenAI is read
        automatically; any other provider is logged by hand.
      </Lead>
      <H2>OpenAI usage (live)</H2>
      <P>
        This section updates by itself, there is nothing to enter. Choose{" "}
        <strong>Last 7 days</strong> or <strong>Last 30 days</strong> at the top right.
      </P>
      <UL>
        <LI>
          <strong>Total spend —</strong> what OpenAI charged in the period.
        </LI>
        <LI>
          <strong>Requests —</strong> how many times the AI was called.
        </LI>
        <LI>
          <strong>Tokens —</strong> the amount of text processed. Input tokens are what we send,
          output tokens are what the model writes back.
        </LI>
        <LI>
          <strong>Daily chart —</strong> a line showing spend or tokens day by day. Use the Spend /
          Tokens buttons to switch.
        </LI>
        <LI>
          <strong>Projects table —</strong> one row per OpenAI project. Click a project to see its
          API keys.
        </LI>
      </UL>
      <Callout>
        OpenAI only reports spend per project, so individual keys show requests and tokens but no
        cost. Keys appear by name only, their secret value is never shown. Hover a rounded number to
        see the exact value.
      </Callout>
      <H2>Other AI providers (manual)</H2>
      <P>
        For tools without a connection (for example Anthropic or Google), a Super Admin can click{" "}
        <strong>Add record</strong> and enter the provider, service, billing period, usage,
        estimated cost, and an optional spending limit. The totals in that section do not include
        OpenAI.
      </P>
      <P>Viewers can see everything on this page but cannot add or edit records.</P>
    </>
  ),

  invitations: (
    <>
      <H1>Inviting people</H1>
      <Lead>
        Only Super Admins can invite new people. An invitation gives access to Stack Management
        only, not to other apps.
      </Lead>
      <H2>How to invite someone</H2>
      <UL>
        <LI>
          Go to <strong>Invitations</strong> in the left sidebar.
        </LI>
        <LI>Type the person's email address.</LI>
        <LI>
          Choose a role: <Badge color="muted">Viewer</Badge> (read-only) or{" "}
          <Badge color="violet">Super Admin</Badge> (full access).
        </LI>
        <LI>Set how many days the invitation stays valid (1 to 30).</LI>
        <LI>
          Click <strong>Generate</strong>.
        </LI>
      </UL>
      <H2>After generating</H2>
      <P>
        The invitation appears in the list below. From there you can copy its link, send it to the
        person by email, or revoke it if it was a mistake. Expired invitations stop working on their
        own.
      </P>
      <Callout>
        If the person already has an account in the company app, you do not need an invitation.
        Grant them access from <strong>Users</strong> instead.
      </Callout>
    </>
  ),

  users: (
    <>
      <H1>Managing user access</H1>
      <Lead>
        The <strong>Users</strong> page, available to Super Admins, controls who can enter Stack
        Management and what they can do.
      </Lead>
      <H2>Users with access</H2>
      <P>
        This tab lists everyone who can use the module. For each person you can change their role
        between Viewer and Super Admin, or click <strong>Revoke</strong> to remove their access. You
        cannot remove your own Super Admin role.
      </P>
      <H2>Grant access</H2>
      <P>
        This tab lists people who already have a company account but no Stack Management access.
        Pick the default role at the top, then click <strong>Grant as Viewer</strong> or{" "}
        <strong>Grant as Super Admin</strong> next to their name.
      </P>
    </>
  ),

  members: (
    <>
      <H1>Licenses & assignments</H1>
      <Lead>
        Each subscription can have its licenses assigned to people or projects. The{" "}
        <strong>Members</strong> page shows all assignments across every subscription in one place.
      </Lead>
      <H2>Assignment types</H2>
      <div className="space-y-2.5 mb-6">
        <StatusRow
          badge="Employee"
          color="muted"
          desc="A license assigned to a company employee. An email address can optionally be included."
        />
        <StatusRow badge="Client" color="sky" desc="A license assigned to an external client." />
        <StatusRow
          badge="Project"
          color="violet"
          desc="A license assigned to a specific project or account."
        />
      </div>
      <H2>Assigning a license</H2>
      <P>You can assign a license from two places:</P>
      <UL>
        <LI>From inside a subscription's detail page, in the license panel on the right.</LI>
        <LI>
          From the <strong>Members</strong> page, using the <strong>Assign license</strong> button
          at the top.
        </LI>
      </UL>
      <P>
        When assigning, select the type (Employee, Client, or Project), enter the name, and
        optionally add an email and a reference.
      </P>
      <H2>Revoking a license</H2>
      <P>
        From the subscription detail page, expand the assigned license and click{" "}
        <strong>Revoke</strong>. The subscription's payment history is not affected.
      </P>
    </>
  ),

  currencies: (
    <>
      <H1>COP and USD</H1>
      <Lead>
        Stack Management handles two currencies: Colombian pesos (COP) for petty cash payments, and
        US dollars (USD) for corporate card payments.
      </Lead>
      <H2>How amounts are displayed</H2>
      <P>
        To avoid confusion when sharing reports internationally, amounts do not use the{" "}
        <strong>$</strong> symbol (which is associated with USD). Instead, amounts are shown with an
        explicit currency prefix:
      </P>
      <div className="my-5 space-y-2">
        <div className="flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3">
          <span className="font-mono text-sm font-bold" style={{ color: "var(--sm-primary)" }}>
            COP 150,000
          </span>
          <span className="text-sm text-muted-foreground">
            Petty cash payment in Colombian pesos.
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3">
          <span className="font-mono text-sm font-bold" style={{ color: "var(--sm-primary)" }}>
            USD 29.99
          </span>
          <span className="text-sm text-muted-foreground">
            Corporate card payment in US dollars.
          </span>
        </div>
      </div>
      <H2>Currency by payment method</H2>
      <UL>
        <LI>
          Subscriptions paid with <strong>Petty cash</strong> are in COP.
        </LI>
        <LI>
          Subscriptions paid with <strong>Corporate card</strong> are in USD.
        </LI>
      </UL>
      <Callout>
        In reports, COP and USD totals are shown separately so currencies are never mixed.
      </Callout>
    </>
  ),

  reports: (
    <>
      <H1>Exporting reports</H1>
      <Lead>
        The <strong>Reports</strong> page generates a filterable summary of payments and license
        assignments that can be exported as PDF or Excel.
      </Lead>
      <H2>Available filters</H2>
      <UL>
        <LI>
          <strong>Date range —</strong> choose current month, last month, last 3 months, or a custom
          range.
        </LI>
        <LI>
          <strong>Payment method —</strong> all, petty cash (COP), or corporate card (USD).
        </LI>
        <LI>
          <strong>Assignee type —</strong> all, employees, clients, or projects.
        </LI>
      </UL>
      <H2>Export as PDF</H2>
      <P>
        Click the <strong>PDF</strong> button. Your browser's print dialog will open — select "Save
        as PDF" as the destination. Filters and action buttons are automatically hidden so only the
        report content appears.
      </P>
      <H2>Export as Excel</H2>
      <P>
        Click <strong>Excel</strong>. A .xlsx file downloads with two sheets:
      </P>
      <UL>
        <LI>
          <strong>Payments —</strong> every payment in the filtered period with date, subscription,
          method, and amount.
        </LI>
        <LI>
          <strong>Assignees —</strong> all assigned licenses with type, name, email, and
          subscription.
        </LI>
      </UL>
    </>
  ),
};

// ── Page ──────────────────────────────────────────────────────────────────────

function DocsPage() {
  const [active, setActive] = useState<SectionId>("what-is");
  const groups = [...new Set(NAV.map((n) => n.group))];
  const idx = NAV.findIndex((n) => n.id === active);
  const prev = NAV[idx - 1];
  const next = NAV[idx + 1];

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [active]);

  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8 flex min-h-[calc(100vh-4rem)]">
      {/* Docs sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-border lg:block">
        <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto px-4 py-8 [scrollbar-width:thin]">
          {groups.map((group) => (
            <div key={group} className="mb-6">
              <p className="mb-1.5 px-2 text-[10px] font-mono font-semibold uppercase tracking-widest text-muted-foreground/70">
                {group}
              </p>
              {NAV.filter((n) => n.group === group).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    active === item.id
                      ? "font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  style={
                    active === item.id
                      ? {
                          color: "var(--sm-primary)",
                          background: "color-mix(in srgb, var(--sm-primary) 10%, transparent)",
                        }
                      : undefined
                  }
                >
                  {item.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="px-10 py-10">
          {/* Mobile nav */}
          <div className="mb-6 lg:hidden">
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

          {/* Breadcrumb */}
          <div className="mb-8 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Stack Management</span>
            <span className="opacity-40">/</span>
            <span>{NAV.find((n) => n.id === active)?.group}</span>
            <span className="opacity-40">/</span>
            <span style={{ color: "var(--sm-primary)" }}>
              {NAV.find((n) => n.id === active)?.title}
            </span>
          </div>

          {/* Section content */}
          <div>{SECTIONS[active]}</div>

          {/* Prev / Next */}
          <div className="mt-16 flex justify-between border-t border-border pt-8">
            <div>
              {prev && (
                <button
                  onClick={() => setActive(prev.id)}
                  className="group flex flex-col text-left"
                >
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    Previous
                  </span>
                  <span
                    className="mt-1 text-sm font-medium group-hover:underline"
                    style={{ color: "var(--sm-primary)" }}
                  >
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
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    Next
                  </span>
                  <span
                    className="mt-1 text-sm font-medium group-hover:underline"
                    style={{ color: "var(--sm-primary)" }}
                  >
                    {next.title} →
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
