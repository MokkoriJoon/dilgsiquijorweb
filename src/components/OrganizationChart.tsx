import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, Mail, Network, Pencil, Phone, Plus, Save, Trash2, Users, X,
} from 'lucide-react';
import type { MouseEvent as ReactMouseEvent } from 'react';
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
  connector_mode: ConnectorMode;
  manual_waypoints: Point[] | null;
}

interface PositionedPerson extends OrgPerson {
  manager_id: string | null;
  additional_supervisor_ids: string[];
  matrix_connector_mode: ConnectorMode;
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
  connector_mode: ConnectorMode;
  manual_waypoints: Point[] | null;
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

interface RouteRectangle {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface RouteQueueEntry {
  node: number;
  cost: number;
  priority: number;
}

interface RouteNeighbor {
  node: number;
  cost: number;
}

interface RouteSegment {
  from: Point;
  to: Point;
}

interface MatrixConnectorPort {
  supervisorSide: CardSide;
  supervisorPoint: Point;
  reportSide: CardSide;
  reportPoint: Point;
}

type ConnectorMode = 'automatic' | 'manual';

const CARD_WIDTH = 230;
const CARD_HEIGHT = 72;
const HORIZONTAL_GAP = 64;
const VERTICAL_GAP = 104;
const CHART_MARGIN = 32;
const CONNECTOR_PORT_PADDING = 12;
const CONNECTOR_STUB_LENGTH = 18;
const CONNECTOR_CLEARANCE = 12;
const CONNECTOR_LANE_PENALTY = 2000;

function nearestCardSideToPoint(card: PositionedPerson, other: Point): CardSide {
  const deltaX = other.x - (card.x + CARD_WIDTH / 2);
  const deltaY = other.y - (card.y + CARD_HEIGHT / 2);
  if (Math.abs(deltaX) / CARD_WIDTH >= Math.abs(deltaY) / CARD_HEIGHT) {
    return deltaX >= 0 ? 'right' : 'left';
  }
  return deltaY >= 0 ? 'bottom' : 'top';
}

function nearestCardSide(card: PositionedPerson, other: PositionedPerson): CardSide {
  return nearestCardSideToPoint(card, {
    x: other.x + CARD_WIDTH / 2,
    y: other.y + CARD_HEIGHT / 2,
  });
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

function matrixConnectorKey(supervisorId: string, reportId: string): string {
  return `${supervisorId}-${reportId}`;
}

function getMatrixConnectorPorts(
  connectors: MatrixConnector[],
): Map<string, MatrixConnectorPort> {
  const details = connectors.map((connector) => ({
    ...connector,
    key: matrixConnectorKey(connector.supervisor.id, connector.report.id),
    targetSide: nearestCardSide(connector.report, connector.supervisor),
  }));
  const targetGroups = new Map<string, typeof details>();
  const supervisorGroups = new Map<string, typeof details>();

  for (const connector of details) {
    const targetKey = `${connector.report.id}:${connector.targetSide}`;
    const targetGroup = targetGroups.get(targetKey) ?? [];
    targetGroup.push(connector);
    targetGroups.set(targetKey, targetGroup);

    const supervisorGroup = supervisorGroups.get(connector.supervisor.id) ?? [];
    supervisorGroup.push(connector);
    supervisorGroups.set(connector.supervisor.id, supervisorGroup);
  }

  const ports = new Map<string, MatrixConnectorPort>();
  for (const group of targetGroups.values()) {
    const side = group[0].targetSide;
    group.sort((a, b) => side === 'left' || side === 'right'
      ? a.supervisor.y - b.supervisor.y
      : a.supervisor.x - b.supervisor.x);
    group.forEach((connector, index) => {
      ports.set(connector.key, {
        supervisorSide: 'bottom',
        supervisorPoint: { x: 0, y: 0 },
        reportSide: side,
        reportPoint: cardEdgePort(connector.report, side, index, group.length),
      });
    });
  }

  for (const group of supervisorGroups.values()) {
    const center = group.reduce((sum, connector) => ({
      x: sum.x + connector.report.x + CARD_WIDTH / 2,
      y: sum.y + connector.report.y + CARD_HEIGHT / 2,
    }), { x: 0, y: 0 });
    const destination = {
      x: center.x / group.length,
      y: center.y / group.length,
    };
    const supervisor = group[0].supervisor;
    const supervisorSide = destination.y > supervisor.y + CARD_HEIGHT
      ? 'bottom'
      : nearestCardSideToPoint(supervisor, destination);
    const supervisorPoint = cardEdgePort(supervisor, supervisorSide, 0, 1);
    for (const connector of group) {
      const key = matrixConnectorKey(connector.supervisor.id, connector.report.id);
      const port = ports.get(key);
      if (port) {
        port.supervisorSide = supervisorSide;
        port.supervisorPoint = supervisorPoint;
      }
    }
  }
  return ports;
}

function orthogonalRoutePoints(start: Point, waypoints: Point[], end: Point): Point[] {
  const points = [start];
  let current = start;
  for (const waypoint of [...waypoints, end]) {
    if (current.x !== waypoint.x) points.push({ x: waypoint.x, y: current.y });
    if (current.y !== waypoint.y || current.x !== waypoint.x) points.push(waypoint);
    current = waypoint;
  }
  return points.filter((point, index) =>
    index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y,
  );
}

function routePathFromPoints(points: Point[]): string {
  if (points.length === 0) return '';
  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    commands.push(point.x === points[index - 1].x
      ? `V ${point.y}`
      : `H ${point.x}`);
  }
  return commands.join(' ');
}

function manualConnectorPath(
  port: MatrixConnectorPort,
  waypoints: Point[],
): { path: string; routedPoints: Point[] } {
  const sourceStub = offsetFromCard(port.supervisorPoint, port.supervisorSide);
  const targetStub = offsetFromCard(port.reportPoint, port.reportSide);
  const routedPoints = orthogonalRoutePoints(sourceStub, waypoints, targetStub);
  return {
    path: routePathFromPoints([
      port.supervisorPoint,
      ...routedPoints,
      port.reportPoint,
    ]),
    routedPoints,
  };
}

function pushRouteQueue(queue: RouteQueueEntry[], entry: RouteQueueEntry) {
  let index = queue.length;
  queue.push(entry);
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    if (queue[parentIndex].priority <= entry.priority) break;
    queue[index] = queue[parentIndex];
    index = parentIndex;
  }
  queue[index] = entry;
}

function popRouteQueue(queue: RouteQueueEntry[]): RouteQueueEntry | undefined {
  const first = queue[0];
  const last = queue.pop();
  if (!first || !last || queue.length === 0) return first;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= queue.length) break;
    const child = right < queue.length && queue[right].priority < queue[left].priority
      ? right
      : left;
    if (queue[child].priority >= last.priority) break;
    queue[index] = queue[child];
    index = child;
  }
  queue[index] = last;
  return first;
}

