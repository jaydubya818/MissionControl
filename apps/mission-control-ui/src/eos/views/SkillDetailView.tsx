import { PageHeader } from "../../components/factory/DetailLayout";

export interface SkillDetailViewProps {
  onNavigate: (view: string) => void;
}

export function SkillDetailView({ onNavigate }: SkillDetailViewProps): JSX.Element {
  void onNavigate;
  return (
    <div className="relative flex-1 overflow-auto bg-app">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-8 py-6">
        <PageHeader title="Skill detail" description="Under construction." />
      </div>
    </div>
  );
}
