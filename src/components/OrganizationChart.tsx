import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { CollisionDetection, DragEndEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Mail, Network, Phone, Trash2, Users, X } from 'lucide-react';
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
  role: string;
}

interface OrgPlacement {
  profile_id: string;
  manager_id: string | null;
  position_x: number | null;
  position_y: number | null;
}

interface PositionedPlacement extends OrgPlacement {
  person: OrgPerson;
  x: number;
  y: number;
}

const ROOT_DROP_ID = 'organization-chart-root';
const POOL_DROP_ID = 'organization-chart-unplaced';
const CARD_WIDTH = 230;
const CARD_HEIGHT = 72;
const GRID_COLUMN_GAP = 280;
const GRID_ROW_GAP = 150;

const chartCollisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  const managerTarget = collisions.find(({ id }) => String(id).startsWith('manager:'));
  return managerTarget ? [managerTarget] : collisions;
};

function OrganizationPersonCard({
  person,
  onSelect,
  draggable,
  dropTarget,
}: {
  person: OrgPerson;
  onSelect: (person: OrgPerson) => void;
  draggable: boolean;
  dropTarget: boolean;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: person.id,
    disabled: !draggable,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `manager:${person.id}`,
    disabled: !dropTarget,
  });
  const setNodeRef = (node: HTMLButtonElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onSelect(person)}
      style={{ transform: CSS.Transform.toString(transform) }}
      {...attributes}
      {...listeners}
      className={`relative z-10 flex h-[72px] w-[230px] items-center gap-3 overflow-hidden rounded-xl border bg-white p-3 text-left shadow-sm transition-colors hover:border-blue-400 hover:shadow-md ${
        isOver ? 'border-blue-600 ring-2 ring-blue-200' : 'border-gray-200'
      } ${isDragging ? 'z-20 opacity-40' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      aria-label={`${person.full_name ?? 'Staff member'}${person.position ? `, ${toProfilePosition(person.position)}` : ''}. View personnel details.`}
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
    </button>
  );
}

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

export default function OrganizationChart({ canManage = false }: { canManage?: boolean }) {
  const [people, setPeople] = useState<OrgPerson[]>([]);
  const [placements, setPlacements] = useState<OrgPlacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<OrgPerson | null>(null);
  const [viewportWidth, setViewportWidth] = useState(900);
  const chartViewportRef = useRef<HTMLDivElement>(null);
  const markerId = `org-chart-arrow-${useId().replace(/:/g, '')}`;

  const fetchData = useCallback(async () => {
    const [peopleResult, placementResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id,full_name,email,position,contact_phone,avatar_url,role')
        .eq('is_approved', true)
        .order('full_name'),
      supabase.from('org_chart_positions').select('profile_id,manager_id,position_x,position_y'),
    ]);

    if (peopleResult.error || placementResult.error) {
      const message = peopleResult.error?.message ?? placementResult.error?.message ?? 'Could not load the organization chart.';
      setError(
        /contact_phone|position_x|position_y|org_chart_positions|schema cache|does not exist/i.test(message)
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

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const placementById = useMemo(
    () => new Map(placements.map((placement) => [placement.profile_id, placement])),
    [placements],
  );
  const positionedPlacements = useMemo(() => {
    const ordered = placements
      .filter((placement) => peopleById.has(placement.profile_id))
      .sort((a, b) =>
        (peopleById.get(a.profile_id)?.full_name ?? '').localeCompare(
          peopleById.get(b.profile_id)?.full_name ?? '',
        ),
      );
    return ordered.map((placement, index): PositionedPlacement => {
      const person = peopleById.get(placement.profile_id)!;
      return {
        ...placement,
        person,
        x: placement.position_x ?? 32 + (index % 4) * GRID_COLUMN_GAP,
        y: placement.position_y ?? 32 + Math.floor(index / 4) * GRID_ROW_GAP,
      };
    });
  }, [peopleById, placements]);
  const positionedById = useMemo(
    () => new Map(positionedPlacements.map((placement) => [placement.profile_id, placement])),
    [positionedPlacements],
  );
  const canvasWidth = Math.max(
    800,
    viewportWidth,
    ...positionedPlacements.map((placement) => placement.x + CARD_WIDTH + 48),
  );
  const canvasHeight = Math.max(
    480,
    ...positionedPlacements.map((placement) => placement.y + CARD_HEIGHT + 48),
  );
  const unplacedPeople = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return people.filter((person) => {
      if (placementById.has(person.id)) return false;
      if (!needle) return true;
      return `${person.full_name ?? ''} ${person.position ?? ''}`.toLocaleLowerCase().includes(needle);
    });
  }, [people, placementById, query]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const nextAvailablePosition = useCallback(() => {
    const occupied = positionedPlacements.map(({ x, y }) => ({ x, y }));
    for (let index = 0; index <= occupied.length; index += 1) {
      const candidate = {
        x: 32 + (index % 4) * GRID_COLUMN_GAP,
        y: 32 + Math.floor(index / 4) * GRID_ROW_GAP,
      };
      const overlaps = occupied.some(
        (point) =>
          candidate.x < point.x + CARD_WIDTH + 24 &&
          candidate.x + CARD_WIDTH + 24 > point.x &&
          candidate.y < point.y + CARD_HEIGHT + 24 &&
          candidate.y + CARD_HEIGHT + 24 > point.y,
      );
      if (!overlaps) return candidate;
    }
    return { x: 32, y: 32 + (occupied.length + 1) * GRID_ROW_GAP };
  }, [positionedPlacements]);

  const positionFromDrop = useCallback((event: DragEndEvent) => {
    const initial = event.active.rect.current.initial;
    const viewport = chartViewportRef.current;
    if (!initial || !viewport) return nextAvailablePosition();
    const viewportRect = viewport.getBoundingClientRect();
    return {
      x: Math.max(16, initial.left + event.delta.x - viewportRect.left + viewport.scrollLeft),
      y: Math.max(16, initial.top + event.delta.y - viewportRect.top + viewport.scrollTop),
    };
  }, [nextAvailablePosition]);

  const updatePlacement = useCallback(async (
    profileId: string,
    managerId: string | null | undefined,
    position?: { x: number; y: number },
  ) => {
    setSaving(true);
    setError('');
    let saveError: { message: string } | null = null;
    if (managerId === undefined && placementById.has(profileId)) {
      const currentManagerId = placementById.get(profileId)?.manager_id ?? null;
      const { error: reparentError } = await supabase
        .from('org_chart_positions')
        .update({ manager_id: currentManagerId, updated_at: new Date().toISOString() })
        .eq('manager_id', profileId);
      if (reparentError) {
        setError(`Could not move this staff member's direct reports: ${reparentError.message}`);
        setSaving(false);
        return;
      }
    }

    if (managerId === undefined) {
      ({ error: saveError } = await supabase
        .from('org_chart_positions')
        .delete()
        .eq('profile_id', profileId));
    } else {
      const currentPosition = positionedById.get(profileId);
      const nextPosition = position ?? (
        currentPosition
          ? { x: currentPosition.x, y: currentPosition.y }
          : nextAvailablePosition()
      );
      ({ error: saveError } = await supabase.from('org_chart_positions').upsert({
        profile_id: profileId,
        manager_id: managerId,
        position_x: nextPosition.x,
        position_y: nextPosition.y,
        updated_at: new Date().toISOString(),
      }));
    }
    if (saveError) {
      setError(`Could not save the organization chart: ${saveError.message}`);
    } else {
      await fetchData();
    }
    setSaving(false);
  }, [fetchData, nextAvailablePosition, placementById, positionedById]);

  const onDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!canManage) return;
    const profileId = String(active.id);
    const position = positionFromDrop(event);
    if (!over) {
      await updatePlacement(profileId, placementById.get(profileId)?.manager_id ?? null, position);
      return;
    }
    const overId = String(over.id);
    if (overId === POOL_DROP_ID) {
      if (placementById.has(profileId)) await updatePlacement(profileId, undefined);
      return;
    }

    let managerId: string | null;
    if (overId === ROOT_DROP_ID) {
      managerId = placementById.get(profileId)?.manager_id ?? null;
    } else if (overId.startsWith('manager:')) {
      managerId = overId.slice('manager:'.length);
      if (managerId === profileId) {
        setError('A staff member cannot report to themselves.');
        return;
      }

      let ancestor: string | null | undefined = managerId;
      const visited = new Set<string>();
      while (ancestor && !visited.has(ancestor)) {
        if (ancestor === profileId) {
          setError('This change would create a reporting loop. Choose a different manager.');
          return;
        }
        visited.add(ancestor);
        ancestor = placementById.get(ancestor)?.manager_id;
      }
    } else {
      return;
    }

    const currentPosition = positionedById.get(profileId);
    if (
      placementById.get(profileId)?.manager_id === managerId &&
      currentPosition?.x === position.x &&
      currentPosition?.y === position.y
    ) return;
    await updatePlacement(profileId, managerId, position);
  }, [canManage, placementById, positionFromDrop, positionedById, updatePlacement]);

  const rootDrop = useDroppable({ id: ROOT_DROP_ID, disabled: !canManage });
  const poolDrop = useDroppable({ id: POOL_DROP_ID, disabled: !canManage });
  const connectors = positionedPlacements.filter(
    (placement) => placement.manager_id && positionedById.has(placement.manager_id),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={chartCollisionDetection}
      onDragEnd={onDragEnd}
    >
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-gray-800">
              <Network size={21} className="text-blue-700" /> Organizational Chart
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Select a staff member to view personnel details, contact number, and email.
            </p>
          </div>
          {canManage && (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {saving ? 'Saving chart…' : 'Super Admin · Drag to organize'}
            </span>
          )}
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
        ) : (
          <>
            {canManage && (
              <aside className="mb-6 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                      <Users size={16} /> Staff not yet placed
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Drop anywhere in the chart grid to add a top-level staff member, or onto a supervisor to connect the reporting line.
                      Drag a placed member here to remove them from the chart.
                    </p>
                  </div>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search staff…"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm sm:w-56"
                    aria-label="Search staff"
                  />
                </div>
                <div
                  ref={poolDrop.setNodeRef}
                  className={`flex min-h-20 flex-wrap gap-3 rounded-lg p-2 ${poolDrop.isOver ? 'bg-blue-100 ring-2 ring-blue-300' : ''}`}
                >
                  {unplacedPeople.map((person) => (
                    <div key={person.id} className="flex flex-col items-start gap-1.5">
                      <OrganizationPersonCard
                        person={person}
                        onSelect={setSelectedPerson}
                        draggable
                        dropTarget={false}
                      />
                      <button
                        type="button"
                        onClick={() => updatePlacement(person.id, null)}
                        disabled={saving}
                        className="rounded-md px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                      >
                        Add as top-level
                      </button>
                    </div>
                  ))}
                  {unplacedPeople.length === 0 && (
                    <p className="self-center px-2 py-3 text-sm text-gray-500">
                      {people.length === 0 ? 'No approved staff accounts yet.' : query ? 'No staff match your search.' : 'All approved staff are placed in the chart.'}
                    </p>
                  )}
                </div>
              </aside>
            )}

            {positionedPlacements.length === 0 && !canManage ? (
              <div className="grid min-h-[260px] w-full place-items-center rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
                {people.length === 0
                  ? 'No approved personnel are available to display.'
                  : 'The organizational chart has not been set up yet.'}
              </div>
            ) : (
              <div
                ref={chartViewportRef}
                className="w-full overflow-auto rounded-xl border border-gray-200 bg-slate-50"
              >
                <div
                  ref={canManage ? rootDrop.setNodeRef : undefined}
                  className={`relative ${canManage && rootDrop.isOver ? 'ring-2 ring-inset ring-blue-300' : ''}`}
                  style={{
                    width: `${canvasWidth}px`,
                    height: `${canvasHeight}px`,
                    backgroundImage:
                      'linear-gradient(to right, rgba(148, 163, 184, 0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.16) 1px, transparent 1px)',
                    backgroundSize: '32px 32px',
                  }}
                >
                  {canManage && positionedPlacements.length === 0 && (
                    <p className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-gray-500">
                      Drop staff anywhere in this chart to add them as top-level personnel.
                    </p>
                  )}
                  {positionedPlacements.length > 0 && (
                    <svg
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      width={canvasWidth}
                      height={canvasHeight}
                      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                    >
                      <defs>
                        <marker
                          id={markerId}
                          markerWidth="8"
                          markerHeight="8"
                          refX="7"
                          refY="4"
                          orient="auto"
                        >
                          <path d="M0,0 L8,4 L0,8 Z" fill="#60a5fa" />
                        </marker>
                      </defs>
                      {connectors.map((child) => {
                        const parent = positionedById.get(child.manager_id!);
                        if (!parent) return null;
                        const parentCenter = {
                          x: parent.x + CARD_WIDTH / 2,
                          y: parent.y + CARD_HEIGHT / 2,
                        };
                        const childCenter = {
                          x: child.x + CARD_WIDTH / 2,
                          y: child.y + CARD_HEIGHT / 2,
                        };
                        const dx = childCenter.x - parentCenter.x;
                        const dy = childCenter.y - parentCenter.y;
                        const edgeRatio = Math.max(
                          Math.abs(dx) / (CARD_WIDTH / 2),
                          Math.abs(dy) / (CARD_HEIGHT / 2),
                        );
                        const edgeScale = edgeRatio === 0 ? 0 : 1 / edgeRatio;
                        const startX = parentCenter.x + dx * edgeScale;
                        const startY = parentCenter.y + dy * edgeScale;
                        const endX = childCenter.x - dx * edgeScale;
                        const endY = childCenter.y - dy * edgeScale;
                        return (
                          <path
                            key={child.profile_id}
                            d={`M ${startX} ${startY} C ${startX + dx * 0.35} ${startY + dy * 0.15}, ${endX - dx * 0.35} ${endY - dy * 0.15}, ${endX} ${endY}`}
                            fill="none"
                            stroke="#60a5fa"
                            strokeWidth="2"
                            markerEnd={`url(#${markerId})`}
                          />
                        );
                      })}
                    </svg>
                  )}
                  {positionedPlacements.map((placement) => (
                    <div
                      key={placement.profile_id}
                      className="absolute z-10"
                      style={{ left: placement.x, top: placement.y }}
                    >
                      <OrganizationPersonCard
                        person={placement.person}
                        onSelect={setSelectedPerson}
                        draggable={canManage}
                        dropTarget={canManage}
                      />
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => updatePlacement(placement.profile_id, undefined)}
                          disabled={saving}
                          title="Remove from organizational chart"
                          aria-label={`Remove ${toProfileTitleCase(placement.person.full_name) || 'staff member'} from chart`}
                          className="absolute -right-2 -top-2 z-20 inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-1 text-[10px] font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
      {selectedPerson && (
        <PersonnelDetailsModal person={selectedPerson} onClose={() => setSelectedPerson(null)} />
      )}
    </DndContext>
  );
}