function isInsideRouteRectangle(point: Point, rectangles: RouteRectangle[]): boolean {
  return rectangles.some((rectangle) =>
    point.x > rectangle.left && point.x < rectangle.right
    && point.y > rectangle.top && point.y < rectangle.bottom,
  );
}

function isRouteSegmentClear(
  from: Point,
  to: Point,
  rectangles: RouteRectangle[],
): boolean {
  return rectangles.every((rectangle) => {
    if (from.y === to.y) {
      return !(from.y > rectangle.top && from.y < rectangle.bottom
        && Math.max(from.x, to.x) > rectangle.left
        && Math.min(from.x, to.x) < rectangle.right);
    }
    return !(from.x > rectangle.left && from.x < rectangle.right
      && Math.max(from.y, to.y) > rectangle.top
      && Math.min(from.y, to.y) < rectangle.bottom);
  });
}

function getPrimaryConnectorSegments(connectors: ChartConnector[]): RouteSegment[] {
  const segments: RouteSegment[] = [];
  const add = (from: Point, to: Point) => {
    if (from.x !== to.x || from.y !== to.y) segments.push({ from, to });
  };
  for (const { manager, groups } of connectors) {
    const parentCenterX = manager.x + CARD_WIDTH / 2;
    const parentBottom = manager.y + CARD_HEIGHT;
    const busY = parentBottom + 24;
    add({ x: parentCenterX, y: parentBottom }, { x: parentCenterX, y: busY });
    for (const group of groups) {
      if (group.layout === 'vertical') {
        const reports = [...group.reports].sort((a, b) => a.y - b.y);
        const trunkX = group.x - 20;
        const lastReportCenterY = reports[reports.length - 1].y + CARD_HEIGHT / 2;
        add({ x: parentCenterX, y: busY }, { x: trunkX, y: busY });
        add({ x: trunkX, y: busY }, { x: trunkX, y: lastReportCenterY });
        for (const report of reports) {
          add(
            { x: trunkX, y: report.y + CARD_HEIGHT / 2 },
            { x: report.x, y: report.y + CARD_HEIGHT / 2 },
          );
        }
      } else {
        const reports = [...group.reports].sort((a, b) => a.x - b.x);
        const childCenters = reports.map((report) => report.x + CARD_WIDTH / 2);
        const groupBusY = manager.y + CARD_HEIGHT + VERTICAL_GAP - 24;
        add(
          { x: parentCenterX, y: busY },
          { x: group.x + group.width / 2, y: busY },
        );
        add(
          { x: group.x + group.width / 2, y: busY },
          { x: group.x + group.width / 2, y: groupBusY },
        );
        add(
          { x: childCenters[0], y: groupBusY },
          { x: childCenters[childCenters.length - 1], y: groupBusY },
        );
        for (const report of reports) {
          add(
            { x: report.x + CARD_WIDTH / 2, y: groupBusY },
            { x: report.x + CARD_WIDTH / 2, y: report.y },
          );
        }
      }
    }
  }
  return segments;
}

