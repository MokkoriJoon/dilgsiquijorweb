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

interface PositionedPerson extends OrgPerson {
  manager_id: string | null;
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

const CARD_WIDTH = 230;
const CARD_HEIGHT = 72;
const HORIZONTAL_GAP = 64;
const VERTICAL_GAP = 104;
const CHART_MARGIN = 32;

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
  onClose,
  isSuperAdmin,
  onSave,
}: {
  person: PositionedPerson;
  reports: PositionedPerson[];
  onClose: () => void;
  isSuperAdmin: boolean;
  onSave: (
    chartLabel: string,
    defaultLayout: ChildrenLayout,
    reportGroups: ReportGroup[],
  ) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [chartLabel, setChartLabel] = useState(person.chart_label ?? '');
  const [defaultLayout, setDefaultLayout] = useState<ChildrenLayout>(person.children_layout);
  const [reportGroups, setReportGroups] = useState<ReportGroup[]>(() =>
    normalizeReportGroups(person.report_groups, reports.map((report) => report.id), person.children_layout),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

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
      await onSave(chartLabel.trim(), defaultLayout, reportGroups);
      setIsEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save chart settings.');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = () => {
    setChartLabel(person.chart_label ?? '');
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<PositionedPerson | null>(null);
  const [viewportWidth, setViewportWidth] = useState(900);
  const chartViewportRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    const [peopleResult, placementResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id,full_name,email,position,contact_phone,avatar_url,is_focal_person,programs')
        .eq('is_approved', true)
        .order('full_name'),
      supabase
        .from('org_chart_positions')
        .select('profile_id,manager_id,chart_label,children_layout,report_groups'),
    ]);

    if (peopleResult.error || placementResult.error) {
      const message = peopleResult.error?.message
        ?? placementResult.error?.message
        ?? 'Could not load the organization chart.';
      setError(
        /contact_phone|is_focal_person|programs|org_chart_positions|chart_label|children_layout|report_groups|schema cache|does not exist/i.test(message)
          ? 'The organization chart database migrations are not installed. Run supabase/organizational_chart_migration.sql, supabase/focal_person_programs_migration.sql, supabase/org_chart_layout_preferences_migration.sql, and supabase/org_chart_mixed_report_groups_migration.sql in Supabase SQL Editor, then reload.'
          : `Could not load the organization chart: ${message}`,
      );
    } else {
      setError('');
      setPeople((peopleResult.data ?? []) as OrgPerson[]);
      setPlacements((placementResult.data ?? []) as OrgPlacement[]);
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
    ['profiles', 'org_chart_positions'],
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

    return { positionedPeople, connectors };
  }, [people, placements]);

  const saveChartSettings = async (
    person: PositionedPerson,
    chartLabel: string,
    childrenLayout: ChildrenLayout,
    reportGroups: ReportGroup[],
  ) => {
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
    const { error: saveError } = await supabase
      .from('org_chart_positions')
      .upsert(
        {
          profile_id: person.id,
          manager_id: person.manager_id,
          chart_label: chartLabel || null,
          children_layout: childrenLayout,
          report_groups: normalizedGroups,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id' },
      );
    if (saveError) throw new Error(saveError.message);

    await fetchData();
    setSelectedPerson((current) => current?.id === person.id
      ? {
          ...current,
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
                  const groupCenters = groups.map((group) => group.x + group.width / 2);
                  const segments = [
                    `M ${parentCenterX} ${parentBottom} V ${busY}`,
                    `M ${Math.min(...groupCenters)} ${busY} H ${Math.max(...groupCenters)}`,
                  ];
                  for (const group of groups) {
                    if (group.layout === 'vertical') {
                      const reports = [...group.reports].sort((a, b) => a.y - b.y);
                      const trunkX = group.x - 20;
                      const lastReportCenterY = reports[reports.length - 1].y + CARD_HEIGHT / 2;
                      segments.push(
                        `M ${group.x + group.width / 2} ${busY} H ${trunkX} V ${lastReportCenterY}`,
                        ...reports.map(
                          (report) => `M ${trunkX} ${report.y + CARD_HEIGHT / 2} H ${report.x}`,
                        ),
                      );
                    } else {
                      const reports = [...group.reports].sort((a, b) => a.x - b.x);
                      const childCenters = reports.map((report) => report.x + CARD_WIDTH / 2);
                      const groupBusY = manager.y + CARD_HEIGHT + VERTICAL_GAP - 24;
                      segments.push(
                        `M ${group.x + group.width / 2} ${busY} V ${groupBusY}`,
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
          onClose={() => setSelectedPerson(null)}
          isSuperAdmin={isSuperAdmin}
          onSave={(chartLabel, childrenLayout, reportGroups) =>
            saveChartSettings(selectedPerson, chartLabel, childrenLayout, reportGroups)
          }
        />
      )}
    </>
  );
}
