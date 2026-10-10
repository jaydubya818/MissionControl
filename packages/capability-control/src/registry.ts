import type { CapabilityDescriptor, CapabilityGroup, CapabilityRegistry } from './types.ts';

const groups: readonly CapabilityGroup[] = ['Personal Assistant', 'Agents and Automation', 'Computer and Tools',
  'Software Development', 'Enterprise Engineering', 'Communication', 'Advanced'];

export function createRegistry(version: string, descriptors: readonly CapabilityDescriptor[]): CapabilityRegistry {
  if (!version.trim() || !descriptors.length) throw new Error('Registry version and descriptors are required.');
  const ids = new Set<string>();
  for (const item of descriptors) {
    if (!/^[a-z][a-z0-9.-]*$/.test(item.id) || ids.has(item.id)) throw new Error(`Invalid or duplicate capability: ${item.id}`);
    if (![item.version, item.name, item.owningSystem, item.description].every(value => value?.trim())) throw new Error(`Incomplete descriptor: ${item.id}`);
    if (!groups.includes(item.group) || !['ENABLED', 'DISABLED'].includes(item.ordinaryDefault)
      || item.revocationBehavior !== 'FENCE_WRITERS_STOP_RESOURCES_PRESERVE_UNKNOWN'
      || typeof item.experimental !== 'boolean') throw new Error(`Invalid descriptor: ${item.id}`);
    for (const entries of [item.dependencies, item.alternativeDependencies, item.environments, item.requiredPermissions, item.setupRequirements, item.qualificationRequirements]) {
      if (!Array.isArray(entries) || entries.some(value => typeof value !== 'string' || !value.trim())
        || new Set(entries).size !== entries.length) throw new Error(`Invalid descriptor list: ${item.id}`);
    }
    if (!item.environments.length || item.environments.some(value => !['development', 'qualification', 'production'].includes(value))) throw new Error(`Invalid environments: ${item.id}`);
    ids.add(item.id);
  }
  const byId = new Map(descriptors.map(item => [item.id, item]));
  const done = new Set<string>();
  const visiting = new Set<string>();
  function visit(id: string): void {
    if (done.has(id)) return;
    const item = byId.get(id);
    if (!item || visiting.has(id)) throw new Error(`Missing or cyclic dependency: ${id}`);
    visiting.add(id);
    item.dependencies.forEach(visit);
    item.alternativeDependencies.forEach(visit);
    visiting.delete(id);
    done.add(id);
  }
  descriptors.forEach(item => visit(item.id));
  return Object.freeze({ version, capabilities: Object.freeze(descriptors.map(item => Object.freeze({ ...item,
    dependencies: Object.freeze([...item.dependencies]), environments: Object.freeze([...item.environments]),
    alternativeDependencies: Object.freeze([...item.alternativeDependencies]),
    requiredPermissions: Object.freeze([...item.requiredPermissions]), setupRequirements: Object.freeze([...item.setupRequirements]),
    qualificationRequirements: Object.freeze([...item.qualificationRequirements]),
  }))) });
}

type Entry = readonly [id: string, name: string, system: string, group: CapabilityGroup, description: string,
  dependencies: readonly string[], setup: readonly string[], qualification: readonly string[], permissions: readonly string[]];

