import { getContacts } from "@/lib/db/queries";
import ContactsTable from "./ContactsTable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contacts | Funded Capital Lending OS",
};

export default async function ContactsPage() {
  const rows = await getContacts();

  const withDeals = rows.filter((r) => r.deals > 0).length;
  const unreachable = rows.filter((r) => !r.phone && !r.email).length;

  return (
    <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Contacts</h1>
        <p className="mt-1 text-sm text-slate-500">
          {rows.length.toLocaleString("en-US")} people · {withDeals.toLocaleString("en-US")} have had a deal
          {unreachable > 0 && ` · ${unreachable.toLocaleString("en-US")} with no email or phone`}
        </p>
      </header>

      <ContactsTable rows={rows} />
    </main>
  );
}