function routeSegmentPenalty(
  from: Point,
  to: Point,
  primarySegments: RouteSegment[],
): number {
  return primarySegments.reduce((penalty, segment) => {
    const primaryHorizontal = segment.from.y === segment.to.y;
    const routeHorizontal = from.y === to.y;
    let intersects = false;
    if (primaryHorizontal && routeHorizontal) {
      intersects = from.y === segment.from.y
        && Math.max(Math.min(from.x, to.x), Math.min(segment.from.x, segment.to.x))
          <= Math.min(Math.max(from.x, to.x), Math.max(segment.from.x, segment.to.x));
    } else if (!primaryHorizontal && !routeHorizontal) {
      intersects = from.x === segment.from.x
        && Math.max(Math.min(from.y, to.y), Math.min(segment.from.y, segment.to.y))
          <= Math.min(Math.max(from.y, to.y), Math.max(segment.from.y, segment.to.y));
    } else {
      const horizontal = routeHorizontal ? { from, to } : segment;
      const vertical = routeHorizontal ? segment : { from, to };
      const horizontalY = horizontal.from.y;
      const verticalX = vertical.from.x;
      intersects = verticalX >= Math.min(horizontal.from.x, horizontal.to.x)
        && verticalX <= Math.max(horizontal.from.x, horizontal.to.x)
        && horizontalY >= Math.min(vertical.from.y, vertical.to.y)
        && horizontalY <= Math.max(vertical.from.y, vertical.to.y);
    }
    return penalty + (intersects ? CONNECTOR_LANE_PENALTY : 0);
  }, 0);
}

