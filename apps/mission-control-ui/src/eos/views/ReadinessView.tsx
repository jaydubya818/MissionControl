import { PageHeader } from "../../components/factory/DetailLayout";
import { ProvenanceBadge } from "../components";

export interface ReadinessViewProps {
  onNavigate: (view: string) => void;
}

export function ReadinessView({ onNavigate }: ReadinessViewProps): JSX.Element {
  void onNavigate;
  return (
    <div className="relative flex-1 overflow-auto bg-app">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
        <PageHeader title="Readiness" description="Engineering OS preview — under construction in this slice." />
        <ProvenanceBadge provenance="preview" />
      </div>
    </div>
  );
}
