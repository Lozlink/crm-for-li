import { useMemo } from 'react';
import { useTrackingStore } from './useTrackingStore';
import { useCRMStore } from './useCRMStore';
import { usePropertyStore } from './usePropertyStore';
import { useInspectionStore } from './useInspectionStore';
import { useAuthStore } from './useAuthStore';
import type { Contact, Property, TrackingSession, TrackingAnnotation, Inspection } from '@realestate-crm/types';

// ── Types ────────────────────────────────────────────────────────────

export interface ProspectingPeriodMetrics {
  doors: number;
  sessions: number;
  distanceMeters: number;
  durationSeconds: number;
  contactsCreated: number;
  phoneCaptures: number;
  phoneCaptureRate: number;
}

export interface ProspectingTrend {
  current: number;
  previous: number;
  /** Percentage change: positive = up, negative = down, null = no previous data */
  changePercent: number | null;
}

export interface ConversionFunnel {
  fieldContacts: number;
  withPhone: number;
  appraisals: number;
  listed: number;
  settled: number;
  rates: {
    phoneCapture: number;
    contactToAppraisal: number;
    appraisalToListed: number;
    listedToSettled: number;
  };
}

export interface StaleStreet {
  streetName: string;
  suburb: string;
  contactCount: number;
  daysSinceLastContact: number | null;
  averageLatitude: number;
  averageLongitude: number;
}

export interface WeeklyTrendPoint {
  weekLabel: string;
  weekStart: Date;
  value: number;
}

// ── Phase 2 Types ────────────────────────────────────────────────────

export interface InspectionMetrics {
  totalCompleted: number;
  avgAttendees: number;
  interestDistribution: { hot: number; warm: number; cold: number };
  attendeeToContactRate: number;
}

export interface RecommendedArea {
  streetName: string;
  suburb: string;
  score: number;
  reason: string;
  contactCount: number;
  daysSinceLastContact: number | null;
  averageLatitude: number;
  averageLongitude: number;
}

export interface ProspectingStreak {
  currentDays: number;
  longestDays: number;
  isActiveToday: boolean;
  weeklyTarget: number;
  weeklyProgress: number;
  weeklyProgressPercent: number;
}

export interface MultiDwellingBuilding {
  address: string;
  totalUnitsVisited: number;
  uniqueUnits: string[];
  lastVisited: string | null;
  latitude: number;
  longitude: number;
}

export interface TeamMemberMetrics {
  userId: string;
  displayName: string;
  metrics: ProspectingPeriodMetrics;
  trend: ProspectingTrend;
  streak: number;
}

// ── Combined interface ───────────────────────────────────────────────

