import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
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
import { Mail, Network, PenLine, Phone, Trash2, Users, X } from 'lucide-react';
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

type ConnectorSide = 'top' | 'right' | 'bottom' | 'left';

interface ChartPoint {
  x: number;
  y: number;
}

interface OrgConnector {
  id: string;
  source_profile_id: string | null;
  source_side: ConnectorSide;
  source_x: number;
  source_y: number;
  target_profile_id: string | null;
  target_side: ConnectorSide;
  target_x: number;
  target_y: number;
  waypoints: ChartPoint[];
}

interface ConnectorDraft {
  source_profile_id: string | null;
  source_side: ConnectorSide;
  points: ChartPoint[];
}

interface ConnectorHandleDrag {
  connector: OrgConnector;
  pointIndex: number;
}

const ROOT_DROP_ID = 'organization-chart-root';
const POOL_DROP_ID = 'organization-chart-unplaced';
const CARD_WIDTH = 230;
const CARD_HEIGHT = 72;
const GRID_SIZE = 32;
const SNAP_SIZE = 8;
const GRID_COLUMN_GAP = GRID_SIZE * 9;
const GRID_ROW_GAP = GRID_SIZE * 5;

function snapToGrid(value: number) {
  return Math.max(GRID_SIZE, Math.round(value / SNAP_SIZE) * SNAP_SIZE);
}

function sidePoint(placement: PositionedPlacement, side: ConnectorSide): ChartPoint {
  switch (side) {
    case 'top':
      return { x: placement.x + CARD_WIDTH / 2, y: placement.y };
    case 'right':
      return { x: placement.x + CARD_WIDTH, y: placement.y + CARD_HEIGHT / 2 };
    case 'bottom':
      return { x: placement.x + CARD_WIDTH / 2, y: placement.y + CARD_HEIGHT };
    case 'left':
      return { x: placement.x, y: placement.y + CARD_HEIGHT / 2 };
  }
}

function connectorPoints(
  connector: OrgConnector,
  positionedById: Map<string, PositionedPlacement>,
): ChartPoint[] {
  const sourcePlacement = connector.source_profile_id
    ? positionedById.get(connector.source_profile_id)
    : undefined;
  const targetPlacement = connector.target_profile_id
    ? positionedById.get(connector.target_profile_id)
    : undefined;
  return [
    sourcePlacement ? sidePoint(sourcePlacement, connector.source_side) : { x: connector.source_x, y: connector.source_y },
    ...connector.waypoints,
    targetPlacement ? sidePoint(targetPlacement, connector.target_side) : { x: connector.target_x, y: connector.target_y },
  ];
}

function addOrthogonalSegment(points: ChartPoint[], end: ChartPoint): ChartPoint[] {
  const start = points[points.length - 1];
  if (!start || (start.x === end.x && start.y === end.y)) return points;
  const result = [...points];
  if (start.x !== end.x && start.y !== end.y) {
    if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
      result.push({ x: end.x, y: start.y });
    } else {
      result.push({ x: start.x, y: end.y });
    }
  }
  const last = result[result.length - 1];
  if (last.x !== end.x || last.y !== end.y) result.push(end);
  return result;
}