const entries: readonly Entry[] = [
  ['sofie.chat', 'Sofie Chat', 'MyEve', 'Personal Assistant', 'Converse with the owner through authenticated Sofie sessions.', [], ['owner-session', 'model-route'], ['chat-route'], ['chat.use']],
  ['memory', 'Memory', 'MyEve', 'Personal Assistant', 'Read and manage owner-scoped long-term memory.', [], ['memory-store'], ['memory-isolation'], ['memory.read', 'memory.write']],
  ['files', 'Files', 'MyEve', 'Personal Assistant', 'Read and manage private owner files.', [], ['file-store'], ['file-isolation'], ['files.read', 'files.write']],
  ['goals', 'Goals', 'MyEve', 'Personal Assistant', 'Manage owner goals and their progress.', [], ['owner-store'], ['owner-isolation'], ['goals.manage']],
  ['tasks', 'Tasks', 'MyEve', 'Personal Assistant', 'Manage owner tasks and explicit lifecycle transitions.', [], ['owner-store'], ['owner-isolation'], ['tasks.manage']],
  ['work', 'Work', 'MyEve', 'Personal Assistant', 'Inspect and manage bounded Work contracts.', [], ['work-store'], ['work-authority'], ['work.manage']],
  ['inbox', 'Inbox', 'MyEve', 'Personal Assistant', 'Review incoming requests under owner policy.', [], ['inbox-store'], ['inbox-admission'], ['inbox.manage']],
  ['sofie.native', 'Sofie Native Execution', 'MyEve', 'Agents and Automation', 'Run Sofie against an exact authorized Work contract.', ['work'], ['native-runtime'], ['native-runtime'], ['work.execute']],
  ['agents.persistent', 'Persistent Agents', 'MyEve', 'Agents and Automation', 'Manage persistent agents with bounded grants.', [], ['agent-store'], ['agent-isolation'], ['agents.manage']],
  ['agents.subagents', 'Ephemeral Subagents', 'MyEve', 'Agents and Automation', 'Delegate within current parent Work authority.', ['work'], ['agent-runtime'], ['parent-child-authority'], ['agents.delegate']],
  ['role-packs', 'Role Packs', 'MyEve', 'Agents and Automation', 'Apply role instructions without expanding tool authority.', ['agents.persistent'], ['role-pack-registry'], ['role-pack-trust'], ['roles.use']],
  ['myskills', 'MySkills', 'MySkills', 'Agents and Automation', 'Use qualified Skill profiles within current permissions.', [], ['skill-registry'], ['skill-profile-trust'], ['skills.execute']],
  ['routines', 'Routines', 'MyEve', 'Agents and Automation', 'Schedule and run approved recurring Work.', ['work'], ['routine-store'], ['routine-release'], ['routines.execute']],
  ['computer', 'Computer Access', 'MyEve', 'Computer and Tools', 'Request computer use in an authorized execution environment.', [], ['computer-environment'], ['computer-environment'], ['computer.use']],
  ['computer.local', 'Local Computer', 'MyEve', 'Computer and Tools', 'Use an explicitly authorized local computer.', ['computer'], ['local-computer-connection'], ['local-computer'], ['computer.local']],
  ['computer.cloud', 'Cloud Computer', 'MyEve', 'Computer and Tools', 'Use a bounded cloud computer session.', ['computer'], ['cloud-computer-connection'], ['cloud-computer'], ['computer.cloud']],
  ['sofie.local-harness', 'Sofie Local Harness', 'MyEve', 'Computer and Tools', 'Select a qualified local execution route.', [], ['local-harness'], ['local-harness-route'], ['harness.local']],
  ['sofie.cloud-harness', 'Sofie Cloud Harness', 'MyEve', 'Computer and Tools', 'Select a qualified cloud execution route.', [], ['cloud-harness'], ['cloud-harness-route'], ['harness.cloud']],
  ['deepagents', 'DeepAgents', 'MyEve', 'Computer and Tools', 'Run DeepAgents on an explicitly qualified harness route.', ['work'], ['deepagents-harness-route'], ['deepagents-harness-route'], ['deepagents.execute']],
  ['connected-apps', 'Connected Apps', 'Relay', 'Computer and Tools', 'Use owner-connected integrations with scoped permissions.', [], ['integration-connection'], ['integration-policy'], ['integrations.use']],
  ['myfactory', 'MyFactory', 'MyFactory', 'Software Development', 'Admit bounded software development Work to MyFactory.', ['work'], ['factory-installation'], ['factory-integration'], ['factory.admit']],
  ['myapps', 'MyApps', 'MyApps', 'Software Development', 'Install and run apps through qualified runtime contracts.', [], ['app-installation'], ['app-runtime', 'app-installation-contract'], ['apps.install', 'apps.run']],
  ['repositories', 'Repository Access', 'MyFactory', 'Software Development', 'Access exact repositories allowed by current Work.', [], ['repository-connection'], ['repository-scope'], ['repositories.use']],
  ['development-tools', 'Development Tools', 'MyFactory', 'Software Development', 'Run development tools inside an authorized environment.', [], ['development-environment'], ['development-environment'], ['development.execute']],
  ['missioncontrol', 'MissionControl', 'MissionControl', 'Enterprise Engineering', 'Route enterprise Missions through qualified integration.', ['work'], ['enterprise-integration'], ['enterprise-integration'], ['enterprise.admit']],
  ['enterprise.missions', 'Enterprise Missions', 'MissionControl', 'Enterprise Engineering', 'Create and govern enterprise Missions.', ['missioncontrol'], ['mission-store'], ['mission-governance'], ['missions.manage']],
  ['enterprise.teams', 'Engineering Teams', 'MissionControl', 'Enterprise Engineering', 'Coordinate engineering teams under project governance.', ['missioncontrol'], ['team-membership'], ['team-governance'], ['teams.manage']],
  ['enterprise.fleet', 'Factory Fleet', 'MissionControl', 'Enterprise Engineering', 'Coordinate qualified factories with bounded WorkOrders.', ['missioncontrol'], ['fleet-registry'], ['fleet-integration'], ['fleet.manage']],
  ['relay', 'Relay', 'Relay', 'Communication', 'Communicate through authenticated Relay identities.', [], ['relay-identity'], ['relay-integration'], ['relay.use']],
  ['email', 'Email', 'Relay', 'Communication', 'Read or send email under exact integration permissions.', ['connected-apps'], ['email-connection'], ['email-integration'], ['email.use']],
  ['agent-communication', 'Agent Communication', 'Relay', 'Communication', 'Exchange scoped agent messages through Relay.', ['relay'], ['peer-relationship'], ['peer-policy'], ['agents.communicate']],
  ['proof-of-work', 'Proof of Work', 'MissionControl', 'Advanced', 'Inspect evidence tied to exact Work and execution revisions.', [], ['evidence-store'], ['evidence-integrity'], ['evidence.read']],
  ['publication', 'Publication', 'MyEve', 'Advanced', 'Publish only through separately approved publication authority.', ['work'], ['publication-target'], ['publication-contract'], ['publication.execute']],
  ['diagnostics', 'Advanced Diagnostics', 'MyEve', 'Advanced', 'Inspect scoped operational diagnostics without exposing credentials.', [], ['diagnostic-store'], ['diagnostic-redaction'], ['diagnostics.read']],
  ['experimental', 'Experimental Features', 'MyEve', 'Advanced', 'Discover experimental features and their current limitations.', [], ['feature-registry'], ['feature-disclosure'], ['experimental.inspect']],
  ['qualification-reports', 'Qualification Reports', 'MyEve', 'Advanced', 'Inspect current qualification evidence and incomplete gates.', [], ['qualification-store'], ['qualification-integrity'], ['qualification.read']],
];

const ordinaryEnabled = new Set(['sofie.chat', 'files', 'goals', 'tasks', 'inbox']);
export const capabilityRegistry = createRegistry('1', entries.map(([id, name, owningSystem, group, description, dependencies,
  setupRequirements, qualificationRequirements, requiredPermissions]) => ({
  id, version: '1', name, owningSystem, group, description, dependencies,
  alternativeDependencies: id === 'deepagents' ? ['sofie.local-harness', 'sofie.cloud-harness'] : [],
  setupRequirements, qualificationRequirements, requiredPermissions,
  environments: ['development', 'qualification', 'production'],
  ordinaryDefault: ordinaryEnabled.has(id) ? 'ENABLED' : 'DISABLED',
  experimental: ['deepagents', 'experimental'].includes(id),
  revocationBehavior: 'FENCE_WRITERS_STOP_RESOURCES_PRESERVE_UNKNOWN',
})));