export interface ProspectingMetrics {
  // Phase 1
  today: ProspectingPeriodMetrics;
  thisWeek: ProspectingPeriodMetrics;
  lastWeek: ProspectingPeriodMetrics;
  trends: {
    doors: ProspectingTrend;
    contacts: ProspectingTrend;
    distance: ProspectingTrend;
    phoneCaptureRate: ProspectingTrend;
  };
  funnel: ConversionFunnel;
  staleStreets: StaleStreet[];
  weeklyDoorsTrend: WeeklyTrendPoint[];
  weeklyContactsTrend: WeeklyTrendPoint[];
  // Phase 2+3
  streak: ProspectingStreak;
  inspectionMetrics: InspectionMetrics;
  recommendedAreas: RecommendedArea[];
  multiDwellingBuildings: MultiDwellingBuilding[];
  monthlyDoorsTrend: WeeklyTrendPoint[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const dayOfWeek = d.getDay();
  // Monday-based week (Australian convention)
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function weeksAgo(n: number): Date {
  const d = startOfWeek(new Date());
  d.setDate(d.getDate() - n * 7);
  return d;
}

function isInRange(dateStr: string | undefined, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  return t >= start.getTime() && t < end.getTime();
}

function computeTrend(current: number, previous: number): ProspectingTrend {
  if (previous === 0) {
    return { current, previous, changePercent: current > 0 ? 100 : null };
  }
  return {
    current,
    previous,
    changePercent: Math.round(((current - previous) / previous) * 100),
  };
}

function formatWeekLabel(date: Date): string {
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function parseSuburb(address: string | undefined): string | null {
  if (!address) return null;
  const parts = address.split(',').map(s => s.trim());
  let suburb: string | null = null;
  if (parts.length >= 3) suburb = parts[1];
  else if (parts.length === 2) suburb = parts[0];
  if (!suburb) return null;
  // Strip state + postcode suffix: "Greenfield Park NSW 2176" → "Greenfield Park"
  return suburb.replace(/\s+(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s*\d{0,4}\s*$/i, '').trim() || null;
}

// ── Metric computation ───────────────────────────────────────────────

function computePeriodMetrics(
  sessions: TrackingSession[],
  annotations: TrackingAnnotation[],
  contacts: Contact[],
  start: Date,
  end: Date,
): ProspectingPeriodMetrics {
  const periodSessions = sessions.filter(s => isInRange(s.started_at, start, end));
  const periodAnnotations = annotations.filter(a => isInRange(a.created_at, start, end));
  const periodContacts = contacts.filter(c => c.first_name && isInRange(c.created_at, start, end));

  const doors = periodAnnotations.length;
  const sessionsCount = periodSessions.length;
  const distanceMeters = periodSessions.reduce((sum, s) => sum + (s.total_distance_meters ?? 0), 0);
  const durationSeconds = periodSessions.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  const contactsCreated = periodContacts.length;
  const phoneCaptures = periodContacts.filter(c => c.phone).length;
  const phoneCaptureRate = contactsCreated > 0 ? Math.round((phoneCaptures / contactsCreated) * 100) : 0;

  return { doors, sessions: sessionsCount, distanceMeters, durationSeconds, contactsCreated, phoneCaptures, phoneCaptureRate };
}

function computeFunnel(contacts: Contact[], properties: Property[]): ConversionFunnel {
  // Field contacts = contacts with lat/lng (came from field work)
  const fieldContacts = contacts.filter(c => c.first_name && c.latitude != null && c.longitude != null);
  const withPhone = fieldContacts.filter(c => c.phone).length;

  // Properties that have a linked contact from field work
  const fieldContactIds = new Set(fieldContacts.map(c => c.id));
  const linkedProperties = properties.filter(p =>
    p.property_contacts?.some(pc => fieldContactIds.has(pc.contact_id))
  );

  const appraisals = linkedProperties.filter(p => p.status === 'appraisal').length;
  const listed = linkedProperties.filter(p => p.status === 'available' || p.status === 'under_offer' || p.status === 'exchanged').length;
  const settled = linkedProperties.filter(p => p.status === 'settled' || p.status === 'leased').length;

  const total = fieldContacts.length || 1; // avoid division by zero

  return {
    fieldContacts: fieldContacts.length,
    withPhone,
    appraisals,
    listed,
    settled,
    rates: {
      phoneCapture: fieldContacts.length > 0 ? Math.round((withPhone / fieldContacts.length) * 100) : 0,
      contactToAppraisal: Math.round(((appraisals + listed + settled) / total) * 100),
      appraisalToListed: appraisals > 0 ? Math.round((listed / (appraisals + listed + settled || 1)) * 100) : 0,
      listedToSettled: listed > 0 ? Math.round((settled / (listed + settled || 1)) * 100) : 0,
    },
  };
}

function computeStaleStreets(contacts: Contact[]): StaleStreet[] {
  const streetMap = new Map<string, {
    contacts: Contact[];
    latSum: number;
    lngSum: number;
    suburb: string;
    lastContactedAt: Date | null;
  }>();

  for (const c of contacts) {
    if (!c.address || !c.latitude || !c.longitude) continue;
    // Extract street name (first part of address before comma)
    const streetPart = c.address.split(',')[0]?.trim();
    if (!streetPart) continue;
    const suburb = parseSuburb(c.address) || 'Unknown';
    const key = `${streetPart}|${suburb}`;

    const existing = streetMap.get(key);
    const contactDate = c.last_contacted_at ? new Date(c.last_contacted_at) : (c.created_at ? new Date(c.created_at) : null);

    if (existing) {
      existing.contacts.push(c);
      existing.latSum += c.latitude;
      existing.lngSum += c.longitude;
      if (contactDate && (!existing.lastContactedAt || contactDate > existing.lastContactedAt)) {
        existing.lastContactedAt = contactDate;
      }
    } else {
      streetMap.set(key, {
        contacts: [c],
        latSum: c.latitude,
        lngSum: c.longitude,
        suburb,
        lastContactedAt: contactDate,
      });
    }
  }

  const now = Date.now();
  const streets: StaleStreet[] = [];

  for (const [key, data] of streetMap) {
    const streetName = key.split('|')[0];
    const count = data.contacts.length;
    const daysSince = data.lastContactedAt
      ? Math.floor((now - data.lastContactedAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    streets.push({
      streetName,
      suburb: data.suburb,
      contactCount: count,
      daysSinceLastContact: daysSince,
      averageLatitude: data.latSum / count,
      averageLongitude: data.lngSum / count,
    });
  }

  // Sort by staleness (oldest first), then by contact count (more contacts = higher priority)
  return streets
    .filter(s => s.daysSinceLastContact === null || s.daysSinceLastContact > 7)
    .sort((a, b) => {
      const aDays = a.daysSinceLastContact ?? 999;
      const bDays = b.daysSinceLastContact ?? 999;
      if (bDays !== aDays) return bDays - aDays;
      return b.contactCount - a.contactCount;
    })
    .slice(0, 10);
}

function computeWeeklyTrend(
  items: { dateStr: string | undefined }[],
  weeks: number,
): WeeklyTrendPoint[] {
  const points: WeeklyTrendPoint[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = weeksAgo(i);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const count = items.filter(item => isInRange(item.dateStr, weekStart, weekEnd)).length;
    points.push({
      weekLabel: formatWeekLabel(weekStart),
      weekStart,
      value: count,
    });
  }

  return points;
}

// ── Phase 2+3 Computations ───────────────────────────────────────────

function computeStreak(sessions: TrackingSession[]): ProspectingStreak {
  const now = new Date();
  const todayStr = startOfDay(now).toISOString().slice(0, 10);
  const weeklyTarget = 50; // default doors/week target

  // Get unique days with sessions (sorted descending)
  const sessionDays = new Set<string>();
  for (const s of sessions) {
    if (s.started_at) {
      sessionDays.add(new Date(s.started_at).toISOString().slice(0, 10));
    }
  }
  const sortedDays = [...sessionDays].sort().reverse();

  const isActiveToday = sortedDays[0] === todayStr;

  // Count consecutive days backward from today (or yesterday if not active today)
  let currentDays = 0;
  const startCheck = startOfDay(now);
  if (!isActiveToday) {
    startCheck.setDate(startCheck.getDate() - 1);
  }

  const checkDate = new Date(startCheck);
  while (sessionDays.has(checkDate.toISOString().slice(0, 10))) {
    currentDays++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // Find longest streak
  let longestDays = 0;
  let streakCount = 0;
  let prevDay: Date | null = null;
  for (const dayStr of [...sessionDays].sort()) {
    const day = new Date(dayStr);
    if (prevDay && (day.getTime() - prevDay.getTime()) === 86400000) {
      streakCount++;
    } else {
      streakCount = 1;
    }
    longestDays = Math.max(longestDays, streakCount);
    prevDay = day;
  }

  // Weekly progress (doors this week)
  const thisWeekStart = startOfWeek(now);
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);
  // We don't have annotations here, so use session count * rough estimate
  // The actual door count comes from the main metrics — this is a lightweight proxy
  const weekSessions = sessions.filter(s => isInRange(s.started_at, thisWeekStart, thisWeekEnd));
  const weeklyProgress = weekSessions.length;

  return {
    currentDays,
    longestDays,
    isActiveToday,
    weeklyTarget,
    weeklyProgress,
    weeklyProgressPercent: Math.min(100, Math.round((weeklyProgress / weeklyTarget) * 100)),
  };
}

function computeInspectionMetrics(inspections: Inspection[]): InspectionMetrics {
  const completed = inspections.filter(i => i.status === 'completed');
  const totalCompleted = completed.length;

  let totalAttendees = 0;
  let hot = 0;
  let warm = 0;
  let cold = 0;
  let attendeesWithContact = 0;

  for (const insp of completed) {
    const attendees = insp.attendees || [];
    totalAttendees += attendees.length;
    for (const a of attendees) {
      if (a.interest_level === 'hot') hot++;
      else if (a.interest_level === 'warm') warm++;
      else cold++;
      if (a.contact_id) attendeesWithContact++;
    }
  }

  return {
    totalCompleted,
    avgAttendees: totalCompleted > 0 ? Math.round((totalAttendees / totalCompleted) * 10) / 10 : 0,
    interestDistribution: { hot, warm, cold },
    attendeeToContactRate: totalAttendees > 0 ? Math.round((attendeesWithContact / totalAttendees) * 100) : 0,
  };
}

function computeRecommendedAreas(staleStreets: StaleStreet[], properties: Property[]): RecommendedArea[] {
  // Score each stale street: staleness * 0.4 + density * 0.3 + past success * 0.3
  const maxContacts = Math.max(...staleStreets.map(s => s.contactCount), 1);

  // Check if any property was listed near each street
  const propertySuburbs = new Set(properties.filter(p => p.status !== 'withdrawn').map(p => p.suburb?.toLowerCase()));

  return staleStreets.map(street => {
    const staleness = Math.min((street.daysSinceLastContact ?? 60) / 60, 1);
    const density = street.contactCount / maxContacts;
    const hasSuccess = propertySuburbs.has(street.suburb.toLowerCase()) ? 1 : 0;

    const score = staleness * 0.4 + density * 0.3 + hasSuccess * 0.3;

    let reason = '';
    if (staleness > 0.5 && density > 0.3) reason = 'High density, needs revisit';
    else if (hasSuccess) reason = 'Past listings in area';
    else if (staleness > 0.7) reason = 'Getting stale';
    else reason = 'Good prospects';

    return {
      streetName: street.streetName,
      suburb: street.suburb,
      score: Math.round(score * 100),
      reason,
      contactCount: street.contactCount,
      daysSinceLastContact: street.daysSinceLastContact,
      averageLatitude: street.averageLatitude,
      averageLongitude: street.averageLongitude,
    };
  })
  .sort((a, b) => b.score - a.score)
  .slice(0, 10);
}

function computeMultiDwellingBuildings(annotations: TrackingAnnotation[]): MultiDwellingBuilding[] {
  // Parse [Unit X] annotations and group by approximate location
  const buildings = new Map<string, {
    units: Set<string>;
    lastVisited: string | null;
    lat: number;
    lng: number;
    address: string;
  }>();

  const unitRegex = /^\[Unit\s+([^\]]+)\]/i;

  for (const a of annotations) {
    const match = a.note.match(unitRegex);
    if (!match) continue;

    // Group by rounded coordinates (~50m precision)
    const latKey = (Math.round(a.latitude * 10000) / 10000).toFixed(4);
    const lngKey = (Math.round(a.longitude * 10000) / 10000).toFixed(4);
    const key = `${latKey},${lngKey}`;

    const existing = buildings.get(key);
    if (existing) {
      existing.units.add(match[1].trim());
      if (a.created_at && (!existing.lastVisited || a.created_at > existing.lastVisited)) {
        existing.lastVisited = a.created_at;
      }
    } else {
      buildings.set(key, {
        units: new Set([match[1].trim()]),
        lastVisited: a.created_at || null,
        lat: a.latitude,
        lng: a.longitude,
        address: a.note.replace(unitRegex, '').replace(/^\s*[-—]\s*/, '').trim() || `${latKey}, ${lngKey}`,
      });
    }
  }

  return [...buildings.entries()]
    .filter(([, b]) => b.units.size >= 2) // Only multi-unit
    .map(([, b]) => ({
      address: b.address,
      totalUnitsVisited: b.units.size,
      uniqueUnits: [...b.units].sort(),
      lastVisited: b.lastVisited,
      latitude: b.lat,
      longitude: b.lng,
    }))
    .sort((a, b) => b.totalUnitsVisited - a.totalUnitsVisited)
    .slice(0, 20);
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useProspectingMetrics(): ProspectingMetrics {
  const sessions = useTrackingStore(s => s.sessions);
  const allAnnotations = useTrackingStore(s => s.allAnnotations);
  const contacts = useCRMStore(s => s.contacts);
  const properties = usePropertyStore(s => s.properties);
  const inspections = useInspectionStore(s => s.inspections);

  return useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const thisWeekStart = startOfWeek(now);
    const thisWeekEnd = new Date(thisWeekStart);
    thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);

    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    // Phase 1: Period metrics
    const today = computePeriodMetrics(sessions, allAnnotations, contacts, todayStart, todayEnd);
    const thisWeek = computePeriodMetrics(sessions, allAnnotations, contacts, thisWeekStart, thisWeekEnd);
    const lastWeek = computePeriodMetrics(sessions, allAnnotations, contacts, lastWeekStart, thisWeekStart);

    // Phase 1: Trends (WoW)
    const trends = {
      doors: computeTrend(thisWeek.doors, lastWeek.doors),
      contacts: computeTrend(thisWeek.contactsCreated, lastWeek.contactsCreated),
      distance: computeTrend(thisWeek.distanceMeters, lastWeek.distanceMeters),
      phoneCaptureRate: computeTrend(thisWeek.phoneCaptureRate, lastWeek.phoneCaptureRate),
    };

    // Phase 1: Conversion funnel
    const funnel = computeFunnel(contacts, properties);

    // Phase 1: Stale streets
    const staleStreets = computeStaleStreets(contacts);

    // Phase 1: Weekly trends (4 weeks)
    const weeklyDoorsTrend = computeWeeklyTrend(
      allAnnotations.map(a => ({ dateStr: a.created_at })),
      4,
    );
    const weeklyContactsTrend = computeWeeklyTrend(
      contacts.filter(c => c.first_name).map(c => ({ dateStr: c.created_at })),
      4,
    );

    // Phase 2: Streak
    const streak = computeStreak(sessions);

    // Phase 2: Inspection metrics
    const inspectionMetrics = computeInspectionMetrics(inspections);

    // Phase 3: Recommended areas
    const recommendedAreas = computeRecommendedAreas(staleStreets, properties);

    // Phase 3: Multi-dwelling buildings
    const multiDwellingBuildings = computeMultiDwellingBuildings(allAnnotations);

    // Phase 2: Monthly trends (12 weeks)
    const monthlyDoorsTrend = computeWeeklyTrend(
      allAnnotations.map(a => ({ dateStr: a.created_at })),
      12,
    );

    return {
      today,
      thisWeek,
      lastWeek,
      trends,
      funnel,
      staleStreets,
      weeklyDoorsTrend,
      weeklyContactsTrend,
      streak,
      inspectionMetrics,
      recommendedAreas,
      multiDwellingBuildings,
      monthlyDoorsTrend,
    };
  }, [sessions, allAnnotations, contacts, properties, inspections]);
}
