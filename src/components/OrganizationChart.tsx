import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mail, Network, Pencil, Phone, Plus, Save, Trash2, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useRealtimeTableChanges } from '../lib/realtime';
import { toProfilePosition, toProfileTitleCase } from '../lib/case';
import { useAuth } from '../lib/useAuth';
import Avatar from './Avatar';

type ChildrenLayout = 'horizontal' | 'vertical';

interface ReportGroup {
  id: string;
  label: string;
  layout: ChildrenLayout;
  member_ids: string[];
}

interface OrgPerson {
  id: string;
  full_name: string | null;
  email: string | null;
  position: string | null;
  contact_phone: string | null;
  avatar_url: string | null;
  is_focal_person: boolean;
  programs: string[] | null;
}

interface OrgPlacement {
  profile_id: string;
  manager_id: string | null;
  chart_label: string | null;
  children_layout: ChildrenLayout;
  report_groups: ReportGroup[] | null;
}

interface SecondarySupervisor {
  profile_id: string;
  supervisor_id: string;
}

interface PositionedPerson extends OrgPerson {
  manager_id: string | null;
  additional_supervisor_ids: string[];
  chart_label: string | null;
  children_layout: ChildrenLayout;
  report_groups: ReportGroup[];
  x: number;
  y: number;
  depth: number;
}

interface LayoutNode {
  person: OrgPerson;
  manager_id: string | null;
  chart_label: string | null;
  children_layout: ChildrenLayout;
  report_groups: ReportGroup[];
  width: number;
  height: number;
  groups: Array<{
    id: string;
    layout: ChildrenLayout;
    x: number;
    width: number;
    height: number;
    children: Array<{ node: LayoutNode; x: number; y: number }>;
  }>;
}

interface ChartConnector {
  manager: PositionedPerson;
  groups: Array<{
    layout: ChildrenLayout;
    x: number;
    width: number;
    reports: PositionedPerson[];
  }>;
}

interface MatrixConnector {
  supervisor: PositionedPerson;
  report: PositionedPerson;
}

type CardSide = 'top' | 'right' | 'bottom' | 'left';

interface Point {
  x: number;
  y: number;
}

interface MatrixConnectorPath {
  key: string;
  path: string;
}

const CARD_WIDTH = 230;
const CARD_HEIGHT = 72;
const HORIZONTAL_GAP = 64;
const VERTICAL_GAP = 104;
const CHART_MARGIN = 32;
const CONNECTOR_PORT_PADDING = 12;
const CONNECTOR_STUB_LENGTH = 18;

function nearestCardSide(card: PositionedPerson, other: PositionedPerson): CardSide {
  const deltaX = other.x + CARD_WIDTH / 2 - (card.x + CARD_WIDTH / 2);
  const deltaY = other.y + CARD_HEIGHT / 2 - (card.y + CARD_HEIGHT / 2);
  if (Math.abs(deltaX) / CARD_WIDTH >= Math.abs(deltaY) / CARD_HEIGHT) {
    return deltaX >= 0 ? 'right' : 'left';
  }
  return deltaY >= 0 ? 'bottom' : 'top';
}

function cardEdgePort(
  card: PositionedPerson,
  side: CardSide,
  index: number,
  count: number,
): Point {
  const fraction = (index + 1) / (count + 1);
  if (side === 'left' || side === 'right') {
    return {
      x: card.x + (side === 'right' ? CARD_WIDTH : 0),
      y: card.y + CONNECTOR_PORT_PADDING
        + fraction * (CARD_HEIGHT - 2 * CONNECTOR_PORT_PADDING),
    };
  }
  return {
    x: card.x + CONNECTOR_PORT_PADDING
      + fraction * (CARD_WIDTH - 2 * CONNECTOR_PORT_PADDING),
    y: card.y + (side === 'bottom' ? CARD_HEIGHT : 0),
  };
}

function offsetFromCard(point: Point, side: CardSide): Point {
  if (side === 'left') return { ...point, x: point.x - CONNECTOR_STUB_LENGTH };
  if (side === 'right') return { ...point, x: point.x + CONNECTOR_STUB_LENGTH };
  if (side === 'top') return { ...point, y: point.y - CONNECTOR_STUB_LENGTH };
  return { ...point, y: point.y + CONNECTOR_STUB_LENGTH };
}