function findRouteToTree(
  startNode: number,
  treeNodes: Set<number>,
  xCoordinates: number[],
  yCoordinates: number[],
  rectangles: RouteRectangle[],
  primarySegments: RouteSegment[],
  neighborCache: Map<number, RouteNeighbor[]>,
): number[] | null {
  const width = xCoordinates.length;
  const nodePoint = (node: number): Point => ({
    x: xCoordinates[node % width],
    y: yCoordinates[Math.floor(node / width)],
  });
  const targetPoint = nodePoint(startNode);
  const distances = new Map<number, number>();
  const previous = new Map<number, number>();
  const queue: RouteQueueEntry[] = [];

  for (const treeNode of treeNodes) {
    const point = nodePoint(treeNode);
    const cost = Math.abs(point.x - targetPoint.x) + Math.abs(point.y - targetPoint.y);
    distances.set(treeNode, 0);
    pushRouteQueue(queue, { node: treeNode, cost: 0, priority: cost });
  }

  while (queue.length > 0) {
    const current = popRouteQueue(queue);
    if (!current || current.cost !== distances.get(current.node)) continue;
    if (current.node === startNode) {
      const path = [startNode];
      let node = startNode;
      while (previous.has(node)) {
        node = previous.get(node)!;
        path.push(node);
      }
      return path;
    }

    let neighbors = neighborCache.get(current.node);
    if (!neighbors) {
      const xIndex = current.node % width;
      const yIndex = Math.floor(current.node / width);
      const point = nodePoint(current.node);
      const candidates = [
        xIndex > 0 ? current.node - 1 : -1,
        xIndex + 1 < xCoordinates.length ? current.node + 1 : -1,
        yIndex > 0 ? current.node - width : -1,
        yIndex + 1 < yCoordinates.length ? current.node + width : -1,
      ];
      neighbors = candidates.flatMap((neighbor): RouteNeighbor[] => {
        if (neighbor < 0) return [];
        const neighborPoint = nodePoint(neighbor);
        if (isInsideRouteRectangle(neighborPoint, rectangles)
          || !isRouteSegmentClear(point, neighborPoint, rectangles)) return [];
        return [{
          node: neighbor,
          cost: Math.abs(neighborPoint.x - point.x)
            + Math.abs(neighborPoint.y - point.y),
        }];
      });
      neighborCache.set(current.node, neighbors);
    }

    for (const { node: neighbor, cost } of neighbors) {
      const neighborPoint = nodePoint(neighbor);
      const nextCost = current.cost + cost
        + routeSegmentPenalty(nodePoint(current.node), neighborPoint, primarySegments);
      if (nextCost >= (distances.get(neighbor) ?? Number.POSITIVE_INFINITY)) continue;
      distances.set(neighbor, nextCost);
      previous.set(neighbor, current.node);
      const heuristic = Math.abs(neighborPoint.x - targetPoint.x)
        + Math.abs(neighborPoint.y - targetPoint.y);
      pushRouteQueue(queue, {
        node: neighbor,
        cost: nextCost,
        priority: nextCost + heuristic,
      });
    }
  }
  return null;
}

