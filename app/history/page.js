import { ProtectedPage } from "@/components/protected-page";
import { PageHeading, Message } from "@/components/ui";

export default function HistoryPage() {
  return <ProtectedPage><div className="container-page"><PageHeading title="Match history" description="Review completed matches and their results." /><Message type="warning">Match-history endpoints have not yet been implemented on the backend branch.</Message><div className="panel mt-5 py-12 text-center"><h2 className="text-lg font-bold text-slate-800">No saved match history available</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Once the backend exposes match-history retrieval, this page can display opponents, winners, match dates, turns and recorded actions.</p></div></div></ProtectedPage>;
}