function buildMatrixConnectorPaths(connectors: MatrixConnector[]): MatrixConnectorPath[] {
  const details = connectors.map((connector) => ({
    ...connector,
    key: `${connector.supervisor.id}-${connector.report.id}`,
    sourceSide: nearestCardSide(connector.supervisor, connector.report),
    targetSide: nearestCardSide(connector.report, connector.supervisor),
  }));
  const sourceGroups = new Map<string, typeof details>();
  const targetGroups = new Map<string, typeof details>();

  for (const connector of details) {
    const sourceKey = `${connector.supervisor.id}:${connector.sourceSide}`;
    const sourceGroup = sourceGroups.get(sourceKey) ?? [];
    sourceGroup.push(connector);
    sourceGroups.set(sourceKey, sourceGroup);

    const targetKey = `${connector.report.id}:${connector.targetSide}`;
    const targetGroup = targetGroups.get(targetKey) ?? [];
    targetGroup.push(connector);
    targetGroups.set(targetKey, targetGroup);
  }

  const sourcePorts = new Map<string, { point: Point; side: CardSide }>();
  for (const group of sourceGroups.values()) {
    const side = group[0].sourceSide;
    group.sort((a, b) => side === 'left' || side === 'right'
      ? a.report.y - b.report.y
      : a.report.x - b.report.x);
    group.forEach((connector, index) => {
      sourcePorts.set(connector.key, {
        point: cardEdgePort(connector.supervisor, side, index, group.length),
        side,
      });
    });
  }

  const targetPorts = new Map<string, { point: Point; side: CardSide }>();
  for (const group of targetGroups.values()) {
    const side = group[0].targetSide;
    group.sort((a, b) => side === 'left' || side === 'right'
      ? a.supervisor.y - b.supervisor.y
      : a.supervisor.x - b.supervisor.x);
    group.forEach((connector, index) => {
      targetPorts.set(connector.key, {
        point: cardEdgePort(connector.report, side, index, group.length),
        side,
      });
    });
  }

  return details.map((connector) => {
    const source = sourcePorts.get(connector.key);
    const target = targetPorts.get(connector.key);
    if (!source || !target) return { key: connector.key, path: '' };
    const sourceStub = offsetFromCard(source.point, source.side);
    const targetStub = offsetFromCard(target.point, target.side);
    const midX = (sourceStub.x + targetStub.x) / 2;
    const d = [
      `M ${source.point.x} ${source.point.y}`,
      source.side === 'left' || source.side === 'right'
        ? `H ${sourceStub.x}`
        : `V ${sourceStub.y}`,
      `H ${midX} V ${targetStub.y} H ${targetStub.x}`,
      target.side === 'left' || target.side === 'right'
        ? `H ${target.point.x}`
        : `V ${target.point.y}`,
    ].join(' ');
    return { key: connector.key, path: d };
  });
}

function makeReportGroup(label: string, layout: ChildrenLayout, memberIds: string[] = []): ReportGroup {
  return {
    id: `group-${crypto.randomUUID()}`,
    label,
    layout,
    member_ids: memberIds,
  };
}

function normalizeReportGroups(
  input: ReportGroup[] | null | undefined,
  childIds: string[],
  defaultLayout: ChildrenLayout,
): ReportGroup[] {
  const validChildIds = new Set(childIds);
  const assignedChildIds = new Set<string>();
  const groups = (Array.isArray(input) ? input : [])
    .filter((group) => group && typeof group.id === 'string')
    .map((group, index): ReportGroup => {
      const members = (Array.isArray(group.member_ids) ? group.member_ids : [])
        .filter((id) => validChildIds.has(id) && !assignedChildIds.has(id));
      members.forEach((id) => assignedChildIds.add(id));
      return {
        id: group.id,
        label: typeof group.label === 'string' && group.label.trim()
          ? group.label.trim()
          : `Group ${index + 1}`,
        layout: group.layout === 'vertical' ? 'vertical' : 'horizontal',
        member_ids: members,
      };
    });

  const unassigned = childIds.filter((id) => !assignedChildIds.has(id));
  if (groups.length === 0 && childIds.length > 0) {
    groups.push(makeReportGroup('Group 1', defaultLayout, childIds));
  } else if (unassigned.length > 0) {
    groups.push({
      id: `new-reports-${unassigned[0]}`,
      label: 'New reports',
      layout: defaultLayout,
      member_ids: unassigned,
    });
  }
  return groups;
}

