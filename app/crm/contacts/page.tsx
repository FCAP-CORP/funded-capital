import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isCrmStaff } from "@/lib/crm/access";
import { getContacts } from "@/lib/db/queries";
import ContactsTable from "./ContactsTable";
import { GridSkeleton } from "../Skeleton";

// No route segment config — see the note in app/crm/page.tsx. Cache Components
// makes this page a static shell with the data streaming into the boundary.

export const metadata = {
  title: "Contacts | Funded Capital Lending OS",
};

async function Contacts() {
  // See the note in app/crm/page.tsx — the page gates its own query.
  if (!(await isCrmStaff())) notFound();

  const rows = await getContacts();

  const withDeals = rows.filter((r) => r.deals > 0).length;
  const unreachable = rows.filter((r) => !r.phone && !r.email).length;

  return (
    <>
      <p className="-mt-4 mb-6 text-sm text-slate-500">
        {rows.length.toLocaleString("en-US")} people · {withDeals.toLocaleString("en-US")} have had a deal
        {unreachable > 0 && ` · ${unreachable.toLocaleString("en-US")} with no email or phone`}
      </p>
      <ContactsTable rows={rows} />
    </>
  );
}

export default function ContactsPage() {
  return (
    <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Contacts</h1>
      </header>

      <Suspense fallback={<GridSkeleton />}>
        <Contacts />
      </Suspense>
    </main>
  );
}