function orthogonalPoints(points: ChartPoint[]): ChartPoint[] {
  return points.slice(1).reduce(addOrthogonalSegment, points.slice(0, 1));
}

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
  const [connectors, setConnectors] = useState<OrgConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<OrgPerson | null>(null);
  const [viewportWidth, setViewportWidth] = useState(900);
  const [penMode, setPenMode] = useState(false);
  const [connectorDraft, setConnectorDraft] = useState<ConnectorDraft | null>(null);
  const [connectorHandleDrag, setConnectorHandleDrag] = useState<ConnectorHandleDrag | null>(null);
  const chartViewportRef = useRef<HTMLDivElement>(null);
  const chartCanvasRef = useRef<HTMLDivElement | null>(null);

  const fetchData = useCallback(async () => {
    const [peopleResult, placementResult, connectorResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id,full_name,email,position,contact_phone,avatar_url,role')
        .eq('is_approved', true)
        .order('full_name'),
      supabase.from('org_chart_positions').select('profile_id,manager_id,position_x,position_y'),
      supabase.from('org_chart_connectors').select('*'),
    ]);

    if (peopleResult.error || placementResult.error || connectorResult.error) {
      const message = peopleResult.error?.message
        ?? placementResult.error?.message
        ?? connectorResult.error?.message
        ?? 'Could not load the organization chart.';
      setError(
        /contact_phone|position_x|position_y|org_chart_positions|org_chart_connectors|schema cache|does not exist/i.test(message)
          ? 'The organization chart database migration is not installed. Run supabase/organizational_chart_migration.sql in Supabase SQL Editor, then reload.'
          : `Could not load the organization chart: ${message}`,
      );
    } else {
      setError('');
      setPeople((peopleResult.data ?? []) as OrgPerson[]);
      setPlacements((placementResult.data ?? []) as OrgPlacement[]);
      setConnectors((connectorResult.data ?? []) as OrgConnector[]);
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
    ['profiles', 'org_chart_positions', 'org_chart_connectors'],
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
        x: placement.position_x == null
          ? GRID_SIZE + (index % 4) * GRID_COLUMN_GAP
          : snapToGrid(placement.position_x),
        y: placement.position_y == null
          ? GRID_SIZE + Math.floor(index / 4) * GRID_ROW_GAP
          : snapToGrid(placement.position_y),
      };
    });
  }, [peopleById, placements]);
  const positionedById = useMemo(
    () => new Map(positionedPlacements.map((placement) => [placement.profile_id, placement])),
    [positionedPlacements],
  );
  const allConnectorPoints = connectors.flatMap((connector) => connectorPoints(connector, positionedById));
  const canvasWidth = Math.max(
    800,
    viewportWidth,
    ...positionedPlacements.map((placement) => placement.x + CARD_WIDTH + 48),
    ...allConnectorPoints.map((point) => point.x + 48),
  );
  const canvasHeight = Math.max(
    480,
    ...positionedPlacements.map((placement) => placement.y + CARD_HEIGHT + 48),
    ...allConnectorPoints.map((point) => point.y + 48),
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
      x: snapToGrid(initial.left + event.delta.x - viewportRect.left + viewport.scrollLeft),
      y: snapToGrid(initial.top + event.delta.y - viewportRect.top + viewport.scrollTop),
    };
  }, [nextAvailablePosition]);

  const toCanvasPoint = useCallback((clientX: number, clientY: number): ChartPoint => {
    const canvas = chartCanvasRef.current;
    if (!canvas) return { x: GRID_SIZE, y: GRID_SIZE };
    const bounds = canvas.getBoundingClientRect();
    return {
      x: clientX - bounds.left,
      y: clientY - bounds.top,
    };
  }, []);

  const findAttachTarget = useCallback((point: ChartPoint) => {
    for (const placement of positionedPlacements) {
      if (
        point.x < placement.x - 24 ||
        point.x > placement.x + CARD_WIDTH + 24 ||
        point.y < placement.y - 24 ||
        point.y > placement.y + CARD_HEIGHT + 24
      ) continue;
      const distances: Array<{ side: ConnectorSide; distance: number }> = [
        { side: 'top', distance: Math.abs(point.y - placement.y) },
        { side: 'right', distance: Math.abs(point.x - placement.x - CARD_WIDTH) },
        { side: 'bottom', distance: Math.abs(point.y - placement.y - CARD_HEIGHT) },
        { side: 'left', distance: Math.abs(point.x - placement.x) },
      ];
      const nearest = distances.reduce((best, candidate) =>
        candidate.distance < best.distance ? candidate : best,
      );
      return {
        profileId: placement.profile_id,
        side: nearest.side,
        point: sidePoint(placement, nearest.side),
      };
    }
    return null;
  }, [positionedPlacements]);

  const saveConnector = useCallback(async (connector: OrgConnector, isNew = false) => {
    setSaving(true);
    setError('');
    const values = {
      source_profile_id: connector.source_profile_id,
      source_side: connector.source_side,
      source_x: connector.source_x,
      source_y: connector.source_y,
      target_profile_id: connector.target_profile_id,
      target_side: connector.target_side,
      target_x: connector.target_x,
      target_y: connector.target_y,
      waypoints: connector.waypoints,
      updated_at: new Date().toISOString(),
    };
    const result = isNew
      ? await supabase.from('org_chart_connectors').insert(values)
      : await supabase.from('org_chart_connectors').update(values).eq('id', connector.id);
    if (result.error) {
      setError(`Could not save the chart connector: ${result.error.message}`);
    } else {
      await fetchData();
    }
    setSaving(false);
  }, [fetchData]);

  const beginCanvasDrawing = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (!canManage || !penMode) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer = toCanvasPoint(event.clientX, event.clientY);
    const attachment = findAttachTarget(pointer);
    const source = attachment?.point ?? {
      x: snapToGrid(pointer.x),
      y: snapToGrid(pointer.y),
    };
    setConnectorDraft({
      source_profile_id: attachment?.profileId ?? null,
      source_side: attachment?.side ?? 'left',
      points: [source],
    });
  }, [canManage, findAttachTarget, penMode, toCanvasPoint]);

  const moveCanvasDrawing = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (!connectorDraft) return;
    const pointer = toCanvasPoint(event.clientX, event.clientY);
    const point = { x: snapToGrid(pointer.x), y: snapToGrid(pointer.y) };
    setConnectorDraft((draft) => draft
      ? { ...draft, points: addOrthogonalSegment(draft.points, point) }
      : null);
  }, [connectorDraft, toCanvasPoint]);

  const finishCanvasDrawing = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (!connectorDraft) return;
    const pointer = toCanvasPoint(event.clientX, event.clientY);
    const target = findAttachTarget(pointer);
    const endPoint = target?.point ?? { x: snapToGrid(pointer.x), y: snapToGrid(pointer.y) };
    const points = addOrthogonalSegment(connectorDraft.points, endPoint);
    if (points.length > 1) {
      void saveConnector({
        id: '',
        source_profile_id: connectorDraft.source_profile_id,
        source_side: connectorDraft.source_side,
        source_x: points[0].x,
        source_y: points[0].y,
        target_profile_id: target?.profileId ?? null,
        target_side: target?.side ?? 'left',
        target_x: endPoint.x,
        target_y: endPoint.y,
        waypoints: points.slice(1, -1),
      }, true);
    }
    setConnectorDraft(null);
  }, [connectorDraft, findAttachTarget, saveConnector, toCanvasPoint]);

  const beginConnectorHandle = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    connector: OrgConnector,
    pointIndex: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const points = connectorPoints(connector, positionedById);
    const point = points[pointIndex];
    const editable = { ...connector, waypoints: [...connector.waypoints] };
    if (pointIndex === 0) {
      editable.source_profile_id = null;
      editable.source_x = point.x;
      editable.source_y = point.y;
    } else if (pointIndex === points.length - 1) {
      editable.target_profile_id = null;
      editable.target_x = point.x;
      editable.target_y = point.y;
    }
    setConnectorHandleDrag({ connector: editable, pointIndex });
  }, [positionedById]);

  const moveConnectorHandle = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!connectorHandleDrag) return;
    const point = toCanvasPoint(event.clientX, event.clientY);
    const nextPoint = { x: snapToGrid(point.x), y: snapToGrid(point.y) };
    setConnectorHandleDrag((current) => {
      if (!current) return null;
      const { connector, pointIndex } = current;
      if (pointIndex === 0) {
        return {
          connector: { ...connector, source_profile_id: null, source_x: nextPoint.x, source_y: nextPoint.y },
          pointIndex,
        };
      }
      if (pointIndex === connector.waypoints.length + 1) {
        return {
          connector: { ...connector, target_profile_id: null, target_x: nextPoint.x, target_y: nextPoint.y },
          pointIndex,
        };
      }
      const waypoints = [...connector.waypoints];
      waypoints[pointIndex - 1] = nextPoint;
      return { connector: { ...connector, waypoints }, pointIndex };
    });
  }, [connectorHandleDrag, toCanvasPoint]);

  const finishConnectorHandle = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!connectorHandleDrag) return;
    const { connector, pointIndex } = connectorHandleDrag;
    const cursor = toCanvasPoint(event.clientX, event.clientY);
    const target = findAttachTarget(cursor);
    let updated = connector;
    if (pointIndex === 0 && target) {
      updated = {
        ...connector,
        source_profile_id: target.profileId,
        source_side: target.side,
        source_x: target.point.x,
        source_y: target.point.y,
      };
    } else if (pointIndex === connector.waypoints.length + 1 && target) {
      updated = {
        ...connector,
        target_profile_id: target.profileId,
        target_side: target.side,
        target_x: target.point.x,
        target_y: target.point.y,
      };
    }
    void saveConnector(updated);
    setConnectorHandleDrag(null);
  }, [connectorHandleDrag, findAttachTarget, saveConnector, toCanvasPoint]);

  const addConnectorBend = useCallback((connector: OrgConnector, segmentIndex: number) => {
    const points = connectorPoints(connector, positionedById);
    const before = points[segmentIndex];
    const after = points[segmentIndex + 1];
    let bends: ChartPoint[];
    if (before.y === after.y) {
      const offsetY = snapToGrid(before.y + GRID_SIZE * 2);
      bends = [
        { x: snapToGrid(before.x), y: offsetY },
        { x: snapToGrid(after.x), y: offsetY },
      ];
    } else if (before.x === after.x) {
      const offsetX = snapToGrid(before.x + GRID_SIZE * 2);
      bends = [
        { x: offsetX, y: snapToGrid(before.y) },
        { x: offsetX, y: snapToGrid(after.y) },
      ];
    } else {
      bends = [{ x: snapToGrid(after.x), y: snapToGrid(before.y) }];
    }
    const waypoints = [...connector.waypoints];
    waypoints.splice(segmentIndex, 0, ...bends);
    void saveConnector({ ...connector, waypoints });
  }, [positionedById, saveConnector]);

  const deleteConnector = useCallback(async (connectorId: string) => {
    setSaving(true);
    setError('');
    const { error: deleteError } = await supabase
      .from('org_chart_connectors')
      .delete()
      .eq('id', connectorId);
    if (deleteError) {
      setError(`Could not delete the chart connector: ${deleteError.message}`);
    } else {
      await fetchData();
    }
    setSaving(false);
  }, [fetchData]);

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
      const { error: connectorError } = await supabase
        .from('org_chart_connectors')
        .delete()
        .or(`source_profile_id.eq.${profileId},target_profile_id.eq.${profileId}`);
      if (connectorError) {
        setError(`Could not remove this staff member's chart connectors: ${connectorError.message}`);
        setSaving(false);
        return;
      }
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
  const displayConnectors = connectors.map((connector) =>
    connector.id === connectorHandleDrag?.connector.id
      ? connectorHandleDrag.connector
      : connector,
  );
  const connectorGeometry = displayConnectors.map((connector) => {
    const points = connectorPoints(connector, positionedById);
    return { connector, points, route: orthogonalPoints(points) };
  });
  const setChartCanvasRef = (node: HTMLDivElement | null) => {
    chartCanvasRef.current = node;
    rootDrop.setNodeRef(node);
  };

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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPenMode((active) => !active);
                  setConnectorDraft(null);
                }}
                aria-pressed={penMode}
                title={penMode ? 'Exit line drawing mode' : 'Draw lines on the chart grid'}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                  penMode
                    ? 'border-green-700 bg-green-700 text-white'
                    : 'border-green-200 bg-white text-green-700 hover:bg-green-50'
                }`}
              >
                <PenLine size={16} />
                {penMode ? 'Done drawing' : 'Draw lines'}
              </button>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                {saving ? 'Saving chart…' : 'Super Admin · Drag to organize'}
              </span>
            </div>
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
                      Drop staff onto the grid to place them. Select Draw lines to sketch right-angle connections on the grid.
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
                  ref={canManage ? setChartCanvasRef : undefined}
                  className={`relative ${canManage && rootDrop.isOver ? 'ring-2 ring-inset ring-blue-300' : ''}`}
                  style={{
                    width: `${canvasWidth}px`,
                    height: `${canvasHeight}px`,
                    backgroundImage:
                      'linear-gradient(to right, rgba(148, 163, 184, 0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.10) 1px, transparent 1px), linear-gradient(to right, rgba(100, 116, 139, 0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(100, 116, 139, 0.22) 1px, transparent 1px)',
                    backgroundSize: `${SNAP_SIZE}px ${SNAP_SIZE}px, ${SNAP_SIZE}px ${SNAP_SIZE}px, ${GRID_SIZE}px ${GRID_SIZE}px, ${GRID_SIZE}px ${GRID_SIZE}px`,
                  }}
                >
                  {canManage && positionedPlacements.length === 0 && (
                    <p className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-gray-500">
                      Drop staff anywhere in this chart to add them as top-level personnel.
                    </p>
                  )}
                  <svg
                    aria-label={penMode ? 'Draw orthogonal chart lines' : undefined}
                    className={`absolute inset-0 z-20 ${
                      canManage && penMode ? 'pointer-events-auto cursor-crosshair touch-none' : 'pointer-events-none'
                    }`}
                    width={canvasWidth}
                    height={canvasHeight}
                    viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                    onPointerDown={beginCanvasDrawing}
                    onPointerMove={moveCanvasDrawing}
                    onPointerUp={finishCanvasDrawing}
                    onPointerCancel={() => setConnectorDraft(null)}
                  >
                    {canManage && penMode && (
                      <rect width={canvasWidth} height={canvasHeight} fill="transparent" />
                    )}
                    {connectorGeometry.map(({ connector, route }) => (
                      <path
                        key={connector.id}
                        d={route.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')}
                        fill="none"
                        stroke="#16a34a"
                        strokeWidth="2.5"
                      />
                    ))}
                    {connectorDraft && (
                      <path
                        d={orthogonalPoints(connectorDraft.points)
                          .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
                          .join(' ')}
                        fill="none"
                        stroke="#16a34a"
                        strokeWidth="2.5"
                        strokeDasharray="6 4"
                      />
                    )}
                  </svg>
                  {!penMode && connectorGeometry.map(({ connector, points }) => (
                    <div key={`handles:${connector.id}`} className="pointer-events-none absolute inset-0 z-20">
                      {points.map((point, pointIndex) => (
                        <button
                          key={`point:${pointIndex}`}
                          type="button"
                          aria-label={pointIndex === 0 || pointIndex === points.length - 1
                            ? 'Drag connector endpoint'
                            : 'Drag connector bend'}
                          title={pointIndex === 0 || pointIndex === points.length - 1
                            ? 'Drag to move or connect this endpoint'
                            : 'Drag to move this bend'}
                          onPointerDown={(event) => canManage && beginConnectorHandle(event, connector, pointIndex)}
                          onPointerMove={(event) => {
                            event.stopPropagation();
                            moveConnectorHandle(event);
                          }}
                          onPointerUp={(event) => {
                            event.stopPropagation();
                            finishConnectorHandle(event);
                          }}
                          onPointerCancel={() => setConnectorHandleDrag(null)}
                          className={`pointer-events-auto absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-green-600 shadow ${
                            canManage ? 'cursor-grab hover:scale-125 active:cursor-grabbing' : 'hidden'
                          }`}
                          style={{ left: point.x, top: point.y }}
                        />
                      ))}
                      {canManage && points.slice(0, -1).map((point, segmentIndex) => {
                        const nextPoint = points[segmentIndex + 1];
                        const midpoint = {
                          x: (point.x + nextPoint.x) / 2,
                          y: (point.y + nextPoint.y) / 2,
                        };
                        return (
                          <button
                            key={`bend:${segmentIndex}`}
                            type="button"
                            aria-label="Add a right-angle bend to connector"
                            title="Add a right-angle bend"
                            onClick={() => addConnectorBend(connector, segmentIndex)}
                            className="pointer-events-auto absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-green-600 text-xs font-bold leading-none text-white shadow hover:scale-125"
                            style={{ left: midpoint.x, top: midpoint.y }}
                          >
                            +
                          </button>
                        );
                      })}
                      {canManage && (
                        <button
                          type="button"
                          aria-label="Delete connector"
                          title="Delete connector"
                          onClick={() => deleteConnector(connector.id)}
                          className="pointer-events-auto absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-red-200 bg-white text-red-600 shadow hover:bg-red-50"
                          style={{
                            left: points.reduce((sum, point) => sum + point.x, 0) / points.length,
                            top: points.reduce((sum, point) => sum + point.y, 0) / points.length,
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
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
