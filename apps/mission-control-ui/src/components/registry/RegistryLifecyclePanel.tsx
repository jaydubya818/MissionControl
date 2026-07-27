import { RegistryContextLifecycle } from "./RegistryContextLifecycle";
import { RegistryEngineerProblems } from "./RegistryEngineerProblems";
import { RegistryEnablementFramework } from "./RegistryEnablementFramework";
import { RegistryEvalBuckets } from "./RegistryEvalBuckets";
import { RegistrySkillPitfallsGuide } from "./RegistrySkillPitfalls";

/** Context CDL hub — lifecycle, problems, pitfalls, enablement (Baptiste Fernandez talk). */
export function RegistryLifecyclePanel(): JSX.Element {
  return (
    <div className="flex flex-col gap-10 pb-6">
      <RegistryContextLifecycle />
      <RegistryEngineerProblems />
      <RegistryEvalBuckets />
      <RegistrySkillPitfallsGuide />
      <RegistryEnablementFramework />
    </div>
  );
}
