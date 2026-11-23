import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mail, Network, Phone, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useRealtimeTableChanges } from '../lib/realtime';
import { toProfilePosition, toProfileTitleCase } from '../lib/case';
import Avatar from './Avatar';

interface OrgPerson {
  id: string;
  full_name: string | null;
  email: string | null;
  position: string | null;
  contact_phone: string | null;
  avatar_url: string | null;
}

interface OrgPlacement {
  profile_id: string;
  manager_id: string | null;
}

interface PositionedPerson extends OrgPerson {
  manager_id: string | null;
  x: number;
  y: number;
  depth: number;
}

interface ChartConnector {
  manager: PositionedPerson;
  reports: PositionedPerson[];
}

const CARD_WIDTH = 230;
const CARD_HEIGHT = 72;
const HORIZONTAL_GAP = 64;
const VERTICAL_GAP = 104;
const CHART_MARGIN = 32;

function PersonnelDetailsModal({
  person,
  onClose,
}: {
  person: OrgPerson;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
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
        </dl>
      </div>
    </div>
  );
}

export default function OrganizationChart() {
  const [people, setPeople] = useState<OrgPerson[]>([]);
  const [placements, setPlacements] = useState<OrgPlacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<OrgPerson | null>(null);
  const [viewportWidth, setViewportWidth] = useState(900);
  const chartViewportRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    const [peopleResult, placementResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id,full_name,email,position,contact_phone,avatar_url')
        .eq('is_approved', true)
        .order('full_name'),
      supabase.from('org_chart_positions').select('profile_id,manager_id'),
    ]);

    if (peopleResult.error || placementResult.error) {
      const message = peopleResult.error?.message
        ?? placementResult.error?.message
        ?? 'Could not load the organization chart.';
      setError(
        /contact_phone|org_chart_positions|schema cache|does not exist/i.test(message)
          ? 'The organization chart database migration is not installed. Run supabase/organizational_chart_migration.sql in Supabase SQL Editor, then reload.'
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

    const positionedById = new Map<string, PositionedPerson>();
    let leafIndex = 0;
    const placePerson = (
      profileId: string,
      depth: number,
      ancestors: Set<string>,
    ): PositionedPerson | null => {
      if (ancestors.has(profileId)) return null;
      const existing = positionedById.get(profileId);
      if (existing) return existing;
      const person = peopleById.get(profileId);
      if (!person) return null;

      const nextAncestors = new Set(ancestors);
      nextAncestors.add(profileId);
      const childPositions = (childrenByManager.get(profileId) ?? [])
        .map((childId) => placePerson(childId, depth + 1, nextAncestors))
        .filter((child): child is PositionedPerson => child !== null);
      let centerX: number;
      if (childPositions.length > 0) {
        centerX = childPositions.reduce(
          (sum, child) => sum + child.x + CARD_WIDTH / 2,
          0,
        ) / childPositions.length;
      } else {
        centerX = CHART_MARGIN + leafIndex * (CARD_WIDTH + HORIZONTAL_GAP) + CARD_WIDTH / 2;
        leafIndex += 1;
      }

      const positioned: PositionedPerson = {
        ...person,
        manager_id: managerById.get(profileId) ?? null,
        x: centerX - CARD_WIDTH / 2,
        y: CHART_MARGIN + depth * (CARD_HEIGHT + VERTICAL_GAP),
        depth,
      };
      positionedById.set(profileId, positioned);
      return positioned;
    };

    const roots = people
      .filter((person) => {
        const managerId = managerById.get(person.id);
        return !managerId || !peopleById.has(managerId) || managerId === person.id;
      })
      .map((person) => person.id)
      .sort(sortByName);
    for (const rootId of roots) placePerson(rootId, 0, new Set());
    for (const person of [...people].sort((a, b) => sortByName(a.id, b.id))) {
      if (!positionedById.has(person.id)) placePerson(person.id, 0, new Set());
    }

    const positionedPeople = [...positionedById.values()];
    const positionedMap = new Map(positionedPeople.map((person) => [person.id, person]));
    const connectorGroups = new Map<string, PositionedPerson[]>();
    for (const person of positionedPeople) {
      const manager = person.manager_id ? positionedMap.get(person.manager_id) : undefined;
      if (!manager || person.depth <= manager.depth) continue;
      const reports = connectorGroups.get(manager.id) ?? [];
      reports.push(person);
      connectorGroups.set(manager.id, reports);
    }
    const connectors: ChartConnector[] = [...connectorGroups.entries()].flatMap(
      ([managerId, reports]) => {
        const manager = positionedMap.get(managerId);
        return manager ? [{ manager, reports }] : [];
      },
    );

    return { positionedPeople, connectors };
  }, [people, placements]);

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
                {layout.connectors.map(({ manager, reports }) => {
                  const sortedReports = [...reports].sort((a, b) => a.x - b.x);
                  const parentCenterX = manager.x + CARD_WIDTH / 2;
                  const parentBottom = manager.y + CARD_HEIGHT;
                  const childCenterXs = sortedReports.map((report) => report.x + CARD_WIDTH / 2);
                  const busY = parentBottom + Math.max(
                    24,
                    (sortedReports[0].y - parentBottom) / 2,
                  );
                  const d = [
                    `M ${parentCenterX} ${parentBottom} V ${busY}`,
                    `M ${childCenterXs[0]} ${busY} H ${childCenterXs[childCenterXs.length - 1]}`,
                    ...sortedReports.map(
                      (report) => `M ${report.x + CARD_WIDTH / 2} ${busY} V ${report.y}`,
                    ),
                  ].join(' ');
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
                  {person.depth === 0 && (
                    <span className="absolute right-2 top-1 rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700">
                      Head
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      {selectedPerson && (
        <PersonnelDetailsModal person={selectedPerson} onClose={() => setSelectedPerson(null)} />
      )}
    </>
  );
}