function PersonnelDetailsModal({
  person,
  reports,
  people,
  onClose,
  isSuperAdmin,
  onSave,
}: {
  person: PositionedPerson;
  reports: PositionedPerson[];
  people: PositionedPerson[];
  onClose: () => void;
  isSuperAdmin: boolean;
  onSave: (
    chartLabel: string,
    managerId: string | null,
    additionalSupervisorIds: string[],
    defaultLayout: ChildrenLayout,
    reportGroups: ReportGroup[],
  ) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [chartLabel, setChartLabel] = useState(person.chart_label ?? '');
  const [managerId, setManagerId] = useState(person.manager_id);
  const [additionalSupervisorIds, setAdditionalSupervisorIds] = useState<string[]>(
    person.additional_supervisor_ids.filter((id) => id !== person.manager_id),
  );
  const [defaultLayout, setDefaultLayout] = useState<ChildrenLayout>(person.children_layout);
  const [reportGroups, setReportGroups] = useState<ReportGroup[]>(() =>
    normalizeReportGroups(person.report_groups, reports.map((report) => report.id), person.children_layout),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const descendantIds = useMemo(() => {
    const childrenByManager = new Map<string, string[]>();
    for (const member of people) {
      const supervisorIds = new Set([
        ...(member.manager_id ? [member.manager_id] : []),
        ...member.additional_supervisor_ids,
      ]);
      for (const supervisorId of supervisorIds) {
        const children = childrenByManager.get(supervisorId) ?? [];
        children.push(member.id);
        childrenByManager.set(supervisorId, children);
      }
    }

    const descendants = new Set<string>();
    const pending = [...(childrenByManager.get(person.id) ?? [])];
    while (pending.length > 0) {
      const memberId = pending.pop();
      if (!memberId || descendants.has(memberId)) continue;
      descendants.add(memberId);
      pending.push(...(childrenByManager.get(memberId) ?? []));
    }
    return descendants;
  }, [people, person.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave(
        chartLabel.trim(),
        managerId,
        additionalSupervisorIds.filter((id) => id !== managerId),
        defaultLayout,
        reportGroups,
      );
      setIsEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save chart settings.');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = () => {
    setChartLabel(person.chart_label ?? '');
    setManagerId(person.manager_id);
    setAdditionalSupervisorIds(
      person.additional_supervisor_ids.filter((id) => id !== person.manager_id),
    );
    setDefaultLayout(person.children_layout);
    setReportGroups(normalizeReportGroups(
      person.report_groups,
      reports.map((report) => report.id),
      person.children_layout,
    ));
    setSaveError('');
    setIsEditing((editing) => !editing);
  };

  const addReportGroup = () => {
    setReportGroups((groups) => [
      ...groups,
      makeReportGroup(`Group ${groups.length + 1}`, defaultLayout),
    ]);
  };

  const updateReportGroup = (groupId: string, patch: Partial<ReportGroup>) => {
    setReportGroups((groups) => groups.map((group) =>
      group.id === groupId ? { ...group, ...patch } : group,
    ));
  };

  const removeReportGroup = (groupId: string) => {
    setReportGroups((groups) => {
      const remaining = groups.filter((group) => group.id !== groupId);
      if (remaining.length === 0) return [];
      const removed = groups.find((group) => group.id === groupId);
      return remaining.map((group, index) => index === 0 && removed
        ? { ...group, member_ids: [...group.member_ids, ...removed.member_ids] }
        : group);
    });
  };

  const assignReportToGroup = (reportId: string, groupId: string) => {
    setReportGroups((groups) => groups.map((group) => ({
      ...group,
      member_ids: group.id === groupId
        ? [...group.member_ids.filter((id) => id !== reportId), reportId]
        : group.member_ids.filter((id) => id !== reportId),
    })));
  };

  const reportsById = new Map(reports.map((report) => [report.id, report]));
  const groupByReportId = new Map<string, string>();
  const reportsByGroup = new Map<string, PositionedPerson[]>();
  for (const group of reportGroups) {
    const groupReports: PositionedPerson[] = [];
    for (const reportId of group.member_ids) {
      const report = reportsById.get(reportId);
      if (!report) continue;
      groupReports.push(report);
      groupByReportId.set(reportId, group.id);
    }
    reportsByGroup.set(group.id, groupReports);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Personnel details">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Close personnel details" />
      <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <Avatar name={person.full_name} src={person.avatar_url} size={56} />
            <div className="min-w-0">
              <h2 className="truncate font-bold text-gray-800">
                {toProfileTitleCase(person.full_name) || 'Staff Member'}
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {toProfilePosition(person.position) || 'Position not set'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isSuperAdmin && (
              <button
                type="button"
                onClick={startEditing}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                <Pencil size={15} /> {isEditing ? 'Cancel' : 'Edit'}
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>
        {isEditing ? (
          <div className="space-y-4 px-5 py-5">
            <div>
              <label htmlFor="org-chart-manager" className="mb-1 block text-sm font-medium text-gray-700">
                Reports To / Head
              </label>
              <select
                id="org-chart-manager"
                value={managerId ?? ''}
                onChange={(event) => {
                  const nextManagerId = event.target.value || null;
                  setManagerId(nextManagerId);
                  setAdditionalSupervisorIds((ids) => ids.filter((id) => id !== nextManagerId));
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">No supervisor / Head</option>
                {people
                  .filter((member) => member.id !== person.id && !descendantIds.has(member.id))
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {toProfileTitleCase(member.full_name) || 'Staff Member'}
                      {member.position ? ` — ${toProfilePosition(member.position)}` : ''}
                    </option>
                  ))}
              </select>
            </div>
            <fieldset>
              <legend className="mb-1 block text-sm font-medium text-gray-700">
                Additional supervisors
              </legend>
              <p className="mb-2 text-xs text-gray-500">
                Dashed connectors show matrix-reporting relationships. The primary supervisor controls chart placement.
              </p>
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
                {people
                  .filter((member) =>
                    member.id !== person.id
                    && member.id !== managerId
                    && !descendantIds.has(member.id))
                  .map((member) => (
                    <label key={member.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={additionalSupervisorIds.includes(member.id)}
                        onChange={(event) => setAdditionalSupervisorIds((ids) =>
                          event.target.checked
                            ? [...ids, member.id]
                            : ids.filter((id) => id !== member.id),
                        )}
                        className="rounded border-gray-300 text-blue-700 focus:ring-blue-500"
                      />
                      <span className="min-w-0 truncate text-gray-700">
                        {toProfileTitleCase(member.full_name) || 'Staff Member'}
                        {member.position ? ` — ${toProfilePosition(member.position)}` : ''}
                      </span>
                    </label>
                  ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="org-chart-label" className="mb-1 block text-sm font-medium text-gray-700">
                Chart title / section badge
              </label>
              <input
                id="org-chart-label"
                type="text"
                maxLength={32}
                value={chartLabel}
                onChange={(event) => setChartLabel(event.target.value)}
                placeholder={person.depth === 0 ? 'HEAD' : 'e.g. Finance'}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <p className="mt-1 text-xs text-gray-500">
                {person.depth === 0
                  ? 'Leave blank to show the default HEAD badge.'
                  : 'Leave blank to hide this person’s badge.'}
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label htmlFor="org-chart-default-layout" className="mb-1 block text-sm font-medium text-gray-700">
                  Default for new direct reports
                </label>
                <select
                  id="org-chart-default-layout"
                  value={defaultLayout}
                  onChange={(event) => setDefaultLayout(event.target.value as ChildrenLayout)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="horizontal">Horizontal</option>
                  <option value="vertical">Vertical</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Report groups</h3>
                  <p className="text-xs text-gray-500">
                    Groups sit side by side; people in each group follow its layout.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addReportGroup}
                  className="flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                >
                  <Plus size={14} /> Add group
                </button>
              </div>
              {reportGroups.map((group) => (
                <div key={group.id} className="space-y-2 rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="Group name"
                      value={group.label}
                      maxLength={32}
                      onChange={(event) => updateReportGroup(group.id, { label: event.target.value })}
                      className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    />
                    <select
                      aria-label={`Layout for ${group.label}`}
                      value={group.layout}
                      onChange={(event) =>
                        updateReportGroup(group.id, { layout: event.target.value as ChildrenLayout })
                      }
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      <option value="horizontal">Horizontal</option>
                      <option value="vertical">Vertical</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeReportGroup(group.id)}
                      disabled={reportGroups.length === 1 && reports.length > 0}
                      title="Remove group"
                      aria-label={`Remove ${group.label}`}
                      className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {(reportsByGroup.get(group.id)?.length ?? 0) > 0 ? (
                    <ul className="space-y-1">
                      {reportsByGroup.get(group.id)?.map((report) => (
                          <li key={report.id} className="flex items-center justify-between gap-2 text-xs text-gray-700">
                            <span className="min-w-0 truncate">{toProfileTitleCase(report.full_name) || 'Staff Member'}</span>
                            <span className="shrink-0 capitalize text-gray-400">{group.layout}</span>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-400">No people assigned</p>
                  )}
                </div>
              ))}
              {reports.length > 0 && (
                <div className="space-y-2 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assign each direct report</p>
                  {reports.map((report) => (
                    <label key={report.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-gray-700">
                        {toProfileTitleCase(report.full_name) || 'Staff Member'}
                      </span>
                      <select
                        aria-label={`Group for ${toProfileTitleCase(report.full_name) || 'staff member'}`}
                        value={groupByReportId.get(report.id) ?? ''}
                        onChange={(event) => assignReportToGroup(report.id, event.target.value)}
                        className="max-w-[52%] rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                      >
                        {reportGroups.map((group) => (
                          <option key={group.id} value={group.id}>{group.label || 'Unnamed group'}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {saveError && (
              <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{saveError}</p>
            )}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={16} /> {saving ? 'Saving…' : 'Save chart settings'}
            </button>
          </div>
        ) : (
          <dl className="space-y-4 px-5 py-5">
            <div className="flex items-start gap-3">
              <Mail size={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Email</dt>
                <dd className="break-all text-sm text-gray-800">
                  {person.email ? <a className="text-blue-700 hover:underline" href={`mailto:${person.email}`}>{person.email}</a> : '—'}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone size={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Contact Number</dt>
                <dd className="break-all text-sm text-gray-800">
                  {person.contact_phone ? <a className="text-blue-700 hover:underline" href={`tel:${person.contact_phone}`}>{person.contact_phone}</a> : 'Not provided'}
                </dd>
              </div>
            </div>
            {person.is_focal_person && (
              <div className="flex items-start gap-3">
                <Users size={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Focal Person · Programs</dt>
                  {person.programs?.length ? (
                    <ul className="mt-1 space-y-1 text-sm text-gray-800">
                      {person.programs.map((program, index) => (
                        <li key={`${program}-${index}`} className="break-words">{program}</li>
                      ))}
                    </ul>
                  ) : (
                    <dd className="text-sm text-gray-500">No programs listed</dd>
                  )}
                </div>
              </div>
            )}
          </dl>
        )}
      </div>
    </div>
  );
}

export default function OrganizationChart() {
  const { isSuperAdmin } = useAuth();
  const [people, setPeople] = useState<OrgPerson[]>([]);
  const [placements, setPlacements] = useState<OrgPlacement[]>([]);
  const [secondarySupervisors, setSecondarySupervisors] = useState<SecondarySupervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<PositionedPerson | null>(null);
  const [viewportWidth, setViewportWidth] = useState(900);
  const chartViewportRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    const [peopleResult, placementResult, supervisorResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id,full_name,email,position,contact_phone,avatar_url,is_focal_person,programs')
        .eq('is_approved', true)
        .order('full_name'),
      supabase
        .from('org_chart_positions')
        .select('profile_id,manager_id,chart_label,children_layout,report_groups'),
      supabase
        .from('org_chart_supervisors')
        .select('profile_id,supervisor_id'),
    ]);

    if (peopleResult.error || placementResult.error || supervisorResult.error) {
      const message = peopleResult.error?.message
        ?? placementResult.error?.message
        ?? supervisorResult.error?.message
        ?? 'Could not load the organization chart.';
      setError(
        /contact_phone|is_focal_person|programs|org_chart_positions|org_chart_supervisors|chart_label|children_layout|report_groups|schema cache|does not exist/i.test(message)
          ? 'The organization chart database migrations are not installed. Run the migrations in supabase/organizational_chart_migration.sql, supabase/focal_person_programs_migration.sql, supabase/org_chart_layout_preferences_migration.sql, supabase/org_chart_mixed_report_groups_migration.sql, and supabase/org_chart_multiple_supervisors_migration.sql in Supabase SQL Editor, then reload.'
          : `Could not load the organization chart: ${message}`,
      );
    } else {
      setError('');
      setPeople((peopleResult.data ?? []) as OrgPerson[]);
      setPlacements((placementResult.data ?? []) as OrgPlacement[]);
      setSecondarySupervisors((supervisorResult.data ?? []) as SecondarySupervisor[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const element = chartViewportRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setViewportWidth(element.clientWidth));
    observer.observe(element);
    setViewportWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [loading]);

  useRealtimeTableChanges(
    'organization-chart',
    ['profiles', 'org_chart_positions', 'org_chart_supervisors'],
    fetchData,
    60_000,
  );

  const layout = useMemo(() => {
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const placementById = new Map(
      placements.map((placement) => [placement.profile_id, placement]),
    );
    const managerById = new Map(
      placements.map((placement) => [placement.profile_id, placement.manager_id]),
    );
    const supervisorsByPerson = new Map<string, string[]>();
    for (const relationship of secondarySupervisors) {
      const current = supervisorsByPerson.get(relationship.profile_id) ?? [];
      current.push(relationship.supervisor_id);
      supervisorsByPerson.set(relationship.profile_id, current);
    }
    const childrenByManager = new Map<string, string[]>();
    for (const person of people) {
      const managerId = managerById.get(person.id);
      if (!managerId || !peopleById.has(managerId) || managerId === person.id) continue;
      const children = childrenByManager.get(managerId) ?? [];
      children.push(person.id);
      childrenByManager.set(managerId, children);
    }
    const sortByName = (leftId: string, rightId: string) =>
      (peopleById.get(leftId)?.full_name ?? '').localeCompare(
        peopleById.get(rightId)?.full_name ?? '',
      );
    for (const children of childrenByManager.values()) children.sort(sortByName);

    const visited = new Set<string>();
    const buildSubtree = (
      profileId: string,
      ancestors: Set<string>,
    ): LayoutNode | null => {
      if (ancestors.has(profileId) || visited.has(profileId)) return null;
      const person = peopleById.get(profileId);
      if (!person) return null;

      visited.add(profileId);
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(profileId);
      const children = (childrenByManager.get(profileId) ?? [])
        .map((childId) => buildSubtree(childId, nextAncestors))
        .filter((child): child is LayoutNode => child !== null);
      const placement = placementById.get(profileId);
      const childrenLayout = placement?.children_layout === 'vertical' ? 'vertical' : 'horizontal';
      const childById = new Map(children.map((child) => [child.person.id, child]));
      const reportGroups = normalizeReportGroups(
        placement?.report_groups,
        children.map((child) => child.person.id),
        childrenLayout,
      );
      const groups: LayoutNode['groups'] = reportGroups.flatMap((group) => {
        const groupChildren = group.member_ids
          .map((childId) => childById.get(childId))
          .filter((child): child is LayoutNode => child !== undefined);
        if (groupChildren.length === 0) return [];

        let groupWidth: number;
        let groupHeight: number;
        const childOffsets: LayoutNode['groups'][number]['children'] = [];
        if (group.layout === 'horizontal') {
          groupWidth = groupChildren.reduce((sum, child) => sum + child.width, 0)
            + HORIZONTAL_GAP * (groupChildren.length - 1);
          groupHeight = Math.max(...groupChildren.map((child) => child.height));
          let childX = 0;
          for (const child of groupChildren) {
            childOffsets.push({ node: child, x: childX, y: 0 });
            childX += child.width + HORIZONTAL_GAP;
          }
        } else {
          groupWidth = Math.max(...groupChildren.map((child) => child.width));
          groupHeight = groupChildren.reduce((sum, child) => sum + child.height, 0)
            + VERTICAL_GAP * (groupChildren.length - 1);
          let childY = 0;
          for (const child of groupChildren) {
            childOffsets.push({
              node: child,
              x: (groupWidth - child.width) / 2,
              y: childY,
            });
            childY += child.height + VERTICAL_GAP;
          }
        }
        return [{
          id: group.id,
          layout: group.layout,
          x: 0,
          width: groupWidth,
          height: groupHeight,
          children: childOffsets,
        }];
      });

      let width = CARD_WIDTH;
      let height = CARD_HEIGHT;
      if (groups.length > 0) {
        const groupsWidth = groups.reduce((sum, group) => sum + group.width, 0)
          + HORIZONTAL_GAP * (groups.length - 1);
        width = Math.max(CARD_WIDTH, groupsWidth);
        height += VERTICAL_GAP + Math.max(...groups.map((group) => group.height));
        let groupX = (width - groupsWidth) / 2;
        for (const group of groups) {
          group.x = groupX;
          groupX += group.width + HORIZONTAL_GAP;
        }
      }

      return {
        person,
        manager_id: managerById.get(profileId) ?? null,
        chart_label: placement?.chart_label ?? null,
        children_layout: childrenLayout,
        report_groups: reportGroups,
        width,
        height,
        groups,
      };
    };

    const roots = people
      .filter((person) => {
        const managerId = managerById.get(person.id);
        return !managerId || !peopleById.has(managerId) || managerId === person.id;
      })
      .map((person) => person.id)
      .sort(sortByName);
    const rootNodes = roots
      .map((rootId) => buildSubtree(rootId, new Set()))
      .filter((root): root is LayoutNode => root !== null);
    for (const person of [...people].sort((a, b) => sortByName(a.id, b.id))) {
      if (!visited.has(person.id)) {
        const root = buildSubtree(person.id, new Set());
        if (root) rootNodes.push(root);
      }
    }

    const positionedPeople: PositionedPerson[] = [];
    const connectorGroups: Array<{
      managerId: string;
      groups: Array<{
        layout: ChildrenLayout;
        x: number;
        width: number;
        reportIds: string[];
      }>;
    }> = [];
    const placeNode = (node: LayoutNode, x: number, y: number, depth: number) => {
      const positioned: PositionedPerson = {
        ...node.person,
        manager_id: node.manager_id,
        additional_supervisor_ids: supervisorsByPerson.get(node.person.id) ?? [],
        chart_label: node.chart_label,
        children_layout: node.children_layout,
        report_groups: node.report_groups,
        x: x + (node.width - CARD_WIDTH) / 2,
        y,
        depth,
      };
      positionedPeople.push(positioned);
      if (node.groups.length > 0) {
        connectorGroups.push({
          managerId: positioned.id,
          groups: node.groups.map((group) => ({
            layout: group.layout,
            x: x + group.x,
            width: group.width,
            reportIds: group.children.map(({ node: child }) => child.person.id),
          })),
        });
      }
      for (const group of node.groups) {
        for (const child of group.children) {
          placeNode(
            child.node,
            x + group.x + child.x,
            y + CARD_HEIGHT + VERTICAL_GAP + child.y,
            depth + 1,
          );
        }
      }
    };

    let rootX = CHART_MARGIN;
    for (const root of rootNodes) {
      placeNode(root, rootX, CHART_MARGIN, 0);
      rootX += root.width + HORIZONTAL_GAP;
    }

    const positionedMap = new Map(positionedPeople.map((person) => [person.id, person]));
    const connectors: ChartConnector[] = connectorGroups.flatMap(({ managerId, groups }) => {
      const manager = positionedMap.get(managerId);
      const positionedGroups = groups.flatMap((group) => {
        const reports = group.reportIds
          .map((reportId) => positionedMap.get(reportId))
          .filter((report): report is PositionedPerson => report !== undefined);
        return reports.length > 0
          ? [{ layout: group.layout, x: group.x, width: group.width, reports }]
          : [];
      });
      return manager && positionedGroups.length > 0
        ? [{ manager, groups: positionedGroups }]
        : [];
    });

    const matrixConnectors: MatrixConnector[] = [];
    for (const report of positionedPeople) {
      for (const supervisorId of report.additional_supervisor_ids) {
        const supervisor = positionedMap.get(supervisorId);
        if (!supervisor || supervisor.id === report.manager_id) continue;
        matrixConnectors.push({ supervisor, report });
      }
    }

    return { positionedPeople, connectors, matrixConnectors };
  }, [people, placements, secondarySupervisors]);

  const matrixConnectorPaths = useMemo(
    () => buildMatrixConnectorPaths(layout.matrixConnectors),
    [layout.matrixConnectors],
  );

  const saveChartSettings = async (
    person: PositionedPerson,
    chartLabel: string,
    managerId: string | null,
    additionalSupervisorIds: string[],
    childrenLayout: ChildrenLayout,
    reportGroups: ReportGroup[],
  ) => {
    const availableManagerIds = new Set(layout.positionedPeople.map((member) => member.id));
    const supervisorIds = [...new Set(additionalSupervisorIds)]
      .filter((id) => id !== managerId);
    if ([managerId, ...supervisorIds].some(
      (id) => id && (!availableManagerIds.has(id) || id === person.id),
    )) {
      throw new Error('Choose valid supervisors for this personnel.');
    }

    const childrenByManager = new Map<string, string[]>();
    for (const member of layout.positionedPeople) {
      const currentSupervisors = new Set([
        ...(member.manager_id ? [member.manager_id] : []),
        ...member.additional_supervisor_ids,
      ]);
      for (const currentSupervisorId of currentSupervisors) {
        const children = childrenByManager.get(currentSupervisorId) ?? [];
        children.push(member.id);
        childrenByManager.set(currentSupervisorId, children);
      }
    }

    const descendants = new Set<string>();
    const pending = [...(childrenByManager.get(person.id) ?? [])];
    while (pending.length > 0) {
      const currentId = pending.pop();
      if (!currentId || descendants.has(currentId)) continue;
      descendants.add(currentId);
      pending.push(...(childrenByManager.get(currentId) ?? []));
    }
    if ([managerId, ...supervisorIds].some((id) => id && descendants.has(id))) {
      throw new Error('A person cannot report to someone already below them in the chart.');
    }

    const directReportIds = layout.positionedPeople
      .filter((report) => report.manager_id === person.id)
      .map((report) => report.id);
    const normalizedGroups = normalizeReportGroups(
      reportGroups,
      directReportIds,
      childrenLayout,
    )
      .map((group) => ({
        ...group,
        label: group.label.trim() || 'Unnamed group',
      }));
    const { error: saveError } = await supabase.rpc('save_org_chart_settings', {
      p_profile_id: person.id,
      p_manager_id: managerId,
      p_chart_label: chartLabel || null,
      p_children_layout: childrenLayout,
      p_report_groups: normalizedGroups,
      p_additional_supervisor_ids: supervisorIds,
    });
    if (saveError) throw new Error(saveError.message);

    await fetchData();
    setSelectedPerson((current) => current?.id === person.id
      ? {
          ...current,
          manager_id: managerId,
          additional_supervisor_ids: supervisorIds,
          chart_label: chartLabel || null,
          children_layout: childrenLayout,
          report_groups: normalizedGroups,
        }
      : current);
  };

  const canvasWidth = Math.max(
    800,
    viewportWidth,
    ...layout.positionedPeople.map((person) => person.x + CARD_WIDTH + CHART_MARGIN),
  );
  const canvasHeight = Math.max(
    480,
    ...layout.positionedPeople.map((person) => person.y + CARD_HEIGHT + CHART_MARGIN),
  );

  return (
    <>
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-5">
          <h2 className="flex items-center gap-2 text-xl font-bold text-gray-800">
            <Network size={21} className="text-blue-700" /> Organizational Chart
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Automatically arranged from the head and reporting relationships set in Personnel Management.
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-700" />
          </div>
        ) : layout.positionedPeople.length === 0 ? (
          <div className="grid min-h-[260px] w-full place-items-center rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
            No approved personnel are available to display.
          </div>
        ) : (
          <div
            ref={chartViewportRef}
            id="organization-chart-viewport"
            title="Drag the bottom-right corner to resize the chart area"
            className="w-full min-w-[320px] max-w-full min-h-[240px] overflow-auto rounded-xl border border-gray-200 bg-slate-50"
            style={{ resize: 'both', height: '480px' }}
          >
            <div
              className="relative"
              style={{
                width: `${canvasWidth}px`,
                height: `${canvasHeight}px`,
                backgroundImage:
                  'linear-gradient(to right, rgba(148, 163, 184, 0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.10) 1px, transparent 1px), linear-gradient(to right, rgba(100, 116, 139, 0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(100, 116, 139, 0.22) 1px, transparent 1px)',
                backgroundSize: '8px 8px, 8px 8px, 32px 32px, 32px 32px',
              }}
            >
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                width={canvasWidth}
                height={canvasHeight}
                viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              >
                {layout.connectors.map(({ manager, groups }) => {
                  const parentCenterX = manager.x + CARD_WIDTH / 2;
                  const parentBottom = manager.y + CARD_HEIGHT;
                  const busY = parentBottom + 24;
                  const segments = [`M ${parentCenterX} ${parentBottom} V ${busY}`];
                  for (const group of groups) {
                    if (group.layout === 'vertical') {
                      const reports = [...group.reports].sort((a, b) => a.y - b.y);
                      const trunkX = group.x - 20;
                      const lastReportCenterY = reports[reports.length - 1].y + CARD_HEIGHT / 2;
                      segments.push(
                        `M ${parentCenterX} ${busY} H ${trunkX} V ${lastReportCenterY}`,
                        ...reports.map(
                          (report) => `M ${trunkX} ${report.y + CARD_HEIGHT / 2} H ${report.x}`,
                        ),
                      );
                    } else {
                      const reports = [...group.reports].sort((a, b) => a.x - b.x);
                      const childCenters = reports.map((report) => report.x + CARD_WIDTH / 2);
                      const groupBusY = manager.y + CARD_HEIGHT + VERTICAL_GAP - 24;
                      segments.push(
                        `M ${parentCenterX} ${busY} H ${group.x + group.width / 2} V ${groupBusY}`,
                        `M ${childCenters[0]} ${groupBusY} H ${childCenters[childCenters.length - 1]}`,
                        ...reports.map(
                          (report) => `M ${report.x + CARD_WIDTH / 2} ${groupBusY} V ${report.y}`,
                        ),
                      );
                    }
                  }
                  return (
                    <path
                      key={manager.id}
                      d={segments.join(' ')}
                      fill="none"
                      stroke="#60a5fa"
                      strokeWidth="2"
                    />
                  );
                })}
                {matrixConnectorPaths.map(({ key, path }) => (
                  <path
                    key={key}
                    d={path}
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth="2"
                    strokeDasharray="6 4"
                  />
                ))}
              </svg>
              {layout.positionedPeople.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => setSelectedPerson(person)}
                  aria-label={`${toProfileTitleCase(person.full_name) || 'Staff Member'}${person.position ? `, ${toProfilePosition(person.position)}` : ''}. View personnel details.`}
                  className="absolute z-10 flex h-[72px] w-[230px] items-center gap-3 overflow-hidden rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-blue-400 hover:shadow-md"
                  style={{ left: person.x, top: person.y }}
                >
                  <Avatar name={person.full_name} src={person.avatar_url} size={48} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-800">
                      {toProfileTitleCase(person.full_name) || 'Staff Member'}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-gray-500">
                      {toProfilePosition(person.position) || 'Position not set'}
                    </span>
                  </span>
                  {(person.chart_label?.trim() || (person.depth === 0 ? 'HEAD' : '')) && (
                    <span className="absolute right-2 top-1 rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700">
                      {person.chart_label?.trim() || 'HEAD'}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      {selectedPerson && (
        <PersonnelDetailsModal
          person={selectedPerson}
          reports={layout.positionedPeople.filter((person) => person.manager_id === selectedPerson.id)}
          people={layout.positionedPeople}
          onClose={() => setSelectedPerson(null)}
          isSuperAdmin={isSuperAdmin}
          onSave={(chartLabel, managerId, additionalSupervisorIds, childrenLayout, reportGroups) =>
            saveChartSettings(
              selectedPerson,
              chartLabel,
              managerId,
              additionalSupervisorIds,
              childrenLayout,
              reportGroups,
            )
          }
        />
      )}
      {layout.matrixConnectors.length > 0 && (
        <p className="mt-2 flex items-center gap-2 text-xs text-gray-500">
          <span aria-hidden="true" className="w-6 border-t-2 border-dashed border-violet-500" />
          Dashed lines indicate additional supervisor relationships.
        </p>
      )}
    </>
  );
}
