import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, FileCheck2, ShieldCheck } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "../../components/factory/badges";
import { ExperienceLevelSelector } from "../../factoryExperience/ExperienceLevelSelector";
import { getFactoryRecipe } from "../../factoryExperience/recipeCatalog";
import { useFactoryExperienceLevel } from "../../factoryExperience/useFactoryExperienceLevel";
import {
  defaultProjectConstitution,
  emptyMissionSpec,
  evaluationForRevision,
  finalizationForRevision,
  hydrateChecklistDispositions,
  missionSpecCompleteness,
  missionSpecWithCurrentMissionScope,
  missionSpecValuesEqual,
  nextMissionSpecId,
  type MissionSpecValues,
} from "../missionSpecModel";
import { factoryRecipeIdFromMission } from "../missionPlanModel";
import { SharedBuilderIntentPanel } from "./SharedBuilderIntentPanel";

const actionKey = (action: string) =>
  `ui-mission-spec:${action}:${crypto.randomUUID()}`;

type MissionSpecArrayKey = {
  [Key in keyof MissionSpecValues]: MissionSpecValues[Key] extends unknown[]
    ? Key
    : never;
}[keyof MissionSpecValues];

type MissionSpecArrayItem<Key extends MissionSpecArrayKey> =
  MissionSpecValues[Key] extends Array<infer Item> ? Item : never;

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
          {description ? (
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StableId({ value }: { value: string }) {
  return (
    <span className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
      {value}
    </span>
  );
}

function ChoiceList({
  label,
  values,
  selected,
  disabled,
  onChange,
}: {
  label: string;
  values: Array<{ id: string; label: string }>;
  selected: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="rounded-lg border border-line p-3">
      <legend className="px-1 text-[11px] font-medium text-ink-muted">
        {label}
      </legend>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {values.length ? (
          values.map((value) => (
            <label
              key={value.id}
              className="flex items-start gap-2 text-xs text-ink-secondary"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                disabled={disabled}
                checked={selected.includes(value.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, value.id]
                      : selected.filter((id) => id !== value.id),
                  )
                }
              />
              <span>
                <span className="font-mono text-[10px] text-ink-muted">
                  {value.id}
                </span>{" "}
                {value.label}
              </span>
            </label>
          ))
        ) : (
          <div className="text-xs text-ink-muted">
            Create the referenced records first.
          </div>
        )}
      </div>
    </fieldset>
  );
}

function SpecEditor({
  values,
  disabled,
  intermediate,
  onChange,
}: {
  values: MissionSpecValues;
  disabled: boolean;
  intermediate: boolean;
  onChange: (next: MissionSpecValues) => void;
}) {
  const updateArray = <Key extends MissionSpecArrayKey>(
    key: Key,
    index: number,
    patch: Partial<MissionSpecArrayItem<Key>>,
  ) => {
    const items = [...values[key]] as MissionSpecArrayItem<Key>[];
    items[index] = Object.assign(
      {},
      items[index],
      patch,
    ) as MissionSpecArrayItem<Key>;
    onChange({ ...values, [key]: items });
  };
  const removeArray = <Key extends MissionSpecArrayKey>(
    key: Key,
    index: number,
  ) => {
    onChange({
      ...values,
      [key]: values[key].filter((_, itemIndex) => itemIndex !== index),
    });
  };
  const add = <Key extends MissionSpecArrayKey>(
    key: Key,
    item: MissionSpecArrayItem<Key>,
  ) => {
    onChange({ ...values, [key]: [...values[key], item] });
  };
  const requirements = [
    ...values.requirements,
    ...values.nonFunctionalRequirements,
  ];

  return (
    <div className="space-y-5">
      <Panel
        title="Problem and intended outcome"
        description="State the user problem, the resulting condition, and how completion will be measured."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="spec-problem">Problem</Label>
            <Textarea
              id="spec-problem"
              disabled={disabled}
              value={values.problem}
              onChange={(event) =>
                onChange({ ...values, problem: event.target.value })
              }
              placeholder="What is failing or missing for the operator today?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="spec-outcome">Outcome</Label>
            <Textarea
              id="spec-outcome"
              disabled={disabled}
              value={values.outcome}
              onChange={(event) =>
                onChange({ ...values, outcome: event.target.value })
              }
              placeholder="What observable condition should be true when this ships?"
            />
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label>Measurable outcomes</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                add("measurableOutcomes", {
                  id: nextMissionSpecId(values, "OUTCOME"),
                  description: "",
                  metric: "",
                  target: "",
                })
              }
            >
              Add outcome
            </Button>
          </div>
          {values.measurableOutcomes.map((item, index) => (
            <div
              key={item.id}
              className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[auto_1fr_1fr_1fr_auto]"
            >
              <StableId value={item.id} />
              <Input
                aria-label={`${item.id} description`}
                disabled={disabled}
                value={item.description}
                onChange={(event) =>
                  updateArray("measurableOutcomes", index, {
                    description: event.target.value,
                  })
                }
                placeholder="Observable result"
              />
              <Input
                aria-label={`${item.id} metric`}
                disabled={disabled}
                value={item.metric}
                onChange={(event) =>
                  updateArray("measurableOutcomes", index, {
                    metric: event.target.value,
                  })
                }
                placeholder="Metric"
              />
              <Input
                aria-label={`${item.id} target`}
                disabled={disabled}
                value={item.target}
                onChange={(event) =>
                  updateArray("measurableOutcomes", index, {
                    target: event.target.value,
                  })
                }
                placeholder="Target"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => removeArray("measurableOutcomes", index)}
              >
                Remove
              </Button>
            </div>
          ))}
          {!values.measurableOutcomes.length ? (
            <p className="text-xs text-ink-muted">
              Add at least one measurable result. “Done” is not measurable by
              itself.
            </p>
          ) : null}
        </div>
      </Panel>

      <Panel
        title="People and scenarios"
        description="Tie each user story to a stable persona and at least one Given / When / Then scenario."
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              add("personas", {
                id: nextMissionSpecId(values, "PERSONA"),
                name: "",
                needs: "",
              })
            }
          >
            Add persona
          </Button>
        }
      >
        <div className="space-y-3">
          {values.personas.map((persona, index) => (
            <div
              key={persona.id}
              className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[auto_1fr_2fr_auto]"
            >
              <StableId value={persona.id} />
              <Input
                aria-label={`${persona.id} name`}
                disabled={disabled}
                value={persona.name}
                onChange={(event) =>
                  updateArray("personas", index, { name: event.target.value })
                }
                placeholder="Persona"
              />
              <Input
                aria-label={`${persona.id} needs`}
                disabled={disabled}
                value={persona.needs}
                onChange={(event) =>
                  updateArray("personas", index, { needs: event.target.value })
                }
                placeholder="What this person needs"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => removeArray("personas", index)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between">
          <Label>User stories</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || !values.personas.length}
            onClick={() =>
              add("userStories", {
                id: nextMissionSpecId(values, "STORY"),
                personaId: values.personas[0]?.id ?? "",
                title: "",
                outcome: "",
                priority: "P1",
                scenarios: [],
              })
            }
          >
            Add story
          </Button>
        </div>
        <div className="mt-3 space-y-3">
          {values.userStories.map((story, storyIndex) => (
            <article
              key={story.id}
              className="rounded-lg border border-line p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <StableId value={story.id} />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => removeArray("userStories", storyIndex)}
                >
                  Remove story
                </Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Input
                  aria-label={`${story.id} title`}
                  disabled={disabled}
                  value={story.title}
                  onChange={(event) =>
                    updateArray("userStories", storyIndex, {
                      title: event.target.value,
                    })
                  }
                  placeholder="Story title"
                />
                <select
                  aria-label={`${story.id} persona`}
                  disabled={disabled}
                  value={story.personaId}
                  onChange={(event) =>
                    updateArray("userStories", storyIndex, {
                      personaId: event.target.value,
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {values.personas.map((persona) => (
                    <option key={persona.id} value={persona.id}>
                      {persona.id} · {persona.name || "Unnamed"}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`${story.id} priority`}
                  disabled={disabled}
                  value={story.priority}
                  onChange={(event) =>
                    updateArray("userStories", storyIndex, {
                      priority: event.target
                        .value as MissionSpecValues["userStories"][number]["priority"],
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {["P0", "P1", "P2"].map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
                <Textarea
                  className="sm:col-span-3"
                  aria-label={`${story.id} outcome`}
                  disabled={disabled}
                  value={story.outcome}
                  onChange={(event) =>
                    updateArray("userStories", storyIndex, {
                      outcome: event.target.value,
                    })
                  }
                  placeholder="What outcome does this story create?"
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs font-medium text-ink">Scenarios</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    updateArray("userStories", storyIndex, {
                      scenarios: [
                        ...story.scenarios,
                        {
                          id: nextMissionSpecId(values, "SCENARIO"),
                          given: "",
                          when: "",
                          then: "",
                        },
                      ],
                    })
                  }
                >
                  Add scenario
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {story.scenarios.map((scenario, scenarioIndex) => (
                  <div
                    key={scenario.id}
                    className="grid gap-2 rounded-md bg-surface-2 p-2 sm:grid-cols-[auto_1fr_1fr_1fr_auto]"
                  >
                    <StableId value={scenario.id} />
                    <Input
                      aria-label={`${scenario.id} given`}
                      disabled={disabled}
                      value={scenario.given}
                      onChange={(event) => {
                        const scenarios = [...story.scenarios];
                        scenarios[scenarioIndex] = {
                          ...scenario,
                          given: event.target.value,
                        };
                        updateArray("userStories", storyIndex, { scenarios });
                      }}
                      placeholder="Given"
                    />
                    <Input
                      aria-label={`${scenario.id} when`}
                      disabled={disabled}
                      value={scenario.when}
                      onChange={(event) => {
                        const scenarios = [...story.scenarios];
                        scenarios[scenarioIndex] = {
                          ...scenario,
                          when: event.target.value,
                        };
                        updateArray("userStories", storyIndex, { scenarios });
                      }}
                      placeholder="When"
                    />
                    <Input
                      aria-label={`${scenario.id} then`}
                      disabled={disabled}
                      value={scenario.then}
                      onChange={(event) => {
                        const scenarios = [...story.scenarios];
                        scenarios[scenarioIndex] = {
                          ...scenario,
                          then: event.target.value,
                        };
                        updateArray("userStories", storyIndex, { scenarios });
                      }}
                      placeholder="Then"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() =>
                        updateArray("userStories", storyIndex, {
                          scenarios: story.scenarios.filter(
                            (_, index) => index !== scenarioIndex,
                          ),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Panel>

      {intermediate ? (
        <>
          <Panel
            title="Requirements"
            description="Functional and non-functional requirements retain stable IDs and story lineage."
            action={
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    add("requirements", {
                      id: nextMissionSpecId(values, "REQ"),
                      title: "",
                      description: "",
                      priority: "MUST",
                      sourceStoryIds: [],
                    })
                  }
                >
                  Add requirement
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    add("nonFunctionalRequirements", {
                      id: nextMissionSpecId(values, "NFR"),
                      title: "",
                      description: "",
                      category: "RELIABILITY",
                      priority: "MUST",
                      sourceStoryIds: [],
                    })
                  }
                >
                  Add NFR
                </Button>
              </div>
            }
          >
            <div className="space-y-3">
              {values.requirements.map((item, index) => (
                <article
                  key={item.id}
                  className="rounded-lg border border-line p-3"
                >
                  <div className="flex justify-between">
                    <StableId value={item.id} />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => removeArray("requirements", index)}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
                    <Input
                      aria-label={`${item.id} title`}
                      disabled={disabled}
                      value={item.title}
                      onChange={(event) =>
                        updateArray("requirements", index, {
                          title: event.target.value,
                        })
                      }
                      placeholder="Requirement title"
                    />
                    <Textarea
                      aria-label={`${item.id} description`}
                      disabled={disabled}
                      value={item.description}
                      onChange={(event) =>
                        updateArray("requirements", index, {
                          description: event.target.value,
                        })
                      }
                      placeholder="Clear, testable requirement"
                    />
                    <select
                      aria-label={`${item.id} priority`}
                      disabled={disabled}
                      value={item.priority}
                      onChange={(event) =>
                        updateArray("requirements", index, {
                          priority: event.target
                            .value as MissionSpecValues["requirements"][number]["priority"],
                        })
                      }
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option>MUST</option>
                      <option>SHOULD</option>
                    </select>
                  </div>
                  <div className="mt-3">
                    <ChoiceList
                      label="Source stories"
                      values={values.userStories.map((story) => ({
                        id: story.id,
                        label: story.title,
                      }))}
                      selected={item.sourceStoryIds}
                      disabled={disabled}
                      onChange={(ids) =>
                        updateArray("requirements", index, {
                          sourceStoryIds: ids,
                        })
                      }
                    />
                  </div>
                </article>
              ))}
              {values.nonFunctionalRequirements.map((item, index) => (
                <article
                  key={item.id}
                  className="rounded-lg border border-line p-3"
                >
                  <div className="flex justify-between">
                    <StableId value={item.id} />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() =>
                        removeArray("nonFunctionalRequirements", index)
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input
                      aria-label={`${item.id} title`}
                      disabled={disabled}
                      value={item.title}
                      onChange={(event) =>
                        updateArray("nonFunctionalRequirements", index, {
                          title: event.target.value,
                        })
                      }
                      placeholder="NFR title"
                    />
                    <select
                      aria-label={`${item.id} category`}
                      disabled={disabled}
                      value={item.category}
                      onChange={(event) =>
                        updateArray("nonFunctionalRequirements", index, {
                          category: event.target
                            .value as MissionSpecValues["nonFunctionalRequirements"][number]["category"],
                        })
                      }
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {[
                        "SECURITY",
                        "RELIABILITY",
                        "PERFORMANCE",
                        "ACCESSIBILITY",
                        "PRIVACY",
                        "OPERABILITY",
                        "ARCHITECTURE",
                      ].map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                    <Textarea
                      className="sm:col-span-2"
                      aria-label={`${item.id} description`}
                      disabled={disabled}
                      value={item.description}
                      onChange={(event) =>
                        updateArray("nonFunctionalRequirements", index, {
                          description: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="mt-3">
                    <ChoiceList
                      label="Source stories"
                      values={values.userStories.map((story) => ({
                        id: story.id,
                        label: story.title,
                      }))}
                      selected={item.sourceStoryIds}
                      disabled={disabled}
                      onChange={(ids) =>
                        updateArray("nonFunctionalRequirements", index, {
                          sourceStoryIds: ids,
                        })
                      }
                    />
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <Panel
            title="Acceptance and evidence-bearing verification"
            description="Only verification expectations below can compile into WorkOrder evidence requirements."
            action={
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    add("acceptanceExpectations", {
                      id: nextMissionSpecId(values, "AC"),
                      title: "",
                      description: "",
                      requirementIds: [],
                      verificationExpectationIds: [],
                    })
                  }
                >
                  Add acceptance
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    add("verificationExpectations", {
                      id: nextMissionSpecId(values, "VERIFY"),
                      title: "",
                      description: "",
                      method: "TEST",
                      category: "UNIT_TEST",
                      evidenceCategory: "TEST_RESULT",
                      acceptanceExpectationIds: [],
                      checklistItemIds: [],
                      mandatory: true,
                    })
                  }
                >
                  Add verification
                </Button>
              </div>
            }
          >
            <div className="space-y-3">
              {values.acceptanceExpectations.map((item, index) => (
                <article
                  key={item.id}
                  className="rounded-lg border border-line p-3"
                >
                  <div className="flex justify-between">
                    <StableId value={item.id} />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() =>
                        removeArray("acceptanceExpectations", index)
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input
                      aria-label={`${item.id} title`}
                      disabled={disabled}
                      value={item.title}
                      onChange={(event) =>
                        updateArray("acceptanceExpectations", index, {
                          title: event.target.value,
                        })
                      }
                      placeholder="Acceptance title"
                    />
                    <Textarea
                      aria-label={`${item.id} description`}
                      disabled={disabled}
                      value={item.description}
                      onChange={(event) =>
                        updateArray("acceptanceExpectations", index, {
                          description: event.target.value,
                        })
                      }
                      placeholder="Observable acceptance condition"
                    />
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <ChoiceList
                      label="Requirements"
                      values={requirements.map((requirement) => ({
                        id: requirement.id,
                        label: requirement.title,
                      }))}
                      selected={item.requirementIds}
                      disabled={disabled}
                      onChange={(ids) =>
                        updateArray("acceptanceExpectations", index, {
                          requirementIds: ids,
                        })
                      }
                    />
                    <ChoiceList
                      label="Verification expectations"
                      values={values.verificationExpectations.map(
                        (expectation) => ({
                          id: expectation.id,
                          label: expectation.title,
                        }),
                      )}
                      selected={item.verificationExpectationIds}
                      disabled={disabled}
                      onChange={(ids) =>
                        updateArray("acceptanceExpectations", index, {
                          verificationExpectationIds: ids,
                        })
                      }
                    />
                  </div>
                </article>
              ))}
              {values.verificationExpectations.map((item, index) => (
                <article
                  key={item.id}
                  className="rounded-lg border border-info-accent/25 p-3"
                >
                  <div className="flex justify-between">
                    <div className="flex items-center gap-2">
                      <StableId value={item.id} />
                      <span className="text-[10px] font-medium uppercase tracking-wide text-info-accent">
                        Evidence-bearing
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() =>
                        removeArray("verificationExpectations", index)
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input
                      aria-label={`${item.id} title`}
                      disabled={disabled}
                      value={item.title}
                      onChange={(event) =>
                        updateArray("verificationExpectations", index, {
                          title: event.target.value,
                        })
                      }
                      placeholder="Verification title"
                    />
                    <Textarea
                      aria-label={`${item.id} description`}
                      disabled={disabled}
                      value={item.description}
                      onChange={(event) =>
                        updateArray("verificationExpectations", index, {
                          description: event.target.value,
                        })
                      }
                      placeholder="What execution must prove"
                    />
                    <select
                      aria-label={`${item.id} method`}
                      disabled={disabled}
                      value={item.method}
                      onChange={(event) =>
                        updateArray("verificationExpectations", index, {
                          method: event.target.value as MissionSpecValues["verificationExpectations"][number]["method"],
                        })
                      }
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {[
                        "COMMAND",
                        "TEST",
                        "BROWSER",
                        "MANUAL",
                        "CHECKLIST",
                      ].map((method) => (
                        <option key={method}>{method}</option>
                      ))}
                    </select>
                    <select
                      aria-label={`${item.id} category`}
                      disabled={disabled}
                      value={item.category}
                      onChange={(event) =>
                        updateArray("verificationExpectations", index, {
                          category: event.target.value as MissionSpecValues["verificationExpectations"][number]["category"],
                        })
                      }
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {[
                        "BUILD",
                        "TYPECHECK",
                        "UNIT_TEST",
                        "INTEGRATION_TEST",
                        "CONTRACT_TEST",
                        "SECURITY",
                        "SECRETS",
                        "DEPENDENCY",
                        "POLICY",
                        "CHANGE_BUDGET",
                        "ACCEPTANCE",
                        "INDEPENDENT_REVIEW",
                      ].map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                    <select
                      aria-label={`${item.id} evidence category`}
                      disabled={disabled}
                      value={item.evidenceCategory}
                      onChange={(event) =>
                        updateArray("verificationExpectations", index, {
                          evidenceCategory: event.target.value as MissionSpecValues["verificationExpectations"][number]["evidenceCategory"],
                        })
                      }
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {[
                        "TEST_RESULT",
                        "BUILD_RESULT",
                        "STATIC_ANALYSIS",
                        "SECURITY_SCAN",
                        "COMMAND_LOG",
                        "FILE_DIFF",
                        "SCREENSHOT",
                        "BROWSER_RESULT",
                        "PERFORMANCE_RESULT",
                        "REVIEW_RESULT",
                        "POLICY_RESULT",
                        "CI_RESULT",
                        "RUNTIME_OBSERVATION",
                      ].map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                    <label className="flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-ink-secondary">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={item.mandatory}
                        onChange={(event) =>
                          updateArray("verificationExpectations", index, {
                            mandatory: event.target.checked,
                          })
                        }
                      />
                      Mandatory
                    </label>
                  </div>
                  <div className="mt-3">
                    <ChoiceList
                      label="Acceptance expectations"
                      values={values.acceptanceExpectations.map(
                        (expectation) => ({
                          id: expectation.id,
                          label: expectation.title,
                        }),
                      )}
                      selected={item.acceptanceExpectationIds}
                      disabled={disabled}
                      onChange={(ids) =>
                        updateArray("verificationExpectations", index, {
                          acceptanceExpectationIds: ids,
                        })
                      }
                    />
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <Panel
            title="Definition of done"
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  add("definitionOfDone", {
                    id: nextMissionSpecId(values, "DOD"),
                    description: "",
                    acceptanceExpectationIds: [],
                  })
                }
              >
                Add item
              </Button>
            }
          >
            <div className="space-y-3">
              {values.definitionOfDone.map((item, index) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-line p-3"
                >
                  <div className="flex justify-between">
                    <StableId value={item.id} />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => removeArray("definitionOfDone", index)}
                    >
                      Remove
                    </Button>
                  </div>
                  <Textarea
                    className="mt-3"
                    aria-label={`${item.id} description`}
                    disabled={disabled}
                    value={item.description}
                    onChange={(event) =>
                      updateArray("definitionOfDone", index, {
                        description: event.target.value,
                      })
                    }
                  />
                  <div className="mt-3">
                    <ChoiceList
                      label="Acceptance expectations"
                      values={values.acceptanceExpectations.map(
                        (expectation) => ({
                          id: expectation.id,
                          label: expectation.title,
                        }),
                      )}
                      selected={item.acceptanceExpectationIds}
                      disabled={disabled}
                      onChange={(ids) =>
                        updateArray("definitionOfDone", index, {
                          acceptanceExpectationIds: ids,
                        })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            {(["constraints", "nonGoals"] as const).map((key) => (
              <Panel
                key={key}
                title={key === "constraints" ? "Constraints" : "Non-goals"}
                action={
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      add(key, {
                        id: nextMissionSpecId(
                          values,
                          key === "constraints" ? "CONSTRAINT" : "NONGOAL",
                        ),
                        description: "",
                      })
                    }
                  >
                    Add
                  </Button>
                }
              >
                <div className="space-y-2">
                  {values[key].map((item, index) => (
                    <div
                      key={item.id}
                      className="grid gap-2 rounded-lg border border-line p-2 sm:grid-cols-[auto_1fr_auto]"
                    >
                      <StableId value={item.id} />
                      <Input
                        aria-label={`${item.id} description`}
                        disabled={disabled}
                        value={item.description}
                        onChange={(event) =>
                          updateArray(key, index, {
                            description: event.target.value,
                          })
                        }
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => removeArray(key, index)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </Panel>
            ))}
          </div>

          <Panel
            title="Risks and edge cases"
            action={
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    add("risks", {
                      id: nextMissionSpecId(values, "RISK"),
                      description: "",
                      severity: "MEDIUM",
                      mitigation: "",
                    })
                  }
                >
                  Add risk
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    add("edgeCases", {
                      id: nextMissionSpecId(values, "EDGE"),
                      description: "",
                      expectedBehavior: "",
                    })
                  }
                >
                  Add edge case
                </Button>
              </div>
            }
          >
            <div className="space-y-2">
              {values.risks.map((item, index) => (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-lg border border-line p-2 sm:grid-cols-[auto_2fr_1fr_auto_auto]"
                >
                  <StableId value={item.id} />
                  <Input
                    aria-label={`${item.id} description`}
                    disabled={disabled}
                    value={item.description}
                    onChange={(event) =>
                      updateArray("risks", index, {
                        description: event.target.value,
                      })
                    }
                    placeholder="Risk"
                  />
                  <Input
                    aria-label={`${item.id} mitigation`}
                    disabled={disabled}
                    value={item.mitigation}
                    onChange={(event) =>
                      updateArray("risks", index, {
                        mitigation: event.target.value,
                      })
                    }
                    placeholder="Mitigation"
                  />
                  <select
                    aria-label={`${item.id} severity`}
                    disabled={disabled}
                    value={item.severity}
                    onChange={(event) =>
                      updateArray("risks", index, {
                        severity: event.target.value as MissionSpecValues["risks"][number]["severity"],
                      })
                    }
                    className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((severity) => (
                      <option key={severity}>{severity}</option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => removeArray("risks", index)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {values.edgeCases.map((item, index) => (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-lg border border-line p-2 sm:grid-cols-[auto_1fr_1fr_auto]"
                >
                  <StableId value={item.id} />
                  <Input
                    aria-label={`${item.id} description`}
                    disabled={disabled}
                    value={item.description}
                    onChange={(event) =>
                      updateArray("edgeCases", index, {
                        description: event.target.value,
                      })
                    }
                    placeholder="Edge case"
                  />
                  <Input
                    aria-label={`${item.id} expected behavior`}
                    disabled={disabled}
                    value={item.expectedBehavior}
                    onChange={(event) =>
                      updateArray("edgeCases", index, {
                        expectedBehavior: event.target.value,
                      })
                    }
                    placeholder="Expected behavior"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => removeArray("edgeCases", index)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Repository scope and sources"
            description="Scope is inherited from the Mission. Change it on the Mission definition, then save a new Spec revision."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-ink-muted">
                  Repository ID
                </div>
                <div className="mt-1 rounded-md border border-line bg-surface-2 p-2 font-mono text-xs text-ink-secondary">
                  {values.repositoryScope.repositoryId ?? "Missing"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-ink-muted">
                  Code scopes
                </div>
                <div className="mt-1 rounded-md border border-line bg-surface-2 p-2 font-mono text-xs text-ink-secondary">
                  {values.repositoryScope.codeScopeIds.join(", ") || "Missing"}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Label>Sources</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  add("sources", {
                    id: nextMissionSpecId(values, "SOURCE"),
                    kind: "DOC",
                    label: "",
                    location: "",
                  })
                }
              >
                Add source
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {values.sources.map((item, index) => (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-lg border border-line p-2 sm:grid-cols-[auto_auto_1fr_2fr_auto]"
                >
                  <StableId value={item.id} />
                  <select
                    aria-label={`${item.id} kind`}
                    disabled={disabled}
                    value={item.kind}
                    onChange={(event) =>
                      updateArray("sources", index, {
                        kind: event.target.value as MissionSpecValues["sources"][number]["kind"],
                      })
                    }
                    className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {["REPO", "DOC", "PRD", "ISSUE", "URL"].map((kind) => (
                      <option key={kind}>{kind}</option>
                    ))}
                  </select>
                  <Input
                    aria-label={`${item.id} label`}
                    disabled={disabled}
                    value={item.label}
                    onChange={(event) =>
                      updateArray("sources", index, {
                        label: event.target.value,
                      })
                    }
                    placeholder="Label"
                  />
                  <Input
                    aria-label={`${item.id} location`}
                    disabled={disabled}
                    value={item.location}
                    onChange={(event) =>
                      updateArray("sources", index, {
                        location: event.target.value,
                      })
                    }
                    placeholder="Location"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => removeArray("sources", index)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  );
}

function ChecklistAndClarifications({
  values,
  constitution,
  disabled,
  onChange,
}: {
  values: MissionSpecValues;
  constitution: Doc<"projectConstitutionRevisions">;
  disabled: boolean;
  onChange: (next: MissionSpecValues) => void;
}) {
  const checkItems = constitution?.content?.checklistItems ?? [];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel
        title="Three classified check types"
        description="Requirements quality and governance checks are planning lineage only. They never count as delivery evidence."
      >
        <div className="space-y-2">
          {values.checklistDispositions.map((item, index) => {
            const definition = checkItems.find(
              (candidate) => candidate.id === item.checklistItemId,
            );
            return (
              <div
                key={item.checklistItemId}
                className="rounded-lg border border-line p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <StableId value={item.checklistItemId} />
                      <span className="text-xs font-medium text-ink">
                        {definition?.title ?? "Checklist item"}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-ink-muted">
                      {item.classification.replace(/_/g, " ")}
                    </div>
                  </div>
                  <select
                    aria-label={`${item.checklistItemId} disposition`}
                    disabled={disabled}
                    value={item.disposition}
                    onChange={(event) => {
                      const next = [...values.checklistDispositions];
                      next[index] = {
                        ...item,
                        disposition: event.target
                          .value as MissionSpecValues["checklistDispositions"][number]["disposition"],
                      };
                      onChange({ ...values, checklistDispositions: next });
                    }}
                    className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option>SATISFIED</option>
                    <option>MISSING</option>
                    <option>NOT_APPLICABLE</option>
                  </select>
                </div>
                {item.disposition === "NOT_APPLICABLE" ? (
                  <Input
                    className="mt-2"
                    aria-label={`${item.checklistItemId} reason`}
                    disabled={disabled}
                    value={item.reason ?? ""}
                    onChange={(event) => {
                      const next = [...values.checklistDispositions];
                      next[index] = { ...item, reason: event.target.value };
                      onChange({ ...values, checklistDispositions: next });
                    }}
                    placeholder="Required reason"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel
        title="Deterministic clarifications"
        description="Answering or resolving a clarification is saved only by creating a new immutable Spec revision."
      >
        <div className="space-y-2">
          {values.clarifications.length ? (
            values.clarifications.map((item, index) => (
              <div key={item.id} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between">
                  <StableId value={item.id} />
                  <StatusBadge
                    tone={item.status === "RESOLVED" ? "success" : "warning"}
                  >
                    {item.status}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-xs text-ink-secondary">
                  {item.question}
                </p>
                <Textarea
                  className="mt-2"
                  aria-label={`${item.id} answer`}
                  disabled={disabled}
                  value={item.answer ?? ""}
                  onChange={(event) => {
                    const next = [...values.clarifications];
                    next[index] = {
                      ...item,
                      answer: event.target.value,
                      status: event.target.value.trim() ? "RESOLVED" : "OPEN",
                    };
                    onChange({ ...values, clarifications: next });
                  }}
                  placeholder="Record the exact answer"
                />
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-xs text-ink-muted">
              No saved clarification items. Evaluation findings below provide
              the next exact action.
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

export function MissionSpecificationWorkspace({
  projectId,
  mission,
  plans,
  onOpenPlan,
}: {
  projectId: Id<"projects">;
  mission: Doc<"missions">;
  plans: Doc<"missionPlans">[];
  onOpenPlan: () => void;
}) {
  const [level, setLevel] = useFactoryExperienceLevel();
  const intake = useQuery(api.missionSpecs.getMissionIntake, {
    projectId,
    missionId: mission._id,
  });
  const recipe = getFactoryRecipe(factoryRecipeIdFromMission(mission));
  const createConstitution = useMutation(
    api.missionSpecs.createConstitutionRevision,
  );
  const saveRevision = useMutation(api.missionSpecs.saveMissionSpecRevision);
  const evaluateRevision = useMutation(
    api.missionSpecs.evaluateMissionSpecRevision,
  );
  const finalizeRevision = useMutation(
    api.missionSpecs.finalizeMissionSpecRevision,
  );
  const seedValues = useMemo(
    () =>
      hydrateChecklistDispositions(
        intake?.currentRevision?.content ??
          emptyMissionSpec({ mission, recipe }),
        intake?.currentConstitution,
      ),
    [
      intake?.currentRevision?._id,
      intake?.currentConstitution?._id,
      mission._id,
      recipe?.id,
    ],
  );
  const [values, setValues] = useState<MissionSpecValues>(seedValues);
  const [baseline, setBaseline] = useState<MissionSpecValues>(seedValues);
  const [revising, setRevising] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "working" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  const dirty = !missionSpecValuesEqual(values, baseline);

  useEffect(() => {
    if (!dirty) {
      setValues(missionSpecWithCurrentMissionScope(seedValues, mission));
      setBaseline(seedValues);
      setRevising(false);
    }
  }, [dirty, mission.codeScopeIds, mission.repositoryId, seedValues]);

  if (intake === undefined)
    return (
      <div className="rounded-xl border border-line bg-surface-1 px-4 py-12 text-center text-sm text-ink-muted">
        Loading Specification lineage…
      </div>
    );

  const current = intake.currentRevision;
  const evaluation = evaluationForRevision(intake.evaluations, current?._id);
  const finalization = finalizationForRevision(intake.decisions, current?._id);
  const readOnly = Boolean(finalization) && !revising;
  const completeness = missionSpecCompleteness(values);
  const latestBoundPlan = [...plans]
    .sort((left, right) => right.revisionNumber - left.revisionNumber)
    .find((plan) => plan.missionSpecRevisionId);
  const advanced = level === "advanced";
  const intermediate = level !== "basic";

  const fail = (error: unknown, fallback: string) => {
    setStatus("error");
    setMessage(error instanceof Error ? error.message : fallback);
  };

  async function establishConstitution() {
    setStatus("working");
    setMessage(null);
    try {
      const result = await createConstitution({
        projectId,
        title: "Mission planning Constitution",
        content: defaultProjectConstitution(),
        activate: true,
        expectedCurrentRevisionId: undefined,
        idempotencyKey: actionKey("constitution"),
      });
      setStatus("success");
      setMessage(
        `Constitution revision ${result.revision?.revisionNumber ?? 1} created and activated.`,
      );
    } catch (error) {
      fail(error, "Constitution could not be created.");
    }
  }

  async function save() {
    if (!intake.enabled || !intake.currentConstitution || status === "working")
      return;
    setStatus("working");
    setMessage(null);
    try {
      const result = await saveRevision({
        projectId,
        missionId: mission._id,
        expectedCurrentRevisionId: current?._id,
        content: values,
        idempotencyKey: actionKey("save"),
      });
      setValues(result.revision.content);
      setBaseline(result.revision.content);
      setRevising(false);
      setStatus("success");
      setMessage(
        `Spec revision ${result.revision.revisionNumber} saved. Earlier revisions and bound Plans are unchanged.`,
      );
    } catch (error) {
      fail(
        error,
        "Spec revision could not be saved. Your draft remains in this browser.",
      );
    }
  }

  async function evaluate() {
    if (!current || dirty || status === "working") return;
    setStatus("working");
    setMessage(null);
    try {
      const result = await evaluateRevision({
        projectId,
        missionId: mission._id,
        revisionId: current._id,
        idempotencyKey: actionKey("evaluate"),
      });
      setStatus(result.evaluation.result === "PASS" ? "success" : "error");
      setMessage(
        result.evaluation.result === "PASS"
          ? "Deterministic Spec Quality passed. Finalize makes this exact revision planning-ready only."
          : `${result.evaluation.findings.filter((item) => item.blocking).length} blocking finding(s) must be resolved in a new revision.`,
      );
    } catch (error) {
      fail(error, "Spec evaluation failed.");
    }
  }

  async function finalize() {
    if (
      !current ||
      !evaluation ||
      evaluation.result !== "PASS" ||
      dirty ||
      status === "working"
    )
      return;
    setStatus("working");
    setMessage(null);
    try {
      await finalizeRevision({
        projectId,
        missionId: mission._id,
        revisionId: current._id,
        evaluationId: evaluation._id,
        rationale:
          "Exact deterministic quality evaluation passed; this revision is complete enough to propose for planning.",
        idempotencyKey: actionKey("finalize"),
      });
      setStatus("success");
      setMessage(
        "Spec finalized for planning. No WorkOrder was released and no execution or acceptance authority was granted.",
      );
    } catch (error) {
      fail(error, "Spec revision could not be finalized.");
    }
  }

  if (!intake.currentConstitution) {
    return (
      <div className="space-y-5">
        <div className="flex justify-end">
          <ExperienceLevelSelector compact value={level} onChange={setLevel} />
        </div>
        <Panel
          title="Project Constitution required"
          description="A Constitution is immutable planning lineage. Runtime-enforceable policy remains in governance policies, policy envelopes, Quality Contracts, and Verification Plans."
        >
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck
                className="mt-0.5 h-5 w-5 text-info-accent"
                aria-hidden
              />
              <div>
                <div className="text-sm font-medium text-ink">
                  No active Constitution
                </div>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">
                  Review and create the bounded V1 starter: architecture,
                  security, accessibility, testing, documentation, requirements
                  quality, governance, and evidence-bearing verification remain
                  explicitly separated.
                </p>
              </div>
            </div>
            <Button
              onClick={establishConstitution}
              disabled={!intake.enabled || status === "working"}
            >
              {status === "working"
                ? "Creating…"
                : "Create starter Constitution"}
            </Button>
          </div>
        </Panel>
        {message ? (
          <div
            role={status === "error" ? "alert" : "status"}
            className={`rounded-xl border p-3 text-sm ${status === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-line bg-surface-1 text-ink-secondary"}`}
          >
            {message}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileCheck2 className="h-5 w-5 text-info-accent" aria-hidden />
          <div>
            <div className="text-sm font-semibold text-ink">
              Specification contract
            </div>
            <div className="text-xs text-ink-muted">
              One immutable revision per Save · deterministic evaluation ·
              planning-ready finalization
            </div>
          </div>
        </div>
        <ExperienceLevelSelector compact value={level} onChange={setLevel} />
      </div>

      {!intake.enabled ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-ink-secondary">
          Specification intake is read-only. Enable{" "}
          <code className="font-mono">missions.spec-intake-v1</code> for this
          workspace to create or finalize revisions.
        </div>
      ) : null}
      {message ? (
        <div
          role={status === "error" ? "alert" : "status"}
          className={`rounded-xl border p-3 text-sm ${status === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-line bg-surface-1 text-ink-secondary"}`}
        >
          {message}
        </div>
      ) : null}

      <section className="grid gap-4 rounded-xl border border-line bg-surface-1 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-muted">
            Revision
          </div>
          <div className="mt-1 text-lg font-semibold text-ink">
            {current ? `r${current.revisionNumber}` : "Unsaved"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-muted">
            Status
          </div>
          <div className="mt-1">
            <StatusBadge
              tone={
                finalization
                  ? "success"
                  : evaluation?.result === "PASS"
                    ? "info"
                    : evaluation
                      ? "warning"
                      : "neutral"
              }
            >
              {finalization
                ? "Finalized"
                : evaluation?.result === "PASS"
                  ? "Quality passed"
                  : evaluation
                    ? "Needs revision"
                    : "Not evaluated"}
            </StatusBadge>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-muted">
            Completeness
          </div>
          <div className="mt-1 text-lg font-semibold text-ink">
            {completeness.percentage}%
          </div>
          <div className="text-[10px] text-ink-muted">
            {completeness.complete}/{completeness.total} core sections
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-muted">
            Constitution
          </div>
          <div className="mt-1 text-sm font-medium text-ink">
            r{intake.currentConstitution.revisionNumber}
          </div>
          {advanced ? (
            <div className="truncate font-mono text-[10px] text-ink-muted">
              {intake.currentConstitution.digest}
            </div>
          ) : null}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-muted">
            Next action
          </div>
          <div className="mt-1 text-xs leading-relaxed text-ink-secondary">
            {dirty
              ? "Save a new immutable revision."
              : !current
                ? "Complete and save the first revision."
                : !evaluation
                  ? "Run deterministic quality."
                  : evaluation.result !== "PASS"
                    ? "Resolve blocking findings in a new revision."
                    : !finalization
                      ? "Finalize this exact revision for planning."
                      : latestBoundPlan
                        ? "Inspect the exact bound Plan."
                        : "Create a Plan bound to this exact revision."}
          </div>
        </div>
      </section>

      {evaluation?.findings?.length ? (
        <Panel
          title="Spec Quality findings"
          description="Deterministic, bounded, and ordered. A finding never creates evidence or authorizes execution."
        >
          <ul className="space-y-2">
            {evaluation.findings.map((finding, index) => (
              <li
                key={`${finding.code}:${finding.path}:${index}`}
                className={`rounded-lg border p-3 ${finding.blocking ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={finding.blocking ? "error" : "warning"}>
                      {finding.severity}
                    </StatusBadge>
                    <span className="font-mono text-[10px] text-ink-muted">
                      {finding.code} · {finding.path}
                    </span>
                  </div>
                  {finding.artifactId ? (
                    <StableId value={finding.artifactId} />
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-ink-secondary">
                  {finding.message}
                </p>
                <p className="mt-1 text-xs font-medium text-ink">
                  Next: {finding.nextAction}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : evaluation?.result === "PASS" ? (
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 p-3 text-sm text-ink-secondary">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
          No deterministic Spec Quality findings for this exact revision.
        </div>
      ) : null}

      <SharedBuilderIntentPanel
        projectId={projectId}
        mission={mission}
        currentRevision={current}
      />

      <SpecEditor
        values={values}
        disabled={!intake.enabled || readOnly || status === "working"}
        intermediate={intermediate}
        onChange={(next) => {
          setValues(next);
          setStatus("idle");
          setMessage(null);
        }}
      />
      {intermediate ? (
        <ChecklistAndClarifications
          values={values}
          constitution={intake.currentConstitution}
          disabled={!intake.enabled || readOnly || status === "working"}
          onChange={(next) => {
            setValues(next);
            setStatus("idle");
            setMessage(null);
          }}
        />
      ) : null}

      {advanced ? (
        <>
          <Panel
            title="Immutable revision history"
            description="A newer revision never mutates or silently rebinds an existing Plan."
          >
            <div
              className="overflow-x-auto"
              tabIndex={0}
              aria-label="Immutable Mission Spec revision history"
            >
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="pb-2">Revision</th>
                    <th className="pb-2">Digest</th>
                    <th className="pb-2">Constitution</th>
                    <th className="pb-2">Author</th>
                    <th className="pb-2">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {intake.revisions.map((revision) => {
                    const revisionEvaluation = evaluationForRevision(
                      intake.evaluations,
                      revision._id,
                    );
                    const revisionDecision = finalizationForRevision(
                      intake.decisions,
                      revision._id,
                    );
                    return (
                      <tr key={revision._id}>
                        <td className="py-2 font-medium text-ink">
                          r{revision.revisionNumber}
                        </td>
                        <td className="py-2 font-mono text-[10px] text-ink-muted">
                          {revision.digest}
                        </td>
                        <td className="py-2 font-mono text-[10px] text-ink-muted">
                          {String(revision.projectConstitutionRevisionId)}
                        </td>
                        <td className="py-2 text-ink-secondary">
                          {revision.createdBy}
                        </td>
                        <td className="py-2">
                          <StatusBadge
                            tone={
                              revisionDecision
                                ? "success"
                                : revisionEvaluation?.result === "PASS"
                                  ? "info"
                                  : revisionEvaluation
                                    ? "warning"
                                    : "neutral"
                            }
                          >
                            {revisionDecision
                              ? "FINALIZED"
                              : (revisionEvaluation?.result ?? "UNEVALUATED")}
                          </StatusBadge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel
            title="Requirements coverage matrix"
            description="Deterministic explanation only: Spec requirement → Plan assertion → WorkOrder blueprint → acceptance criterion → verification check."
          >
            {latestBoundPlan?.requirementsCoverageProjection ? (
              <div
                className="overflow-x-auto"
                tabIndex={0}
                aria-label="Mission Spec requirements coverage matrix"
              >
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="pb-2">Requirement</th>
                      <th className="pb-2">Acceptance</th>
                      <th className="pb-2">Plan assertions</th>
                      <th className="pb-2">WorkOrders</th>
                      <th className="pb-2">Criteria</th>
                      <th className="pb-2">Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {latestBoundPlan.requirementsCoverageProjection.rows.map(
                      (row) => (
                        <tr key={row.specRequirementId}>
                          <td className="py-2">
                            <StableId value={row.specRequirementId} />
                          </td>
                          <td className="py-2 font-mono text-[10px]">
                            {row.acceptanceExpectationIds.join(", ")}
                          </td>
                          <td className="py-2 font-mono text-[10px]">
                            {row.planAssertionIds.join(", ")}
                          </td>
                          <td className="py-2 font-mono text-[10px]">
                            {row.workOrderBlueprintIds.join(", ")}
                          </td>
                          <td className="py-2 font-mono text-[10px]">
                            {row.acceptanceCriterionIds.join(", ")}
                          </td>
                          <td className="py-2 font-mono text-[10px]">
                            {row.verificationCheckIds.join(", ")}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-ink-muted">
                Coverage appears after a bound Plan passes submission analysis.
              </div>
            )}
          </Panel>
        </>
      ) : null}

      <div className="sticky bottom-0 z-10 rounded-xl border border-line bg-app/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-ink-muted">
            {dirty
              ? "Unsaved changes are preserved in this browser until you leave."
              : finalization
                ? `Revision ${current.revisionNumber} is read-only and planning-ready.`
                : current
                  ? `Revision ${current.revisionNumber} saved.`
                  : "First revision not yet saved."}
          </div>
          <div className="flex flex-wrap gap-2">
            {finalization && !revising ? (
              <Button
                variant="outline"
                disabled={!intake.enabled}
                onClick={() => {
                  setRevising(true);
                  setMessage(
                    "Editing a copy. Save will create a new revision; existing Plan bindings remain unchanged.",
                  );
                }}
              >
                Revise
              </Button>
            ) : null}
            {!readOnly ? (
              <Button
                variant="outline"
                disabled={!intake.enabled || !dirty || status === "working"}
                onClick={save}
              >
                {status === "working" ? "Working…" : "Save new revision"}
              </Button>
            ) : null}
            <Button
              variant="outline"
              disabled={
                !intake.enabled ||
                !current ||
                dirty ||
                Boolean(finalization) ||
                status === "working"
              }
              onClick={evaluate}
            >
              Evaluate
            </Button>
            {evaluation?.result === "PASS" && !finalization ? (
              <Button
                disabled={!intake.enabled || dirty || status === "working"}
                onClick={finalize}
              >
                Finalize for planning
              </Button>
            ) : null}
            {finalization ? (
              <Button onClick={onOpenPlan}>
                {latestBoundPlan ? "Open bound Plan" : "Create bound Plan"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
