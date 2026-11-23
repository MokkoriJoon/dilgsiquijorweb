import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
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
  role: string;
}

interface OrgPlacement {
  profile_id: string;
  manager_id: string | null;
}

const ROOT_DROP_ID = 'organization-chart-root';
const POOL_DROP_ID = 'organization-chart-unplaced';

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
      className={`relative z-10 flex min-w-[210px] max-w-[250px] items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition-colors hover:border-blue-400 hover:shadow-md ${
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

  const fetchData = useCallback(async () => {
    const [peopleResult, placementResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id,full_name,email,position,contact_phone,avatar_url,role')
        .eq('is_approved', true)
        .order('full_name'),
      supabase.from('org_chart_positions').select('profile_id,manager_id'),
    ]);

    if (peopleResult.error || placementResult.error) {
      const message = peopleResult.error?.message ?? placementResult.error?.message ?? 'Could not load the organization chart.';
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
  const childrenByManager = useMemo(() => {
    const map = new Map<string | null, string[]>();
    for (const placement of placements) {
      const parentId = placement.manager_id && peopleById.has(placement.manager_id) ? placement.manager_id : null;
      const children = map.get(parentId) ?? [];
      children.push(placement.profile_id);
      map.set(parentId, children);
    }
    return map;
  }, [placements, peopleById]);
  const unplacedPeople = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return people.filter((person) => {
      if (placementById.has(person.id)) return false;
      if (!needle) return true;
      return `${person.full_name ?? ''} ${person.position ?? ''}`.toLocaleLowerCase().includes(needle);
    });
  }, [people, placementById, query]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const updatePlacement = useCallback(async (profileId: string, managerId: string | null | undefined) => {
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
      ({ error: saveError } = await supabase.from('org_chart_positions').upsert({
          profile_id: profileId,
          manager_id: managerId,
          updated_at: new Date().toISOString(),
        }));
    }
    if (saveError) {
      setError(`Could not save the organization chart: ${saveError.message}`);
    } else {
      await fetchData();
    }
    setSaving(false);
  }, [fetchData, placementById]);

  const onDragEnd = useCallback(async ({ active, over }: DragEndEvent) => {
    if (!canManage || !over) return;
    const profileId = String(active.id);
    const overId = String(over.id);
    if (overId === POOL_DROP_ID) {
      if (placementById.has(profileId)) await updatePlacement(profileId, undefined);
      return;
    }

    let managerId: string | null;
    if (overId === ROOT_DROP_ID) {
      managerId = null;
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

    if (placementById.get(profileId)?.manager_id === managerId) return;
    await updatePlacement(profileId, managerId);
  }, [canManage, placementById, updatePlacement]);

  const rootDrop = useDroppable({ id: ROOT_DROP_ID, disabled: !canManage });
  const poolDrop = useDroppable({ id: POOL_DROP_ID, disabled: !canManage });

  function renderBranch(profileId: string, ancestors = new Set<string>()) {
    const person = peopleById.get(profileId);
    if (!person || ancestors.has(profileId)) return null;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(profileId);
    const childIds = childrenByManager.get(profileId) ?? [];

    return (
      <div key={profileId} className="flex min-w-max flex-col items-center">
        <OrganizationPersonCard
          person={person}
          onSelect={setSelectedPerson}
          draggable={canManage}
          dropTarget={canManage}
        />
        {childIds.length > 0 && (
          <>
            <div className="h-6 border-l-2 border-blue-300" />
            <div className="flex justify-center border-t-2 border-blue-300">
              {childIds.map((childId) => (
                <div
                  key={childId}
                  className="relative flex flex-col items-center px-3 pt-6 before:absolute before:left-1/2 before:top-0 before:h-6 before:border-l-2 before:border-blue-300 after:absolute after:left-1/2 after:top-[17px] after:-translate-x-1/2 after:border-x-[6px] after:border-x-transparent after:border-t-[8px] after:border-t-blue-400 after:border-solid"
                >
                  {renderBranch(childId, nextAncestors)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const rootIds = childrenByManager.get(null) ?? [];

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
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
                      Drag a staff member to the root area or onto a supervisor to connect the reporting line.
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
                    <OrganizationPersonCard
                      key={person.id}
                      person={person}
                      onSelect={setSelectedPerson}
                      draggable
                      dropTarget={false}
                    />
                  ))}
                  {unplacedPeople.length === 0 && (
                    <p className="self-center px-2 py-3 text-sm text-gray-500">
                      {people.length === 0 ? 'No approved staff accounts yet.' : query ? 'No staff match your search.' : 'All approved staff are placed in the chart.'}
                    </p>
                  )}
                </div>
              </aside>
            )}

            {canManage && (
              <div
                ref={rootDrop.setNodeRef}
                className={`mb-4 rounded-xl border-2 border-dashed px-4 py-3 text-center text-sm font-medium ${
                  rootDrop.isOver ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-300 text-gray-500'
                }`}
              >
                Drop here to add a top-level staff member or make them a root
              </div>
            )}

            {rootIds.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">
                {people.length === 0
                  ? 'No approved personnel are available to display.'
                  : canManage
                    ? 'Drag staff members into the chart to begin building the organization hierarchy.'
                    : 'The organizational chart has not been set up yet.'}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl bg-slate-50 p-6">
                <div className="flex min-w-max justify-center gap-8">
                  {rootIds.map((profileId) => renderBranch(profileId))}
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