function buildMatrixConnectorPaths(
  connectors: MatrixConnector[],
  people: PositionedPerson[],
  primaryConnectors: ChartConnector[],
): MatrixConnectorPath[] {
  if (connectors.length === 0) return [];
  const ports = getMatrixConnectorPorts(connectors);
  const primarySegments = getPrimaryConnectorSegments(primaryConnectors);
  const results: MatrixConnectorPath[] = [];

  const rectangles: RouteRectangle[] = people.map((person) => ({
    left: person.x - CONNECTOR_CLEARANCE,
    right: person.x + CARD_WIDTH + CONNECTOR_CLEARANCE,
    top: person.y - CONNECTOR_CLEARANCE,
    bottom: person.y + CARD_HEIGHT + CONNECTOR_CLEARANCE,
  }));
  const autoConnectors: MatrixConnector[] = [];
  for (const connector of connectors) {
    const port = ports.get(matrixConnectorKey(connector.supervisor.id, connector.report.id));
    if (!port) continue;
    const key = matrixConnectorKey(connector.supervisor.id, connector.report.id);
    if (connector.connector_mode === 'manual' && connector.manual_waypoints?.length) {
      const { path, routedPoints } = manualConnectorPath(port, connector.manual_waypoints);
      const isClear = routedPoints.every((point, index) =>
        index === 0 || isRouteSegmentClear(routedPoints[index - 1], point, rectangles),
      );
      if (isClear) {
        results.push({ key, path });
        continue;
      }
    }
    autoConnectors.push(connector);
  }
  if (autoConnectors.length === 0) return results;

  const xSet = new Set<number>();
  const ySet = new Set<number>();
  const addPoint = (point: Point) => {
    xSet.add(point.x);
    ySet.add(point.y);
  };
  for (const rectangle of rectangles) {
    xSet.add(rectangle.left);
    xSet.add(rectangle.right);
    ySet.add(rectangle.top);
    ySet.add(rectangle.bottom);
  }

  const supervisors = new Map<string, MatrixConnector[]>();
  for (const connector of autoConnectors) {
    const group = supervisors.get(connector.supervisor.id) ?? [];
    group.push(connector);
    supervisors.set(connector.supervisor.id, group);
    const port = ports.get(matrixConnectorKey(connector.supervisor.id, connector.report.id));
    if (!port) continue;
    addPoint(port.supervisorPoint);
    addPoint(offsetFromCard(port.supervisorPoint, port.supervisorSide));
    addPoint(offsetFromCard(port.reportPoint, port.reportSide));
    addPoint(port.reportPoint);
  }
  for (const segment of primarySegments) {
    for (const point of [segment.from, segment.to]) {
      xSet.add(point.x - 4);
      xSet.add(point.x + 4);
      ySet.add(point.y - 4);
      ySet.add(point.y + 4);
    }
  }

  const minX = Math.min(...xSet);
  const maxX = Math.max(...xSet);
  const minY = Math.min(...ySet);
  const maxY = Math.max(...ySet);
  xSet.add(Math.max(0, minX - CONNECTOR_STUB_LENGTH * 2));
  xSet.add(maxX + CONNECTOR_STUB_LENGTH * 2);
  ySet.add(Math.max(0, minY - CONNECTOR_STUB_LENGTH * 2));
  ySet.add(maxY + CONNECTOR_STUB_LENGTH * 2);
  const xCoordinates = [...xSet].sort((a, b) => a - b);
  const yCoordinates = [...ySet].sort((a, b) => a - b);
  const xIndexByValue = new Map(xCoordinates.map((value, index) => [value, index]));
  const yIndexByValue = new Map(yCoordinates.map((value, index) => [value, index]));
  const toNode = (point: Point) =>
    yIndexByValue.get(point.y)! * xCoordinates.length + xIndexByValue.get(point.x)!;
  const pointFor = (node: number): Point => ({
    x: xCoordinates[node % xCoordinates.length],
    y: yCoordinates[Math.floor(node / xCoordinates.length)],
  });
  const neighborCache = new Map<number, RouteNeighbor[]>();

  for (const [supervisorId, group] of supervisors) {
    const { supervisorSide, supervisorPoint } = ports.get(
      matrixConnectorKey(group[0].supervisor.id, group[0].report.id),
    )!;
    const sourceStub = offsetFromCard(supervisorPoint, supervisorSide);
    const edges = new Map<number, Set<number>>();
    const addEdge = (from: number, to: number) => {
      const fromEdges = edges.get(from) ?? new Set<number>();
      const toEdges = edges.get(to) ?? new Set<number>();
      fromEdges.add(to);
      toEdges.add(from);
      edges.set(from, fromEdges);
      edges.set(to, toEdges);
    };

    const sourceAnchorNode = toNode(supervisorPoint);
    const sourceStubNode = toNode(sourceStub);
    addEdge(sourceAnchorNode, sourceStubNode);
    const treeNodes = new Set([sourceStubNode]);
    const sortedGroup = [...group].sort((a, b) =>
      a.report.x - b.report.x || a.report.y - b.report.y,
    );
    for (const connector of sortedGroup) {
      const port = ports.get(matrixConnectorKey(connector.supervisor.id, connector.report.id));
      if (!port) continue;
      const targetStub = offsetFromCard(port.reportPoint, port.reportSide);
      const targetStubNode = toNode(targetStub);
      const path = findRouteToTree(
        targetStubNode,
        treeNodes,
        xCoordinates,
        yCoordinates,
        rectangles,
        primarySegments,
        neighborCache,
      );
      if (!path) continue;
      for (let index = 0; index < path.length - 1; index += 1) {
        addEdge(path[index], path[index + 1]);
        treeNodes.add(path[index]);
      }
      treeNodes.add(targetStubNode);
      addEdge(targetStubNode, toNode(port.reportPoint));
    }

    const visited = new Set<string>();
    const canonicalEdge = (left: number, right: number) =>
      left < right ? `${left}:${right}` : `${right}:${left}`;
    const pathParts: string[] = [];
    const trace = (start: number, next: number) => {
      const points = [start];
      let previous = start;
      let current = next;
      visited.add(canonicalEdge(previous, current));
      points.push(current);
      while ((edges.get(current)?.size ?? 0) === 2) {
        const following = [...(edges.get(current) ?? [])].find((node) => node !== previous);
        if (following === undefined) break;
        const edge = canonicalEdge(current, following);
        if (visited.has(edge)) break;
        visited.add(edge);
        previous = current;
        current = following;
        points.push(current);
      }
      const firstPoint = pointFor(points[0]);
      const commands = [`M ${firstPoint.x} ${firstPoint.y}`];
      for (let index = 1; index < points.length; index += 1) {
        const point = pointFor(points[index]);
        commands.push(point.x === pointFor(points[index - 1]).x
          ? `V ${point.y}`
          : `H ${point.x}`);
      }
      pathParts.push(commands.join(' '));
    };

    for (const [node, neighbors] of edges) {
      if (neighbors.size === 2) continue;
      for (const neighbor of neighbors) {
        if (!visited.has(canonicalEdge(node, neighbor))) trace(node, neighbor);
      }
    }
    for (const [node, neighbors] of edges) {
      for (const neighbor of neighbors) {
        if (!visited.has(canonicalEdge(node, neighbor))) trace(node, neighbor);
      }
    }
    results.push({ key: supervisorId, path: pathParts.join(' ') });
  }

  return results;
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
    connectorMode: ConnectorMode,
  ) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [chartLabel, setChartLabel] = useState(person.chart_label ?? '');
  const [managerId, setManagerId] = useState(person.manager_id);
  const [additionalSupervisorIds, setAdditionalSupervisorIds] = useState<string[]>(
    person.additional_supervisor_ids.filter((id) => id !== person.manager_id),
  );
  const [connectorMode, setConnectorMode] = useState<ConnectorMode>(
    person.matrix_connector_mode,
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
        connectorMode,
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
    setConnectorMode(person.matrix_connector_mode);
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
              <label htmlFor="org-chart-connector-mode" className="mb-1 block text-sm font-medium text-gray-700">
                Additional connector routing
              </label>
              <select
                id="org-chart-connector-mode"
                value={connectorMode}
                onChange={(event) => setConnectorMode(event.target.value as ConnectorMode)}
                disabled={additionalSupervisorIds.length === 0}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
              >
                <option value="automatic">Automatic (avoid personnel and reporting lines)</option>
                <option value="manual">Manual (draw routes on the chart)</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                This applies to every additional supervisor selected above. Manual routes can be drawn after saving.
              </p>
            </div>
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
  const [manualRouteKey, setManualRouteKey] = useState('');
  const [draftWaypoints, setDraftWaypoints] = useState<Point[]>([]);
  const [routeSaving, setRouteSaving] = useState(false);
  const [routeError, setRouteError] = useState('');
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
        .select('profile_id,supervisor_id,connector_mode,manual_waypoints'),
    ]);

    if (peopleResult.error || placementResult.error || supervisorResult.error) {
      const message = peopleResult.error?.message
        ?? placementResult.error?.message
        ?? supervisorResult.error?.message
        ?? 'Could not load the organization chart.';
      setError(
        /contact_phone|is_focal_person|programs|org_chart_positions|org_chart_supervisors|connector_mode|manual_waypoints|chart_label|children_layout|report_groups|schema cache|does not exist/i.test(message)
          ? 'The organization chart database migrations are not installed. Run the migrations in supabase/organizational_chart_migration.sql, supabase/focal_person_programs_migration.sql, supabase/org_chart_layout_preferences_migration.sql, supabase/org_chart_mixed_report_groups_migration.sql, supabase/org_chart_multiple_supervisors_migration.sql, and supabase/org_chart_manual_supervisor_routes_migration.sql in Supabase SQL Editor, then reload.'
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
    const supervisorsByPerson = new Map<string, SecondarySupervisor[]>();
    for (const relationship of secondarySupervisors) {
      const current = supervisorsByPerson.get(relationship.profile_id) ?? [];
      current.push(relationship);
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
        additional_supervisor_ids: (supervisorsByPerson.get(node.person.id) ?? [])
          .map(({ supervisor_id }) => supervisor_id),
        matrix_connector_mode: (supervisorsByPerson.get(node.person.id) ?? [])
          .some(({ connector_mode }) => connector_mode === 'manual')
          ? 'manual'
          : 'automatic',
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
    const matrixSettingsByKey = new Map(secondarySupervisors.map((relationship) => [
      matrixConnectorKey(relationship.supervisor_id, relationship.profile_id),
      relationship,
    ]));
    for (const report of positionedPeople) {
      for (const supervisorId of report.additional_supervisor_ids) {
        const supervisor = positionedMap.get(supervisorId);
        if (!supervisor || supervisor.id === report.manager_id) continue;
        const settings = matrixSettingsByKey.get(matrixConnectorKey(supervisor.id, report.id));
        matrixConnectors.push({
          supervisor,
          report,
          connector_mode: settings?.connector_mode ?? 'automatic',
          manual_waypoints: settings?.manual_waypoints ?? [],
        });
      }
    }

    return { positionedPeople, connectors, matrixConnectors };
  }, [people, placements, secondarySupervisors]);

  const matrixConnectorPaths = useMemo(
    () => buildMatrixConnectorPaths(
      layout.matrixConnectors,
      layout.positionedPeople,
      layout.connectors,
    ),
    [layout.matrixConnectors, layout.positionedPeople, layout.connectors],
  );

  const saveChartSettings = async (
    person: PositionedPerson,
    chartLabel: string,
    managerId: string | null,
    additionalSupervisorIds: string[],
    childrenLayout: ChildrenLayout,
    reportGroups: ReportGroup[],
    connectorMode: ConnectorMode,
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
      p_connector_mode: connectorMode,
    });
    if (saveError) throw new Error(saveError.message);

    await fetchData();
    setSelectedPerson((current) => current?.id === person.id
      ? {
          ...current,
          manager_id: managerId,
          additional_supervisor_ids: supervisorIds,
          matrix_connector_mode: connectorMode,
          chart_label: chartLabel || null,
          children_layout: childrenLayout,
          report_groups: normalizedGroups,
        }
      : current);
  };

  const manualConnectors = layout.matrixConnectors.filter(
    (connector) => connector.connector_mode === 'manual',
  );
  const connectorCanvasPadding = manualConnectors.length > 0
    ? 240
    : matrixConnectorPaths.length > 0
      ? CONNECTOR_STUB_LENGTH * 2
      : 0;
  const canvasWidth = Math.max(
    800,
    viewportWidth,
    ...layout.positionedPeople.map(
      (person) => person.x + CARD_WIDTH + CHART_MARGIN + connectorCanvasPadding,
    ),
  );
  const canvasHeight = Math.max(
    480,
    ...layout.positionedPeople.map(
      (person) => person.y + CARD_HEIGHT + CHART_MARGIN + connectorCanvasPadding,
    ),
  );
  const activeManualConnector = manualConnectors.find((connector) =>
    matrixConnectorKey(connector.supervisor.id, connector.report.id) === manualRouteKey,
  );
  const activeManualPort = activeManualConnector
    ? getMatrixConnectorPorts(layout.matrixConnectors).get(manualRouteKey)
    : undefined;
  const activeManualPreview = activeManualConnector && activeManualPort
    ? manualConnectorPath(activeManualPort, draftWaypoints)
    : undefined;
  const routeRectangles: RouteRectangle[] = layout.positionedPeople.map((person) => ({
    left: person.x - CONNECTOR_CLEARANCE,
    right: person.x + CARD_WIDTH + CONNECTOR_CLEARANCE,
    top: person.y - CONNECTOR_CLEARANCE,
    bottom: person.y + CARD_HEIGHT + CONNECTOR_CLEARANCE,
  }));
  const activeRouteIsClear = activeManualPreview?.routedPoints.every((point, index) =>
    index === 0 || isRouteSegmentClear(
      activeManualPreview.routedPoints[index - 1],
      point,
      routeRectangles,
    ),
  ) ?? false;

  const addManualWaypoint = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!activeManualConnector || !activeManualPort) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const waypoint = {
      x: Math.max(0, Math.round((event.clientX - bounds.left) / 8) * 8),
      y: Math.max(0, Math.round((event.clientY - bounds.top) / 8) * 8),
    };
    setDraftWaypoints((current) => [...current, waypoint]);
    setRouteError('');
  };

  const saveManualRoute = async () => {
    if (!activeManualConnector || !draftWaypoints.length || !activeRouteIsClear) return;
    setRouteSaving(true);
    setRouteError('');
    try {
      const { error: saveError } = await supabase.rpc('save_org_chart_supervisor_route', {
        p_profile_id: activeManualConnector.report.id,
        p_supervisor_id: activeManualConnector.supervisor.id,
        p_manual_waypoints: draftWaypoints,
      });
      if (saveError) throw new Error(saveError.message);
      await fetchData();
      setManualRouteKey('');
      setDraftWaypoints([]);
    } catch (saveError) {
      setRouteError(saveError instanceof Error ? saveError.message : 'Could not save this route.');
    } finally {
      setRouteSaving(false);
    }
  };

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

        {isSuperAdmin && manualConnectors.length > 0 && (
          <div className="mb-4 space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
            <label htmlFor="org-chart-manual-route" className="block text-sm font-semibold text-gray-800">
              Manually draw a dashed connector
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                id="org-chart-manual-route"
                value={manualRouteKey}
                onChange={(event) => {
                  const key = event.target.value;
                  const connector = manualConnectors.find((item) =>
                    matrixConnectorKey(item.supervisor.id, item.report.id) === key,
                  );
                  setManualRouteKey(key);
                  setDraftWaypoints(connector?.manual_waypoints ?? []);
                  setRouteError('');
                }}
                className="min-w-[220px] flex-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Choose a supervisor and report</option>
                {manualConnectors.map((connector) => (
                  <option
                    key={matrixConnectorKey(connector.supervisor.id, connector.report.id)}
                    value={matrixConnectorKey(connector.supervisor.id, connector.report.id)}
                  >
                    {toProfileTitleCase(connector.supervisor.full_name) || 'Staff Member'}
                    {' → '}
                    {toProfileTitleCase(connector.report.full_name) || 'Staff Member'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setDraftWaypoints((points) => points.slice(0, -1));
                  setRouteError('');
                }}
                disabled={!manualRouteKey || draftWaypoints.length === 0 || routeSaving}
                className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-violet-800 disabled:opacity-50"
              >
                Undo point
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftWaypoints([]);
                  setRouteError('');
                }}
                disabled={!manualRouteKey || draftWaypoints.length === 0 || routeSaving}
                className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-violet-800 disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => void saveManualRoute()}
                disabled={!activeManualConnector || !draftWaypoints.length || !activeRouteIsClear || routeSaving}
                className="flex items-center gap-1 rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
              >
                <Check size={15} /> {routeSaving ? 'Saving…' : 'Save route'}
              </button>
              {manualRouteKey && (
                <button
                  type="button"
                  onClick={() => {
                    setManualRouteKey('');
                    setDraftWaypoints([]);
                    setRouteError('');
                  }}
                  disabled={routeSaving}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-white"
                >
                  Cancel
                </button>
              )}
            </div>
            {manualRouteKey && (
              <p className="text-xs text-gray-600">
                Click open grid points to add corners; each segment stays horizontal or vertical.
                Avoid personnel cards and solid reporting lines.
                {!activeRouteIsClear && (
                  <span className="ml-1 font-semibold text-red-700">
                    The current route crosses a personnel card; adjust its points to save.
                  </span>
                )}
              </p>
            )}
            {routeError && (
              <p role="alert" className="text-sm text-red-700">{routeError}</p>
            )}
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
              className={`relative ${manualRouteKey ? 'cursor-crosshair' : ''}`}
              onClick={addManualWaypoint}
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
                {activeManualPreview && (
                  <path
                    d={activeManualPreview.path}
                    fill="none"
                    stroke={activeRouteIsClear ? '#7c3aed' : '#dc2626'}
                    strokeWidth="3"
                    strokeDasharray="6 4"
                  />
                )}
              </svg>
              {layout.positionedPeople.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={(event) => {
                    if (manualRouteKey) {
                      event.stopPropagation();
                      return;
                    }
                    setSelectedPerson(person);
                  }}
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
          onSave={(chartLabel, managerId, additionalSupervisorIds, childrenLayout, reportGroups, connectorMode) =>
            saveChartSettings(
              selectedPerson,
              chartLabel,
              managerId,
              additionalSupervisorIds,
              childrenLayout,
              reportGroups,
              connectorMode,
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
