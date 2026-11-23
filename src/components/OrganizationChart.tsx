import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mail, Network, Pencil, Phone, Save, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useRealtimeTableChanges } from '../lib/realtime';
import { toProfilePosition, toProfileTitleCase } from '../lib/case';
import { useAuth } from '../lib/useAuth';
import Avatar from './Avatar';

type ChildrenLayout = 'horizontal' | 'vertical';

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
}

interface PositionedPerson extends OrgPerson {
  manager_id: string | null;
  chart_label: string | null;
  children_layout: ChildrenLayout;
  x: number;
  y: number;
  depth: number;
}

interface LayoutNode {
  person: OrgPerson;
  manager_id: string | null;
  chart_label: string | null;
  children_layout: ChildrenLayout;
  width: number;
  height: number;
  children: Array<{ node: LayoutNode; x: number; y: number }>;
}

interface ChartConnector {
  manager: PositionedPerson;
  reports: PositionedPerson[];
  layout: ChildrenLayout;
}

const CARD_WIDTH = 230;
const CARD_HEIGHT = 72;
const HORIZONTAL_GAP = 64;
const VERTICAL_GAP = 104;
const CHART_MARGIN = 32;

function PersonnelDetailsModal({
  person,
  onClose,
  isSuperAdmin,
  onSave,
}: {
  person: PositionedPerson;
  onClose: () => void;
  isSuperAdmin: boolean;
  onSave: (chartLabel: string, childrenLayout: ChildrenLayout) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [chartLabel, setChartLabel] = useState(person.chart_label ?? '');
  const [childrenLayout, setChildrenLayout] = useState<ChildrenLayout>(person.children_layout);
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
      await onSave(chartLabel.trim(), childrenLayout);
      setIsEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save chart settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Personnel details">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Close personnel details" />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
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
                onClick={() => {
                  setChartLabel(person.chart_label ?? '');
                  setChildrenLayout(person.children_layout);
                  setSaveError('');
                  setIsEditing((editing) => !editing);
                }}
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
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-gray-700">Arrange direct reports</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['horizontal', 'vertical'] as const).map((direction) => (
                  <label
                    key={direction}
                    className={`cursor-pointer rounded-lg border p-3 text-sm ${
                      childrenLayout === direction
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="org-chart-children-layout"
                      value={direction}
                      checked={childrenLayout === direction}
                      onChange={() => setChildrenLayout(direction)}
                      className="sr-only"
                    />
                    <span className="block font-semibold capitalize">{direction}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {direction === 'horizontal' ? 'Side by side' : 'Stacked vertically'}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
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
        .select('profile_id,manager_id,chart_label,children_layout'),
    ]);

    if (peopleResult.error || placementResult.error) {
      const message = peopleResult.error?.message
        ?? placementResult.error?.message
        ?? 'Could not load the organization chart.';
      setError(
        /contact_phone|is_focal_person|programs|org_chart_positions|chart_label|children_layout|schema cache|does not exist/i.test(message)
          ? 'The organization chart database migrations are not installed. Run supabase/organizational_chart_migration.sql, supabase/focal_person_programs_migration.sql, and supabase/org_chart_layout_preferences_migration.sql in Supabase SQL Editor, then reload.'
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
      const childOffsets: LayoutNode['children'] = [];
      let width = CARD_WIDTH;
      let height = CARD_HEIGHT;

      if (children.length > 0 && childrenLayout === 'horizontal') {
        const childrenWidth = children.reduce((sum, child) => sum + child.width, 0)
          + HORIZONTAL_GAP * (children.length - 1);
        width = Math.max(CARD_WIDTH, childrenWidth);
        height += VERTICAL_GAP + Math.max(...children.map((child) => child.height));
        let childX = (width - childrenWidth) / 2;
        for (const child of children) {
          childOffsets.push({
            node: child,
            x: childX,
            y: CARD_HEIGHT + VERTICAL_GAP,
          });
          childX += child.width + HORIZONTAL_GAP;
        }
      } else if (children.length > 0) {
        width = Math.max(CARD_WIDTH, ...children.map((child) => child.width));
        height += VERTICAL_GAP
          + children.reduce((sum, child) => sum + child.height, 0)
          + VERTICAL_GAP * (children.length - 1);
        let childY = CARD_HEIGHT + VERTICAL_GAP;
        for (const child of children) {
          childOffsets.push({
            node: child,
            x: (width - child.width) / 2,
            y: childY,
          });
          childY += child.height + VERTICAL_GAP;
        }
      }

      return {
        person,
        manager_id: managerById.get(profileId) ?? null,
        chart_label: placement?.chart_label ?? null,
        children_layout: childrenLayout,
        width,
        height,
        children: childOffsets,
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
      reportIds: string[];
      layout: ChildrenLayout;
    }> = [];
    const placeNode = (node: LayoutNode, x: number, y: number, depth: number) => {
      const positioned: PositionedPerson = {
        ...node.person,
        manager_id: node.manager_id,
        chart_label: node.chart_label,
        children_layout: node.children_layout,
        x: x + (node.width - CARD_WIDTH) / 2,
        y,
        depth,
      };
      positionedPeople.push(positioned);
      if (node.children.length > 0) {
        connectorGroups.push({
          managerId: positioned.id,
          reportIds: node.children.map(({ node: child }) => child.person.id),
          layout: node.children_layout,
        });
      }
      for (const child of node.children) {
        placeNode(child.node, x + child.x, y + child.y, depth + 1);
      }
    };

    let rootX = CHART_MARGIN;
    for (const root of rootNodes) {
      placeNode(root, rootX, CHART_MARGIN, 0);
      rootX += root.width + HORIZONTAL_GAP;
    }

    const positionedMap = new Map(positionedPeople.map((person) => [person.id, person]));
    const connectors: ChartConnector[] = connectorGroups.flatMap(({ managerId, reportIds, layout: childrenLayout }) => {
      const manager = positionedMap.get(managerId);
      const reports = reportIds
        .map((reportId) => positionedMap.get(reportId))
        .filter((report): report is PositionedPerson => report !== undefined);
      return manager && reports.length > 0
        ? [{ manager, reports, layout: childrenLayout }]
        : [];
    });

    return { positionedPeople, connectors };
  }, [people, placements]);

  const saveChartSettings = async (
    person: PositionedPerson,
    chartLabel: string,
    childrenLayout: ChildrenLayout,
  ) => {
    const { error: saveError } = await supabase
      .from('org_chart_positions')
      .upsert(
        {
          profile_id: person.id,
          manager_id: person.manager_id,
          chart_label: chartLabel || null,
          children_layout: childrenLayout,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id' },
      );
    if (saveError) throw new Error(saveError.message);

    await fetchData();
    setSelectedPerson((current) => current?.id === person.id
      ? { ...current, chart_label: chartLabel || null, children_layout: childrenLayout }
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
                {layout.connectors.map(({ manager, reports, layout: childrenLayout }) => {
                  const parentCenterX = manager.x + CARD_WIDTH / 2;
                  const parentBottom = manager.y + CARD_HEIGHT;
                  let d: string;
                  if (childrenLayout === 'vertical') {
                    const sortedReports = [...reports].sort((a, b) => a.y - b.y);
                    const trunkX = manager.x - 20;
                    const trunkTop = parentBottom + 24;
                    const branchYs = sortedReports.map((report) => report.y + CARD_HEIGHT / 2);
                    d = [
                      `M ${parentCenterX} ${parentBottom} V ${trunkTop} H ${trunkX}`,
                      `M ${trunkX} ${trunkTop} V ${branchYs[branchYs.length - 1]}`,
                      ...sortedReports.map(
                        (report) => `M ${trunkX} ${report.y + CARD_HEIGHT / 2} H ${report.x}`,
                      ),
                    ].join(' ');
                  } else {
                    const sortedReports = [...reports].sort((a, b) => a.x - b.x);
                    const childCenterXs = sortedReports.map((report) => report.x + CARD_WIDTH / 2);
                    const busY = parentBottom + VERTICAL_GAP / 2;
                    d = [
                      `M ${parentCenterX} ${parentBottom} V ${busY}`,
                      `M ${childCenterXs[0]} ${busY} H ${childCenterXs[childCenterXs.length - 1]}`,
                      ...sortedReports.map(
                        (report) => `M ${report.x + CARD_WIDTH / 2} ${busY} V ${report.y}`,
                      ),
                    ].join(' ');
                  }
                  return (
                    <path
                      key={manager.id}
                      d={d}
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
          onClose={() => setSelectedPerson(null)}
          isSuperAdmin={isSuperAdmin}
          onSave={(chartLabel, childrenLayout) =>
            saveChartSettings(selectedPerson, chartLabel, childrenLayout)
          }
        />
      )}
    </>
  );
}
