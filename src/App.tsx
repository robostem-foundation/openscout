import {
  Activity,
  Award as AwardIcon,
  BarChart3,
  CalendarDays,
  House,
  Check,
  ChevronDown,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  CornerDownLeft,
  Crown,
  ExternalLink,
  Eye,
  FilePlus2,
  Gamepad2,
  Info,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  GripVertical,
  List,
  ListFilter,
  ListOrdered,
  Link as LinkIcon,
  MinusCircle,
  LogIn,
  LogOut,
  MapPin,
  Medal,
  Menu,
  Palette,
  PanelRight,
  Pause,
  Plus,
  Play,
  Printer,
  RotateCw,
  Save,
  Scale,
  Search,
  Settings,
  Shield,
  Star,
  StickyNote,
  Clock,
  TrendingUp,
  Trophy,
  Tv,
  Tv2,
  Unlink,
  User,
  UserMinus,
  Users,
  X,
  Youtube,
  Zap,
} from "lucide-react";
import { Component, createContext, Fragment, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Dispatch, ErrorInfo, KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject, SetStateAction } from "react";
import DOMPurify from "dompurify";
import { api } from "./api";
import JumperPage from "./jumper/JumperPage.jsx";
import { clearTrail, getTrail, recordTrail, refreshTrailLabel, subscribeTrail } from "./breadcrumbs";
import { AUTH_PROGRAMS, AuthSlot, OnboardingModal, programLabel, SignedOut, SignInButtons, suggestedName, useAuth, useOutsideClick } from "./auth";
import { dayToNumber, daysUntilEventDay, eventDayMs, eventDayNumber, eventDayToUtcNoon, eventDayYear, eventDayParts, formatEventDay, formatEventDayPadded, todayInZone } from "./event-dates";
import { readSearchBias, syncSearchBias, toGradeCode, useSearchBias } from "./search-bias";
import { loadCachedWorldSkills, useWorldSkillsVersion, worldSkillsMeta } from "./world-skills-cache";
import { getSpotlightTierVersion, isSpotlightSku, subscribeSpotlightTier, useSpotlightTier } from "./spotlightTier";
import { setTheme as applyTheme, useTheme } from "./theme";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { fade, revealUp, slideInLeft, springSmooth } from "@/lib/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, PolarAngleAxis, PolarGrid, Radar, RadarChart, XAxis, YAxis } from "recharts";
import type { Profile } from "./auth";
import { toggleFavorite, useFavorite, useFavoriteIds, useFavoritesReady } from "./favorites";
import { setMatchNote, useHasNote, useMatchNote } from "./notes";
import { useSharedTeamMatchNote, setSharedTeamMatchNote, useHasAnySharedTeamNote, useSharedTeamNotesList } from "./shared-team-notes";
import type { SharedTeamNoteListItem } from "./shared-team-notes";
import { useSharedTeamFavorites, useIsSharedTeamFavorite, toggleSharedTeamFavorite } from "./shared-team-favorites";
import { useEventNames, useSharedTeamPicklistEvents, loadSharedTeamActivity } from "./shared-team-aggregate";
import type { ActivityItem } from "./shared-team-aggregate";
import { loadSharedTeamPicklistEntries } from "./picklist";
import type { SharedTeamPicklistSummary, PicklistEntry } from "./picklist";
import {
  createSharedTeam,
  deleteSharedTeam,
  generateInvite,
  getSharedTeamInvites,
  getSharedTeamMembers,
  leaveSharedTeam,
  removeMember,
  reloadSharedTeams,
  revokeInvite,
  updateMemberRole,
  updateSharedTeam,
  useSharedTeam,
  useSharedTeams,
  useSharedTeamsReady,
} from "./shared-teams";
import type { SharedTeamInvite, SharedTeamMember, SharedTeamMembership, SharedTeamRole } from "./shared-teams";
import { supabase } from "./supabase";
import { TranslatedText } from "./components/TranslatedText";
import { setEventsSettings, setQuickViewFirst, setQuickViewMode, setQuickViewSide, setSearchProgram, setTranslateMode, useQuickViewFirst, useQuickViewMode, useQuickViewSide, useSearchProgram, useSettingsEpoch, useTranslateMode } from "./settings";
import type { QuickViewMode, QuickViewSide, SearchProgram, TranslateMode } from "./settings";
import type { TabLayout } from "./settings";
import { clearRecentlyViewed, pushRecentlyViewed, useRecentlyViewed } from "./recently-viewed";
import type { RecentEntry } from "./recently-viewed";
import { addToTray, canAddToTray, clearTray, closeCompareModal, getContextEventId, getContextSeasonId, getTrayEntries, isInTray, openCompareModal, removeFromTray, useCompareTray, useCompareModalOpen, useIsInTray } from "./compare";
import { addToPicklist, removeFromPicklist, reorderPicklist, updatePicklistNotes, toggleCrossedOut, clearCrossedOut, usePicklist, useIsInPicklist } from "./picklist";
import type { TrayEntry } from "./compare";
import { toCsv, downloadCsv as downloadCsvFile } from "./export";
import { computeEventOpr } from "./analytics";
import type { TeamOpr } from "./analytics";
import type { Alliance, Award, CountryGroup, Event, EventInfoData, IdInfo, JumperPresetExists, Match, MatchTimestamp, Paginated, Ranking, Season, Skill, Team, TopSkillsResult, WorldSkillsEntry } from "./types";
import tzLookup from "@photostructure/tz-lookup";

const programOptions = [
  { label: "All Programs", value: "" },
  { label: "V5RC", value: "1" },
  { label: "VIQRC", value: "41" },
  { label: "VURC", value: "4" },
  { label: "VAIRC", value: "57" },
];

// Events filter — program toggle: V5RC / VIQRC up front, the rest behind a "…".
const PROGRAM_TOGGLE_PRIMARY = [
  { value: "1", label: "V5RC" },
  { value: "41", label: "VIQRC" },
];
const PROGRAM_TOGGLE_MORE = [
  { value: "4", label: "VURC" },
  { value: "57", label: "VAIRC" },
];
// Grade codes available per program. Drives the dependent grade toggle:
//   V5RC → HS/MS · VIQRC → MS/ES · VURC → U (single) · VAIRC → none (N/A)
const GRADES_BY_PROGRAM: Record<string, string[]> = {
  "1": ["HS", "MS"],
  "41": ["MS", "ES"],
  "4": ["U"],
  "57": [],
};
// Grade levels an *event* covers, keyed by program id and ordered low → high.
// Separate from GRADES_BY_PROGRAM above (which drives the World-Skills grade
// toggle, so it deliberately omits VAIRC — that program has no skills ladder).
const EVENT_GRADES_BY_PROGRAM: Record<string, string[]> = {
  "1": ["MS", "HS"],
  "41": ["ES", "MS"],
  "4": ["U"],
  "57": ["HS", "U"],
};
function gradeShortLabel(code: string): string {
  return code === "HS" ? "HS" : code === "MS" ? "MS" : code === "ES" ? "ES" : code === "U" ? "U" : code;
}
// World Skills `grade_level` query values, keyed by the program grade codes above.
const GRADE_CODE_TO_FULL: Record<string, string> = {
  HS: "High School",
  MS: "Middle School",
  ES: "Elementary",
  U: "College",
};

const today = new Date();
const oneDay = 24 * 60 * 60 * 1000;
const vexProgramIds = [1, 4, 41, 57];
const teamCacheRefreshMs = 24 * 60 * 60 * 1000;
// How often to re-poll match/ranking/skills data while an event is live.
// Matches the proxy's ~60s upstream cache, so faster would just return cached bytes.
const liveEventRefreshMs = 30 * 1000;
const globalEventSearchCacheMs = 5 * 60 * 1000;
// VEX event tiers, most significant first. "Spotlight" is the tier VEX introduced
// for 2026-2027; see eventCategory for how it is detected.
type EventCategory = "Worlds" | "Signature" | "Spotlight" | "Championship" | "Other";

// The events page's Type filter values → the tier they select.
const LEVEL_FILTER_CATEGORIES: Record<string, EventCategory> = {
  World: "Worlds",
  Signature: "Signature",
  Spotlight: "Spotlight",
  Championship: "Championship",
  Other: "Other",
};
type EventSort = "smart" | "date" | "type" | "name" | "program" | "location" | "past-season" | "distance";
type EventWindow = "today" | "near" | "upcoming" | "next30" | "next90" | "past30" | "allSeason";
type EventFilterLayout = "sidebar" | "inline";
type RegionOptionKind = "country" | "subdivision" | "vex-region";
type DateDirection = "asc" | "desc";
type TeamDataKind = "matches" | "rankings" | "skills" | "awards";
type HomeEventTab = "upcoming" | "today" | "nearToday" | "nearMe" | "sigs";
type AsyncBucket<T> = {
  data: T[];
  loading: boolean;
  error: string | null;
};
type HighlightAward = {
  award: Award;
  label: string;
  kind: "excellence" | "champions" | "skills";
};
type MatchPlayback = {
  match: Match;
  timestamp: MatchTimestamp;
};
type RegionOption = {
  key: string;
  kind: RegionOptionKind;
  label: string;
  badge: string;
  countryId?: number;
  countryName?: string;
  regionName?: string;
  vexLabel?: string;
};
type TeamCacheEntry = {
  data?: Paginated<Team>;
  updatedAt: number;
  promise?: Promise<Paginated<Team>>;
};

const teamListCache = new Map<string, TeamCacheEntry>();
let globalEventSearchCache:     { data?: Event[]; updatedAt: number; promise?: Promise<Event[]> } = { updatedAt: 0 };
let prevSeasonEventSearchCache: { data?: Event[]; updatedAt: number; promise?: Promise<Event[]> } = { updatedAt: 0 };
let olderSeasonEventSearchCache:{ data?: Event[]; updatedAt: number; promise?: Promise<Event[]> } = { updatedAt: 0 };

/** Cache key for one world-skills board. Shared by the loader and the meta read. */
function worldSkillsKey(seasonId: number, grade: string) {
  return `${seasonId}:${worldSkillsGrade(grade)}`;
}
// The world-skills endpoint's `grade_level` vocabulary differs from the grade
// stored on team profiles: profiles say "Elementary School", but the endpoint
// only accepts "Elementary" (and rejects "Elementary School" with an "Invalid
// Grade Level" error). High/Middle School and College already match. Map to the
// endpoint's spelling so elementary teams get their real standings.
function worldSkillsGrade(grade: string) {
  return grade === "Elementary School" ? "Elementary" : grade;
}

// Boards are large (multi-MB) but change slowly, so they are cached in IndexedDB
// across visits — 120 days for a finished season, 7 days plus a background
// refresh for the season being played. See src/world-skills-cache.ts.
function loadWorldSkills(seasonId: number, grade: string) {
  const gradeLevel = worldSkillsGrade(grade);
  return loadCachedWorldSkills(worldSkillsKey(seasonId, grade), seasonId, () =>
    api.worldSkills(seasonId, gradeLevel)
      // Defense-in-depth: an unsupported grade level makes the endpoint answer
      // HTTP 200 with a non-array error object `{ error, data }` instead of
      // rejecting. Normalize any non-array payload to [] so every consumer can
      // safely treat the result as a list (this is what prevented the crash).
      .then((res) => (Array.isArray(res) ? res : [])),
  );
}

function emptyBucket<T>(): AsyncBucket<T> {
  return { data: [], loading: false, error: null };
}

// ── Spotlight open state (module-level so the keyboard handler can call it
//    directly without React context, consistent with shared-team-favorites pattern) ──
let _spotlightOpen = false;
const _spotlightListeners = new Set<() => void>();
function _emitSpotlight() { for (const l of _spotlightListeners) l(); }
function openSpotlight()  { _spotlightOpen = true;  _emitSpotlight(); }
function closeSpotlight() { _spotlightOpen = false; _emitSpotlight(); }
function subscribeSpotlight(l: () => void) { _spotlightListeners.add(l); return () => _spotlightListeners.delete(l); }
function getSpotlightOpen() { return _spotlightOpen; }

// ── Team quick-view panel state (module-level, same pattern as spotlight so any
//    team link / row can open it without threading context through every call) ──
type QuickViewState = {
  // Optional: some entry points (e.g. alliance seed lists) only know the team
  // number + program, so the panel resolves the id by lookup when it's absent.
  teamId?: number;
  teamNumber: string;
  programCode?: string;
  teamName?: string | null;
  // Which half of the viewport the opening click landed on — feeds the
  // "adaptive" sidebar-side setting. Absent (e.g. keyboard) → right.
  pointerSide?: "left" | "right";
  // Force the bottom-sheet placement regardless of the user's dock-side
  // setting. Used by the Jumper page, whose two-column layout has no room to
  // dock a sidebar quick view.
  forceSheet?: boolean;
} | null;
let _quickView: QuickViewState = null;
// Bumped on every open; keys the panel so each open mounts a FRESH instance.
// Without it, opening team B while team A's panel is mid-close reuses the
// instance with stale mounted/closing state (panel stuck off-screen, unclosable).
let _quickViewSeq = 0;
const _quickViewListeners = new Set<() => void>();
function _emitQuickView() { for (const l of _quickViewListeners) l(); }
// The live panel registers here so a subsequent open can toggle (same team →
// animated close) or transition (different team → swap content in place) instead
// of blindly remounting. Cleared when the panel unmounts.
let _quickViewHandle: { teamKey: string; isClosing: () => boolean; requestClose: () => void } | null = null;
function quickViewKey(p: NonNullable<QuickViewState>): string {
  return p.teamId != null ? `id:${p.teamId}` : `num:${(p.programCode ?? "").toLowerCase()}/${p.teamNumber.toUpperCase()}`;
}
function openQuickView(payload: NonNullable<QuickViewState>) {
  // Compare pick mode overrides quick/full view everywhere: clicking a team toggles
  // it in the comparison tray instead of opening a panel.
  if (getComparePickMode()) {
    if (payload.teamId != null) addOrRemoveCompareTeam(payload.teamId, payload.teamNumber, payload.programCode ?? "", payload.teamName);
    return;
  }
  const handle = _quickViewHandle;
  if (handle && !handle.isClosing()) {
    // Re-clicking the team that's already showing closes the panel (toggle).
    if (handle.teamKey === quickViewKey(payload)) { handle.requestClose(); return; }
    // A different team while one is open → swap in place (same instance, no
    // slide-out/in) for a clean transition.
    _quickView = payload; _emitQuickView(); return;
  }
  // Nothing live (or the previous panel is mid-close) → mount a fresh one.
  _quickView = payload; _quickViewSeq++; _emitQuickView();
}
function pointerSideFromEvent(e: { clientX: number }): "left" | "right" {
  return e.clientX < window.innerWidth / 2 ? "left" : "right";
}
function closeQuickView() { _quickView = null; _emitQuickView(); }
// Bridge for the Jumper page (mounted without props) to open the shared team
// quick view. Sets the context event so event-scoped stats resolve, and forces
// the bottom-sheet placement so it never tries to dock into the Jumper layout.
if (typeof window !== "undefined") {
  (window as unknown as { __osOpenTeamQuickView?: (p: NonNullable<QuickViewState> & { eventId?: number | null }) => void }).__osOpenTeamQuickView = (payload) => {
    if (payload.eventId != null) _currentEventId = payload.eventId;
    openQuickView({
      teamId: payload.teamId,
      teamNumber: payload.teamNumber,
      programCode: payload.programCode,
      teamName: payload.teamName,
      forceSheet: true,
    });
  };
}
function subscribeQuickView(l: () => void) { _quickViewListeners.add(l); return () => _quickViewListeners.delete(l); }
function getQuickView() { return _quickView; }
function useQuickView() { return useSyncExternalStore(subscribeQuickView, getQuickView, getQuickView); }

// ── Compare pick mode ───────────────────────────────────────────────────────
let _comparePickMode = false;
const _comparePickModeListeners = new Set<() => void>();
function _emitComparePickMode() { for (const l of _comparePickModeListeners) l(); }
function setComparePickMode(value: boolean) { _comparePickMode = value; _emitComparePickMode(); }
function toggleComparePickMode() { setComparePickMode(!_comparePickMode); }
function subscribeComparePickMode(l: () => void) { _comparePickModeListeners.add(l); return () => _comparePickModeListeners.delete(l); }
function getComparePickMode() { return _comparePickMode; }
function useComparePickMode() {
  return useSyncExternalStore(subscribeComparePickMode, getComparePickMode, getComparePickMode);
}

// Module-level: current team page context — set by TeamDetail on mount, cleared on unmount.
// Lets the global C keyboard shortcut add/remove the current team without React context.
let _currentTeam: Team | null = null;

// Module-level: current event season + event ID — set by EventDetail on mount, cleared on unmount.
// Passed to openCompareModal() so the comparison uses the right season without an
// extra API round-trip, and can show per-event stats when in event context.
let _currentEventSeasonId: number | null = null;
let _currentEventId: number | null = null;
let _currentEventRankings: Ranking[] = [];
// All matches for the current event — used by the comparison modal to compute
// per-event OPR/DPR/CCWM (per-team slots only hold a team's own matches).
let _currentEventMatches: Match[] = [];

// Module-level: true while the match-video modal is open. A quick view opened from
// inside that modal (via a team pill in the notes) reads this to force a
// non-dimmed bottom sheet that layers ABOVE the video dialog (see TeamQuickView).
let _videoOverlayOpen = false;

// Module-level: opens the in-event team search — registered by EventDetail while
// mounted, cleared on unmount. Lets the global F shortcut expand the search bar
// (whose open state lives inside EventDetail) without React context. Null when
// not on an event page, so F is a no-op elsewhere.
let _openEventSearch: (() => void) | null = null;

// ── Scroll memory — save scrollY per path, restore on real browser back ──
const scrollMemory = new Map<string, number>();
// Custom event name for programmatic navigation so real browser popstate
// (back/forward) can be distinguished and trigger scroll restoration.
const NAV_EVENT = "vex-nav";

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onRealPop = () => {
      // Real browser back/forward — restore saved scroll position
      const savedY = scrollMemory.get(window.location.pathname);
      if (savedY) requestAnimationFrame(() => window.scrollTo(0, savedY));
      setPath(window.location.pathname);
    };
    const onNav = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onRealPop);
    window.addEventListener(NAV_EVENT, onNav);
    return () => {
      window.removeEventListener("popstate", onRealPop);
      window.removeEventListener(NAV_EVENT, onNav);
    };
  }, []);

  return path;
}

function navigate(path: string) {
  scrollMemory.set(window.location.pathname, window.scrollY); // save before leaving
  window.history.pushState(null, "", path);
  window.dispatchEvent(new Event(NAV_EVENT));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function currentHashTab() {
  return decodeURIComponent(window.location.hash.replace(/^#/, "")).trim().toLowerCase();
}

function hashTab<T extends string>(validTabs: readonly T[], fallback: T) {
  const hash = currentHashTab();
  return validTabs.includes(hash as T) ? (hash as T) : fallback;
}

function replaceCurrentHash(tab: string) {
  const nextHash = `#${encodeURIComponent(tab)}`;
  if (window.location.hash === nextHash) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
}

function urlWithHash(path: string, tab: string) {
  return `${path}#${encodeURIComponent(tab)}`;
}

async function writeClipboardText(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    if (document.execCommand("copy")) return true;
  } finally {
    document.body.removeChild(textarea);
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const allDigits = (value: string) => /^\d+$/.test(value);

// RobotEvents program ids → modern URL slug. The raw API `code` is the legacy
// abbreviation (e.g. "VRC"/"VIQC"), so we key off the stable program id and use
// the rebranded name users expect in URLs. Falls back to the raw code.
const PROGRAM_SLUGS: Record<number, string> = { 1: "V5RC", 4: "VURC", 41: "VIQRC" };

const programSlug = (program?: { id?: number; code?: string | null } | null) =>
  (program?.id != null ? PROGRAM_SLUGS[program.id] : undefined) ?? program?.code?.toUpperCase() ?? "";

const programMatchesSlug = (program: { id?: number; code?: string | null } | null | undefined, slug: string) => {
  const target = slug.toUpperCase();
  return programSlug(program) === target || program?.code?.toUpperCase() === target;
};

const eventPath = (event: { sku?: string | null; id: number }) => `/event/${event.sku || event.id}`;

// Builds a team URL from a program slug + number, falling back to bare number or
// numeric id when the program isn't known. Used both by teamPath (full objects)
// and by IdInfo-only links via ProgramContext.
const teamSlugPath = (programCode: string | undefined, number?: string | null, id?: number | string) =>
  programCode && number ? `/team/${programCode}/${number}` : `/team/${number || id}`;

const teamPath = (team: { program?: { id?: number; code?: string | null } | null; number?: string | null; id: number }) =>
  teamSlugPath(programSlug(team.program), team.number, team.id);

// Provided by program-scoped pages (event/team/insights) so that team links
// which only carry an IdInfo (id + number, no program) can still build the
// modern /team/{PROGRAM}/{number} URL.
const ProgramContext = createContext<string | undefined>(undefined);

// The active in-event team search term, provided by EventDetail. Team links read
// it to bold the matching portion of their team number. Empty string = no search.
const TeamSearchContext = createContext<string>("");

function Link({
  href,
  children,
  className,
  onClick,
  title,
  "aria-label": ariaLabel,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  title?: string;
  "aria-label"?: string;
}) {
  return (
    <a
      href={href}
      className={className}
      title={title}
      aria-label={ariaLabel}
      onClick={(event) => {
        onClick?.(event);
        // Let an onClick suppress SPA navigation by calling preventDefault (used by
        // the quick-view interception); otherwise navigate as usual for app paths.
        if (href.startsWith("/") && !event.defaultPrevented) {
          event.preventDefault();
          navigate(href);
        }
      }}
    >
      {children}
    </a>
  );
}

// A subtle history-trail breadcrumb for detail pages. The trail (the actual
// sequence of trackable pages the user visited) comes from the shared store;
// the page passes only its current tab, appended as the non-interactive tail.
// When the trail runs deep, the oldest entries collapse behind a literal "..."
// that opens a dropdown of that hidden history. Hidden on mobile via CSS.

// Cap a crumb label at 5 words, appending an ellipsis when trimmed. Long entity
// names (e.g. full event titles) otherwise stretch the trail across the page.
const BREADCRUMB_MAX_WORDS = 5;
function truncateCrumb(label: string): string {
  const words = label.trim().split(/\s+/);
  return words.length > BREADCRUMB_MAX_WORDS
    ? `${words.slice(0, BREADCRUMB_MAX_WORDS).join(" ")}…`
    : label;
}

// Entries beyond this many collapse into the "..." menu. At the threshold the
// full trail shows; past it, the leading entries hide and the last two remain.
const BREADCRUMB_VISIBLE = 3;

function Breadcrumbs({ currentTab }: { currentTab?: string }) {
  const trail = useSyncExternalStore(subscribeTrail, getTrail, getTrail);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useOutsideClick<HTMLLIElement>(() => setMenuOpen(false));

  // Collapse the menu whenever the trail changes (i.e. on navigation).
  useEffect(() => { setMenuOpen(false); }, [trail]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (trail.length === 0) return null;

  const collapse = trail.length > BREADCRUMB_VISIBLE;
  const hidden = collapse ? trail.slice(0, -2) : [];
  const visible = collapse ? trail.slice(-2) : trail;

  // Assemble the ordered segments: optional "...", the visible entity crumbs
  // (each a link to its own page), then the current tab as the aria-current tail.
  const segments: Array<{ key: string; node: ReactNode; collapse?: boolean }> = [];

  if (collapse) {
    segments.push({
      key: "__more__",
      collapse: true,
      node: (
        <>
          <button
            type="button"
            className="breadcrumb-more"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label="Show earlier pages"
            onClick={() => setMenuOpen((o) => !o)}
          >
            ...
          </button>
          {menuOpen && (
            <div className="breadcrumb-menu">
              {hidden.map((entry) => (
                <Link
                  key={entry.path}
                  href={entry.path}
                  className="breadcrumb-menu-item"
                  title={entry.label}
                  onClick={() => setMenuOpen(false)}
                >
                  {entry.label}
                </Link>
              ))}
            </div>
          )}
        </>
      ),
    });
  }

  visible.forEach((entry) => {
    const shown = truncateCrumb(entry.label);
    segments.push({
      key: entry.path,
      node: <Link href={entry.path} title={shown === entry.label ? undefined : entry.label}>{shown}</Link>,
    });
  });

  if (currentTab) {
    segments.push({ key: "__tab__", node: <span aria-current="page">{currentTab}</span> });
  }

  if (segments.length < 2) return null;

  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        {segments.map((seg, index) => (
          <li
            key={seg.key}
            ref={seg.collapse ? menuRef : undefined}
            className={seg.collapse ? "breadcrumb-collapse" : undefined}
          >
            {index > 0 && <ChevronRight size={13} className="breadcrumb-sep" aria-hidden="true" />}
            {seg.node}
          </li>
        ))}
      </ol>
    </nav>
  );
}

// Standard modal/overlay close: an "Esc" keycap hint next to an × button. Every
// popup that uses this also wires an Escape key handler, so the hint is accurate.
function CloseButton({ onClose, label = "Close" }: { onClose: () => void; label?: string }) {
  return (
    <span className="close-btn-wrap">
      <kbd className="esc-hint">Esc</kbd>
      <button type="button" className="video-close-btn" onClick={onClose} aria-label={label}>×</button>
    </span>
  );
}

// `delayMs` defers the loader so lower-priority requests don't all fire at once
// on mount — keeps `loading` true while waiting so callers don't flash an empty
// state. Used to stagger an event page's many parallel fetches.
// `refetchMs > 0` enables silent background polling: data is re-fetched on an
// interval without toggling `loading` or clearing the current data, so live
// events update in place. Polling pauses while the tab is hidden.
function useAsync<T>(loader: () => Promise<T>, deps: unknown[], delayMs = 0, refetchMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Keep the latest closure (captures current id/division) so the polling effect
  // can call it without restarting on every render.
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);

    const run = () => {
      loader()
        .then((value) => {
          if (live) setData(value);
        })
        .catch((err: Error) => {
          if (live) setError(err.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    };

    let timer: number | undefined;
    if (delayMs > 0) timer = window.setTimeout(run, delayMs);
    else run();

    return () => {
      live = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, deps);

  // Silent background polling — never flips `loading`, keeps the last good data
  // on error, and skips ticks while the tab is hidden to save requests/battery.
  useEffect(() => {
    if (refetchMs <= 0) return;
    let active = true;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      loaderRef.current()
        .then((value) => {
          if (active) setData(value);
        })
        .catch(() => {});
    };
    const interval = window.setInterval(tick, refetchMs);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [refetchMs, ...deps]);

  return { data, error, loading };
}

function useDebouncedValue<T>(value: T, delay = 250) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);

  return debouncedValue;
}

async function loadGlobalEventSearchEvents() {
  const now = Date.now();
  if (globalEventSearchCache.data && now - globalEventSearchCache.updatedAt < globalEventSearchCacheMs) {
    return globalEventSearchCache.data;
  }
  if (globalEventSearchCache.promise) return globalEventSearchCache.promise;

  const promise = collectAllPages<Event>((page) =>
    api.events({
      per_page: 250,
      page,
      start: dateOnly(addDays(today, -90)),
      end: dateOnly(addDays(today, 365)),
      "program[]": vexProgramIds,
    }),
  ).then((result) => {
    globalEventSearchCache = { data: result.data, updatedAt: Date.now() };
    return result.data;
  });

  globalEventSearchCache = { ...globalEventSearchCache, promise };

  try {
    return await promise;
  } catch (error) {
    globalEventSearchCache = { data: globalEventSearchCache.data, updatedAt: globalEventSearchCache.updatedAt };
    throw error;
  }
}

// Previous season: ~1 year before current window. Loaded lazily only when spotlight
// event results come back short (< 3). Same dedup / cache pattern as above.
async function loadPrevSeasonEvents(): Promise<Event[]> {
  const now = Date.now();
  if (prevSeasonEventSearchCache.data && now - prevSeasonEventSearchCache.updatedAt < globalEventSearchCacheMs) {
    return prevSeasonEventSearchCache.data;
  }
  if (prevSeasonEventSearchCache.promise) return prevSeasonEventSearchCache.promise;

  const promise = collectAllPages<Event>((page) =>
    api.events({
      per_page: 250,
      page,
      start: dateOnly(addDays(today, -455)),
      end: dateOnly(addDays(today, -91)),
      "program[]": vexProgramIds,
    }),
  ).then((result) => {
    prevSeasonEventSearchCache = { data: result.data, updatedAt: Date.now() };
    return result.data;
  });

  prevSeasonEventSearchCache = { ...prevSeasonEventSearchCache, promise };

  try {
    return await promise;
  } catch (error) {
    prevSeasonEventSearchCache = { data: prevSeasonEventSearchCache.data, updatedAt: prevSeasonEventSearchCache.updatedAt };
    throw error;
  }
}

// Two seasons back: ~2 years before current window. Only fetched as a last resort
// when both the current window and prev-season still produce fewer than 3 results.
async function loadOlderSeasonEvents(): Promise<Event[]> {
  const now = Date.now();
  if (olderSeasonEventSearchCache.data && now - olderSeasonEventSearchCache.updatedAt < globalEventSearchCacheMs) {
    return olderSeasonEventSearchCache.data;
  }
  if (olderSeasonEventSearchCache.promise) return olderSeasonEventSearchCache.promise;

  const promise = collectAllPages<Event>((page) =>
    api.events({
      per_page: 250,
      page,
      start: dateOnly(addDays(today, -820)),
      end: dateOnly(addDays(today, -456)),
      "program[]": vexProgramIds,
    }),
  ).then((result) => {
    olderSeasonEventSearchCache = { data: result.data, updatedAt: Date.now() };
    return result.data;
  });

  olderSeasonEventSearchCache = { ...olderSeasonEventSearchCache, promise };

  try {
    return await promise;
  } catch (error) {
    olderSeasonEventSearchCache = { data: olderSeasonEventSearchCache.data, updatedAt: olderSeasonEventSearchCache.updatedAt };
    throw error;
  }
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/.test(navigator.platform);

// ── Search scope ──────────────────────────────────────────────────────────────
// Which programs each setting searches. "auto" passes no filter at all, so every
// VEX program is in play and only the profile nudge orders them; the other two
// restrict outright. Event ids are strings (filterAndSortEvents compares them as
// such); team lookups want numbers.
const SEARCH_PROGRAM_OPTIONS: Array<{ value: SearchProgram; label: string; title: string }> = [
  { value: "auto", label: "Auto", title: "Search every program, ordered around your own" },
  { value: "v5", label: "V5", title: "V5RC events and teams only" },
  { value: "iq", label: "IQ", title: "VIQRC events and teams only" },
];
const SEARCH_PROGRAM_IDS: Record<SearchProgram, number[] | undefined> = {
  auto: undefined,
  v5: [1],
  iq: [41],
};

function searchProgramIds(scope: SearchProgram): number[] {
  return SEARCH_PROGRAM_IDS[scope] ?? vexProgramIds;
}

// The season label the current competition year carries, e.g. "26-27". RobotEvents
// seasons roll over in spring (a 2026-2027 season event can be held in May 2026), so
// the cutover month is May rather than January. Only this end of the comparison is
// derived from the clock — the event's own side is read from its season name — so
// the worst case is a few days of ambiguity right at the rollover.
function currentSeasonYearLabel(): string {
  const year = today.getFullYear() - (today.getMonth() < 4 ? 1 : 0);
  return `${String(year).slice(2)}-${String(year + 1).slice(2)}`;
}

/** The season label to call out on a search result, or "" for the current season. */
function olderSeasonLabel(event: Event): string {
  const label = seasonYearLabel(event.season?.name);
  return label && label !== currentSeasonYearLabel() ? label : "";
}

/**
 * One event row in a search result list. The name is clamped to a single line so
 * the tier/program pills can sit on that line without making the row taller, and
 * the sub-line carries the event's dates (bold, with the season, when it is not
 * from the current season) instead of its SKU.
 */
function SearchEventRow({ event, onSelect }: { event: Event; onSelect: (href: string) => void }) {
  const category = eventCategory(event);
  const season = olderSeasonLabel(event);
  const location = locationLine(event);
  return (
    <button type="button" className="gs-result gs-result-event" onMouseDown={() => onSelect(eventPath(event))}>
      <span className="gs-result-line">
        <TranslatedText className="gs-result-main" text={event.name} country={event.location?.country} />
        <span className="gs-result-tags">
          {/* "Other" is every ordinary tournament — a pill on all of them is noise. */}
          {category.label !== "Other" && (
            <span className={`event-priority priority-${category.rank}`}>{category.label}</span>
          )}
          <ProgramBadge program={event.program} />
        </span>
      </span>
      <span className="gs-result-sub">
        <span className={`gs-result-date${season ? " is-older" : ""}`}>
          {formatEventDateRangeShort(event.start, event.end)}
        </span>
        {season && <span className="gs-result-season">{season}</span>}
        {location && <span className="gs-result-where">{location}</span>}
      </span>
    </button>
  );
}

/** One team row, matching the event row's single-line-plus-pills shape. */
function SearchTeamRow({ team, onSelect }: { team: Team; onSelect: (href: string) => void }) {
  return (
    <button type="button" className="gs-result gs-result-team" onMouseDown={() => onSelect(teamPath(team))}>
      <span className="gs-result-line">
        <span className="gs-result-main">
          {team.number} - <TranslatedText text={team.team_name ?? "Unnamed Team"} country={team.location?.country} />
        </span>
        <span className="gs-result-tags">
          {team.grade && <span className={`event-grade-badge grade-${gradeCode(team.grade)}`}>{gradeCode(team.grade)}</span>}
          <ProgramBadge program={team.program} />
        </span>
      </span>
      <span className="gs-result-sub">
        <span className="gs-result-where">{locationLine(team)}</span>
      </span>
    </button>
  );
}

/** The Auto / V5 / IQ scope picker shown at the top of every search result list. */
function SearchScopeToggle({ scope }: { scope: SearchProgram }) {
  return (
    <div className="gs-scope" role="group" aria-label="Search scope">
      <span className="gs-scope-label">Search</span>
      {SEARCH_PROGRAM_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={scope === option.value ? "active" : ""}
          aria-pressed={scope === option.value}
          title={option.title}
          // mousedown, not click: the dropdown closes on outside mousedown, and a
          // plain onClick would lose the race with the input's blur handling.
          onMouseDown={(event) => {
            event.preventDefault();
            setSearchProgram(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function GlobalSearch({ className = "" }: { className?: string }) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 220);
  const [open, setOpen] = useState(false);
  // When the header gets too narrow to hold the full search bar, collapse it to
  // an icon that opens the search as a popup. Only applies in the topbar.
  const collapsible = className.includes("topbar-search");
  const [compact, setCompact] = useState(() => collapsible && typeof matchMedia === "function" && matchMedia("(max-width: 820px)").matches);
  const [compactOpen, setCompactOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Teams results
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);

  // Events results
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // True while older seasons are being searched because the current window came
  // back empty — results may still appear.
  const [searchingOlderSeasons, setSearchingOlderSeasons] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Re-runs the search when the profile's program/grade lands (it arrives after
  // the first paint), so early results aren't stuck in the unbiased order.
  const searchBias = useSearchBias();
  const scope = useSearchProgram();

  // Fire both searches independently when debounced query changes
  useEffect(() => {
    if (!debounced) {
      setTeams([]);
      setEvents([]);
      setTeamsLoading(false);
      setEventsLoading(false);
      setSearchingOlderSeasons(false);
      return;
    }

    let live = true;

    // Teams — full team numbers hit the VEX API first, everything else stays
    // cache-first. See runGlobalTeamSearch.
    const programIds = searchProgramIds(scope);
    const cachedTeams = rankTeamsForSearch(scopeTeamsToPrograms(allCachedTeams(), programIds), debounced);
    void runGlobalTeamSearch(debounced, 5, cachedTeams, () => live, setTeams, setTeamsLoading, programIds);

    const opts = { search: debounced, hideCanceled: true, sort: "smart" as const, programIds: SEARCH_PROGRAM_IDS[scope]?.map(String) };
    setEventsLoading(true);
    setSearchingOlderSeasons(false);

    // Current window first, then older seasons only if it produced nothing at all.
    // Scoping to one program routinely empties the window (this season's V5RC list
    // has no match for a query that only an older event answers), which is exactly
    // when the fallback earns its two extra fetches — see CommandPalette, which
    // falls back the same way.
    const runEventSearch = async () => {
      const current = filterAndSortEvents(await loadGlobalEventSearchEvents(), opts);
      if (!live) return;
      setEvents(current.slice(0, 5));
      setEventsLoading(false);
      if (current.length) return;

      setSearchingOlderSeasons(true);
      try {
        const prev = filterAndSortEvents(await loadPrevSeasonEvents(), opts);
        if (!live) return;
        setEvents(prev.slice(0, 5));
        if (prev.length) return;

        const older = filterAndSortEvents(await loadOlderSeasonEvents(), opts);
        if (live) setEvents(older.slice(0, 5));
      } finally {
        if (live) setSearchingOlderSeasons(false);
      }
    };

    runEventSearch().catch(() => {
      if (live) { setEvents([]); setEventsLoading(false); setSearchingOlderSeasons(false); }
    });

    return () => { live = false; };
  }, [debounced, searchBias, scope]);

  // Track the narrow-header breakpoint (topbar only).
  useEffect(() => {
    if (!collapsible || typeof matchMedia !== "function") return;
    const mq = matchMedia("(max-width: 820px)");
    const onChange = () => { setCompact(mq.matches); if (!mq.matches) setCompactOpen(false); };
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [collapsible]);

  // Focus the input when the compact search popup opens.
  useEffect(() => {
    if (compactOpen) inputRef.current?.focus();
  }, [compactOpen]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setCompactOpen(false); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const searchTerm = query.trim();
  const showDropdown = open && !!searchTerm;

  const handleSelect = useCallback((href: string) => {
    setOpen(false);
    setCompactOpen(false);
    setQuery("");
    navigate(href);
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setOpen(false); setCompactOpen(false); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (query.trim()) {
        setOpen(false);
        navigate(`/events?search=${encodeURIComponent(query.trim())}`);
      }
    }
  };

  const inputRow = (
    <div className="global-search-input-row">
      <Search size={16} className="global-search-icon" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search teams or events..."
        className="global-search-input"
      />
      {!query && (
        <span
          className="gs-kbd-hint"
          onClick={() => { setOpen(false); openSpotlight(); }}
          aria-hidden="true"
        >
          {isMac ? "⌘K" : "Ctrl K"}
        </span>
      )}
    </div>
  );

  // Number-like queries are almost always team lookups, so surface Teams first;
  // otherwise lead with Events.
  const teamNumberLike = /^\d+[a-z]?$/i.test(searchTerm);
  const teamsSection = (
    <>
      <div className="gs-section-label">Teams</div>
      {teamsLoading && !teams.length && (
        <div className="gs-loading">Loading...</div>
      )}
      {teams.map((team) => (
        <SearchTeamRow key={team.id} team={team} onSelect={handleSelect} />
      ))}
      {!teamsLoading && !teams.length && (
        <div className="gs-empty">No teams found.</div>
      )}
      <button
        type="button"
        className="gs-find-more"
        onMouseDown={() => handleSelect(`/teams?search=${encodeURIComponent(searchTerm)}`)}
      >
        Find more teams...
      </button>
    </>
  );
  const eventsSection = (
    <>
      <div className="gs-section-label">Events</div>
      {eventsLoading && !events.length && (
        <div className="gs-loading">Loading...</div>
      )}
      {events.map((event) => (
        <SearchEventRow key={event.id} event={event} onSelect={handleSelect} />
      ))}
      {searchingOlderSeasons && <div className="gs-loading">Searching older seasons…</div>}
      {!eventsLoading && !searchingOlderSeasons && !events.length && (
        <div className="gs-empty">No events found.</div>
      )}
      <button
        type="button"
        className="gs-find-more"
        onMouseDown={() => handleSelect(`/events?search=${encodeURIComponent(searchTerm)}`)}
      >
        Find more events...
      </button>
    </>
  );
  const dropdown = showDropdown ? (
    <div className="global-search-dropdown">
      <SearchScopeToggle scope={scope} />
      {teamNumberLike ? <>{teamsSection}{eventsSection}</> : <>{eventsSection}{teamsSection}</>}
    </div>
  ) : null;

  return (
    <div className={`global-search-wrap ${className}${compact ? " is-compact" : ""}`.trim()} ref={wrapRef}>
      {compact ? (
        <>
          <button
            type="button"
            className="global-search-trigger"
            aria-label="Search"
            aria-expanded={compactOpen}
            onClick={() => setCompactOpen((o) => !o)}
          >
            <Search size={18} />
          </button>
          {compactOpen && (
            <div className="global-search-popup">
              {inputRow}
              {dropdown}
            </div>
          )}
        </>
      ) : (
        <>
          {inputRow}
          {dropdown}
        </>
      )}
    </div>
  );
}

async function collectAllPages<T>(loader: (page: number) => Promise<Paginated<T>>) {
  const first = await loader(1);
  const extraPages = Array.from({ length: Math.max(0, first.meta.last_page - 1) }, (_, index) => index + 2);
  const rest: Paginated<T>[] = [];

  for (let index = 0; index < extraPages.length; index += 8) {
    const batch = extraPages.slice(index, index + 8);
    rest.push(...(await Promise.all(batch.map((page) => loader(page)))));
  }

  return {
    ...first,
    data: [first, ...rest].flatMap((page) => page.data),
  };
}

function cachedTeamsKey(program: string, registered: string, regionKeys: string[] = []) {
  return JSON.stringify({ program, registered, regions: [...regionKeys].sort() });
}

// The full team list for one program is large (~6 MB for V5RC), which exceeds
// the localStorage quota. IndexedDB persists it across reloads so the cached
// list shows instantly instead of re-fetching every page load.
const TEAMS_DB_NAME = "vex-teams-cache";
const TEAMS_STORE = "teams";
let teamsDbPromise: Promise<IDBDatabase> | null = null;

function openTeamsDb(): Promise<IDBDatabase> {
  if (teamsDbPromise) return teamsDbPromise;
  teamsDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(TEAMS_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TEAMS_STORE)) db.createObjectStore(TEAMS_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return teamsDbPromise;
}

async function idbGetTeams(key: string): Promise<{ data: Paginated<Team>; updatedAt: number } | undefined> {
  try {
    const db = await openTeamsDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(TEAMS_STORE, "readonly").objectStore(TEAMS_STORE).get(key);
      request.onsuccess = () => resolve(request.result as { data: Paginated<Team>; updatedAt: number } | undefined);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined;
  }
}

async function idbSetTeams(key: string, entry: { data: Paginated<Team>; updatedAt: number }): Promise<void> {
  try {
    const db = await openTeamsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TEAMS_STORE, "readwrite");
      tx.objectStore(TEAMS_STORE).put({ data: entry.data, updatedAt: entry.updatedAt }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Storage may be unavailable (private mode / quota) — fall back to in-memory only.
  }
}

// `teams_light` returns the whole matching set in one request, but region/country
// filters AND together server-side, so heterogeneous region selections are split
// into separate queries here and unioned (deduped by id) into one Paginated<Team>.
async function fetchTeamsLightUnion(queries: Parameters<typeof api.teamsLight>[0][]): Promise<Paginated<Team>> {
  const results = await Promise.all(queries.map((query) => api.teamsLight(query)));
  const data = uniqueTeams(results.flatMap((result) => result.data));
  const meta = results[0]?.meta ?? {
    current_page: 1,
    last_page: 1,
    next_page_url: null,
    prev_page_url: null,
    per_page: 0,
    total: 0,
    from: null,
    to: null,
  };
  return {
    meta: { ...meta, per_page: data.length, total: data.length, from: data.length ? 1 : null, to: data.length || null },
    data,
  };
}

// Fast first page: one small server-paginated page per region query (teams_light is
// alphabetical server-side), unioned and sorted so the table can paint the first
// couple of pages instantly while `fetchTeamsLightUnion` streams in the full set.
async function fetchTeamsLightFirstPage(
  queries: Parameters<typeof api.teamsLight>[0][],
  perPage = 100,
): Promise<Paginated<Team>> {
  const results = await Promise.all(queries.map((query) => api.teamsLightPage({ ...query, per_page: perPage, page: 1 })));
  const data = uniqueTeams(results.flatMap((result) => result.data)).sort(compareTeamsNatural);
  const meta = results[0]?.meta ?? {
    current_page: 1,
    last_page: 1,
    next_page_url: null,
    prev_page_url: null,
    per_page: data.length,
    total: data.length,
    from: data.length ? 1 : null,
    to: data.length || null,
  };
  return { meta: { ...meta, per_page: data.length }, data };
}

// Teams tab search: query teams_light (region-filtered) and, when the query is a
// complete team number ({1-5 digits}{one letter}, e.g. 32K), also hit the official
// RobotEvents API in parallel — that team may exist there before RoboSTEM ingests
// it. Results merge and dedupe by id, then rank against the query.
async function searchTeamsTabTeams(
  query: string,
  regionQueries: Parameters<typeof api.teamsLight>[0][],
  programId: string, // "" = All Programs
): Promise<Paginated<Team>> {
  const trimmed = query.trim();
  const isCompleteNumber = /^\d{1,5}[a-z]$/i.test(trimmed);
  // Scope the exact-match RSE lookup to the selected program so we don't even
  // fetch other VEX programs (defense in depth); fall back to all VEX programs
  // when "All" is selected.
  const rsePrograms = programId ? [programId] : vexProgramIds;
  const [rse, vex] = await Promise.all([
    fetchTeamsLightUnion(regionQueries.map((regionQuery) => ({ ...regionQuery, teamSearch: query }))),
    isCompleteNumber
      ? api.robotEventsTeams({ number: trimmed, "program[]": rsePrograms, per_page: 20 })
      : Promise.resolve(null),
  ]);
  const merged = uniqueTeams([...(vex?.data ?? []), ...rse.data]);
  // RSE program[] isn't fully trustworthy for a single-team number lookup, so
  // hard-filter by the selected program after merge, before ranking.
  const scoped = programId ? merged.filter((team) => String(team.program?.id) === programId) : merged;
  return { ...rse, data: rankTeamsForSearch(scoped, query) };
}

async function loadCachedTeams(cacheKey: string, queries: Parameters<typeof api.teamsLight>[0][], force = false) {
  const cached = teamListCache.get(cacheKey);
  if (!force && cached?.promise) return cached.promise;

  const promise = fetchTeamsLightUnion(queries).then((result) => {
    const sortedResult = { ...result, data: [...result.data].sort(compareTeamsNatural) };
    const updatedAt = Date.now();
    teamListCache.set(cacheKey, { data: sortedResult, updatedAt });
    void idbSetTeams(cacheKey, { data: sortedResult, updatedAt });
    return sortedResult;
  });

  teamListCache.set(cacheKey, { data: cached?.data, updatedAt: cached?.updatedAt ?? 0, promise });

  try {
    return await promise;
  } catch (error) {
    if (cached?.data) {
      teamListCache.set(cacheKey, cached);
    } else {
      teamListCache.delete(cacheKey);
    }
    throw error;
  }
}

// Event dates are calendar days recorded at a fixed US-Eastern midnight, so they
// are formatted from their own components rather than converted into the viewer's
// timezone — see src/event-dates.ts.
function formatDate(value?: string | null) {
  return formatEventDay(value);
}

function formatEventDateRange(start?: string | null, end?: string | null) {
  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

// Compact range that collapses the shared month/year, e.g. "Apr 20-23, 2026",
// "Aug 30 - Sep 2, 2026", or "Dec 30, 2026 - Jan 2, 2027".
function formatEventDateRangeShort(start?: string | null, end?: string | null) {
  if (!start) return formatEventDateRange(start, end);
  const s = eventDayParts(start);
  const e = eventDayParts(end ?? start);
  if (!s || !e) return formatEventDateRange(start, end);
  if (s.mo === e.mo && s.yr === e.yr && s.day === e.day) return `${s.mo} ${s.day}, ${s.yr}`;
  if (s.mo === e.mo && s.yr === e.yr) return `${s.mo} ${s.day}-${e.day}, ${s.yr}`;
  if (s.yr === e.yr) return `${s.mo} ${s.day} - ${e.mo} ${e.day}, ${s.yr}`;
  return `${s.mo} ${s.day}, ${s.yr} - ${e.mo} ${e.day}, ${e.yr}`;
}

function formatNumber(value?: number | null, digits = 1) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function locationLine(eventOrTeam: { location?: Event["location"] | Team["location"] }) {
  const location = eventOrTeam.location;
  if (!location) return "Unknown location";
  return [location.city, location.region, location.country].filter(Boolean).join(", ") || location.venue || "Unknown location";
}

// US state + Canadian province/territory names → 2-letter codes, so the events-list
// location column stays compact ("Austin, TX" instead of "Austin, Texas").
const US_CA_SUBDIVISION_ABBR: Record<string, string> = {
  // United States
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
  "colorado": "CO", "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA",
  "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
  "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
  "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS", "missouri": "MO",
  "montana": "MT", "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
  "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT",
  "virginia": "VA", "washington": "WA", "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
  "district of columbia": "DC", "puerto rico": "PR", "guam": "GU", "u.s. virgin islands": "VI",
  // Canada
  "alberta": "AB", "british columbia": "BC", "manitoba": "MB", "new brunswick": "NB",
  "newfoundland and labrador": "NL", "nova scotia": "NS", "ontario": "ON",
  "prince edward island": "PE", "quebec": "QC", "québec": "QC", "saskatchewan": "SK",
  "northwest territories": "NT", "nunavut": "NU", "yukon": "YT",
};

const US_CA_COUNTRIES = new Set(["united states", "united states of america", "usa", "us", "canada", "ca"]);

// Compact location for the events-list column. US/Canada → "City, ST"; elsewhere →
// "Region, Country" (per request). Returns "" when there's nothing usable to show.
function eventLocationShort(location?: Event["location"] | null): string {
  if (!location) return "";
  const city = location.city?.trim() || "";
  const region = location.region?.trim() || "";
  const country = location.country?.trim() || "";
  if (US_CA_COUNTRIES.has(normalizeText(country))) {
    const subdivision = US_CA_SUBDIVISION_ABBR[normalizeText(region)] ?? region;
    return [city, subdivision].filter(Boolean).join(", ") || country;
  }
  return [region, country].filter(Boolean).join(", ") || city;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * oneDay);
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function eventCategory(event: Event): { label: EventCategory; rank: number } {
  const robotEventsType = event.level ?? event.event_type ?? "";

  // Checked before Worlds: both arrive as level "World", and only the SKU set from
  // /api/spotlight-events tells them apart (see src/spotlightTier.ts). Until that
  // set loads this is false, so a Spotlight event reads as Worlds — the behaviour
  // that predates the lookup.
  if (isSpotlightSku(event.sku)) return { label: "Spotlight", rank: 2 };
  if (robotEventsType === "World") return { label: "Worlds", rank: 0 };
  if (robotEventsType === "Signature") return { label: "Signature", rank: 1 };
  if (robotEventsType === "National" || robotEventsType === "State" || robotEventsType === "Regional") return { label: "Championship", rank: 3 };

  return { label: "Other", rank: 4 };
}

// Scrimmages are practice events that shouldn't count toward performance trends.
function isScrimmageEvent(event?: Event | null) {
  if (!event) return false;
  if (normalizeText(event.event_type).includes("scrimmage")) return true;
  return normalizeText(event.name).includes("scrimmage");
}

// Signature events and championships (incl. Worlds) get a star marker on charts.
function isMarqueeEvent(event?: Event | null) {
  return event ? eventCategory(event).label !== "Other" : false;
}

// How far the event is from today, in whole days expressed as ms so the existing
// comparators keep working. 0 while it is running. Both sides are calendar days —
// the event's own dates, and today *in the event's timezone* — so an event never
// counts as yesterday's just because the reader is west of it.
function eventDistance(event: Event) {
  const start = eventDayMs(event.start) ?? 0;
  const end = eventDayMs(event.end ?? event.start) ?? start;
  const now = eventTodayMs(event);
  if (start <= now && now <= end) return 0;
  return Math.min(Math.abs(start - now), Math.abs(end - now));
}

/** Midday-UTC anchor for "today" as the event's own locale would call it. */
function eventTodayMs(event: Event) {
  return eventDayToUtcNoon(todayInZone(eventTimeZone(event))).getTime();
}

// True while an event is running today (within its date window). Used to gate
// live background polling so finished/future events never poll.
function eventIsLive(event: Event) {
  return eventDistance(event) === 0;
}

type LatLon = { lat: number; lon: number };

// Great-circle distance in miles between two coordinates.
function haversineMiles(a: LatLon, b: LatLon) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusMiles = 3958.7613;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

// Usable coordinates for an event, or null when absent / a null-island (0,0)
// placeholder that the API sometimes returns for unlocated events.
function eventCoords(event: Event): LatLon | null {
  const c = event.location?.coordinates;
  if (!c || typeof c.lat !== "number" || typeof c.lon !== "number") return null;
  if (c.lat === 0 && c.lon === 0) return null;
  return { lat: c.lat, lon: c.lon };
}

function compareEvents(a: Event, b: Event, sort: EventSort) {
  const aCategory = eventCategory(a);
  const bCategory = eventCategory(b);

  if (sort === "smart") {
    return (
      aCategory.rank - bCategory.rank ||
      eventDistance(a) - eventDistance(b) ||
      new Date(a.start ?? 0).getTime() - new Date(b.start ?? 0).getTime() ||
      a.name.localeCompare(b.name)
    );
  }

  if (sort === "type") return aCategory.rank - bCategory.rank || a.name.localeCompare(b.name);
  if (sort === "name") return a.name.localeCompare(b.name);
  if (sort === "program") return (a.program.code ?? "").localeCompare(b.program.code ?? "") || a.name.localeCompare(b.name);
  if (sort === "location") return locationLine(a).localeCompare(locationLine(b)) || a.name.localeCompare(b.name);
  if (sort === "past-season") {
    return (
      aCategory.rank - bCategory.rank ||
      new Date(b.start ?? 0).getTime() - new Date(a.start ?? 0).getTime() ||
      a.name.localeCompare(b.name)
    );
  }

  return new Date(a.start ?? 0).getTime() - new Date(b.start ?? 0).getTime() || aCategory.rank - bCategory.rank;
}

// ── "My program / my grade" search nudge ─────────────────────────────────────
// Search results lean toward the program and grade level on the user's profile
// (see src/search-bias.ts) — deliberately by a little, not a lot. The nudge is
// expressed in *days of calendar distance*, so it only ever reorders results that
// are already close together: a matching event reads as if it were up to three
// weeks nearer than it is. It can never outrank event tier, and it can never pull
// a match from next season above a non-match happening this weekend.
//
// Two same-named events one grade apart (the "V5RC HS Blast" / "V5RC MS Blast"
// case) both still match the query, so both still lead the list — mine first.
const AFFINITY_PROGRAM_DAYS = 10;
const AFFINITY_GRADE_DAYS = 11;

/** Days of calendar distance to forgive an event for being mine. 0 = no bias. */
function eventAffinityDays(event: Event): number {
  const { programId, gradeCode } = readSearchBias();
  if (programId == null) return 0;
  if (Number(event.program?.id) !== programId) return 0;
  // Grade credit needs the event's own level; until /api/event-grades resolves it,
  // eventGradeCodesBest returns the program span, which contains every grade the
  // program serves — so every event of my program gets the credit equally and the
  // grade half of the nudge is simply inert. It sharpens once grades land.
  if (gradeCode && eventGradeCodesBest(event).includes(gradeCode)) {
    return AFFINITY_PROGRAM_DAYS + AFFINITY_GRADE_DAYS;
  }
  return AFFINITY_PROGRAM_DAYS;
}

/** Ranks matches ahead of non-matches. Used as a last-resort tiebreaker only. */
function eventAffinityRank(event: Event): number {
  return -eventAffinityDays(event);
}

/**
 * Search-result ordering: `compareEvents` with the affinity nudge folded in.
 * For "smart" (what every search bar uses) it discounts the calendar-distance
 * key; for an explicitly chosen sort it only breaks exact ties, so the user's
 * chosen column always wins.
 */
function compareEventsForSearch(a: Event, b: Event, sort: EventSort) {
  if (readSearchBias().programId == null) return compareEvents(a, b, sort);

  if (sort === "smart") {
    const aCategory = eventCategory(a);
    const bCategory = eventCategory(b);
    return (
      aCategory.rank - bCategory.rank ||
      (eventDistance(a) - eventAffinityDays(a) * oneDay) - (eventDistance(b) - eventAffinityDays(b) * oneDay) ||
      new Date(a.start ?? 0).getTime() - new Date(b.start ?? 0).getTime() ||
      a.name.localeCompare(b.name)
    );
  }

  return compareEvents(a, b, sort) || eventAffinityRank(a) - eventAffinityRank(b);
}

function compareEventsChronological(a?: Event, b?: Event) {
  const aTime = new Date(a?.start ?? 0).getTime();
  const bTime = new Date(b?.start ?? 0).getTime();
  return aTime - bTime || (a?.name ?? "").localeCompare(b?.name ?? "");
}

function compareEventsByDirection(direction: DateDirection) {
  return (a?: Event, b?: Event) => (direction === "asc" ? 1 : -1) * compareEventsChronological(a, b);
}

function sameNumberSet(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const values = new Set(a);
  return b.every((value) => values.has(value));
}

function teamNumberParts(number?: string) {
  const match = (number ?? "").trim().match(/^(\d+)(.*)$/);
  return {
    numeric: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
    suffix: (match?.[2] ?? number ?? "").toUpperCase(),
  };
}

function compareTeamsNatural(a: Team, b: Team) {
  const aNumber = teamNumberParts(a.number);
  const bNumber = teamNumberParts(b.number);
  return (
    aNumber.numeric - bNumber.numeric ||
    aNumber.suffix.localeCompare(bNumber.suffix, undefined, { numeric: true }) ||
    (a.team_name ?? "").localeCompare(b.team_name ?? "") ||
    a.number.localeCompare(b.number, undefined, { numeric: true })
  );
}

function normalizedTeamQuery(query: string) {
  return query.trim().toUpperCase().replace(/\s+/g, "");
}

function teamSearchRank(team: Team, query: string) {
  const needle = normalizedTeamQuery(query);
  if (!needle) return 0;
  const teamNumber = normalizedTeamQuery(team.number);
  const numericNeedle = /^\d+$/.test(needle);
  const numberParts = teamNumberParts(team.number);

  if (teamNumber === needle) return 0;
  if (numericNeedle && String(numberParts.numeric) === needle) return 1;
  if (teamNumber.startsWith(needle)) return 2;
  if (teamNumber.includes(needle)) return 3;

  const text = [team.team_name, team.organization, team.grade, team.program?.name, team.program?.code, locationLine(team)]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  if (text.includes(needle)) return 4;
  return 5;
}

// How well a team matches the user's own program / grade (see the event nudge
// above): 0 = both, 1 = program only, 2 = neither. Applied *after* text relevance,
// so an exact number match is never displaced — it only settles which of several
// equally-good matches ("2982A" across four programs) reads first.
function teamAffinityRank(team: Team): number {
  const { programId, gradeCode } = readSearchBias();
  if (programId == null) return 0;
  if (Number(team.program?.id) !== programId) return 2;
  return gradeCode && toGradeCode(team.grade) === gradeCode ? 0 : 1;
}

function compareTeamsForSearch(query: string) {
  return (a: Team, b: Team) =>
    teamSearchRank(a, query) - teamSearchRank(b, query) ||
    teamAffinityRank(a) - teamAffinityRank(b) ||
    compareTeamsNatural(a, b);
}

// Any kind of match (number, name, organization, location) — teamSearchRank 0-4; 5 = nothing matched.
function teamMatchesQuery(team: Team, query: string): boolean {
  const needle = normalizedTeamQuery(query);
  if (!needle) return true;
  return teamSearchRank(team, query) < 5;
}

// Number-only match: the team's *number* must match the needle (exact, numeric
// core, prefix, or substring). Text-field matches (name/organization/location) don't count.
function teamNumberMatches(team: Team, needle: string): boolean {
  const teamNumber = normalizedTeamQuery(team.number);
  const numeric = /^\d+$/.test(needle);
  const parts = teamNumberParts(team.number);
  return (
    teamNumber === needle ||                          // exact
    (numeric && String(parts.numeric) === needle) ||  // numeric core (drop suffix)
    teamNumber.startsWith(needle) ||                  // prefix
    teamNumber.includes(needle)                       // substring in number
  );
}

// Keeps only teams in the given programs. Applied to every team pool the search
// bars assemble (browse cache, robostem, RobotEvents), since not every source
// honours a program filter server-side.
function scopeTeamsToPrograms(teams: Team[], programIds: number[]): Team[] {
  if (programIds.length >= vexProgramIds.length) return teams;
  return teams.filter((team) => programIds.includes(Number(team.program?.id)));
}

function rankTeamsForSearch(teams: Team[], query: string) {
  const needle = normalizedTeamQuery(query);
  // For number-like queries (e.g. "14141" or "14141X") only keep teams whose
  // number matches — loosely-related rank-5 rows must be dropped, not just sorted
  // last, or the .slice() window can still surface them. For text queries keep
  // any match (name/organization/location) and drop only true non-matches (rank 5).
  const isNumberLike = /^\d+[a-z]?$/i.test(needle);
  const pool = isNumberLike
    ? teams.filter((team) => teamNumberMatches(team, needle))
    : teams.filter((team) => teamMatchesQuery(team, query));
  return pool.sort(compareTeamsForSearch(query));
}

function uniqueTeams(teams: Team[]) {
  const seen = new Set<number>();
  return teams.filter((team) => {
    if (seen.has(team.id)) return false;
    seen.add(team.id);
    return true;
  });
}

// Every team currently held in the browse cache (any region/program the user has
// loaded on the Teams tab), deduped by id. The global/spotlight searches use this
// to render instant results and to short-circuit exact team-number lookups.
function allCachedTeams(): Team[] {
  const all: Team[] = [];
  for (const entry of teamListCache.values()) {
    if (entry.data?.data) all.push(...entry.data.data);
  }
  return uniqueTeams(all);
}

// A complete team number is digits + one letter (e.g. "10B", "99999P"). When such
// a query exactly matches a cached team, the cached row is authoritative and no
// network lookup is needed.
function exactCachedTeamMatch(query: string, cached: Team[]): boolean {
  if (!FULL_TEAM_NUMBER_RE.test(query.trim())) return false;
  const target = normalizedTeamQuery(query);
  return cached.some((team) => normalizedTeamQuery(team.number) === target);
}

// A complete team number is 1-5 digits + a single letter (e.g. "1A", "10B",
// "4832E", "99999Z").
const FULL_TEAM_NUMBER_RE = /^\d{1,5}[a-z]$/i;

// Drives the teams half of the general search bars (header, home page, ⌘K palette).
// Publishes ranked results (sliced to `limit`) via `onTeams`, possibly more than
// once as data streams in, and toggles `onLoading`. `isLive` lets the caller cancel
// on unmount / a newer query.
//
// When the query is a *full* team number the VEX (RobotEvents) API is the
// authoritative, instant source: we fire it and robostem-api's fuzzy teamSearch in
// parallel, surface the VEX hit the moment it lands, then merge VEX-first (robostem
// fills in the rest, deduped). The browse cache is skipped here — it's used only as
// a fallback when the VEX request itself fails (rate-limited / offline), in which
// case we fall back to cache-first + robostem.
//
// For every other query we keep the original cache-first behavior: instant cached
// results, short-circuit on an exact cached match, otherwise robostem plus a
// supplementary RobotEvents number lookup.
async function runGlobalTeamSearch(
  query: string,
  limit: number,
  cachedTeams: Team[],
  isLive: () => boolean,
  onTeams: (teams: Team[]) => void,
  onLoading: (loading: boolean) => void,
  // Programs to search, from the Auto / V5 / IQ scope toggle. Defaults to all of
  // them, which is what "Auto" passes.
  programIds: number[] = vexProgramIds,
) {
  const publish = (pool: Team[]) => {
    if (isLive()) onTeams(rankTeamsForSearch(scopeTeamsToPrograms(uniqueTeams(pool), programIds), query).slice(0, limit));
  };

  if (FULL_TEAM_NUMBER_RE.test(query)) {
    onLoading(true);
    const vexPromise = api.robotEventsTeams({ number: query, "program[]": programIds, per_page: 20 });
    const rsePromise = api.teams({ teamSearch: query, per_page: 50 });

    // Surface VEX hits the instant they land — don't wait for robostem.
    vexPromise.then((vex) => publish(vex.data)).catch(() => {});

    const [vexResult, rseResult] = await Promise.allSettled([vexPromise, rsePromise]);
    if (!isLive()) return;
    const rseTeams = rseResult.status === "fulfilled" ? rseResult.value.data : [];
    if (vexResult.status === "fulfilled") {
      publish([...vexResult.value.data, ...rseTeams]); // VEX first, then robostem
    } else {
      publish([...cachedTeams, ...rseTeams]); // VEX failed → cache fallback, then robostem
    }
    onLoading(false);
    return;
  }

  // Instant: teams already in the browse cache, ranked for this query.
  if (cachedTeams.length) onTeams(cachedTeams.slice(0, limit));

  if (exactCachedTeamMatch(query, cachedTeams)) {
    // A complete team number already cached is authoritative — skip the network.
    onLoading(false);
    return;
  }

  onLoading(true);
  try {
    const [rseTeams, exactTeams] = await Promise.all([
      api.teams({ teamSearch: query, per_page: 50 }),
      /^\d+[a-z]?$/i.test(query) ? api.robotEventsTeams({ number: query, "program[]": programIds, per_page: 20 }) : Promise.resolve(null),
    ]);
    publish([...cachedTeams, ...(exactTeams?.data ?? []), ...rseTeams.data]);
  } catch {
    if (isLive() && !cachedTeams.length) onTeams([]);
  } finally {
    if (isLive()) onLoading(false);
  }
}

function gradeCode(grade?: string | null) {
  const value = (grade ?? "").toLowerCase();
  if (value.includes("elementary")) return "ES";
  if (value.includes("middle")) return "MS";
  if (value.includes("high")) return "HS";
  return grade || "-";
}

// The grade span of an event's *program* — the widest it could be, and the
// fallback whenever the exact level isn't known yet.
//
// No API carries a per-event grade: `/events` (v2) and the RoboSTEM mirror both
// omit it, and both ignore grade query params. Deriving it from the event name
// was wrong in both directions — a venue called "@ Oxley High School" made a
// blended V5RC event read as HS-only, while "(ES)" in an IQ title didn't match
// /elementary/ and fell through to "All". The exact level comes from
// /api/event-grades (see useExactEventGrades below and server/eventGrades.ts).
function eventGradeCodes(event: Event): string[] {
  return EVENT_GRADES_BY_PROGRAM[String(event.program?.id ?? "")] ?? [];
}

// ── Exact per-event grade levels ─────────────────────────────────────────────
// Scraped server-side from the public event page and persisted there, so a given
// event costs one third-party proxy request across all users, ever. Locally we
// keep the same rows in localStorage: grade level is fixed at event creation, so
// a cached entry never goes stale and a returning visitor never re-asks.
const EVENT_GRADE_CACHE_KEY = "vex-alliance:event-grades";
const EVENT_GRADE_CACHE_LIMIT = 4000;
// Only V5RC/VIQRC events can differ from their program span (ES-only, MS-only,
// HS-only vs blended). VURC/VAIRC are unambiguous, so never spend a request.
const EXACT_GRADE_PROGRAMS = new Set([1, 41]);
const EVENT_GRADE_RETRY_MS = 10 * 60 * 1000;

function loadExactGradeCache(): Map<string, string[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(EVENT_GRADE_CACHE_KEY) ?? "{}");
    if (!raw || typeof raw !== "object") return new Map();
    return new Map(
      Object.entries(raw as Record<string, unknown>).filter(
        (entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((code) => typeof code === "string"),
      ),
    );
  } catch {
    return new Map();
  }
}

const exactEventGrades = loadExactGradeCache();
const exactGradesInFlight = new Set<string>();
// sku → earliest retry time, for events the server couldn't resolve (a failed
// scrape isn't cached server-side, so without this every render would re-ask).
const exactGradesRetryAt = new Map<string, number>();
const exactGradeListeners = new Set<() => void>();

function saveExactGradeCache() {
  try {
    const entries = [...exactEventGrades.entries()].slice(-EVENT_GRADE_CACHE_LIMIT);
    localStorage.setItem(EVENT_GRADE_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // ignore storage failures (private mode, quota)
  }
}

async function requestExactEventGrades(items: string[]) {
  // Backoff is applied here rather than in the caller's useMemo: reading the
  // clock during render is impure (results would shift on an unrelated
  // re-render), and this runs from an effect.
  const now = Date.now();
  const pending = items.filter(
    (item) => !exactGradesInFlight.has(item) && (exactGradesRetryAt.get(item.split(":")[0]) ?? 0) <= now,
  );
  if (!pending.length) return;
  pending.forEach((item) => exactGradesInFlight.add(item));
  try {
    // Chunked to stay under the endpoint's per-request cap.
    for (let i = 0; i < pending.length; i += 20) {
      const chunk = pending.slice(i, i + 20);
      const { grades } = await api.eventGrades(chunk);
      const now = Date.now();
      chunk.forEach((item) => {
        const sku = item.split(":")[0];
        const codes = grades[sku];
        if (codes?.length) exactEventGrades.set(sku, codes);
        else exactGradesRetryAt.set(sku, now + EVENT_GRADE_RETRY_MS);
      });
      saveExactGradeCache();
      exactGradeListeners.forEach((listener) => listener());
    }
  } catch {
    // Endpoint down / rate-limited: back off on everything we asked about.
    const retryAt = Date.now() + EVENT_GRADE_RETRY_MS;
    pending.forEach((item) => exactGradesRetryAt.set(item.split(":")[0], retryAt));
  } finally {
    pending.forEach((item) => exactGradesInFlight.delete(item));
  }
}

// Resolves exact grade levels for the events currently on screen. Returns a
// lookup that falls back to the program span until (or unless) the exact answer
// lands, so the column is never blank and never wrong — just sometimes wider.
function useExactEventGrades(events: Event[], enabled: boolean) {
  const [, bumpVersion] = useState(0);
  useEffect(() => {
    const listener = () => bumpVersion((version) => version + 1);
    exactGradeListeners.add(listener);
    return () => {
      exactGradeListeners.delete(listener);
    };
  }, []);

  const wanted = useMemo(() => {
    if (!enabled) return [] as string[];
    return events
      .filter((event) => event.sku && EXACT_GRADE_PROGRAMS.has(Number(event.program?.id)) && !exactEventGrades.has(event.sku))
      .map((event) => `${event.sku}:${event.program.id}`);
  }, [events, enabled]);
  const wantedKey = wanted.join(",");

  useEffect(() => {
    if (!wantedKey) return;
    void requestExactEventGrades(wantedKey.split(","));
  }, [wantedKey]);

  return useCallback((event: Event) => eventGradeCodesBest(event), []);
}

// True when the codes shown are the event's own level rather than its program's
// span — drives the tooltip so a wide badge pair isn't mistaken for "blended".
function hasExactEventGrade(event: Event) {
  return exactEventGrades.has(event.sku ?? "");
}

// Best grade info available right now: the event's own level once it has been
// resolved, otherwise its program's span.
function eventGradeCodesBest(event: Event): string[] {
  return exactEventGrades.get(event.sku ?? "") ?? eventGradeCodes(event);
}

// The highest grade an event's program reaches — used where a single grade must
// be picked (e.g. which World Skills ladder to cross-reference).
function eventTopGradeCode(event: Event): string | null {
  const codes = eventGradeCodesBest(event);
  return codes.length ? codes[codes.length - 1] : null;
}

function optionKey(kind: RegionOptionKind, id: string | number) {
  return `${kind}:${id}`;
}

function dedupeCountryGroups(groups: CountryGroup[]) {
  const countries = new Map<number, CountryGroup["options"][number]>();
  groups.forEach((group) => group.options.forEach((country) => countries.set(country.value, country)));
  return [...countries.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function derivedVexRegionLabels(event: Event) {
  const labels = new Set<string>();
  const candidates = [event.name, event.location.region, event.location.country].filter(Boolean).join(" ");
  const patterns = [
    /\b([A-Z][A-Za-z .'-]{2,}?)\s*[-–]\s*(Region\s*\d+|North|South|East|West|Central|Northeast|Northwest|Southeast|Southwest)\b/g,
    /\b([A-Z][A-Za-z .'-]{2,}?)\s+(Region\s*\d+)\b/g,
  ];

  patterns.forEach((pattern) => {
    for (const match of candidates.matchAll(pattern)) {
      const place = match[1].replace(/\s+/g, " ").trim();
      const area = match[2].replace(/\s+/g, " ").trim();
      if (place && area && place.length <= 40) labels.add(`${place} - ${area}`);
    }
  });

  return [...labels];
}

function eventMatchesRegionOption(event: Event, option: RegionOption) {
  const country = normalizeText(event.location.country);
  const region = normalizeText(event.location.region);

  if (option.kind === "country") return country === normalizeText(option.countryName);
  if (option.kind === "subdivision") {
    const countryMatches = !option.countryName || country === normalizeText(option.countryName);
    return countryMatches && region === normalizeText(option.regionName);
  }
  return derivedVexRegionLabels(event).some((label) => normalizeText(label) === normalizeText(option.vexLabel));
}

function eventMatchesRegionOptions(event: Event, options: RegionOption[]) {
  if (!options.length) return true;
  return options.some((option) => eventMatchesRegionOption(event, option));
}

function shortSeasonName(name?: string | null) {
  if (!name) return "Unknown Season";
  return name.split(":").pop()?.trim() || name;
}

// Earliest season RobotEvents has usable data for (VIQRC Crossover / V5RC Starstruck,
// 2016-2017). Older seasons return empty matches/skills/rankings, so we hide them from
// every season picker. Season ids increase monotonically with time, so a numeric floor
// keeps this correct as new seasons are added.
const MIN_SEASON_ID = 114;

const seasonHasData = (season: Pick<Season, "id">) => season.id >= MIN_SEASON_ID;

// Compact two-year season label, e.g. "2025-2026: Push Back" -> "25-26".
function seasonYearLabel(name?: string | null) {
  if (!name) return "";
  const range = name.match(/(\d{4})\s*[-–]\s*(\d{4})/);
  if (range) return `${range[1].slice(2)}-${range[2].slice(2)}`;
  const single = name.match(/(\d{4})/);
  if (single) {
    const year = Number(single[1]);
    return `${String(year).slice(2)}-${String(year + 1).slice(2)}`;
  }
  return "";
}

function makeEventIndex(events: Event[]) {
  return new Map(events.map((event) => [event.id, event]));
}

function awardPriority(award: Award) {
  if (/excellence/i.test(award.title)) return 0;
  if (/world champions|tournament champions|teamwork challenge world champions|event champions/i.test(award.title)) return 1;
  if (/finalists/i.test(award.title)) return 2;
  if (/robot skills world champions|skills champions/i.test(award.title)) return 3;
  return 4;
}

function sortAwards(awards: Award[]) {
  return [...awards].sort((a, b) => awardPriority(a) - awardPriority(b) || a.title.localeCompare(b.title));
}

function awardTeamWinners(award: Award) {
  const value = award.teamWinners as unknown;
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.values(value).filter((winner): winner is NonNullable<Award["teamWinners"]>[number] => {
      return !!winner && typeof winner === "object" && "team" in winner;
    });
  }
  return [];
}

function awardIndividualWinners(award: Award) {
  const value = award.individualWinners as unknown;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).map(String);
  return [];
}

function isIqProgramInfo(program?: { id?: number; code?: string | null; name?: string | null } | null) {
  if (!program) return false;
  if (program.id === 41) return true;
  return /VIQ|IQ/i.test(`${program.code ?? ""} ${program.name ?? ""}`);
}

function isIqProgram(event?: Event | null) {
  return isIqProgramInfo(event?.program);
}

const IQ_FINALS_ROUND = 15;

function isIqFinalsMatch(match: Match) {
  return match.round === IQ_FINALS_ROUND;
}

// In IQ Teamwork, the two partner teams share one score. They normally match;
// if they differ, the lower/zero side's team was disqualified.
function iqMatchResult(match: Match): { score: number | null; dqColor: string | null } {
  const red = match.alliances.find((alliance) => alliance.color === "red");
  const blue = match.alliances.find((alliance) => alliance.color === "blue");
  const r = red?.score;
  const b = blue?.score;
  if (r === null || r === undefined) {
    if (b === null || b === undefined) return { score: null, dqColor: null };
  }
  const rv = r ?? 0;
  const bv = b ?? 0;
  const bothScored = r !== null && r !== undefined && b !== null && b !== undefined;
  const dqColor = bothScored && rv !== bv ? (rv < bv ? "red" : "blue") : null;
  return { score: Math.max(rv, bv), dqColor };
}

// Classifies an IQ qualification score against the event's distribution: scores in
// the top 10% are "gold", the next 10% (top 20%) "bronze". Built from every qual
// match score at the event so the same thresholds apply in the results table and
// the team-focus tables. Returns a no-op classifier for events too small to rank.
type ScoreTier = "gold" | "bronze" | null;
function iqScoreTiers(matches: Match[]): (score: number | null | undefined) => ScoreTier {
  const scores = matches
    .filter((m) => m.round === 2)
    .map((m) => iqMatchResult(m).score)
    .filter((s): s is number => s != null && s > 0)
    .sort((a, b) => a - b);
  if (scores.length < 10) return () => null;
  const quantile = (q: number) => {
    const idx = (scores.length - 1) * q;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi ? scores[lo] : scores[lo] + (scores[hi] - scores[lo]) * (idx - lo);
  };
  const gold = quantile(0.9);
  const bronze = quantile(0.8);
  return (score) => {
    if (score == null) return null;
    if (score >= gold) return "gold";
    if (score >= bronze) return "bronze";
    return null;
  };
}

function iqTierClass(tier: ScoreTier): string {
  return tier === "gold" ? " score-gold" : tier === "bronze" ? " score-bronze" : "";
}

// Abbreviate the leading round word in a match name (Qualification/Qualifier → Q,
// Practice → P, Finals → F) and drop the "#" so it fits one line (Q #16 → Q16).
// R16/QF/SF pass through unchanged (kept with their "#", free to wrap).
function shortMatchName(name: string): string {
  const abbreviated = name
    .replace(/^Qualifications?/i, "Q")
    .replace(/^Qualifiers?/i, "Q")
    .replace(/^Practice/i, "P")
    .replace(/^Finals?/i, "F");
  return abbreviated.replace(/^([QPF])\s*#?\s*(\d)/, "$1$2");
}

function iqDropCount(played: number) {
  if (played < 4) return 0;
  if (played < 8) return 1;
  if (played < 12) return 2;
  return 3;
}

// Compute a team's IQ ranking stats from its qualification matches. Avg/High are
// taken from the API ranking when available; Low (lowest kept) and the dropped
// scores are derived from the team's own per-match scores using the drop rule.
function iqTeamQualStats(qualMatches: Match[], teamId: number, ranking?: Ranking | null) {
  const scores: Array<{ matchnum: number; score: number }> = [];
  qualMatches
    .filter((match) => match.round === 2)
    .forEach((match) => {
      const alliance = match.alliances.find((entry) => isTeamInAlliance(entry, teamId));
      if (!alliance || alliance.score === null || alliance.score === undefined) return;
      scores.push({ matchnum: match.matchnum, score: alliance.score });
    });
  const played = scores.length;
  const sorted = [...scores].sort((a, b) => a.score - b.score || a.matchnum - b.matchnum);
  const dropCount = Math.min(iqDropCount(played), played);
  const dropped = sorted.slice(0, dropCount);
  const kept = sorted.slice(dropCount);
  const allScores = scores.map((entry) => entry.score);
  const high = ranking?.high_score ?? (allScores.length ? Math.max(...allScores) : null);
  const low = kept.length ? Math.min(...kept.map((entry) => entry.score)) : null;
  const avg =
    ranking?.average_points ?? (kept.length ? kept.reduce((sum, entry) => sum + entry.score, 0) / kept.length : null);
  return { played, high, low, avg, dropped };
}

// IQ alliances are the partner pairs that appear in the finals, seeded by
// finals match order: the pair that plays the LAST finals match (highest F
// number) is the 1st seed, and the pair in Finals 1 is the lowest seed.
// Tiebreaker replays of the same pair are de-duped (first appearance wins).
function iqFinalsAlliances(matches: Match[]): Array<[number, string[]]> {
  const seen = new Set<string>();
  const pairs: string[][] = [];
  matches
    .filter((match) => isIqFinalsMatch(match))
    .sort((a, b) => (a.instance ?? 0) - (b.instance ?? 0) || a.matchnum - b.matchnum)
    .forEach((match) => {
      const red = match.alliances.find((alliance) => alliance.color === "red");
      const blue = match.alliances.find((alliance) => alliance.color === "blue");
      const teams = [
        ...(red?.teams.map((entry) => entry.team.name) ?? []),
        ...(blue?.teams.map((entry) => entry.team.name) ?? []),
      ].filter(Boolean);
      if (!teams.length) return;
      const key = [...teams].sort().join("|");
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push(teams);
    });
  // Seed assignment: last finals pair (highest F number) → seed 1, Finals 1 pair
  // → lowest seed. `.reverse()` then orders the list smallest-seed-first for display.
  const n = pairs.length;
  return pairs.map((teams, index) => [n - index, teams] as [number, string[]]).reverse();
}

// Label finals matches "Finals 1", "Finals 2"... in order; a repeat of the same
// pair (a replay) is labeled "Tiebreaker".
function iqFinalsLabels(matches: Match[]): Map<number, string> {
  const labels = new Map<number, string>();
  const seen = new Set<string>();
  let counter = 0;
  matches
    .filter((match) => isIqFinalsMatch(match))
    .sort((a, b) => (a.instance ?? 0) - (b.instance ?? 0) || a.matchnum - b.matchnum)
    .forEach((match) => {
      const teams = match.alliances.flatMap((alliance) => alliance.teams.map((entry) => entry.team.name)).filter(Boolean);
      const key = [...teams].sort().join("|");
      if (seen.has(key)) {
        labels.set(match.id, "Tiebreaker");
      } else {
        seen.add(key);
        counter += 1;
        labels.set(match.id, `Finals ${counter}`);
      }
    });
  return labels;
}

// For a team's IQ event: its finals partner pair (red team first) and seed.
function iqTeamFinals(matches: Match[], teamId: number) {
  const finals = matches
    .filter((match) => isIqFinalsMatch(match))
    .sort((a, b) => (a.instance ?? 0) - (b.instance ?? 0) || a.matchnum - b.matchnum);
  const match = finals.find((entry) => entry.alliances.some((alliance) => isTeamInAlliance(alliance, teamId)));
  if (!match) return null;
  const red = match.alliances.find((alliance) => alliance.color === "red");
  const blue = match.alliances.find((alliance) => alliance.color === "blue");
  const teams = [...(red?.teams.map((entry) => entry.team) ?? []), ...(blue?.teams.map((entry) => entry.team) ?? [])];
  if (!teams.length) return null;
  const key = [...teams.map((team) => team.name)].sort().join("|");
  const ranked = iqFinalsAlliances(matches);
  const seedEntry = ranked.find(([, names]) => [...names].sort().join("|") === key);
  return { seed: seedEntry?.[0] ?? null, teams };
}

function highlightAwards(awards: Award[], event?: Event | null): HighlightAward[] {
  const hasWinners = (award: Award) => awardTeamWinners(award).length > 0 || awardIndividualWinners(award).length > 0;
  const titleMatches = (pattern: RegExp) => awards.find((award) => pattern.test(award.title) && hasWinners(award));
  const excellence = titleMatches(/excellence award/i);
  const champions = titleMatches(isIqProgram(event) ? /teamwork.*champions?/i : /world champions?|tournament champions?|event champions?/i);
  const skills = titleMatches(/(?:robot\s*)?skills?.*champions?/i);
  const highlights: HighlightAward[] = [];

  const isWorlds = !!event && eventCategory(event).label === "Worlds";
  const champLabel = isIqProgram(event) ? "Teamwork Champions" : isWorlds ? "World Champion" : "Tournament Champions";
  if (excellence) highlights.push({ award: excellence, label: "Excellence Award", kind: "excellence" });
  if (champions) highlights.push({ award: champions, label: champLabel, kind: "champions" });
  if (skills) highlights.push({ award: skills, label: "Robot Skills Champion", kind: "skills" });

  return highlights;
}



function jumperPresetName(event: Event, preset?: JumperPresetExists | null) {
  return preset?.preset ?? preset?.presetName ?? preset?.preset_name ?? preset?.sku ?? event.sku;
}

let ytApiLoaded = false;
let ytApiReady = false;
const ytReadyCallbacks: Array<() => void> = [];

function loadYouTubeApi() {
  if (ytApiLoaded) return;
  ytApiLoaded = true;
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
  (window as unknown as Record<string, unknown>).onYouTubeIframeAPIReady = () => {
    ytApiReady = true;
    ytReadyCallbacks.forEach((cb) => cb());
    ytReadyCallbacks.length = 0;
  };
}

function onYtApiReady(cb: () => void) {
  if (ytApiReady) {
    cb();
  } else {
    ytReadyCallbacks.push(cb);
    loadYouTubeApi();
  }
}

function matchWinner(match: Match) {
  const red = match.alliances.find((alliance) => alliance.color === "red");
  const blue = match.alliances.find((alliance) => alliance.color === "blue");
  const redScore = red?.score;
  const blueScore = blue?.score;
  const hasScore = redScore !== null && redScore !== undefined && blueScore !== null && blueScore !== undefined;

  if (!hasScore) return { red, blue, redScore, blueScore, winner: "-" };
  if (redScore === blueScore) return { red, blue, redScore, blueScore, winner: "Tie" };
  return { red, blue, redScore, blueScore, winner: redScore > blueScore ? "Red" : "Blue" };
}

function playoffRoundKey(match: Match) {
  if (/^R16\b/i.test(match.name)) return "r16";
  if (/^QF\b/i.test(match.name)) return "qf";
  if (/^SF\b/i.test(match.name)) return "sf";
  if (/^Final\b/i.test(match.name)) return "f";
  return `round-${match.round}`;
}

function playoffRoundLabel(key: string) {
  if (key === "r16") return "Round of 16 (R16)";
  if (key === "qf") return "Quarterfinals (QF)";
  if (key === "sf") return "Semifinals (SF)";
  if (key === "f") return "Finals (F)";
  return "Playoffs";
}

function matchRoundOrder(match: Match) {
  if (/practice/i.test(match.name)) return 0;
  if (/qual/i.test(match.name) || match.round === 2) return 1;
  const key = playoffRoundKey(match);
  if (key === "r16") return 2;
  if (key === "qf") return 3;
  if (key === "sf") return 4;
  if (key === "f") return 5;
  return 6 + Math.max(0, match.round ?? 0);
}

function compareMatchesDisplay(a: Match, b: Match, preferredDivisionId?: number | null) {
  const aPreferred = preferredDivisionId && a.division?.id === preferredDivisionId ? 0 : 1;
  const bPreferred = preferredDivisionId && b.division?.id === preferredDivisionId ? 0 : 1;
  return (
    aPreferred - bPreferred ||
    matchRoundOrder(a) - matchRoundOrder(b) ||
    (a.instance ?? 0) - (b.instance ?? 0) ||
    a.matchnum - b.matchnum ||
    (a.division?.name ?? "").localeCompare(b.division?.name ?? "") ||
    a.name.localeCompare(b.name)
  );
}

function matchTimestampMs(match: Match) {
  const value = match.scheduled ?? match.started;
  return value ? new Date(value).getTime() || 0 : 0;
}

// Match clock. With a timezone the time is shown in the event's local time (the API
// reports every match in US Eastern, so this is what a spectator at the event sees);
// without one it falls back to the viewer's browser timezone.
function formatMatchClock(match: Match, tz?: string | null) {
  const value = match.scheduled ?? match.started;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", ...(tz ? { timeZone: tz } : {}) }).format(date);
}

// Short timezone label for a match instant (e.g. "GMT+8", "EST"), used in the tooltip
// that appears when the event's timezone differs from the viewer's.
function matchTzLabel(match: Match, tz: string): string {
  const value = match.scheduled ?? match.started;
  if (!value) return tz;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return tz;
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? tz;
}

// Renders a match clock in event-local time. When the event's zone differs from the
// viewer's (so the shown time isn't the viewer's own), a small superscript info icon
// is appended; hovering it reveals the viewer's local equivalent.
function MatchTime({ match, eventTz, className = "result-match-time" }: { match: Match; eventTz?: string | null; className?: string }) {
  const clock = formatMatchClock(match, eventTz);
  if (!clock) return null;
  const localClock = formatMatchClock(match, null);
  const differs = !!eventTz && localClock != null && localClock !== clock;
  return (
    <span className={className}>
      {clock}
      {differs && (
        <sup
          className="tz-info"
          title={`Event local time (${matchTzLabel(match, eventTz!)}). Your local time: ${localClock}.`}
          aria-label={`Shown in event local time. Your local time: ${localClock}.`}
        >
          <Info size={9} aria-hidden />
        </sup>
      )}
    </span>
  );
}

// RobotEvents serves every match time in US Eastern regardless of where the event
// is, so slicing the raw ISO date groups western events by the wrong calendar day
// (an evening match past midnight Eastern spills into a phantom "next day"). Resolve
// the event's IANA zone from its coordinates so day boundaries follow the event's
// local time. Returns null when we have no coordinates (or the lookup fails), in
// which case callers fall back to the raw Eastern date — correct for Eastern-US events.
function eventTimeZone(event: Event | null | undefined): string | null {
  const coords = event?.location?.coordinates;
  if (!coords || typeof coords.lat !== "number" || typeof coords.lon !== "number") return null;
  try {
    return tzLookup(coords.lat, coords.lon);
  } catch {
    return null;
  }
}

// Build a match → "YYYY-MM-DD" day-key function. With a timezone, the key is the
// match's calendar date *at the event's location*; without one it falls back to the
// raw leading date of the API timestamp (Eastern). This drives day grouping only —
// the displayed match clock (formatMatchClock) is unaffected.
function makeMatchDayKey(tz?: string | null): (match: Match) => string | null {
  const dayFormatter = tz
    ? new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    : null;
  return (match: Match) => {
    const value = match.scheduled ?? match.started;
    if (!value) return null;
    if (dayFormatter) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return dayFormatter.format(date);
    }
    const isoDate = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    return isoDate ? isoDate[1] : null;
  };
}

function uniqueMatches(matches: Match[]) {
  const seen = new Set<number>();
  return matches.filter((match) => {
    if (seen.has(match.id)) return false;
    seen.add(match.id);
    return true;
  });
}

function preferredTeamDivisionId(matches: Match[], teamId: number) {
  const divisionCounts = new Map<number, number>();
  matches
    .filter((match) => match.round === 2 || /qual/i.test(match.name))
    .forEach((match) => {
      if (!match.alliances.some((alliance) => isTeamInAlliance(alliance, teamId))) return;
      divisionCounts.set(match.division.id, (divisionCounts.get(match.division.id) ?? 0) + 1);
    });
  return [...divisionCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
}

const r16SeedPairs = [
  [1, 16],
  [8, 9],
  [4, 13],
  [5, 12],
  [2, 15],
  [7, 10],
  [3, 14],
  [6, 11],
];

/**
 * Derive each elimination-bracket alliance and its seed from the matches.
 *
 * Unlike a naive R16-only read, this scans the WHOLE bracket (R16 → QF → SF → F)
 * so it works for every standard RobotEvents shape:
 *  - clean 16-alliance events — seeds recovered straight from the R16 instances
 *    ([1,16],[8,9],… with red = better seed, blue = worse seed);
 *  - 8-alliance events that start at Quarterfinals with no R16 round at all —
 *    seeds recovered from the QF instances ([1,8],[4,5],[2,7],[3,6]);
 *  - 9–15 alliance events where the top seeds get byes and therefore first appear
 *    in QF rather than R16.
 *
 * Each alliance is identified by its (order-independent) set of team ids so it is
 * tracked consistently across rounds; the display order (captain first) is taken
 * from its earliest appearance. Seeds that land cleanly on a standard bracket
 * instance are assigned structurally (R16 when the event has one, otherwise QF).
 *
 * Any alliance left without a structural seed — bye captains that skip R16 — is
 * resolved by qualification rank: the better-ranked captain (teams[0]) takes the
 * better of the remaining seed slots. This matches how byes are awarded (to the
 * top qualifiers). Ranking data is optional; without it, leftovers fall back to
 * bracket appearance order so the common clean-16 case never regresses.
 */
function allianceRowsFromMatches(
  matches: Match[],
  rankByTeam?: Map<number, number>,
): Array<[number, string[]]> {
  const elim = matches.filter((match) => playoffImportance(match) > 0);
  if (!elim.length) return [];

  // A 16-alliance bracket has an R16 round; an 8-alliance bracket starts at QF.
  const hasR16 = elim.some((match) => playoffRoundKey(match) === "r16");

  type AllianceInfo = { teams: IdInfo[]; order: number; seed: number | null };
  const alliances = new Map<string, AllianceInfo>();
  const identity = (teams: IdInfo[]) =>
    teams.map((team) => team.id).filter(Boolean).sort((a, b) => a - b).join("-");

  // Scan earliest round first so each alliance's earliest appearance wins the
  // captain-first ordering and provides its structural seed.
  const roundRank: Record<string, number> = { r16: 0, qf: 1, sf: 2, f: 3 };
  const ordered = [...elim].sort(
    (a, b) =>
      (roundRank[playoffRoundKey(a)] ?? 9) - (roundRank[playoffRoundKey(b)] ?? 9) ||
      (a.instance ?? 0) - (b.instance ?? 0) ||
      a.matchnum - b.matchnum,
  );

  let appearance = 0;
  ordered.forEach((match) => {
    const key = playoffRoundKey(match);
    (["red", "blue"] as const).forEach((color) => {
      const teams = match.alliances.find((alliance) => alliance.color === color)?.teams
        .map((entry) => entry.team)
        .filter((team) => team?.id) ?? [];
      if (!teams.length) return;
      const id = identity(teams);
      if (!id) return;
      let info = alliances.get(id);
      if (!info) {
        info = { teams, order: appearance++, seed: null };
        alliances.set(id, info);
      }
      if (info.seed != null) return;
      const slot = color === "red" ? 0 : 1;
      const pair =
        key === "r16" ? r16SeedPairs[(match.instance ?? 1) - 1]
        : key === "qf" && !hasR16 ? qfSeedPairs[(match.instance ?? 1) - 1]
        : undefined;
      if (pair) info.seed = pair[slot];
    });
  });

  const infos = [...alliances.values()];
  const used = new Set<number>();
  infos.forEach((info) => { if (info.seed != null) used.add(info.seed); });

  // Rankings fallback for byes / anything the bracket left ambiguous: better
  // captain rank → better (lower) remaining seed; appearance order breaks ties.
  const captainRank = (info: AllianceInfo) =>
    rankByTeam?.get(info.teams[0]?.id ?? -1) ?? Number.POSITIVE_INFINITY;
  const leftovers = infos
    .filter((info) => info.seed == null)
    .sort((a, b) => captainRank(a) - captainRank(b) || a.order - b.order);
  let nextSeed = 1;
  leftovers.forEach((info) => {
    while (used.has(nextSeed)) nextSeed += 1;
    info.seed = nextSeed;
    used.add(nextSeed);
  });

  return infos
    .filter((info): info is AllianceInfo & { seed: number } => info.seed != null)
    .map((info) => [info.seed, info.teams.map((team) => team.name).filter(Boolean)] as [number, string[]])
    .sort((a, b) => a[0] - b[0]);
}

function groupItemsByEvent<T extends { event: { id: number; name: string } }>(
  items: T[],
  eventIndex: Map<number, Event>,
  seasonId: number | null,
  direction: DateDirection = "asc",
) {
  const groups = new Map<number, { eventRef: T["event"]; event?: Event; items: T[] }>();

  items.forEach((item) => {
    const event = eventIndex.get(item.event.id);
    // Server already scoped awards/rankings/skills by season[]; only drop when
    // we positively resolve the event to a *different* season. Never exclude on
    // a missing event (off-season events like iSTEAM January, or events absent
    // from teams/{id}/events) — those are legitimately in the queried season.
    if (seasonId && event && event.season?.id != null && event.season.id !== seasonId) return;

    const group: { eventRef: T["event"]; event?: Event; items: T[] } = groups.get(item.event.id) ?? { eventRef: item.event, event, items: [] };
    group.items.push(item);
    groups.set(item.event.id, group);
  });

  return [...groups.values()].sort((a, b) => compareEventsByDirection(direction)(a.event, b.event));
}

function filterAndSortEvents(events: Event[], options: {
  search?: string;
  programIds?: string[];
  level?: string;
  regionOptions?: RegionOption[];
  seasonIds?: number[];
  hideCanceled?: boolean;
  sort?: EventSort;
  grades?: string[];
}) {
  const needle = (options.search ?? "").trim().toLowerCase();
  const seasonIds = options.seasonIds ?? [];
  const programIds = options.programIds ?? [];
  const grades = options.grades ?? [];

  return events
    .filter((event) => {
      const haystack = [
        event.name,
        event.sku,
        event.level,
        event.event_type,
        event.program.code,
        event.program.name,
        event.season.name,
        event.location.venue,
        event.location.city,
        event.location.region,
        event.location.country,
        event.location.postcode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (needle && !haystack.includes(needle)) return false;
      if (programIds.length && !programIds.includes(String(event.program.id))) return false;
      if (seasonIds.length && !seasonIds.includes(event.season.id)) return false;
      if (options.level) {
        // Filter by tier, not by the raw RobotEvents level — otherwise "Worlds"
        // also matches Spotlight events, which arrive as level "World".
        const wantedCategory = LEVEL_FILTER_CATEGORIES[options.level];
        if (wantedCategory) {
          if (eventCategory(event).label !== wantedCategory) return false;
        } else if (event.level !== options.level) return false;
      }
      if (!eventMatchesRegionOptions(event, options.regionOptions ?? [])) return false;
      if (options.hideCanceled && /cancel+ed|canceled/i.test(event.name)) return false;
      // An event covers every grade its program spans, so a grade filter keeps any
      // event whose span includes one of the selected grades.
      if (grades.length && !eventGradeCodesBest(event).some((code) => grades.includes(code))) return false;
      return vexProgramIds.includes(event.program.id);
    })
    // The "my program / my grade" nudge applies to *searching* only. Browsing a
    // filtered list is an explicit request for that list, so its order is left
    // exactly as the user asked for it.
    .sort((a, b) => (needle ? compareEventsForSearch(a, b, options.sort ?? "smart") : compareEvents(a, b, options.sort ?? "smart")));
}

// Fetch bounds for a time window. "today" has none of its own: it reuses the
// near-today fetch (see eventWindowFetchKey) and is narrowed on the client, so
// multi-day events that started before today still surface.
function eventWindowDates(eventWindow: EventWindow) {
  if (eventWindow === "upcoming") return { start: dateOnly(today), end: undefined };
  if (eventWindow === "next30") return { start: dateOnly(today), end: dateOnly(addDays(today, 30)) };
  if (eventWindow === "next90") return { start: dateOnly(today), end: dateOnly(addDays(today, 90)) };
  if (eventWindow === "past30") return { start: dateOnly(addDays(today, -30)), end: dateOnly(today) };
  if (eventWindow === "allSeason") return { start: undefined, end: undefined };
  return { start: dateOnly(addDays(today, -30)), end: dateOnly(addDays(today, 120)) };
}

// The Time filter, in the order they read as a 2×2: narrowest first.
const EVENT_WINDOW_OPTIONS: Array<{ label: string; value: EventWindow }> = [
  { label: "Today", value: "today" },
  { label: "Near today", value: "near" },
  { label: "Upcoming", value: "upcoming" },
  { label: "All", value: "allSeason" },
];

// Windows that share a fetch collapse to the same key, so switching between
// them re-filters the cached response instead of re-querying the API.
function eventWindowFetchKey(eventWindow: EventWindow): EventWindow {
  return eventWindow === "today" ? "near" : eventWindow;
}

// True when today falls inside the event's date span. Matches the Home "Today"
// tab: the end date is given a day of grace so an event still counts on its
// final day regardless of the time-of-day component.
function eventIsToday(event: Event) {
  return eventDistance(event) === 0;
}

function Empty({ children = "Nothing here yet." }: { children?: ReactNode }) {
  return (
    <motion.div className="empty" variants={revealUp} initial="initial" animate="animate">
      {children}
    </motion.div>
  );
}

// Crossfades a skeleton out and content in when `loading` flips, so data never
// pops in abruptly. Both `skeleton` and `children` must be block-level nodes
// (not <tbody>/<tr>) since each render is wrapped in a motion.div.
function LoadingSwap({
  loading,
  skeleton,
  children,
}: {
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={loading ? "skeleton" : "content"}
        variants={loading ? fade : revealUp}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {loading ? skeleton : children}
      </motion.div>
    </AnimatePresence>
  );
}

// Sliding active-indicator for segmented controls / tab bars. Render
// `{active && <SlideIndicator id="unique-per-group" />}` inside the active
// button (the button must be position:relative). Framer's shared `layoutId`
// slides the single indicator from the old button to the new one when the
// active item changes. `variant` picks the visual: an underline (tab bars) or
// a filled pill (segmented toggles). The id MUST be unique per control group.
function SlideIndicator({ id, variant = "underline" }: { id: string; variant?: "underline" | "pill" }) {
  return (
    <motion.span
      layoutId={id}
      // Constant dependency: only the layoutId handoff (this span unmounting on
      // one option and mounting on another) animates. Without it every render
      // re-measures, so anything that shifts the group — the season list
      // arriving above the program toggle, for one — slid the indicator across
      // the screen on page load.
      layoutDependency={0}
      className={variant === "pill" ? "slide-pill" : "slide-underline"}
      transition={springSmooth}
      aria-hidden
    />
  );
}

// Crossfades the loading skeleton rows and the real rows when `loading` flips,
// inside a persistent <table>. Opacity-only (transforms on <tbody> are
// unreliable); mode="wait" so the skeleton fades out before data fades in.
// Both branches are <motion.tbody> — multiple bodies in one table are valid.
function TableBodySwap({ loading, columns, children }: { loading: boolean; columns: number; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {loading ? (
        <motion.tbody key="loading" variants={fade} initial="initial" animate="animate" exit="exit">
          {Array.from({ length: 5 }).map((_, row) => (
            <tr key={row}>
              {Array.from({ length: columns }).map((__, col) => (
                <td key={col}>
                  <Skeleton className="h-3.5 w-[min(100%,180px)]" />
                </td>
              ))}
            </tr>
          ))}
        </motion.tbody>
      ) : (
        <motion.tbody key="data" variants={fade} initial="initial" animate="animate" exit="exit">
          {children}
        </motion.tbody>
      )}
    </AnimatePresence>
  );
}

// Catches render-time exceptions in its subtree so a single broken component
// degrades to a contained message instead of unmounting the whole React tree
// (which renders a blank/black screen). Wrap the page content and each overlay
// so a crash in one area never takes down the rest of the app.
//   - `silent`: render nothing on error (for overlays/modals — the panel simply
//     doesn't appear and the page underneath stays usable).
//   - reset via key change: the page boundary is keyed by route, so navigating
//     elsewhere clears a caught error automatically.
type ErrorBoundaryProps = { children: ReactNode; silent?: boolean };
type ErrorBoundaryState = { error: Error | null };

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the crash visible in the console for diagnostics even though the UI
    // recovers gracefully.
    console.error("Render error caught by ErrorBoundary:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.silent) return null;
      return (
        <Alert variant="destructive" className="m-4 w-auto">
          <AlertDescription>
            Something went wrong displaying this content.
            <Button variant="outline" size="sm" className="ml-3" onClick={this.reset}>Try again</Button>
          </AlertDescription>
        </Alert>
      );
    }
    return this.props.children;
  }
}

function Status({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading)
    return (
      <Alert className="m-4 w-auto">
        <AlertDescription>Loading competition data…</AlertDescription>
      </Alert>
    );
  if (error)
    return (
      <Alert variant="destructive" className="m-4 w-auto">
        <AlertDescription>API error: {error}</AlertDescription>
      </Alert>
    );
  return null;
}

function LocalPager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  if (!Number.isFinite(totalPages) || totalPages <= 1) return null;

  return (
    <div className="pager">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
        <ChevronLeft size={16} />
      </button>
      <span>
        Page {page.toLocaleString()} of {totalPages.toLocaleString()}
      </span>
      <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// Tap/hover reveal for a SKILLS score's auto (programming) vs driver split.
// The split only exists for skills — a per-match auto/driver breakdown is NOT
// available from the RobotEvents match feed (`Alliance` carries a single
// `score`), so a true match-level split would need new data and is not done here.
// Hover shows the breakdown on desktop; tap toggles it open for touch devices,
// reusing the `data-tip`-style tooltip convention.
function ScoreBreakdown({ combined, programming, driver }: { combined: number | null | undefined; programming: number | null | undefined; driver: number | null | undefined }) {
  const [open, setOpen] = useState(false);
  const auto = programming ?? 0;
  const drv = driver ?? 0;
  return (
    <button
      type="button"
      className={`score-breakdown${open ? " open" : ""}`}
      aria-expanded={open}
      aria-label={`Skills score ${combined ?? "unknown"}. Autonomous ${auto}, driver ${drv}.`}
      onClick={() => setOpen((v) => !v)}
      onBlur={() => setOpen(false)}
    >
      <span className="score-breakdown-value">{combined ?? "–"}</span>
      <span className="score-breakdown-pop" role="tooltip">
        <span className="score-breakdown-line"><span className="k">Autonomous</span><span className="v">{auto}</span></span>
        <span className="score-breakdown-line"><span className="k">Driver</span><span className="v">{drv}</span></span>
        <span className="score-breakdown-line total"><span className="k">Combined</span><span className="v">{combined ?? auto + drv}</span></span>
      </span>
    </button>
  );
}

/**
 * The event's tier (Worlds / Signature / Spotlight / Championship) as a chip small
 * enough to ride along on a line of muted text that is already there — the SKU
 * line in the team Rankings/Skills tables, the date line on an award card — so it
 * costs no row height. Ordinary tournaments ("Other") get nothing: a chip on
 * every row would be noise rather than information.
 *
 * Colours come from the shared .priority-N classes, the same ones the events list
 * and the event header use, so a Signature reads Signature everywhere.
 */
function EventTierTag({ event }: { event?: Event | null }) {
  if (!event) return null;
  const category = eventCategory(event);
  if (category.label === "Other") return null;
  return <span className={`event-tier-tag priority-${category.rank}`}>{category.label}</span>;
}

function ProgramBadge({ program }: { program?: { code?: string | null; name?: string } }) {
  return <Badge variant="secondary">{program?.code ?? program?.name ?? "VEX"}</Badge>;
}

function GradeBadge({ grade }: { grade?: string | null }) {
  return <Badge variant="secondary">{gradeCode(grade)}</Badge>;
}

function CompareModeButton() {
  const active = useComparePickMode();
  return (
    <button
      type="button"
      className={`icon-button compare-mode-btn${active ? " active" : ""}`}
      onClick={toggleComparePickMode}
      title={active ? "Exit compare mode" : "Click team numbers to add teams to compare"}
      aria-label={active ? "Exit compare mode" : "Enter compare mode"}
    >
      <Scale size={15} aria-hidden="true" />
    </button>
  );
}

function ComparePickHint() {
  const active = useComparePickMode();
  if (!active) return null;
  return (
    <div className="compare-pick-hint">
      Click team numbers to add or remove teams from compare.
    </div>
  );
}

function addOrRemoveCompareTeam(teamId: number, teamNumber: string, programCode: string, teamName?: string | null) {
  if (isInTray(teamId)) {
    removeFromTray(teamId);
    return;
  }
  if (!canAddToTray()) return;
  addToTray({ teamId, teamNumber, programCode, teamName: teamName ?? undefined });
}

function CompareTeamLink({
  teamId,
  teamNumber,
  programCode,
  teamName,
  className,
  children,
}: {
  teamId: number;
  teamNumber: string;
  programCode?: string;
  teamName?: string | null;
  className?: string;
  children?: ReactNode;
}) {
  const compareMode = useComparePickMode();
  const quickViewFirst = useQuickViewFirst();
  const search = useContext(TeamSearchContext);
  const inTray = useIsInTray(teamId);
  const full = !canAddToTray() && !inTray;
  const rawContent = children ?? teamNumber;
  // Bold the matching part of the team number when an in-event search is active.
  const content = search && typeof rawContent === "string" ? highlightMatch(rawContent, search) : rawContent;

  if (!compareMode) {
    return (
      <Link
        href={teamSlugPath(programCode, teamNumber, teamId)}
        className={className}
        onClick={(e) => {
          // Quick view only when viewing an event; elsewhere navigate as usual.
          if (!quickViewFirst || _currentEventId == null) return;
          e.preventDefault();
          e.stopPropagation();
          openQuickView({ teamId, teamNumber, programCode, teamName, pointerSide: pointerSideFromEvent(e) });
        }}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={`compare-pick-team${className ? ` ${className}` : ""}${inTray ? " in-tray" : ""}${full ? " disabled" : ""}`}
      disabled={full}
      title={inTray ? "Remove from comparison" : full ? "Tray full (3/3)" : "Add to comparison"}
      onClick={(e) => {
        e.stopPropagation();
        addOrRemoveCompareTeam(teamId, teamNumber, programCode ?? "", teamName);
      }}
    >
      {content}
    </button>
  );
}

// A plain team link (no compare-pick behavior) that still honors the quick-view
// setting: opens the quick view in-place when on, navigates when off. Used for
// team links that aren't CompareTeamLinks — award winner pills, alliance seeds,
// note chips, etc. `teamId` is optional (alliance seeds only carry a number).
function TeamQuickLink({ teamId, teamNumber, programCode, teamName, className, title, children }: {
  teamId?: number;
  teamNumber: string;
  programCode?: string;
  teamName?: string | null;
  className?: string;
  title?: string;
  children?: ReactNode;
}) {
  const quickViewFirst = useQuickViewFirst();
  const search = useContext(TeamSearchContext);
  const rawContent = children ?? teamNumber;
  const content = search && typeof rawContent === "string" ? highlightMatch(rawContent, search) : rawContent;
  return (
    <Link
      href={teamSlugPath(programCode, teamNumber, teamId)}
      className={className}
      title={title}
      onClick={(e) => {
        // Quick view only when viewing an event; elsewhere navigate as usual.
        if (!quickViewFirst || _currentEventId == null) return;
        e.preventDefault();
        e.stopPropagation();
        openQuickView({ teamId, teamNumber, programCode, teamName, pointerSide: pointerSideFromEvent(e) });
      }}
    >
      {content}
    </Link>
  );
}

function TeamMiniLink({ team, className }: { team: { id: number; name: string }; className?: string }) {
  const programCode = useContext(ProgramContext);
  return (
    <CompareTeamLink teamId={team.id} teamNumber={team.name} programCode={programCode} className={className}>
      {team.name}
    </CompareTeamLink>
  );
}

function AllianceTeamLinks({ teams, focusTeamId, dq }: { teams?: Match["alliances"][number]["teams"]; focusTeamId?: number; dq?: boolean }) {
  if (!teams?.length) return <>-</>;

  return (
    <span className="team-link-list">
      {teams.map((entry) => {
        const focusClass = focusTeamId ? (entry.team.id === focusTeamId ? "team-chip team-chip-focus" : "team-chip team-chip-muted") : undefined;
        return <TeamMiniLink key={entry.team.id} team={entry.team} className={focusClass} />;
      })}
      {dq && <span className="dq-badge">DQ</span>}
    </span>
  );
}

// ── Icon morph ────────────────────────────────────────────────────────────────
// Apple-style "symbol replace": the resting glyph scales/spins out while the
// confirmation glyph springs in. Used two ways —
//   • persistent state (in tray / on picklist): morphed follows the state
//   • transient confirm (copied, saved, exported): useConfirmFlash fires a timer

/**
 * One-shot confirmation flash. Fire it on the *constructive* action only —
 * a check mark on a remove/delete reads as "done" and invites misclicks.
 */
function useConfirmFlash(duration = 760) {
  const [flashing, setFlashing] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  const fire = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setFlashing(true);
    timer.current = window.setTimeout(() => setFlashing(false), duration);
  };
  return { flashing, fire };
}

/**
 * Cross-morphs `children` (resting glyph) with `to` (confirmation glyph).
 * tone: "gold" for collect/save-to-my-stuff, "success" for completed operations,
 * "inherit" when the host button already colors itself (accent row buttons).
 */
function IconMorph({
  morphed,
  size,
  tone = "gold",
  to,
  children,
}: {
  morphed: boolean;
  size: number;
  tone?: "gold" | "success" | "inherit";
  to?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={`icon-morph tone-${tone}${morphed ? " morphed" : ""}`}
      style={{ width: size, height: size }}
    >
      <span className="icon-morph-from">{children}</span>
      <span className="icon-morph-to">{to ?? <Check size={size} strokeWidth={3} />}</span>
    </span>
  );
}

/** Button class suffix for the tinted "confirming" treatment. */
function confirmClass(flashing: boolean, tone: "gold" | "success" = "gold") {
  return flashing ? ` btn-confirming tone-${tone}` : "";
}

/**
 * CSV/export button. A download is otherwise silent — the browser may drop the
 * file into a folder the user never sees — so the arrow morphs to a check.
 */
function ExportButton({
  onExport,
  title,
  label = "CSV",
  className = "ws-csv-btn",
}: {
  onExport: () => void;
  title: string;
  label?: string;
  className?: string;
}) {
  const { flashing, fire } = useConfirmFlash(1100);
  return (
    <button
      type="button"
      className={`${className}${confirmClass(flashing, "success")}`}
      title={title}
      onClick={() => { onExport(); fire(); }}
    >
      <IconMorph morphed={flashing} size={13} tone="success">
        <Download size={13} />
      </IconMorph>
      {label}
    </button>
  );
}

function FavoriteButton({ id, kind }: { id: number | string; kind: "team" | "event" }) {
  const active = useFavorite(kind, id);
  const { flashing, fire } = useConfirmFlash();

  return (
    <button
      className={`icon-button ${active ? "active" : ""}${confirmClass(flashing)}`}
      title={active ? "Remove favorite" : "Favorite"}
      onClick={() => {
        if (!active) fire();
        toggleFavorite(kind, id);
      }}
    >
      <IconMorph morphed={flashing} size={17}>
        <Star size={17} fill={active ? "currentColor" : "none"} />
      </IconMorph>
    </button>
  );
}

// ── Shared Team Favorite buttons ─────────────────────────────────────────────

/** Inner button for a single shared team — reads active state and toggles. */
function SharedTeamFavBtn({
  sharedTeamId,
  kind,
  refId,
  label,
  onToggle,
}: {
  sharedTeamId: string;
  kind: "team" | "event";
  refId: string;
  label?: string;
  onToggle?: () => void;
}) {
  const active = useIsSharedTeamFavorite(sharedTeamId, kind, refId);
  const { flashing, fire } = useConfirmFlash();
  return (
    <button
      className={`icon-button${label ? " shared-team-fav-labeled-btn" : ""}${active ? " active" : ""}${confirmClass(flashing)}`}
      title={active ? `Remove from ${label ?? "shared team"}` : `Add to ${label ?? "shared team"}`}
      onClick={() => {
        if (!active) fire();
        void toggleSharedTeamFavorite(sharedTeamId, kind, refId);
        onToggle?.();
      }}
    >
      {label ? (
        <>
          <IconMorph morphed={flashing} size={14}>
            <Users size={14} />
          </IconMorph>
          <span>{active ? `In ${label}` : `Add to ${label}`}</span>
        </>
      ) : (
        <IconMorph morphed={flashing} size={17}>
          <Users size={17} />
        </IconMorph>
      )}
    </button>
  );
}

/** Short identifier for a shared team: its team number when set, else its name. */
function sharedTeamShortLabel(team: { name: string; teamNumber: string | null }): string {
  return team.teamNumber?.trim() || team.name;
}

/** Beyond this many shared teams, collapse the inline buttons into a popover. */
const SHARED_FAV_INLINE_MAX = 3;

/**
 * Shared-team-favorite toggle button for TeamDetail / EventDetail headers.
 * Hidden when signed out or not in any shared team. Up to SHARED_FAV_INLINE_MAX
 * shared teams get one "Add to <team num>" button each; more than that collapses
 * into a popover listing every shared team.
 */
function SharedTeamFavoriteButton({ kind, refId }: { kind: "team" | "event"; refId: string }) {
  const { user } = useAuth();
  const sharedTeams = useSharedTeams();
  const [open, setOpen] = useState(false);
  const popoverRef = useOutsideClick<HTMLDivElement>(() => setOpen(false));

  if (!user || sharedTeams.length === 0) return null;

  if (sharedTeams.length <= SHARED_FAV_INLINE_MAX) {
    return (
      <>
        {sharedTeams.map((team) => (
          <SharedTeamFavBtn
            key={team.sharedTeamId}
            sharedTeamId={team.sharedTeamId}
            kind={kind}
            refId={refId}
            label={sharedTeamShortLabel(team)}
          />
        ))}
      </>
    );
  }

  return (
    <div style={{ position: "relative" }} ref={popoverRef}>
      <button
        className="icon-button shared-team-fav-labeled-btn"
        title="Add to a shared team"
        onClick={() => setOpen((v) => !v)}
      >
        <Users size={14} />
        <span>Shared teams</span>
      </button>
      {open && (
        <div className="shared-team-fav-popover">
          {sharedTeams.map((team) => (
            <SharedTeamFavBtn
              key={team.sharedTeamId}
              sharedTeamId={team.sharedTeamId}
              kind={kind}
              refId={refId}
              label={sharedTeamShortLabel(team)}
              onToggle={() => setOpen(false)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Compare tray buttons ─────────────────────────────────────────────────────

/** Inner button for a single shared team — reads active state and toggles. */
/** Small button for team rows in tables — adds/removes from tray. */
function CompareRowBtn({ teamId, teamNumber, programCode, teamName }: { teamId: number; teamNumber: string; programCode: string; teamName?: string }) {
  const inTray = useIsInTray(teamId);
  const full = !canAddToTray() && !inTray;
  return (
    <button
      type="button"
      className={`compare-row-btn${inTray ? " in-tray" : ""}${full ? " disabled" : ""}`}
      title={inTray ? "Remove from comparison" : full ? "Tray full (3/3)" : "Add to comparison"}
      disabled={full}
      onClick={(e) => {
        e.stopPropagation();
        inTray ? removeFromTray(teamId) : addToTray({ teamId, teamNumber, programCode, teamName });
      }}
    >
      <IconMorph morphed={inTray} size={11} tone="inherit">
        <Plus size={11} />
      </IconMorph>
    </button>
  );
}

// ── Picklist row button ───────────────────────────────────────────────────────

/** Hover-reveal button in RankingsTable rows — adds/removes a team from the shared team picklist. */
function PicklistRowBtn({
  sharedTeamId,
  eventId,
  teamId,
  teamNumber,
  teamName,
}: {
  sharedTeamId: string;
  eventId: string;
  teamId: string;
  teamNumber: string;
  teamName?: string;
}) {
  const inList = useIsInPicklist(sharedTeamId, eventId, teamId);
  return (
    <button
      type="button"
      className={`picklist-row-btn${inList ? " in-list" : ""}`}
      title={inList ? "Remove from picklist" : "Add to picklist"}
      onClick={(e) => {
        e.stopPropagation();
        if (inList) {
          void removeFromPicklist(sharedTeamId, eventId, teamId);
        } else {
          void addToPicklist(sharedTeamId, eventId, { teamId, teamNumber, teamName });
        }
      }}
    >
      <IconMorph morphed={inList} size={11} tone="inherit">
        <Plus size={11} />
      </IconMorph>
    </button>
  );
}

// ── Alliance selection simulator (selection tracker) ──────────────────────────
// V5RC/VURC only — VEX IQ has no alliance draft. State is local + localStorage
// per event (no Supabase), mirroring the picklist's optimistic-local approach.

type AllianceBoardState = { size: number; count: number; slots: Array<Array<number | null>> };

function emptyBoardSlots(count: number, size: number): Array<Array<number | null>> {
  return Array.from({ length: count }, () => new Array(size).fill(null));
}

function allianceBoardKey(eventId: string) {
  return `alliance-sim:${eventId}`;
}

function readAllianceBoard(eventId: string): AllianceBoardState | null {
  try {
    const raw = JSON.parse(localStorage.getItem(allianceBoardKey(eventId)) ?? "null");
    if (!raw || typeof raw !== "object") return null;
    const size = raw.size === 3 ? 3 : 2;
    const count = typeof raw.count === "number" ? Math.min(Math.max(raw.count, 2), 16) : 8;
    const slots = emptyBoardSlots(count, size);
    if (Array.isArray(raw.slots)) {
      for (let a = 0; a < count; a++) {
        for (let s = 0; s < size; s++) {
          const v = raw.slots[a]?.[s];
          if (typeof v === "number") slots[a][s] = v;
        }
      }
    }
    return { size, count, slots };
  } catch {
    return null;
  }
}

function writeAllianceBoard(eventId: string, board: AllianceBoardState) {
  try {
    localStorage.setItem(allianceBoardKey(eventId), JSON.stringify(board));
  } catch {
    // ignore quota / unavailable storage
  }
}

function AllianceBoard({
  eventId,
  rankings,
  entries,
}: {
  eventId: string;
  rankings: Ranking[];
  entries: PicklistEntry[];
}) {
  const [board, setBoard] = useState<AllianceBoardState>(
    () => readAllianceBoard(eventId) ?? { size: 2, count: 8, slots: emptyBoardSlots(8, 2) },
  );

  useEffect(() => {
    writeAllianceBoard(eventId, board);
  }, [eventId, board]);

  // Picklist notes/names by teamId, for quick reference in the pool.
  const picklistInfo = useMemo(() => {
    const map = new Map<string, { teamName?: string; notes: string }>();
    for (const e of entries) map.set(e.teamId, { teamName: e.teamName, notes: e.notes });
    return map;
  }, [entries]);

  const placed = useMemo(() => {
    const set = new Set<number>();
    for (const alliance of board.slots) for (const id of alliance) if (id != null) set.add(id);
    return set;
  }, [board]);

  const sortedRankings = useMemo(() => [...rankings].sort((a, b) => a.rank - b.rank), [rankings]);
  const pool = sortedRankings.filter((r) => !placed.has(r.team.id));

  const rankByTeam = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of rankings) m.set(r.team.id, r.rank);
    return m;
  }, [rankings]);

  function placeTeam(teamId: number) {
    setBoard((prev) => {
      const slots = prev.slots.map((row) => row.slice());
      for (let a = 0; a < slots.length; a++) {
        const open = slots[a].indexOf(null);
        if (open !== -1) {
          slots[a][open] = teamId;
          return { ...prev, slots };
        }
      }
      return prev; // board full
    });
  }

  function clearSlot(a: number, s: number) {
    setBoard((prev) => {
      const slots = prev.slots.map((row) => row.slice());
      slots[a][s] = null;
      return { ...prev, slots };
    });
  }

  function setSize(size: number) {
    setBoard((prev) => {
      const slots = prev.slots.map((row) => {
        const next = new Array(size).fill(null);
        for (let s = 0; s < Math.min(size, row.length); s++) next[s] = row[s];
        return next;
      });
      return { ...prev, size, slots };
    });
  }

  function setCount(count: number) {
    const clamped = Math.min(Math.max(count, 2), 16);
    setBoard((prev) => {
      const slots = emptyBoardSlots(clamped, prev.size);
      for (let a = 0; a < Math.min(clamped, prev.slots.length); a++) slots[a] = prev.slots[a].slice();
      return { ...prev, count: clamped, slots };
    });
  }

  function reset() {
    setBoard((prev) => ({ ...prev, slots: emptyBoardSlots(prev.count, prev.size) }));
  }

  return (
    <div className="alliance-board">
      <div className="alliance-board-controls">
        <span>Alliances</span>
        <button type="button" className="picklist-move-btn" onClick={() => setCount(board.count - 1)} disabled={board.count <= 2} title="Fewer alliances"><ChevronDown size={11} /></button>
        <strong>{board.count}</strong>
        <button type="button" className="picklist-move-btn" onClick={() => setCount(board.count + 1)} disabled={board.count >= 16} title="More alliances"><ChevronUp size={11} /></button>
        <span style={{ marginLeft: 12 }}>Teams each</span>
        <button type="button" className={`button-sm${board.size === 2 ? " active" : ""}`} onClick={() => setSize(2)}>2</button>
        <button type="button" className={`button-sm${board.size === 3 ? " active" : ""}`} onClick={() => setSize(3)}>3</button>
        <button type="button" className="button-sm" style={{ marginLeft: "auto" }} onClick={reset}>Reset board</button>
      </div>
      <div className="alliance-board-grid">
        <div className="alliance-pool">
          <div className="alliance-pool-head">Available ({pool.length})</div>
          {pool.map((r) => {
            const info = picklistInfo.get(String(r.team.id));
            return (
              <button type="button" key={r.team.id} className="alliance-pool-row" onClick={() => placeTeam(r.team.id)} title="Add to next open alliance slot">
                <span className="picklist-rank">#{r.rank}</span>
                <span className="alliance-pool-team">{r.team.name}</span>
                {info?.teamName && <span className="picklist-team-name">{info.teamName}</span>}
                {info?.notes && <span className="alliance-pool-note">{info.notes}</span>}
              </button>
            );
          })}
          {!pool.length && <div className="muted" style={{ padding: 8 }}>All ranked teams placed.</div>}
        </div>
        <div className="alliance-list">
          {board.slots.map((alliance, a) => (
            <div className="alliance-row" key={a}>
              <span className="alliance-seed">A{a + 1}</span>
              {alliance.map((teamId, s) => {
                const ranking = teamId != null ? rankings.find((r) => r.team.id === teamId) : null;
                return (
                  <button
                    type="button"
                    key={s}
                    className={`alliance-slot${teamId == null ? " empty" : ""}`}
                    onClick={() => teamId != null && clearSlot(a, s)}
                    title={teamId != null ? "Click to remove" : ""}
                    disabled={teamId == null}
                  >
                    {teamId != null && ranking ? (
                      <>
                        <span className="alliance-slot-team">{ranking.team.name}</span>
                        <span className="alliance-slot-seed">#{rankByTeam.get(teamId) ?? "?"}</span>
                      </>
                    ) : (
                      <span className="muted">{s === 0 ? "Captain" : `Pick ${s}`}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Picklist tab ──────────────────────────────────────────────────────────────

/** Full picklist panel rendered as a tab in EventDetail. */
function PicklistTab({ event, sharedTeamId, rankings = [] }: { event: { id: number; name: string }; sharedTeamId: string; rankings?: Ranking[] }) {
  const { entries, ready } = usePicklist(sharedTeamId, String(event.id));
  const [allianceMode, setAllianceMode] = useState(false);
  const [boardMode, setBoardMode] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // Local notes state for uncontrolled editing (save on blur)
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({});

  // Sync localNotes when entries change from outside
  useEffect(() => {
    setLocalNotes((prev) => {
      const next: Record<string, string> = {};
      for (const e of entries) {
        next[e.teamId] = e.teamId in prev ? prev[e.teamId] : e.notes;
      }
      return next;
    });
  }, [entries]);

  const eventIdStr = String(event.id);
  const remaining = entries.filter((e) => !e.crossedOut).length;

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const reordered = [...entries];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    void reorderPicklist(sharedTeamId, eventIdStr, reordered);
    setDragIndex(null);
    setDragOverIndex(null);
  }

  if (!ready) {
    return <div className="picklist-empty"><span className="muted">Loading…</span></div>;
  }

  const showBoard = rankings.length > 0;

  return (
    <div>
      <div className="picklist-header">
        <span className="picklist-count">
          {boardMode ? "Alliance board" : `${remaining} team${remaining !== 1 ? "s" : ""} remaining`}
        </span>
        {!boardMode && allianceMode && entries.length > 0 && (
          <button
            type="button"
            className="button-sm"
            onClick={() => void clearCrossedOut(sharedTeamId, eventIdStr)}
          >
            Reset
          </button>
        )}
        {!boardMode && entries.length > 0 && (
          <button
            type="button"
            className={`button-sm${allianceMode ? " active" : ""}`}
            onClick={() => setAllianceMode((v) => !v)}
          >
            {allianceMode ? "Exit Alliance Mode" : "Alliance Selection"}
          </button>
        )}
        {showBoard && (
          <button
            type="button"
            className={`button-sm${boardMode ? " active" : ""}`}
            onClick={() => setBoardMode((v) => !v)}
          >
            {boardMode ? "Exit Board" : "Alliance Board"}
          </button>
        )}
      </div>

      {boardMode ? (
        <AllianceBoard key={eventIdStr} eventId={eventIdStr} rankings={rankings} entries={entries} />
      ) : entries.length === 0 ? (
        <div className="picklist-empty">
          <ListOrdered size={28} />
          <p>No teams yet.</p>
          <p className="muted">
            Add teams from the <strong>Rankings</strong> tab using the{" "}
            <Plus size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /> button.
          </p>
        </div>
      ) : (
      <div className="picklist-list">
        {entries.map((entry, i) => (
          <div
            key={entry.teamId}
            className={[
              "picklist-item",
              entry.crossedOut ? "crossed-out" : "",
              allianceMode ? "alliance-mode" : "",
              dragOverIndex === i ? "drag-over" : "",
            ].filter(Boolean).join(" ")}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
            onDragLeave={() => setDragOverIndex(null)}
            onDrop={() => handleDrop(i)}
            onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
          >
            <span className="picklist-drag-handle" title="Drag to reorder">
              <GripVertical size={14} />
            </span>
            <span className="picklist-move-btns">
              <button
                type="button"
                className="picklist-move-btn"
                title="Move up"
                disabled={i === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = [...entries];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  void reorderPicklist(sharedTeamId, eventIdStr, next);
                }}
              ><ChevronUp size={11} /></button>
              <button
                type="button"
                className="picklist-move-btn"
                title="Move down"
                disabled={i === entries.length - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = [...entries];
                  [next[i], next[i + 1]] = [next[i + 1], next[i]];
                  void reorderPicklist(sharedTeamId, eventIdStr, next);
                }}
              ><ChevronDown size={11} /></button>
            </span>
            <span className="picklist-rank">#{i + 1}</span>
            <Link
              href={`/team/V5RC/${entry.teamNumber}`}
              className="picklist-team-link"
              onClick={(e: MouseEvent) => e.stopPropagation()}
            >
              {entry.teamNumber}
            </Link>
            {entry.teamName && (
              <span className="picklist-team-name">{entry.teamName}</span>
            )}
            <input
              type="text"
              className="picklist-notes"
              placeholder="Notes…"
              value={localNotes[entry.teamId] ?? entry.notes}
              onChange={(e) =>
                setLocalNotes((prev) => ({ ...prev, [entry.teamId]: e.target.value }))
              }
              onBlur={(e) => void updatePicklistNotes(sharedTeamId, eventIdStr, entry.teamId, e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              className="picklist-cross-btn"
              title={entry.crossedOut ? "Unmark" : "Mark as picked/crossed out"}
              onClick={(e) => {
                e.stopPropagation();
                void toggleCrossedOut(sharedTeamId, eventIdStr, entry.teamId);
              }}
            >
              <MinusCircle size={14} />
            </button>
            <button
              type="button"
              className="picklist-remove-btn"
              title="Remove from picklist"
              onClick={(e) => {
                e.stopPropagation();
                void removeFromPicklist(sharedTeamId, eventIdStr, entry.teamId);
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

// App-like bottom navigation, shown only on mobile (see .mobile-tabbar in CSS).
// A compact, frosted, rounded floating island — icon-only (labels are redundant
// for four self-evident sections), so it stays small and out of the way while
// mirroring the primary desktop nav for one-tap access. Each tab carries an
// aria-label/title since there's no visible text.
function MobileTabBar({ path }: { path: string }) {
  const { profile } = useAuth();
  const sharedTeams = useSharedTeams();
  const hasMyTeam = !!(profile?.team_number && profile?.team_program);
  const tabs: Array<{ href: string; label: string; Icon: typeof House; active: boolean }> = [
    { href: "/", label: "Home", Icon: House, active: path === "/" },
    { href: "/events", label: "Events", Icon: CalendarDays, active: path === "/events" || path.startsWith("/event") },
    { href: "/teams", label: "Teams", Icon: Users, active: path === "/teams" || path.startsWith("/team") },
    { href: "/skills", label: "Skills", Icon: Trophy, active: path === "/skills" },
    { href: "/jumper", label: "Jumper", Icon: Tv2, active: path === "/jumper" },
    ...((hasMyTeam || sharedTeams.length > 0) ? [{ href: "/my-team", label: "My Team", Icon: Star, active: path === "/my-team" || path.startsWith("/my-team/") }] : []),
  ];
  return (
    <nav className="mobile-tabbar" aria-label="Primary">
      {tabs.map(({ href, label, Icon, active }) => (
        <Link
          key={href}
          href={href}
          className={`mobile-tab ${active ? "active" : ""}`}
          aria-label={label}
          title={label}
          aria-current={active ? "page" : undefined}
        >
          <Icon size={23} strokeWidth={active ? 2.4 : 2} />
        </Link>
      ))}
    </nav>
  );
}

// Slide-in navigation drawer, mobile-only (see .mobile-nav-drawer in CSS).
// The bottom tab bar handles the 4–5 primary sections; this drawer surfaces the
// long tail that otherwise only lives behind the desktop account dropdown /
// footer: full nav (with labels), Settings, your sharedTeams, theme switch, and the
// legal links + sign-out. Closes on outside-click, Escape, and route change
// (the effect in Layout resets `open` when `path` changes).
function MobileNavDrawer({ path, open, onClose }: { path: string; open: boolean; onClose: () => void }) {
  const { user, profile, signOut, updateProfile } = useAuth();
  const theme = useTheme();
  const sharedTeams = useSharedTeams();
  const hasMyTeam = !!(profile?.team_number && profile?.team_program);
  const panelRef = useRef<HTMLDivElement>(null);

  // Lock body scroll and wire an Escape handler while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the panel for keyboard users.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const go = (href: string) => { onClose(); navigate(href); };
  const chooseTheme = (value: "light" | "dark" | "system") => {
    applyTheme(value);
    void updateProfile({ theme: value });
  };

  const primaryNav: Array<{ href: string; label: string; Icon: typeof House; active: boolean }> = [
    { href: "/", label: "Home", Icon: House, active: path === "/" },
    { href: "/events", label: "Events", Icon: CalendarDays, active: path === "/events" || path.startsWith("/event") },
    { href: "/teams", label: "Teams", Icon: Users, active: path === "/teams" || path.startsWith("/team") },
    { href: "/skills", label: "Skills", Icon: Trophy, active: path === "/skills" },
    { href: "/jumper", label: "Jumper", Icon: Tv2, active: path === "/jumper" },
    ...((hasMyTeam || sharedTeams.length > 0) ? [{ href: "/my-team", label: "My Team", Icon: Star, active: path === "/my-team" || path.startsWith("/my-team/") }] : []),
  ];
  const name = profile?.display_name || suggestedName(user) || "Account";
  const team = profile?.team_number ? `${programLabel(profile.team_program)} ${profile.team_number}`.trim() : null;

  return (
    <AnimatePresence>
      {open && (
        <div className="mobile-nav-root open" aria-hidden={false}>
          <motion.div
            className="mobile-nav-scrim"
            onClick={onClose}
            variants={fade}
            initial="initial"
            animate="animate"
            exit="exit"
          />
          <motion.div
            className="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            ref={panelRef}
            tabIndex={-1}
            variants={slideInLeft}
            initial="initial"
            animate="animate"
            exit="exit"
            drag="x"
            dragConstraints={{ left: -320, right: 0 }}
            dragElastic={0.15}
            onDragEnd={(_event, info) => { if (info.offset.x < -80) onClose(); }}
          >
        <div className="mobile-nav-head">
          <span className="mobile-nav-title">Menu</span>
          <button type="button" className="mobile-nav-close" onClick={onClose} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        {user && (
          <div className="mobile-nav-id">
            <div className="mobile-nav-name">{name}</div>
            {team && <div className="mobile-nav-sub">{team}</div>}
          </div>
        )}

        <nav className="mobile-nav-links" aria-label="Sections">
          {primaryNav.map(({ href, label, Icon, active }) => (
            <button
              key={href}
              type="button"
              className={`mobile-nav-link ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => go(href)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>

        <div className="mobile-nav-section">
          <div className="mobile-nav-seg" role="group" aria-label="Theme">
            {(["light", "dark", "system"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`mobile-nav-seg-btn ${theme === value ? "active" : ""}`}
                onClick={() => chooseTheme(value)}
                aria-pressed={theme === value}
              >
                {value.charAt(0).toUpperCase() + value.slice(1)}
                {theme === value && <SlideIndicator id="mobile-theme" variant="pill" />}
              </button>
            ))}
          </div>
          {sharedTeams.length > 0 && (
            <>
              <div className="mobile-nav-section-label">Your {sharedTeams.length === 1 ? "shared team" : "shared teams"}</div>
              {sharedTeams.map((team) => (
                <button key={team.sharedTeamId} type="button" className="mobile-nav-link" onClick={() => go(`/my-team/${team.sharedTeamId}`)}>
                  <span className="mobile-nav-shared-team-badge">{(team.name || "?").charAt(0).toUpperCase()}</span>
                  {team.name}
                </button>
              ))}
            </>
          )}
          {user && (
            <button type="button" className="mobile-nav-link" onClick={() => go("/settings")}>
              <Settings size={18} />
              Settings
            </button>
          )}
        </div>

        <div className="mobile-nav-footer">
          <div className="mobile-nav-legal">
            <button type="button" onClick={() => go("/terms")}>Terms</button>
            <button type="button" onClick={() => go("/privacy")}>Privacy</button>
          </div>
          {user && (
            <button
              type="button"
              className="mobile-nav-link mobile-nav-signout"
              onClick={() => { onClose(); void signOut(); }}
            >
              <LogOut size={18} />
              Sign out
            </button>
          )}
          <div className="mobile-nav-copy">© 2026 RoboSTEM Foundation</div>
        </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// Compact light/dark switch for the header island. Reads the live theme pref and
// flips to the opposite of whatever is currently showing (resolving "system").
// Cross-fade content whenever `trigger` changes (season / filter / setting
// re-render). Animates opacity only via the Web Animations API, so children
// keep their state — no remount, no refetch. Skips the initial mount and
// honors prefers-reduced-motion. `duration` defaults to a 200ms "Fast" fade;
// route changes pass a shorter, more subtle value.
function CrossFade({
  trigger,
  duration = 200,
  className,
  children,
}: {
  trigger: unknown;
  duration?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(trigger);
  // useLayoutEffect so opacity:0 is applied before the browser paints the new
  // content — otherwise you'd see one frame at full opacity before the fade.
  useLayoutEffect(() => {
    if (Object.is(prev.current, trigger)) return;
    prev.current = trigger;
    const el = ref.current;
    if (!el) return;
    // Cancel any in-flight fade first. Rapid trigger changes (clear→retype on the
    // Teams / World Skills search) otherwise stack overlapping WAAPI animations
    // that can leave the node stuck at opacity 0 — a blank/faded graphic.
    el.getAnimations?.().forEach((a) => a.cancel());
    // Force a guaranteed-visible end state so an interrupted animation can never
    // leave the content invisible.
    el.style.opacity = "1";
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: "ease", fill: "both" });
  }, [trigger, duration]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

function Layout({ children, path }: { children: ReactNode; path: string }) {
  // Route-change fade keys on the pathname only (ignore query/hash) so in-page
  // filter changes that don't navigate never trigger the route fade. The
  // settings epoch is folded in so settings changes that remount page content
  // (synced filters/preferences) also get the subtle fade.
  const settingsEpoch = useSettingsEpoch();
  const { profile } = useAuth();
  const sharedTeams = useSharedTeams();
  const hasMyTeam = !!(profile?.team_number && profile?.team_program);
  const routeKey = `${path.split("?")[0].split("#")[0]}:${settingsEpoch}`;
  const [navOpen, setNavOpen] = useState(false);
  // Close the mobile drawer whenever the route changes (covers link taps and the
  // browser back gesture — both flow through the pathname).
  useEffect(() => { setNavOpen(false); }, [path]);
  // The topbar nav is squeezed by the search box on narrow desktop widths; give
  // it the same edge fade + drag-to-scroll as the season / tab strips. No wheel
  // hijack here — the cursor sits over the header while reading the page.
  const navRef = useRef<HTMLElement>(null);
  const navEdges = useScrollStrip(navRef);
  const nav = [
    ["/", "OpenScout"],
    ["/events", "Events"],
    ["/teams", "Teams"],
    ["/skills", "Skills"],
    ["/jumper", "Jumper"],
    ...((hasMyTeam || sharedTeams.length > 0) ? [["/my-team", "My Team"]] : []),
  ];

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button
            type="button"
            className="mobile-nav-trigger"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={navOpen}
          >
            <Menu size={22} />
          </button>
          <Link href="/" className="brand">
            <img className="brand-logo" src="/openscout-mark-tight.png" alt="" />
            <span className="brand-word">OpenScout</span>
          </Link>
          <nav
            ref={navRef}
            className={`topbar-nav no-scrollbar${navEdges.moreLeft ? " is-more-left" : ""}${navEdges.moreRight ? " is-more-right" : ""}`}
          >
            {nav.slice(1).map(([href, label]) => (
              <Link key={href} href={href} className={path === href ? "active" : ""}>
                {href === "/jumper" && (
                  <Tv size={15} style={{ display: "inline", verticalAlign: "-2px", marginRight: 5, color: "var(--text-muted)" }} />
                )}
                {label}
              </Link>
            ))}
          </nav>
          <div className="topbar-actions">
            <GlobalSearch className="topbar-search" />
            <AuthSlot />
          </div>
        </div>
      </header>
      <main>
        <CrossFade trigger={routeKey} duration={120}>
          {children}
        </CrossFade>
      </main>
      <footer>
        <div className="footer-row">
          <span className="footer-copy">© 2026 RoboSTEM Foundation, All Rights Reserved.</span>
          <div className="footer-links">
            <Link href="/events">Events</Link>
            <Link href="/teams">Teams</Link>
            <Link href="/skills">Skills</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
      <MobileTabBar path={path} />
      <MobileNavDrawer path={path} open={navOpen} onClose={() => setNavOpen(false)} />
    </>
  );
}

// ── Home sidebar: world-skills leaders ────────────────────────────────────────

// The official standings on events.vex.com, one per board — the VEX-logo button
// opens a menu of these rather than guessing which one the viewer wanted.
const VEX_SKILLS_LINKS = [
  {
    label: "V5RC High School",
    url: "https://events.vex.com/robot-competitions/vex-robotics-competition/standings/skills?grade_level=High%20School",
  },
  {
    label: "V5RC Middle School",
    url: "https://events.vex.com/robot-competitions/vex-robotics-competition/standings/skills?grade_level=Middle%20School",
  },
  {
    label: "VIQRC Middle School",
    url: "https://events.vex.com/robot-competitions/vex-iq-competition/standings/skills?grade_level=Middle%20School",
  },
  {
    label: "VIQRC Elementary",
    url: "https://events.vex.com/robot-competitions/vex-iq-competition/standings/skills?grade_level=Elementary",
  },
];
const VEX_LOGO_URL =
  "https://yt3.googleusercontent.com/5lzewzjUgaUmU6t7Ri_EhCKN5THw9Mz7gX9M3b_AgtqZiJQjoq8nFr9qzREAp8D88nNasBGafA=s900-c-k-c0x00ffffff-no-rj";

// The four world-skills leaderboards. Default order: V5RC first, each program
// high grade → low. `program`/`grade` double as the /skills URL params.
type SkillsLeaderKey = {
  program: "v5rc" | "viqrc";
  grade: "hs" | "ms" | "es";
  progName: string;
  gradeLabel: string;
};

const skillsLeaders: SkillsLeaderKey[] = [
  { program: "v5rc", grade: "hs", progName: "V5RC", gradeLabel: "HS" },
  { program: "v5rc", grade: "ms", progName: "V5RC", gradeLabel: "MS" },
  { program: "viqrc", grade: "ms", progName: "VIQRC", gradeLabel: "MS" },
  { program: "viqrc", grade: "es", progName: "VIQRC", gradeLabel: "ES" },
];

/**
 * Signed-in users see their own program's two boards first, then the other
 * program's — the profile stores a team program (RobotEvents id) but no grade,
 * so within a program the order stays high grade → low. VURC/VAIRC profiles have
 * no board here and fall through to the default order.
 */
function orderedSkillsLeaders(teamProgram?: string | null): SkillsLeaderKey[] {
  const mine = teamProgram === "1" ? "v5rc" : teamProgram === "41" ? "viqrc" : null;
  if (!mine) return skillsLeaders;
  // Stable sort, so each program keeps its internal grade order.
  return [...skillsLeaders].sort((a, b) => Number(b.program === mine) - Number(a.program === mine));
}

// Session cache of the four leaders, keyed program:grade. Each response is a
// single row, so holding all four costs nothing and repeat visits to the home
// page render them instantly instead of refetching on every mount. A rejected
// request drops out of the cache so the next visit retries it.
const topSkillsCache = new Map<string, Promise<TopSkillsResult>>();

function loadTopSkills(program: "v5rc" | "viqrc", grade: "hs" | "ms" | "es") {
  const key = `${program}:${grade}`;
  let promise = topSkillsCache.get(key);
  if (!promise) {
    promise = api.topSkills(program, grade).catch((err: Error) => {
      topSkillsCache.delete(key);
      throw err;
    });
    topSkillsCache.set(key, promise);
  }
  return promise;
}

/** Warm all four leaders once per page load, whatever route the visit started on. */
function prefetchSkillsLeaders() {
  for (const lb of skillsLeaders) {
    // Errors are the cards' problem, not the prefetch's — swallow here so an
    // offline visit doesn't produce an unhandled rejection.
    loadTopSkills(lb.program, lb.grade).catch(() => {});
  }
}

/**
 * One tile: the #1 skills team for a program + grade.
 *
 * Data comes from /api/top-skills, which trims the multi-megabyte world
 * leaderboard down to this single row server-side. Clicking through opens the
 * in-app leaderboard already switched to this program, season, and grade, with
 * the team briefly highlighted (see `team` param in WorldSkillsPageInner).
 */
function SkillsLeaderCard({
  program,
  grade,
  progName,
  gradeLabel,
}: {
  program: "v5rc" | "viqrc";
  grade: "hs" | "ms" | "es";
  progName: string;
  gradeLabel: string;
}) {
  const { data, loading, error } = useAsync(() => loadTopSkills(program, grade), [program, grade]);
  const entry = data?.entry ?? null;
  const params = new URLSearchParams({ program, grade });
  if (data?.seasonId) params.set("season", String(data.seasonId));
  if (entry) params.set("team", String(entry.teamId));

  const head = (
    <span className="skills-leader-eyebrow">
      {progName} <em className={`skills-leader-grade grade-${gradeLabel}`}>{gradeLabel}</em>
    </span>
  );

  if (loading || !entry) {
    return (
      <div className={`skills-leader-card ${program}${loading ? " is-loading" : ""}`} aria-busy={loading || undefined}>
        <span className="skills-leader-main">
          {head}
          {loading ? (
            <span className="skills-leader-bone skeleton-shimmer" style={{ width: "70%", height: 20 }} />
          ) : (
            <span className="skills-leader-empty">{error ? "Unavailable" : "No scores yet"}</span>
          )}
        </span>
        {loading && <span className="skills-leader-bone skeleton-shimmer" style={{ width: 118, height: 26 }} />}
      </div>
    );
  }

  return (
    <Link
      href={`/skills?${params.toString()}`}
      className={`skills-leader-card ${program}`}
      title={`#1 ${progName} ${gradeLabel} skills — ${entry.team}${entry.teamName ? ` (${entry.teamName})` : ""}`}
    >
      {/* Left: who. Right: what they scored. */}
      <span className="skills-leader-main">
        {head}
        {/* Number and name share one row: the number sets the row height and the
            name is clamped to two lines that fit inside it. */}
        <span className="skills-leader-id">
          <strong className="skills-leader-team">{entry.team}</strong>
          <span className="skills-leader-name">{entry.teamName || entry.organization || "—"}</span>
        </span>
      </span>
      {/* Total stands alone; driver and programming stack beside it as two
          value-then-label lines, so the small numbers share a baseline with their
          own labels instead of floating above the big one. */}
      <span className="skills-leader-scores">
        <span className="skills-leader-total">
          <strong>{entry.score}</strong>
          <small>Total</small>
        </span>
        <span className="skills-leader-splits">
          <span className="skills-leader-split">
            <b>{entry.driver}</b>
            <small>Driver</small>
          </span>
          <span className="skills-leader-split">
            <b>{entry.programming}</b>
            <small>Prog</small>
          </span>
        </span>
      </span>
    </Link>
  );
}

/** The VEX-logo button: opens a menu of the four official standings pages. */
function VexSkillsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false));

  return (
    <div className="skills-lb-vex-wrap" ref={ref} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button
        type="button"
        className={`skills-lb-vex${open ? " is-open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Official skills standings on events.vex.com"
        aria-label="Official skills standings on events.vex.com"
        onClick={() => setOpen((o) => !o)}
      >
        <img src={VEX_LOGO_URL} alt="" width={20} height={20} loading="lazy" />
        <ExternalLink size={13} />
      </button>
      {open && (
        <div className="skills-lb-vex-menu" role="menu">
          {VEX_SKILLS_LINKS.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <span>{link.label}</span>
              <ExternalLink size={11} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function SkillsLeaderboardPanel() {
  const { profile } = useAuth();
  const leaders = orderedSkillsLeaders(profile?.team_program);
  return (
    <Panel title="World Skills Rankings" icon={<Trophy />}>
      <div className="skills-leaderboard-list">
        <div className="skills-lb-row">
          <Link href="/skills" className="skills-lb-openscout">
            <span>View leaderboards</span>
            <ChevronRight size={15} className="arrow" />
          </Link>
          <VexSkillsMenu />
        </div>
        <div className="skills-leader-grid">
          {leaders.map((lb) => (
            <SkillsLeaderCard
              key={`${lb.program}-${lb.grade}`}
              program={lb.program}
              grade={lb.grade}
              progName={lb.progName}
              gradeLabel={lb.gradeLabel}
            />
          ))}
        </div>
      </div>
    </Panel>
  );
}

const homeEventTabs: Array<{ label: string; value: HomeEventTab }> = [
  { label: "Upcoming", value: "upcoming" },
  { label: "Today", value: "today" },
  { label: "Near Today", value: "nearToday" },
  { label: "Near me", value: "nearMe" },
  { label: "Signature", value: "sigs" },
];

// Home events program filter — a compact multi-select toggle. VEX U and VEX AI
// get their own explicit "U"/"AI" chips (clearer than the old "…" group).
const HOME_PROGRAM_GROUPS: Array<{ key: string; label: string; title: string; ids: string[] }> = [
  { key: "v5", label: "V5", title: "VEX V5 Robotics Competition", ids: ["1"] },
  { key: "iq", label: "IQ", title: "VEX IQ Robotics Competition", ids: ["41"] },
  { key: "u", label: "U", title: "VEX U", ids: ["4"] },
  { key: "ai", label: "AI", title: "VEX AI", ids: ["57"] },
];

// The home program chips persist across reloads: whatever combination the user
// last had selected is what they get back, including an empty one (which the
// event query treats as "all"). Missing key = never chosen, which is what lets
// the profile-based default seed itself exactly once.
const HOME_PROGRAMS_KEY = "vex-alliance:home-programs";
function allHomeProgramIds(): string[] {
  return HOME_PROGRAM_GROUPS.flatMap((group) => group.ids);
}
function loadHomePrograms(): string[] | null {
  try {
    const raw = localStorage.getItem(HOME_PROGRAMS_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const known = new Set(allHomeProgramIds());
    return parsed.filter((id): id is string => typeof id === "string" && known.has(id));
  } catch {
    return null; // ignore storage/parse failures (private mode, stale shape)
  }
}
function saveHomePrograms(ids: string[]) {
  try {
    localStorage.setItem(HOME_PROGRAMS_KEY, JSON.stringify(ids));
  } catch {
    // ignore storage failures (private mode, quota)
  }
}

function HomeProgramToggle({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="home-prog-toggle" role="group" aria-label="Programs">
      {HOME_PROGRAM_GROUPS.map((group) => {
        const active = group.ids.every((id) => selected.includes(id));
        return (
          <button
            key={group.key}
            type="button"
            className={active ? "active" : ""}
            aria-pressed={active}
            title={group.title}
            onClick={() =>
              onChange(
                active
                  ? selected.filter((id) => !group.ids.includes(id))
                  : [...selected.filter((id) => !group.ids.includes(id)), ...group.ids],
              )
            }
          >
            {group.label}
          </button>
        );
      })}
    </div>
  );
}

// AI-chat-style rotating greetings for the home hero. `n` is the name suffix
// (e.g. ", Alex") or "" when no name is set. One is chosen at random per load.
const homeGreetings: Array<(n: string) => string> = [
  (n) => `Who are we scouting today${n}?`,
  (n) => `Which team are we digging into${n}?`,
  (n) => `What should we scout${n}?`,
  (n) => `Who's on the watchlist${n}?`,
  (n) => `Who are we breaking down today${n}?`,
  (n) => `What match are we prepping for${n}?`,
  (n) => `Ready to scout${n}`,
  (n) => `Which team's stats are we pulling up${n}?`,
  (n) => `Who are we keeping an eye on${n}?`,
  (n) => `Let's scout${n}.`,
];

const HOME_NAME_KEY = "vex-alliance:name";

function HomeGreeting() {
  const { user, profile } = useAuth();
  const signedIn = !!user;
  // When signed in, the account name overrides the locally-set one (profile
  // display name first, then the OAuth-provided name). Signed out, we use the
  // name the visitor set on this device.
  const accountName = signedIn ? ((profile?.display_name ?? "").trim() || suggestedName(user) || "") : "";

  const [localName, setLocalName] = useState(() => localStorage.getItem(HOME_NAME_KEY) ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(localName);
  // Pick a stable random greeting for this mount (lazy init runs once).
  const [template] = useState(() => homeGreetings[Math.floor(Math.random() * homeGreetings.length)]);
  const name = signedIn ? accountName || localName : localName;
  const suffix = name ? `, ${name}` : "";
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Keep the greeting on a single line: use the CSS size when it fits, and only
  // shrink the font (down to a floor) when the text would otherwise overflow.
  useLayoutEffect(() => {
    const el = headingRef.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      const base = parseFloat(getComputedStyle(el).fontSize) || 40;
      const available = el.clientWidth;
      const full = el.scrollWidth;
      if (available > 0 && full > available) {
        el.style.fontSize = `${Math.max(16, Math.floor(base * (available / full)))}px`;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [name, template]);

  const save = () => {
    const value = draft.trim().slice(0, 24);
    setLocalName(value);
    if (value) localStorage.setItem(HOME_NAME_KEY, value);
    else localStorage.removeItem(HOME_NAME_KEY);
    setEditing(false);
  };

  const startEdit = () => {
    setDraft(localName);
    setEditing(true);
  };

  // When a name is set, render it as an inline, clickable target inside the
  // greeting so the person can change or remove it by clicking their name. The
  // inline edit only applies to the locally-set name (signed out); when signed
  // in the name comes from the account and is managed in Settings.
  const text = template(suffix);
  let greeting: ReactNode = text;
  if (name && !editing && !signedIn) {
    const [before, after = ""] = text.split(suffix);
    greeting = (
      <>
        {before},{" "}
        <button type="button" className="home-name-inline" onClick={startEdit} title="Change or remove name">
          {name}
        </button>
        {after}
      </>
    );
  }

  return (
    <div className="home-greeting-wrap">
      {!signedIn &&
        (editing ? (
          <form className="home-name-edit" onSubmit={(event) => { event.preventDefault(); save(); }}>
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={save}
              placeholder="Your name (leave blank to remove)"
              maxLength={24}
              className="home-name-input"
            />
            <button type="submit" className="home-name-save">Save</button>
          </form>
        ) : (
          !localName && (
            <button type="button" className="home-name-trigger" onClick={startEdit}>
              Add your name
            </button>
          )
        ))}
      <h1 className="home-greeting" ref={headingRef}>{greeting}</h1>
    </div>
  );
}

function FavoritesPanel() {
  const teamIds = useFavoriteIds("team");
  const eventIds = useFavoriteIds("event");
  const ready = useFavoritesReady();
  const favorites = useAsync(async () => {
    const [teams, events] = await Promise.all([
      Promise.all(teamIds.map((id) => api.team(id).catch(() => null))),
      Promise.all(eventIds.map((id) => api.event(id).catch(() => null))),
    ]);
    return {
      teams: teams.filter((team): team is Team => !!team),
      events: events.filter((event): event is Event => !!event),
    };
  }, [teamIds, eventIds]);

  const data = favorites.data;
  const loading = !ready || favorites.loading;
  const hasAny = !!data && (data.teams.length > 0 || data.events.length > 0);

  return (
    <Panel title="Your Favorites" icon={<Star />}>
      <div className="home-fav-list">
        {loading && <div className="home-fav-empty">Loading…</div>}
        {!loading && !hasAny && (
          <div className="home-fav-empty">
            <span>Tap the</span>
            <Star size={13} />
            <span>on any team or event to pin it here for quick access.</span>
          </div>
        )}
        {data?.teams.map((team) => (
          <Link key={`t-${team.id}`} href={teamPath(team)} className="home-fav-item">
            <span className="home-fav-badge team">{team.program?.code ?? "VEX"}</span>
            <span className="home-fav-text">
              <span className="home-fav-title">
                {team.number} · <TranslatedText text={team.team_name ?? "Unnamed Team"} country={team.location?.country} />
              </span>
              <span className="home-fav-sub">{locationLine(team)}</span>
            </span>
          </Link>
        ))}
        {data?.events.map((event) => (
          <Link key={`e-${event.id}`} href={eventPath(event)} className="home-fav-item">
            <span className="home-fav-badge event">{seasonYearLabel(event.season?.name) || <CalendarDays size={13} />}</span>
            <span className="home-fav-text">
              <TranslatedText className="home-fav-title" text={event.name} country={event.location?.country} />
              <span className="home-fav-sub">{locationLine(event)}</span>
            </span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

// ── Home "Near me" location resolution ───────────────────────────────────────
// Resolves the visitor's location through a fallback chain so distance sorting
// works without any required input: device GPS (with permission prompt) first,
// then coarse IP geolocation, and finally a place typed into the location box.
// All network calls are best-effort and keyless.
type HomeLocationSource = "gps" | "ip" | "manual";
type HomeLocationStatus = "idle" | "locating" | "resolved" | "error";
type BBox = { south: number; north: number; west: number; east: number };
// How a resolved place is matched against events. A city is a point search — a
// radius around its centre. A state/province or a country has no meaningful
// centre (nothing is "75 mi from Texas"), so those match administratively
// instead: every event whose own region/country says it's there.
type GeoAreaKind = "point" | "region" | "country";
type GeoArea = { kind: "region" | "country"; region: string | null; country: string | null };
type HomeLocation = {
  status: HomeLocationStatus;
  coords: LatLon | null;
  // Set when the resolved place is a state/province or country. The radius is
  // ignored while it is, so "California" surfaces events statewide.
  area: GeoArea | null;
  // Geocoded bounds for that area, kept as a geometric backstop for events
  // whose region/country strings don't match the geocoder's spelling.
  bbox: BBox | null;
  label: string | null;
  source: HomeLocationSource | null;
  error: string | null;
};

function coordsInBBox(coords: LatLon, bbox: BBox) {
  return coords.lat >= bbox.south && coords.lat <= bbox.north && coords.lon >= bbox.west && coords.lon <= bbox.east;
}

// Whether an event's own location fields place it inside a resolved area.
function eventInGeoArea(event: Event, area: GeoArea) {
  if (area.country && normalizeText(event.location?.country) !== normalizeText(area.country)) return false;
  if (area.kind === "country") return !!area.country;
  return !!area.region && normalizeText(event.location?.region) === normalizeText(area.region);
}

// The single Near me matching rule, shared by Home and the Events page so the
// two can't drift. Area searches ignore the radius entirely; point searches
// keep everything within it. Optionally re-orders nearest-first — events with
// no coordinates (possible in an area search) sort last.
function filterEventsNearLocation(
  events: Event[],
  location: { coords: LatLon | null; area: GeoArea | null; bbox: BBox | null },
  radius: number,
  sortByDistance: boolean,
): Event[] {
  const { coords, area, bbox } = location;
  const matched = events.filter((event) => {
    const eventPoint = eventCoords(event);
    if (area) {
      if (eventInGeoArea(event, area)) return true;
      return !!bbox && !!eventPoint && coordsInBBox(eventPoint, bbox);
    }
    return !!coords && !!eventPoint && haversineMiles(coords, eventPoint) <= radius;
  });
  if (!sortByDistance || !coords) return matched;
  const distance = (event: Event) => {
    const eventPoint = eventCoords(event);
    return eventPoint ? haversineMiles(coords, eventPoint) : Number.POSITIVE_INFINITY;
  };
  return matched
    .map((event, index) => ({ event, index, distance: distance(event) }))
    .sort((a, b) => a.distance - b.distance || compareEventsChronological(a.event, b.event) || a.index - b.index)
    .map((entry) => entry.event);
}

function useHomeLocation(active: boolean) {
  const [state, setState] = useState<HomeLocation>({
    status: "idle",
    coords: null,
    area: null,
    bbox: null,
    label: null,
    source: null,
    error: null,
  });
  const autoTried = useRef(false);

  const resolveViaIp = useCallback(async () => {
    try {
      const res = await fetch("https://ipapi.co/json/", { headers: { Accept: "application/json" } });
      if (!res.ok) return false;
      const data = await res.json();
      if (typeof data.latitude === "number" && typeof data.longitude === "number") {
        const label = [data.city, data.region].filter(Boolean).join(", ") || "Approximate location";
        setState({ status: "resolved", coords: { lat: data.latitude, lon: data.longitude }, area: null, bbox: null, label, source: "ip", error: null });
        return true;
      }
    } catch {
      // fall through to error handling in the caller
    }
    return false;
  }, []);

  const requestBrowser = useCallback(() => {
    setState((prev) => ({ ...prev, status: "locating", error: null }));
    const fallback = async () => {
      const ok = await resolveViaIp();
      if (!ok) setState((prev) => ({ ...prev, status: "error", error: "Couldn't find your location — enter one below." }));
    };
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      void fallback();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setState({
          status: "resolved",
          coords: { lat: pos.coords.latitude, lon: pos.coords.longitude },
          area: null,
          bbox: null,
          label: "Your location",
          source: "gps",
          error: null,
        }),
      () => void fallback(),
      { timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
  }, [resolveViaIp]);

  // Commit a place the user picked from the location dropdown. A city arrives
  // with no area and stays a radius search; a state/province or country brings
  // its area (and bounds) along and drops the radius.
  const applyLocation = useCallback(
    (coords: LatLon, label: string, source: HomeLocationSource, area?: GeoArea | null, bbox?: BBox | null) => {
      setState({ status: "resolved", coords, area: area ?? null, bbox: area ? (bbox ?? null) : null, label, source, error: null });
    },
    [],
  );

  // Prompt for the device location the first time the tab becomes active.
  useEffect(() => {
    if (active && !autoTried.current) {
      autoTried.current = true;
      requestBrowser();
    }
  }, [active, requestBrowser]);

  return { ...state, requestBrowser, applyLocation };
}

type HomeLocationApi = ReturnType<typeof useHomeLocation>;
type GeoCandidate = {
  id: string;
  lat: number;
  lon: number;
  label: string;
  short: string;
  kind: GeoAreaKind;
  // Populated for area kinds; matched against the event's own location fields.
  region: string | null;
  country: string | null;
  bbox: BBox | null;
};

// Nominatim returns boundingbox as [south, north, west, east] strings.
function parseBBox(boundingbox: unknown): BBox | null {
  if (!Array.isArray(boundingbox) || boundingbox.length !== 4) return null;
  const [south, north, west, east] = boundingbox.map(Number);
  if ([south, north, west, east].some((value) => !Number.isFinite(value))) return null;
  return { south, north, west, east };
}

// Photon returns extent as [minLon, maxLat, maxLon, minLat].
function parseExtent(extent: unknown): BBox | null {
  if (!Array.isArray(extent) || extent.length !== 4) return null;
  const [west, north, east, south] = extent.map(Number);
  if ([south, north, west, east].some((value) => !Number.isFinite(value))) return null;
  return { south, north, west, east };
}

// Join the parts of a place name, dropping blanks and repeats ("Texas, Texas,
// United States" → "Texas, United States").
function joinPlaceParts(parts: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return parts
    .map((part) => (part ?? "").trim())
    .filter((part) => {
      if (!part || seen.has(part.toLowerCase())) return false;
      seen.add(part.toLowerCase());
      return true;
    })
    .join(", ");
}

const GEO_AREA_LABEL: Record<GeoAreaKind, string> = { point: "City", region: "State / Province", country: "Country" };

function geoCandidateArea(candidate: GeoCandidate): GeoArea | null {
  if (candidate.kind === "point") return null;
  return { kind: candidate.kind, region: candidate.region, country: candidate.country };
}

// Photon (keyless, built for type-ahead — unlike Nominatim, whose usage policy
// rules out autocomplete). Its `type` classifies the hit for us, so a state and
// a city can be told apart without guessing from the bounding box size.
async function photonCandidates(query: string, signal: AbortSignal): Promise<GeoCandidate[]> {
  const res = await fetch(`https://photon.komoot.io/api/?limit=8&q=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const data = await res.json();
  const features = Array.isArray(data?.features) ? data.features : [];
  return features
    .map((feature: Record<string, unknown>, index: number) => {
      const props = (feature?.properties ?? {}) as Record<string, unknown>;
      const coords = (feature?.geometry as { coordinates?: unknown[] } | undefined)?.coordinates;
      const lon = Number(coords?.[0]);
      const lat = Number(coords?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const type = String(props.type ?? "");
      // Anything more granular than a city (street, house, district) is still a
      // useful point — only the two area types change how matching works.
      const kind: GeoAreaKind = type === "country" ? "country" : type === "state" ? "region" : "point";
      const name = String(props.name ?? "").trim();
      if (!name) return null;
      const state = props.state ? String(props.state) : null;
      const country = props.country ? String(props.country) : null;
      return {
        id: `photon-${props.osm_id ?? index}-${index}`,
        lat,
        lon,
        label: joinPlaceParts([name, kind === "country" ? null : state, kind === "country" ? null : country]),
        short: name,
        kind,
        region: kind === "region" ? name : state,
        country,
        bbox: parseExtent(props.extent),
      } satisfies GeoCandidate;
    })
    .filter((candidate: GeoCandidate | null): candidate is GeoCandidate => candidate != null);
}

// Fallback for when Photon is down. Nominatim's `addresstype` gives the same
// city/state/country split, and `addressdetails` the names to match on.
async function nominatimCandidates(query: string, signal: AbortSignal): Promise<GeoCandidate[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`,
    { headers: { Accept: "application/json" }, signal },
  );
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const results = await res.json();
  if (!Array.isArray(results)) return [];
  return results
    .filter((hit) => hit && hit.lat && hit.lon)
    .map((hit, index) => {
      const address = (hit.address ?? {}) as Record<string, string | undefined>;
      const addressType = String(hit.addresstype ?? hit.type ?? "");
      const kind: GeoAreaKind =
        addressType === "country" ? "country" : ["state", "province", "region"].includes(addressType) ? "region" : "point";
      const label = String(hit.display_name ?? query);
      const state = address.state ?? address.province ?? null;
      return {
        id: String(hit.place_id ?? index),
        lat: Number(hit.lat),
        lon: Number(hit.lon),
        label: joinPlaceParts(label.split(",").slice(0, kind === "point" ? 3 : 2)),
        short: label.split(",")[0]?.trim() || query,
        kind,
        region: kind === "region" ? (state ?? label.split(",")[0]?.trim() ?? null) : state,
        country: address.country ?? null,
        bbox: parseBBox(hit.boundingbox),
      } satisfies GeoCandidate;
    });
}

// Geocode free text to a short list of candidates. Several places share a name,
// so the user picks the right one rather than the first being assumed.
async function geocodeCandidates(query: string, signal: AbortSignal): Promise<GeoCandidate[]> {
  try {
    const hits = await photonCandidates(query, signal);
    if (hits.length) return dedupeCandidates(hits);
  } catch (error) {
    if (signal.aborted || (error as Error)?.name === "AbortError") throw error;
  }
  return dedupeCandidates(await nominatimCandidates(query, signal));
}

// Geocoders routinely return the same place twice (the city node and its
// boundary relation, say). Identical rows are noise, so keep the first.
function dedupeCandidates(candidates: GeoCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.kind}:${candidate.label.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function NearMeLocationBar({ location, radius, onRadiusChange }: { location: HomeLocationApi; radius: number; onRadiusChange: (radius: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const [candidates, setCandidates] = useState<GeoCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  const sourceLabel =
    location.source === "gps" ? "device" : location.source === "ip" ? "approx." : location.source === "manual" ? "manual" : null;

  const closeEditor = useCallback(() => {
    setEditing(false);
    setCandidates(null);
    setSearchError(null);
  }, []);
  const searchRef = useOutsideClick<HTMLDivElement>(closeEditor);

  // Live lookup: each debounced keystroke replaces the previous request, and an
  // in-flight one is aborted so a slow early result can't overwrite a newer one.
  useEffect(() => {
    if (!editing || debouncedQuery.length < 2) {
      setCandidates(null);
      setSearchError(null);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    setSearchError(null);
    geocodeCandidates(debouncedQuery, controller.signal)
      .then((hits) => {
        if (controller.signal.aborted) return;
        setCandidates(hits);
        setHighlight(0);
        setSearchError(hits.length ? null : `Couldn't find “${debouncedQuery}”.`);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setCandidates(null);
        setSearchError("Location lookup failed. Try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
    return () => controller.abort();
  }, [debouncedQuery, editing]);

  const choose = (candidate: GeoCandidate) => {
    location.applyLocation(
      { lat: candidate.lat, lon: candidate.lon },
      candidate.short,
      "manual",
      geoCandidateArea(candidate),
      candidate.bbox,
    );
    setEditing(false);
    setCandidates(null);
    setSearchError(null);
    setQuery("");
  };

  const showSpinner = searching && !candidates?.length;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const options = candidates ?? [];
    if (event.key === "Escape") {
      closeEditor();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!options.length) return;
      event.preventDefault();
      setHighlight((index) => (index + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const picked = options[highlight];
      if (picked) choose(picked);
    }
  };

  return (
    <div className="near-me-bar">
      <MapPin size={15} className="near-me-pin" />
      <div className="near-me-status">
        {location.status === "locating" && <span>Finding events near you…</span>}
        {location.status === "resolved" && (
          <span>
            {location.area ? "Events in " : "Near "}
            <strong>{location.label}</strong>
            {sourceLabel && <span className="near-me-source">{sourceLabel}</span>}
          </span>
        )}
        {location.status === "error" && <span className="near-me-error">{location.error}</span>}
        {location.status === "idle" && <span>Sort events by distance from you.</span>}
      </div>
      <div className="near-me-actions">
        {/* A radius is meaningless for a state or country — those match every
            event inside them, so the control is hidden rather than ignored. */}
        {!location.area && (
          <label className="near-me-radius">
            Within
            <select
              className="near-me-radius-select"
              value={radius}
              onChange={(event) => onRadiusChange(Number(event.target.value))}
              aria-label="Search radius"
            >
              {NEAR_ME_RADIUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{option} mi</option>
              ))}
            </select>
          </label>
        )}
        {editing ? (
          <div className="near-me-search" ref={searchRef}>
            <div className="near-me-form">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="City, state, or country"
                className="near-me-input"
                aria-label="Location"
                role="combobox"
                aria-expanded={!!candidates?.length}
                aria-controls="near-me-candidates"
                aria-autocomplete="list"
              />
              <button type="button" className="near-me-cancel" onClick={closeEditor} aria-label="Cancel">×</button>
            </div>
            {(candidates?.length || searchError || showSpinner) && (
              <div className="near-me-candidates" id="near-me-candidates" role="listbox">
                {/* Spinner only until there's something to show — while refining
                    a query the previous matches stay put instead of flashing. */}
                {showSpinner && (
                  <div className="near-me-candidate-empty near-me-candidate-loading">
                    <span className="near-me-spinner" aria-hidden />
                    Searching…
                  </div>
                )}
                {searchError && <div className="near-me-candidate-empty">{searchError}</div>}
                {candidates?.map((candidate, index) => (
                  <button
                    key={candidate.id}
                    type="button"
                    role="option"
                    aria-selected={index === highlight}
                    className={`near-me-candidate${index === highlight ? " highlighted" : ""}`}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => choose(candidate)}
                    title={candidate.label}
                  >
                    <MapPin size={13} className="near-me-candidate-pin" />
                    <span className="near-me-candidate-text">{candidate.label}</span>
                    <span className="near-me-candidate-kind">{GEO_AREA_LABEL[candidate.kind]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <button type="button" className="near-me-link" onClick={() => location.requestBrowser()}>
              Use my location
            </button>
            <button type="button" className="near-me-link" onClick={() => setEditing(true)}>
              Enter location
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Rows per page in the home event lists. 6 rather than 7 keeps the panel from
// dominating the page now that it grows with its content instead of scrolling
// inside a fixed height — one row shorter is ~15% off the list.
const HOME_EVENTS_PAGE_SIZE = 6;
// Radius choices for a point (city / GPS / IP) Near me search. States and
// countries ignore these entirely — see GeoArea.
const NEAR_ME_RADIUS_OPTIONS = [25, 50, 75, 150, 250];
const NEAR_ME_RADIUS_DEFAULT = 75;
const NEAR_ME_RADIUS_KEY = "vex-nearme-radius";
function loadNearMeRadius(): number {
  try {
    const raw = Number(localStorage.getItem(NEAR_ME_RADIUS_KEY));
    return NEAR_ME_RADIUS_OPTIONS.includes(raw) ? raw : NEAR_ME_RADIUS_DEFAULT;
  } catch { return NEAR_ME_RADIUS_DEFAULT; }
}
function saveNearMeRadius(radius: number) {
  try { localStorage.setItem(NEAR_ME_RADIUS_KEY, String(radius)); } catch {}
}

function EventsPager({
  page,
  totalPages,
  onPage,
  placement,
  center,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  placement: "top" | "bottom";
  // Optional middle slot (e.g. the Upcoming sort toggle). When present the row
  // renders even for a single page, so the control never disappears.
  center?: ReactNode;
}) {
  const paged = Number.isFinite(totalPages) && totalPages > 1;
  if (!paged && !center) return null;
  return (
    <div className={`events-pager events-pager-${placement}`}>
      <span className="events-pager-label">{paged ? `Page ${page} of ${totalPages}` : ""}</span>
      <div className="events-pager-center">{center}</div>
      <div className="events-pager-btns">
        {paged && (
          <>
            <button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
              <ChevronLeft size={16} />
            </button>
            <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
              <ChevronRight size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Flat event list paginated 10 per page with a pager above and below. Used for
// the Today / Near Today / Near me / Sigs tabs.
function PaginatedEventList({
  events,
  loading,
  showDistance = false,
  distanceFor,
  pagers = "both",
  headerLabel,
}: {
  events: Event[];
  loading: boolean;
  showDistance?: boolean;
  distanceFor?: (event: Event) => number | null;
  pagers?: "both" | "bottom";
  headerLabel?: ReactNode;
}) {
  const [page, setPage] = useState(1);
  // Reset to the first page whenever the underlying list changes (tab, program,
  // or location switch all produce a fresh array reference).
  useEffect(() => {
    setPage(1);
  }, [events]);

  const totalPages = Math.max(1, Math.ceil(events.length / HOME_EVENTS_PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const slice = events.slice((current - 1) * HOME_EVENTS_PAGE_SIZE, current * HOME_EVENTS_PAGE_SIZE);

  return (
    <div className="home-paged-events">
      {pagers === "both" && <EventsPager page={current} totalPages={totalPages} onPage={setPage} placement="top" />}
      <EventTable
        events={slice}
        loading={loading}
        compact
        showPriority
        showProgram
        showGrade
        showDistance={showDistance}
        distanceFor={distanceFor}
        headerLabel={headerLabel}
      />
      <EventsPager page={current} totalPages={totalPages} onPage={setPage} placement="bottom" />
    </div>
  );
}

// A single Upcoming level section. Mirrors the events-tab TierSection: the
// marquee tiers (Worlds / Signature / Championship) collapse to a short preview
// with a fade + "Show all", while "Other Events" paginates 7 per page.
// A marquee level section (Worlds / Signature / Championship): preview the
// first few with a fade + "Show all". The level name lives in the table header.
function HomeUpcomingTier({ label, events }: { label: string; events: Event[] }) {
  const [expanded, setExpanded] = useState(false);
  const showFade = events.length > TIER_COLLAPSE_THRESHOLD && !expanded;
  const displayEvents = showFade ? events.slice(0, TIER_COLLAPSE_THRESHOLD) : events;
  const groupLabel = (
    <>
      {label} <span className="tier-count">({events.length})</span>
    </>
  );

  return (
    <div className="tier-section">
      <div className={`tier-collapse${showFade ? " is-collapsed" : ""}`}>
        <EventTable events={displayEvents} loading={false} compact showPriority showProgram showGrade headerLabel={groupLabel} />
        {showFade && (
          <button className="alliance-show-all" onClick={() => setExpanded(true)}>
            Show all {events.length} <ChevronDown size={15} />
          </button>
        )}
        {expanded && (
          <button className="alliance-show-all alliance-show-less" onClick={() => setExpanded(false)}>
            <ChevronUp size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

// Upcoming sort mode. "smart" keeps the level-grouped view (Worlds → Signature
// → Championship → Other); "date" drops the grouping for one flat list ordered
// by start date.
type UpcomingSort = "smart" | "date";
const UPCOMING_SORT_KEY = "vex-home-upcoming-sort";
function loadUpcomingSort(): UpcomingSort {
  try {
    return localStorage.getItem(UPCOMING_SORT_KEY) === "date" ? "date" : "smart";
  } catch { return "smart"; }
}

function UpcomingSortToggle({ value, onChange }: { value: UpcomingSort; onChange: (value: UpcomingSort) => void }) {
  const options: Array<{ value: UpcomingSort; label: string }> = [
    { value: "smart", label: "Smart Sort" },
    { value: "date", label: "Start Date" },
  ];
  return (
    <div className="upcoming-sort-toggle" role="group" aria-label="Sort upcoming events">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "active" : ""}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Upcoming tab: events grouped into level sections (Worlds → Signature →
// Championship → Other), chronological within each. Marquee tiers collapse with
// a fade; "Other Events" paginates. The Other-Events pager is hoisted to wrap
// the whole view so its controls sit above all groups (top) and below them
// (bottom), rather than floating between sections. Switching the sort toggle to
// "Start Date" replaces the whole thing with one flat paginated list.
function UpcomingGroupedEvents({ events, loading }: { events: Event[]; loading: boolean }) {
  const [sort, setSort] = useState<UpcomingSort>(() => loadUpcomingSort());
  useEffect(() => {
    try { localStorage.setItem(UPCOMING_SORT_KEY, sort); } catch { /* ignore */ }
  }, [sort]);
  const sortToggle = <UpcomingSortToggle value={sort} onChange={setSort} />;

  const byDate = useMemo(() => [...events].sort(compareEventsChronological), [events]);
  const spotlightTier = useSpotlightTier();

  const sections = useMemo(() => {
    const tiers: Array<{ label: string; category: EventCategory; collapsible: boolean }> = [
      { label: "World Championships", category: "Worlds", collapsible: true },
      { label: "Signature Events", category: "Signature", collapsible: true },
      { label: "Spotlight Events", category: "Spotlight", collapsible: true },
      { label: "Championships", category: "Championship", collapsible: true },
      { label: "Other Events", category: "Other", collapsible: false },
    ];
    return tiers
      .map((tier) => ({ ...tier, events: events.filter((event) => eventCategory(event).label === tier.category) }))
      .filter((tier) => tier.events.length > 0);
    // Grouping is by tier, so the Spotlight SKUs arriving must regroup.
  }, [events, spotlightTier]);

  const otherEvents = useMemo(() => sections.find((section) => !section.collapsible)?.events ?? [], [sections]);
  // One page counter for both modes: it paginates "Other Events" under Smart
  // Sort and the whole flat list under Start Date.
  const paged = sort === "date" ? byDate : otherEvents;
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [paged]);

  const totalPages = Math.max(1, Math.ceil(paged.length / HOME_EVENTS_PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const otherSlice = paged.slice((current - 1) * HOME_EVENTS_PAGE_SIZE, current * HOME_EVENTS_PAGE_SIZE);

  return (
    <LoadingSwap
      loading={loading}
      skeleton={<EventTable events={[]} loading compact showPriority showProgram showGrade />}
    >
      {!sections.length ? (
        <Empty>No upcoming events for this program yet.</Empty>
      ) : sort === "date" ? (
        <div className="home-events-groups">
          <EventsPager page={current} totalPages={totalPages} onPage={setPage} placement="top" center={sortToggle} />
          <EventTable
            events={otherSlice}
            loading={false}
            compact
            showPriority
            showProgram
            showGrade
            headerLabel={
              <>
                Events <span className="tier-count">({byDate.length})</span>
              </>
            }
          />
          <EventsPager page={current} totalPages={totalPages} onPage={setPage} placement="bottom" />
        </div>
      ) : (
        <div className="home-events-groups">
          <EventsPager page={current} totalPages={totalPages} onPage={setPage} placement="top" center={sortToggle} />
          {sections.map((section) =>
            section.collapsible ? (
              <HomeUpcomingTier key={section.category} label={section.label} events={section.events} />
            ) : (
              <div className="tier-section" key={section.category}>
                <EventTable
                  events={otherSlice}
                  loading={false}
                  compact
                  showPriority
                  showProgram
                  showGrade
                  headerLabel={
                    <>
                      {section.label} <span className="tier-count">({section.events.length})</span>
                    </>
                  }
                />
              </div>
            ),
          )}
          <EventsPager page={current} totalPages={totalPages} onPage={setPage} placement="bottom" />
        </div>
      )}
    </LoadingSwap>
  );
}

function Home() {
  const { profile } = useAuth();
  const [homeEventTab, setHomeEventTab] = useState<HomeEventTab>("upcoming");
  const [nearMeRadius, setNearMeRadius] = useState<number>(() => loadNearMeRadius());
  useEffect(() => { saveNearMeRadius(nearMeRadius); }, [nearMeRadius]);
  // Program chips: a stored pick wins, else the signed-in user's own program
  // (seeded by effect below — the profile isn't loaded synchronously on first
  // render), else every program.
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>(() => loadHomePrograms() ?? allHomeProgramIds());
  // Captured once at mount, before the persist effect writes storage, so the seed
  // effect can tell a genuine prior choice from the default it just saved.
  const [hadStoredPrograms] = useState<boolean>(() => loadHomePrograms() !== null);
  const homeProgramsSeeded = useRef(false);
  useEffect(() => { saveHomePrograms(selectedProgramIds); }, [selectedProgramIds]);
  useEffect(() => {
    if (homeProgramsSeeded.current) return;
    if (hadStoredPrograms) {
      homeProgramsSeeded.current = true;
      return;
    }
    if (profile?.team_program) {
      setSelectedProgramIds([profile.team_program]);
      homeProgramsSeeded.current = true;
    }
  }, [profile, hadStoredPrograms]);
  const programKey = selectedProgramIds.join(",");
  const { data: events, loading: eventsLoading, error: eventsError } = useAsync(
    () =>
      api.events({
        start: dateOnly(addDays(today, -30)),
        end: dateOnly(addDays(today, 120)),
        per_page: 100,
        "program[]": selectedProgramIds.length ? selectedProgramIds : vexProgramIds,
      }),
    [programKey],
  );
  const spotlightTier = useSpotlightTier();
  const baseHomeEvents = useMemo(
    () => filterAndSortEvents(events?.data ?? [], { hideCanceled: true, sort: "smart", programIds: selectedProgramIds }),
    // Smart sort orders by tier, so re-sort when the Spotlight SKUs arrive.
    [events, selectedProgramIds, spotlightTier],
  );
  const location = useHomeLocation(homeEventTab === "nearMe");
  const userCoords = location.coords;
  const userArea = location.area;
  const userBbox = location.bbox;
  const distanceFor = useCallback(
    (event: Event) => {
      if (!userCoords) return null;
      const coords = eventCoords(event);
      return coords ? haversineMiles(userCoords, coords) : null;
    },
    [userCoords],
  );

  const homeEvents = useMemo(() => {
    if (homeEventTab === "today") {
      // Events whose date window contains today, ordered by smart sort.
      return baseHomeEvents.filter(eventIsToday).sort((a, b) => compareEvents(a, b, "smart"));
    }
    if (homeEventTab === "sigs") {
      return baseHomeEvents
        .filter((event) => eventCategory(event).label === "Signature")
        .sort(compareEventsChronological);
    }
    if (homeEventTab === "nearToday") {
      // Closest in time to today (past or future within the fetch window).
      return [...baseHomeEvents].sort(
        (a, b) => eventDistance(a) - eventDistance(b) || compareEventsChronological(a, b),
      );
    }
    if (homeEventTab === "nearMe") {
      // Until a location resolves, fall back to time-proximity ordering so the
      // tab is never empty.
      if (!userCoords) {
        return [...baseHomeEvents].sort(
          (a, b) => eventDistance(a) - eventDistance(b) || compareEventsChronological(a, b),
        );
      }
      return filterEventsNearLocation(baseHomeEvents, { coords: userCoords, area: userArea, bbox: userBbox }, nearMeRadius, true);
    }
    // Upcoming: today's events plus everything still ahead, chronological
    // (grouped by level downstream). Both sides are calendar days, so an event
    // starting today survives the cutoff no matter the reader's timezone.
    return baseHomeEvents
      .filter((event) => eventIsToday(event) || (eventDayNumber(event.start) ?? 0) >= dayToNumber(todayInZone(null)))
      .sort(compareEventsChronological);
  }, [baseHomeEvents, homeEventTab, userCoords, userArea, userBbox, nearMeRadius]);

  return (
    <section className="page home-page">
      <section className="home-hero">
        <HomeGreeting />
        <div className="home-hero-bar">
          <div className="home-hero-search">
            <GlobalSearch className="home-hero-global-search" />
          </div>
          <nav className="home-hero-actions">
            <Link href="/events" className="home-hero-btn">
              <CalendarDays size={16} />
              Events
            </Link>
            <Link href="/teams" className="home-hero-btn">
              <Users size={16} />
              Teams
            </Link>
          </nav>
        </div>
      </section>

      <div className="home-dashboard">
        <aside className="home-sidebar">
          {/* Hidden on mobile (see .home-signin-card) — phone users sign in via
              the header account button instead of a full-width card. The wrapper
              lives inside SignedOut so it leaves no empty grid row when signed in,
              which would push the sidebar out of line with the events panel. */}
          <SignedOut>
            <div className="home-signin-card">
              <Panel title="Sign up / Log in" icon={<Star />}>
                <div className="auth-card-body">
                  <p className="auth-card-copy">Sign in to sync your favorites and settings across devices.</p>
                  <SignInButtons />
                </div>
              </Panel>
            </div>
          </SignedOut>
          <RecentlyViewedPanel />
          <FavoritesPanel />
          <SharedTeamPanel />

          <SkillsLeaderboardPanel />
        </aside>

        <div className="home-events-col">
          <Panel
            title={
              <div className="home-events-header">
                <HomeProgramToggle selected={selectedProgramIds} onChange={setSelectedProgramIds} />
                <SeasonSelector
                  seasons={homeEventTabs.map((tab, index) => ({ id: index, label: tab.label }))}
                  selectedSeasonId={homeEventTabs.findIndex((tab) => tab.value === homeEventTab)}
                  onChange={(index) => setHomeEventTab(homeEventTabs[index].value)}
                  loading={false}
                  hideCount
                  hideLabel
                />
                <Link href="/events" className="home-events-seeall">All Events</Link>
              </div>
            }
            icon={<CalendarDays />}
          >
            <Status loading={eventsLoading} error={eventsError} />
            {homeEventTab === "nearMe" && <NearMeLocationBar location={location} radius={nearMeRadius} onRadiusChange={setNearMeRadius} />}
            {homeEventTab === "upcoming" ? (
              <UpcomingGroupedEvents events={homeEvents} loading={eventsLoading} />
            ) : homeEventTab === "nearMe" && userCoords && !eventsLoading && homeEvents.length === 0 ? (
              <div className="notice subtle">
                {userArea ? (
                  <>No events in {location.label ?? "that area"}. </>
                ) : (
                  <>No events within {nearMeRadius} mi. </>
                )}
                Try <strong>Near Today</strong> or open the full events list.
              </div>
            ) : (
              <PaginatedEventList
                events={homeEvents}
                loading={eventsLoading}
                showDistance={homeEventTab === "nearMe" && !!userCoords}
                distanceFor={homeEventTab === "nearMe" ? distanceFor : undefined}
              />
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <div>
        <strong>{value.toLocaleString()}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

function Panel({ title, icon, children, action, collapsible, storageKey, defaultCollapsed }: { title: ReactNode; icon: ReactNode; children: ReactNode; action?: ReactNode; collapsible?: boolean; storageKey?: string; defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (!collapsible) return false;
    if (storageKey) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null) return stored === "1";
      } catch { /* ignore */ }
    }
    return defaultCollapsed ?? false;
  });
  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      if (storageKey) { try { localStorage.setItem(storageKey, next ? "1" : "0"); } catch { /* ignore */ } }
      return next;
    });
  }
  return (
    <section className={`panel${collapsible ? " panel-collapsible" : ""}${collapsed ? " is-collapsed" : ""}`}>
      <h2>
        {collapsible ? (
          <button type="button" className="panel-heading-title panel-heading-toggle" onClick={toggle} aria-expanded={!collapsed}>
            <ChevronDown size={15} className="panel-collapse-chevron" />
            {icon}
            {title}
          </button>
        ) : (
          <span className="panel-heading-title">
            {icon}
            {title}
          </span>
        )}
        {action && <span className="panel-heading-action">{action}</span>}
      </h2>
      {!collapsed && children}
    </section>
  );
}

const EVENT_FILTER_KEY = "vex-events-filters";

// Wrapper: remount the page when synced settings load/change (e.g. signing in
// pulls cloud filters), so the lazy initializers in EventsPageInner re-read the
// freshly-synced values from localStorage. When signed out this stays constant.
function EventsPage() {
  const settingsEpoch = useSettingsEpoch();
  return <EventsPageInner key={settingsEpoch} />;
}

type SavedEventFilters = {
  level: string;
  selectedRegionKeys: string[];
  eventWindow: EventWindow;
  sort: EventSort;
  selectedSeasonIds: number[];
  seasonSelectionTouched: boolean;
  hideCanceled: boolean;
  filterLayout: EventFilterLayout;
  seasonMultiSelect: boolean;
  programMultiSelect: boolean;
  pastSeasonDateDir: "asc" | "desc";
  selectedGrades: string[];
  nearMe: boolean;
};

function readEventFilters(): Partial<SavedEventFilters> {
  try {
    return JSON.parse(window.localStorage.getItem(EVENT_FILTER_KEY) ?? "{}");
  } catch {
    return {};
  }
}

// Bold every case-insensitive occurrence of `query` within `text`. Returns the
// raw string when there's no query so non-search renders are unaffected.
function highlightMatch(text: string, query: string): ReactNode {
  const needle = query.trim().toLowerCase();
  if (!needle) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (;;) {
    const idx = lower.indexOf(needle, cursor);
    if (idx === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    parts.push(
      <strong key={key++} className="search-highlight">
        {text.slice(idx, idx + needle.length)}
      </strong>,
    );
    cursor = idx + needle.length;
  }
  return parts;
}

function EventsPageInner() {
  const params = new URLSearchParams(window.location.search);
  const [quickSearch, setQuickSearch] = useState(params.get("search") ?? "");
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>(() => {
    const saved = window.localStorage.getItem("vex-events-programs");
    if (!saved) return ["1"];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : ["1"];
    } catch {
      return ["1"];
    }
  });
  const [level, setLevel] = useState<string>(() => readEventFilters().level ?? "");
  const [selectedRegionKeys, setSelectedRegionKeys] = useState<string[]>(() => readEventFilters().selectedRegionKeys ?? []);
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const regionMenuRef = useOutsideClick<HTMLDivElement>(() => setRegionMenuOpen(false));
  const [regionTab, setRegionTab] = useState<RegionOptionKind>("country");
  const [regionSearch, setRegionSearch] = useState("");
  const [eventWindow, setEventWindow] = useState<EventWindow>(() => readEventFilters().eventWindow ?? "near");
  // "Near me" is a location filter that sits alongside Region (they're mutually
  // exclusive — see toggleNearMe/toggleRegion). It reuses the Home tab's
  // location resolution, radius, and status bar so both pages behave the same.
  const [nearMe, setNearMe] = useState<boolean>(() => readEventFilters().nearMe ?? false);
  const [nearMeRadius, setNearMeRadius] = useState<number>(() => loadNearMeRadius());
  useEffect(() => { saveNearMeRadius(nearMeRadius); }, [nearMeRadius]);
  const location = useHomeLocation(nearMe);
  const userCoords = location.coords;
  const userArea = location.area;
  const userBbox = location.bbox;
  const [sort, setSort] = useState<EventSort>(() => readEventFilters().sort ?? "smart");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useOutsideClick<HTMLDivElement>(() => setSortMenuOpen(false));
  const [filterLayout, setFilterLayout] = useState<EventFilterLayout>(() => readEventFilters().filterLayout ?? "sidebar");
  // Mobile-only: the filter sidebar collapses to a "Filters" toggle so results
  // show first. Has no effect on desktop (the toggle is hidden via CSS).
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedSeasonIds, setSelectedSeasonIds] = useState<number[]>(() => readEventFilters().selectedSeasonIds ?? []);
  const [seasonSelectionTouched, setSeasonSelectionTouched] = useState<boolean>(() => readEventFilters().seasonSelectionTouched ?? false);
  const [seasonMultiSelect, setSeasonMultiSelect] = useState<boolean>(() => readEventFilters().seasonMultiSelect ?? false);
  const [programMultiSelect, setProgramMultiSelect] = useState<boolean>(() => readEventFilters().programMultiSelect ?? false);
  const [pastSeasonDateDir, setPastSeasonDateDir] = useState<"asc" | "desc">(() => readEventFilters().pastSeasonDateDir ?? "asc");
  const [selectedGrades, setSelectedGrades] = useState<string[]>(() => readEventFilters().selectedGrades ?? []);
  const [programMoreOpen, setProgramMoreOpen] = useState(false);
  const [lastOpenedMenu, setLastOpenedMenu] = useState<"region" | "season" | "program" | "sort" | "grade" | null>(null);
  const [hideCanceled, setHideCanceled] = useState<boolean>(() => readEventFilters().hideCanceled ?? true);
  const [page, setPage] = useState(1);
  const selectedProgramKey = selectedProgramIds.join(",");
  const selectedSeasonKey = selectedSeasonIds.join(",");
  const fetchWindow = eventWindowFetchKey(eventWindow);
  const queryKey = `${fetchWindow}:${selectedProgramKey}:${selectedSeasonKey}`;
  const dateWindow = eventWindowDates(fetchWindow);
  const seasons = useAsync(() => collectAllPages<Season>((page) => api.robotEventsSeasons({ page, per_page: 250 })), []);
  const countries = useAsync(() => api.robotEventsCountries(), []);
  const countryRegions = useAsync(() => api.robotEventsRegions(), []);
  const { data, loading, error } = useAsync(
    () => {
      const q = {
        start: dateWindow.start,
        end: dateWindow.end,
        "program[]": selectedProgramIds.length ? selectedProgramIds : undefined,
        "season[]": selectedSeasonIds.length ? selectedSeasonIds : undefined,
        per_page: 250,
      };
      return eventWindow === "allSeason"
        ? collectAllPages((p) => api.events({ ...q, page: p }))
        : api.events(q);
    },
    [queryKey],
  );
  const seasonOptions = useMemo(() => {
    const selectedPrograms = new Set(selectedProgramIds.map(Number));
    return (seasons.data?.data ?? [])
      .filter(seasonHasData)
      .filter((season) => !season.program || (vexProgramIds.includes(season.program.id) && (!selectedPrograms.size || selectedPrograms.has(season.program.id))))
      .map((season) => ({ id: season.id, label: shortSeasonName(season.name), program: season.program?.code ?? "" }))
      .sort((a, b) => b.id - a.id);
  }, [seasons.data, selectedProgramIds]);
  const allSeasonIds = useMemo(() => seasonOptions.map((season) => season.id), [seasonOptions]);
  const allSeasonsSelected = !!seasonOptions.length && sameNumberSet(selectedSeasonIds, allSeasonIds);
  const currentSeasonId = seasonOptions[0]?.id;
  const isPastSeasonView = !!currentSeasonId && selectedSeasonIds.length > 0 && !selectedSeasonIds.includes(currentSeasonId);
  const countryOptions = useMemo(() => dedupeCountryGroups(countries.data ?? []), [countries.data]);
  const sortOptions: Array<{ label: string; value: EventSort }> = [
    // Distance is only meaningful while Near me is on, so it's offered there only.
    ...(nearMe ? [{ label: "Distance", value: "distance" as const }] : []),
    { label: "Smart Sort", value: "smart" },
    { label: "Start Date", value: "date" },
    { label: "Event Type", value: "type" },
    { label: "Program", value: "program" },
    { label: "Location", value: "location" },
    { label: "Name", value: "name" },
  ];
  const sortLabel = sortOptions.find((option) => option.value === sort)?.label ?? "Sort";
  const countryById = useMemo(() => new Map(countryOptions.map((country) => [country.value, country])), [countryOptions]);
  const regionOptions = useMemo<RegionOption[]>(() => {
    const countryItems = countryOptions.map((country) => ({
      key: optionKey("country", country.value),
      kind: "country" as const,
      label: country.label,
      badge: "Country",
      countryId: country.value,
      countryName: country.label,
    }));
    const subdivisionItems = (countryRegions.data ?? []).map((region) => {
      const country = countryById.get(region.country_id);
      return {
        key: optionKey("subdivision", region.id),
        kind: "subdivision" as const,
        label: country ? `${region.name}, ${country.label}` : region.name,
        badge: country?.country_id === "US" ? "State" : "State / Province",
        countryId: region.country_id,
        countryName: country?.label,
        regionName: region.name,
      };
    });
    const vexItems = new Map<string, RegionOption>();
    (data?.data ?? []).forEach((event) => {
      derivedVexRegionLabels(event).forEach((label) => {
        const key = optionKey("vex-region", label);
        if (!vexItems.has(key)) {
          vexItems.set(key, {
            key,
            kind: "vex-region",
            label,
            badge: "VEX Region",
            vexLabel: label,
          });
        }
      });
    });

    return [...countryItems, ...subdivisionItems, ...vexItems.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [countryOptions, countryRegions.data, countryById, data]);
  const selectedRegionOptions = useMemo(() => regionOptions.filter((option) => selectedRegionKeys.includes(option.key)), [regionOptions, selectedRegionKeys]);
  const regionButtonLabel =
    selectedRegionOptions.length === 0
      ? "All regions"
      : selectedRegionOptions.length === 1
        ? selectedRegionOptions[0].label
        : `${selectedRegionOptions.length} regions`;
  const visibleRegionOptions = regionOptions.filter((option) => {
    if (option.kind !== regionTab) return false;
    const needle = regionSearch.trim().toLowerCase();
    if (!needle) return true;
    return [option.label, option.badge, option.countryName, option.regionName, option.vexLabel].filter(Boolean).join(" ").toLowerCase().includes(needle);
  });
  const distanceFor = useCallback(
    (event: Event) => {
      if (!userCoords) return null;
      const coords = eventCoords(event);
      return coords ? haversineMiles(userCoords, coords) : null;
    },
    [userCoords],
  );
  const spotlightTier = useSpotlightTier();
  // Feeds the quick-search re-sort below; the browse ordering itself is unbiased.
  const searchBias = useSearchBias();
  const filteredEvents = useMemo(
    () =>
      filterAndSortEvents(data?.data ?? [], {
        programIds: selectedProgramIds,
        level,
        regionOptions: selectedRegionOptions,
        seasonIds: selectedSeasonIds,
        hideCanceled,
        grades: selectedGrades,
        // "distance" is applied below (it needs the resolved location); until
        // then fall back to the default ordering.
        sort: isPastSeasonView ? "past-season" : sort === "distance" ? "smart" : sort,
      }),
    // spotlightTier: the Spotlight SKU set can land after this first runs, and
    // `level` filters by tier.
    [data, selectedProgramIds, level, selectedRegionOptions, selectedSeasonIds, hideCanceled, selectedGrades, sort, isPastSeasonView, spotlightTier],
  );
  const visibleEvents = useMemo(() => {
    let events = filteredEvents;
    if (eventWindow === "today") events = events.filter(eventIsToday);
    // Near me. Until a location resolves, the list is left untouched rather
    // than emptied.
    if (nearMe && userCoords) {
      events = filterEventsNearLocation(
        events,
        { coords: userCoords, area: userArea, bbox: userBbox },
        nearMeRadius,
        sort === "distance",
      );
    }
    return events;
  }, [filteredEvents, eventWindow, nearMe, userCoords, userArea, userBbox, nearMeRadius, sort]);
  // Quick search live-filters the visible events directly (no results dropdown).
  // Matches are re-sorted with the "my program / my grade" nudge — but not when the
  // list is distance-sorted, since that order was resolved from real coordinates
  // upstream and re-sorting here would throw it away.
  const searchedEvents = useMemo(() => {
    const needle = quickSearch.trim().toLowerCase();
    if (!needle) return visibleEvents;
    const matched = visibleEvents.filter((event) => event.name.toLowerCase().includes(needle));
    if (sort === "distance") return matched;
    return matched.sort((a, b) => compareEventsForSearch(a, b, isPastSeasonView ? "past-season" : sort));
  }, [visibleEvents, quickSearch, sort, isPastSeasonView, searchBias]);
  const pageSize = 40;
  const totalPages = Math.max(1, Math.ceil(searchedEvents.length / pageSize));
  const pageEvents = searchedEvents.slice((page - 1) * pageSize, page * pageSize);
  // Distance ordering only means something for a point search — ranking a whole
  // state or country by how far each event is from its centroid is noise. So it
  // is applied automatically for a city/GPS/IP fix and rolled back to whatever
  // the user was sorting by otherwise. It stays selectable by hand either way,
  // and a sort the user picks themselves is never overwritten.
  const autoDistanceSort = useRef(false);
  const sortBeforeDistance = useRef<EventSort>("smart");
  useEffect(() => {
    if (nearMe && userCoords && !userArea) {
      if (!autoDistanceSort.current && sort !== "distance") {
        sortBeforeDistance.current = sort;
        autoDistanceSort.current = true;
        setSort("distance");
      }
    } else if (autoDistanceSort.current) {
      autoDistanceSort.current = false;
      if (sort === "distance") setSort(sortBeforeDistance.current);
    }
  }, [nearMe, userCoords, userArea, sort]);

  useEffect(() => {
    setPage(1);
  }, [selectedProgramIds, level, selectedRegionKeys, eventWindow, sort, selectedSeasonIds, hideCanceled, selectedGrades, nearMe, nearMeRadius, userCoords]);

  useEffect(() => {
    setPage(1);
  }, [quickSearch]);

  useEffect(() => {
    setEventsSettings({
      "vex-events-programs": selectedProgramIds,
      "vex-events-filters": {
        level, selectedRegionKeys, eventWindow, sort, selectedSeasonIds,
        seasonSelectionTouched, hideCanceled, filterLayout, seasonMultiSelect, programMultiSelect, pastSeasonDateDir, selectedGrades, nearMe,
      } satisfies SavedEventFilters,
    });
  }, [level, selectedRegionKeys, eventWindow, sort, selectedSeasonIds, seasonSelectionTouched, hideCanceled, filterLayout, seasonMultiSelect, programMultiSelect, pastSeasonDateDir, selectedGrades, selectedProgramIds, nearMe]);

  useEffect(() => {
    if (!seasonOptions.length) return;
    const availableIds = new Set(seasonOptions.map((season) => season.id));
    if (!seasonSelectionTouched) {
      setSelectedSeasonIds([seasonOptions[0].id]);
      return;
    }
    setSelectedSeasonIds((ids) => {
      if (!ids.length) return ids;
      return ids.filter((id) => availableIds.has(id));
    });
  }, [seasonOptions, seasonSelectionTouched]);

  useEffect(() => {
    if (selectedRegionKeys.length && regionOptions.length) {
      const availableKeys = new Set(regionOptions.map((option) => option.key));
      setSelectedRegionKeys((keys) => {
        const nextKeys = keys.filter((key) => availableKeys.has(key));
        return nextKeys.length === keys.length ? keys : nextKeys;
      });
    }
  }, [selectedRegionKeys, regionOptions]);

  const selectSeason = (seasonId: number) => {
    setSeasonSelectionTouched(true);
    setSelectedSeasonIds([seasonId]);
    if (currentSeasonId && seasonId !== currentSeasonId) setEventWindow("allSeason");
    else setEventWindow("near");
  };
  const resetFilters = () => {
    window.localStorage.removeItem(EVENT_FILTER_KEY);
    window.localStorage.removeItem("vex-events-programs");
    setSelectedProgramIds(["1"]);
    setLevel("");
    setSelectedRegionKeys([]);
    setNearMe(false);
    setEventWindow("near");
    setSort("smart");
    setSelectedSeasonIds([]);
    setSeasonSelectionTouched(false);
    setHideCanceled(true);
    setFilterLayout("sidebar");
    setSeasonMultiSelect(false);
    setProgramMultiSelect(false);
    setPastSeasonDateDir("asc");
    setSelectedGrades([]);
  };
  const setQuickFilter = (nextLevel: string, nextWindow: EventWindow, nextSort: EventSort = "smart") => {
    setLevel(nextLevel);
    setEventWindow(nextWindow);
    setSort(nextSort);
  };
  const toggleRegion = (key: string) => {
    // Picking an explicit region supersedes Near me — the two would otherwise
    // intersect into a confusing (often empty) result.
    setNearMe(false);
    setSelectedRegionKeys((keys) => (keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key]));
  };
  const clearRegions = () => {
    setSelectedRegionKeys([]);
  };
  const toggleNearMe = () => {
    setNearMe((on) => {
      const next = !on;
      if (next) {
        setSelectedRegionKeys([]);
        setRegionMenuOpen(false);
      }
      return next;
    });
  };

  // Program is single-select in the toggle UI; grade options depend on it.
  const activeProgramId = selectedProgramIds.length === 1 ? selectedProgramIds[0] : null;
  const availableGrades = activeProgramId ? (GRADES_BY_PROGRAM[activeProgramId] ?? []) : [];
  const activeGrade = selectedGrades.length === 1 ? selectedGrades[0] : null;
  const moreProgramActive = !!activeProgramId && PROGRAM_TOGGLE_MORE.some((p) => p.value === activeProgramId);
  const selectProgram = (programId: string) => {
    setSelectedProgramIds([programId]);
    setSelectedGrades([]);
    setSeasonSelectionTouched(false);
    setSelectedSeasonIds([]);
  };
  const selectGrade = (code: string | null) => setSelectedGrades(code ? [code] : []);

  const filterControls = (
    <>
      <div className="event-filter-fields">
        <div className="filter-section">
          <div className="filter-section-title filter-section-title-row">
            <span>Season</span>
            {isPastSeasonView && currentSeasonId && (
              <button type="button" className="back-to-season-btn" onClick={() => selectSeason(currentSeasonId)}>
                Back to {seasonOptions[0]?.label}
              </button>
            )}
          </div>
          <SeasonSelector
            seasons={seasonOptions.map((season) => ({ id: season.id, label: season.label }))}
            selectedSeasonId={selectedSeasonIds[0] ?? null}
            onChange={selectSeason}
            loading={seasons.loading}
            hideCount
            hideLabel
          />
        </div>
        <div className="filter-section">
          <div className="filter-section-title">Program &amp; Grade</div>
          <div className="program-grade">
            <div className="seg-toggle">
              {PROGRAM_TOGGLE_PRIMARY.map((p) => (
                <button key={p.value} type="button" className={activeProgramId === p.value ? "active" : ""} onClick={() => selectProgram(p.value)}>
                  {p.label}
                  {activeProgramId === p.value && <SlideIndicator id="seg-program" variant="pill" />}
                </button>
              ))}
              <button
                type="button"
                className={`seg-toggle-more${programMoreOpen || moreProgramActive ? " active" : ""}`}
                aria-expanded={programMoreOpen || moreProgramActive}
                title="More programs"
                onClick={() => setProgramMoreOpen((open) => !open)}
              >
                &hellip;
              </button>
              {(programMoreOpen || moreProgramActive) &&
                PROGRAM_TOGGLE_MORE.map((p) => (
                  <button key={p.value} type="button" className={activeProgramId === p.value ? "active" : ""} onClick={() => selectProgram(p.value)}>
                    {p.label}
                  </button>
                ))}
            </div>
            {availableGrades.length > 1 ? (
              <div className="seg-toggle">
                <button type="button" className={!activeGrade ? "active" : ""} onClick={() => selectGrade(null)}>
                  All
                  {!activeGrade && <SlideIndicator id="seg-grade" variant="pill" />}
                </button>
                {availableGrades.map((g) => (
                  <button key={g} type="button" className={activeGrade === g ? "active" : ""} onClick={() => selectGrade(g)}>
                    {gradeShortLabel(g)}
                    {activeGrade === g && <SlideIndicator id="seg-grade" variant="pill" />}
                  </button>
                ))}
              </div>
            ) : availableGrades.length === 1 ? (
              <div className="grade-static">{gradeShortLabel(availableGrades[0]!)}</div>
            ) : (
              <div className="grade-static grade-na">N/A</div>
            )}
          </div>
        </div>
        <div className="filter-field">
          <span className="filter-field-label-row">
            Region
            <button
              type="button"
              className={`near-me-chip${nearMe ? " active" : ""}`}
              aria-pressed={nearMe}
              onClick={toggleNearMe}
              title="Show events within a radius of your location"
            >
              <MapPin size={12} />
              Near me
            </button>
          </span>
          <div className="picker-menu" ref={regionMenuRef}>
            <button type="button" onClick={() => { setRegionMenuOpen((open) => !open); setLastOpenedMenu("region"); }} aria-expanded={regionMenuOpen}>
              {regionButtonLabel}
            </button>
            {regionMenuOpen && (
              <div className="picker-menu-list region-menu-list">
                <div className="picker-tabs">
                  <button type="button" className={regionTab === "country" ? "active" : ""} onClick={() => setRegionTab("country")}>
                    Countries
                    {regionTab === "country" && <SlideIndicator id="region-tabs" variant="pill" />}
                  </button>
                  <button type="button" className={regionTab === "subdivision" ? "active" : ""} onClick={() => setRegionTab("subdivision")}>
                    State / Province
                    {regionTab === "subdivision" && <SlideIndicator id="region-tabs" variant="pill" />}
                  </button>
                  <button type="button" className={regionTab === "vex-region" ? "active" : ""} onClick={() => setRegionTab("vex-region")}>
                    Region
                    {regionTab === "vex-region" && <SlideIndicator id="region-tabs" variant="pill" />}
                  </button>
                </div>
                <input className="picker-search" value={regionSearch} onChange={(event) => setRegionSearch(event.target.value)} placeholder="Search regions" />
                <div className="picker-menu-actions">
                  <button type="button" onClick={clearRegions}>
                    Clear
                  </button>
                </div>
                <div className="region-option-list">
                  {visibleRegionOptions.map((option) => (
                    <label key={option.key}>
                      <input type="checkbox" checked={selectedRegionKeys.includes(option.key)} onChange={() => toggleRegion(option.key)} />
                      <span>{option.label}</span>
                      <small>{option.badge}</small>
                    </label>
                  ))}
                </div>
                {!visibleRegionOptions.length && <div className="picker-menu-empty">No matches.</div>}
              </div>
            )}
          </div>
        </div>
        <div className="filter-section">
          <div className="filter-section-title">Time</div>
          {/* Four options, so a fixed 2×2 rather than flex-wrap's lopsided 3+1. */}
          <div className="seg-toggle seg-toggle-quiet seg-toggle-grid">
            {EVENT_WINDOW_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={eventWindow === option.value ? "active" : ""}
                onClick={() => setEventWindow(option.value)}
              >
                {option.label}
                {eventWindow === option.value && <SlideIndicator id="seg-time" variant="pill" />}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-section">
          <div className="filter-section-title">Type</div>
          <div className="seg-toggle seg-toggle-quiet">
            <button className={!level ? "active" : ""} onClick={() => setLevel("")}>
              All
              {!level && <SlideIndicator id="seg-type" variant="pill" />}
            </button>
            <button className={level === "World" ? "active" : ""} onClick={() => setQuickFilter("World", eventWindow)}>
              Worlds
              {level === "World" && <SlideIndicator id="seg-type" variant="pill" />}
            </button>
            <button className={level === "Signature" ? "active" : ""} onClick={() => setQuickFilter("Signature", eventWindow)}>
              Signature
              {level === "Signature" && <SlideIndicator id="seg-type" variant="pill" />}
            </button>
            <button className={level === "Spotlight" ? "active" : ""} onClick={() => setQuickFilter("Spotlight", eventWindow)}>
              Spotlight
              {level === "Spotlight" && <SlideIndicator id="seg-type" variant="pill" />}
            </button>
            <button className={level === "Championship" ? "active" : ""} onClick={() => setQuickFilter("Championship", eventWindow)}>
              Championships
              {level === "Championship" && <SlideIndicator id="seg-type" variant="pill" />}
            </button>
            <button className={level === "Other" ? "active" : ""} onClick={() => setLevel("Other")}>
              Other
              {level === "Other" && <SlideIndicator id="seg-type" variant="pill" />}
            </button>
          </div>
        </div>
        <div className="filter-field">
          <span>Sort</span>
          <div className="picker-menu" ref={sortMenuRef}>
            <button type="button" onClick={() => { setSortMenuOpen((open) => !open); setLastOpenedMenu("sort"); }} aria-expanded={sortMenuOpen}>
              {sortLabel}
            </button>
            {sortMenuOpen && (
              <div className="picker-menu-list" style={{ zIndex: lastOpenedMenu === "sort" ? 20 : 10 }}>
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={sort === option.value ? "active" : ""}
                    onClick={() => {
                      setSort(option.value);
                      setSortMenuOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <label className="checkbox-filter">
          <input type="checkbox" checked={hideCanceled} onChange={(event) => setHideCanceled(event.target.checked)} />
          Hide canceled
        </label>
      </div>
    </>
  );

  return (
    <section className={`page${filterLayout === "sidebar" ? " events-page-wide" : ""}`}>
      <div className="events-title-row">
        <PageTitle icon={<CalendarDays />} title="Events" />
        <button
          className="icon-button event-filter-layout-toggle"
          onClick={() => setFilterLayout((layout) => (layout === "sidebar" ? "inline" : "sidebar"))}
          aria-label={filterLayout === "sidebar" ? "Use compact filters" : "Use sidebar filters"}
          title={filterLayout === "sidebar" ? "Compact filters" : "Sidebar filters"}
        >
          {filterLayout === "sidebar" ? <ListFilter size={16} /> : <PanelRight size={16} />}
        </button>
      </div>
      {filterLayout === "inline" && <div className="event-toolbar event-toolbar-inline">{filterControls}</div>}
      <div className={filterLayout === "sidebar" ? "events-layout" : ""}>
        <Panel title="Event List" icon={<CalendarDays />}>
          <Status loading={loading} error={error} />
          <div className="event-quick-search">
            <label className="search-field event-search-field">
              <Search size={16} className="event-search-icon" />
              <input
                value={quickSearch}
                onChange={(event) => setQuickSearch(event.target.value)}
                placeholder="Search events by name"
              />
              {!!quickSearch.trim() && (
                <button type="button" className="event-search-clear" onClick={() => setQuickSearch("")} aria-label="Clear search">
                  <X size={15} />
                </button>
              )}
            </label>
            {!loading && (
              <span className="event-search-count">
                {searchedEvents.length.toLocaleString()} {searchedEvents.length === 1 ? "event" : "events"}
              </span>
            )}
          </div>
          {nearMe && <NearMeLocationBar location={location} radius={nearMeRadius} onRadiusChange={setNearMeRadius} />}
          <CrossFade
            trigger={`${selectedSeasonIds.join(",")}|${selectedProgramIds.join(",")}|${selectedGrades.join(",")}|${selectedRegionKeys.join(",")}|${level}|${eventWindow}|${sort}|${pastSeasonDateDir}|${page}|${nearMe ? `${nearMeRadius}:${location.label ?? ""}` : ""}`}
          >
            {isPastSeasonView ? (
              <PastSeasonEventView
                events={searchedEvents}
                loading={loading}
                showSeason={!selectedSeasonIds.length || allSeasonsSelected}
                showGrade
                dateDir={pastSeasonDateDir}
                onDateDirToggle={() => setPastSeasonDateDir((d) => (d === "asc" ? "desc" : "asc"))}
              />
            ) : (
              <>
                <EventTable
                  events={pageEvents}
                  loading={loading}
                  showPriority
                  showGrade
                  showSeason={!selectedSeasonIds.length || allSeasonsSelected}
                  showDistance={nearMe && !!userCoords}
                  distanceFor={distanceFor}
                  emptyMessage={(() => {
                    const q = quickSearch.trim();
                    const looksLikeTeam = /^\d{1,5}[a-z]?$/i.test(q);
                    if (looksLikeTeam) {
                      return (
                        <>
                          No events match “{q}”. This looks like a team number — search by <strong>event name</strong>, or find the team on the{" "}
                          <Link href="/teams" className="empty-link">Teams</Link> page.
                        </>
                      );
                    }
                    if (q) {
                      return <>No events match “{q}”. Try a different name or clear the search.</>;
                    }
                    if (nearMe && userCoords) {
                      return (
                        <>
                          {userArea ? (
                            <>No events in {location.label ?? "that area"}. Pick another location above, or </>
                          ) : (
                            <>
                              No events within {nearMeRadius} mi of {location.label ?? "your location"}. Widen the radius above, or{" "}
                            </>
                          )}
                          <button type="button" className="empty-link" onClick={toggleNearMe}>turn off Near me</button>.
                        </>
                      );
                    }
                    return (
                      <>
                        No events match these filters. Try widening the region, time, or type filters — or{" "}
                        <button type="button" className="empty-link" onClick={resetFilters}>reset to defaults</button>.
                      </>
                    );
                  })()}
                />
                {!loading && (
                  <div className="pager">
                    <button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
                      <ChevronLeft size={16} />
                    </button>
                    <span>
                      Page {page.toLocaleString()} of {totalPages.toLocaleString()}
                    </span>
                    <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Next page">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </>
            )}
          </CrossFade>
        </Panel>
        {filterLayout === "sidebar" && (
          <aside className={`event-filter-sidebar ${mobileFiltersOpen ? "mobile-open" : ""}`}>
            <div className="event-filter-sidebar-title">
              <button
                type="button"
                className="event-filter-mobile-toggle"
                onClick={() => setMobileFiltersOpen((open) => !open)}
                aria-expanded={mobileFiltersOpen}
              >
                <ListFilter size={15} />
                <span>Filters</span>
                <ChevronDown size={15} className="event-filter-chevron" />
              </button>
              <span className="event-filter-title-text">Filters</span>
              <button type="button" className="reset-filters-btn" onClick={resetFilters}>Reset to defaults</button>
            </div>
            <div className="event-filter-body">{filterControls}</div>
          </aside>
        )}
      </div>
    </section>
  );
}

const TIER_COLLAPSE_THRESHOLD = 3;

function TierSection({
  label,
  events,
  collapsible,
  showSeason,
  showGrade,
  loading,
  dateSortDir,
  onDateSortToggle,
  paginate = false,
}: {
  label: string;
  events: Event[];
  collapsible: boolean;
  showSeason?: boolean;
  showGrade?: boolean;
  loading: boolean;
  dateSortDir?: "asc" | "desc";
  onDateSortToggle?: () => void;
  paginate?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 40;

  // Reset page when event list changes length (filter/sort change)
  const eventsLength = events.length;
  useEffect(() => { setPage(1); }, [eventsLength]);

  const totalPages = paginate ? Math.max(1, Math.ceil(events.length / pageSize)) : 1;
  const showFade = !paginate && collapsible && events.length > TIER_COLLAPSE_THRESHOLD && !expanded;
  const displayEvents = paginate
    ? events.slice((page - 1) * pageSize, page * pageSize)
    : showFade ? events.slice(0, TIER_COLLAPSE_THRESHOLD) : events;

  return (
    <div className="tier-section">
      <div className={`tier-collapse${showFade ? " is-collapsed" : ""}`}>
        <EventTable
          events={displayEvents}
          loading={loading}
          showSeason={showSeason}
          showGrade={showGrade}
          dateSortDir={dateSortDir}
          onDateSortToggle={onDateSortToggle}
          headerLabel={<>{label} <span className="tier-count">({events.length})</span></>}
        />
        {showFade && (
          <button className="alliance-show-all" onClick={() => setExpanded(true)}>
            Show all {events.length} <ChevronDown size={15} />
          </button>
        )}
        {collapsible && expanded && (
          <button className="alliance-show-all alliance-show-less" onClick={() => setExpanded(false)}>
            <ChevronUp size={18} />
          </button>
        )}
      </div>
      {paginate && totalPages > 1 && (
        <div className="pager">
          <span className="tier-pagination-note">Other Events only — top tiers use expand/collapse</span>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
            <ChevronLeft size={16} />
          </button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Next page">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function PastSeasonEventView({
  events,
  loading,
  showSeason,
  showGrade,
  dateDir,
  onDateDirToggle,
}: {
  events: Event[];
  loading: boolean;
  showSeason?: boolean;
  showGrade?: boolean;
  dateDir: "asc" | "desc";
  onDateDirToggle: () => void;
}) {
  const tiers: Array<{ label: string; category: EventCategory; collapsible: boolean; paginate: boolean }> = [
    { label: "World Championships", category: "Worlds", collapsible: true, paginate: false },
    { label: "Signature Events", category: "Signature", collapsible: true, paginate: false },
    { label: "Spotlight Events", category: "Spotlight", collapsible: true, paginate: false },
    { label: "Championships", category: "Championship", collapsible: true, paginate: false },
    { label: "Other Events", category: "Other", collapsible: false, paginate: true },
  ];

  return (
    <div className="past-season-view">
      {tiers.map((tier) => {
        const tierEvents = events
          .filter((e) => eventCategory(e).label === tier.category)
          .sort((a, b) => {
            const tA = new Date(a.start ?? 0).getTime();
            const tB = new Date(b.start ?? 0).getTime();
            return (dateDir === "desc" ? tB - tA : tA - tB) || a.name.localeCompare(b.name);
          });
        if (!loading && !tierEvents.length) return null;
        return (
          <TierSection
            key={tier.category}
            label={tier.label}
            events={tierEvents}
            collapsible={tier.collapsible}
            paginate={tier.paginate}
            showSeason={showSeason}
            showGrade={showGrade}
            loading={loading && !tierEvents.length}
            dateSortDir={dateDir}
            onDateSortToggle={onDateDirToggle}
          />
        );
      })}
    </div>
  );
}

function EventTable({
  events,
  loading,
  compact = false,
  showPriority = false,
  showSeason = false,
  showGrade = false,
  showProgram: showProgramProp,
  showDistance = false,
  distanceFor,
  headerLabel,
  dateSortDir,
  onDateSortToggle,
  emptyMessage,
}: {
  events: Event[];
  loading: boolean;
  compact?: boolean;
  showPriority?: boolean;
  showSeason?: boolean;
  showGrade?: boolean;
  showProgram?: boolean;
  showDistance?: boolean;
  distanceFor?: (event: Event) => number | null;
  headerLabel?: ReactNode;
  dateSortDir?: "asc" | "desc";
  onDateSortToggle?: () => void;
  emptyMessage?: ReactNode;
}) {
  const showProgram = showProgramProp ?? !compact;
  const gradesFor = useExactEventGrades(events, showGrade);
  const showLevel = !compact && !showPriority;
  const columnCount =
    3 +
    (showPriority ? 1 : 0) +
    (showProgram ? 1 : 0) +
    (showSeason ? 1 : 0) +
    (showLevel ? 1 : 0) +
    (showGrade ? 1 : 0) +
    (showDistance ? 1 : 0);

  return (
    <table className="event-table">
      <thead>
        <tr>
          <th className={headerLabel ? "event-col-group" : undefined}>{headerLabel ?? "Event"}</th>
          <th className="event-col-location">Location</th>
          {showPriority && <th className="event-col-priority">Priority</th>}
          {showProgram && <th className="event-col-program">Program</th>}
          {showGrade && <th className="grade-col">Grade</th>}
          {showSeason && <th className="event-col-season">Season</th>}
          <th className="event-col-dates">
            {onDateSortToggle ? (
              <button type="button" className="sort-col-btn" onClick={onDateSortToggle}>
                Dates {dateSortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            ) : (
              "Dates"
            )}
          </th>
          {showLevel && <th className="event-col-level">Level</th>}
          {showDistance && <th className="event-col-distance">Distance</th>}
        </tr>
      </thead>
      <TableBodySwap loading={loading} columns={columnCount}>
          {events.map((event) => (
            <tr key={event.id}>
              <td className="event-name-cell">
                {/* The clamp lives on this wrapper, never on the <a>: a clamped or
                    ellipsised anchor is a block box, and a block box is clickable
                    across its whole rectangle — including the blank space after a
                    short last line. Inline anchors are hit-tested per text line. */}
                <span className="event-name-clamp">
                  <Link href={eventPath(event)} className="event-name-link">
                    <TranslatedText text={event.name} country={event.location?.country} />
                  </Link>
                </span>
                <div className="muted event-sku-line">{event.sku}</div>
              </td>
              <td className="event-location-cell">
                {(() => {
                  const loc = eventLocationShort(event.location);
                  return loc ? <span className="event-location">{loc}</span> : <span className="muted">—</span>;
                })()}
              </td>
              {showPriority && (
                <td>
                  <span className={`event-priority priority-${eventCategory(event).rank}`}>{eventCategory(event).label}</span>
                </td>
              )}
              {showProgram && (
                <td>
                  <ProgramBadge program={event.program} />
                </td>
              )}
              {showGrade && (
                <td className="grade-col">
                  {(() => {
                    const codes = gradesFor(event);
                    if (!codes.length) return <span className="muted">—</span>;
                    const exact = hasExactEventGrade(event);
                    const label = codes.map((code) => GRADE_CODE_TO_FULL[code] ?? code).join(" + ");
                    return (
                      <span
                        className={`event-grade-badges${exact ? "" : " is-program-span"}`}
                        title={exact ? label : `${label} (this program's grade levels — exact level for this event not loaded)`}
                      >
                        {codes.map((code) => (
                          <span key={code} className={`event-grade-badge grade-${code}`}>{code}</span>
                        ))}
                      </span>
                    );
                  })()}
                </td>
              )}
              {showSeason && <td>{shortSeasonName(event.season.name)}</td>}
              <td className="event-date-cell">
                <span className="date-range">{formatEventDateRangeShort(event.start, event.end)}</span>
              </td>
              {showLevel && (
                <td>
                  <span className={`event-priority priority-${eventCategory(event).rank}`}>{eventCategory(event).label}</span>
                </td>
              )}
              {showDistance && (
                <td className="event-distance-cell">
                  {(() => {
                    const miles = distanceFor?.(event);
                    if (miles == null) return <span className="muted">—</span>;
                    return (
                      <span className="event-distance" title={`${Math.round(miles * 1.60934).toLocaleString()} km`}>
                        {Math.round(miles).toLocaleString()} mi
                      </span>
                    );
                  })()}
                </td>
              )}
            </tr>
          ))}
          {!events.length && (
            <tr>
              <td colSpan={columnCount}>
                <Empty>{emptyMessage ?? "No events found."}</Empty>
              </td>
            </tr>
          )}
      </TableBodySwap>
    </table>
  );
}

function TeamsPage() {
  const { profile } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [submittedSearch, setSubmittedSearch] = useState(params.get("search") ?? "");
  const debouncedQuickSearch = useDebouncedValue(search.trim(), 220);
  // Default the program from the last explicit choice (localStorage), else the
  // signed-in user's profile (applied via effect below since profile isn't loaded
  // synchronously on first render), else V5RC. "" (All) is a valid stored value.
  const [program, setProgram] = useState<string>(() => {
    try {
      const stored = localStorage.getItem("teamsProgram");
      if (stored !== null) return stored;
    } catch {
      // ignore storage failures (private mode, etc.)
    }
    return "1";
  });
  const programSeeded = useRef(false);
  // Captured once at mount — BEFORE the persist effect writes localStorage — so the
  // seed effect can tell whether the user had a genuine prior choice. (Reading
  // localStorage inside the seed effect would always see the value the persist
  // effect just wrote, defeating the profile-based default.)
  const [hadStoredProgram] = useState<boolean>(() => {
    try {
      return localStorage.getItem("teamsProgram") !== null;
    } catch {
      return false;
    }
  });
  const [selectedRegionKeys, setSelectedRegionKeys] = useState<string[]>([]);
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const regionMenuRef = useOutsideClick<HTMLDivElement>(() => setRegionMenuOpen(false));
  const [regionTab, setRegionTab] = useState<RegionOptionKind>("country");
  const [regionSearch, setRegionSearch] = useState("");
  const [registered, setRegistered] = useState("true");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<Team> | null>(null);
  const [quickData, setQuickData] = useState<Team[]>([]);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [teamView, setTeamView] = useState<"grid" | "list">(() => {
    if (typeof localStorage === "undefined") return "list";
    // Default to list; only honor an explicit prior "grid" choice.
    return localStorage.getItem("teamsView") === "grid" ? "grid" : "list";
  });
  const [skillsByTeam, setSkillsByTeam] = useState<Map<number, number>>(new Map());
  const [skillsLoading, setSkillsLoading] = useState(false);
  const seasonsAsync = useAsync(() => api.robotEventsSeasons({ per_page: 250 }), []);
  const programSeasonId = useMemo(() => {
    const pid = Number(program);
    if (!pid) return null;
    return (
      (seasonsAsync.data?.data ?? [])
        .filter(seasonHasData)
        .filter((season) => season.program?.id === pid)
        .sort((a, b) => b.id - a.id)[0]?.id ?? null
    );
  }, [seasonsAsync.data, program]);
  const reloadTeamsRef = useRef<() => void>(() => {});
  const cacheKey = cachedTeamsKey(program, registered, selectedRegionKeys);
  const committedSearch = submittedSearch.trim();
  const isSearchingTeams = !!committedSearch;
  // Re-ranks the search results once the profile's program/grade is known.
  const searchBias = useSearchBias();
  const countries = useAsync(() => api.robotEventsCountries(), []);
  const countryRegions = useAsync(() => api.robotEventsRegions(), []);
  const baseQuery = useMemo(
    () => ({
      "program[]": program ? [program] : undefined,
      registered: registered === "" ? undefined : registered,
    }),
    [program, registered],
  );
  const countryOptions = useMemo(() => dedupeCountryGroups(countries.data ?? []), [countries.data]);
  const countryById = useMemo(() => new Map(countryOptions.map((country) => [country.value, country])), [countryOptions]);
  // Region options come from the canonical RobotEvents countries/regions lists so
  // every region is selectable — not just those present in the currently loaded
  // teams. (Filtering itself still happens server-side via teams_light country[]/region[].)
  const regionOptions = useMemo<RegionOption[]>(() => {
    const countryItems = countryOptions.map((country) => ({
      key: optionKey("country", country.value),
      kind: "country" as const,
      label: country.label,
      badge: "Country",
      countryId: country.value,
      countryName: country.label,
    }));
    const subdivisionItems = (countryRegions.data ?? []).map((region) => {
      const country = countryById.get(region.country_id);
      return {
        key: optionKey("subdivision", region.id),
        kind: "subdivision" as const,
        label: country ? `${region.name}, ${country.label}` : region.name,
        badge: country?.country_id === "US" ? "State" : "State / Province",
        countryId: region.country_id,
        countryName: country?.label,
        regionName: region.name,
      };
    });
    return [...countryItems, ...subdivisionItems].sort((a, b) => a.label.localeCompare(b.label));
  }, [countryOptions, countryRegions.data, countryById]);
  const selectedRegionOptions = useMemo(
    () => regionOptions.filter((option) => selectedRegionKeys.includes(option.key)),
    [regionOptions, selectedRegionKeys],
  );
  // teams_light region[] and country[] AND together server-side, so a mix of whole
  // countries and individual states (or states across countries) can't be a single
  // request. Split into one query per country-group and union the results.
  const regionQueries = useMemo<Parameters<typeof api.teamsLight>[0][]>(() => {
    const countryNames = selectedRegionOptions
      .filter((option) => option.kind === "country" && option.countryName)
      .map((option) => option.countryName as string);
    const subdivisionsByCountry = new Map<string, string[]>();
    selectedRegionOptions
      .filter((option) => option.kind === "subdivision" && option.regionName)
      .forEach((option) => {
        const country = option.countryName ?? "";
        const list = subdivisionsByCountry.get(country) ?? [];
        list.push(option.regionName as string);
        subdivisionsByCountry.set(country, list);
      });
    const queries: Parameters<typeof api.teamsLight>[0][] = [];
    if (countryNames.length) queries.push({ ...baseQuery, "country[]": countryNames });
    subdivisionsByCountry.forEach((regions, country) => {
      queries.push({ ...baseQuery, "region[]": regions, ...(country ? { "country[]": [country] } : {}) });
    });
    return queries.length ? queries : [baseQuery];
  }, [baseQuery, selectedRegionOptions]);

  useEffect(() => {
    let live = true;
    // Set once the full set has been served, so the fast first-page paint below
    // never clobbers complete data if it happens to resolve later.
    let fullArrived = false;

    const loadTeams = async ({ background = false, force = false } = {}) => {
      setError(null);
      if (!background) setLoading(true);
      if (background) setRefreshing(true);

      try {
        const result = isSearchingTeams
          ? await searchTeamsTabTeams(committedSearch, regionQueries, program)
          : await loadCachedTeams(cacheKey, regionQueries, force);

        fullArrived = true;
        if (live) {
          setData(result);
          if (!isSearchingTeams) setLastUpdated(teamListCache.get(cacheKey)?.updatedAt ?? Date.now());
        }
      } catch (err) {
        if (live) setError((err as Error).message);
      } finally {
        if (live) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    reloadTeamsRef.current = () => {
      void loadTeams({ background: true, force: true });
    };

    if (isSearchingTeams) {
      loadTeams();
      return () => {
        live = false;
      };
    }

    (async () => {
      let cached = teamListCache.get(cacheKey);
      // Hydrate the in-memory cache from IndexedDB so a reload shows data instantly.
      // Guard the read: an IndexedDB failure must not skip the fetch below and
      // leave `loading` stuck on (a permanent skeleton).
      if (!cached?.data) {
        try {
          const stored = await idbGetTeams(cacheKey);
          if (stored?.data) {
            teamListCache.set(cacheKey, stored);
            cached = stored;
          }
        } catch { /* fall through to a live fetch */ }
      }

      if (cached?.data && live) {
        setData(cached.data);
        setLastUpdated(cached.updatedAt || null);
        setLoading(false);
      }

      const cacheAge = cached?.updatedAt ? Date.now() - cached.updatedAt : Number.POSITIVE_INFINITY;
      if (!cached?.data || cacheAge >= teamCacheRefreshMs) {
        // Cold load (nothing cached to show): paint a fast first page while the full
        // set fetches. `fullArrived` guards against a late first-page overwriting it.
        if (!cached?.data) {
          void fetchTeamsLightFirstPage(regionQueries)
            .then((first) => {
              if (live && !fullArrived) {
                setData(first);
                setLoading(false);
              }
            })
            .catch(() => {
              /* full fetch below is the source of truth; ignore first-page failure */
            });
        }
        void loadTeams({ background: !!cached?.data });
      } else if (live) {
        // Fresh cache, no fetch scheduled — make sure loading is cleared even on
        // the no-`cached.data` edge so we never sit on a stale skeleton.
        setLoading(false);
      }
    })();

    const interval = window.setInterval(() => void loadTeams({ background: true }), teamCacheRefreshMs);

    return () => {
      live = false;
      window.clearInterval(interval);
    };
  }, [cacheKey, committedSearch, isSearchingTeams, page, program, regionQueries]);

  const cachedTeams = teamListCache.get(cacheKey)?.data?.data;
  const quickSourceTeams = cachedTeams ?? (!isSearchingTeams ? data?.data : []) ?? [];
  const regionButtonLabel =
    selectedRegionOptions.length === 0
      ? "All regions"
      : selectedRegionOptions.length === 1
        ? selectedRegionOptions[0].label
        : `${selectedRegionOptions.length} regions`;
  const visibleRegionOptions = regionOptions.filter((option) => {
    if (option.kind !== regionTab) return false;
    const needle = regionSearch.trim().toLowerCase();
    if (!needle) return true;
    return [option.label, option.badge, option.countryName, option.regionName, option.vexLabel].filter(Boolean).join(" ").toLowerCase().includes(needle);
  });
  const toggleRegion = (key: string) => {
    setSelectedRegionKeys((keys) => (keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key]));
    setPage(1);
  };
  const clearRegions = () => {
    setSelectedRegionKeys([]);
    setPage(1);
  };

  const localQuickResults = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    // Region is filtered server-side via teams_light, so quickSourceTeams (the
    // cached browse set) is already scoped to the selected regions — no client filter.
    return rankTeamsForSearch(
      quickSourceTeams.filter((team) => {
        const haystack = [team.number, team.team_name, team.organization, team.grade, team.registered ? "registered" : "inactive", locationLine(team)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      }),
      search,
    );
  }, [quickSourceTeams, search, searchBias]);

  const quickResults = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return rankTeamsForSearch(
      uniqueTeams([...localQuickResults, ...quickData]).filter((team) => {
        const haystack = [team.number, team.team_name, team.organization, team.grade, team.registered ? "registered" : "inactive", locationLine(team)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      }),
      search,
    );
  }, [localQuickResults, quickData, search, searchBias]);

  const sortedTeams = useMemo(() => [...(data?.data ?? [])].sort(isSearchingTeams ? compareTeamsForSearch(committedSearch) : compareTeamsNatural), [committedSearch, data, isSearchingTeams, searchBias]);

  const tableTeams = useMemo(
    () => (isSearchingTeams ? sortedTeams : data?.data ?? []),
    [data, isSearchingTeams, sortedTeams],
  );

  useEffect(() => {
    setPage(1);
  }, [submittedSearch, program, selectedRegionKeys, registered]);

  useEffect(() => {
    if (selectedRegionKeys.length && regionOptions.length) {
      const availableKeys = new Set(regionOptions.map((option) => option.key));
      setSelectedRegionKeys((keys) => keys.filter((key) => availableKeys.has(key)));
    }
  }, [selectedRegionKeys, regionOptions]);

  useEffect(() => {
    if (!search.trim()) setQuickData([]);
  }, [search]);

  useEffect(() => {
    try {
      localStorage.setItem("teamsView", teamView);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, [teamView]);

  useEffect(() => {
    try {
      localStorage.setItem("teamsProgram", program);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, [program]);

  // Seed the program from the signed-in user's profile once, only when the user
  // hasn't already made an explicit choice (no stored value) — a returning user's
  // last pick (localStorage) takes precedence over their profile default.
  useEffect(() => {
    if (programSeeded.current) return;
    if (hadStoredProgram) {
      programSeeded.current = true;
      return;
    }
    if (profile?.team_program) {
      setProgram(profile.team_program);
      programSeeded.current = true;
    }
  }, [profile, hadStoredProgram]);

  // World Skills scores load in the background after the team list, keyed by the
  // current program's season + grade levels. The table shows a skeleton until the
  // map arrives. Results are session-cached (loadWorldSkills) so this is cheap.
  useEffect(() => {
    const grades = (GRADES_BY_PROGRAM[program] ?? []).map((code) => GRADE_CODE_TO_FULL[code]).filter(Boolean);
    if (!programSeasonId || !grades.length) {
      setSkillsByTeam(new Map());
      setSkillsLoading(false);
      return;
    }
    let live = true;
    setSkillsLoading(true);
    Promise.all(grades.map((grade) => loadWorldSkills(programSeasonId, grade).catch(() => [] as WorldSkillsEntry[])))
      .then((lists) => {
        if (!live) return;
        const map = new Map<number, number>();
        for (const list of lists) {
          for (const entry of list) {
            if (entry.team?.id != null) map.set(entry.team.id, entry.scores?.score ?? 0);
          }
        }
        setSkillsByTeam(map);
      })
      .finally(() => {
        if (live) setSkillsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [programSeasonId, program]);

  useEffect(() => {
    let live = true;
    const needle = debouncedQuickSearch.trim();
    if (!needle) {
      setQuickData([]);
      setQuickLoading(false);
      return () => {
        live = false;
      };
    }

    // The cached team list already renders instantly via localQuickResults. If the
    // query is a *complete* team number (e.g. "10B", "99999P") and the cached list
    // already holds that exact team, that row is authoritative — skip the network
    // round-trip entirely. Anything else (a general "10", or a complete number not
    // in cache) still fires teamSearch to fill in the rest.
    const isCompleteNumber = /^\d{1,5}[a-z]$/i.test(needle);
    if (isCompleteNumber) {
      const target = normalizedTeamQuery(needle);
      const cached = teamListCache.get(cacheKey)?.data?.data ?? [];
      if (cached.some((team) => normalizedTeamQuery(team.number) === target)) {
        setQuickData([]);
        setQuickLoading(false);
        return () => {
          live = false;
        };
      }
    }

    setQuickLoading(true);
    searchTeamsTabTeams(needle, regionQueries, program)
      .then((result) => {
        if (live) setQuickData(result.data);
      })
      .catch(() => {
        if (live) setQuickData([]);
      })
      .finally(() => {
        if (live) setQuickLoading(false);
      });

    return () => {
      live = false;
    };
  }, [debouncedQuickSearch, program, regionQueries, cacheKey]);

  const submitSearch = () => {
    const nextSearch = search.trim();
    setSubmittedSearch(nextSearch);
    setPage(1);
    setQuickOpen(false);
    const nextParams = new URLSearchParams(window.location.search);
    if (nextSearch) nextParams.set("search", nextSearch);
    else nextParams.delete("search");
    const nextUrl = `${window.location.pathname}${nextParams.toString() ? `?${nextParams.toString()}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  };

  return (
    <section className="page">
      <PageTitle icon={<Users />} title="Teams" />
      <SearchFilters
        search={search}
        setSearch={(value) => {
          setSearch(value);
          setQuickOpen(!!value.trim());
        }}
        onSubmit={submitSearch}
        onFocus={() => setQuickOpen(!!search.trim())}
        program={program}
        setProgram={(value) => {
          setProgram(value);
          setPage(1);
        }}
        placeholder="Search team number, name, or region"
        quickResults={quickResults}
        quickLoading={quickLoading}
        quickOpen={quickOpen}
        onPickTeam={(team) => {
          navigate(teamPath(team));
        }}
        regionControl={
          <div className="team-region-filter picker-menu" ref={regionMenuRef}>
            <button type="button" className="team-region-trigger" onClick={() => setRegionMenuOpen((open) => !open)} aria-expanded={regionMenuOpen}>
              <MapPin size={14} />
              <span>{regionButtonLabel}</span>
            </button>
            {regionMenuOpen && (
              <div className="picker-menu-list region-menu-list team-region-menu-list">
                <div className="picker-tabs">
                  <button type="button" className={regionTab === "country" ? "active" : ""} onClick={() => setRegionTab("country")}>
                    Countries
                  </button>
                  <button type="button" className={regionTab === "subdivision" ? "active" : ""} onClick={() => setRegionTab("subdivision")}>
                    State / Province
                  </button>
                </div>
                <input className="picker-search" value={regionSearch} onChange={(event) => setRegionSearch(event.target.value)} placeholder="Search regions" />
                <div className="picker-menu-actions">
                  <button type="button" onClick={clearRegions}>
                    Clear
                  </button>
                </div>
                <div className="region-option-list">
                  {visibleRegionOptions.map((option) => (
                    <label key={option.key}>
                      <input type="checkbox" checked={selectedRegionKeys.includes(option.key)} onChange={() => toggleRegion(option.key)} />
                      <span>{option.label}</span>
                      <small>{option.badge}</small>
                    </label>
                  ))}
                </div>
                {!visibleRegionOptions.length && <div className="picker-menu-empty">No matches.</div>}
              </div>
            )}
          </div>
        }
      >
        <select
          value={registered}
          onChange={(event) => {
            setRegistered(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Any Status</option>
          <option value="true">Registered</option>
          <option value="false">Inactive</option>
        </select>
      </SearchFilters>
      <Panel
        title="Team List"
        icon={<Users />}
        action={
          <span className="teams-list-controls">
            <div className="team-view-toggle" role="group" aria-label="Team list view">
              <button
                type="button"
                className={teamView === "grid" ? "active" : ""}
                onClick={() => setTeamView("grid")}
                title="Grid view"
                aria-label="Grid view"
                aria-pressed={teamView === "grid"}
              >
                <LayoutGrid size={14} />
                {teamView === "grid" && <SlideIndicator id="team-view" variant="pill" />}
              </button>
              <button
                type="button"
                className={teamView === "list" ? "active" : ""}
                onClick={() => setTeamView("list")}
                title="List view"
                aria-label="List view"
                aria-pressed={teamView === "list"}
              >
                <List size={14} />
                {teamView === "list" && <SlideIndicator id="team-view" variant="pill" />}
              </button>
            </div>
            {!isSearchingTeams && (
              <span className="teams-cache-controls">
                {lastUpdated && <span className="teams-cache-time">Updated {formatRelativeTime(lastUpdated)}</span>}
                <CompareModeButton />
                <button
                  type="button"
                  className="teams-reload-btn"
                  onClick={() => reloadTeamsRef.current()}
                  disabled={refreshing}
                  title="Reload team list now"
                >
                  <RotateCw size={13} className={refreshing ? "spin" : ""} />
                  {refreshing ? "Reloading..." : "Reload"}
                </button>
              </span>
            )}
          </span>
        }
      >
        <Status loading={loading} error={error} />
        {refreshing && !loading && <div className="notice subtle">Updating cached teams...</div>}
        {teamView === "grid" ? (
          <TeamGrid teams={tableTeams} loading={loading} localPageSize={50} />
        ) : (
          <TeamTable
            teams={tableTeams}
            loading={loading}
            localPageSize={50}
            splitName
            skills={{
              scoreByTeam: skillsByTeam,
              // Show the skeleton while seasons resolve and skills fetch, but only
              // for programs that actually have a World Skills leaderboard.
              loading: (GRADES_BY_PROGRAM[program] ?? []).length > 0 && (seasonsAsync.loading || skillsLoading),
            }}
          />
        )}
      </Panel>
    </section>
  );
}

function TeamTable({ teams, loading, localPageSize, eventId, sharedTeamId, divisionMap, splitName = false, skills }: { teams: Team[]; loading: boolean; localPageSize?: number; eventId?: number; sharedTeamId?: string; divisionMap?: Map<number, string> | null; splitName?: boolean; skills?: { scoreByTeam: Map<number, number>; loading: boolean } }) {
  const [page, setPage] = useState(1);
  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null);
  const compareMode = useComparePickMode();
  const quickViewFirst = useQuickViewFirst();
  const totalPages = localPageSize ? Math.max(1, Math.ceil(teams.length / localPageSize)) : 1;
  const visibleTeams = localPageSize ? teams.slice((page - 1) * localPageSize, page * localPageSize) : teams;
  // Picklist action only in the event + shared team context; hidden in the global /teams directory.
  const showPicklist = Boolean(sharedTeamId && eventId);
  const colCount = 8 + (splitName ? 1 : 0) + (skills ? 1 : 0) + (showPicklist ? 1 : 0);

  useEffect(() => {
    setPage(1);
    setExpandedTeamId(null);
  }, [teams, localPageSize]);

  return (
    <>
      <ComparePickHint />
      <table className={`team-table${splitName || skills ? " team-table-dir" : ""}`}>
        <thead>
          <tr>
            <th>Team</th>
            {splitName && <th>Name</th>}
            <th>Program</th>
            <th>Level</th>
            <th>Organization</th>
            <th>Location</th>
            {skills && <th className="team-skills-col">Skills</th>}
            <th>
              {divisionMap
                ? "Division"
                : <span className="status-disclaimer" data-tooltip="Push Back Season registration status. Override registrations will be updated soon.">Status</span>
              }
            </th>
            <th className="quick-look-col"></th>
            <th className="compare-col">Compare</th>
            {showPicklist && <th className="picklist-col">Picklist</th>}
          </tr>
        </thead>
        <TableBodySwap loading={loading} columns={colCount}>
            {visibleTeams.map((team) => {
              const expanded = expandedTeamId === team.id;
              return (
                <Fragment key={team.id}>
                  <tr key={team.id} className={`team-row${compareMode ? " compare-pick-row" : ""}`} onClick={(e) => {
                    if (compareMode) return;
                    // Quick view only inside an event (Teams tab); the /teams list navigates.
                    if (quickViewFirst && _currentEventId != null) {
                      openQuickView({ teamId: team.id, teamNumber: team.number, programCode: programSlug(team.program), teamName: team.team_name, pointerSide: pointerSideFromEvent(e) });
                    } else {
                      navigate(teamPath(team));
                    }
                  }}>
                    <td className="team-cell truncate-cell">
                      <CompareTeamLink
                        teamId={team.id}
                        teamNumber={team.number}
                        programCode={programSlug(team.program)}
                        teamName={team.team_name}
                        className="team-number"
                      />
                      {!splitName && team.team_name && (
                        <TranslatedText text={team.team_name} country={team.location?.country} />
                      )}
                    </td>
                    {splitName && (
                      <td className="truncate-cell team-name-cell">
                        {team.team_name ? <TranslatedText text={team.team_name} country={team.location?.country} /> : "—"}
                      </td>
                    )}
                    <td>
                      <ProgramBadge program={team.program} />
                    </td>
                    <td>
                      <GradeBadge grade={team.grade} />
                    </td>
                    <td className="truncate-cell">
                      {team.organization ? <TranslatedText text={team.organization} country={team.location?.country} /> : "-"}
                    </td>
                    <td className="truncate-cell">{locationLine(team)}</td>
                    {skills && (
                      <td className="team-skills-col">
                        {skills.loading ? (
                          <Skeleton className="h-3.5 w-9" />
                        ) : skills.scoreByTeam.has(team.id) ? (
                          <span className="team-skills-score">{skills.scoreByTeam.get(team.id)}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    )}
                    <td>{divisionMap ? (divisionMap.get(team.id) ?? "—") : (team.registered ? "Registered" : "Inactive")}</td>
                    <td
                      className="quick-look-col"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedTeamId(expanded ? null : team.id);
                      }}
                    >
                      <button type="button" className={`quick-look-btn${expanded ? " active" : ""}`} title="Quick look" aria-label={`Quick look for ${team.number}`}>
                        <Eye size={14} />
                      </button>
                    </td>
                    <td className="compare-col" onClick={(e) => e.stopPropagation()}>
                      <CompareRowBtn
                        teamId={team.id}
                        teamNumber={team.number}
                        programCode={programSlug(team.program)}
                        teamName={team.team_name ?? undefined}
                      />
                    </td>
                    {showPicklist && (
                      <td className="picklist-col" onClick={(e) => e.stopPropagation()}>
                        <PicklistRowBtn
                          sharedTeamId={sharedTeamId!}
                          eventId={String(eventId)}
                          teamId={String(team.id)}
                          teamNumber={team.number}
                          teamName={team.team_name ?? undefined}
                        />
                      </td>
                    )}
                  </tr>
                  {expanded && (
                    <tr key={`${team.id}-details`} className="team-detail-row">
                      <td colSpan={colCount}>
                        <div className="team-detail-content">
                          <div className="team-detail-top">
                            <div>
                              <div>
                                <strong>{team.number}</strong>
                                {team.team_name && (
                                  <span> - <TranslatedText text={team.team_name} country={team.location?.country} /></span>
                                )}
                              </div>
                              <div>
                                {team.organization
                                  ? <TranslatedText text={team.organization} country={team.location?.country} />
                                  : "No organization listed"}
                              </div>
                              <div>
                                {locationLine(team)} · {team.grade ?? "Grade unknown"} · {team.registered ? "Registered" : "Inactive"}
                              </div>
                            </div>
                            <button className="quick-look-close" onClick={() => setExpandedTeamId(null)}>✕</button>
                          </div>
                          <TeamRowMatchesPreview teamId={team.id} eventId={eventId} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!teams.length && (
              <tr>
                <td colSpan={colCount}>
                  <Empty>No teams found.</Empty>
                </td>
              </tr>
            )}
        </TableBodySwap>
      </table>
      {!loading && localPageSize && (
        <div className="pager-with-total">
          <span>{teams.length.toLocaleString()} teams loaded</span>
          <LocalPager page={page} totalPages={totalPages} onPage={setPage} />
        </div>
      )}
    </>
  );
}

function TeamGrid({ teams, loading, localPageSize }: { teams: Team[]; loading: boolean; localPageSize?: number }) {
  const [page, setPage] = useState(1);
  const compareMode = useComparePickMode();
  const totalPages = localPageSize ? Math.max(1, Math.ceil(teams.length / localPageSize)) : 1;
  const visibleTeams = localPageSize ? teams.slice((page - 1) * localPageSize, page * localPageSize) : teams;

  useEffect(() => {
    setPage(1);
  }, [teams, localPageSize]);

  return (
    <>
      <ComparePickHint />
      <LoadingSwap
        loading={loading}
        skeleton={
          <div className="team-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="team-card team-card-skeleton">
                <div className="team-card-top">
                  <Skeleton className="h-6 w-16" />
                  <div className="team-card-id">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        }
      >
        {!teams.length ? (
          <div className="team-grid-empty">
            <Empty>No teams found.</Empty>
          </div>
        ) : (
          <div className="team-grid">
            {visibleTeams.map((team) => (
              <TeamCard key={team.id} team={team} compareMode={compareMode} />
            ))}
          </div>
        )}
      </LoadingSwap>
      {!loading && localPageSize && (
        <div className="pager-with-total">
          <span>{teams.length.toLocaleString()} teams loaded</span>
          <LocalPager page={page} totalPages={totalPages} onPage={setPage} />
        </div>
      )}
    </>
  );
}

function TeamCard({ team, compareMode }: { team: Team; compareMode: boolean }) {
  const programCode = programSlug(team.program);
  return (
    <div
      className={`team-card${compareMode ? " compare-pick-card" : ""}`}
      onClick={() => {
        if (compareMode) return;
        navigate(teamPath(team));
      }}
    >
      <div className="team-card-top">
        <CompareTeamLink
          teamId={team.id}
          teamNumber={team.number}
          programCode={programCode}
          teamName={team.team_name}
          className="team-card-num"
        />
        <div className="team-card-id">
          {team.team_name && (
            <TranslatedText className="team-card-name" text={team.team_name} country={team.location?.country} />
          )}
          <span className="team-card-org">
            {team.organization
              ? <TranslatedText text={team.organization} country={team.location?.country} />
              : "No organization listed"}
          </span>
        </div>
        <span className="team-card-compare" onClick={(e) => e.stopPropagation()}>
          <CompareRowBtn
            teamId={team.id}
            teamNumber={team.number}
            programCode={programCode}
            teamName={team.team_name ?? undefined}
          />
        </span>
      </div>
      <div className="team-card-foot">
        <span className="team-card-loc" title={locationLine(team)}>
          {locationLine(team)}
          {team.grade ? ` · ${gradeCode(team.grade)}` : ""}
        </span>
        <span
          className={`team-card-status${team.registered ? " ok" : ""}`}
          title={team.registered ? "Registered" : "Inactive"}
        />
        <ProgramBadge program={team.program} />
      </div>
    </div>
  );
}

function TeamRowMatchesPreview({ teamId, eventId }: { teamId: number; eventId?: number }) {
  const { data, loading, error } = useAsync(
    async () => {
      if (eventId) return api.teamMatches(teamId, { "event[]": [eventId], per_page: 250, page: 1 });

      const firstPage = await api.teamMatches(teamId, { per_page: 50, page: 1 });
      const lastPage = firstPage.meta.last_page;
      const pages = [lastPage - 1, lastPage].filter((page, index, allPages) => page > 1 && allPages.indexOf(page) === index);
      const recentPages = pages.length ? await Promise.all(pages.map((page) => api.teamMatches(teamId, { per_page: 50, page }))) : [];
      const matches = uniqueMatches([firstPage, ...recentPages].flatMap((page) => page.data))
        .sort((a, b) => matchTimestampMs(b) - matchTimestampMs(a) || compareMatchesDisplay(b, a))
        .slice(0, 6);

      return { ...firstPage, data: matches };
    },
    [teamId, eventId],
  );
  const matches = data?.data ?? [];
  // No parent Event object here (matches are fetched directly), so infer multi-
  // division per event from the team's own matches: if the team's matches at an
  // event span more than one division, tag them so cross-division play is clear.
  const multiDivisionEventIds = useMemo(() => {
    const byEvent = new Map<number, Set<number>>();
    for (const match of matches) {
      const divs = byEvent.get(match.event.id) ?? new Set<number>();
      if (match.division?.id != null) divs.add(match.division.id);
      byEvent.set(match.event.id, divs);
    }
    return new Set([...byEvent].filter(([, divs]) => divs.size > 1).map(([id]) => id));
  }, [matches]);

  if (loading) return <div className="muted">Loading matches...</div>;
  if (error) return <div className="muted">Could not load matches.</div>;
  if (!matches.length) return <div className="muted">{eventId ? "No matches in this event." : "No recent matches."}</div>;

  return (
    <div className="team-preview-matches">
      <div className="team-preview-title">{eventId ? "Event matches" : "Recent matches"}</div>
      <table>
        <tbody>
          {matches.map((match) => {
            const { red, blue, redScore, blueScore, winner } = matchWinner(match);
            return (
              <tr key={match.id}>
                <td>
                  <Link href={`/event/${match.event.code ?? match.event.id}`}>
                    {/* `match.event` is an IdInfo (id/name/code) with no location, so
                        there is no country to pass. Script detection still catches CJK
                        and Cyrillic here; only Latin-script names go untranslated. */}
                    <TranslatedText text={match.event.name} />
                  </Link>
                  <span className="muted inline-muted">{match.name}</span>
                  <DivisionTag match={match} multiDivision={multiDivisionEventIds.has(match.event.id)} />
                </td>
                <td>
                  <AllianceTeamLinks teams={red?.teams} focusTeamId={teamId} />
                </td>
                <td className="score-cell">
                  <FocusScorePair match={match} focusTeamId={teamId} redScore={redScore} blueScore={blueScore} winner={winner} />
                </td>
                <td>
                  <AllianceTeamLinks teams={blue?.teams} focusTeamId={teamId} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SearchFilters({
  search,
  setSearch,
  onSubmit,
  onFocus,
  program,
  setProgram,
  placeholder,
  quickResults,
  quickLoading,
  quickOpen,
  onPickTeam,
  regionControl,
  children,
}: {
  search: string;
  setSearch: (value: string) => void;
  onSubmit: () => void;
  onFocus: () => void;
  program: string;
  setProgram: (value: string) => void;
  placeholder: string;
  quickResults: Team[];
  quickLoading: boolean;
  quickOpen: boolean;
  onPickTeam: (team: Team) => void;
  regionControl: ReactNode;
  children?: ReactNode;
}) {
  const [visibleCount, setVisibleCount] = useState(20);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset visible count when the result set changes (new search query)
  useEffect(() => {
    setVisibleCount(20);
  }, [quickResults]);

  // "/" focuses the team search (mirrors the kbd hint), unless already typing.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement | null)?.isContentEditable) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleQuickScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      setVisibleCount((c) => c + 20);
    }
  }, []);

  const visibleResults = quickResults.slice(0, visibleCount);
  const hasMore = quickResults.length > visibleCount;

  return (
    <form
      className="filters team-filters"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="team-search-wrap">
        <label>
          <Search size={16} />
          <input
            ref={inputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onFocus={onFocus}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
                return;
              }
              if (event.key === "Escape") {
                event.currentTarget.blur();
              }
            }}
            placeholder={placeholder}
          />
          {!search && (
            <kbd className="team-search-kbd" aria-hidden="true">/</kbd>
          )}
        </label>
        {quickOpen && !!search.trim() && (
          <div className="team-quick-results">
            <div
              ref={scrollRef}
              className={quickResults.length > 5 ? "team-quick-scroll" : undefined}
              onScroll={handleQuickScroll}
            >
              {visibleResults.map((team) => (
                <button type="button" key={team.id} onMouseDown={(event) => event.preventDefault()} onClick={() => onPickTeam(team)}>
                  <span>
                    <strong>{team.number}</strong>
                    {team.team_name && (
                      <span> - <TranslatedText text={team.team_name} country={team.location?.country} /></span>
                    )}
                  </span>
                  <small>{[team.program?.name, team.grade, locationLine(team)].filter(Boolean).join(" · ")}</small>
                </button>
              ))}
              {quickLoading && !quickResults.length && <div className="team-quick-empty">Searching...</div>}
              {!quickLoading && !quickResults.length && <div className="team-quick-empty">No quick matches.</div>}
            </div>
            {hasMore && (
              <div className="team-quick-more-hint" aria-hidden="true">
                Scroll to see more ↓
              </div>
            )}
          </div>
        )}
      </div>
      <div className="team-prog-seg" role="group" aria-label="Program">
        {programOptions.map((option) => (
          <button
            key={option.value || "all"}
            type="button"
            className={program === option.value ? "active" : ""}
            aria-pressed={program === option.value}
            onClick={() => setProgram(option.value)}
          >
            {option.value === "" ? "All" : option.label}
            {program === option.value && <SlideIndicator id="team-prog" variant="pill" />}
          </button>
        ))}
      </div>
      {regionControl}
      {children}
    </form>
  );
}

function PageTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="page-title">
      <h1>
        {icon}
        {title}
      </h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

const EVENT_DETAIL_TABS = ["matches", "rankings", "skills", "awards", "teams", "team-matches", "picklist", "info"] as const;
type EventDetailTab = typeof EVENT_DETAIL_TABS[number];
const TEAM_DETAIL_TABS = ["about", "events", "rankings", "skills", "awards"] as const;
type TeamDetailTab = typeof TEAM_DETAIL_TABS[number];

// Clean, count-free labels for the breadcrumb tail (the live tab bars carry
// counts like "Teams 42" and dynamic text we don't want in a crumb).
const EVENT_TAB_CRUMB: Record<EventDetailTab, string> = {
  info: "Info",
  matches: "Results",
  rankings: "Rankings",
  skills: "Skills",
  awards: "Awards",
  teams: "Teams",
  "team-matches": "Team Matches",
  picklist: "Picklist",
};
const TEAM_TAB_CRUMB: Record<TeamDetailTab, string> = {
  about: "About",
  events: "Events",
  rankings: "Rankings",
  skills: "Skills",
  awards: "Awards",
};

function eventInitialTab(hasFocusTeam: boolean): EventDetailTab {
  const fallback: EventDetailTab = hasFocusTeam ? "team-matches" : "matches";
  const hash = hashTab(EVENT_DETAIL_TABS, fallback);
  return hash === "team-matches" && !hasFocusTeam ? "matches" : hash;
}

function EventDetail({ param }: { param: string }) {
  const [focusTeam, setFocusTeam] = useState<{ id: number; number: string } | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const teamId = params.get("focusTeam");
    const teamNum = params.get("focusTeamNum");
    if (teamId && teamNum) return { id: Number(teamId), number: decodeURIComponent(teamNum) };
    return null;
  });
  const [tab, setTab] = useState<EventDetailTab>(() => eventInitialTab(!!new URLSearchParams(window.location.search).get("focusTeam")));
  // Match to scroll to + flash when deep-linked from a scouting note. Read once
  // then stripped from the URL so refresh/scroll-restore doesn't re-trigger it.
  const [focusMatchId, setFocusMatchId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const match = params.get("match");
    if (match) {
      params.delete("match");
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    }
    return match;
  });
  const [selectedDivision, setSelectedDivision] = useState<number | null>(null);
  const [teamsDivFilter, setTeamsDivFilter] = useState<number | null>(null);
  const [playback, setPlayback] = useState<MatchPlayback | null>(null);
  const [teamSearch, setTeamSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const sharedTeams = useSharedTeams();
  const primarySharedTeam = sharedTeams[0] ?? null;
  const lookup = useAsync(async () => {
    if (allDigits(param)) return api.event(param);
    const res = await api.events({ "sku[]": param, per_page: 1 });
    return res.data[0] ?? null;
  }, [param]);
  const event = lookup.data ?? null;
  const loading = lookup.loading;
  const error = lookup.error ?? (!loading && !event ? "Event not found" : null);
  // Which focus id has already had its scroll+flash "spent". Recorded in a ref (not
  // state) so recording it never re-renders / cancels the in-flight scroll. Gating
  // the id passed to the Results table on this makes the jump fire exactly once —
  // leaving and returning to the tab won't repeat it.
  const consumedMatchRef = useRef<string | null>(null);
  // Jump from the team score chart to that match on the Results tab: switch tabs,
  // set the one-shot focus id, and sync the hash so the tab bar reflects it.
  const jumpToResultsMatch = useCallback(
    (matchId: number) => {
      consumedMatchRef.current = null; // re-arm so pressing Enter again re-jumps
      setFocusMatchId(String(matchId));
      setTab("matches");
      if (event) window.history.replaceState(null, "", urlWithHash(eventPath(event), "matches"));
    },
    [event],
  );
  const activeFocusMatchId = focusMatchId && focusMatchId !== consumedMatchRef.current ? focusMatchId : null;
  // Switch tabs while preserving the current URL (keeps ?focusTeam so the team tab
  // stays available); used by the "See all" links on the team cards.
  const goToTab = useCallback((t: EventDetailTab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.hash = t;
    window.history.replaceState(null, "", url.toString());
  }, []);
  const id = event ? String(event.id) : "";
  const divisions = useMemo(() => [...(event?.divisions ?? [])].sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id)), [event]);
  const division = selectedDivision ?? divisions[0]?.id ?? 1;
  // While the event is live, silently re-poll the data that changes during
  // competition (matches, rankings, skills, awards) so it updates without a reload.
  const liveRefresh = event && eventIsLive(event) ? liveEventRefreshMs : 0;
  // Staggered fetch priority to avoid a thundering herd (and 429s) on mount.
  // matches/teams (and the focus-team view below) load immediately; everything
  // else is deferred in ~0.5s tiers so the API isn't hit with ~8 parallel
  // requests at once.
  const matches = useAsync(
    async () => {
      if (!event) return null;
      return collectAllPages<Match>((page) => api.eventMatches(id, division, { per_page: 250, page }));
    },
    [id, division, event?.id],
    0,
    liveRefresh,
  );
  const teams = useAsync(
    async () => {
      if (!event) return null;
      return collectAllPages<Team>((page) => api.eventTeams(id, { per_page: 250, page }));
    },
    [id, event?.id],
  );
  const rankings = useAsync(
    async () => {
      if (!event) return null;
      return collectAllPages<Ranking>((page) => api.eventRankings(id, division, { per_page: 250, page }));
    },
    [id, division, event?.id],
    500,
    liveRefresh,
  );
  const awards = useAsync(
    async () => {
      if (!event) return null;
      return collectAllPages<Award>((page) => api.eventAwards(id, { per_page: 250, page }));
    },
    [id, event?.id],
    500,
    liveRefresh,
  );
  const skills = useAsync(
    async () => {
      if (!event) return null;
      return collectAllPages<Skill>((page) => api.eventSkills(id, { per_page: 250, page }));
    },
    [id, event?.id],
    1000,
    liveRefresh,
  );
  // For multi-division events: load rankings for every division in parallel so we
  // can map each team to its division on the Teams tab.
  const allDivisionRankings = useAsync(
    async () => {
      if (!event || divisions.length <= 1) return null;
      const results = await Promise.all(
        divisions.map((div) => collectAllPages<Ranking>((page) => api.eventRankings(id, div.id, { per_page: 250, page }))),
      );
      const map = new Map<number, number>(); // teamId → divisionId
      divisions.forEach((div, i) => {
        for (const r of results[i].data) map.set(r.team.id, div.id);
      });
      return map;
    },
    [id, event?.id, divisions],
    1000,
  );
  const preset = useAsync(
    async () => {
      if (!event) return null;
      return api.jumperPresetEventExists(event.sku);
    },
    [event?.sku],
    1500,
  );
  const matchTimestamps = useAsync(
    async () => {
      if (!event || !preset.data?.exists) return null;
      return api.jumperMatchTimestamps(event.sku, { offsetSeconds: -5 });
    },
    [event?.sku, preset.data?.exists],
  );

  const focusTeamEventMatches = useAsync(
    async () => {
      if (!focusTeam || !event) return null;
      return collectAllPages<Match>((page) => api.teamMatches(focusTeam.id, { "event[]": [Number(id)], per_page: 250, page }));
    },
    [focusTeam?.id, id, event?.id],
    0,
    liveRefresh,
  );

  const eventInfo = useAsync(
    async () => {
      if (!event?.sku || tab !== "info") return null;
      return api.eventInfo(event.sku);
    },
    [event?.sku, tab === "info"],
  );

  const eventAwards = awards.data?.data ?? [];
  const timestampMap = useMemo(() => new Map((matchTimestamps.data ?? []).map((timestamp) => [timestamp.id, timestamp])), [matchTimestamps.data]);
  const presetUrl = event && preset.data?.exists ? `https://jumper.robostem.org/?preset=${encodeURIComponent(jumperPresetName(event, preset.data))}` : null;
  const activeStatus = tab === "team-matches" ? focusTeamEventMatches : tab === "matches" ? matches : tab === "rankings" ? rankings : tab === "skills" ? skills : tab === "awards" ? awards : tab === "picklist" || tab === "info" ? { loading: false, error: null } : teams;

  const keyAwards = useMemo(() => highlightAwards(eventAwards, event), [eventAwards, event]);

  // IQ has no alliance selection, so the picklist is hidden everywhere for IQ events.
  const eventIsIq = isIqProgram(event);
  const picklistSharedTeamId = eventIsIq ? undefined : primarySharedTeam?.sharedTeamId;
  // A #picklist deep link into an IQ event lands on a tab that doesn't exist there.
  useEffect(() => {
    if (eventIsIq && tab === "picklist") goToTab("matches");
  }, [eventIsIq, tab, goToTab]);

  // Shared search query — declared before all filtered memos that depend on it
  const searchQ = teamSearch.trim().toLowerCase();

  // Lookup from the fully-loaded event teams list so the tabs that only carry a
  // team's number (matches/rankings/skills/awards) can still match on the team's
  // organization and name.  Keyed by team id.
  const teamInfoById = useMemo(() => {
    const m = new Map<number, { org: string; name: string }>();
    for (const t of teams.data?.data ?? [])
      m.set(t.id, { org: (t.organization ?? "").toLowerCase(), name: (t.team_name ?? "").toLowerCase() });
    return m;
  }, [teams.data]);

  // True when a team ref (id + number) matches the search by number, organization, or name.
  const teamRefMatches = useCallback(
    (ref: { id: number; name: string }) => {
      if (ref.name.toLowerCase().includes(searchQ)) return true;
      const info = teamInfoById.get(ref.id);
      return !!info && (info.org.includes(searchQ) || info.name.includes(searchQ));
    },
    [searchQ, teamInfoById],
  );

  const filteredTeams = useMemo(() => {
    let all = teams.data?.data ?? [];
    if (teamsDivFilter && allDivisionRankings.data)
      all = all.filter((t) => allDivisionRankings.data!.get(t.id) === teamsDivFilter);
    if (searchQ)
      all = all.filter((t) =>
        t.number.toLowerCase().includes(searchQ) ||
        (t.team_name ?? "").toLowerCase().includes(searchQ) ||
        (t.organization ?? "").toLowerCase().includes(searchQ)
      );
    return all;
  }, [teams.data, teamsDivFilter, allDivisionRankings.data, searchQ]);

  // IQ top-10%/20% score classifier, built from the full (unfiltered) division
  // matches so the same gold/bronze thresholds apply across results + team focus.
  const iqScoreTier = useMemo(
    () => (isIqProgram(event) ? iqScoreTiers(matches.data?.data ?? []) : undefined),
    [event, matches.data],
  );

  // Event's local IANA timezone (from its coordinates) — used to group matches into
  // days at the event's location rather than the Eastern time the API reports.
  const eventTz = useMemo(() => eventTimeZone(event), [event]);

  // For multi-division events: map each teamId to its division name for the Teams tab column
  const teamDivisionNameMap = useMemo(() => {
    if (!allDivisionRankings.data || divisions.length <= 1) return null;
    const out = new Map<number, string>();
    for (const [teamId, divId] of allDivisionRankings.data) {
      const name = divisions.find((d) => d.id === divId)?.name ?? "—";
      out.set(teamId, name);
    }
    return out;
  }, [allDivisionRankings.data, divisions]);

  // Reset team search when navigating to a different event
  useEffect(() => { setTeamSearch(""); setSearchOpen(false); }, [event?.id]);

  const filteredMatches = useMemo(() => {
    const all = matches.data?.data ?? [];
    if (!searchQ) return all;
    return all.filter((m) =>
      m.alliances.some((a) => a.teams.some((t) => teamRefMatches(t.team)))
    );
  }, [matches.data, searchQ, teamRefMatches]);

  // When the F-search narrows to exactly one team, elimination matches focus on
  // that team (own alliance only). Multiple matching teams → no focus (full matches).
  const searchFocusTeamId = useMemo(() => {
    if (!searchQ) return undefined;
    const ids = new Set<number>();
    for (const m of filteredMatches)
      for (const a of m.alliances)
        for (const t of a.teams)
          if (teamRefMatches(t.team)) ids.add(t.team.id);
    return ids.size === 1 ? [...ids][0] : undefined;
  }, [searchQ, filteredMatches, teamRefMatches]);

  const filteredRankings = useMemo(() => {
    const all = rankings.data?.data ?? [];
    if (!searchQ) return all;
    return all.filter((r) => teamRefMatches(r.team));
  }, [rankings.data, searchQ, teamRefMatches]);

  const filteredSkills = useMemo(() => {
    const all = skills.data?.data ?? [];
    if (!searchQ) return all;
    return all.filter((s) => teamRefMatches(s.team));
  }, [skills.data, searchQ, teamRefMatches]);

  const filteredAwards = useMemo(() => {
    const all = awards.data?.data ?? [];
    if (!searchQ) return all;
    return all.filter((a) => a.teamWinners?.some((w) => teamRefMatches(w.team)));
  }, [awards.data, searchQ, teamRefMatches]);

  useEffect(() => {
    if (!event) return;
    const firstDivision = divisions[0]?.id ?? 1;
    if (!selectedDivision || !divisions.some((item) => item.id === selectedDivision)) {
      setSelectedDivision(firstDivision);
    }
  }, [event?.id, divisions, selectedDivision]);

  useEffect(() => {
    const handler = () => setTab(eventInitialTab(!!focusTeam));
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, [!!focusTeam]);

  useEffect(() => {
    replaceCurrentHash(tab);
  }, [tab]);

  // Record this event in recently-viewed history once loaded
  useEffect(() => {
    if (!event) return;
    pushRecentlyViewed({
      path: window.location.pathname,
      type: "event",
      label: event.name,
      sub: [seasonYearLabel(event.season?.name), locationLine(event)].filter(Boolean).join(" · "),
      badge: seasonYearLabel(event.season?.name) ?? "'??",
    });
    refreshTrailLabel(window.location.pathname, event.name);
  }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose event season + event ID to comparison modal — skips season-derivation
  // API call and enables per-event stat rows.  Cleared on unmount.
  useEffect(() => {
    _currentEventSeasonId = event?.season?.id ?? null;
    _currentEventId = event?.id ?? null;
    return () => { _currentEventSeasonId = null; _currentEventId = null; };
  }, [event?.season?.id, event?.id]);

  // Register the in-event search opener for the global F shortcut.
  useEffect(() => {
    const open = () => setSearchOpen(true);
    _openEventSearch = open;
    return () => { if (_openEventSearch === open) _openEventSearch = null; };
  }, []);

  useEffect(() => {
    _currentEventRankings = rankings.data?.data ?? [];
    _currentEventMatches = matches.data?.data ?? [];
    return () => { _currentEventRankings = []; _currentEventMatches = []; };
  }, [event?.id, rankings.data, matches.data]);

  if (loading || error || !event) {
    return (
      <section className="page">
        <Status loading={loading} error={error} />
      </section>
    );
  }

  _currentEventSeasonId = event.season.id;
  _currentEventId = event.id;
  _currentEventRankings = rankings.data?.data ?? [];
  _currentEventMatches = matches.data?.data ?? [];

  return (
    <ProgramContext.Provider value={programSlug(event.program)}>
    <TeamSearchContext.Provider value={searchQ}>
    <section className="page">
      <Breadcrumbs currentTab={EVENT_TAB_CRUMB[tab]} />
      <div className="profile-header">
        <div>
          <div className="eyebrow">
            <CalendarDays size={16} /> {event.sku}
          </div>
          <h1><TranslatedText text={event.name} country={event.location?.country} /></h1>
          <p>
            {event.location.venue ? (
              <><TranslatedText text={event.location.venue} country={event.location?.country} /> · </>
            ) : ""}
            {locationLine(event)}
          </p>
          <div className="meta-line">
            <ProgramBadge program={event.program} />
            <span>{formatDate(event.start)} - {formatDate(event.end)}</span>
            <span>{shortSeasonName(event.season.name)}</span>
            <span className={`event-priority priority-${eventCategory(event).rank}`}>{eventCategory(event).label}</span>
          </div>
        </div>
        <div className="profile-header-actions">
          <SharedTeamFavoriteButton kind="event" refId={String(event.id)} />
          <FavoriteButton id={event.id} kind="event" />
        </div>
      </div>

      <div className="view-tabs view-tabs-horizontal">
      <Tabs
        active={tab}
        onChange={(next) => setTab(next as EventDetailTab)}
        orientation="horizontal"
        action={<CompareModeButton />}
        tabs={[
          ...(focusTeam
            ? [
                [
                  "team-matches",
                  `${focusTeam.number}'s Matches`,
                  <Gamepad2 size={15} />,
                  () => {
                    setFocusTeam(null);
                    setTab("matches");
                    window.history.replaceState(null, "", urlWithHash(eventPath(event), "matches"));
                  },
                ] as [string, string, ReactNode, () => void],
              ]
            : []),
          ["info", "Info", <Info size={15} />],
          ["matches", "Results", <Gamepad2 size={15} />],
          ["rankings", "Rankings", <BarChart3 size={15} />],
          ["skills", "Skills", <Activity size={15} />],
          ["awards", "Awards", <AwardIcon size={15} />],
          ["teams", `Teams ${teams.data?.meta.total ?? ""}`, <Users size={15} />],
          ...(eventIsIq ? [] : [["picklist", "Picklist", <ListOrdered size={15} />] as [string, string, ReactNode]]),
        ]}
      />
      <div className="view-tabs-body">
      <ComparePickHint />
      {/* Banner row — search toggle on the left, key award highlights to the right */}
      <div className="event-highlights-strip">
        {(tab === "matches" || tab === "rankings" || tab === "skills" || tab === "awards" || tab === "teams") && (
          <button
            className={`event-team-search-toggle${searchOpen || teamSearch ? " is-active" : ""}`}
            onClick={() => setSearchOpen(true)}
            title="Search teams (F)"
          >
            <Search size={16} />
            <kbd className="event-team-search-kbd">F</kbd>
          </button>
        )}
        {keyAwards.length > 0 && <EventHighlights awards={keyAwards} />}
      </div>
      {divisions.length > 1 && (tab === "matches" || tab === "rankings") && (
        <div className="division-tabs" aria-label="Event divisions">
          <span>Division</span>
          {divisions.map((item) => (
            <button
              key={item.id}
              className={item.id === division ? "active" : ""}
              onClick={() => setSelectedDivision(item.id)}
            >
              {item.name}
              {item.id === division && <SlideIndicator id="division-tabs" variant="pill" />}
            </button>
          ))}
        </div>
      )}
      {/* Expanded search bar — appears below division-tabs when toggle is active */}
      {(searchOpen || teamSearch) && (tab === "matches" || tab === "rankings" || tab === "skills" || tab === "awards" || tab === "teams") && (
        <div className="event-team-search">
          <Search size={14} className="event-team-search-icon" />
          <input
            className="event-team-search-input"
            type="text"
            placeholder="Filter by team #, name, or organization…"
            value={teamSearch}
            autoFocus
            onChange={(e) => setTeamSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setTeamSearch(""); setSearchOpen(false); e.currentTarget.blur(); } }}
            onBlur={() => { if (!teamSearch) setSearchOpen(false); }}
          />
          {teamSearch && (
            <button className="event-team-search-clear" onClick={() => { setTeamSearch(""); setSearchOpen(false); }}>
              <X size={12} />
            </button>
          )}
        </div>
      )}
      <Status loading={activeStatus.loading} error={activeStatus.error} />
      {tab === "team-matches" && focusTeam && (
        <TeamMatchesTab
          matches={focusTeamEventMatches.data?.data ?? []}
          rankings={rankings.data?.data ?? []}
          skills={skills.data?.data ?? []}
          teams={teams.data?.data ?? []}
          focusTeam={focusTeam}
          isIq={isIqProgram(event)}
          scoreTier={iqScoreTier}
          multiDivision={(event.divisions?.length ?? 0) > 1}
          onJumpToMatch={jumpToResultsMatch}
          onOpenTab={goToTab}
          presetSupported={!!preset.data?.exists}
          presetLoading={preset.loading || (preset.data?.exists ? matchTimestamps.loading : false)}
          presetUrl={presetUrl}
          timestampMap={timestampMap}
          onOpenMatch={(match, timestamp) => setPlayback({ match, timestamp })}
        />
      )}
      {tab === "info" && (
        <EventInfoTab event={event} infoData={eventInfo.data ?? null} loading={eventInfo.loading} />
      )}
      {tab === "matches" && (
        <MatchesTable
          matches={filteredMatches}
          timestampMap={timestampMap}
          presetSupported={!!preset.data?.exists}
          presetLoading={preset.loading || (preset.data?.exists ? matchTimestamps.loading : false)}
          presetUrl={presetUrl}
          onOpenMatch={(match, timestamp) => setPlayback({ match, timestamp })}
          isIq={isIqProgram(event)}
          scoreTier={iqScoreTier}
          eventId={event.id}
          eventTz={eventTz}
          focusMatchId={activeFocusMatchId}
          onFocusConsumed={() => { consumedMatchRef.current = focusMatchId; }}
          rankings={filteredRankings}
          focusTeamId={searchFocusTeamId}
        />
      )}
      {tab === "rankings" && <RankingsTable rankings={filteredRankings} isIq={isIqProgram(event)} matches={filteredMatches} allMatches={matches.data?.data ?? []} sharedTeamId={picklistSharedTeamId} eventId={String(event.id)} />}
      {tab === "skills" && <SkillsTable skills={filteredSkills} />}
      {tab === "awards" && <AwardsList awards={filteredAwards} />}
      {tab === "teams" && divisions.length > 1 && (
        <div className="division-tabs" aria-label="Filter teams by division">
          <span>Division</span>
          <button className={teamsDivFilter === null ? "active" : ""} onClick={() => setTeamsDivFilter(null)}>All</button>
          {divisions.map((div) => (
            <button key={div.id} className={teamsDivFilter === div.id ? "active" : ""} onClick={() => setTeamsDivFilter(div.id)}>
              {div.name}
            </button>
          ))}
        </div>
      )}
      {tab === "teams" && !teams.loading && teams.data && (
        <div className="table-summary">
          Showing {filteredTeams.length < (teams.data.data.length) ? `${filteredTeams.length} of ` : ""}
          {teams.data.data.length.toLocaleString()} teams{teamsDivFilter ? ` in ${divisions.find((d) => d.id === teamsDivFilter)?.name ?? "division"}` : ""}.
        </div>
      )}
      {tab === "teams" && <TeamTable teams={filteredTeams} loading={teams.loading} eventId={event.id} sharedTeamId={picklistSharedTeamId} divisionMap={teamDivisionNameMap} />}
      {tab === "picklist" && !eventIsIq && (
        primarySharedTeam
          ? <PicklistTab event={event} sharedTeamId={primarySharedTeam.sharedTeamId} rankings={rankings.data?.data ?? []} />
          : <div className="picklist-empty"><p>Join or create a shared team to use shared picklists.</p></div>
      )}
      </div>
      </div>
      {playback && <MatchVideoOverlay playback={playback} onClose={() => setPlayback(null)} />}
    </section>
    </TeamSearchContext.Provider>
    </ProgramContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Event Info tab — two-column: event details + agenda, plus webcast
// ---------------------------------------------------------------------------

function formatEventDate(start: string | undefined, end: string | undefined): string {
  if (!start && !end) return "—";
  if (!start || !end) return formatEventDay(start ?? end, "—");
  const s = eventDayParts(start);
  const e = eventDayParts(end);
  if (!s || !e) return `${start} – ${end}`;
  // Same day → one label with the year; otherwise the year rides on the end date.
  if (s.mo === e.mo && s.day === e.day && s.yr === e.yr) return `${e.mo} ${e.day}, ${e.yr}`;
  return `${s.mo} ${s.day} – ${e.mo} ${e.day}, ${e.yr}`;
}

function EventStatCard({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={`event-stat-card${wide ? " event-stat-card--wide" : ""}`}>
      <span className="event-stat-label">{label}</span>
      <strong className="event-stat-value">{value}</strong>
    </div>
  );
}

function EventInfoTab({
  event,
  infoData,
  loading,
}: {
  event: Event;
  infoData: EventInfoData | null;
  loading: boolean;
}) {
  const programUrlSlug = isIqProgram(event) ? "vex-iq-competition" : "vex-robotics-competition";
  const vexEventsUrl = `https://events.vex.com/robot-competitions/${programUrlSlug}/${encodeURIComponent(event.sku ?? String(event.id))}.html`;
  const calendarUrl = `https://events.vex.com/calendar/${event.id}`;

  // Fetch event rankings (all divisions, or a specific one) + skills for the stats section
  const eventDivisions = event.divisions ?? [];
  // "all" = combine every division; a number = single division id
  const [statsDiv, setStatsDiv] = useState<"all" | number>("all");

  const statsRankings = useAsync(async () => {
    if (statsDiv !== "all") {
      // Single division
      const res = await collectAllPages<Ranking>((page) => api.eventRankings(event.id, statsDiv, { per_page: 250, page }));
      return res.data;
    }
    // All divisions combined
    const divs = eventDivisions.length > 0 ? eventDivisions : [{ id: 1, name: "Default" }];
    const results = await Promise.all(
      divs.map((div) => collectAllPages<Ranking>((page) => api.eventRankings(event.id, div.id, { per_page: 250, page })))
    );
    // collectAllPages returns { data: T[], meta } — flatten across all divisions
    return results.flatMap((r) => r.data);
  }, [event.id, statsDiv]);

  const statsSkills = useAsync(async () => {
    const res = await collectAllPages<Skill>((page) => api.eventSkills(event.id, { per_page: 250, page }));
    return res.data;
  }, [event.id]);

  // Compute ranking stats
  const rankStats = (() => {
    const rows = statsRankings.data ?? [];
    if (rows.length === 0) return null;
    const n = rows.length;
    const sum = (fn: (r: Ranking) => number | null | undefined) =>
      rows.reduce((acc, r) => acc + (fn(r) ?? 0), 0);
    const totalWp = sum((r) => r.wp);
    const totalAp = sum((r) => r.ap);
    // AWP = WP not earned from match wins/ties (autonomous win points)
    // Each qual win = 2 WP, each tie = 1 WP, so AWP = wp - (wins*2 + ties)
    const totalAwp = rows.reduce((acc, r) => {
      const wp = r.wp ?? 0;
      const wins = r.wins ?? 0;
      const ties = r.ties ?? 0;
      return acc + Math.max(0, wp - (wins * 2 + ties));
    }, 0);
    const avgRank = sum((r) => r.rank) / n;
    const avgScore = sum((r) => r.average_points) / n;
    const maxHighScore = Math.max(...rows.map((r) => r.high_score ?? 0));
    return {
      teams: n,
      avgRank,
      avgWp: totalWp / n,
      avgAp: totalAp / n,
      avgAwp: totalAwp / n,
      totalWp,
      totalAp,
      totalAwp,
      avgScore,
      maxHighScore,
    };
  })();

  // Compute skills stats (best combined per team)
  // When a specific division is selected, restrict to teams that appear in that
  // division's rankings (statsRankings already reflects the statsDiv filter).
  const skillStats = (() => {
    const rows = statsSkills.data ?? [];
    if (rows.length === 0) return null;
    // If a single division is selected, limit to its ranked team IDs
    const divTeamIds = statsDiv !== "all" && statsRankings.data
      ? new Set(statsRankings.data.map((r) => r.team.id))
      : null;
    const byTeam = new Map<string, { driver: number; prog: number }>();
    for (const s of rows) {
      if (divTeamIds && !divTeamIds.has(s.team.id)) continue;
      const key = String(s.team.id);
      const cur = byTeam.get(key) ?? { driver: 0, prog: 0 };
      if (s.type === "driver") cur.driver = Math.max(cur.driver, s.score ?? 0);
      else cur.prog = Math.max(cur.prog, s.score ?? 0);
      byTeam.set(key, cur);
    }
    const teams = [...byTeam.values()];
    const n = teams.length;
    if (n === 0) return null;
    const avg = (fn: (t: { driver: number; prog: number }) => number) =>
      teams.reduce((acc, t) => acc + fn(t), 0) / n;
    return {
      avgCombined: avg((t) => t.driver + t.prog),
      avgDriver: avg((t) => t.driver),
      avgProg: avg((t) => t.prog),
    };
  })();

  // Load world skills leaderboard for this season/grade, then filter to event teams
  const statsWorldSkills = useAsync(async () => {
    const seasonId = event.season?.id;
    if (!seasonId) return null;
    // One ladder has to be picked, so use the top grade the program reaches
    // (V5RC → High School, VIQRC → Middle School, VURC/VAIRC → College).
    const gc = eventTopGradeCode(event);
    const grade = (gc ? GRADE_CODE_TO_FULL[gc] : null) ?? event.grade ?? "High School";
    return loadWorldSkills(seasonId, grade).catch(() => null);
  }, [event.id, event.season?.id]);

  // Compute world skills stats for teams at this event (cross-referenced via rankings)
  const worldSkillsStats = (() => {
    const wsData = statsWorldSkills.data;
    const rankRows = statsRankings.data;
    if (!wsData || !rankRows || rankRows.length === 0) return null;
    // Build a set of team IDs present at this event
    const teamIds = new Set(rankRows.map((r) => r.team.id));
    const eventWs = wsData.filter((e) => teamIds.has(e.team.id));
    if (eventWs.length === 0) return null;
    const n = eventWs.length;
    const avg = (fn: (e: WorldSkillsEntry) => number) =>
      eventWs.reduce((acc, e) => acc + fn(e), 0) / n;
    return {
      teamsFound: n,
      avgRank: avg((e) => e.rank),
      avgCombined: avg((e) => e.scores.score),
      avgDriver: avg((e) => e.scores.driver),
      avgProg: avg((e) => e.scores.programming),
    };
  })();

  const webcast = infoData?.webcast ?? null;
  const hasWebcastLinks = (webcast?.links?.length ?? 0) > 0;
  const isUrl = (s?: string | null) => !!s && /^https?:\/\//i.test(s.trim());
  // URLs to render as clickable links: the explicit links, or a description
  // that is itself just a URL. Each shows as the URL + open-in-new-tab icon.
  const webcastUrls = hasWebcastLinks
    ? webcast!.links.map((l) => l.url)
    : isUrl(webcast?.description)
      ? [webcast!.description!.trim()]
      : [];
  // Show the description as text only when it's prose, not a bare URL we link.
  const webcastDescText = webcast?.description && !isUrl(webcast.description) ? webcast.description : null;

  return (
    <div className="event-info-tab">
      {/* Open in VEX Events link */}
      <a
        href={vexEventsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="event-info-open-link"
      >
        <ExternalLink size={13} />
        Open in VEX Events
      </a>

      <div className="event-info-grid">
        {/* Left column — event details + webcast */}
        <Panel
          title="Event Info"
          icon={<Info size={15} />}
          action={
            <a href={calendarUrl} target="_blank" rel="noopener noreferrer" className="event-info-calendar-link">
              <CalendarDays size={12} />
              Add to Calendar
            </a>
          }
        >
          <dl className="about-profile">
            <AboutProfileRow label="Date">{formatEventDate(event.start, event.end)}</AboutProfileRow>
            {event.level && (
              <AboutProfileRow label="Level">{event.level}</AboutProfileRow>
            )}
            {(() => {
              const codes = eventGradeCodesBest(event);
              const g = event.grade || (codes.length ? codes.map((code) => GRADE_CODE_TO_FULL[code] ?? code).join(" / ") : null);
              return g ? <AboutProfileRow label="Grade">{g}</AboutProfileRow> : null;
            })()}
            <AboutProfileRow label="Region">{event.location?.region ?? event.location?.city ?? "—"}</AboutProfileRow>
            {event.location?.venue && (
              <AboutProfileRow label="Venue">
                <TranslatedText text={event.location.venue} country={event.location?.country} />
              </AboutProfileRow>
            )}
            <AboutProfileRow label="Season">{event.season?.name ?? "—"}</AboutProfileRow>
            <AboutProfileRow label="SKU">{event.sku ?? String(event.id)}</AboutProfileRow>
          </dl>

          {/* Webcast section */}
          {(webcast || loading) && (
            <div className="event-info-webcast">
              <div className="event-info-webcast-label">
                <Tv2 size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                Webcast
              </div>
              {loading ? (
                <div className="event-info-webcast-desc">Loading…</div>
              ) : webcast ? (
                <>
                  {webcastDescText && (
                    <div className="event-info-webcast-desc">{webcastDescText}</div>
                  )}
                  {webcastUrls.length > 0 && (
                    <div className="event-info-webcast-urls">
                      {webcastUrls.map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="event-info-webcast-url"
                        >
                          <span className="event-info-webcast-url-text">{url}</span>
                          <ExternalLink size={12} />
                        </a>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </Panel>

        {/* Right column — agenda */}
        <Panel title="Agenda" icon={<CalendarDays size={15} />}>
          {loading ? (
            <div className="empty">Loading agenda…</div>
          ) : infoData?.agenda?.html ? (
            // Defense-in-depth: the HTML is already allowlist-sanitized server-side
            // (eventInfoScraper.sanitizeAgendaHtml); DOMPurify is a client backstop so
            // this sink can never render raw remote HTML if the scraper path regresses.
            // eslint-disable-next-line react/no-danger
            <div
              className="event-info-agenda-html"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(infoData.agenda.html, { ADD_ATTR: ["target"] }) }}
            />
          ) : (
            <div className="empty">
              {infoData ? "No agenda posted yet." : "Click this tab to load agenda."}
            </div>
          )}
        </Panel>
      </div>

      {/* Division picker for stats — only shown on multi-division events */}
      {eventDivisions.length > 1 && (statsRankings.loading || rankStats || skillStats || statsWorldSkills.loading || worldSkillsStats) && (
        <div className="division-tabs" style={{ margin: "0 12px 4px" }} aria-label="Stats division">
          <span>Division</span>
          <button className={statsDiv === "all" ? "active" : ""} onClick={() => setStatsDiv("all")}>All</button>
          {eventDivisions.map((div) => (
            <button key={div.id} className={statsDiv === div.id ? "active" : ""} onClick={() => setStatsDiv(div.id)}>
              {div.name}
            </button>
          ))}
        </div>
      )}

      {/* Stats panels — ranking + combined skills */}
      {(statsRankings.loading || rankStats || skillStats || statsWorldSkills.loading || worldSkillsStats) && (
        <div className="event-stats-grid">
          <Panel title="Ranking Stats" icon={<BarChart3 size={15} />}>
            {statsRankings.loading ? (
              <div className="event-stat-empty">Loading…</div>
            ) : rankStats ? (
              isIqProgram(event) ? (
                <div className="event-stat-cells">
                  <EventStatCard label="Teams" value={rankStats.teams} />
                  <EventStatCard label="Avg Rank" value={`#${rankStats.avgRank.toFixed(1)}`} />
                  <EventStatCard label="Avg Score" value={rankStats.avgScore.toFixed(1)} />
                  <EventStatCard label="High Score" value={rankStats.maxHighScore} />
                </div>
              ) : (
                <div className="event-stat-cells">
                  <EventStatCard label="Teams" value={rankStats.teams} wide />
                  <EventStatCard label="Avg WP" value={rankStats.avgWp.toFixed(1)} />
                  <EventStatCard label="Avg AP" value={rankStats.avgAp.toFixed(1)} />
                  <EventStatCard label="Avg AWP" value={rankStats.avgAwp.toFixed(2)} />
                  <EventStatCard label="Total WP" value={rankStats.totalWp.toFixed(0)} />
                  <EventStatCard label="Total AP" value={rankStats.totalAp.toFixed(0)} />
                  <EventStatCard label="Total AWP" value={rankStats.totalAwp.toFixed(0)} />
                </div>
              )
            ) : (
              <div className="event-stat-empty">No ranking data</div>
            )}
          </Panel>

          {(statsSkills.loading || skillStats || statsWorldSkills.loading || worldSkillsStats) && (
            <Panel title="Skills" icon={<Zap size={15} />}>
              {/* Event Skills section */}
              {statsSkills.loading ? (
                <div className="event-stat-empty">Loading…</div>
              ) : skillStats ? (
                <div className="event-stat-cells">
                  <EventStatCard label="Avg Combined" value={skillStats.avgCombined.toFixed(1)} wide />
                  <EventStatCard label="Avg Driver" value={skillStats.avgDriver.toFixed(1)} />
                  <EventStatCard label="Avg Programming" value={skillStats.avgProg.toFixed(1)} />
                </div>
              ) : null}

              {/* World Skills section — vertical label + bracket outside the rows */}
              {(statsWorldSkills.loading || worldSkillsStats) && (
                <div className="event-stat-world-group">
                  <span className="event-stat-world-label">World Skills</span>
                  {statsWorldSkills.loading || statsRankings.loading ? (
                    <div className="event-stat-empty">Loading…</div>
                  ) : worldSkillsStats ? (
                    <div className="event-stat-cells">
                      <EventStatCard label="Avg Rank" value={`#${Math.round(worldSkillsStats.avgRank)}`} />
                      <EventStatCard label="Avg Combined" value={worldSkillsStats.avgCombined.toFixed(1)} />
                      <EventStatCard label="Avg Driver" value={worldSkillsStats.avgDriver.toFixed(1)} />
                      <EventStatCard label="Avg Programming" value={worldSkillsStats.avgProg.toFixed(1)} />
                    </div>
                  ) : null}
                </div>
              )}
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team About tab — profile + season stat cards + lightweight SVG trend charts
// ---------------------------------------------------------------------------

// Chart axis ticks. The timestamps these get are parsed from event dates, i.e.
// midnight US Eastern, so formatting in UTC (04:00/05:00 the same day) yields the
// event's own month — formatting in the viewer's zone would tick a Sep 1 event as
// "Aug" for anyone out west.
const MONTH_YEAR_UTC = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
function shortMonthYear(ts: number) {
  if (!ts) return "";
  return MONTH_YEAR_UTC.format(new Date(ts));
}

type ChartSeries = { name: string; color: string; values: Array<number | null> };

function starPoints(cx: number, cy: number, outer: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(" ");
}

// Compact recharts sparkline of a team's qual scores in match order — no axes,
// grid, or tooltip. Visually consistent with TrendChart; used in quick view.
function ScoreSparkline({ values, labels, height = 44 }: { values: number[]; labels?: string[]; height?: number }) {
  // Unique per-instance gradient id so multiple sparklines don't collide.
  const gradId = `score-spark-fill-${useId().replace(/:/g, "")}`;
  const config: ChartConfig = { score: { label: "Qual score", color: "#5cb85c" } };
  if (values.length < 2) return null;
  const data = values.map((v, i) => ({ i, score: v, _label: labels?.[i] }));
  return (
    <ChartContainer config={config} className="w-full" style={{ height, aspectRatio: "auto" }}>
      <AreaChart accessibilityLayer data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-score)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-score)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={(props) => {
            const { active, payload } = props as unknown as {
              active?: boolean;
              payload?: ReadonlyArray<{ value?: number | null; payload?: { _label?: string } }>;
            };
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                {payload[0]?.payload?._label && <span className="text-muted-foreground">{payload[0].payload._label} · </span>}
                <span className="font-mono font-medium tabular-nums">{payload[0]?.value}</span>
              </div>
            );
          }}
        />
        <Area dataKey="score" type="monotone" stroke="var(--color-score)" strokeWidth={1.5} fill={`url(#${gradId})`} isAnimationActive={false} dot={false} />
      </AreaChart>
    </ChartContainer>
  );
}

function TrendChart({
  labels,
  tips,
  links,
  series,
  markers,
  height = 160,
  yFormat = (n: number) => String(Math.round(n)),
  yFloor,
  yCeil,
  yMaxPad = 0,
}: {
  labels: string[];
  tips?: string[];
  links?: Array<string | null>;
  series: ChartSeries[];
  markers?: boolean[];
  height?: number;
  area?: boolean;
  yFormat?: (n: number) => string;
  yFloor?: number;
  yCeil?: number;
  yMaxPad?: number;
}) {
  const uid = useId().replace(/:/g, "");
  // Index of the point currently under the cursor, plus a live ref to the row
  // data, so a keyboard Enter while hovering can open that event (mirrors click).
  const activeIndexRef = useRef<number | null>(null);
  const dataRef = useRef<Array<Record<string, number | string | boolean | null>>>([]);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const idx = activeIndexRef.current;
      if (idx == null) return;
      const link = dataRef.current[idx]?._link;
      if (typeof link === "string" && link) navigate(link);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const allValues = series.flatMap((s) => s.values.filter((v): v is number => v != null));

  if (!labels.length || !allValues.length) {
    return <div className="about-chart-empty">No data for this season.</div>;
  }

  const lo = yFloor ?? Math.min(...allValues);
  let hi = yCeil ?? Math.max(...allValues);
  if (hi === lo) hi = lo + 1;
  else if (yCeil == null) hi = hi + (hi - lo) * yMaxPad;

  // recharts wants flat row objects; use index-safe series keys (s0, s1, …) so
  // the generated --color-* CSS vars stay valid, with the display label, event
  // tip, link, and marquee flag stashed alongside each row. The x-axis is keyed
  // on a unique per-row `_key` (not the formatted month) so that two events in
  // the same month don't collapse onto one category — which would desync the
  // hover cursor from the active point.
  const config: ChartConfig = {};
  series.forEach((s, i) => {
    config[`s${i}`] = { label: s.name, color: s.color };
  });

  const data = labels.map((label, i) => {
    const row: Record<string, number | string | boolean | null> = {
      _key: String(i),
      _label: label,
      _tip: tips?.[i] ?? label,
      _link: links?.[i] ?? null,
      _marquee: !!markers?.[i],
    };
    series.forEach((s, si) => {
      row[`s${si}`] = s.values[i];
    });
    return row;
  });
  dataRef.current = data;

  const goToEvent = (index: number | string | undefined) => {
    if (index == null) return;
    const i = typeof index === "number" ? index : Number(index);
    if (!Number.isFinite(i)) return;
    const link = data[i]?._link;
    if (typeof link === "string" && link) navigate(link);
  };

  return (
    <ChartContainer config={config} className="w-full" style={{ height, aspectRatio: "auto" }}>
      <AreaChart
        accessibilityLayer
        data={data}
        margin={{ left: 4, right: 8, top: 8, bottom: 0 }}
        onClick={(state) => goToEvent(state?.activeTooltipIndex ?? undefined)}
        onMouseMove={(state) => {
          const i = state?.activeTooltipIndex;
          activeIndexRef.current = typeof i === "number" ? i : i != null ? Number(i) : null;
        }}
        onMouseLeave={() => {
          activeIndexRef.current = null;
        }}
        className="[&_.recharts-surface]:cursor-pointer"
      >
        <defs>
          {series.map((_, i) => (
            <linearGradient key={i} id={`fill-${uid}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-s${i})`} stopOpacity={0.4} />
              <stop offset="95%" stopColor={`var(--color-s${i})`} stopOpacity={0.04} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="_key"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          interval="preserveStartEnd"
          tickFormatter={(v) => data[Number(v)]?._label as string ?? ""}
        />
        <YAxis width={44} tickLine={false} axisLine={false} tickMargin={4} domain={[lo, hi]} tickFormatter={(v) => yFormat(Number(v))} />
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={(props) => {
            const { active, payload } = props as unknown as {
              active?: boolean;
              payload?: ReadonlyArray<{
                value?: number | null;
                dataKey?: string;
                color?: string;
                name?: string;
                payload?: { _tip?: string; _link?: string | null };
              }>;
            };
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload;
            const rawTip = row?._tip ?? "";
            const tip = rawTip.length > 20 ? `${rawTip.slice(0, 20).trimEnd()}…` : rawTip;
            return (
              <div className="grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                <div className="font-medium">{tip}</div>
                <div className="grid gap-1.5">
                  {payload
                    .filter((p) => p.value != null)
                    .map((p) => (
                      <div key={p.dataKey} className="flex w-full items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 shrink-0 rounded-[2px]" style={{ background: p.color }} />
                          <span className="text-muted-foreground">{config[p.dataKey as string]?.label ?? p.name}</span>
                        </span>
                        <span className="font-mono font-medium tabular-nums text-foreground">{yFormat(Number(p.value))}</span>
                      </div>
                    ))}
                </div>
                <div className="mt-0.5 flex items-center gap-1 border-t border-border/50 pt-1 text-muted-foreground">
                  <CornerDownLeft className="size-3" /> to see more
                </div>
              </div>
            );
          }}
        />
        {series.map((_, i) => (
          <Area
            key={i}
            dataKey={`s${i}`}
            type="monotone"
            stroke={`var(--color-s${i})`}
            strokeWidth={2}
            fill={`url(#fill-${uid}-${i})`}
            connectNulls={false}
            isAnimationActive={false}
            activeDot={{ r: 4 }}
            dot={(props) => {
              const { cx, cy, stroke, payload, index } = props as {
                cx?: number;
                cy?: number;
                stroke?: string;
                payload?: { _marquee?: boolean };
                index?: number;
              };
              if (cx == null || cy == null || !payload?._marquee) return <g key={index} />;
              return (
                <polygon
                  key={index}
                  points={starPoints(cx, cy, 6, 6 * 0.42)}
                  fill="var(--surface)"
                  stroke={stroke}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              );
            }}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  // accent/icon kept in the type for existing call sites but no longer rendered —
  // the minimalist treatment relies on typographic hierarchy, not icons/color.
  accent?: "blue" | "green" | "amber" | "red" | "gray";
  icon?: ReactNode;
}) {
  return (
    <div className="about-stat">
      <span className="about-stat-label">{label}</span>
      <div className="about-stat-figure">
        <strong className="about-stat-value">{value}</strong>
        {sub != null && <small className="about-stat-sub">{sub}</small>}
      </div>
    </div>
  );
}

function AboutProfileRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="about-profile-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team radar — a normalized "profile" across a handful of scouting dimensions.
// Every axis is scaled to 0–100 so the *shape* is comparable regardless of the
// raw units. World Skills uses a true leaderboard percentile; the score-based
// axes use fixed reference benchmarks (an elite team ≈ full ring) that are easy
// to tune below. Raw values are preserved for the tooltip. Match *scores* are
// deliberately left off — skills, consistency and world standing say more.
// ---------------------------------------------------------------------------

const clamp100 = (n: number) => Math.max(0, Math.min(100, n));

// Reference points where an axis reads "full" (100). Tune to taste.
const RADAR_BENCH = {
  awpRate: 1,   // weighted AWP per qual match for a full ring (regular AWP maxes at 1/match; signature counts 3×)
  avgWp: 2.65,  // avg WP / match for a full ring (theoretical max is 3: 2 win + 1 AWP)
  iqRank: 24,   // IQ: avg qual rank at/beyond which the axis bottoms out
};

// Experience axis = a competitive-résumé score (0–100) for the selected season.
// It is NOT a flat sum: each factor saturates independently against its own cap,
// so maxing one narrow dimension can't peg the axis on its own. Signature titles
// carry BY FAR the most weight (a big title cap): a season with a stack of
// signature/championship titles reads near the top even on its own. Each factor's
// score = cap · (1 − e^(−count/k)): it climbs fast for the first few, then
// flattens toward `cap`. Caps deliberately sum to >100 (the total is clamped and
// then lifted by EXP_LENIENCY) so a truly elite résumé fills the ring. Ranked by
// the user's importance order (titles first, event-count last). Tune to taste.
type ExpFactor = { cap: number; k: number };
const EXP_MODEL: Record<"v5" | "iq", Record<string, ExpFactor>> = {
  v5: {
    titles:    { cap: 56, k: 1.5 }, // signature/championship titles (worlds counts double) — dominant
    sigFinals: { cap: 22, k: 1.5 }, // reached finals at a signature/championship event
    sigSF:     { cap: 9,  k: 1.5 }, // reached semifinals at a signature/championship event
    sigElims:  { cap: 9,  k: 1.5 }, // reached elims at a signature/championship event
    sigEvents: { cap: 15, k: 3 },   // signature/championship events attended (+70% weight)
    seasons:   { cap: 8,  k: 2.5 }, // seasons active (career; longevity)
    finals:    { cap: 7,  k: 3 },   // events reaching finals in general (any level)
    elims:     { cap: 5,  k: 4 },   // events reaching elims in general (any level)
    matches:   { cap: 4,  k: 40 },  // match volume
    events:    { cap: 2,  k: 6 },   // event count
  },
  // IQ is cooperative ("elims IS finals"): no SF/elim tiers. Their weight is
  // reallocated to titles / finals. Finals = Teamwork-Challenge finals (round-15).
  iq: {
    titles:    { cap: 58, k: 1.5 },
    sigFinals: { cap: 24, k: 1.5 },
    sigSF:     { cap: 0,  k: 1 },
    sigElims:  { cap: 0,  k: 1 },
    sigEvents: { cap: 20, k: 3 }, // +70% weight
    seasons:   { cap: 10, k: 2.5 },
    finals:    { cap: 12, k: 3 },
    elims:     { cap: 0,  k: 1 },
    matches:   { cap: 5,  k: 40 },
    events:    { cap: 3,  k: 6 },
  },
};

// Global leniency multiplier applied to the summed score (then clamped to 100).
// 1.2 = "20% less harsh": a World-Champion season reads ~95%. Tune to taste.
const EXP_LENIENCY = 1.2;

// Award-title matchers for the Experience axis. V5 titles: "Tournament Champions",
// "World Champions", "Division Champions" (worlds). IQ: "Teamwork Champion Award",
// "Teamwork Challenge World Champions". Deliberately NOT bare "champion" so
// "Robot Skills Champion" is excluded. Semifinalist is tested before finalist
// because "Semifinalists" contains "finalists".
const EXP_CHAMP_RE = /tournament champions|world champions|division champions|teamwork challenge world champions|teamwork champion/i;
const EXP_WORLDS_TITLE_RE = /world champions|teamwork challenge world champions/i; // top title — counts double
const EXP_SF_RE = /semifinalists/i;
const EXP_FINALIST_RE = /finalists|teamwork 2nd place/i;

// Ready-to-plot inputs for the Experience axis, computed season-scoped in
// TeamAboutTab (where matches, awards, events and season history are available).
// These are raw COUNTS; experienceScore() maps them to the 0–100 axis value.
type ExperienceInputs = {
  titleUnits: number;    // weighted titles fed to the curve (worlds title = 2)
  sigTitles: number;     // raw signature/championship titles won (for display)
  sigFinals: number;     // signature/championship events reaching finals (not won)
  sigSF: number;         // signature/championship events whose best result was SF
  sigElims: number;      // signature/championship events whose best result was elims
  sigEvents: number;     // signature/championship events attended
  finalsGeneral: number; // events reaching finals (any level)
  elimsGeneral: number;  // events reaching eliminations (any level; V5 only)
  seasonsActive: number; // seasons the team has competed in (career)
  matchCount: number;
  eventCount: number;
  known: boolean;
};

// Map the raw résumé counts to the 0–100 axis value: sum each factor's saturating
// contribution against its cap. Because caps sum to 100 and each factor flattens,
// the total only nears 100 when nearly every dimension is maxed simultaneously.
function experienceScore(exp: ExperienceInputs, isIq: boolean): number {
  const m = isIq ? EXP_MODEL.iq : EXP_MODEL.v5;
  const sat = (count: number, f: ExpFactor) => (f.cap <= 0 || count <= 0 ? 0 : f.cap * (1 - Math.exp(-count / f.k)));
  const total =
    sat(exp.titleUnits, m.titles) +
    sat(exp.sigFinals, m.sigFinals) +
    sat(exp.sigSF, m.sigSF) +
    sat(exp.sigElims, m.sigElims) +
    sat(exp.sigEvents, m.sigEvents) +
    sat(Math.max(0, exp.seasonsActive - 1), m.seasons) + // 1 season contributes 0
    sat(exp.finalsGeneral, m.finals) +
    sat(exp.elimsGeneral, m.elims) +
    sat(exp.matchCount, m.matches) +
    sat(exp.eventCount, m.events);
  // Leniency: lift every résumé ~20% (clamped) so the axis reads less harshly —
  // a World-Champion season lands ~95%, leaving 100% for a stacked multi-title one.
  return clamp100(total * EXP_LENIENCY);
}

// Consistency = 100·(1 − coefficient of variation) over a per-event series.
// Needs ≥2 events with a positive mean; otherwise it's unknown.
function cvConsistency(values: number[]): number | null {
  const vals = values.filter((v) => Number.isFinite(v) && v > 0);
  if (vals.length < 2) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (mean <= 0) return null;
  const stdev = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
  return clamp100(100 * (1 - stdev / mean));
}

// Percentile of `value` within `all` (0–100; higher beats more peers).
function radarPercentile(value: number, all: number[]): number | null {
  const pool = all.filter((v) => Number.isFinite(v));
  if (!pool.length) return null;
  const atOrBelow = pool.filter((v) => v <= value).length;
  return clamp100((atOrBelow / pool.length) * 100);
}

// `standalone` tooltips show only `raw` (it already reads as a full phrase);
// the rest are prefixed with the axis name.
type RadarAxis = { axis: string; value: number; raw: string; known: boolean; standalone?: boolean };

type TeamRadarAgg = {
  winRate: number; matches: number; events: number;
  avgWp: number; awp: number; avgRank: number; finalistEventCount: number;
};

// Rasterize the on-screen radar card into a PNG. The area *around* the card is
// left transparent; the card itself is painted (white in light mode / near-black
// in dark mode) with its rounded border, a "[TEAM] PROFILE" title, and the radar.
// CSS-variable colors and fonts are resolved to concrete values because an SVG
// loaded through <img> can't see the page's stylesheet.
async function downloadTeamProfile(card: HTMLElement, teamLabel: string) {
  const svg = card.querySelector<SVGSVGElement>(".about-radar-chart svg");
  if (!svg) return;

  const root = getComputedStyle(document.documentElement);
  const cssVar = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
  const surface = getComputedStyle(card).backgroundColor || cssVar("--surface", "#ffffff");
  const border = cssVar("--border", "#eaeaea");
  const textFaint = cssVar("--text-faint", "#8f8f8f");
  const textMuted = cssVar("--text-muted", "#666666");
  const monoFont = cssVar("--font-geist-mono", "ui-monospace, monospace");
  const accent = "#337ab7";
  const sansStack = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  const w = svg.clientWidth || 300;
  const h = svg.clientHeight || 236;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.setAttribute("viewBox", `0 0 ${w} ${h}`);
  let svgStr = new XMLSerializer().serializeToString(clone);
  svgStr = svgStr
    .replaceAll("var(--color-value)", accent)
    .replaceAll("var(--border)", border)
    .replaceAll("var(--text-muted)", textMuted)
    .replaceAll("#ccc", border);
  // SVG text can't inherit page fonts — inject a sans stack.
  svgStr = svgStr.replace(/(<svg[^>]*>)/, `$1<style>text{font-family:${sansStack};}</style>`);

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("radar render failed"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
  });
  if (document.fonts) { try { await document.fonts.ready; } catch { /* noop */ } }

  const dpr = 2;
  const W = 900, H = 560;
  const canvas = document.createElement("canvas");
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  // Outer area intentionally left transparent — only the card is painted.

  const m = 18;
  const cx = m, cy = m, cw = W - 2 * m, ch = H - 2 * m, radius = 22;
  ctx.beginPath();
  ctx.moveTo(cx + radius, cy);
  ctx.arcTo(cx + cw, cy, cx + cw, cy + ch, radius);
  ctx.arcTo(cx + cw, cy + ch, cx, cy + ch, radius);
  ctx.arcTo(cx, cy + ch, cx, cy, radius);
  ctx.arcTo(cx, cy, cx + cw, cy, radius);
  ctx.closePath();
  ctx.fillStyle = surface;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = border;
  ctx.stroke();

  // Title: mono, uppercase, letter-spaced, faint — matching the on-card style.
  ctx.fillStyle = textFaint;
  ctx.font = `600 14px ${monoFont}`;
  ctx.textBaseline = "alphabetic";
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  try { spaced.letterSpacing = "1.4px"; } catch { /* older browsers */ }
  ctx.fillText(`${teamLabel.toUpperCase()} PROFILE`, cx + 26, cy + 40);
  try { spaced.letterSpacing = "0px"; } catch { /* noop */ }

  // Radar centered below the title, preserving its aspect ratio.
  const top = cy + 60;
  const availW = cw - 48;
  const availH = ch - 84;
  const s = Math.min(availW / w, availH / h);
  const dw = w * s, dh = h * s;
  ctx.drawImage(img, cx + (cw - dw) / 2, top + (availH - dh) / 2, dw, dh);

  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${teamLabel}-profile.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      resolve();
    }, "image/png");
  });
}

function TeamRadar({
  isIq,
  agg,
  perEventAvgWp,
  perEventQualAvg,
  totalQualMatches,
  sigAwp,
  regularAwp,
  experience,
  teamLabel,
  wsEntry,
  leaderboard,
}: {
  isIq: boolean;
  agg: TeamRadarAgg;
  perEventAvgWp: number[];   // V5: per-event avg WP — consistency source
  perEventQualAvg: number[]; // IQ: per-event avg qual score — consistency source
  totalQualMatches: number;  // season qual-match count — AWP-rate denominator
  sigAwp: number;            // AWPs earned at signature/championship/worlds events
  regularAwp: number;        // AWPs earned at all other events
  experience: ExperienceInputs; // pre-computed inputs for the Experience axis
  teamLabel: string;         // e.g. team number — used in the export title/filename
  wsEntry: WorldSkillsEntry | null;
  leaderboard: WorldSkillsEntry[] | null;
}) {
  const config: ChartConfig = { value: { label: "Rating", color: "#337ab7" } };
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  // Fires only after the capture finishes, so the check never lands in the PNG.
  const { flashing: dlDone, fire: fireDlDone } = useConfirmFlash(1100);
  const handleDownload = async () => {
    if (!cardRef.current || downloading) return;
    setDownloading(true);
    try {
      await downloadTeamProfile(cardRef.current, teamLabel);
      fireDlDone();
    } finally {
      setDownloading(false);
    }
  };

  const data = useMemo<RadarAxis[]>(() => {
    // World Skills as a share of the #1 combined score in this grade's
    // leaderboard: a team at 50 pts when the top team scored 200 reads 25%.
    const topScore = (leaderboard ?? []).reduce((m, e) => Math.max(m, e.scores.score ?? 0), 0);
    const wsScore = wsEntry?.scores.score ?? null;
    const wsPct = wsScore != null && topScore > 0 ? clamp100((wsScore / topScore) * 100) : null;
    const wsRaw = wsPct != null
      ? `${wsScore} pts · ${Math.round(wsPct)}% of #1 (${topScore})`
      : "Unranked";

    const consistency = cvConsistency(isIq ? perEventQualAvg : perEventAvgWp);

    // Experience = a competitive-résumé score (see EXP_MODEL / experienceScore):
    // titles and deep elim/finals runs at signature events dominate, longevity is
    // in seasons, volume adds a little. Shared by both radars — on IQ it takes the
    // slot the old "Finals" rate axis held.
    const exp = experience;
    const expScore = experienceScore(exp, isIq);
    const expParts: string[] = [];
    if (exp.sigTitles > 0) expParts.push(`${exp.sigTitles} sig title${exp.sigTitles === 1 ? "" : "s"}`);
    if (exp.finalsGeneral > 0) expParts.push(`${exp.finalsGeneral} final${exp.finalsGeneral === 1 ? "" : "s"}`);
    if (!isIq && exp.elimsGeneral > 0) expParts.push(`${exp.elimsGeneral} elim${exp.elimsGeneral === 1 ? "" : "s"}`);
    if (exp.sigEvents > 0) expParts.push(`${exp.sigEvents} sig`);
    if (exp.seasonsActive > 0) expParts.push(`${exp.seasonsActive} season${exp.seasonsActive === 1 ? "" : "s"}`);
    const expRaw = expParts.length
      ? expParts.join(" · ")
      : exp.matchCount > 0
        ? `${exp.matchCount} matches · ${exp.eventCount} event${exp.eventCount === 1 ? "" : "s"}`
        : "—";
    const expAxis: RadarAxis = { axis: "Experience", value: exp.known ? expScore : 0, raw: expRaw, known: exp.known };

    if (isIq) {
      const drivers = (leaderboard ?? []).map((e) => e.scores.driver ?? 0);
      const progs = (leaderboard ?? []).map((e) => e.scores.programming ?? 0);
      const myDriver = wsEntry?.scores.driver ?? null;
      const myProg = wsEntry?.scores.programming ?? null;
      const driverPct = myDriver != null ? radarPercentile(myDriver, drivers) : null;
      const progPct = myProg != null ? radarPercentile(myProg, progs) : null;
      const rankVal = agg.avgRank > 0 ? clamp100(100 * (1 - (agg.avgRank - 1) / RADAR_BENCH.iqRank)) : null;
      return [
        { axis: "World Skills", value: wsPct ?? 0, raw: wsRaw, known: wsPct != null },
        { axis: "Driver", value: driverPct ?? 0, raw: myDriver != null ? `${myDriver} pts` : "—", known: driverPct != null },
        { axis: "Programming", value: progPct ?? 0, raw: myProg != null ? `${myProg} pts` : "—", known: progPct != null },
        { axis: "Consistency", value: consistency ?? 0, raw: consistency != null ? `${Math.round(consistency)}%` : "—", known: consistency != null },
        { axis: "Ranking", value: rankVal ?? 0, raw: agg.avgRank > 0 ? `#${agg.avgRank.toFixed(1)} avg` : "—", known: rankVal != null },
        expAxis,
      ];
    }

    // AWP axis: weighted AWP per qual match. Signature/championship/worlds AWPs
    // (much harder to earn) count triple toward the rate, so they push the spoke
    // out far faster than regular AWPs do.
    const weightedAwp = sigAwp * 3 + regularAwp;
    const awpRate = totalQualMatches > 0 ? weightedAwp / totalQualMatches : null;

    return [
      { axis: "Win Rate", value: agg.matches > 0 ? clamp100(agg.winRate * 100) : 0, raw: agg.matches > 0 ? `${Math.round(agg.winRate * 100)}%` : "—", known: agg.matches > 0 },
      { axis: "AWP", value: awpRate != null ? clamp100((awpRate / RADAR_BENCH.awpRate) * 100) : 0, raw: `${sigAwp} Sig AWP · ${regularAwp} AWP`, known: awpRate != null, standalone: true },
      { axis: "World Skills", value: wsPct ?? 0, raw: wsRaw, known: wsPct != null },
      { axis: "Consistency", value: consistency ?? 0, raw: consistency != null ? `${Math.round(consistency)}%` : "—", known: consistency != null },
      { axis: "Qual WP", value: agg.matches > 0 ? clamp100((agg.avgWp / RADAR_BENCH.avgWp) * 100) : 0, raw: agg.matches > 0 ? `${agg.avgWp.toFixed(1)} WP/match` : "—", known: agg.matches > 0 },
      expAxis,
    ];
  }, [isIq, agg, perEventAvgWp, perEventQualAvg, totalQualMatches, sigAwp, regularAwp, experience, wsEntry, leaderboard]);

  const hasAny = data.some((d) => d.known);

  return (
    <div className="about-radar" ref={cardRef}>
      <div className="about-radar-head">
        <span className="about-radar-title">Team Profile</span>
        {hasAny && (
          <button
            type="button"
            className={`about-radar-dl${confirmClass(dlDone, "success")}`}
            onClick={handleDownload}
            disabled={downloading}
            title="Download as PNG"
            aria-label="Download team profile as PNG"
          >
            <IconMorph morphed={dlDone} size={13} tone="success">
              <Download size={13} />
            </IconMorph>
          </button>
        )}
      </div>
      {hasAny ? (
        <ChartContainer config={config} className="about-radar-chart" style={{ aspectRatio: "auto" }}>
          <RadarChart data={data} margin={{ top: 8, right: 30, bottom: 8, left: 30 }} outerRadius="70%">
            <ChartTooltip
              cursor={false}
              content={(props) => {
                const { active, payload } = props as unknown as {
                  active?: boolean;
                  payload?: ReadonlyArray<{ payload?: RadarAxis }>;
                };
                const row = payload?.[0]?.payload;
                if (!active || !row) return null;
                return (
                  <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                    {!row.standalone && <span className="text-muted-foreground">{row.axis} · </span>}
                    <span className="font-mono font-medium tabular-nums">{row.raw}</span>
                  </div>
                );
              }}
            />
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="axis" tick={{ fill: "var(--text-muted)", fontSize: 10.5 }} />
            <Radar
              dataKey="value"
              stroke="var(--color-value)"
              fill="var(--color-value)"
              fillOpacity={0.28}
              strokeWidth={1.5}
              isAnimationActive={false}
              dot={false}
            />
          </RadarChart>
        </ChartContainer>
      ) : (
        <div className="about-radar-empty">Not enough data yet</div>
      )}
    </div>
  );
}

function TeamAboutTab({
  team,
  isIq,
  seasonId,
  seasonLabel,
  rankings,
  skills,
  matches,
  awards,
  allEvents,
  seasonsActive,
  eventIndex,
  loading,
  compact = false,
}: {
  team: Team;
  isIq: boolean;
  seasonId: number | null;
  seasonLabel?: string;
  rankings: Ranking[];
  skills: Skill[];
  matches: Match[];
  awards: Award[];
  allEvents: Event[];
  seasonsActive: number; // number of seasons the team has competed in (career)
  eventIndex: Map<number, Event>;
  loading: boolean;
  // Compact mode (quick-view panel): keep only the two most useful charts.
  compact?: boolean;
}) {
  const grade = team.grade ?? "";
  const worldSkills = useAsync(async () => {
    if (!seasonId || !grade) return null;
    return loadWorldSkills(seasonId, grade);
  }, [seasonId, grade]);

  const wsEntry = useMemo(() => {
    if (!worldSkills.data) return null;
    return (
      worldSkills.data.find((e) => e.team.id === team.id) ??
      worldSkills.data.find((e) => e.team.team?.toUpperCase() === team.number.toUpperCase()) ??
      null
    );
  }, [worldSkills.data, team.id, team.number]);

  const years = useMemo(() => {
    const ys = allEvents.map((e) => eventDayYear(e.start) ?? 0).filter((y) => y > 0);
    if (!ys.length) return null;
    return { first: Math.min(...ys), last: Math.max(...ys) };
  }, [allEvents]);

  const rankRows = useMemo(() => {
    const dateOf = (eventId: number) => {
      const ev = eventIndex.get(eventId);
      return ev?.start ? new Date(ev.start).getTime() : 0;
    };

    // Actual W/L/T per event from the team's real matches, including
    // elimination matches. VEX ranking tables only reflect qualification
    // records, so we derive the true record from match results. IQ is a
    // cooperative format with no head-to-head win/loss, so it keeps the
    // ranking-based numbers.
    const matchRecord = new Map<number, { wins: number; losses: number; ties: number }>();
    if (!isIq) {
      matches.forEach((match) => {
        if (/practice/i.test(match.name)) return;
        if (isScrimmageEvent(eventIndex.get(match.event.id))) return;
        const color = teamAllianceColor(match, team.id);
        if (!color) return;
        const { winner } = matchWinner(match);
        if (winner === "-") return; // not yet scored
        const rec = matchRecord.get(match.event.id) ?? { wins: 0, losses: 0, ties: 0 };
        if (winner === "Tie") rec.ties += 1;
        else if (winner.toLowerCase() === color.toLowerCase()) rec.wins += 1;
        else rec.losses += 1;
        matchRecord.set(match.event.id, rec);
      });
    }

    const rankingByEvent = new Map<number, Ranking>();
    rankings.forEach((r) => {
      if (!isScrimmageEvent(eventIndex.get(r.event.id))) rankingByEvent.set(r.event.id, r);
    });

    const eventIds = new Set<number>([...rankingByEvent.keys(), ...matchRecord.keys()]);

    // Group matches by event for IQ finalist seed computation
    const matchesByEvent = new Map<number, Match[]>();
    if (isIq) {
      matches.forEach((m) => {
        const list = matchesByEvent.get(m.event.id) ?? [];
        list.push(m);
        matchesByEvent.set(m.event.id, list);
      });
    }

    return [...eventIds]
      .sort((a, b) => dateOf(a) - dateOf(b))
      .map((eventId) => {
        const r = rankingByEvent.get(eventId);
        const rec = matchRecord.get(eventId);
        // Qualification-only counts (used for WP-based metrics).
        const qualWins = r?.wins ?? 0;
        const qualTies = r?.ties ?? 0;
        const qualMatches = qualWins + (r?.losses ?? 0) + qualTies;
        // Full record incl. eliminations (match-derived when available).
        const wins = rec ? rec.wins : qualWins;
        const losses = rec ? rec.losses : (r?.losses ?? 0);
        const ties = rec ? rec.ties : qualTies;
        const matchCount = wins + losses + ties;
        const wp = r?.wp ?? 0;
        const ev = eventIndex.get(eventId);
        const evMatches = isIq ? (matchesByEvent.get(eventId) ?? []) : [];
        const finalistSeed = isIq ? (iqTeamFinals(evMatches, team.id)?.seed ?? null) : null;
        // True qualification average — counts EVERY qual match (round 2), unlike
        // the API's `average_points` which drops the lowest scores per the IQ rule.
        const qualScores = isIq
          ? evMatches
              .filter((m) => m.round === 2)
              .map((m) => m.alliances.find((a) => isTeamInAlliance(a, team.id))?.score)
              .filter((s): s is number => s != null)
          : [];
        const allQualAvg = qualScores.length ? qualScores.reduce((s, v) => s + v, 0) / qualScores.length : 0;
        // Best finals (teamwork) score for this team at this event.
        const finalsScores = isIq
          ? evMatches
              .filter((m) => isIqFinalsMatch(m) && m.alliances.some((a) => isTeamInAlliance(a, team.id)))
              .map((m) => {
                const red = m.alliances.find((a) => a.color === "red");
                const blue = m.alliances.find((a) => a.color === "blue");
                return Math.max(red?.score ?? 0, blue?.score ?? 0);
              })
          : [];
        const finalsScore = finalsScores.length ? Math.max(...finalsScores) : 0;
        return {
          name: ev?.name ?? r?.event.name ?? `Event ${eventId}`,
          id: eventId,
          sku: ev?.sku ?? null,
          date: dateOf(eventId),
          marquee: isMarqueeEvent(ev),
          rank: r?.rank ?? 0,
          wins,
          losses,
          ties,
          matches: matchCount,
          qualMatches,
          wp,
          awp: Math.max(0, wp - (qualWins * 2 + qualTies)),
          winRate: matchCount ? wins / matchCount : 0,
          avgWp: qualMatches ? wp / qualMatches : 0,
          allQualAvg,
          finalsScore,
          highScore: r?.high_score ?? 0,
          finalistSeed,
        };
      });
  }, [rankings, matches, eventIndex, isIq, team.id]);

  const skillRows = useMemo(() => {
    const dateOf = (eventId: number) => {
      const ev = eventIndex.get(eventId);
      return ev?.start ? new Date(ev.start).getTime() : 0;
    };
    const byEvent = new Map<number, { driver: number; prog: number }>();
    skills.forEach((s) => {
      if (isScrimmageEvent(eventIndex.get(s.event.id))) return;
      const cur = byEvent.get(s.event.id) ?? { driver: 0, prog: 0 };
      const score = s.score ?? 0;
      if ((s.type ?? "").toLowerCase().includes("driver")) cur.driver = Math.max(cur.driver, score);
      else cur.prog = Math.max(cur.prog, score);
      byEvent.set(s.event.id, cur);
    });
    return [...byEvent.entries()]
      .map(([eventId, v]) => ({
        name: eventIndex.get(eventId)?.name ?? `Event ${eventId}`,
        id: eventId,
        sku: eventIndex.get(eventId)?.sku ?? null,
        date: dateOf(eventId),
        marquee: isMarqueeEvent(eventIndex.get(eventId)),
        driver: v.driver,
        prog: v.prog,
        combined: v.driver + v.prog,
      }))
      .sort((a, b) => a.date - b.date);
  }, [skills, eventIndex]);

  const agg = useMemo(() => {
    const wins = rankRows.reduce((s, r) => s + r.wins, 0);
    const losses = rankRows.reduce((s, r) => s + r.losses, 0);
    const ties = rankRows.reduce((s, r) => s + r.ties, 0);
    const matches = wins + losses + ties;
    const qualMatches = rankRows.reduce((s, r) => s + r.qualMatches, 0);
    const wp = rankRows.reduce((s, r) => s + r.wp, 0);
    const awp = rankRows.reduce((s, r) => s + r.awp, 0);
    const bestDriver = skillRows.reduce((m, r) => Math.max(m, r.driver), 0);
    const bestProg = skillRows.reduce((m, r) => Math.max(m, r.prog), 0);
    const highScore = rankRows.reduce((m, r) => Math.max(m, r.highScore), 0);
    const rankedRows = rankRows.filter((r) => r.rank > 0);
    const avgRank = rankedRows.length ? rankedRows.reduce((s, r) => s + r.rank, 0) / rankedRows.length : 0;
    const finalistSeeds = rankRows.map((r) => r.finalistSeed).filter((s): s is number => s !== null);
    const avgFinalistRank = finalistSeeds.length ? finalistSeeds.reduce((s, v) => s + v, 0) / finalistSeeds.length : 0;
    return {
      wins,
      losses,
      ties,
      matches,
      wp,
      awp,
      winRate: matches ? wins / matches : 0,
      avgWp: qualMatches ? wp / qualMatches : 0,
      bestDriver,
      bestProg,
      bestCombined: bestDriver + bestProg,
      highScore,
      events: rankRows.length,
      avgRank,
      avgFinalistRank,
      finalistEventCount: finalistSeeds.length,
    };
  }, [rankRows, skillRows]);

  // Experience axis inputs — raw season-scoped résumé counts. Titles and deep
  // elim/finals runs at signature/championship events dominate; volume adds a
  // little; longevity is measured in seasons. experienceScore() maps these to
  // the 0–100 axis value against EXP_MODEL's per-factor caps.
  const experience = useMemo<ExperienceInputs>(() => {
    // The team's own real (non-practice, non-scrimmage) matches, grouped by event.
    const matchesByEvent = new Map<number, Match[]>();
    matches.forEach((m) => {
      if (/practice/i.test(m.name)) return;
      if (isScrimmageEvent(eventIndex.get(m.event.id))) return;
      if (!m.alliances.some((a) => isTeamInAlliance(a, team.id))) return;
      const list = matchesByEvent.get(m.event.id) ?? [];
      list.push(m);
      matchesByEvent.set(m.event.id, list);
    });

    // Champion / finalist / semifinalist awards this team actually won, by event.
    // `worldsWonAt` marks the top-tier titles (worlds), which count double.
    const wonAt = new Set<number>();
    const worldsWonAt = new Set<number>();
    const finalistAt = new Set<number>();
    const sfAt = new Set<number>();
    awards.forEach((a) => {
      if (isScrimmageEvent(eventIndex.get(a.event.id))) return;
      if (!awardTeamWinners(a).some((wnr) => wnr.team.id === team.id)) return;
      if (EXP_CHAMP_RE.test(a.title)) {
        wonAt.add(a.event.id);
        if (EXP_WORLDS_TITLE_RE.test(a.title)) worldsWonAt.add(a.event.id);
      } else if (EXP_SF_RE.test(a.title)) sfAt.add(a.event.id); // before finalist: "Semifinalists" ⊃ "finalists"
      else if (EXP_FINALIST_RE.test(a.title)) finalistAt.add(a.event.id);
    });

    const eventIds = new Set<number>([...matchesByEvent.keys(), ...wonAt, ...finalistAt, ...sfAt]);
    let titleUnits = 0, sigTitles = 0, sigFinals = 0, sigSF = 0, sigElims = 0;
    let sigEvents = 0, finalsGeneral = 0, elimsGeneral = 0;

    eventIds.forEach((eid) => {
      const ev = eventIndex.get(eid);
      const marquee = isMarqueeEvent(ev);
      const evMatches = matchesByEvent.get(eid) ?? [];

      // How far the team went at this event (from match names / IQ finals round).
      let reachedElims = false, reachedSF = false, reachedFinals = false;
      if (isIq) {
        reachedFinals = evMatches.some((m) => isIqFinalsMatch(m));
      } else {
        for (const m of evMatches) {
          const key = playoffRoundKey(m);
          if (key === "r16" || key === "qf" || key === "sf" || key === "f") reachedElims = true;
          if (key === "sf" || key === "f") reachedSF = true;
          if (key === "f") reachedFinals = true;
        }
      }
      const champion = wonAt.has(eid);
      const finalist = finalistAt.has(eid) || reachedFinals; // reached finals but didn't win
      const semifinal = !isIq && (sfAt.has(eid) || reachedSF);

      // General (any-level) tallies.
      if (champion || finalist) finalsGeneral += 1;
      if (!isIq && (champion || semifinal || reachedElims)) elimsGeneral += 1;

      // Signature/championship depth — count each marquee event's single best tier.
      if (marquee) {
        sigEvents += 1;
        if (champion) { sigTitles += 1; titleUnits += worldsWonAt.has(eid) ? 2 : 1; }
        else if (finalist) sigFinals += 1;
        else if (semifinal) sigSF += 1;
        else if (!isIq && reachedElims) sigElims += 1;
      }
    });

    return {
      titleUnits,
      sigTitles,
      sigFinals,
      sigSF,
      sigElims,
      sigEvents,
      finalsGeneral,
      elimsGeneral,
      seasonsActive,
      matchCount: agg.matches,
      eventCount: agg.events,
      known: agg.matches > 0 || sigEvents > 0,
    };
  }, [isIq, matches, awards, eventIndex, team.id, agg.matches, agg.events, seasonsActive]);

  if (loading && !rankRows.length && !skillRows.length) {
    return (
      <div className="about-wrap">
        <Status loading={true} error={null} />
      </div>
    );
  }

  const winRateAccent = agg.winRate >= 0.6 ? "green" : agg.winRate >= 0.4 ? "amber" : "red";
  const wsValue = worldSkills.loading ? "…" : wsEntry ? `#${wsEntry.rank.toLocaleString()}` : "Unranked";
  const wsSub = worldSkills.loading
    ? "Loading leaderboard…"
    : wsEntry
      ? `${wsEntry.scores.score} pts`
      : worldSkills.error
        ? "Leaderboard unavailable"
        : "No ranked skills run";

  const hasComp = rankRows.length > 0;
  const hasSkills = skillRows.some((r) => r.combined > 0);
  // IQ-only graph subsets: only plot events that actually have the metric.
  const finalsRows = rankRows.filter((r) => r.finalsScore > 0);
  const rankedRows = rankRows.filter((r) => r.rank > 0);

  return (
    <div className="about-wrap">
      <dl className="about-profile">
        <AboutProfileRow label="Location">{locationLine(team) || "—"}</AboutProfileRow>
        <AboutProfileRow label="Grade">{team.grade || "Unknown"}</AboutProfileRow>
        <AboutProfileRow label="Program">
          <ProgramBadge program={team.program} />
        </AboutProfileRow>
        <AboutProfileRow label="Status">
          <span className={`about-status ${team.registered ? "active" : "inactive"}`}>{team.registered ? "Active" : "Inactive"}</span>
        </AboutProfileRow>
        <AboutProfileRow label="Years Active">
          {years ? (years.first === years.last ? `${years.first}` : `${years.first} – ${team.registered ? "present" : years.last}`) : "—"}
        </AboutProfileRow>
      </dl>

      <div className={compact ? "about-overview about-overview--solo" : "about-overview"}>
      <div className="about-stats">
        <StatCard label="World Skills" accent="blue" icon={<Medal size={14} />} value={wsValue} sub={wsSub} />
        <StatCard
          label="Best Skills Score"
          accent="blue"
          icon={<Activity size={14} />}
          value={agg.bestCombined || "—"}
          sub={agg.bestCombined ? `${agg.bestDriver} driver ${agg.bestProg} auton` : "No skills runs"}
        />
        <StatCard label="Events" accent="gray" icon={<CalendarDays size={14} />} value={agg.events || "—"} sub={seasonLabel} />
        {isIq ? (
          <>
            <StatCard label="High Score" accent="amber" icon={<Trophy size={14} />} value={agg.highScore || "—"} sub="Best qualifying match" />
            <StatCard label="Avg Rank" accent="blue" icon={<BarChart3 size={14} />} value={agg.avgRank ? `#${agg.avgRank.toFixed(1)}` : "—"} sub="Qual ranking across events" />
            <StatCard label="Avg Finalist Rank" accent="green" icon={<Medal size={14} />} value={agg.avgFinalistRank ? `#${agg.avgFinalistRank.toFixed(1)}` : "—"} sub={agg.finalistEventCount ? `${agg.finalistEventCount} event${agg.finalistEventCount === 1 ? "" : "s"} w/ finals` : "No finals appearances"} />
          </>
        ) : (
          <>
            <StatCard label="Win Rate" accent={winRateAccent} icon={<BarChart3 size={14} />} value={agg.matches ? `${Math.round(agg.winRate * 100)}%` : "—"} sub={agg.matches ? `${agg.wins}-${agg.losses}-${agg.ties} record` : "No matches"} />
            <StatCard label="Total Matches" accent="gray" icon={<Gamepad2 size={14} />} value={agg.matches || "—"} sub={`${agg.events} events`} />
            <StatCard label="Autonomous WP" accent="green" icon={<Trophy size={14} />} value={agg.awp} sub={`${agg.avgWp.toFixed(1)} avg WP / match`} />
          </>
        )}
      </div>
      {!compact && (
        <TeamRadar
          isIq={isIq}
          agg={agg}
          perEventAvgWp={rankRows.map((r) => r.avgWp)}
          perEventQualAvg={rankRows.map((r) => r.allQualAvg)}
          totalQualMatches={rankRows.reduce((s, r) => s + r.qualMatches, 0)}
          sigAwp={rankRows.reduce((s, r) => s + (r.marquee ? r.awp : 0), 0)}
          regularAwp={rankRows.reduce((s, r) => s + (r.marquee ? 0 : r.awp), 0)}
          experience={experience}
          teamLabel={team.number}
          wsEntry={wsEntry}
          leaderboard={worldSkills.data ?? null}
        />
      )}
      </div>

      {!hasComp && !hasSkills ? (
        <Panel title="Performance" icon={<BarChart3 size={18} />}>
          <div className="about-panel-body">
            <div className="about-chart-empty">No competition or skills data recorded for this season yet.</div>
          </div>
        </Panel>
      ) : (
        <div className="about-charts">
          {!isIq && hasComp && (
            <Panel title="Win Rate Over Time" icon={<BarChart3 size={18} />}>
              <div className="about-panel-body">
                <TrendChart
                  area
                  labels={rankRows.map((r) => shortMonthYear(r.date))}
                  tips={rankRows.map((r) => r.name)}
                  links={rankRows.map((r) => eventPath({ sku: r.sku, id: r.id }))}
                  series={[{ name: "Win rate", color: "#337ab7", values: rankRows.map((r) => r.winRate * 100) }]}
                  markers={rankRows.map((r) => r.marquee)}
                  yFloor={0}
                  yCeil={100}
                  yFormat={(v) => `${Math.round(v)}%`}
                />
              </div>
            </Panel>
          )}

          {hasSkills && (
            <Panel title="Skills Score Over Time" icon={<Activity size={18} />}>
              <div className="about-panel-body">
                <div className="about-legend">
                  <span>
                    <i style={{ background: "#337ab7" }} /> Driver
                  </span>
                  <span>
                    <i style={{ background: "#8e44ad" }} /> Autonomous
                  </span>
                </div>
                <TrendChart
                  labels={skillRows.map((r) => shortMonthYear(r.date))}
                  tips={skillRows.map((r) => r.name)}
                  links={skillRows.map((r) => eventPath({ sku: r.sku, id: r.id }))}
                  series={[
                    { name: "Driver", color: "#337ab7", values: skillRows.map((r) => r.driver) },
                    { name: "Autonomous", color: "#8e44ad", values: skillRows.map((r) => r.prog) },
                  ]}
                  markers={skillRows.map((r) => r.marquee)}
                  yFloor={0}
                />
              </div>
            </Panel>
          )}

          {isIq && hasComp && (
            <Panel title="Avg Score Over Time" icon={<BarChart3 size={18} />}>
              <div className="about-panel-body">
                <TrendChart
                  area
                  labels={rankRows.map((r) => shortMonthYear(r.date))}
                  tips={rankRows.map((r) => r.name)}
                  links={rankRows.map((r) => eventPath({ sku: r.sku, id: r.id }))}
                  series={[{ name: "Avg score", color: "#5cb85c", values: rankRows.map((r) => r.allQualAvg) }]}
                  markers={rankRows.map((r) => r.marquee)}
                  yFloor={0}
                  yFormat={(v) => v.toFixed(1)}
                />
              </div>
            </Panel>
          )}

          {!compact && isIq && finalsRows.length > 0 && (
            <Panel title="Finals Score Over Time" icon={<Trophy size={18} />}>
              <div className="about-panel-body">
                <TrendChart
                  area
                  labels={finalsRows.map((r) => shortMonthYear(r.date))}
                  tips={finalsRows.map((r) => r.name)}
                  links={finalsRows.map((r) => eventPath({ sku: r.sku, id: r.id }))}
                  series={[{ name: "Finals score", color: "#f0ad4e", values: finalsRows.map((r) => r.finalsScore) }]}
                  markers={finalsRows.map((r) => r.marquee)}
                  yFloor={0}
                  yFormat={(v) => v.toFixed(0)}
                />
              </div>
            </Panel>
          )}

          {!compact && isIq && rankedRows.length > 0 && (
            <Panel title="Rank Over Time" icon={<Medal size={18} />}>
              <div className="about-panel-body">
                <TrendChart
                  labels={rankedRows.map((r) => shortMonthYear(r.date))}
                  tips={rankedRows.map((r) => `${r.name} — #${r.rank}`)}
                  links={rankedRows.map((r) => eventPath({ sku: r.sku, id: r.id }))}
                  series={[{ name: "Qual rank", color: "#337ab7", values: rankedRows.map((r) => r.rank) }]}
                  markers={rankedRows.map((r) => r.marquee)}
                  yFloor={1}
                  yFormat={(v) => `#${Math.round(v)}`}
                />
              </div>
            </Panel>
          )}

          {!compact && !isIq && hasComp && (
            <Panel title="Avg Win Points / Match" icon={<Trophy size={18} />}>
              <div className="about-panel-body">
                <TrendChart
                  labels={rankRows.map((r) => shortMonthYear(r.date))}
                  tips={rankRows.map((r) => r.name)}
                  links={rankRows.map((r) => eventPath({ sku: r.sku, id: r.id }))}
                  series={[{ name: "Avg WP", color: "#f0ad4e", values: rankRows.map((r) => r.avgWp) }]}
                  markers={rankRows.map((r) => r.marquee)}
                  yFloor={0}
                  yFormat={(v) => v.toFixed(1)}
                />
              </div>
            </Panel>
          )}

          {!compact && !isIq && hasComp && (
            <Panel title="Autonomous Win Points Per Event" icon={<Medal size={18} />}>
              <div className="about-panel-body">
                <TrendChart
                  area
                  labels={rankRows.map((r) => shortMonthYear(r.date))}
                  tips={rankRows.map((r) => `${r.name} — ${r.awp} AWP`)}
                  links={rankRows.map((r) => eventPath({ sku: r.sku, id: r.id }))}
                  series={[{ name: "AWP", color: "#5cb85c", values: rankRows.map((r) => r.awp) }]}
                  markers={rankRows.map((r) => r.marquee)}
                  yFloor={0}
                />
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

function TeamDetail({ param }: { param: string }) {
  const [tab, setTab] = useState<TeamDetailTab>(() => hashTab(TEAM_DETAIL_TABS, "about"));
  const [playback, setPlayback] = useState<MatchPlayback | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [dateDirection, setDateDirection] = useState<DateDirection>("asc");
  const [matchesBySeason, setMatchesBySeason] = useState<Record<number, AsyncBucket<Match>>>({});
  const [rankingsBySeason, setRankingsBySeason] = useState<Record<number, AsyncBucket<Ranking>>>({});
  const [skillsBySeason, setSkillsBySeason] = useState<Record<number, AsyncBucket<Skill>>>({});
  const [awardsBySeason, setAwardsBySeason] = useState<Record<number, AsyncBucket<Award>>>({});
  const inFlightTeamData = useRef(new Set<string>());
  const lookup = useAsync(async () => {
    const parts = param.split("/").filter(Boolean).map(decodeURIComponent);
    const [a, b] = parts;
    const programCode = b ? a : undefined;
    const numberOrId = (b ?? a) ?? "";
    if (!programCode && allDigits(numberOrId)) return api.team(numberOrId);
    const res = await api.robotEventsTeams({ number: numberOrId.toUpperCase(), "program[]": vexProgramIds, per_page: 50 });
    let list = res.data;
    if (programCode) list = list.filter((entry) => programMatchesSlug(entry.program, programCode));
    return list[0] ?? null;
  }, [param]);
  const team = lookup.data ?? null;
  const loading = lookup.loading;
  const error = lookup.error ?? (!loading && !team ? "Team not found" : null);
  const id = team ? String(team.id) : "";
  const events = useAsync(
    async () => {
      if (!team) return null;
      return collectAllPages<Event>((page) => api.teamEvents(id, { per_page: 250, page }));
    },
    [id, team?.id],
  );
  const teamEvents = events.data?.data ?? [];
  const eventIndex = useMemo(() => makeEventIndex(teamEvents), [teamEvents]);
  const seasonOptions = useMemo(() => {
    const bySeason = new Map<number, { id: number; label: string; latest: number; count: number }>();

    teamEvents.forEach((event) => {
      const latest = new Date(event.start ?? 0).getTime();
      const existing = bySeason.get(event.season.id);
      if (!existing) {
        bySeason.set(event.season.id, { id: event.season.id, label: shortSeasonName(event.season.name), latest, count: 1 });
        return;
      }

      existing.latest = Math.max(existing.latest, latest);
      existing.count += 1;
    });

    return [...bySeason.values()].sort((a, b) => b.latest - a.latest || b.id - a.id);
  }, [teamEvents]);
  const seasonEvents = useMemo(
    () => teamEvents.filter((event) => !selectedSeasonId || event.season.id === selectedSeasonId).sort(compareEventsByDirection(dateDirection)),
    [dateDirection, teamEvents, selectedSeasonId],
  );
  const selectedSeason = seasonOptions.find((season) => season.id === selectedSeasonId);
  const selectedMatches = selectedSeasonId ? (matchesBySeason[selectedSeasonId] ?? emptyBucket<Match>()) : emptyBucket<Match>();
  const selectedRankings = selectedSeasonId ? (rankingsBySeason[selectedSeasonId] ?? emptyBucket<Ranking>()) : emptyBucket<Ranking>();
  const selectedSkills = selectedSeasonId ? (skillsBySeason[selectedSeasonId] ?? emptyBucket<Skill>()) : emptyBucket<Skill>();
  const selectedAwards = selectedSeasonId ? (awardsBySeason[selectedSeasonId] ?? emptyBucket<Award>()) : emptyBucket<Award>();
  const activeStatus =
    tab === "about"    ? selectedRankings :
    tab === "events"   ? events :
    tab === "rankings" ? selectedRankings :
    tab === "skills"   ? selectedSkills :
    selectedAwards;

  useEffect(() => {
    if (seasonOptions[0] && (!selectedSeasonId || !seasonOptions.some((season) => season.id === selectedSeasonId))) {
      setSelectedSeasonId(seasonOptions[0].id);
    }
  }, [selectedSeasonId, seasonOptions]);

  useEffect(() => {
    const handler = () => setTab(hashTab(TEAM_DETAIL_TABS, "about"));
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  useEffect(() => {
    replaceCurrentHash(tab);
  }, [tab]);

  useEffect(() => {
    setMatchesBySeason({});
    setRankingsBySeason({});
    setSkillsBySeason({});
    setAwardsBySeason({});
    inFlightTeamData.current.clear();
  }, [id]);

  // Record this team in recently-viewed history once loaded
  useEffect(() => {
    if (!team) return;
    pushRecentlyViewed({
      path: window.location.pathname,
      type: "team",
      label: team.number ?? String(team.id),
      sub: [team.team_name, locationLine(team)].filter(Boolean).join(" · "),
      badge: programSlug(team.program) || team.program?.code || "VEX",
    });
    refreshTrailLabel(window.location.pathname, team.number ?? String(team.id));
  }, [team?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose current team to the global C shortcut handler
  useEffect(() => {
    _currentTeam = team ?? null;
    return () => { _currentTeam = null; };
  }, [team?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!team || !seasonOptions.length) return;
    const seasonIds = new Set<number>(seasonOptions.slice(0, 2).map((season) => season.id));
    if (selectedSeasonId) seasonIds.add(selectedSeasonId);

    const markLoading = <T,>(setter: Dispatch<SetStateAction<Record<number, AsyncBucket<T>>>>, seasonId: number) => {
      setter((current) => ({ ...current, [seasonId]: { ...(current[seasonId] ?? emptyBucket<T>()), loading: true, error: null } }));
    };

    const markDone = <T,>(setter: Dispatch<SetStateAction<Record<number, AsyncBucket<T>>>>, seasonId: number, data: T[]) => {
      setter((current) => ({ ...current, [seasonId]: { data, loading: false, error: null } }));
    };

    const markError = <T,>(setter: Dispatch<SetStateAction<Record<number, AsyncBucket<T>>>>, seasonId: number, message: string) => {
      setter((current) => ({ ...current, [seasonId]: { ...(current[seasonId] ?? emptyBucket<T>()), loading: false, error: message } }));
    };

    seasonIds.forEach((seasonId) => {
      const tasks: Array<{
        kind: TeamDataKind;
        loaded: boolean;
        run: () => Promise<unknown[]>;
        markLoading: () => void;
        markDone: (data: unknown[]) => void;
        markError: (message: string) => void;
      }> = [
        {
          kind: "matches",
          loaded: !!matchesBySeason[seasonId],
          run: async () => (await collectAllPages<Match>((page) => api.teamMatches(id, { "season[]": [seasonId], per_page: 250, page }))).data,
          markLoading: () => markLoading(setMatchesBySeason, seasonId),
          markDone: (data) => markDone(setMatchesBySeason, seasonId, data as Match[]),
          markError: (message) => markError(setMatchesBySeason, seasonId, message),
        },
        {
          kind: "rankings",
          loaded: !!rankingsBySeason[seasonId],
          run: async () => (await collectAllPages<Ranking>((page) => api.teamRankings(id, { "season[]": [seasonId], per_page: 250, page }))).data,
          markLoading: () => markLoading(setRankingsBySeason, seasonId),
          markDone: (data) => markDone(setRankingsBySeason, seasonId, data as Ranking[]),
          markError: (message) => markError(setRankingsBySeason, seasonId, message),
        },
        {
          kind: "skills",
          loaded: !!skillsBySeason[seasonId],
          run: async () => (await collectAllPages<Skill>((page) => api.teamSkills(id, { "season[]": [seasonId], per_page: 250, page }))).data,
          markLoading: () => markLoading(setSkillsBySeason, seasonId),
          markDone: (data) => markDone(setSkillsBySeason, seasonId, data as Skill[]),
          markError: (message) => markError(setSkillsBySeason, seasonId, message),
        },
        {
          kind: "awards",
          loaded: !!awardsBySeason[seasonId],
          run: async () => (await collectAllPages<Award>((page) => api.teamAwards(id, { "season[]": [seasonId], per_page: 250, page }))).data,
          markLoading: () => markLoading(setAwardsBySeason, seasonId),
          markDone: (data) => markDone(setAwardsBySeason, seasonId, data as Award[]),
          markError: (message) => markError(setAwardsBySeason, seasonId, message),
        },
      ];

      tasks.forEach((task) => {
        const key = `${id}:${seasonId}:${task.kind}`;
        if (task.loaded || inFlightTeamData.current.has(key)) return;
        inFlightTeamData.current.add(key);
        task.markLoading();
        task
          .run()
          .then(task.markDone)
          .catch((err: Error) => task.markError(err.message))
          .finally(() => inFlightTeamData.current.delete(key));
      });
    });
  }, [
    awardsBySeason,
    id,
    matchesBySeason,
    rankingsBySeason,
    seasonOptions,
    selectedSeasonId,
    skillsBySeason,
    team,
  ]);

  if (loading || error || !team) {
    return (
      <section className="page">
        <Status loading={loading} error={error} />
      </section>
    );
  }

  const isIq = isIqProgramInfo(team.program);

  return (
    <ProgramContext.Provider value={programSlug(team.program)}>
    <section className="page">
      <Breadcrumbs currentTab={TEAM_TAB_CRUMB[tab]} />
      <div className="profile-header">
        <div>
          <div className="eyebrow">
            <Users size={16} /> Team {team.number}
          </div>
          <h1>
            {team.number}
            {team.team_name ? ` - ${team.team_name}` : ""}
          </h1>
          <p>
            {team.organization
              ? <TranslatedText text={team.organization} country={team.location?.country} />
              : (team.robot_name || "VEX Robotics team")}
          </p>
          <div className="meta-line">
            <ProgramBadge program={team.program} />
            <span>{locationLine(team)}</span>
            <span>{team.grade ?? "Grade unknown"}</span>
            <span>{team.registered ? "Registered" : "Inactive"}</span>
          </div>
        </div>
        <div className="profile-header-actions">
          <SharedTeamFavoriteButton kind="team" refId={String(team.id)} />
          <FavoriteButton id={team.id} kind="team" />
        </div>
      </div>

      <div className="view-tabs view-tabs-vertical">
      <Tabs
        active={tab}
        onChange={(next) => setTab(next as TeamDetailTab)}
        orientation="vertical"
        tabs={[
          ["about", "About", <Info size={15} />],
          ["events", `Events ${seasonEvents.length || ""}`, <CalendarDays size={15} />],
          ["rankings", "Rankings", <BarChart3 size={15} />],
          ["skills", "Skills", <Activity size={15} />],
          ["awards", "Awards", <AwardIcon size={15} />],
        ]}
      />
      <div className="view-tabs-body">
      <SeasonSelector
        seasons={seasonOptions}
        selectedSeasonId={selectedSeasonId}
        onChange={setSelectedSeasonId}
        loading={events.loading}
      />
      {tab !== "about" && <DateDirectionToggle direction={dateDirection} onChange={setDateDirection} />}
      {tab !== "about" && <Status loading={activeStatus.loading} error={activeStatus.error} />}
      <CrossFade trigger={`${tab}:${selectedSeasonId}`}>
      {tab === "about" && (
        <TeamAboutTab
          team={team}
          isIq={isIq}
          seasonId={selectedSeasonId}
          seasonLabel={selectedSeason?.label}
          rankings={selectedRankings.data}
          skills={selectedSkills.data}
          matches={selectedMatches.data}
          awards={selectedAwards.data}
          allEvents={teamEvents}
          seasonsActive={seasonOptions.length}
          eventIndex={eventIndex}
          loading={
            events.loading ||
            (selectedSeasonId != null && (!rankingsBySeason[selectedSeasonId] || !skillsBySeason[selectedSeasonId] || !awardsBySeason[selectedSeasonId])) ||
            selectedRankings.loading ||
            selectedSkills.loading ||
            selectedMatches.loading ||
            selectedAwards.loading
          }
        />
      )}
      {!activeStatus.loading && tab === "events" && (
        <TeamEventCards
          events={seasonEvents}
          matches={selectedMatches.data}
          rankings={selectedRankings.data}
          skills={selectedSkills.data}
          awards={selectedAwards.data}
          focusTeamId={team.id}
          isIq={isIq}
          detailsLoading={selectedMatches.loading || selectedRankings.loading || selectedSkills.loading || selectedAwards.loading}
          onViewMatches={(eventId) => {
            const ev = eventIndex.get(eventId);
            navigate(urlWithHash(`${ev ? eventPath(ev) : `/event/${eventId}`}?focusTeam=${team.id}&focusTeamNum=${encodeURIComponent(team.number)}`, "team-matches"));
          }}
          onOpenMatch={(match, timestamp) => setPlayback({ match, timestamp })}
        />
      )}
      {!activeStatus.loading && tab === "rankings" && (
        <TeamRankingsByEvent
          rankings={selectedRankings.data}
          matches={selectedMatches.data}
          eventIndex={eventIndex}
          seasonId={selectedSeasonId}
          direction={dateDirection}
          focusTeamId={team.id}
          isIq={isIq}
          onViewMatches={(eventId) => {
            const ev = eventIndex.get(eventId);
            navigate(urlWithHash(`${ev ? eventPath(ev) : `/event/${eventId}`}?focusTeam=${team.id}&focusTeamNum=${encodeURIComponent(team.number)}`, "team-matches"));
          }}
        />
      )}
      {!activeStatus.loading && tab === "skills" && (
        <TeamSkillsByEvent
          skills={selectedSkills.data}
          eventIndex={eventIndex}
          seasonId={selectedSeasonId}
          direction={dateDirection}
          onViewMatches={(eventId) => {
            const ev = eventIndex.get(eventId);
            navigate(urlWithHash(`${ev ? eventPath(ev) : `/event/${eventId}`}?focusTeam=${team.id}&focusTeamNum=${encodeURIComponent(team.number)}`, "team-matches"));
          }}
        />
      )}
      {!activeStatus.loading && tab === "awards" && (
        <TeamAwardsByEvent
          awards={selectedAwards.data}
          eventIndex={eventIndex}
          seasonId={selectedSeasonId}
          focusTeamId={team.id}
          focusTeamNumber={team.number}
          direction={dateDirection}
        />
      )}
      </CrossFade>
      </div>
      </div>
      {playback && <MatchVideoOverlay playback={playback} onClose={() => setPlayback(null)} />}
    </section>
    </ProgramContext.Provider>
  );
}

// Picklist action inside the quick-view panel. Split into its own component so
// the picklist hooks are only mounted (and only run) when there's a shared team + event
// context — keeping hook calls unconditional within this component.
function QuickViewPicklistButton({ sharedTeamId, eventId, teamId, teamNumber, teamName }: { sharedTeamId: string; eventId: string; teamId: string; teamNumber: string; teamName?: string }) {
  const inList = useIsInPicklist(sharedTeamId, eventId, teamId);
  return (
    <button
      type="button"
      className={`quick-view-action${inList ? " active" : ""}`}
      onClick={() => {
        if (inList) void removeFromPicklist(sharedTeamId, eventId, teamId);
        else void addToPicklist(sharedTeamId, eventId, { teamId, teamNumber, teamName });
      }}
    >
      <IconMorph morphed={inList} size={14} tone="inherit">
        <Plus size={14} />
      </IconMorph>
      {inList ? "On picklist" : "Picklist"}
    </button>
  );
}

// Quick look at a team at the current event — stats + match table, plus quick
// actions. Two desktop modes (a setting): a docked sidebar that pushes the page
// content aside (default), or a bottom-center sheet. Centered modal on narrow
// screens. Self-contained: loads the team and its latest season's data on its own.
function TeamQuickView({ state, onClose }: { state: NonNullable<QuickViewState>; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Sidebar (default) docks beside the page content; sheet slides up from the
  // bottom. Side is a setting; "adaptive" follows the opening click's half.
  const modeSetting = useQuickViewMode();
  const sideSetting = useQuickViewSide();
  // Opened from inside the match-video modal: force a bottom sheet that layers
  // above the video dialog (see the `in-video` styles), ignoring the mode/side
  // settings so it never docks behind the darkened dialog backdrop.
  const inVideo = useRef(_videoOverlayOpen).current;
  const mode = (inVideo || state.forceSheet) ? "sheet" : modeSetting;
  const side: "left" | "right" = sideSetting === "adaptive" ? (state.pointerSide ?? "right") : sideSetting;
  // Animated close: drop `.open` so the slide-out transition plays, then tell
  // the store to unmount once it finishes. Every close path funnels through here.
  // The timer is cleared on unmount so a panel replaced mid-close (openQuickView
  // remounts via the seq key) can't close its successor.
  const closingRef = useRef(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setMounted(false);
    closeTimer.current = window.setTimeout(onClose, 240);
  }, [onClose]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  // Register this panel so openQuickView can toggle/transition it (teamKey tracks
  // the currently shown team, so an in-place swap updates it).
  useEffect(() => {
    const handle = { teamKey: quickViewKey(state), isClosing: () => closingRef.current, requestClose };
    _quickViewHandle = handle;
    return () => { if (_quickViewHandle === handle) _quickViewHandle = null; };
  }, [state, requestClose]);
  const sharedTeams = useSharedTeams();
  const primarySharedTeam = sharedTeams[0] ?? null;
  // Capture the event context once — quick view is opened from an event, and the
  // panel closes on navigation, so these stay valid for its lifetime.
  const contextEventId = useRef(_currentEventId).current;
  const contextSeasonId = useRef(_currentEventSeasonId).current;
  const eventIdForPicklist = contextEventId;

  // Resolve the team. Most entry points pass a numeric id; alliance-seed links only
  // know the number + program, so fall back to a number lookup (like TeamDetail).
  const teamQ = useAsync(async () => {
    if (state.teamId != null) return api.team(state.teamId);
    const res = await api.robotEventsTeams({ number: state.teamNumber.toUpperCase(), "program[]": vexProgramIds, per_page: 50 });
    let list = res.data;
    const slug = state.programCode;
    if (slug) list = list.filter((entry) => programMatchesSlug(entry.program, slug));
    return list[0] ?? null;
  }, [state.teamId, state.teamNumber, state.programCode]);
  const team = teamQ.data ?? null;
  const teamId = team?.id ?? state.teamId ?? null; // resolved numeric id for data queries
  const inTray = useIsInTray(teamId ?? 0);

  const eventsQ = useAsync(
    async () => (teamId != null ? collectAllPages<Event>((page) => api.teamEvents(teamId, { per_page: 250, page })) : null),
    [teamId],
  );
  const teamEvents = eventsQ.data?.data ?? [];

  const latestSeason = useMemo(() => {
    const bySeason = new Map<number, { id: number; label: string; latest: number }>();
    teamEvents.forEach((ev) => {
      const latest = new Date(ev.start ?? 0).getTime();
      const existing = bySeason.get(ev.season.id);
      if (!existing) bySeason.set(ev.season.id, { id: ev.season.id, label: shortSeasonName(ev.season.name), latest });
      else existing.latest = Math.max(existing.latest, latest);
    });
    return [...bySeason.values()].sort((a, b) => b.latest - a.latest)[0] ?? null;
  }, [teamEvents]);
  // Prefer the season of the event we were opened from, so its data is loaded.
  const seasonId = contextSeasonId ?? latestSeason?.id ?? null;

  const rankingsQ = useAsync(
    async () => (teamId != null && seasonId ? (await collectAllPages<Ranking>((page) => api.teamRankings(teamId, { "season[]": [seasonId], per_page: 250, page }))).data : []),
    [teamId, seasonId],
  );
  const skillsQ = useAsync(
    async () => (teamId != null && seasonId ? (await collectAllPages<Skill>((page) => api.teamSkills(teamId, { "season[]": [seasonId], per_page: 250, page }))).data : []),
    [teamId, seasonId],
  );
  const matchesQ = useAsync(
    async () => (teamId != null && seasonId ? (await collectAllPages<Match>((page) => api.teamMatches(teamId, { "season[]": [seasonId], per_page: 250, page }))).data : []),
    [teamId, seasonId],
  );

  // ── The event we were opened from: ranking, this team's matches, skills ──
  const eventRanking = useMemo(
    () => (contextEventId != null ? (rankingsQ.data ?? []).find((r) => r.event.id === contextEventId) ?? null : null),
    [rankingsQ.data, contextEventId],
  );
  const eventMatches = useMemo(
    () => (contextEventId != null ? (matchesQ.data ?? []).filter((m) => m.event.id === contextEventId) : []),
    [matchesQ.data, contextEventId],
  );
  const eventSkills = useMemo(
    () => (contextEventId != null ? (skillsQ.data ?? []).filter((s) => s.event.id === contextEventId) : []),
    [skillsQ.data, contextEventId],
  );

  // Slide-in on next frame; Esc + backdrop close; lock body scroll; focus the
  // close button on open and restore focus to the trigger on close.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") requestClose(); };
    window.addEventListener("keydown", onKey);
    // Close when the user navigates away (e.g. clicks an event/team link inside).
    window.addEventListener(NAV_EVENT, requestClose);
    window.addEventListener("popstate", requestClose);
    // Only lock page scroll in the narrow-screen modal mode; the desktop drawer is
    // non-blocking so the page behind it stays scrollable/usable.
    const isModal = window.matchMedia("(max-width: 820px)").matches;
    // Sheet mode: if the sheet would cover the clicked team, nudge the page so the
    // trigger ends up just above it. 360px/72vh mirrors .quick-view-panel's max-height.
    if (!isModal && mode === "sheet" && trigger && trigger !== document.body) {
      const sheetTop = window.innerHeight - Math.min(360, window.innerHeight * 0.72);
      const overlap = trigger.getBoundingClientRect().bottom - (sheetTop - 12);
      if (overlap > 0) window.scrollBy({ top: overlap, behavior: "smooth" });
    }
    const prevOverflow = document.body.style.overflow;
    if (isModal) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(NAV_EVENT, requestClose);
      window.removeEventListener("popstate", requestClose);
      if (isModal) document.body.style.overflow = prevOverflow;
      trigger?.focus?.();
    };
    // `mode` only steers the one-time scroll nudge; deliberately not a dep.
  }, [requestClose]);

  // Sidebar mode pushes the page content aside (main gets side padding) so the
  // panel occupies the freed space. Tied to `mounted` so the push animates in
  // sync with the panel's slide on both open and close.
  useEffect(() => {
    if (mode !== "sidebar" || !mounted || window.matchMedia("(max-width: 820px)").matches) return;
    const cls = side === "left" ? "qv-push-left" : "qv-push-right";
    document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [mode, side, mounted]);

  // In video context: nudge the video modal upward a little so the bottom sheet
  // doesn't fully cover the player. Clamped so the modal keeps some top padding —
  // overlapping the sheet is fine, pushing off the top is not.
  useEffect(() => {
    if (!inVideo || !mounted) return;
    document.body.classList.add("qv-video-sheet");
    const modal = document.querySelector<HTMLElement>(".video-modal");
    if (modal) {
      const PAD = 16;
      const desired = window.innerHeight * 0.12;
      const shift = Math.min(desired, Math.max(0, modal.getBoundingClientRect().top - PAD));
      modal.style.transform = `translateY(${-shift}px)`;
    }
    return () => {
      document.body.classList.remove("qv-video-sheet");
      const m = document.querySelector<HTMLElement>(".video-modal");
      if (m) m.style.transform = "";
    };
  }, [inVideo, mounted]);

  const isIq = team ? isIqProgramInfo(team.program) : false;
  const programCode = team ? programSlug(team.program) : (state.programCode ?? "");
  const eventLoading = rankingsQ.loading || (isIq && matchesQ.loading);

  // Event stat tiles for the panel's lead section.
  const iqEvt = isIq && teamId != null ? iqTeamQualStats(eventMatches, teamId, eventRanking) : null;
  const teamDivision = eventRanking?.division?.name ?? eventMatches.find((m) => m.division?.name)?.division?.name ?? null;
  // Within-event qual-score trend + OPR (only when opened from the current event,
  // where we hold all its matches for the OPR solve).
  const qualTrend = useMemo(
    () =>
      eventMatches
        .filter((m) => m.round === 2)
        .sort((a, b) => a.matchnum - b.matchnum)
        .map((m) => ({ label: shortMatchName(m.name), score: m.alliances.find((al) => isTeamInAlliance(al, teamId ?? -1))?.score }))
        .filter((e): e is { label: string; score: number } => typeof e.score === "number"),
    [eventMatches, teamId],
  );
  const evtOpr =
    contextEventId != null && contextEventId === _currentEventId && teamId != null
      ? currentEventOprMap().get(teamId)?.opr ?? null
      : null;
  const fmtNum = (v: number | null | undefined) => (v == null ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(1));
  const driverSkill = eventSkills.find((s) => (s.type ?? "").toLowerCase().includes("driver"));
  const progSkill = eventSkills.find((s) => !(s.type ?? "").toLowerCase().includes("driver"));
  const combinedSkill = driverSkill || progSkill ? (driverSkill?.score ?? 0) + (progSkill?.score ?? 0) : null;
  const skillRanks = eventSkills.map((s) => s.rank).filter((r): r is number => r != null && r > 0);
  const skillsRank = skillRanks.length ? Math.min(...skillRanks) : null;
  const attemptsSub = (s?: Skill) => (s?.attempts != null ? `${s.attempts} attempt${s.attempts === 1 ? "" : "s"}` : undefined);
  // Full-team-view-style cards, three per row:
  //   V5: Rank·Record·OPR / WP·AP·AWP / Skills(score+rank)·Driver·Prog
  //   IQ (no record/WP): Rank·Avg·OPR / High·Low·Skills(combined)
  const statCards: Array<{ label: string; value: ReactNode; sub?: string; loading: boolean }> = isIq
    ? [
        { label: "Rank", value: eventRanking?.rank != null ? `#${eventRanking.rank}` : "—", loading: eventLoading },
        { label: "Avg", value: fmtNum(iqEvt?.avg ?? eventRanking?.average_points ?? null), loading: eventLoading },
        { label: "OPR", value: evtOpr != null ? evtOpr.toFixed(1) : "—", loading: false },
        { label: "High", value: fmtNum(iqEvt?.high ?? eventRanking?.high_score ?? null), loading: eventLoading },
        { label: "Low", value: fmtNum(iqEvt?.low ?? null), loading: eventLoading },
        {
          label: "Skills",
          value: combinedSkill ?? "—",
          sub: driverSkill || progSkill ? `D ${driverSkill?.score ?? 0} (${driverSkill?.attempts ?? 0}) · P ${progSkill?.score ?? 0} (${progSkill?.attempts ?? 0})` : "No skills runs",
          loading: skillsQ.loading,
        },
      ]
    : [
        { label: "Rank", value: eventRanking?.rank != null ? `#${eventRanking.rank}` : "—", loading: eventLoading },
        { label: "Record", value: eventRanking ? `${eventRanking.wins ?? 0}-${eventRanking.losses ?? 0}-${eventRanking.ties ?? 0}` : "—", loading: eventLoading },
        { label: "OPR", value: evtOpr != null ? evtOpr.toFixed(1) : "—", loading: false },
        { label: "WP", value: fmtNum(eventRanking?.wp ?? null), loading: eventLoading },
        { label: "AP", value: fmtNum(eventRanking?.ap ?? null), loading: eventLoading },
        { label: "AWP", value: eventRanking ? rankingAwp(eventRanking) : "—", loading: eventLoading },
        {
          label: "Skills",
          value: combinedSkill ?? "—",
          sub: skillsRank != null ? `#${skillsRank} rank` : "No skills runs",
          loading: skillsQ.loading,
        },
        { label: "Driver", value: driverSkill?.score ?? "—", sub: attemptsSub(driverSkill), loading: skillsQ.loading },
        { label: "Prog", value: progSkill?.score ?? "—", sub: attemptsSub(progSkill), loading: skillsQ.loading },
      ];

  const goFull = () => {
    navigate(teamSlugPath(state.programCode ?? programCode, state.teamNumber, teamId ?? undefined));
    requestClose(); // navigate fires NAV_EVENT → requestClose; explicit for clarity
  };

  return (
    <div className={`quick-view-overlay${inVideo ? " in-video" : ""}`} onClick={requestClose}>
      <aside
        className={`quick-view-panel mode-${mode}${mode === "sidebar" ? ` side-${side}` : ""}${inVideo ? " in-video" : ""}${mounted ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Quick view for team ${state.teamNumber}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="quick-view-header">
          <div className="quick-view-heading">
            <div className="quick-view-title">
              <strong>{state.teamNumber}</strong>
              {(team?.team_name ?? state.teamName) && <span> · {team?.team_name ?? state.teamName}</span>}
            </div>
            {team && (
              <div className="quick-view-meta">
                <ProgramBadge program={team.program} />
                {teamDivision && <Badge variant="secondary">{teamDivision}</Badge>}
                <span>{locationLine(team)}</span>
                <span>{team.grade ?? "Grade unknown"}</span>
              </div>
            )}
          </div>
          <div className="quick-view-actions">
            <button type="button" className="quick-view-action primary" onClick={goFull}>
              <ExternalLink size={13} /> Full view
            </button>
            <button
              type="button"
              className={`quick-view-action${inTray ? " active" : ""}`}
              disabled={teamId == null || (!canAddToTray() && !inTray)}
              onClick={() => teamId != null && addOrRemoveCompareTeam(teamId, state.teamNumber, programCode, team?.team_name)}
            >
              <IconMorph morphed={inTray} size={13} tone="inherit">
                <Scale size={13} />
              </IconMorph>{" "}
              {inTray ? "In compare" : "Compare"}
            </button>
            {primarySharedTeam && !isIq && eventIdForPicklist != null && teamId != null && (
              <QuickViewPicklistButton
                sharedTeamId={primarySharedTeam.sharedTeamId}
                eventId={String(eventIdForPicklist)}
                teamId={String(teamId)}
                teamNumber={state.teamNumber}
                teamName={team?.team_name ?? state.teamName ?? undefined}
              />
            )}
          </div>
          <span className="close-btn-wrap">
            <kbd className="esc-hint">Esc</kbd>
            <button ref={closeRef} type="button" className="video-close-btn" onClick={requestClose} aria-label="Close quick view">×</button>
          </span>
        </div>

        <div className="quick-view-body">
          {teamQ.loading ? (
            <Status loading={true} error={null} />
          ) : !team ? (
            <div className="empty">Team not found.</div>
          ) : (
            <ProgramContext.Provider value={programCode}>
              {seasonId == null ? (
                <div className="empty">No season data for this team yet.</div>
              ) : contextEventId != null ? (
                <section className="quick-view-event quick-view-cols">
                  <div className="quick-view-stats-col">
                    <div className="quick-view-stats about-stats">
                      {statCards.map((c) => (
                        <StatCard key={c.label} label={c.label} value={c.loading ? "…" : c.value} sub={c.loading ? undefined : c.sub} />
                      ))}
                    </div>
                    {!matchesQ.loading && qualTrend.length > 1 && (
                      <div className="quick-view-trend">
                        <span className="quick-view-trend-label">Qual score trend</span>
                        <ScoreSparkline values={qualTrend.map((e) => e.score)} labels={qualTrend.map((e) => e.label)} />
                      </div>
                    )}
                  </div>
                  <div className="quick-view-matches-col">
                    {matchesQ.loading ? (
                      <div className="empty">Loading matches…</div>
                    ) : eventMatches.length ? (
                      <TeamMatchTable matches={eventMatches} focusTeamId={team.id} isIq={isIq} hideDivision />
                    ) : (
                      <div className="empty">No matches for this team at this event.</div>
                    )}
                  </div>
                </section>
              ) : (
                <div className="empty">Open this from an event to see event stats.</div>
              )}
            </ProgramContext.Provider>
          )}
        </div>
      </aside>
    </div>
  );
}

// Shared behaviour for every horizontally-scrolling strip (season picker, the
// home event tabs, the header nav): report which edges have hidden content, and
// let the strip be dragged with the mouse like a map.
//
// Drag never steals a click: pointer movement only becomes a drag past
// DRAG_THRESHOLD px, and only then is the trailing click swallowed (capture
// phase, before the button's own handler). A plain press still selects.
const DRAG_THRESHOLD = 5;
function useScrollStrip(
  ref: RefObject<HTMLElement | null>,
  { wheel = false, keys = false, deps = [] as unknown[] } = {},
) {
  const [moreLeft, setMoreLeft] = useState(false);
  const [moreRight, setMoreRight] = useState(false);

  const updateEdges = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setMoreLeft(el.scrollLeft > 1);
    setMoreRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    updateEdges();
    el.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    // A child resize (labels swapping, fonts loading) changes scrollWidth too.
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
      ro.disconnect();
    };
  }, [ref, updateEdges, ...deps]);

  // Vertical wheel over the strip scrolls it horizontally instead of the page,
  // and arrow keys do the same while the pointer is hovering it. Opt-in: on the
  // header nav, hijacking the wheel would trap page scrolling.
  const hoverRef = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onEnter = () => { hoverRef.current = true; };
    const onLeave = () => { hoverRef.current = false; };
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!delta) return;
      e.preventDefault();
      el.scrollLeft += delta;
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!hoverRef.current) return;
      if (el.scrollWidth <= el.clientWidth) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      // Don't hijack arrows when the user is typing in a field.
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      e.preventDefault();
      el.scrollLeft += e.key === "ArrowRight" ? 80 : -80;
    };
    if (wheel) el.addEventListener("wheel", onWheel, { passive: false });
    if (keys) window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, [ref, wheel, keys, ...deps]);

  // Mouse drag-to-scroll. Touch is left alone — it already pans natively.
  // State lives in a ref, and this effect deliberately depends on nothing but
  // `ref`: scrolling flips moreLeft/moreRight mid-drag, and if a re-render could
  // resubscribe these listeners the in-flight drag would be dropped — losing the
  // click suppression and switching the tab you dragged from.
  const drag = useRef({ startX: 0, startScroll: 0, pointerId: null as number | null, active: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const d = drag.current;

    const stop = () => {
      if (d.pointerId != null) {
        try { el.releasePointerCapture(d.pointerId); } catch { /* already gone */ }
      }
      d.pointerId = null;
      el.classList.remove("is-dragging");
      // Keep swallowing the click that closes out this drag, then forget it.
      if (d.active) window.setTimeout(() => { d.active = false; }, 0);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      if (el.scrollWidth <= el.clientWidth) return;
      d.pointerId = e.pointerId;
      d.startX = e.clientX;
      d.startScroll = el.scrollLeft;
      d.active = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (d.pointerId !== e.pointerId) return;
      const dx = e.clientX - d.startX;
      if (!d.active) {
        if (Math.abs(dx) < DRAG_THRESHOLD) return;
        d.active = true;
        el.classList.add("is-dragging");
        try { el.setPointerCapture(d.pointerId); } catch { /* non-fatal */ }
      }
      e.preventDefault();
      el.scrollLeft = d.startScroll - dx;
    };
    // Capture phase: runs before the tab/segment's own onClick, so a click that
    // merely ended a drag never changes the selection.
    const onClickCapture = (e: globalThis.MouseEvent) => {
      if (!d.active) return;
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);
    el.addEventListener("click", onClickCapture, true);
    // Native image/text dragging would fight the pan.
    // `Event` here is the DOM event, not this app's Event type.
    const onDragStart = (e: globalThis.Event) => { if (d.active) e.preventDefault(); };
    el.addEventListener("dragstart", onDragStart);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", stop);
      el.removeEventListener("pointercancel", stop);
      el.removeEventListener("click", onClickCapture, true);
      el.removeEventListener("dragstart", onDragStart);
    };
  }, [ref]);

  return { moreLeft, moreRight, updateEdges };
}

/**
 * A horizontally scrolling container that drags like the control strips do.
 * Wraps the wide tables (match results, world skills), which were the only
 * horizontal scrollers left that could not be dragged — the season/tab strips
 * and the header nav already share useScrollStrip.
 *
 * The edge classes drive the grab cursor, and the hook only arms the drag while
 * the content actually overflows, so a table that fits behaves exactly as before.
 */
function DragScroll({
  className = "",
  children,
  deps = [],
}: {
  className?: string;
  children: ReactNode;
  // Anything that changes the content width — the hook re-measures on it.
  deps?: unknown[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { moreLeft, moreRight } = useScrollStrip(ref, { deps });
  return (
    <div
      ref={ref}
      className={`${className}${moreLeft ? " is-more-left" : ""}${moreRight ? " is-more-right" : ""}`}
    >
      {children}
    </div>
  );
}

function SeasonSelector({
  seasons,
  selectedSeasonId,
  onChange,
  loading,
  hideCount,
  hideLabel,
}: {
  seasons: Array<{ id: number; label: string; count?: number }>;
  selectedSeasonId: number | null;
  onChange: (seasonId: number) => void;
  loading: boolean;
  hideCount?: boolean;
  hideLabel?: boolean;
}) {
  // Sliding highlight pill: track the active segment's position/size and move a
  // single absolutely-positioned pill to it, so selection slides instead of the
  // per-item background fading in/out.
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoRef = useRef<number | null>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  // Edge overflow (drives the fade + chevron chips) plus wheel / arrow-key /
  // drag scrolling, all shared with the other strips via useScrollStrip.
  const { moreLeft, moreRight } = useScrollStrip(scrollRef, { wheel: true, keys: true, deps: [seasons] });

  useLayoutEffect(() => {
    const measure = () => {
      const track = trackRef.current;
      if (!track) return;
      const active = track.querySelector<HTMLElement>('[data-state="on"]');
      setPill(active ? { left: active.offsetLeft, width: active.offsetWidth } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [selectedSeasonId, seasons]);

  const stopAuto = useCallback(() => {
    if (autoRef.current != null) {
      cancelAnimationFrame(autoRef.current);
      autoRef.current = null;
    }
  }, []);
  const startAuto = useCallback(() => {
    stopAuto();
    const step = () => {
      const el = scrollRef.current;
      if (!el) { autoRef.current = null; return; }
      const max = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= max - 0.5) { autoRef.current = null; return; }
      el.scrollLeft = Math.min(max, el.scrollLeft + 7);
      autoRef.current = requestAnimationFrame(step);
    };
    autoRef.current = requestAnimationFrame(step);
  }, [stopAuto]);
  const startAutoLeft = useCallback(() => {
    stopAuto();
    const step = () => {
      const el = scrollRef.current;
      if (!el) { autoRef.current = null; return; }
      if (el.scrollLeft <= 0.5) { autoRef.current = null; return; }
      el.scrollLeft = Math.max(0, el.scrollLeft - 7);
      autoRef.current = requestAnimationFrame(step);
    };
    autoRef.current = requestAnimationFrame(step);
  }, [stopAuto]);
  useEffect(() => stopAuto, [stopAuto]);

  if (loading || !seasons.length) return null;

  return (
    <div className={`season-toolbar${hideLabel ? " season-toolbar-nolabel" : ""}`}>
      {!hideLabel && <span>Season</span>}
      <div className="season-scroll">
        {moreLeft && (
          <div className="season-fade season-fade-left" aria-hidden="true">
            <button
              type="button"
              className="season-more"
              aria-label="Scroll to earlier seasons"
              onMouseEnter={startAutoLeft}
              onMouseLeave={stopAuto}
              onClick={() => scrollRef.current?.scrollBy({ left: -scrollRef.current.clientWidth * 0.8, behavior: "smooth" })}
            >
              <ChevronsLeft size={16} />
            </button>
          </div>
        )}
        <div
          ref={scrollRef}
          className={`season-scroll-view no-scrollbar${moreLeft ? " is-more-left" : ""}${moreRight ? " is-more-right" : ""}`}
        >
          <div ref={trackRef} className="relative w-max rounded-lg bg-muted p-1">
            {pill && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-1 z-0 rounded-md bg-background shadow-sm ring-1 ring-black/5 transition-[transform,width] duration-200 ease-out"
                style={{ width: pill.width, transform: `translateX(${pill.left}px)` }}
              />
            )}
            <ToggleGroup
              type="single"
              variant="default"
              value={selectedSeasonId != null ? String(selectedSeasonId) : ""}
              onValueChange={(value) => { if (value) onChange(Number(value)); }}
              className="relative z-10 gap-1"
            >
              {seasons.map((season) => (
                <ToggleGroupItem
                  key={season.id}
                  value={String(season.id)}
                  className="gap-1.5 rounded-md bg-transparent text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground data-[state=on]:bg-transparent data-[state=on]:text-foreground"
                >
                  {season.label}
                  {!hideCount && <span className="opacity-60 tabular-nums">{season.count}</span>}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
        {moreRight && (
          <div className="season-fade" aria-hidden="true">
            <button
              type="button"
              className="season-more"
              aria-label="Scroll to more seasons"
              onMouseEnter={startAuto}
              onMouseLeave={stopAuto}
              onClick={() => scrollRef.current?.scrollBy({ left: scrollRef.current.clientWidth * 0.8, behavior: "smooth" })}
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DateDirectionToggle({ direction, onChange }: { direction: DateDirection; onChange: (direction: DateDirection) => void }) {
  return (
    <div className="date-direction-toggle" aria-label="Date order">
      <span>Order</span>
      <div className="seg-track">
        <button className={direction === "asc" ? "active" : ""} onClick={() => onChange("asc")}>
          Earlier first
        </button>
        <button className={direction === "desc" ? "active" : ""} onClick={() => onChange("desc")}>
          Later first
        </button>
      </div>
    </div>
  );
}

const qfSeedPairs = [
  [1, 8],
  [4, 5],
  [2, 7],
  [3, 6],
];

function isTeamInAlliance(alliance: Alliance | undefined, teamId: number) {
  return !!alliance?.teams.some((entry) => entry.team.id === teamId);
}

function teamAllianceColor(match: Match, teamId: number) {
  return match.alliances.find((alliance) => isTeamInAlliance(alliance, teamId))?.color;
}

function teamMatchOutcome(match: Match, teamId: number) {
  const color = teamAllianceColor(match, teamId);
  const { winner } = matchWinner(match);
  if (!color || winner === "-" || winner === "Tie") return null;
  return winner.toLowerCase() === color.toLowerCase() ? "W" : "L";
}

// Score pair for a TEAM-FOCUSED match list: only the focus team's own alliance
// gets a box (filled when they won, outlined when they lost); the opponent is a
// plain coloured number. Undecidable without a focus team, so this is never used
// in the full event match list. Falls back to two boxes if the team isn't found.
function FocusScorePair({ match, focusTeamId, redScore, blueScore, winner }: {
  match: Match;
  focusTeamId: number;
  redScore: number | null | undefined;
  blueScore: number | null | undefined;
  winner: string;
}) {
  const focusColor = teamAllianceColor(match, focusTeamId);
  // A tie isn't a win or a loss — show both sides as plain numbers (no box).
  const tie = winner === "Tie";
  const redSlot =
    tie ? (
      <span className="score-plain red">{redScore ?? "-"}</span>
    ) : focusColor === "red" ? (
      <span className={`score red ${winner === "Red" ? "" : "score-loser"}`}>{redScore ?? "-"}</span>
    ) : focusColor === "blue" ? (
      <span className="score-plain red">{redScore ?? "-"}</span>
    ) : (
      <span className={`score red ${winner === "Blue" ? "score-loser" : ""}`}>{redScore ?? "-"}</span>
    );
  const blueSlot =
    tie ? (
      <span className="score-plain blue">{blueScore ?? "-"}</span>
    ) : focusColor === "blue" ? (
      <span className={`score blue ${winner === "Blue" ? "" : "score-loser"}`}>{blueScore ?? "-"}</span>
    ) : focusColor === "red" ? (
      <span className="score-plain blue">{blueScore ?? "-"}</span>
    ) : (
      <span className={`score blue ${winner === "Red" ? "score-loser" : ""}`}>{blueScore ?? "-"}</span>
    );
  return (
    <>
      {redSlot}
      {blueSlot}
    </>
  );
}

function teamNameFromMatch(match: Match, teamId: number) {
  for (const alliance of match.alliances) {
    const entry = alliance.teams.find((team) => team.team.id === teamId);
    if (entry) return entry.team.name;
  }
  return "Team";
}

function ordinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const mod10 = value % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

function divisionFinalWins(matches: Match[], teamId: number) {
  const byDivision = new Map<number, { division: IdInfo; wins: number; losses: number; teamName: string; finalIds: Set<number> }>();

  matches
    .filter((match) => playoffRoundKey(match) === "f" && match.alliances.some((alliance) => isTeamInAlliance(alliance, teamId)))
    .forEach((match) => {
      const outcome = teamMatchOutcome(match, teamId);
      if (!outcome) return;
      const existing = byDivision.get(match.division.id) ?? {
        division: match.division,
        wins: 0,
        losses: 0,
        teamName: teamNameFromMatch(match, teamId),
        finalIds: new Set<number>(),
      };
      existing.finalIds.add(match.id);
      if (outcome === "W") existing.wins += 1;
      if (outcome === "L") existing.losses += 1;
      byDivision.set(match.division.id, existing);
    });

  return new Map(
    [...byDivision.entries()]
      .filter(([, result]) => result.wins > result.losses)
      .map(([divisionId, result]) => [divisionId, result]),
  );
}

function lastFinalIdsByDivision(matches: Match[]) {
  const finals = new Map<number, Match[]>();
  matches
    .filter((match) => playoffRoundKey(match) === "f")
    .forEach((match) => finals.set(match.division.id, [...(finals.get(match.division.id) ?? []), match]));

  return new Map(
    [...finals.entries()].map(([divisionId, divisionFinals]) => [
      divisionId,
      [...divisionFinals].sort((a, b) => (b.instance ?? 0) - (a.instance ?? 0) || b.matchnum - a.matchnum)[0]?.id,
    ]),
  );
}

function playoffImportance(match: Match) {
  const key = playoffRoundKey(match);
  if (key === "f") return 4;
  if (key === "sf") return 3;
  if (key === "qf") return 2;
  if (key === "r16") return 1;
  return 0;
}

function playoffMatchesForTeam(matches: Match[], teamId: number) {
  const preferredDivisionId = preferredTeamDivisionId(matches, teamId);
  return matches
    .filter((match) => playoffImportance(match) > 0 && match.alliances.some((alliance) => isTeamInAlliance(alliance, teamId)))
    .sort((a, b) => compareMatchesDisplay(a, b, preferredDivisionId));
}

function inferElimAlliance(matches: Match[], teamId: number) {
  const bracketGroups: Array<{ key: "r16" | "qf"; seeds: number[][] }> = [
    { key: "r16", seeds: r16SeedPairs },
    { key: "qf", seeds: qfSeedPairs },
  ];

  for (const bracket of bracketGroups) {
    const bracketMatches = matches
      .filter((match) => playoffRoundKey(match) === bracket.key)
      .sort((a, b) => (a.instance ?? 0) - (b.instance ?? 0) || a.matchnum - b.matchnum);

    for (const match of bracketMatches) {
      const seedPair = bracket.seeds[(match.instance ?? 1) - 1];
      if (!seedPair) continue;
      const red = match.alliances.find((alliance) => alliance.color === "red");
      const blue = match.alliances.find((alliance) => alliance.color === "blue");
      const alliance = isTeamInAlliance(red, teamId) ? red : isTeamInAlliance(blue, teamId) ? blue : undefined;
      if (!alliance) continue;

      return {
        seed: alliance.color === "red" ? seedPair[0] : seedPair[1],
        teams: alliance.teams.map((entry) => entry.team),
      };
    }
  }

  return null;
}

function ElimAllianceNotice({ alliance, focusTeamId }: { alliance: { seed: number; teams: IdInfo[] }; focusTeamId: number }) {
  const viewedTeam = alliance.teams.find((team) => team.id === focusTeamId);
  const captain = alliance.teams[0];
  if (!viewedTeam || !captain) return null;

  const seedText = `${ordinal(alliance.seed)} seed`;
  if (captain.id === focusTeamId) {
    const pickedTeams = alliance.teams.filter((team) => team.id !== focusTeamId).map((team) => team.name);
    return (
      <>
        <strong>{viewedTeam.name}</strong> picked {pickedTeams.length ? pickedTeams.join(" · ") : "their alliance"} as {seedText}.
      </>
    );
  }

  return (
    <>
      {captain.name} picked <strong>{viewedTeam.name}</strong> as {seedText}.
    </>
  );
}

function firstElimAllianceNotice(matches: Match[], teamId: number) {
  const checkedDivisions = new Set<number>();
  for (const match of matches.filter((item) => playoffImportance(item) > 0)) {
    if (checkedDivisions.has(match.division.id)) continue;
    checkedDivisions.add(match.division.id);
    const divisionMatches = matches.filter((item) => item.division.id === match.division.id);
    const alliance = inferElimAlliance(divisionMatches, teamId);
    if (alliance) return { matchId: match.id, alliance };
  }
  return null;
}

function bestSkillEntries(skills: Skill[]) {
  const byType = new Map<string, Skill>();
  skills.forEach((skill) => {
    const key = skill.type.toLowerCase();
    const existing = byType.get(key);
    if (!existing || (skill.score ?? -1) > (existing.score ?? -1)) byType.set(key, skill);
  });
  return {
    driver: byType.get("driver"),
    programming: byType.get("programming") ?? byType.get("program"),
  };
}

function skillSummary(skills: Skill[]) {
  const { driver, programming } = bestSkillEntries(skills);
  const ranks = [driver?.rank, programming?.rank].filter((rank): rank is number => rank !== null && rank !== undefined);
  const combined = (driver?.score ?? 0) + (programming?.score ?? 0);
  return {
    rank: ranks.length ? Math.min(...ranks) : null,
    driver,
    programming,
    combined: driver || programming ? combined : null,
  };
}

function SkillScoreAttempt({ label, entry }: { label: string; entry?: Skill }) {
  return (
    <span className="skill-score-attempt">
      <strong>{label}</strong> {entry?.score ?? "-"} <strong>Attempts</strong> {entry?.attempts ?? "-"}
    </span>
  );
}

// Combined Events tab: one card per event showing program/location/dates/level in
// the header, and awards + ranking + skills + match preview inside the card body.
// Replaces the old separate Events (table) and Matches (grouped match list) tabs.
function TeamEventCards({
  events,
  matches,
  rankings,
  skills,
  awards,
  focusTeamId,
  isIq,
  detailsLoading,
  onViewMatches,
  onOpenMatch,
}: {
  events: Event[];
  matches: Match[];
  rankings: Ranking[];
  skills: Skill[];
  awards: Award[];
  focusTeamId: number;
  isIq?: boolean;
  detailsLoading: boolean;
  onViewMatches: (eventId: number) => void;
  onOpenMatch: (match: Match, timestamp: MatchTimestamp) => void;
}) {
  if (!events.length) return <Empty>No events this season.</Empty>;

  return (
    <div className="event-groups">
      {events.map((event) => (
        <TeamEventCard
          key={event.id}
          event={event}
          matches={matches.filter((m) => m.event.id === event.id)}
          rankings={rankings.filter((r) => r.event.id === event.id)}
          skills={skills.filter((s) => s.event.id === event.id)}
          awards={awards.filter((a) => a.event.id === event.id)}
          focusTeamId={focusTeamId}
          isIq={isIq}
          detailsLoading={detailsLoading}
          onViewMatches={onViewMatches}
          onOpenMatch={onOpenMatch}
        />
      ))}
    </div>
  );
}

// One event card in the team-focused Events list. Split out from TeamEventCards
// so it can fetch its own Jumper preset/timestamps (per-event, keyed by SKU) —
// the same data source the event page's focus-team match view uses to power the
// match video column — and light up the same crown row My Team shows per event.
function TeamEventCard({
  event,
  matches: eventMatches,
  rankings: eventRankings,
  skills: eventSkills,
  awards: eventAwards,
  focusTeamId,
  isIq,
  detailsLoading,
  onViewMatches,
  onOpenMatch,
}: {
  event: Event;
  matches: Match[];
  rankings: Ranking[];
  skills: Skill[];
  awards: Award[];
  focusTeamId: number;
  isIq?: boolean;
  detailsLoading: boolean;
  onViewMatches: (eventId: number) => void;
  onOpenMatch: (match: Match, timestamp: MatchTimestamp) => void;
}) {
  const cat = eventCategory(event);
  const shortLoc = [event.location?.city, event.location?.region].filter(Boolean).join(", ");
  const multiDivision = (event.divisions?.length ?? 0) > 1;
  const wins = useMemo(() => computeEventAwardWins(event, eventAwards, focusTeamId, !!isIq), [event, eventAwards, focusTeamId, isIq]);

  const preset = useAsync(async () => api.jumperPresetEventExists(event.sku), [event.sku], 1500);
  const matchTimestamps = useAsync(
    async () => {
      if (!preset.data?.exists) return null;
      return api.jumperMatchTimestamps(event.sku, { offsetSeconds: -5 });
    },
    [event.sku, preset.data?.exists],
  );
  const timestampMap = useMemo(() => new Map((matchTimestamps.data ?? []).map((ts) => [ts.id, ts])), [matchTimestamps.data]);
  const presetUrl = preset.data?.exists ? `https://jumper.robostem.org/?preset=${encodeURIComponent(jumperPresetName(event, preset.data))}` : null;

  return (
    <details className="event-group">
      <summary>
        {/* Left: event name + SKU — the only two spots that open the full event
            page. Everything else in the summary just toggles this card. */}
        <span className="event-group-head-main">
          <button
            className="event-group-name-btn"
            onClick={(e) => { e.preventDefault(); onViewMatches(event.id); }}
          >
            <TranslatedText text={event.name} country={event.location?.country} />
          </button>
          <button
            type="button"
            className="event-group-sku-btn"
            onClick={(e) => { e.preventDefault(); onViewMatches(event.id); }}
          >
            {event.sku}
          </button>
        </span>
        {/* Right: award crowns · program badge · city/state · dates, with level tag below */}
        <span className="event-card-info">
          <span className="event-card-meta-row">
            <AwardCrowns wins={wins} />
            <ProgramBadge program={event.program} />
            {shortLoc && <span className="event-card-location">{shortLoc}</span>}
            <span className="event-group-meta">{formatEventDateRange(event.start, event.end)}</span>
          </span>
          {cat.label !== "Other" && (
            <span className={`event-priority priority-${cat.rank}`}>{cat.label}</span>
          )}
        </span>
        <ChevronDown size={15} className="event-group-chevron" aria-hidden="true" />
      </summary>
      {/* Stats: awards / ranking / skills */}
      <TeamEventDetail
        matches={eventMatches}
        rankings={eventRankings}
        skills={eventSkills}
        awards={eventAwards}
        focusTeamId={focusTeamId}
        isIq={isIq}
        loading={detailsLoading}
        hideMatchPreview
        multiDivision={multiDivision}
        onViewMatches={() => onViewMatches(event.id)}
      />
      {/* All matches — identical to the old Matches tab, plus the same match video
          column the event page's focus-team view shows. Already inside the
          event-card <details>, so no extra collapse; just an overflow guard. */}
      {!detailsLoading && eventMatches.length > 0 && (
        <DragScroll className="results-table-scroll">
          <TeamMatchTable
            matches={eventMatches}
            focusTeamId={focusTeamId}
            isIq={isIq}
            multiDivision={multiDivision}
            showPlay
            presetSupported={!!preset.data?.exists}
            presetLoading={preset.loading || (preset.data?.exists ? matchTimestamps.loading : false)}
            presetUrl={presetUrl}
            timestampMap={timestampMap}
            onOpenMatch={onOpenMatch}
          />
        </DragScroll>
      )}
      {/* Footer: open full event page */}
      <div className="event-card-footer">
        <button type="button" className="view-all-matches" onClick={() => onViewMatches(event.id)}>
          See event →
        </button>
      </div>
    </details>
  );
}


function TeamEventDetail({
  matches,
  rankings,
  skills,
  awards,
  focusTeamId,
  isIq = false,
  loading,
  hideMatchPreview = false,
  multiDivision = false,
  onViewMatches,
}: {
  matches: Match[];
  rankings: Ranking[];
  skills: Skill[];
  awards: Award[];
  focusTeamId: number;
  isIq?: boolean;
  loading: boolean;
  hideMatchPreview?: boolean;
  multiDivision?: boolean;
  onViewMatches: () => void;
}) {
  const ranking = rankings[0];
  const skillsRow = skillSummary(skills);
  const iqFinals = isIq ? iqTeamFinals(matches, focusTeamId) : null;
  const iqStats = isIq ? iqTeamQualStats(matches, focusTeamId, ranking) : null;
  const iqFinalsMatches = isIq
    ? matches
        .filter((match) => isIqFinalsMatch(match) && match.alliances.some((alliance) => isTeamInAlliance(alliance, focusTeamId)))
        .sort((a, b) => (a.instance ?? 0) - (b.instance ?? 0) || a.matchnum - b.matchnum)
    : [];
  const elimMatches = isIq ? iqFinalsMatches : playoffMatchesForTeam(matches, focusTeamId);
  const elimAlliance = isIq ? null : inferElimAlliance(matches, focusTeamId);

  return (
    <div className="team-event-detail">
      {loading && !matches.length && !rankings.length && !skills.length && !awards.length && <div className="muted">Loading event details...</div>}
      <div className="team-event-summary-grid">
        <div className="team-event-awards">
          <div className="team-event-awards-head">
            <strong>Awards</strong>
            {!isIq && elimAlliance && (
              <span className="team-elim-seed">
                Seed {elimAlliance.seed}
                <span>{elimAlliance.teams.map((team) => team.name).join(" · ")}</span>
              </span>
            )}
            {isIq && iqFinals && iqFinals.seed && (
              <span className="team-elim-seed">
                {ordinal(iqFinals.seed)} seed
                <span>
                  {iqFinals.teams[0]?.name} (higher)
                  {iqFinals.teams[1] ? ` & ${iqFinals.teams[1].name}` : ""}
                </span>
              </span>
            )}
          </div>
          <div className="winner-row">
            {awards.length ? (
              sortAwards(awards).map((award) => (
                <span key={award.id} className="winner-pill">
                  {award.title.replace(/\s*\([^)]*\)\s*$/, "")}
                </span>
              ))
            ) : (
              <span className="muted">No awards</span>
            )}
          </div>
        </div>
        <div className="team-event-metrics">
          {isIq ? (
            <div className="metric-line">
              <strong>Ranking</strong>
              <span>Rank <b>{ranking?.rank ?? "-"}</b></span>
              <span>Avg <b>{formatNumber(iqStats?.avg)}</b></span>
              <span>High <b>{iqStats?.high ?? "-"}</b></span>
              <span>Low <b>{iqStats?.low ?? "-"}</b></span>
            </div>
          ) : (
            <div className="metric-line">
              <strong>Ranking</strong>
              <span>Rank <b>{ranking?.rank ?? "-"}</b></span>
              <span>Record <b>{ranking ? `${ranking.wins ?? 0}-${ranking.losses ?? 0}-${ranking.ties ?? 0}` : "-"}</b></span>
              <span>WP <b>{ranking?.wp ?? "-"}</b></span>
              <span>AP <b>{ranking?.ap ?? "-"}</b></span>
              <span>SP <b>{ranking?.sp ?? "-"}</b></span>
            </div>
          )}
          <div className="metric-line">
            <strong>Skills</strong>
            <span>Rank <b>{skillsRow.rank ?? "-"}</b></span>
            <span>Combined <b>{skillsRow.combined ?? "-"}</b></span>
            <span>Driver <b>{skillsRow.driver?.score ?? "-"}</b> <i>{skillsRow.driver?.attempts ?? "-"} att</i></span>
            <span>Programming <b>{skillsRow.programming?.score ?? "-"}</b> <i>{skillsRow.programming?.attempts ?? "-"} att</i></span>
          </div>
        </div>
      </div>
      {!hideMatchPreview && (elimMatches.length ? (
        <TeamEventMatchPreview matches={elimMatches.slice(0, 3)} focusTeamId={focusTeamId} onViewMatches={onViewMatches} isIq={isIq} multiDivision={multiDivision} />
      ) : (
        <div className="team-event-no-elims">
          <span className="muted">{isIq ? "No finals matches for this team at this event." : "No elimination matches for this team at this event."}</span>
          {matches.length > 0 && (
            <button type="button" className="view-all-matches" onClick={onViewMatches}>
              View all matches...
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function TeamEventMatchPreview({ matches, focusTeamId, onViewMatches, isIq = false, scoreTier, multiDivision = false }: { matches: Match[]; focusTeamId: number; onViewMatches: () => void; isIq?: boolean; scoreTier?: (score: number | null | undefined) => ScoreTier; multiDivision?: boolean }) {
  const divisionWins = divisionFinalWins(matches, focusTeamId);
  const lastFinalIds = lastFinalIdsByDivision(matches);
  const elimAllianceNotice = isIq ? null : firstElimAllianceNotice(matches, focusTeamId);

  return (
    <table className="team-event-match-preview">
      <tbody>
        {matches.map((match) => {
          const { red, blue, redScore, blueScore, winner } = matchWinner(match);
          const iqResult = isIq ? iqMatchResult(match) : null;
          const outcome = isIq ? null : teamMatchOutcome(match, focusTeamId);
          const divisionWin = lastFinalIds.get(match.division.id) === match.id ? divisionWins.get(match.division.id) : undefined;
          const displayName = shortMatchName(isIq && isIqFinalsMatch(match) ? "Finals" : match.name);
          return (
            <Fragment key={match.id}>
              {elimAllianceNotice?.matchId === match.id && (
                <tr className="elim-alliance-notice-row">
                  <td colSpan={4}>
                    <ElimAllianceNotice alliance={elimAllianceNotice.alliance} focusTeamId={focusTeamId} />
                  </td>
                </tr>
              )}
              <tr>
                <td className="truncate-cell">
                  <span className="team-match-name">
                    {outcome ? (
                      <span className={`team-result-badge result-${outcome.toLowerCase()}`}>{outcome}</span>
                    ) : !isIq && winner === "Tie" ? (
                      <span className="team-result-badge result-t">T</span>
                    ) : null}
                    <span className="team-match-label">{displayName}</span>
                    <DivisionTag match={match} multiDivision={multiDivision} />
                  </span>
                </td>
                <td className={`red-alliance-cell ${!isIq && winner === "Red" ? "winning-alliance-cell" : ""} ${iqResult?.dqColor === "red" ? "dq-alliance-cell" : ""}`}>
                  <AllianceTeamLinks teams={red?.teams} focusTeamId={focusTeamId} dq={iqResult?.dqColor === "red"} />
                </td>
                {isIq ? (
                  <td className="score-cell">
                    <span className={`score iq-score${iqTierClass(scoreTier?.(iqResult?.score) ?? null)}`}>{iqResult?.score ?? "-"}</span>
                  </td>
                ) : (
                  <td className="score-cell">
                    <FocusScorePair match={match} focusTeamId={focusTeamId} redScore={redScore} blueScore={blueScore} winner={winner} />
                  </td>
                )}
                <td className={`blue-alliance-cell ${!isIq && winner === "Blue" ? "winning-alliance-cell" : ""} ${iqResult?.dqColor === "blue" ? "dq-alliance-cell" : ""}`}>
                  <AllianceTeamLinks teams={blue?.teams} focusTeamId={focusTeamId} dq={iqResult?.dqColor === "blue"} />
                </td>
              </tr>
              {!isIq && divisionWin && (
                <tr className="division-win-row">
                  <td colSpan={4}>{divisionWin.teamName} won {divisionWin.division.name} division!</td>
                </tr>
              )}
            </Fragment>
          );
        })}
        <tr>
          <td colSpan={4}>
            <button type="button" className="view-all-matches" onClick={onViewMatches}>
              View all matches...
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}


// Small inline division label shown next to a team's match name. Only rendered
// for multi-division events (Worlds, multi-division championships) so single-
// division events stay uncluttered.
function DivisionTag({ match, multiDivision }: { match: Match; multiDivision: boolean }) {
  if (!multiDivision || !match.division?.name) return null;
  // No country in scope here (a Match carries an IdInfo event, and a Division has
  // no location of its own), so this relies on script detection alone.
  return <TranslatedText className="division-tag" text={match.division.name} />;
}

function TeamMatchTable({ matches, focusTeamId, isIq = false, scoreTier, hideDivision = false, multiDivision = true, showPlay = false, presetSupported = false, presetLoading = false, presetUrl, timestampMap, onOpenMatch }: { matches: Match[]; focusTeamId: number; isIq?: boolean; scoreTier?: (score: number | null | undefined) => ScoreTier; hideDivision?: boolean; multiDivision?: boolean; showPlay?: boolean; presetSupported?: boolean; presetLoading?: boolean; presetUrl?: string | null; timestampMap?: Map<number, MatchTimestamp>; onOpenMatch?: (match: Match, timestamp: MatchTimestamp) => void }) {
  const sortedMatches = [...matches].sort((a, b) => compareMatchesDisplay(a, b, preferredTeamDivisionId(matches, focusTeamId)));
  const divisionWins = divisionFinalWins(sortedMatches, focusTeamId);
  const lastFinalIds = lastFinalIdsByDivision(sortedMatches);
  const elimAllianceNotice = isIq ? null : firstElimAllianceNotice(sortedMatches, focusTeamId);
  const colSpan = showPlay ? 5 : 4;

  return (
    <table className={`team-match-table${showPlay ? " has-play-col" : ""}`}>
      <thead>
        <tr>
          {showPlay && (
            <th className="play-cell" aria-label="Open match">
              {presetLoading ? (
                <span className="play-header-icon loading" />
              ) : presetSupported ? (
                <a href={presetUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="play-header-link active" title="Open in Jumper">
                  <LinkIcon size={14} />
                </a>
              ) : (
                <span className="play-header-link disabled" title="No livestream preset">
                  <Unlink size={14} />
                </span>
              )}
            </th>
          )}
          <th>Match</th>
          <th>{isIq ? "Team" : <><span className="alliance-th-full">Red Alliance</span><span className="alliance-th-short">Red</span></>}</th>
          <th>Score</th>
          <th>{isIq ? "Team" : <><span className="alliance-th-full">Blue Alliance</span><span className="alliance-th-short">Blue</span></>}</th>
        </tr>
      </thead>
      <tbody>
        {sortedMatches.map((match) => {
          const { red, blue, redScore, blueScore, winner } = matchWinner(match);
          const iqResult = isIq ? iqMatchResult(match) : null;
          const outcome = isIq ? null : teamMatchOutcome(match, focusTeamId);
          const divisionWin = lastFinalIds.get(match.division.id) === match.id ? divisionWins.get(match.division.id) : undefined;
          const displayName = shortMatchName(isIq && isIqFinalsMatch(match) ? "Finals" : match.name);
          const timestamp = showPlay ? timestampMap?.get(match.id) : undefined;
          const canPlay = showPlay && presetSupported && timestamp && timestamp.timestamp !== null && timestamp.videoId;

          return (
            <Fragment key={match.id}>
              {elimAllianceNotice?.matchId === match.id && (
                <tr className="elim-alliance-notice-row">
                  <td colSpan={colSpan}>
                    <ElimAllianceNotice alliance={elimAllianceNotice.alliance} focusTeamId={focusTeamId} />
                  </td>
                </tr>
              )}
              <tr>
                {showPlay && (
                  <td className="play-cell">
                    {canPlay ? (
                      <button className="play-dot active" onClick={() => onOpenMatch?.(match, timestamp!)} title={`Play ${displayName}`} />
                    ) : (
                      <span className="play-dot disabled" />
                    )}
                  </td>
                )}
                <td>
                  <span className="team-match-name">
                    {outcome ? (
                      <span className={`team-result-badge result-${outcome.toLowerCase()}`}>{outcome}</span>
                    ) : !isIq && winner === "Tie" ? (
                      <span className="team-result-badge result-t">T</span>
                    ) : null}
                    <span className="team-match-label">{displayName}</span>
                    {!hideDivision && <DivisionTag match={match} multiDivision={multiDivision} />}
                  </span>
                </td>
                <td className={`red-alliance-cell ${!isIq && winner === "Red" ? "winning-alliance-cell" : ""} ${iqResult?.dqColor === "red" ? "dq-alliance-cell" : ""}`}>
                  <AllianceTeamLinks teams={red?.teams} focusTeamId={focusTeamId} dq={iqResult?.dqColor === "red"} />
                </td>
                {isIq ? (
                  <td className="score-cell">
                    <span className={`score iq-score${iqTierClass(scoreTier?.(iqResult?.score) ?? null)}`}>{iqResult?.score ?? "-"}</span>
                  </td>
                ) : (
                  <td className="score-cell">
                    <FocusScorePair match={match} focusTeamId={focusTeamId} redScore={redScore} blueScore={blueScore} winner={winner} />
                  </td>
                )}
                <td className={`blue-alliance-cell ${!isIq && winner === "Blue" ? "winning-alliance-cell" : ""} ${iqResult?.dqColor === "blue" ? "dq-alliance-cell" : ""}`}>
                  <AllianceTeamLinks teams={blue?.teams} focusTeamId={focusTeamId} dq={iqResult?.dqColor === "blue"} />
                </td>
              </tr>
              {!isIq && divisionWin && (
                <tr className="division-win-row">
                  <td colSpan={colSpan}>{divisionWin.teamName} won {divisionWin.division.name} division!</td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function TeamRankingsByEvent({
  rankings,
  matches = [],
  eventIndex,
  seasonId,
  direction,
  focusTeamId,
  isIq = false,
  onViewMatches,
}: {
  rankings: Ranking[];
  matches?: Match[];
  eventIndex: Map<number, Event>;
  seasonId: number | null;
  direction: DateDirection;
  focusTeamId?: number;
  isIq?: boolean;
  onViewMatches?: (eventId: number) => void;
}) {
  const groups = groupItemsByEvent(rankings, eventIndex, seasonId, direction);
  const matchesByEvent = useMemo(() => {
    const map = new Map<number, Match[]>();
    matches.forEach((match) => {
      map.set(match.event.id, [...(map.get(match.event.id) ?? []), match]);
    });
    return map;
  }, [matches]);

  if (isIq) {
    return (
      <Panel title="Rankings" icon={<BarChart3 />}>
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Division</th>
              <th>Rank</th>
              <th>Avg</th>
              <th>High</th>
              <th>Low</th>
              <th>Dropped scores</th>
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((group) =>
              group.items.map((row) => {
                const stats = iqTeamQualStats(matchesByEvent.get(group.eventRef.id) ?? [], focusTeamId ?? row.team.id, row);
                return (
                  <tr key={row.id}>
                    <td>
                      {onViewMatches ? (
                        <button className="event-group-name-btn" onClick={() => onViewMatches(group.eventRef.id)}>{group.eventRef.name}</button>
                      ) : (
                        <Link href={group.event ? eventPath(group.event) : `/event/${group.eventRef.code ?? group.eventRef.id}`}>{group.eventRef.name}</Link>
                      )}
                      <div className="muted event-sku-tier-line">
                    {group.event?.sku ?? group.eventRef.code}
                    <EventTierTag event={group.event} />
                  </div>
                    </td>
                    <td>{row.division?.name ?? "-"}</td>
                    <td>{row.rank}</td>
                    <td>{formatNumber(stats.avg)}</td>
                    <td>{stats.high ?? "-"}</td>
                    <td>{stats.low ?? "-"}</td>
                    <td>
                      <DroppedScores dropped={stats.dropped} />
                    </td>
                  </tr>
                );
              }),
            )}
            {!groups.length && (
              <tr>
                <td colSpan={7}>
                  <Empty>No rankings returned for this season.</Empty>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    );
  }

  return (
    <Panel title="Rankings" icon={<BarChart3 />}>
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Division</th>
            <th>Rank</th>
            <th>Record</th>
            <th>WP</th>
            <th>AP</th>
            <th>SP</th>
            <th>Avg</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap((group) =>
            group.items.map((row) => (
              <tr key={row.id}>
                <td>
                  {onViewMatches ? (
                    <button className="event-group-name-btn" onClick={() => onViewMatches(group.eventRef.id)}>{group.eventRef.name}</button>
                  ) : (
                    <Link href={group.event ? eventPath(group.event) : `/event/${group.eventRef.code ?? group.eventRef.id}`}>{group.eventRef.name}</Link>
                  )}
                  <div className="muted event-sku-tier-line">
                    {group.event?.sku ?? group.eventRef.code}
                    <EventTierTag event={group.event} />
                  </div>
                </td>
                <td>{row.division?.name ?? "-"}</td>
                <td>{row.rank}</td>
                <td>
                  {row.wins ?? 0}-{row.losses ?? 0}-{row.ties ?? 0}
                </td>
                <td>{row.wp ?? "-"}</td>
                <td>{row.ap ?? "-"}</td>
                <td>{row.sp ?? "-"}</td>
                <td>{formatNumber(row.average_points)}</td>
              </tr>
            )),
          )}
          {!groups.length && (
            <tr>
              <td colSpan={8}>
                <Empty>No rankings returned for this season.</Empty>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}

function TeamSkillsByEvent({
  skills,
  eventIndex,
  seasonId,
  direction,
  onViewMatches,
}: {
  skills: Skill[];
  eventIndex: Map<number, Event>;
  seasonId: number | null;
  direction: DateDirection;
  onViewMatches?: (eventId: number) => void;
}) {
  const groups = groupItemsByEvent(skills, eventIndex, seasonId, direction).map((group) => {
    const entries = [...group.items].sort((a, b) => (a.type === "driver" ? -1 : 1) - (b.type === "driver" ? -1 : 1));
    const bestByType = new Map<string, Skill>();

    entries.forEach((skill) => {
      const key = skill.type.toLowerCase();
      const existing = bestByType.get(key);
      if (!existing || (skill.score ?? -1) > (existing.score ?? -1)) bestByType.set(key, skill);
    });

    return { ...group, entries: [...bestByType.values()] };
  });

  return (
    <Panel title="Skills" icon={<Activity />}>
      <table className="skills-table team-skills-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Rank</th>
            <th>Total</th>
            <th>Driver</th>
            <th>Programming</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const entries = group.entries.sort((a, b) => a.type.localeCompare(b.type));
            const { driver, programming } = bestSkillEntries(entries);
            const rank = entries.reduce<number | null>((best, entry) => {
              if (entry.rank === null || entry.rank === undefined) return best;
              return best === null ? entry.rank : Math.min(best, entry.rank);
            }, null);
            const total = entries.reduce((sum, entry) => sum + (entry.score ?? 0), 0);

            return (
              <tr key={group.eventRef.id}>
                <td>
                  {onViewMatches ? (
                    <button className="event-group-name-btn" onClick={() => onViewMatches(group.eventRef.id)}>{group.eventRef.name}</button>
                  ) : (
                    <Link href={group.event ? eventPath(group.event) : `/event/${group.eventRef.code ?? group.eventRef.id}`}>{group.eventRef.name}</Link>
                  )}
                  <div className="muted event-sku-tier-line">
                    {group.event?.sku ?? group.eventRef.code}
                    <EventTierTag event={group.event} />
                  </div>
                </td>
                <td>{rank ?? "-"}</td>
                <td>{total || "-"}</td>
                <td>
                  <SkillScoreAttempt label="Driver" entry={driver} />
                </td>
                <td>
                  <SkillScoreAttempt label="Programming" entry={programming} />
                </td>
              </tr>
            );
          })}
          {!groups.length && (
            <tr>
              <td colSpan={5}>
                <Empty>No skills scores returned for this season.</Empty>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}

// Concise label + tier class for a RobotEvents award `qualifications` string.
// Authoritative data straight from the events API — no guessing. Signature events
// are open entry, so the API never lists them as a qualification.
function qualTier(q: string): { label: string; cls: string } | null {
  const s = q.toLowerCase();
  if (s.includes("world")) return { label: "Worlds", cls: "team-qual-worlds" };
  if (s.includes("region") || s.includes("state") || s.includes("national"))
    return { label: "Regionals", cls: "team-qual-championship" };
  if (s.includes("signature")) return null;
  return { label: q, cls: "team-qual-championship" };
}
// Highest-tier qualification an award grants (Worlds beats Regionals), or null.
function awardTopQual(award: Award): { label: string; cls: string } | null {
  let best: { label: string; cls: string } | null = null;
  for (const q of award.qualifications ?? []) {
    const t = qualTier(q);
    if (!t) continue;
    if (!best || (t.label === "Worlds" && best.label !== "Worlds")) best = t;
  }
  return best;
}
// Per-award qualification labels for the event Awards list. Reuses the shared
// `qualTier` mapping (Worlds / Regionals), deduped to distinct tiers with Worlds
// first. Signature entry is open, so the API never lists it as a qualification.
function awardEventQuals(award: Award): { label: string; cls: string }[] {
  const seen = new Map<string, string>();
  for (const q of award.qualifications ?? []) {
    const tier = qualTier(q);
    if (tier && !seen.has(tier.label)) seen.set(tier.label, tier.cls);
  }
  return [...seen.entries()]
    .map(([label, cls]) => ({ label, cls }))
    .sort((a, b) => (a.label === "Worlds" ? -1 : b.label === "Worlds" ? 1 : 0));
}

function TeamAwardsByEvent({
  awards,
  eventIndex,
  seasonId,
  focusTeamId,
  focusTeamNumber,
  direction,
  collapsible,
  defaultCollapsed,
}: {
  awards: Award[];
  eventIndex: Map<number, Event>;
  seasonId: number | null;
  focusTeamId: number;
  focusTeamNumber: string;
  direction: DateDirection;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}) {
  const groups = groupItemsByEvent(awards, eventIndex, seasonId, direction);
  const programCode = useContext(ProgramContext);
  // Qualifications are authoritative — straight from the events API
  // (`award.qualifications`). Deduped to distinct tiers, Worlds first.
  const quals = useMemo(() => {
    const seen = new Map<string, string>();
    for (const award of awards) {
      for (const q of award.qualifications ?? []) {
        const tier = qualTier(q);
        if (tier && !seen.has(tier.label)) seen.set(tier.label, tier.cls);
      }
    }
    return [...seen.entries()].sort((a, b) => (a[0] === "Worlds" ? -1 : b[0] === "Worlds" ? 1 : 0));
  }, [awards]);

  return (
    <Panel title="Awards" icon={<Medal />} collapsible={collapsible} defaultCollapsed={defaultCollapsed}>
      <div className="team-awards-body">
      {quals.length > 0 && (
        <div className="team-quals" role="group" aria-label="Qualifications">
          <div className="team-quals-head">
            <Medal size={15} aria-hidden="true" />
            <span>Qualifications</span>
          </div>
          <div className="team-quals-list">
            {quals.map(([label, cls]) => (
              <div key={label} className={`team-qual-pill ${cls}`}><strong>{label}</strong></div>
            ))}
          </div>
        </div>
      )}
      <div className="award-cards">
        {groups.map((group) => (
          <article key={group.eventRef.id} className="award-card">
            <div className="award-card-event">
              {/* Ellipsis on the wrapper, not the link — see .event-name-clamp. */}
              <span className="award-card-event-clamp">
              <Link
                className="award-card-event-name"
                href={urlWithHash(
                  `${group.event ? eventPath(group.event) : `/event/${group.eventRef.code ?? group.eventRef.id}`}?focusTeam=${focusTeamId}&focusTeamNum=${encodeURIComponent(focusTeamNumber)}`,
                  "team-matches",
                )}
                title={group.eventRef.name}
              >
                {group.eventRef.name}
              </Link>
              </span>
              <div className="award-card-event-meta">
                {group.event ? formatEventDateRange(group.event.start, group.event.end) : "Date unavailable"}
                <EventTierTag event={group.event} />
              </div>
              {(group.event?.sku || group.eventRef.code) && (
                <div className="award-card-event-sku">{group.event?.sku ?? group.eventRef.code}</div>
              )}
            </div>
            <div className="award-card-awards">
              {sortAwards(group.items).map((award) => {
                const tier = awardPriority(award);
                // Strip trailing program-scope parenthetical, e.g. "Design Award (VRC/VEXU/VAIRC)".
                const mainTitle = award.title.replace(/\s*\([^)]*\)\s*$/, "").trim();
                const TierIcon = tier === 0 ? Star : tier === 1 ? Trophy : tier === 3 ? Medal : null;
                const topQual = awardTopQual(award);
                // At a multi-division event, only show co-winners from the focus team's
                // own division (avoids huge cross-division winner lists).
                const winners = awardTeamWinners(award);
                const focusDiv = winners.find((w) => w.team.id === focusTeamId)?.division?.id ?? null;
                const shownWinners = focusDiv != null ? winners.filter((w) => w.division?.id === focusDiv) : winners;
                return (
                  <div className={`award-row award-tier-${tier}`} key={award.id}>
                    <div className="award-row-head">
                      {TierIcon && <span className="award-row-icon" aria-hidden="true"><TierIcon size={14} /></span>}
                      <span className="award-row-name">{mainTitle}</span>
                      {topQual && (
                        <span className={`award-qual-badge ${topQual.cls}`} title={`Qualifies: ${topQual.label}`}>
                          {topQual.label}
                        </span>
                      )}
                    </div>
                    {shownWinners.length > 0 && (
                      <div className="award-row-teams">
                        {shownWinners.map((winner) => (
                          <TeamQuickLink
                            key={`${award.id}-${winner.team.id}`}
                            teamId={winner.team.id}
                            teamNumber={winner.team.name}
                            programCode={programCode}
                            className={`winner-pill ${winner.team.id === focusTeamId ? "" : "other"}`}
                          >
                            {winner.team.name}
                          </TeamQuickLink>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
        {!groups.length && <Empty>No awards returned for this season.</Empty>}
      </div>
      </div>
    </Panel>
  );
}

function EventHighlights({ awards }: { awards: HighlightAward[] }) {
  return (
    <div className="event-highlights">
      {awards.map((highlight) => {
        const Icon = highlight.kind === "skills" ? Medal : highlight.kind === "champions" ? Trophy : Star;
        return (
          <article key={`${highlight.kind}-${highlight.award.id}`} className={`event-highlight-card highlight-${highlight.kind}`}>
            <div className="event-highlight-icon">
              <Icon size={15} />
            </div>
            <div className="event-highlight-body">
              <strong>{highlight.label}</strong>
              <div>
                {awardTeamWinners(highlight.award).map((winner) => (
                  <TeamMiniLink key={`${highlight.award.id}-${winner.team.id}`} team={winner.team} />
                ))}
                {awardIndividualWinners(highlight.award).map((winner) => (
                  <span key={winner}>{winner}</span>
                ))}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Tabs({
  tabs,
  active,
  onChange,
  orientation = "horizontal",
  action,
}: {
  tabs: Array<[string, string, ReactNode, (() => void)?]>;
  active: string;
  onChange: (tab: string) => void;
  orientation?: TabLayout;
  action?: ReactNode;
}) {
  if (orientation === "vertical") {
    return (
      <nav className="settings-tabs view-tabs-rail">
        {tabs.map(([id, label, icon, onClose]) => (
          <button
            key={id}
            className={`settings-tab ${active === id ? "active" : ""}`}
            onClick={() => onChange(id)}
          >
            {icon}
            {label}
            {onClose && (
              <span
                className="tab-close-btn"
                role="button"
                aria-label={`Close ${label} tab`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
              >
                ×
              </span>
            )}
          </button>
        ))}
        {action && <div className="view-tabs-rail-action">{action}</div>}
      </nav>
    );
  }
  const bar = (
    <div className="tabs">
      {tabs.map(([id, label, icon, onClose]) => (
        <button key={id} className={active === id ? "active" : ""} onClick={() => onChange(id)}>
          {icon}
          {label}
          {active === id && <SlideIndicator id="event-tabs" />}
          {onClose && (
            <span
              className="tab-close-btn"
              role="button"
              aria-label={`Close ${label} tab`}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
            >
              ×
            </span>
          )}
        </button>
      ))}
    </div>
  );
  if (!action) return bar;
  // Wrap so the action sits at the right end of the bar without being caught by
  // the `.tabs button` styles (which would render it transparent/invisible).
  return (
    <div className="view-tabs-bar">
      {bar}
      <span className="view-tabs-bar-action">{action}</span>
    </div>
  );
}

// True on phone-width viewports (matches the ≤560px CSS mobile breakpoint).
// Used to make match-schedule sections collapsible + collapsed-by-default only
// on phones; desktop keeps everything expanded and uncollapsible.
function useIsPhone() {
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(max-width: 560px)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 560px)");
    const onChange = () => setIsPhone(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isPhone;
}

// Disclosure wrapper for a match-schedule section. On phones it renders a native
// <details>/<summary> (title + count + rotating chevron) so long lists can be
// collapsed to cut clutter; long sections (e.g. qualifications) default closed.
// On desktop it renders the title + children inline with NO collapse, so the
// existing desktop layout is unchanged. Native <details> gives us accessible
// disclosure semantics for free.
function ScheduleCollapse({
  title,
  count,
  defaultOpenOnPhone = true,
  headingLevel = "h2",
  children,
}: {
  title: ReactNode;
  count?: number;
  defaultOpenOnPhone?: boolean;
  headingLevel?: "h2" | "h3";
  children: ReactNode;
}) {
  const isPhone = useIsPhone();
  const Heading = headingLevel;
  if (!isPhone) {
    return (
      <>
        <Heading>{title}</Heading>
        {children}
      </>
    );
  }
  return (
    <details className="schedule-collapse" open={defaultOpenOnPhone}>
      <summary>
        <ChevronRight size={16} className="schedule-collapse-chevron" />
        <span>{title}</span>
        {typeof count === "number" && count > 0 && (
          <span className="schedule-collapse-count">{count.toLocaleString()}</span>
        )}
      </summary>
      {children}
    </details>
  );
}

function MatchesTable({
  matches,
  timestampMap,
  presetSupported,
  presetLoading,
  presetUrl,
  onOpenMatch,
  isIq = false,
  scoreTier,
  eventId,
  eventTz,
  focusMatchId,
  onFocusConsumed,
  rankings = [],
  focusTeamId,
}: {
  matches: Match[];
  timestampMap: Map<number, MatchTimestamp>;
  presetSupported: boolean;
  presetLoading: boolean;
  presetUrl: string | null;
  onOpenMatch: (match: Match, timestamp: MatchTimestamp) => void;
  isIq?: boolean;
  scoreTier?: (score: number | null | undefined) => ScoreTier;
  eventId?: number;
  // IANA timezone of the event's location; day dividers are computed in this zone.
  eventTz?: string | null;
  focusMatchId?: string | null;
  onFocusConsumed?: () => void;
  rankings?: Ranking[];
  // Searched team (F-search resolving to a single team) — elimination matches
  // then show only its alliance side rather than the full opposing alliance.
  focusTeamId?: number;
}) {
  const [qualificationDirection, setQualificationDirection] = useState<DateDirection>("asc");
  const [bracketOpen, setBracketOpen] = useState(false);
  // Every team that appears in any match = the event's competing teams. Lets a
  // note recognize any event team you type, not just the ones in that match.
  const eventTeams = useMemo(() => {
    const m = new Map<number, string>();
    for (const match of matches) {
      for (const alliance of match.alliances) {
        for (const entry of alliance.teams) {
          if (entry.team?.id && entry.team?.name) m.set(entry.team.id, entry.team.name);
        }
      }
    }
    return [...m].map(([id, number]) => ({ id, number }));
  }, [matches]);
  const qualificationMatches = matches
    .filter((match) => match.round === 2)
    .sort((a, b) => (qualificationDirection === "asc" ? 1 : -1) * (a.matchnum - b.matchnum));
  const playoffMatches = matches.filter((match) => playoffImportance(match) > 0).sort(compareMatchesDisplay);
  const playoffGroups = playoffMatches.reduce<Map<string, Match[]>>((groups, match) => {
    const key = playoffRoundKey(match);
    groups.set(key, [...(groups.get(key) ?? []), match]);
    return groups;
  }, new Map());
  // Map team id → qualification rank so byes (top seeds that skip R16) can be
  // seeded by rank when the bracket alone can't place them.
  const rankByTeam = useMemo(() => {
    const map = new Map<number, number>();
    for (const ranking of rankings) if (ranking.team?.id) map.set(ranking.team.id, ranking.rank);
    return map;
  }, [rankings]);
  const allianceRows = allianceRowsFromMatches(matches, rankByTeam);
  const playoffOrder = ["r16", "qf", "sf", "f"];
  // Final-division events (two divisions facing off) have no qualification
  // matches, only the cross-division finals. In that case promote the
  // elimination matches into the main (left) column.
  const noQuals = !isIq && qualificationMatches.length === 0 && playoffMatches.length > 0;
  const renderElimGroups = (showNoteRail = false) =>
    playoffOrder
      .filter((key) => playoffGroups.has(key))
      .map((key) => {
        const roundMatches = (playoffGroups.get(key) ?? []).sort(compareMatchesDisplay);
        return (
          // Playoff rounds are short — keep them open by default even on phones.
          <section className="playoff-round" key={key}>
            <ScheduleCollapse title={playoffRoundLabel(key)} count={roundMatches.length} headingLevel="h3">
              <DragScroll className="results-table-scroll">
                <ResultsMatchTable
                  matches={roundMatches}
                  emptyText="No playoff matches returned."
                  timestampMap={timestampMap}
                  presetSupported={presetSupported}
                  presetLoading={presetLoading}
                  presetUrl={presetUrl}
                  onOpenMatch={onOpenMatch}
                  dayNumbers={dayNumbers}
                  dayKeyOf={dayKeyOf}
                  eventTz={eventTz}
                  showNoteRail={showNoteRail}
                  eventId={eventId}
                  eventTeams={eventTeams}
                  focusMatchId={focusMatchId}
                  onFocusConsumed={onFocusConsumed}
                  focusTeamId={focusTeamId}
                />
              </DragScroll>
            </ScheduleCollapse>
          </section>
        );
      });

  const dayKeyOf = useMemo(() => makeMatchDayKey(eventTz), [eventTz]);
  const dayKeys = [...new Set(matches.map(dayKeyOf).filter((key): key is string => !!key))].sort();
  const dayNumbers = dayKeys.length > 1 ? new Map(dayKeys.map((key, index) => [key, index + 1] as const)) : undefined;

  // IQ Teamwork: cooperative format. Finals are round 15; "alliances" are the
  // finals partner pairs seeded by score; there is no elimination bracket.
  const iqFinals = isIq
    ? matches.filter((match) => isIqFinalsMatch(match)).sort(compareMatchesDisplay)
    : [];
  const iqFinalsLabelMap = isIq ? iqFinalsLabels(matches) : undefined;
  const iqAllianceRows = isIq ? iqFinalsAlliances(matches) : [];

  return (
    <div className="results-layout">
      <section className="results-column">
        {noQuals ? (
          // Finals-only events: elimination promoted into the left column. Each
          // round is its own (short) collapsible; keep the section heading plain.
          <>
            <h2>Elimination Results</h2>
            {renderElimGroups(true)}
          </>
        ) : (
          // Qualification lists are long — collapse by default on phones to cut
          // clutter (the headline ask), expanded on desktop.
          <ScheduleCollapse
            title="Qualification Results"
            count={qualificationMatches.length}
            defaultOpenOnPhone={false}
          >
            {isIq && (
              <div className="iq-score-legend">
                <span><i className="dot-gold" /> Top 10% score</span>
                <span><i className="dot-bronze" /> Top 20% score</span>
              </div>
            )}
            <DragScroll className="results-table-scroll">
              <ResultsMatchTable
                matches={qualificationMatches}
                emptyText="No qualification matches returned."
                matchDirection={qualificationDirection}
                onToggleMatchDirection={() => setQualificationDirection((direction) => (direction === "asc" ? "desc" : "asc"))}
                timestampMap={timestampMap}
                presetSupported={presetSupported}
                presetLoading={presetLoading}
                presetUrl={presetUrl}
                onOpenMatch={onOpenMatch}
                dayNumbers={dayNumbers}
                dayKeyOf={dayKeyOf}
                eventTz={eventTz}
                isIq={isIq}
                scoreTier={scoreTier}
                showNoteRail
                eventId={eventId}
                eventTeams={eventTeams}
                focusMatchId={focusMatchId}
                onFocusConsumed={onFocusConsumed}
              />
            </DragScroll>
          </ScheduleCollapse>
        )}
      </section>
      <section className="results-column">
        <div className="alliances-header">
          <h2>Alliances</h2>
          {!isIq && playoffMatches.length > 0 && (
            <button className="bracket-open-btn" onClick={() => setBracketOpen(true)}>
              See elimination bracket
            </button>
          )}
        </div>
        <AllianceSelectionTable alliances={isIq ? iqAllianceRows : allianceRows} iq={isIq} />
        {isIq ? (
          // Finals are short — keep open by default on phones too.
          <ScheduleCollapse title="Finals matches" count={iqFinals.length}>
            <div className="iq-score-legend">
              <span><i className="dot-win" /> Winning score</span>
            </div>
            <DragScroll className="results-table-scroll">
              <ResultsMatchTable
                matches={iqFinals}
                emptyText="No finals matches returned."
                timestampMap={timestampMap}
                presetSupported={presetSupported}
                presetLoading={presetLoading}
                presetUrl={presetUrl}
                onOpenMatch={onOpenMatch}
                dayNumbers={dayNumbers}
                dayKeyOf={dayKeyOf}
                eventTz={eventTz}
                isIq
                markWinningIqScore
                labelFor={(match) => iqFinalsLabelMap?.get(match.id)}
                focusMatchId={focusMatchId}
                onFocusConsumed={onFocusConsumed}
              />
            </DragScroll>
          </ScheduleCollapse>
        ) : (
          !noQuals && (
            <>
              <h2>Elimination Results</h2>
              {renderElimGroups()}
              {!playoffMatches.length && <Empty>No playoff matches returned.</Empty>}
            </>
          )
        )}
      </section>
      {!isIq && bracketOpen && <EliminationBracketOverlay matches={playoffMatches} onClose={() => setBracketOpen(false)} />}
    </div>
  );
}

// Clear the imperative magnification styles a dot back to its CSS resting state.
function resetDot(dot: HTMLElement) {
  dot.style.transform = "";
  dot.style.removeProperty("--p");
}

// One note indicator per match row. Reads only its own has-note boolean (a
// primitive snapshot), so typing in one note doesn't re-render the whole table.
function NoteRailDot({
  matchId,
  matchName,
  focused,
  onOpen,
}: {
  matchId: number;
  matchName: string;
  focused: boolean;
  onOpen: (el: HTMLElement) => void;
}) {
  const hasPersonalNote = useHasNote(matchId);
  const hasSharedTeamNote = useHasAnySharedTeamNote(matchId);
  const hasNote = hasPersonalNote || hasSharedTeamNote;
  // The pip (resting dot) and the note icon are both always rendered; CSS cross-
  // fades them by the proximity variable --p (set imperatively during hover), so a
  // dot visibly morphs into a note icon as the cursor approaches. A note that
  // already exists shows the icon at all times.
  return (
    <button
      type="button"
      className={`note-dot ${hasNote ? "has-note" : ""} ${focused ? "is-focused" : ""}`}
      data-match-id={matchId}
      onClick={(e) => onOpen(e.currentTarget)}
      aria-label={hasNote ? `Edit note for ${matchName}` : `Add note for ${matchName}`}
      title={hasNote ? "Edit note" : "Add note"}
    >
      <span className="note-dot-pip" aria-hidden="true" />
      {hasNote
        ? <StickyNote className="note-dot-icon" size={12} aria-hidden="true" />
        : <FilePlus2  className="note-dot-icon" size={12} aria-hidden="true" />}
    </button>
  );
}

// ── Note shared helpers ───────────────────────────────────────────────────────

const NOTE_CHAR_LIMIT = 2000;

/**
 * Row of clickable team chips for the teams in a match.
 * Chips that appear in the note body get a "mentioned" highlight.
 * Clicking opens the team page. Works for both V5RC (red/blue) and IQ.
 */
function NoteTeamChips({ match, body, eventTeams }: { match: Match; body: string; eventTeams?: { id: number; number: string }[] }) {
  const programCode = useContext(ProgramContext);

  // Teams playing in this match — shown as the resting roster (grey chips).
  const matchTeams = useMemo(() => {
    const out: Array<{ id: number; name: string; color: string }> = [];
    for (const alliance of match.alliances) {
      for (const entry of alliance.teams) {
        if (entry.team?.name) {
          out.push({ id: entry.team.id, name: entry.team.name, color: alliance.color ?? "" });
        }
      }
    }
    return out;
  }, [match]);

  // Match a team number on non-alphanumeric boundaries (handles 169W, 9181X).
  const mentions = useMemo(() => {
    const text = body;
    return (name: string) => {
      if (!text.trim()) return false;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:$|[^A-Za-z0-9])`, "i").test(text);
    };
  }, [body]);

  const matchIds = useMemo(() => new Set(matchTeams.map((t) => t.id)), [matchTeams]);

  // Teams elsewhere in the event that the note mentions but aren't in this match
  // — surfaced as extra colored tags so any event team you type becomes clickable.
  const extraTeams = useMemo(() => {
    if (!eventTeams || !body.trim()) return [] as { id: number; number: string }[];
    return eventTeams.filter((t) => !matchIds.has(t.id) && mentions(t.number));
  }, [eventTeams, matchIds, mentions, body]);

  if (!matchTeams.length && !extraTeams.length) return null;

  return (
    <div className="note-team-chips">
      {matchTeams.map(({ id, name, color }) => (
        <TeamQuickLink
          key={id}
          teamId={id}
          teamNumber={name}
          programCode={programCode}
          className={`note-team-chip note-team-chip-${color} ${mentions(name) ? "mentioned" : ""}`}
          title={`Open team ${name}`}
        >
          {name}
        </TeamQuickLink>
      ))}
      {extraTeams.map(({ id, number }) => (
        <TeamQuickLink
          key={id}
          teamId={id}
          teamNumber={number}
          programCode={programCode}
          className="note-team-chip note-team-chip-accent mentioned"
          title={`Open team ${number}`}
        >
          {number}
        </TeamQuickLink>
      ))}
    </div>
  );
}

// ── Inline team pills inside note editors ─────────────────────────────────────
// A team number typed into a note (1-5 digits + one letter, e.g. "169W") is
// auto-detected and rendered as an inline, clickable pill colored by its alliance
// (red/blue for teams in this match, accent for any other event team). The editor
// is a contentEditable surface whose *source of truth is plain text*: on each
// change we re-tokenize the text and rebuild the DOM, wrapping recognized team
// numbers in atomic (contentEditable=false) spans. The store, shared team notes, the
// timestamp jump-bar and search all keep seeing a plain string via textContent —
// no storage/format change. Clicking a pill honors the quick-view-first setting,
// exactly like TeamQuickLink.

type NoteTeamInfo = { teamId?: number; teamNumber: string; color: "red" | "blue" | "accent" };
type NoteSeg = { type: "text"; text: string } | { type: "pill"; text: string; team: NoteTeamInfo };

// Candidate token: 1-5 digits then a single letter. Word boundaries are checked
// against the surrounding characters so "abc10B" / "10BC" are left as plain text.
const NOTE_TEAM_TOKEN_RE = /\d{1,5}[A-Za-z]/g;
// A lone trailing pill can't hold a caret after it, so renderNoteSegs appends this
// zero-width space as an editable landing spot. It is stripped from every read.
const NOTE_ZWSP = "​";

function tokenizeNote(text: string, lookup: (token: string) => NoteTeamInfo | null): NoteSeg[] {
  const segs: NoteSeg[] = [];
  let last = 0;
  NOTE_TEAM_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NOTE_TEAM_TOKEN_RE.exec(text))) {
    const start = m.index;
    const end = start + m[0].length;
    const before = start > 0 ? text[start - 1] : "";
    const after = end < text.length ? text[end] : "";
    if (/[A-Za-z0-9]/.test(before) || /[A-Za-z0-9]/.test(after)) continue;
    const team = lookup(m[0]);
    if (!team) continue;
    if (start > last) segs.push({ type: "text", text: text.slice(last, start) });
    segs.push({ type: "pill", text: m[0], team });
    last = end;
  }
  if (last < text.length) segs.push({ type: "text", text: text.slice(last) });
  return segs;
}

function renderNoteSegs(el: HTMLElement, segs: NoteSeg[], programCode?: string) {
  const nodes: Node[] = [];
  let endsWithPill = false;
  for (const seg of segs) {
    if (seg.type === "text") {
      nodes.push(document.createTextNode(seg.text));
      endsWithPill = false;
    } else {
      const span = document.createElement("span");
      span.className = `note-inline-pill note-inline-pill-${seg.team.color}`;
      span.setAttribute("contenteditable", "false");
      span.dataset.teamNumber = seg.team.teamNumber;
      if (seg.team.teamId != null) span.dataset.teamId = String(seg.team.teamId);
      if (programCode) span.dataset.program = programCode;
      span.title = `Open team ${seg.team.teamNumber}`;
      span.textContent = seg.text;
      nodes.push(span);
      endsWithPill = true;
    }
  }
  if (endsWithPill) nodes.push(document.createTextNode(NOTE_ZWSP));
  el.replaceChildren(...nodes);
}

// Caret position as a character offset into the plain text (ZWSP excluded).
function noteCaretOffset(el: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().replace(/​/g, "").length;
}

// Restore the caret to a plain-text character offset after a DOM rebuild.
function setNoteCaret(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const clean = (node.nodeValue ?? "").replace(/​/g, "");
    if (clean.length === 0) continue; // skip the ZWSP landing node
    if (remaining <= clean.length) {
      const parent = node.parentElement;
      const range = document.createRange();
      if (parent && parent !== el && parent.getAttribute("contenteditable") === "false") {
        // Offset lands inside an atomic pill — park the caret just after it.
        range.setStartAfter(parent);
      } else {
        range.setStart(node, remaining);
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= clean.length;
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

// A contentEditable note field that live-pills team numbers. `value` is plain
// text; `onChange` always receives plain text. `apiRef` exposes insertAtCaret so
// callers (the video panel) can inject timestamps at the cursor.
function TeamNoteEditor({
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
  match,
  eventTeams,
  apiRef,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  match: Match;
  eventTeams?: { id: number; number: string }[];
  apiRef?: { current: { insertAtCaret: (text: string) => void } | null };
}) {
  const programCode = useContext(ProgramContext);
  const quickViewFirst = useQuickViewFirst();
  const editorRef = useRef<HTMLDivElement>(null);
  const prevHadPills = useRef(false);
  const composingRef = useRef(false);
  const lastLookupKey = useRef(" UNSET");

  // Build a case-insensitive team lookup: match teams win (red/blue), then any
  // other event team as an accent pill. Mirrors NoteTeamChips' color logic.
  const lookup = useMemo(() => {
    const map = new Map<string, NoteTeamInfo>();
    for (const alliance of match.alliances) {
      const color: NoteTeamInfo["color"] =
        alliance.color === "red" ? "red" : alliance.color === "blue" ? "blue" : "accent";
      for (const entry of alliance.teams) {
        const num = entry.team?.name;
        if (num) map.set(num.toUpperCase(), { teamId: entry.team.id, teamNumber: num, color });
      }
    }
    for (const t of eventTeams ?? []) {
      const key = t.number.toUpperCase();
      if (!map.has(key)) map.set(key, { teamId: t.id, teamNumber: t.number, color: "accent" });
    }
    return (token: string) => map.get(token.toUpperCase()) ?? null;
  }, [match, eventTeams]);

  // Signature that changes when the roster/colors change, so pills re-render once
  // team data loads even if the note text is unchanged.
  const lookupKey = useMemo(() => {
    const parts: string[] = [];
    for (const alliance of match.alliances)
      for (const entry of alliance.teams)
        if (entry.team?.name) parts.push(`${entry.team.name}:${alliance.color ?? ""}`);
    for (const t of eventTeams ?? []) parts.push(`${t.number}:x`);
    return parts.join("|");
  }, [match, eventTeams]);

  const render = useCallback(
    (text: string, caret: number | null) => {
      const el = editorRef.current;
      if (!el) return;
      const segs = tokenizeNote(text, lookup);
      prevHadPills.current = segs.some((s) => s.type === "pill");
      renderNoteSegs(el, segs, programCode);
      if (caret != null) setNoteCaret(el, caret);
    },
    [lookup, programCode],
  );

  const commit = useCallback(
    (text: string, caret: number | null) => {
      const next = text.slice(0, NOTE_CHAR_LIMIT);
      onChange(next);
      render(next, caret == null ? null : Math.min(caret, next.length));
    },
    [onChange, render],
  );

  const insertPlainText = useCallback(
    (str: string) => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const domText = (el.textContent ?? "").replace(/​/g, "");
      const offset = noteCaretOffset(el) ?? domText.length;
      const next = domText.slice(0, offset) + str + domText.slice(offset);
      commit(next, offset + str.length);
    },
    [commit],
  );

  // Live pilling on plain typing: skip the DOM rebuild entirely while the text has
  // no pills (the browser already shows it right), rebuild only when a pill exists
  // or just dissolved, or when the char limit trims the text.
  const onInput = useCallback(() => {
    const el = editorRef.current;
    if (!el || composingRef.current) return;
    const rawText = (el.textContent ?? "").replace(/​/g, "");
    const truncated = rawText.length > NOTE_CHAR_LIMIT;
    const text = truncated ? rawText.slice(0, NOTE_CHAR_LIMIT) : rawText;
    onChange(text);
    const segs = tokenizeNote(text, lookup);
    const hasPills = segs.some((s) => s.type === "pill");
    // Fast path for plain typing: the browser already shows the text correctly,
    // so skip the rebuild. Still rebuild when the field empties, so a stray <br>
    // left by the browser is cleared and the :empty placeholder can show.
    if (text !== "" && !hasPills && !prevHadPills.current && !truncated) {
      prevHadPills.current = false;
      return;
    }
    const offset = Math.min(noteCaretOffset(el) ?? text.length, text.length);
    prevHadPills.current = hasPills;
    renderNoteSegs(el, segs, programCode);
    setNoteCaret(el, offset);
  }, [lookup, onChange, programCode]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // Keep newlines as real "\n" characters so textContent stays faithful
      // (contentEditable would otherwise insert <div>/<br> that textContent drops).
      if (e.key === "Enter") {
        e.preventDefault();
        insertPlainText("\n");
      }
    },
    [insertPlainText],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      insertPlainText(e.clipboardData.getData("text/plain"));
    },
    [insertPlainText],
  );

  const onClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const el = editorRef.current;
      const pill = (e.target as HTMLElement).closest?.("[data-team-number]") as HTMLElement | null;
      if (!pill || !el?.contains(pill)) return;
      e.preventDefault();
      e.stopPropagation();
      const teamNumber = pill.dataset.teamNumber!;
      const teamId = pill.dataset.teamId ? Number(pill.dataset.teamId) : undefined;
      const program = pill.dataset.program || programCode;
      if (quickViewFirst && _currentEventId != null) {
        openQuickView({ teamId, teamNumber, programCode: program, pointerSide: pointerSideFromEvent(e) });
      } else {
        navigate(teamSlugPath(program, teamNumber, teamId));
      }
    },
    [programCode, quickViewFirst],
  );

  // Render on external changes: mount, scope switch, timestamp insert, and roster
  // load. Skipped when the DOM already matches (our own edits handled inline).
  useEffect(() => {
    const el = editorRef.current;
    if (!el || composingRef.current) return;
    const domText = (el.textContent ?? "").replace(/​/g, "");
    if (domText === value && lastLookupKey.current === lookupKey) return;
    lastLookupKey.current = lookupKey;
    const focused = el.contains(document.activeElement);
    const caret = focused ? Math.min(noteCaretOffset(el) ?? value.length, value.length) : null;
    render(value, caret);
  }, [value, lookupKey, render]);

  // Focus + caret-to-end once when requested (replaces textarea autoFocus).
  useEffect(() => {
    if (!autoFocus) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    setNoteCaret(el, (el.textContent ?? "").replace(/​/g, "").length);
  }, [autoFocus]);

  // Expose imperative insert for callers that inject text at the caret.
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = { insertAtCaret: insertPlainText };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, insertPlainText]);

  return (
    <div
      ref={editorRef}
      className={`note-editor ${className ?? ""}`}
      contentEditable
      role="textbox"
      aria-multiline="true"
      aria-label={placeholder}
      data-placeholder={placeholder}
      spellCheck
      suppressContentEditableWarning
      onInput={onInput}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onClick={onClick}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={() => {
        composingRef.current = false;
        onInput();
      }}
    />
  );
}

// Quick note editor anchored to a match row. Binds the textarea directly to the
// store (single source of truth shared with the video panel); the rail dot flips
// live as you type and the debounced cloud write happens in the store.
function MatchNotePopover({
  match,
  eventId,
  eventTeams,
  anchorRect,
  onClose,
}: {
  match: Match;
  eventId?: number;
  eventTeams?: { id: number; number: string }[];
  anchorRect: DOMRect;
  onClose: () => void;
}) {
  const sharedTeams = useSharedTeams();
  const [scope, setScope] = useState<string>("personal");
  // Always call both hooks (Rules of Hooks — no conditional calls)
  const personalNote = useMatchNote(match.id);
  const sharedTeamNote = useSharedTeamMatchNote(scope !== "personal" ? scope : "__none__", match.id);
  const activeBody = scope === "personal" ? personalNote.body : sharedTeamNote.body;
  const handleChange = (val: string) => {
    const v = val.slice(0, NOTE_CHAR_LIMIT);
    if (scope === "personal") setMatchNote(match.id, eventId ?? null, v);
    else setSharedTeamMatchNote(scope, match.id, eventId ?? null, v);
  };

  const charsUsed = activeBody.length;
  const charsLeft = NOTE_CHAR_LIMIT - charsUsed;
  const showCounter = charsUsed > NOTE_CHAR_LIMIT * 0.8;

  const ref = useOutsideClick<HTMLDivElement>(onClose);
  useEffect(() => {
    const onScroll = () => onClose();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [onClose]);
  const top = Math.max(8, Math.min(anchorRect.top, window.innerHeight - 200));
  const left = Math.min(anchorRect.right + 8, window.innerWidth - 288);
  return (
    <div className="note-popover" ref={ref} style={{ top, left }}>
      <div className="note-popover-title">{match.name}</div>
      {sharedTeams.length > 0 && (
        <div className="note-scope-toggle">
          <button
            type="button"
            className={`note-scope-btn ${scope === "personal" ? "active" : ""}`}
            onClick={() => setScope("personal")}
          >
            Personal
          </button>
          {sharedTeams.length === 1 ? (
            <button
              type="button"
              className={`note-scope-btn ${scope === sharedTeams[0].sharedTeamId ? "active" : ""}`}
              onClick={() => setScope(sharedTeams[0].sharedTeamId)}
              title={sharedTeams[0].name}
            >
              {sharedTeams[0].name}
            </button>
          ) : (
            <select
              className="note-scope-select"
              value={scope === "personal" ? "" : scope}
              onChange={(e) => setScope(e.target.value || "personal")}
            >
              <option value="">Select shared team…</option>
              {sharedTeams.map((t) => (
                <option key={t.sharedTeamId} value={t.sharedTeamId}>{t.name}</option>
              ))}
            </select>
          )}
        </div>
      )}
      <TeamNoteEditor
        className="note-popover-input"
        autoFocus
        value={activeBody}
        onChange={handleChange}
        placeholder={scope === "personal" ? "Add a note…" : "Add a team note…"}
        match={match}
        eventTeams={eventTeams}
      />
      <NoteTeamChips match={match} body={activeBody} eventTeams={eventTeams} />
      <div className="note-popover-footer">
        <span className="note-popover-hint">Saved automatically · empty clears</span>
        {showCounter && (
          <span className={`note-char-counter${charsLeft <= 100 ? " danger" : " warn"}`}>
            {charsLeft}
          </span>
        )}
      </div>
    </div>
  );
}

function ResultsMatchTable({
  matches,
  emptyText,
  matchDirection,
  onToggleMatchDirection,
  timestampMap,
  presetSupported,
  presetLoading,
  presetUrl,
  onOpenMatch,
  dayNumbers,
  dayKeyOf = makeMatchDayKey(),
  eventTz,
  isIq = false,
  labelFor,
  scoreTier,
  markWinningIqScore = false,
  showNoteRail = false,
  eventId,
  eventTeams,
  focusMatchId,
  onFocusConsumed,
  focusTeamId,
}: {
  matches: Match[];
  emptyText: string;
  matchDirection?: DateDirection;
  onToggleMatchDirection?: () => void;
  timestampMap?: Map<number, MatchTimestamp>;
  presetSupported?: boolean;
  presetLoading?: boolean;
  presetUrl?: string | null;
  onOpenMatch?: (match: Match, timestamp: MatchTimestamp) => void;
  dayNumbers?: Map<string, number>;
  // Resolves a match to its "YYYY-MM-DD" day key (event-local when a timezone is
  // known). Must be the same function used to build dayNumbers so dividers align.
  dayKeyOf?: (match: Match) => string | null;
  // IANA timezone of the event; match times render in this zone with an info icon
  // when it differs from the viewer's timezone.
  eventTz?: string | null;
  isIq?: boolean;
  labelFor?: (match: Match) => string | undefined;
  scoreTier?: (score: number | null | undefined) => ScoreTier;
  // IQ finals: mark the highest (winning) score green instead of tiering it.
  markWinningIqScore?: boolean;
  showNoteRail?: boolean;
  eventId?: number;
  eventTeams?: { id: number; number: string }[];
  // When arriving from a scouting-note deep link (`/event/{id}?match={matchId}`),
  // the matching row is scrolled into view and briefly flashed.
  focusMatchId?: string | null;
  // Called once after the focus row is scrolled + flashed, so the parent can clear
  // the focus id — leaving and returning to the tab then won't re-trigger it.
  onFocusConsumed?: () => void;
  // When the F-search narrows to one team, show only that team's alliance side
  // (partner kept, opposing alliance hidden) — set only for elimination tables.
  focusTeamId?: number;
}) {
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const rafRef = useRef(0);
  const latestYRef = useRef(0); // always the most-recent cursor Y; rAF reads this
  // Winning (highest) IQ finals score — highlighted green when markWinningIqScore.
  const winningIqScore = markWinningIqScore
    ? matches.reduce((max, m) => Math.max(max, iqMatchResult(m).score ?? 0), 0)
    : null;
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [popover, setPopover] = useState<{ match: Match; rect: DOMRect } | null>(null);
  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const noteColSpan = showNoteRail ? 6 : 5;

  // One-shot scroll-to + flash for a match deep-linked from a scouting note.
  // Guarded so it fires once even if `matches` re-renders (live refresh, sort).
  const focusConsumedRef = useRef(false);
  useEffect(() => {
    if (!focusMatchId || focusConsumedRef.current) return;
    const row = tbodyRef.current?.querySelector<HTMLElement>(`#match-row-${CSS.escape(focusMatchId)}`);
    if (!row) return; // target isn't on this table/tab — no-op gracefully
    focusConsumedRef.current = true;
    // Record consumption immediately (parent stores it in a ref — no re-render), so
    // it holds even if the user leaves before the flash finishes.
    onFocusConsumed?.();
    row.classList.add("match-row-flash");
    const isCentered = () => {
      const r = row.getBoundingClientRect();
      return Math.abs(r.top + r.height / 2 - window.innerHeight / 2) < 40;
    };
    const scroll = (smooth: boolean) => row.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
    scroll(!reduceMotion);
    // Arriving via a tab switch (score-chart jump) the tall results layout keeps
    // settling for a few hundred ms, so the first scroll lands short. Re-snap while
    // it settles, stopping once the row is actually centered (so we never fight a
    // user who scrolls away).
    const settleTimers = [120, 260, 450, 700].map((delay) =>
      window.setTimeout(() => {
        if (!isCentered()) scroll(false);
      }, delay),
    );
    const flashTimer = window.setTimeout(() => row.classList.remove("match-row-flash"), 2000);
    return () => {
      settleTimers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(flashTimer);
    };
  }, [focusMatchId, matches, reduceMotion]);

  // Dock-style fisheye: while the cursor is over the left rail band, scale each
  // dot by a gaussian of its distance to the cursor (closer = bigger). Written
  // imperatively (dot.style.transform) so a ~200-row table doesn't re-render
  // every frame; React state only tracks the focused dot (for its label).
  const handleRailMove = (e: ReactPointerEvent) => {
    if (reduceMotion) return;
    // Always capture the freshest cursor Y before the throttle check so the
    // pending rAF (if any) picks it up rather than using a stale snapshot.
    latestYRef.current = e.clientY;
    if (rafRef.current) return; // throttle to one update per frame
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const dots = tbodyRef.current?.querySelectorAll<HTMLElement>(".note-dot");
      if (!dots) return;
      const cursorY = latestYRef.current; // freshest position
      const SIGMA = 60;
      const MAX = 1.1;
      let bestId: number | null = null;
      let bestFactor = 0;
      dots.forEach((dot) => {
        const r = dot.getBoundingClientRect();
        const factor = Math.exp(-((cursorY - (r.top + r.height / 2)) ** 2) / (2 * SIGMA * SIGMA));
        // translateY keeps the absolutely-positioned dot vertically centered; scale
        // is the fisheye; --p (0..1) drives the dot→note-icon morph in CSS.
        dot.style.transform = `translateY(-50%) scale(${1 + MAX * factor})`;
        dot.style.setProperty("--p", factor.toFixed(3));
        if (factor > bestFactor) {
          bestFactor = factor;
          bestId = Number(dot.dataset.matchId);
        }
      });
      setFocusedId(bestFactor > 0.5 ? bestId : null);
    });
  };
  const handleRailLeave = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    tbodyRef.current?.querySelectorAll<HTMLElement>(".note-dot").forEach(resetDot);
    setFocusedId(null);
  };

  return (
    <>
    {/* note-rail-zone extends the hit area left into the gutter so the fisheye
        doesn't drop when the cursor is between two dots but not over the table. */}
    <div
      className={showNoteRail ? "note-rail-zone" : undefined}
      onPointerMove={showNoteRail ? handleRailMove : undefined}
      onPointerLeave={showNoteRail ? handleRailLeave : undefined}
    >
    <table className={`results-match-table ${showNoteRail ? "has-note-rail" : ""}`}>
      <colgroup>
        {showNoteRail && <col className="note-rail-col" />}
        <col className="results-play-col" />
        <col className="results-match-col" />
        <col className="results-alliance-col" />
        <col className="results-score-col" />
        <col className="results-alliance-col" />
      </colgroup>
      <thead>
        <tr>
          {showNoteRail && <th className="note-rail-cell" aria-hidden="true" />}
          <th className="play-cell" aria-label="Open match">
            {presetLoading ? (
              <span className="play-header-icon loading" />
            ) : presetSupported ? (
              <a href={presetUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="play-header-link active" title="Open in Jumper">
                <LinkIcon size={14} />
              </a>
            ) : (
              <span className="play-header-link disabled" title="No livestream preset">
                <Unlink size={14} />
              </span>
            )}
          </th>
          <th>
            <span className="match-header-label">
              Match
              {onToggleMatchDirection && (
                <button className="match-sort-toggle" onClick={onToggleMatchDirection} aria-label="Toggle match order">
                  {matchDirection === "desc" ? "▾" : "▴"}
                </button>
              )}
            </span>
          </th>
          <th>{isIq ? "Team" : <><span className="alliance-th-full">Red Alliance</span><span className="alliance-th-short">Red</span></>}</th>
          <th>Score</th>
          <th>{isIq ? "Team" : <><span className="alliance-th-full">Blue Alliance</span><span className="alliance-th-short">Blue</span></>}</th>
        </tr>
      </thead>
      <tbody
        ref={tbodyRef}
      >
        {matches.map((match, index) => {
          const { red, blue, redScore, blueScore, winner } = matchWinner(match);
          const redTeams = red?.teams ?? [];
          const blueTeams = blue?.teams ?? [];
          // F-search focus: when this match contains the searched team, show only
          // its alliance side and blank out the opposing alliance's chips.
          const focusInRed = focusTeamId != null && redTeams.some((t) => t.team.id === focusTeamId);
          const focusInBlue = focusTeamId != null && blueTeams.some((t) => t.team.id === focusTeamId);
          const hideOpponent = focusInRed || focusInBlue;
          const iqResult = isIq ? iqMatchResult(match) : null;
          const timestamp = timestampMap?.get(match.id);
          const canPlay = presetSupported && timestamp && timestamp.timestamp !== null && timestamp.videoId;
          const displayName = labelFor?.(match) ?? match.name;

          let dayDivider: ReactNode = null;
          if (dayNumbers && index > 0) {
            const dayKey = dayKeyOf(match);
            const prevDayKey = dayKeyOf(matches[index - 1]);
            if (dayKey && prevDayKey && dayKey !== prevDayKey) {
              const currentDay = dayNumbers.get(dayKey);
              const prevDay = dayNumbers.get(prevDayKey);
              if (currentDay && prevDay) {
                dayDivider = (
                  <tr className="match-day-divider-row">
                    <td colSpan={noteColSpan}>End of Day {Math.min(currentDay, prevDay)}</td>
                  </tr>
                );
              }
            }
          }

          return (
            <Fragment key={match.id}>
              {dayDivider}
              <tr id={`match-row-${match.id}`} data-match-id={match.id}>
              {showNoteRail && (
                <td className="note-rail-cell">
                  <NoteRailDot
                    matchId={match.id}
                    matchName={displayName}
                    focused={focusedId === match.id}
                    onOpen={(el) => setPopover({ match, rect: el.getBoundingClientRect() })}
                  />
                </td>
              )}
              <td className="play-cell">
                {canPlay ? (
                  <button
                    className="play-dot active"
                    onClick={() => onOpenMatch?.(match, timestamp)}
                    title={`Play ${displayName}`}
                  />
                ) : (
                  <span className="play-dot disabled" />
                )}
              </td>
              <td className="result-match-name">
                <span className="result-match-line">
                  <span className="result-match-label">{displayName}</span>
                  <MatchTime match={match} eventTz={eventTz} />
                  {match.field && (
                    <span className="result-field-name">
                      {match.field}
                    </span>
                  )}
                </span>
              </td>
              <td className={`alliance-cell red-alliance-cell ${!isIq && winner === "Red" ? "winning-alliance-cell" : ""} ${iqResult?.dqColor === "red" ? "dq-alliance-cell" : ""}`}>
                <AllianceTeamLinks teams={hideOpponent && !focusInRed ? undefined : redTeams} focusTeamId={focusTeamId} dq={iqResult?.dqColor === "red"} />
              </td>
              {isIq ? (
                <td className="score-cell">
                  <span className={`score iq-score${winningIqScore != null && iqResult?.score != null && iqResult.score === winningIqScore ? " score-win" : iqTierClass(scoreTier?.(iqResult?.score) ?? null)}`}>{iqResult?.score ?? "-"}</span>
                </td>
              ) : (
                <td className="score-cell">
                  <span className={`score red ${winner === "Blue" ? "score-loser" : ""}`}>{redScore ?? "-"}</span>
                  <span className={`score blue ${winner === "Red" ? "score-loser" : ""}`}>{blueScore ?? "-"}</span>
                </td>
              )}
              <td className={`alliance-cell blue-alliance-cell ${!isIq && winner === "Blue" ? "winning-alliance-cell" : ""} ${iqResult?.dqColor === "blue" ? "dq-alliance-cell" : ""}`}>
                <AllianceTeamLinks teams={hideOpponent && !focusInBlue ? undefined : blueTeams} focusTeamId={focusTeamId} dq={iqResult?.dqColor === "blue"} />
              </td>
              </tr>
            </Fragment>
          );
        })}
        {!matches.length && (
          <tr>
            <td colSpan={noteColSpan}>
              <Empty>{emptyText}</Empty>
            </td>
          </tr>
        )}
      </tbody>
    </table>
    </div>
    {popover && (
      <MatchNotePopover
        match={popover.match}
        eventId={eventId}
        eventTeams={eventTeams}
        anchorRect={popover.rect}
        onClose={() => setPopover(null)}
      />
    )}
    </>
  );
}

function formatTimestamp(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function MatchVideoOverlay({ playback, onClose }: { playback: MatchPlayback; onClose: () => void }) {
  // The iframe lives inside a Radix Dialog portal, so it isn't attached yet on
  // the commit where a plain-ref effect would first run. Track the node in state
  // via a callback ref so the player-setup effect re-runs once it actually mounts.
  const [iframeEl, setIframeEl] = useState<HTMLIFrameElement | null>(null);
  const setIframeRef = useCallback((node: HTMLIFrameElement | null) => setIframeEl(node), []);
  const playerRef = useRef<{ seekTo: (s: number, b: boolean) => void; pauseVideo: () => void; playVideo: () => void; getCurrentTime: () => number; destroy: () => void } | null>(null);
  const pollRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(playback.timestamp.timestamp ?? 0);

  // Flag the video modal as open so a quick view launched from its notes renders
  // as a non-dimmed bottom sheet above this dialog instead of behind it.
  useEffect(() => {
    _videoOverlayOpen = true;
    return () => { _videoOverlayOpen = false; };
  }, []);

  const { red, blue, redScore, blueScore, winner } = matchWinner(playback.match);
  const redTeams = red?.teams.map((t) => t.team.name).join(" ") ?? "";
  const blueTeams = blue?.teams.map((t) => t.team.name).join(" ") ?? "";
  const startSeconds = Math.max(0, Math.floor(playback.timestamp.timestamp ?? 0));

  const embedUrl = useMemo(() => {
    if (!playback.timestamp.videoId) return "";
    const params = new URLSearchParams({
      enablejsapi: "1",
      autoplay: "1",
      start: String(startSeconds),
      rel: "0",
      modestbranding: "1",
      origin: window.location.origin,
    });
    return `https://www.youtube.com/embed/${playback.timestamp.videoId}?${params.toString()}`;
  }, [playback.timestamp.videoId, startSeconds]);

  useEffect(() => {
    if (!playback.timestamp.videoId || !iframeEl) return;
    let destroyed = false;

    onYtApiReady(() => {
      if (destroyed) return;
      const YT = (window as unknown as Record<string, unknown>).YT as { Player: new (el: HTMLElement, opts: unknown) => unknown };
      const player = new YT.Player(iframeEl, {
        events: {
          onReady: () => {
            playerRef.current = player as typeof playerRef.current;
          },
          onStateChange: (event: { data: number }) => {
            setIsPlaying(event.data === 1);
            if ((event.data === 1 || event.data === 3) && !pollRef.current) {
              pollRef.current = window.setInterval(() => {
                const t = playerRef.current?.getCurrentTime() ?? 0;
                if (t > 0) setCurrentTime(Math.floor(t));
              }, 1000);
            }
          },
        },
      }) as typeof playerRef.current;
    });

    return () => {
      destroyed = true;
      window.clearInterval(pollRef.current);
      pollRef.current = 0;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [playback.timestamp.videoId, iframeEl]);

  const seekBy = (delta: number) => {
    if (!playerRef.current) return;
    const newTime = Math.max(0, playerRef.current.getCurrentTime() + delta);
    playerRef.current.seekTo(newTime, true);
    setCurrentTime(Math.floor(newTime));
  };

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const seekTo = (seconds: number) => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(seconds, true);
    setCurrentTime(Math.floor(seconds));
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showCloseButton={false} className="w-fit max-w-none sm:max-w-none border-0 bg-transparent p-0 shadow-none">
        <DialogTitle className="sr-only">Match video</DialogTitle>
        <div className="video-modal">
        <div className="video-modal-header">
          <div className="video-match-info">
            <strong>{playback.match.name}</strong>
            <span className="video-match-teams">
              <span className={`video-team-red ${winner === "Red" ? "winning" : ""}`}>{redTeams}</span>
              <span className="video-vs">vs</span>
              <span className={`video-team-blue ${winner === "Blue" ? "winning" : ""}`}>{blueTeams}</span>
            </span>
            {redScore !== null && blueScore !== null && (
              <span className="video-match-score">
                <span className={`score red ${winner === "Blue" ? "score-loser" : ""}`}>{redScore}</span>
                <span className={`score blue ${winner === "Red" ? "score-loser" : ""}`}>{blueScore}</span>
              </span>
            )}
          </div>
          <div className="video-header-actions">
            <a
              href={playback.timestamp.livestreamLink ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="video-yt-link"
            >
              <Youtube size={16} />
              Open in YouTube
            </a>
            <CloseButton onClose={onClose} />
          </div>
        </div>
        <div className="video-body">
          <div className="video-main">
            <div className="video-embed-wrap">
              {playback.timestamp.videoId ? (
                <iframe
                  ref={setIframeRef}
                  src={embedUrl}
                  className="video-player-iframe"
                  allow="autoplay; encrypted-media; fullscreen"
                  allowFullScreen
                />
              ) : (
                <div className="video-unavailable">Video unavailable</div>
              )}
            </div>
            <div className="video-controls">
              <button onClick={() => seekBy(-60)} title="Back 1 minute">-1m</button>
              <button onClick={() => seekBy(-30)} title="Back 30 seconds">-30s</button>
              <button onClick={() => seekBy(-10)} title="Back 10 seconds">-10s</button>
              <button onClick={() => seekBy(-5)} title="Back 5 seconds">-5s</button>
              <button className="video-play-btn" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button onClick={() => seekBy(5)} title="Forward 5 seconds">+5s</button>
              <button onClick={() => seekBy(10)} title="Forward 10 seconds">+10s</button>
              <button onClick={() => seekBy(30)} title="Forward 30 seconds">+30s</button>
              <button onClick={() => seekBy(60)} title="Forward 1 minute">+1m</button>
            </div>
            <div className="video-timestamp">
              {formatTimestamp(currentTime)} from stream start
            </div>
          </div>
          <NoteEditorPanel
            match={playback.match}
            eventId={playback.match.event.id}
            getTime={() => playerRef.current?.getCurrentTime() ?? null}
            onSeek={seekTo}
          />
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Parse inline [m:ss] / [h:mm:ss] tokens out of a note body into de-duped,
// clickable seek targets for the jump bar.
function parseTimestamps(body: string): Array<{ label: string; seconds: number }> {
  const re = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g;
  const out: Array<{ label: string; seconds: number }> = [];
  const seen = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const c = m[3] !== undefined ? Number(m[3]) : null;
    const seconds = c !== null ? a * 3600 + b * 60 + c : a * 60 + b;
    if (seen.has(seconds)) continue;
    seen.add(seconds);
    out.push({ label: m[0].slice(1, -1), seconds });
  }
  return out;
}

// Note editor beside the video. Bound to the same store note as the rail popover
// (single source of truth). "Insert timestamp" drops the live playback time at the
// caret; the jump bar seeks to any [m:ss] token in the note.
function NoteEditorPanel({
  match,
  eventId,
  getTime,
  onSeek,
}: {
  match: Match;
  eventId?: number;
  getTime: () => number | null;
  onSeek: (seconds: number) => void;
}) {
  const sharedTeams = useSharedTeams();
  const [scope, setScope] = useState<string>("personal");
  // Always call both hooks (Rules of Hooks — no conditional calls)
  const personalNote = useMatchNote(match.id);
  const sharedTeamNote = useSharedTeamMatchNote(scope !== "personal" ? scope : "__none__", match.id);
  const body = scope === "personal" ? personalNote.body : sharedTeamNote.body;
  const handleChange = (val: string) => {
    const v = val.slice(0, NOTE_CHAR_LIMIT);
    if (scope === "personal") setMatchNote(match.id, eventId ?? null, v);
    else setSharedTeamMatchNote(scope, match.id, eventId ?? null, v);
  };

  const charsUsed = body.length;
  const charsLeft = NOTE_CHAR_LIMIT - charsUsed;
  const showCounter = charsUsed > NOTE_CHAR_LIMIT * 0.8;

  const editorApi = useRef<{ insertAtCaret: (text: string) => void } | null>(null);
  const chips = useMemo(() => parseTimestamps(body), [body]);

  const insertTimestamp = () => {
    const t = getTime();
    if (t == null) return;
    const token = `[${formatTimestamp(Math.floor(t))}]`;
    if (editorApi.current) editorApi.current.insertAtCaret(token);
    else handleChange((body + token).slice(0, NOTE_CHAR_LIMIT));
  };

  return (
    <div className="video-note-panel">
      <div className="video-note-head">
        <StickyNote size={14} />
        Match notes
      </div>
      {sharedTeams.length > 0 && (
        <div className="note-scope-toggle">
          <button
            type="button"
            className={`note-scope-btn ${scope === "personal" ? "active" : ""}`}
            onClick={() => setScope("personal")}
          >
            Personal
          </button>
          {sharedTeams.length === 1 ? (
            <button
              type="button"
              className={`note-scope-btn ${scope === sharedTeams[0].sharedTeamId ? "active" : ""}`}
              onClick={() => setScope(sharedTeams[0].sharedTeamId)}
              title={sharedTeams[0].name}
            >
              {sharedTeams[0].name}
            </button>
          ) : (
            <select
              className="note-scope-select"
              value={scope === "personal" ? "" : scope}
              onChange={(e) => setScope(e.target.value || "personal")}
            >
              <option value="">Select shared team…</option>
              {sharedTeams.map((t) => (
                <option key={t.sharedTeamId} value={t.sharedTeamId}>{t.name}</option>
              ))}
            </select>
          )}
        </div>
      )}
      <TeamNoteEditor
        className="video-note-input"
        value={body}
        onChange={handleChange}
        placeholder={scope === "personal" ? "Jot notes while you watch…" : "Team notes…"}
        match={match}
        apiRef={editorApi}
      />
      {showCounter && (
        <div className={`note-char-counter-block note-char-counter${charsLeft <= 100 ? " danger" : " warn"}`}>
          {charsLeft} remaining
        </div>
      )}
      <NoteTeamChips match={match} body={body} />
      <button type="button" className="note-insert-btn" onClick={insertTimestamp}>
        <Clock size={13} />
        Insert timestamp
      </button>
      {chips.length > 0 && (
        <div className="note-jump-bar">
          {chips.map((chip) => (
            <button type="button" key={chip.seconds} className="ts-chip" onClick={() => onSeek(chip.seconds)}>
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type BracketTeam = { id: number; name: string };
type BracketSlot = { seed: number | null; teams: BracketTeam[]; score: number | null; winner: boolean };
type BracketNode = { id: string; label: string; red: BracketSlot; blue: BracketSlot };
type BracketRound = { key: string; nodes: BracketNode[] };

function allianceTeamKey(teams: BracketTeam[]) {
  return teams
    .map((team) => team.name?.toLowerCase().trim())
    .filter(Boolean)
    .sort()
    .join("|");
}

function buildBracketSeedMap(matches: Match[]) {
  const seedMap = new Map<string, number>();
  const assignFromRound = (key: "r16" | "qf", pairs: number[][]) => {
    matches
      .filter((match) => playoffRoundKey(match) === key)
      .forEach((match) => {
        const pair = pairs[(match.instance ?? 1) - 1];
        if (!pair) return;
        const red = match.alliances.find((alliance) => alliance.color === "red");
        const blue = match.alliances.find((alliance) => alliance.color === "blue");
        if (red) {
          const key = allianceTeamKey(red.teams.map((entry) => entry.team));
          if (key && !seedMap.has(key)) seedMap.set(key, pair[0]);
        }
        if (blue) {
          const key = allianceTeamKey(blue.teams.map((entry) => entry.team));
          if (key && !seedMap.has(key)) seedMap.set(key, pair[1]);
        }
      });
  };
  assignFromRound("r16", r16SeedPairs);
  assignFromRound("qf", qfSeedPairs);
  return seedMap;
}

function seedForTeams(seedMap: Map<string, number>, teams: BracketTeam[]) {
  const key = allianceTeamKey(teams);
  return key && seedMap.has(key) ? seedMap.get(key) ?? null : null;
}

const bracketRoundShort: Record<string, string> = { r16: "R16", qf: "QF", sf: "SF", f: "Finals" };

function buildBracketSlotNode(slotMatches: Match[], seedMap: Map<string, number>, label: string, id: string): BracketNode {
  const ordered = [...slotMatches].sort((a, b) => (a.instance ?? 0) - (b.instance ?? 0) || a.matchnum - b.matchnum);
  const sample = ordered[ordered.length - 1];
  const redTeams = sample.alliances.find((alliance) => alliance.color === "red")?.teams.map((entry) => entry.team) ?? [];
  const blueTeams = sample.alliances.find((alliance) => alliance.color === "blue")?.teams.map((entry) => entry.team) ?? [];

  if (ordered.length === 1) {
    const { winner, redScore, blueScore } = matchWinner(sample);
    return {
      id,
      label,
      red: { seed: seedForTeams(seedMap, redTeams), teams: redTeams, score: redScore ?? null, winner: winner === "Red" },
      blue: { seed: seedForTeams(seedMap, blueTeams), teams: blueTeams, score: blueScore ?? null, winner: winner === "Blue" },
    };
  }

  let redWins = 0;
  let blueWins = 0;
  ordered.forEach((match) => {
    const { winner } = matchWinner(match);
    if (winner === "Red") redWins += 1;
    else if (winner === "Blue") blueWins += 1;
  });
  return {
    id,
    label,
    red: { seed: seedForTeams(seedMap, redTeams), teams: redTeams, score: redWins, winner: redWins > blueWins },
    blue: { seed: seedForTeams(seedMap, blueTeams), teams: blueTeams, score: blueWins, winner: blueWins > redWins },
  };
}

function buildBracketRounds(matches: Match[]): BracketRound[] {
  const seedMap = buildBracketSeedMap(matches);
  const rounds: BracketRound[] = [];

  (["r16", "qf", "sf", "f"] as const).forEach((key) => {
    const roundMatches = matches.filter((match) => playoffRoundKey(match) === key);
    if (!roundMatches.length) return;

    const byInstance = new Map<number, Match[]>();
    roundMatches.forEach((match) => {
      const instance = match.instance ?? 1;
      byInstance.set(instance, [...(byInstance.get(instance) ?? []), match]);
    });

    const nodes = [...byInstance.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([instance, slotMatches]) =>
        buildBracketSlotNode(
          slotMatches,
          seedMap,
          key === "f" ? (slotMatches.length > 1 ? `Finals (Bo${slotMatches.length})` : "Finals") : `${bracketRoundShort[key]} #${instance}`,
          `${key}-${instance}`,
        ),
      );

    rounds.push({ key, nodes });
  });

  return rounds;
}

function BracketSlotRow({ slot, color }: { slot: BracketSlot; color: "red" | "blue" }) {
  return (
    <div className={`bracket-slot bracket-slot-${color} ${slot.winner ? "bracket-slot-winner" : ""}`}>
      <span className="bracket-seed">{slot.seed ?? ""}</span>
      <span className="bracket-teams">
        {slot.teams.length ? (
          slot.teams.map((team) => <TeamMiniLink key={team.id} team={team} />)
        ) : (
          <span className="bracket-tbd">—</span>
        )}
      </span>
      <span className="bracket-score">{slot.score ?? ""}</span>
    </div>
  );
}

function BracketConnectors({ count }: { count: number }) {
  return (
    <div className="bracket-connector">
      {Array.from({ length: count }).map((_, index) => (
        <div className="bracket-connector-cell" key={index}>
          <span className="conn-top" />
          <span className="conn-bottom" />
          <span className="conn-vert" />
          <span className="conn-out" />
        </div>
      ))}
    </div>
  );
}

function EliminationBracket({ matches }: { matches: Match[] }) {
  const rounds = useMemo(() => buildBracketRounds(matches), [matches]);
  if (!rounds.length) return <Empty>No elimination matches returned.</Empty>;

  return (
    <div className="bracket">
      {rounds.map((round, roundIndex) => (
        <Fragment key={round.key}>
          <div className="bracket-round">
            {round.nodes.map((node) => (
              <div className="bracket-match" key={node.id}>
                <div className="bracket-box">
                  <div className="bracket-box-label">{node.label}</div>
                  <div className="bracket-box-slots">
                    <BracketSlotRow slot={node.red} color="red" />
                    <BracketSlotRow slot={node.blue} color="blue" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {roundIndex < rounds.length - 1 && <BracketConnectors count={Math.ceil(round.nodes.length / 2)} />}
        </Fragment>
      ))}
    </div>
  );
}

function EliminationBracketOverlay({ matches, onClose }: { matches: Match[]; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showCloseButton={false} className="w-fit max-w-none sm:max-w-none border-0 bg-transparent p-0 shadow-none">
        <DialogTitle className="sr-only">Elimination bracket</DialogTitle>
        <div className="bracket-modal">
          <div className="bracket-modal-header">
            <strong>Elimination Bracket</strong>
            <CloseButton onClose={onClose} />
          </div>
          <div className="bracket-modal-body">
            <EliminationBracket matches={matches} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AllianceSelectionTable({ alliances, iq = false }: { alliances: Array<[number, string[]]>; iq?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const programCode = useContext(ProgramContext);
  if (!alliances.length) return <Empty>{iq ? "No finals alliances returned." : "No alliance selections returned."}</Empty>;

  const collapsible = alliances.length > 2;
  const showFade = collapsible && !expanded;
  const visibleAlliances = showFade ? alliances.slice(0, 3) : alliances;

  return (
    <div className={`alliance-collapse ${showFade ? "is-collapsed" : ""}`}>
      <table className="alliance-selection-table">
        <thead>
          <tr>
            <th>Seed</th>
            <th>{iq ? "Team" : "Captain"}</th>
            <th>{iq ? "Team" : "Pick 1"}</th>
          </tr>
        </thead>
        <tbody>
          {visibleAlliances.map(([seed, teams], rowIndex) => (
            <tr
              key={`${seed}-${teams.join("-")}`}
              className={showFade && rowIndex === 2 ? "alliance-row-fade" : ""}
            >
              <td>Seed {seed}</td>
              {Array.from({ length: 2 }).map((_, teamIndex) => {
                const num = teams[teamIndex];
                return (
                  <td key={teamIndex}>
                    {num ? (
                      <TeamQuickLink teamNumber={num} programCode={programCode} className="alliance-team-link" />
                    ) : (
                      ""
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {showFade && (
        <button className="alliance-show-all" onClick={() => setExpanded(true)}>
          Show all seeds
          <ChevronDown size={15} />
        </button>
      )}
      {collapsible && expanded && (
        <button className="alliance-show-all alliance-show-less" onClick={() => setExpanded(false)} aria-label="Show fewer seeds">
          <ChevronUp size={18} />
        </button>
      )}
    </div>
  );
}

function DroppedScores({ dropped }: { dropped: Array<{ matchnum: number; score: number }> }) {
  if (!dropped.length) return <span className="muted">-</span>;
  return (
    <span className="dropped-scores">
      {dropped.map((entry, index) => (
        <span key={entry.matchnum} className="dropped-score-item">
          Q{entry.matchnum} ({entry.score}){index < dropped.length - 1 ? "," : ""}
        </span>
      ))}
    </span>
  );
}

type SortState = { key: string; dir: "asc" | "desc" };

/** Clickable, sort-toggling table header cell with an asc/desc caret. */
function SortableTh({ col, label, sort, onSort, title, className }: { col: string; label: ReactNode; sort: SortState; onSort: (key: string) => void; title?: string; className?: string }) {
  const active = sort.key === col;
  return (
    <th
      className={`sortable-th${active ? " sorted" : ""}${className ? ` ${className}` : ""}`}
      title={title}
      onClick={() => onSort(col)}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      {label}
      <span className="sort-caret">{active && (sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</span>
    </th>
  );
}

// Scrolls an internally-scrollable card so the focus team's row lands centered,
// WITHOUT nudging the page. Uses rect math (works regardless of positioning) and
// only moves the container's own scrollTop. Re-centers when `key` changes (team
// switch or data arriving late).
function useCenterFocusRow(key: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    // The tab animates in, so the card isn't laid out (or scrollable) on the first
    // frame. Retry until it has real height and overflows, then center — a shared
    // entrance transform cancels out since we diff the row against the container.
    const attempt = () => {
      const c = containerRef.current;
      const r = rowRef.current;
      if (!c || !r) return;
      if (c.clientHeight === 0 || c.scrollHeight <= c.clientHeight) {
        if (tries++ < 30) raf = requestAnimationFrame(attempt);
        return;
      }
      const cRect = c.getBoundingClientRect();
      const rRect = r.getBoundingClientRect();
      const delta = rRect.top - cRect.top - (c.clientHeight / 2 - r.clientHeight / 2);
      c.scrollTop += delta;
    };
    raf = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(raf);
  }, [key]);
  return { containerRef, rowRef };
}

// Group raw skill runs into one row per team (best driver + best programming run,
// combined total, best rank). Shared by the full Skills tab and the compact team
// card so both read identically.
function aggregateSkillRows(skills: Skill[]) {
  return Object.values(
    skills.reduce<Record<string, { rank: number | null; team: Skill["team"]; entries: Skill[] }>>((groups, skill) => {
      const key = String(skill.team.id ?? skill.team.name);
      const existing = groups[key];
      if (!existing) {
        groups[key] = { rank: skill.rank ?? null, team: skill.team, entries: [skill] };
        return groups;
      }
      existing.rank =
        existing.rank === null
          ? skill.rank ?? null
          : skill.rank === null || skill.rank === undefined
            ? existing.rank
            : Math.min(existing.rank, skill.rank);
      const sameTypeIndex = existing.entries.findIndex((entry) => entry.type.toLowerCase() === skill.type.toLowerCase());
      if (sameTypeIndex >= 0) {
        const previous = existing.entries[sameTypeIndex];
        existing.entries[sameTypeIndex] = (skill.score ?? -1) > (previous.score ?? -1) ? skill : previous;
      } else {
        existing.entries.push(skill);
      }
      return groups;
    }, {}),
  ).sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.team.name.localeCompare(b.team.name));
}

// A skills score with its attempt count trailing in grey, e.g. `45 3×`.
function TmSkillCell({ entry }: { entry?: Skill }) {
  if (!entry || entry.score === null || entry.score === undefined) return <span className="tm-dash">–</span>;
  return (
    <span>
      {entry.score}
      {entry.attempts ? <span className="tm-attempts">{entry.attempts}×</span> : null}
    </span>
  );
}

// "See all …" link shown top-right of a card header; jumps to the full tab.
function TmSeeAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="tm-seeall" onClick={onClick}>
      See all {label}
      <ChevronRight size={13} />
    </button>
  );
}

// Team-number link stacked over its (muted, truncated) descriptive name, for the
// rank/skills card team column.
function TmTeamCell({ id, number, name, programCode }: { id: number; number: string; name?: string; programCode?: string }) {
  return (
    <div className="tm-team">
      <CompareTeamLink teamId={id} teamNumber={number} teamName={name} programCode={programCode} className="tm-team-num" />
      {name ? <span className="tm-team-name">{name}</span> : null}
    </div>
  );
}

type ScorePoint = { matchId: number; label: string; mine: number; opp: number | null; outcome: string | null };

// Area chart of the focus team's score across their matches (in play order), with
// the opponent score as a dashed reference line for non-IQ events. Hovering shows
// the scores; Enter (or a click) jumps to that match on the Results tab.
function TeamScoreChart({ points, isIq, onJump }: { points: ScorePoint[]; isIq: boolean; onJump?: (matchId: number) => void }) {
  const gid = `tm-score-${useId().replace(/:/g, "")}`;
  const config: ChartConfig = {
    mine: { label: "Their score", color: "var(--accent)" },
    opp: { label: "Opponent", color: "var(--text-muted)" },
  };
  const data = points.map((p, i) => ({ i, ...p }));
  // Track the hovered point so Enter — or a click — can open that match in Results.
  const activeIndexRef = useRef<number | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const onJumpRef = useRef(onJump);
  onJumpRef.current = onJump;
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const idx = activeIndexRef.current;
      if (idx == null) return;
      const id = dataRef.current[idx]?.matchId;
      if (id != null) onJumpRef.current?.(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const jump = (index: number | string | undefined) => {
    if (index == null) return;
    const i = typeof index === "number" ? index : Number(index);
    const id = dataRef.current[i]?.matchId;
    if (id != null) onJumpRef.current?.(id);
  };
  return (
    <ChartContainer config={config} className="w-full" style={{ height: 168, aspectRatio: "auto" }}>
      <AreaChart
        accessibilityLayer
        data={data}
        margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
        onClick={(state) => jump(state?.activeTooltipIndex ?? undefined)}
        onMouseMove={(state) => {
          const i = state?.activeTooltipIndex;
          activeIndexRef.current = typeof i === "number" ? i : i != null ? Number(i) : null;
        }}
        onMouseLeave={() => {
          activeIndexRef.current = null;
        }}
        className="[&_.recharts-surface]:cursor-pointer"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-mine)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-mine)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--text-faint)" }} interval="preserveStartEnd" minTickGap={18} />
        <YAxis width={28} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--text-faint)" }} />
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={(props) => {
            const { active, payload } = props as unknown as {
              active?: boolean;
              payload?: ReadonlyArray<{ payload?: ScorePoint }>;
            };
            const row = active && payload?.length ? payload[0]?.payload : null;
            if (!row) return null;
            return (
              <div className="tm-tip">
                <div className="tm-tip-head">{row.label}{row.outcome ? ` · ${row.outcome === "W" ? "Win" : "Loss"}` : ""}</div>
                <div className="tm-tip-row"><span className="tm-tip-dot tm-legend-mine" />Their score<span className="tm-tip-val">{row.mine}</span></div>
                {!isIq && row.opp != null && (
                  <div className="tm-tip-row"><span className="tm-tip-dot tm-legend-opp" />Opponent<span className="tm-tip-val">{row.opp}</span></div>
                )}
                <div className="tm-tip-hint">Enter → open in Results</div>
              </div>
            );
          }}
        />
        {!isIq && <Area dataKey="opp" type="monotone" stroke="var(--color-opp)" strokeWidth={1.25} strokeDasharray="4 3" fill="none" isAnimationActive={false} dot={false} />}
        <Area dataKey="mine" type="monotone" stroke="var(--color-mine)" strokeWidth={2} fill={`url(#${gid})`} isAnimationActive={false} dot={{ r: 2 }} />
      </AreaChart>
    </ChartContainer>
  );
}

// Fills the space under the matches: how the team's score moved match to match.
function TeamScoreTrendCard({ matches, focusTeamId, isIq, onJumpToMatch }: { matches: Match[]; focusTeamId: number; isIq: boolean; onJumpToMatch?: (matchId: number) => void }) {
  const points = useMemo(
    () =>
      [...matches]
        .sort((a, b) => matchRoundOrder(a) - matchRoundOrder(b) || (a.instance ?? 0) - (b.instance ?? 0) || a.matchnum - b.matchnum)
        .map((m) => {
          const mine = m.alliances.find((al) => isTeamInAlliance(al, focusTeamId));
          const opp = m.alliances.find((al) => al !== mine);
          return {
            matchId: m.id,
            label: shortMatchName(m.name),
            mine: mine?.score ?? null,
            opp: isIq ? null : opp?.score ?? null,
            outcome: teamMatchOutcome(m, focusTeamId),
          };
        })
        .filter((p): p is ScorePoint => p.mine !== null),
    [matches, focusTeamId, isIq],
  );
  if (points.length < 2) return null;
  return (
    <Panel title="Score by match" icon={<TrendingUp />}>
      <div className="tm-trend">
        <div className="tm-legend">
          <span className="tm-legend-item"><i className="tm-legend-swatch tm-legend-mine" /> Their score</span>
          {!isIq && <span className="tm-legend-item"><i className="tm-legend-swatch tm-legend-opp" /> Opponent</span>}
        </div>
        <TeamScoreChart points={points} isIq={isIq} onJump={onJumpToMatch} />
      </div>
    </Panel>
  );
}

// Two-column team-matches view: the team's matches (+ score trend) on the left, a
// stack of rank / skills / best-result cards on the right. The right column is
// height-matched to the left: rank + skills flex to fill, best result stays fixed.
function TeamMatchesTab({
  matches,
  rankings,
  skills,
  teams,
  focusTeam,
  isIq,
  scoreTier,
  multiDivision,
  onJumpToMatch,
  onOpenTab,
  presetSupported,
  presetLoading,
  presetUrl,
  timestampMap,
  onOpenMatch,
}: {
  matches: Match[];
  rankings: Ranking[];
  skills: Skill[];
  teams: Team[];
  focusTeam: { id: number; number: string };
  isIq: boolean;
  scoreTier?: (score: number | null | undefined) => ScoreTier;
  multiDivision: boolean;
  onJumpToMatch?: (matchId: number) => void;
  onOpenTab?: (tab: EventDetailTab) => void;
  presetSupported?: boolean;
  presetLoading?: boolean;
  presetUrl?: string | null;
  timestampMap?: Map<number, MatchTimestamp>;
  onOpenMatch?: (match: Match, timestamp: MatchTimestamp) => void;
}) {
  const teamNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of teams) if (t.team_name) map.set(t.id, t.team_name);
    return map;
  }, [teams]);
  return (
    <div className="team-matches-layout">
      <div className="tm-col tm-col-matches">
        <Panel title={`${focusTeam.number}'s Matches`} icon={<Gamepad2 />}>
          <DragScroll className="results-table-scroll">
            <TeamMatchTable
              matches={matches}
              focusTeamId={focusTeam.id}
              isIq={isIq}
              scoreTier={scoreTier}
              multiDivision={multiDivision}
              showPlay
              presetSupported={presetSupported}
              presetLoading={presetLoading}
              presetUrl={presetUrl}
              timestampMap={timestampMap}
              onOpenMatch={onOpenMatch}
            />
          </DragScroll>
        </Panel>
        <TeamScoreTrendCard matches={matches} focusTeamId={focusTeam.id} isIq={isIq} onJumpToMatch={onJumpToMatch} />
      </div>
      <div className="tm-col tm-col-cards">
        <div className="tm-card-fill">
          <TeamRankCard rankings={rankings} focusTeamId={focusTeam.id} isIq={isIq} teamNames={teamNames} onSeeAll={onOpenTab ? () => onOpenTab("rankings") : undefined} />
        </div>
        <div className="tm-card-fill">
          <TeamSkillsCard skills={skills} focusTeamId={focusTeam.id} teamNames={teamNames} onSeeAll={onOpenTab ? () => onOpenTab("skills") : undefined} />
        </div>
        <TeamBestResultCard matches={matches} focusTeamId={focusTeam.id} isIq={isIq} />
      </div>
    </div>
  );
}

// Full event ranking, scrollable, auto-centered + highlighted on the focus team.
// V5RC/VURC show record + WP/AP/SP; IQ (no win/loss) shows Avg/High instead.
function TeamRankCard({ rankings, focusTeamId, isIq, teamNames, onSeeAll }: { rankings: Ranking[]; focusTeamId: number; isIq: boolean; teamNames: Map<number, string>; onSeeAll?: () => void }) {
  const programCode = useContext(ProgramContext);
  const rows = useMemo(() => [...rankings].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)), [rankings]);
  const { containerRef, rowRef } = useCenterFocusRow(`${focusTeamId}:${rows.length}`);
  const cols = isIq ? 4 : 6;
  return (
    <Panel title="Rankings" icon={<BarChart3 />} action={onSeeAll ? <TmSeeAll label="rankings" onClick={onSeeAll} /> : undefined}>
      <div className="tm-scroll" ref={containerRef}>
        <table className="tm-card-table">
          <thead>
            <tr>
              <th className="tm-th-num">#</th>
              <th className="tm-th-team">Team</th>
              {isIq ? (
                <>
                  <th className="tm-th-stat">Avg</th>
                  <th className="tm-th-stat">High</th>
                </>
              ) : (
                <>
                  <th className="tm-th-stat">Record</th>
                  <th className="tm-th-stat" title="Win Points">WP</th>
                  <th className="tm-th-stat" title="Autonomous Points">AP</th>
                  <th className="tm-th-stat" title="Strength-of-Schedule Points">SP</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const focus = r.team.id === focusTeamId;
              return (
                <tr key={r.id} ref={focus ? rowRef : undefined} className={focus ? "tm-row-focus" : undefined}>
                  <td className="tm-rank-num">{r.rank ?? "–"}</td>
                  <td className="tm-team-cell">
                    <TmTeamCell id={r.team.id} number={r.team.name} name={teamNames.get(r.team.id)} programCode={programCode} />
                  </td>
                  {isIq ? (
                    <>
                      <td className="tm-stat">{formatNumber(r.average_points)}</td>
                      <td className="tm-stat">{r.high_score ?? "–"}</td>
                    </>
                  ) : (
                    <>
                      <td className="tm-stat tm-record">{r.wins ?? 0}–{r.losses ?? 0}–{r.ties ?? 0}</td>
                      <td className="tm-stat">{r.wp ?? "–"}</td>
                      <td className="tm-stat">{r.ap ?? "–"}</td>
                      <td className="tm-stat">{r.sp ?? "–"}</td>
                    </>
                  )}
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={cols}>
                  <Empty>No rankings yet.</Empty>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// Full event skills ranking, scrollable, auto-centered + highlighted on the team.
function TeamSkillsCard({ skills, focusTeamId, teamNames, onSeeAll }: { skills: Skill[]; focusTeamId: number; teamNames: Map<number, string>; onSeeAll?: () => void }) {
  const programCode = useContext(ProgramContext);
  const rows = useMemo(() => aggregateSkillRows(skills), [skills]);
  const { containerRef, rowRef } = useCenterFocusRow(`${focusTeamId}:${rows.length}`);
  return (
    <Panel title="Skills" icon={<Activity />} action={onSeeAll ? <TmSeeAll label="skills" onClick={onSeeAll} /> : undefined}>
      <div className="tm-scroll" ref={containerRef}>
        <table className="tm-card-table">
          <thead>
            <tr>
              <th className="tm-th-num">#</th>
              <th className="tm-th-team">Team</th>
              <th className="tm-th-stat">Combined</th>
              <th className="tm-th-stat">Driver</th>
              <th className="tm-th-stat">Prog</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { driver, programming } = bestSkillEntries(row.entries);
              const total = row.entries.reduce((sum, entry) => sum + (entry.score ?? 0), 0);
              const focus = row.team.id === focusTeamId;
              return (
                <tr key={row.team.id} ref={focus ? rowRef : undefined} className={focus ? "tm-row-focus" : undefined}>
                  <td className="tm-rank-num">{row.rank ?? "–"}</td>
                  <td className="tm-team-cell">
                    <TmTeamCell id={row.team.id} number={row.team.name} name={teamNames.get(row.team.id)} programCode={programCode} />
                  </td>
                  <td className="tm-stat tm-skill-combined">{total || "–"}</td>
                  <td className="tm-stat"><TmSkillCell entry={driver} /></td>
                  <td className="tm-stat"><TmSkillCell entry={programming} /></td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={5}>
                  <Empty>No skills yet.</Empty>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// Highest elimination round the focus team reached at this event (e.g. "R16 #3-1"),
// or "No elims" / "No finals" when they didn't advance to a bracket.
function TeamBestResultCard({ matches, focusTeamId, isIq }: { matches: Match[]; focusTeamId: number; isIq: boolean }) {
  const best = useMemo(() => {
    const elim = matches.filter((m) => playoffImportance(m) > 0 || (isIq && isIqFinalsMatch(m)));
    if (!elim.length) return null;
    return [...elim].sort(
      (a, b) => matchRoundOrder(b) - matchRoundOrder(a) || (b.instance ?? 0) - (a.instance ?? 0) || b.matchnum - a.matchnum,
    )[0];
  }, [matches, isIq]);

  const isFinals = best ? isIq && isIqFinalsMatch(best) : false;
  const roundKey = best ? (isFinals ? "f" : playoffRoundKey(best)) : null;
  const outcome = best ? teamMatchOutcome(best, focusTeamId) : null;

  return (
    <Panel title="Best result" icon={<Trophy />}>
      <div className="tm-best">
        {best ? (
          <>
            <div className="tm-best-round">{playoffRoundLabel(roundKey!)}</div>
            <div className="tm-best-match">
              <span className="tm-best-name">{shortMatchName(isFinals ? "Finals" : best.name)}</span>
              {outcome && <span className={`team-result-badge result-${outcome.toLowerCase()}`}>{outcome}</span>}
            </div>
          </>
        ) : (
          <div className="tm-best-none">{isIq ? "No finals" : "No elims"}</div>
        )}
      </div>
    </Panel>
  );
}

function RankingsTable({ rankings, isIq = false, matches = [], allMatches, sharedTeamId, eventId }: { rankings: Ranking[]; isIq?: boolean; matches?: Match[]; allMatches?: Match[]; sharedTeamId?: string; eventId?: string }) {
  const programCode = useContext(ProgramContext);
  const showPicklist = !!(sharedTeamId && eventId);
  // Rank ascending is the natural default; clicking a column sorts by it
  // (numeric cols default to descending = best first), re-clicking flips.
  const [sort, setSort] = useState<SortState>({ key: "rank", dir: "asc" });
  const onSort = (key: string) =>
    setSort((p) => (p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "rank" || key === "team" ? "asc" : "desc" }));

  // Per-event OPR/DPR/CCWM from this event's qual matches. CCWM/DPR are only
  // meaningful where alliances oppose each other (V5RC/VURC), not IQ teamwork.
  // Use the unfiltered match set so a team-search filter doesn't skew the solve.
  const oprMatches = allMatches ?? matches;
  const oprMap = useMemo(() => computeEventOpr(oprMatches), [oprMatches]);
  // IQ avg/high/low come from per-team qual matches — compute once for sort + render.
  const iqStatsByRow = useMemo(() => {
    const m = new Map<number, ReturnType<typeof iqTeamQualStats>>();
    if (isIq) for (const r of rankings) m.set(r.team.id, iqTeamQualStats(matches, r.team.id, r));
    return m;
  }, [isIq, rankings, matches]);
  const fmtRating = (v: number | undefined) => (v === undefined ? "-" : formatNumber(v));

  const sortValue = (row: Ranking): number | string => {
    const o = oprMap.get(row.team.id);
    const iq = iqStatsByRow.get(row.team.id);
    switch (sort.key) {
      case "team": return row.team.name;
      case "record": return row.wins ?? -Infinity;
      case "wp": return row.wp ?? -Infinity;
      case "ap": return row.ap ?? -Infinity;
      case "awp": return rankingAwp(row);
      case "sp": return row.sp ?? -Infinity;
      case "high": return isIq ? (iq?.high ?? -Infinity) : (row.high_score ?? -Infinity);
      case "avg": return isIq ? (iq?.avg ?? -Infinity) : (row.average_points ?? -Infinity);
      case "low": return iq?.low ?? -Infinity;
      case "opr": return o?.opr ?? -Infinity;
      case "dpr": return o?.dpr ?? -Infinity;
      case "ccwm": return o?.ccwm ?? -Infinity;
      default: return row.rank;
    }
  };
  const dir = sort.dir === "asc" ? 1 : -1;
  const displayRows = [...rankings].sort((a, b) => {
    const va = sortValue(a), vb = sortValue(b);
    if (typeof va === "string" || typeof vb === "string") return dir * String(va).localeCompare(String(vb), undefined, { numeric: true });
    return dir * ((va as number) - (vb as number));
  });

  function exportRankings() {
    const headers = isIq
      ? ["Rank", "Team #", "Avg", "High", "Low", "OPR"]
      : ["Rank", "Team #", "W", "L", "T", "WP", "AP", "SP", "AWP", "High", "Avg", "OPR", "DPR", "CCWM"];
    const rows = displayRows.map((row) => {
      const o = oprMap.get(row.team.id);
      const opr = o ? Number(o.opr.toFixed(1)) : "";
      if (isIq) {
        const stats = iqStatsByRow.get(row.team.id);
        return [row.rank, row.team.name, stats?.avg ?? "", stats?.high ?? "", stats?.low ?? "", opr];
      }
      return [
        row.rank, row.team.name,
        row.wins ?? 0, row.losses ?? 0, row.ties ?? 0,
        row.wp ?? "", row.ap ?? "", row.sp ?? "", rankingAwp(row), row.high_score ?? "", row.average_points ?? "",
        opr, o ? Number(o.dpr.toFixed(1)) : "", o ? Number(o.ccwm.toFixed(1)) : "",
      ];
    });
    downloadCsvFile(`rankings-${eventId ?? "event"}.csv`, toCsv(headers, rows));
  }

  const exportBtn = displayRows.length ? (
    <ExportButton onExport={exportRankings} title="Download rankings (with OPR) as CSV" />
  ) : undefined;

  if (isIq) {
    return (
      <Panel title="Rankings" icon={<BarChart3 />} action={exportBtn}>
        <table>
          <thead>
            <tr>
              <SortableTh col="rank" label="Rank" sort={sort} onSort={onSort} />
              <SortableTh col="team" label="Team" sort={sort} onSort={onSort} />
              <SortableTh col="avg" label="Avg" sort={sort} onSort={onSort} />
              <SortableTh col="high" label="High" sort={sort} onSort={onSort} />
              <SortableTh col="low" label="Low" sort={sort} onSort={onSort} />
              <SortableTh col="opr" label="OPR" sort={sort} onSort={onSort} title="Offensive Power Rating (this event)" />
              <th>Dropped scores</th>
              <th className="compare-col">Compare</th>
              {showPicklist && <th className="picklist-col">Picklist</th>}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              const stats = iqStatsByRow.get(row.team.id);
              return (
                <tr key={row.id}>
                  <td>{row.rank}</td>
                  <td className="team-cell">
                    <CompareTeamLink teamId={row.team.id} teamNumber={row.team.name} programCode={programCode} />
                  </td>
                  <td>{formatNumber(stats?.avg)}</td>
                  <td>{stats?.high ?? "-"}</td>
                  <td>{stats?.low ?? "-"}</td>
                  <td>{fmtRating(oprMap.get(row.team.id)?.opr)}</td>
                  <td>
                    <DroppedScores dropped={stats?.dropped ?? []} />
                  </td>
                  <td className="compare-col">
                    <CompareRowBtn teamId={row.team.id} teamNumber={row.team.name} programCode={programCode ?? ""} />
                  </td>
                  {showPicklist && (
                    <td className="picklist-col" onClick={(e) => e.stopPropagation()}>
                      <PicklistRowBtn sharedTeamId={sharedTeamId} eventId={eventId} teamId={String(row.team.id)} teamNumber={row.team.name} />
                    </td>
                  )}
                </tr>
              );
            })}
            {!displayRows.length && (
              <tr>
                <td colSpan={showPicklist ? 9 : 8}>
                  <Empty>No rankings returned.</Empty>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    );
  }

  return (
    <Panel title="Rankings" icon={<BarChart3 />} action={exportBtn}>
      <table>
        <thead>
          <tr>
            <SortableTh col="rank" label="Rank" sort={sort} onSort={onSort} />
            <SortableTh col="team" label="Team" sort={sort} onSort={onSort} />
            <SortableTh col="record" label="Record" sort={sort} onSort={onSort} title="Sort by wins" />
            <SortableTh col="wp" label="WP" sort={sort} onSort={onSort} />
            <SortableTh col="ap" label="AP" sort={sort} onSort={onSort} />
            <SortableTh col="sp" label="SP" sort={sort} onSort={onSort} />
            <SortableTh col="awp" label="AWP" sort={sort} onSort={onSort} title="Autonomous Win Points" />
            <SortableTh col="high" label="High" sort={sort} onSort={onSort} className="col-muted" />
            <SortableTh col="avg" label="Avg" sort={sort} onSort={onSort} className="col-muted" />
            <SortableTh col="opr" label="OPR" sort={sort} onSort={onSort} title="Offensive Power Rating (this event)" className="col-muted" />
            <SortableTh col="dpr" label="DPR" sort={sort} onSort={onSort} title="Defensive Power Rating (this event)" className="col-muted" />
            <SortableTh col="ccwm" label="CCWM" sort={sort} onSort={onSort} title="Calculated Contribution to Winning Margin (OPR − DPR)" />
            <th className="compare-col">Compare</th>
            {showPicklist && <th className="picklist-col">Picklist</th>}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row) => {
            const o = oprMap.get(row.team.id);
            return (
            <tr key={row.id}>
              <td>{row.rank}</td>
              <td className="team-cell">
                <CompareTeamLink teamId={row.team.id} teamNumber={row.team.name} programCode={programCode} />
              </td>
              <td>
                {row.wins ?? 0}-{row.losses ?? 0}-{row.ties ?? 0}
              </td>
              <td>{row.wp ?? "-"}</td>
              <td>{row.ap ?? "-"}</td>
              <td>{row.sp ?? "-"}</td>
              <td>{rankingAwp(row)}</td>
              <td className="col-muted">{row.high_score ?? "-"}</td>
              <td className="col-muted">{formatNumber(row.average_points)}</td>
              <td className="col-muted">{fmtRating(o?.opr)}</td>
              <td className="col-muted">{fmtRating(o?.dpr)}</td>
              <td>{fmtRating(o?.ccwm)}</td>
              <td className="compare-col">
                <CompareRowBtn teamId={row.team.id} teamNumber={row.team.name} programCode={programCode ?? ""} />
              </td>
              {showPicklist && (
                <td className="picklist-col" onClick={(e) => e.stopPropagation()}>
                  <PicklistRowBtn sharedTeamId={sharedTeamId} eventId={eventId} teamId={String(row.team.id)} teamNumber={row.team.name} />
                </td>
              )}
            </tr>
            );
          })}
          {!displayRows.length && (
            <tr>
              <td colSpan={showPicklist ? 14 : 13}>
                <Empty>No rankings returned.</Empty>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}

function SkillsTable({ skills, focusTeamId }: { skills: Skill[]; focusTeamId?: number }) {
  const programCode = useContext(ProgramContext);
  const focusRowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (focusRowRef.current) focusRowRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusTeamId, skills]);
  const rows = aggregateSkillRows(skills);

  return (
    <Panel title="Skills" icon={<Activity />}>
      <table className="skills-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Team</th>
            <th>Total</th>
            <th>Driver</th>
            <th>Programming</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const entries = [...row.entries].sort((a, b) => a.type.localeCompare(b.type));
            const { driver, programming } = bestSkillEntries(entries);
            const total = entries.reduce((sum, entry) => sum + (entry.score ?? 0), 0);

            return (
              <tr
                key={row.team.id}
                ref={focusTeamId != null && row.team.id === focusTeamId ? focusRowRef : undefined}
                className={focusTeamId != null && row.team.id === focusTeamId ? "skills-row-focus" : undefined}
              >
                <td>{row.rank ?? "-"}</td>
                <td>
                  <CompareTeamLink teamId={row.team.id} teamNumber={row.team.name} programCode={programCode} />
                </td>
                <td>{total || "-"}</td>
                <td>
                  <SkillScoreAttempt label="Driver" entry={driver} />
                </td>
                <td>
                  <SkillScoreAttempt label="Programming" entry={programming} />
                </td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={5}>
                <Empty>No skills scores returned.</Empty>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}

function AwardsList({ awards }: { awards: Award[] }) {
  const sortedAwards = sortAwards(awards);
  const programCode = useContext(ProgramContext);

  const hasQuals = sortedAwards.some((award) => awardEventQuals(award).length > 0);

  return (
    <Panel title="Awards" icon={<Medal />} action={hasQuals ? <span className="award-qual-heading">Qualifies for…</span> : undefined}>
      <div className="award-list">
        {sortedAwards.map((award) => {
          const quals = awardEventQuals(award);
          return (
            <article className="award-item" key={award.id}>
              <div className="award-item-main">
                <h3>{award.title}</h3>
                <div className="winner-row">
                  {awardTeamWinners(award).map((winner) => (
                    <TeamQuickLink key={`${award.id}-${winner.team.id}`} teamId={winner.team.id} teamNumber={winner.team.name} programCode={programCode} className="winner-pill">
                      {winner.team.name}
                    </TeamQuickLink>
                  ))}
                  {awardIndividualWinners(award).map((winner) => (
                    <span key={winner} className="winner-pill">
                      {winner}
                    </span>
                  ))}
                </div>
              </div>
              {quals.length > 0 && (
                <div className="award-item-qual">
                  {quals.map((q) => (
                    <span key={q.label} className={`award-qual-badge ${q.cls}`} title={`Qualifies for ${q.label}`}>
                      {q.label}
                    </span>
                  ))}
                </div>
              )}
            </article>
          );
        })}
        {!sortedAwards.length && <Empty>No awards returned.</Empty>}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// World Skills page — helpers
// ---------------------------------------------------------------------------

const WS_PREFS_KEY = "ws-prefs-v2";
// Boards used to be cached here, a few MB at a time, until IndexedDB took over
// (src/world-skills-cache.ts). Clear the old keys once so returning visitors get
// that localStorage budget back.
const WS_LEGACY_CACHE_PREFIX = "ws-cache:";
(function dropLegacyWsCache() {
  try {
    const stale = Object.keys(localStorage).filter((key) => key.startsWith(WS_LEGACY_CACHE_PREFIX));
    stale.forEach((key) => localStorage.removeItem(key));
  } catch {
    // storage unavailable — nothing to reclaim
  }
})();

type WsPrefs = { program?: string; grade?: string; seasonByProgram?: Record<string, number>; gradeByProgram?: Record<string, string> };

function loadWsPrefs(): WsPrefs {
  try { return JSON.parse(localStorage.getItem(WS_PREFS_KEY) ?? "{}"); } catch { return {}; }
}
function saveWsPrefs(prefs: WsPrefs) {
  try { localStorage.setItem(WS_PREFS_KEY, JSON.stringify(prefs)); } catch {}
}
function wsGradeToParam(g: string) {
  if (g === "High School") return "hs";
  if (g === "Middle School") return "ms";
  return "es";
}
function wsGradeFromParam(p: string | null): string | null {
  if (p === "hs") return "High School";
  if (p === "ms") return "Middle School";
  if (p === "es") return "Elementary";
  return null;
}

const WS_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;
function formatSkillsDate(raw: string | null | undefined, useUtc: boolean): string {
  if (!raw) return "—";
  const d = new Date(raw.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return raw;
  const month = useUtc ? d.getUTCMonth() : d.getMonth();
  const day   = useUtc ? d.getUTCDate()  : d.getDate();
  const year  = useUtc ? d.getUTCFullYear() : d.getFullYear();
  const h     = useUtc ? d.getUTCHours()   : d.getHours();
  const m     = useUtc ? d.getUTCMinutes() : d.getMinutes();
  return `${WS_MONTHS[month]} ${day} (${String(year).slice(2)}) ${h}:${String(m).padStart(2,"0")}`;
}
function renderSkillsDate(raw: string | null | undefined, useUtc: boolean) {
  if (!raw) return "—";
  const d = new Date(raw.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return raw;
  const month = useUtc ? d.getUTCMonth() : d.getMonth();
  const day   = useUtc ? d.getUTCDate()  : d.getDate();
  const year  = useUtc ? d.getUTCFullYear() : d.getFullYear();
  const h     = useUtc ? d.getUTCHours()   : d.getHours();
  const m     = useUtc ? d.getUTCMinutes() : d.getMinutes();
  return <>{WS_MONTHS[month]} {day} <span className="ws-date-year">({String(year).slice(2)})</span> {h}:{String(m).padStart(2,"0")}</>;
}

// ---------------------------------------------------------------------------
// World Skills page
// ---------------------------------------------------------------------------

function WorldSkillsPage() {
  const settingsEpoch = useSettingsEpoch();
  return <WorldSkillsPageInner key={settingsEpoch} />;
}

function WorldSkillsPageInner() {
  // ── Init from URL params (takes priority) then localStorage prefs ─────────
  const [program, setProgram] = useState<"v5rc" | "viqrc">(() => {
    const u = new URLSearchParams(window.location.search);
    const p = u.get("program");
    if (p === "v5rc" || p === "viqrc") return p;
    const prefs = loadWsPrefs();
    return prefs.program === "viqrc" ? "viqrc" : "v5rc";
  });
  const [gradeByProgram, setGradeByProgram] = useState<Record<string, string>>(() => {
    const prefs = loadWsPrefs();
    const base = prefs.gradeByProgram ?? (prefs.grade ? { [prefs.program ?? "v5rc"]: prefs.grade } : {});
    const u = new URLSearchParams(window.location.search);
    const prog = u.get("program") === "viqrc" ? "viqrc" : "v5rc";
    const g = wsGradeFromParam(u.get("grade"));
    return g ? { ...base, [prog]: g } : base;
  });
  const [seasonByProgram, setSeasonByProgram] = useState<Record<string, number>>(() => {
    const prefs = loadWsPrefs();
    const base = prefs.seasonByProgram ?? {};
    const u = new URLSearchParams(window.location.search);
    const prog = u.get("program") === "viqrc" ? "viqrc" : "v5rc";
    const s = parseInt(u.get("season") ?? "", 10);
    return !isNaN(s) ? { ...base, [prog]: s } : base;
  });
  const manualSeasonId: number | null = seasonByProgram[program] ?? null;
  function setManualSeasonId(id: number | null) {
    setSeasonByProgram((prev) => {
      const next = { ...prev };
      if (id === null) delete next[program]; else next[program] = id;
      return next;
    });
  }

  // `?team=` (set by the home sidebar's skills-leader tiles) points at one row:
  // the page pages to it, scrolls it into view, and flashes it, then forgets it.
  // Deliberately not written back to the URL by the sync effect below — the
  // highlight is a one-shot arrival cue, not shareable state.
  const [focusTeamId, setFocusTeamId] = useState<number | null>(() => {
    const raw = parseInt(new URLSearchParams(window.location.search).get("team") ?? "", 10);
    return Number.isFinite(raw) ? raw : null;
  });
  const focusRowRef = useRef<HTMLTableRowElement | null>(null);

  const [useUtc, setUseUtc] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const debouncedSearch = useDebouncedValue(search);
  // Phones get a shorter placeholder so it isn't clipped in the narrow field.
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(max-width: 560px)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 560px)");
    const onChange = () => setIsNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const [filterCountries, setFilterCountries] = useState<string[]>(() => new URLSearchParams(window.location.search).getAll("country"));
  const [filterRegions, setFilterRegions] = useState<string[]>(() => new URLSearchParams(window.location.search).getAll("region"));
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [wherePlaceOpen, setWherePlaceOpen] = useState(false);
  const [wpAuto, setWpAuto] = useState("");
  const [wpDriver, setWpDriver] = useState("");

  // Client-side sort — mirrors the Rankings tab's SortableTh/SortState pattern.
  // Default is official combined-rank ascending (the current order). Numeric
  // columns default to descending (best first); text/rank default to ascending.
  const [sort, setSort] = useState<SortState>({ key: "rank", dir: "asc" });
  const onSort = (key: string) =>
    setSort((p) => (p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "rank" || key === "team" || key === "teamName" || key === "organization" || key === "region" || key === "country" ? "asc" : "desc" }));

  // ── Seasons ───────────────────────────────────────────────────────────────
  const seasonsAsync = useAsync(() => api.robotEventsSeasons({ per_page: 250 }), []);
  const programId = program === "v5rc" ? 1 : 41;

  const seasonOptions = useMemo(
    () =>
      (seasonsAsync.data?.data ?? [])
        .filter(seasonHasData)
        .filter((s) => s.program?.id === programId)
        .sort((a, b) => b.id - a.id)
        .slice(0, 8)
        .map((s) => ({ id: s.id, label: shortSeasonName(s.name) })),
    [seasonsAsync.data, programId],
  );

  const resolvedSeasonId = manualSeasonId ?? seasonOptions[0]?.id ?? null;

  const gradeOptions = program === "v5rc" ? ["High School", "Middle School"] : ["Middle School", "Elementary"];
  // Derive grade for the current program; fall back to the first valid option if not set or invalid
  const grade = gradeOptions.includes(gradeByProgram[program] ?? "") ? gradeByProgram[program]! : gradeOptions[0]!;
  function setGrade(g: string) { setGradeByProgram((prev) => ({ ...prev, [program]: g })); }

  // ── Persist prefs to localStorage ────────────────────────────────────────
  useEffect(() => {
    saveWsPrefs({ program, seasonByProgram, gradeByProgram });
  }, [program, seasonByProgram, gradeByProgram]);

  // ── Sync state to URL so the page is shareable ───────────────────────────
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("program", program);
    params.set("grade", wsGradeToParam(grade));
    if (resolvedSeasonId) params.set("season", String(resolvedSeasonId));
    if (debouncedSearch) params.set("q", debouncedSearch);
    filterCountries.forEach((c) => params.append("country", c));
    filterRegions.forEach((r) => params.append("region", r));
    window.history.replaceState(null, "", `/skills?${params.toString()}`);
  }, [program, grade, resolvedSeasonId, debouncedSearch, filterCountries, filterRegions]);

  // ── World skills data — stale-while-revalidate ────────────────────────────
  const [wsData, setWsData] = useState<WorldSkillsEntry[] | null>(null);
  const [wsLoading, setWsLoading] = useState(true);
  const [wsError, setWsError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // loadWorldSkills is the stale-while-revalidate layer now (IndexedDB, 7 days
  // for the live season and 120 for a finished one), so this only has to render
  // what it hands back: the cached board resolves immediately, and a background
  // refresh bumps `wsVersion`, which re-runs this and picks up the new numbers.
  const wsVersion = useWorldSkillsVersion();
  useEffect(() => {
    if (!resolvedSeasonId) return;

    let live = true;
    const hadData = wsData !== null;
    if (!hadData) setWsLoading(true);
    setWsError(null);
    // Only claims to be refreshing if a refresh is actually in flight for this
    // board — a hit inside the TTL does no network work at all.
    setIsRefreshing(worldSkillsMeta(worldSkillsKey(resolvedSeasonId, grade)).revalidating);

    loadWorldSkills(resolvedSeasonId, grade)
      .then((fresh) => {
        if (!live) return;
        setWsData(fresh);
        setWsLoading(false);
        setIsRefreshing(worldSkillsMeta(worldSkillsKey(resolvedSeasonId, grade)).revalidating);
      })
      .catch((err: Error) => {
        if (!live) return;
        setIsRefreshing(false);
        if (!hadData) { setWsLoading(false); setWsError(err.message); }
      });

    return () => { live = false; };
    // wsData is deliberately not a dependency — it is read only to decide whether
    // to show the skeleton, and listing it would re-run this on every load.
  }, [resolvedSeasonId, grade, wsVersion]);

  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    (wsData ?? []).forEach((r) => { if (r.team.country) set.add(r.team.country); });
    return Array.from(set).sort();
  }, [wsData]);

  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    (wsData ?? []).forEach((r) => { if (r.team.eventRegion) set.add(r.team.eventRegion); });
    return Array.from(set).sort();
  }, [wsData]);

  const { filtered, filterMs } = useMemo(() => {
    const t0 = performance.now();
    let rows = wsData ?? [];
    const q = debouncedSearch.trim().toLowerCase();
    if (q)
      rows = rows.filter(
        (r) =>
          r.team.team.toLowerCase().includes(q) ||
          (r.team.teamName ?? "").toLowerCase().includes(q) ||
          (r.team.organization ?? "").toLowerCase().includes(q) ||
          (r.team.eventRegion ?? "").toLowerCase().includes(q) ||
          (r.team.country ?? "").toLowerCase().includes(q),
      );
    if (filterCountries.length) rows = rows.filter((r) => filterCountries.includes(r.team.country ?? ""));
    if (filterRegions.length) rows = rows.filter((r) => filterRegions.includes(r.team.eventRegion ?? ""));
    return { filtered: rows, filterMs: Math.round(performance.now() - t0) };
  }, [wsData, debouncedSearch, filterCountries, filterRegions]);

  // Apply the chosen sort to the filtered set before paginating. `filtered`
  // stays in official combined-rank order for CSV export and "Where Would I
  // Place?" (which relies on score-descending order); `sorted` drives display.
  const sorted = useMemo(() => {
    const sortValue = (row: WorldSkillsEntry): number | string => {
      switch (sort.key) {
        case "score": return row.scores.score;
        case "auto": return row.scores.programming;
        case "driver": return row.scores.driver;
        case "maxAuto": return row.scores.maxProgramming ?? -Infinity;
        case "maxDriver": return row.scores.maxDriver ?? -Infinity;
        case "autoStop": return row.scores.progStopTime ?? -Infinity;
        case "driverStop": return row.scores.driverStopTime ?? -Infinity;
        case "autoTs": return row.scores.progScoredAt ?? "";
        case "driverTs": return row.scores.driverScoredAt ?? "";
        case "team": return row.team.team;
        case "teamName": return row.team.teamName ?? "";
        case "organization": return row.team.organization ?? "";
        case "region": return row.team.eventRegion ?? "";
        case "country": return row.team.country ?? "";
        default: return row.rank;
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a), vb = sortValue(b);
      const cmp = typeof va === "string" || typeof vb === "string"
        ? String(va).localeCompare(String(vb), undefined, { numeric: true })
        : (va as number) - (vb as number);
      // Stable tiebreak on official rank so equal values keep a sensible order.
      return cmp !== 0 ? dir * cmp : a.rank - b.rank;
    });
  }, [filtered, sort]);

  const PAGE_SIZE = 80;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const visibleRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [debouncedSearch, filterCountries, filterRegions, resolvedSeasonId, grade, sort]);

  // Arrival highlight: once the rows for the requested leaderboard exist, page to
  // the focused team, scroll it into view, and drop the highlight after a beat.
  // Runs once — any later interaction (sorting, filtering) is the user's own.
  useEffect(() => {
    if (focusTeamId == null) return;
    const index = sorted.findIndex((row) => row.team.id === focusTeamId);
    if (index === -1) return;
    setPage(Math.floor(index / PAGE_SIZE) + 1);
    const raf = requestAnimationFrame(() => {
      focusRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    const timer = window.setTimeout(() => setFocusTeamId(null), 4000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
    // `sorted` is the trigger (rows arrive async); the timeout clearing
    // focusTeamId is what stops this from re-flashing on later sort changes.
  }, [focusTeamId, sorted]);

  const wpPlacement = useMemo(() => {
    if (!wpAuto && !wpDriver) return null;
    const combined = (Number(wpAuto) || 0) + (Number(wpDriver) || 0);
    const idx = filtered.findIndex((r) => r.scores.score <= combined);
    const rank = idx === -1 ? filtered.length + 1 : idx + 1;
    const percentile = ((filtered.length - rank + 1) / Math.max(filtered.length, 1) * 100).toFixed(1);
    return { rank, percentile, total: filtered.length, combined };
  }, [wpAuto, wpDriver, filtered]);

  function downloadCSV() {
    const headers = [
      "Row", "Rank", "Score", "Autonomous Coding Skills", "Driver Skills",
      "Highest Autonomous Coding Skills", "Highest Driver Skills",
      "Highest Auto Score Timestamp", "Highest Driver Score Timestamp",
      "Highest Auto Score Stop Time", "Highest Driver Score Stop Time",
      "Team Number", "Team Name", "Organization", "Event Region", "Country/Region",
    ];
    const rows = filtered.map((r, i) => [
      i + 1, r.rank, r.scores.score, r.scores.programming, r.scores.driver,
      r.scores.maxProgramming ?? "", r.scores.maxDriver ?? "",
      r.scores.progScoredAt ?? "", r.scores.driverScoredAt ?? "",
      r.scores.progStopTime ?? "", r.scores.driverStopTime ?? "",
      r.team.team, r.team.teamName ?? "", r.team.organization ?? "",
      r.team.eventRegion ?? "", r.team.country ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `world-skills-${resolvedSeasonId ?? "unknown"}-${grade.replace(/ /g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const programCode = program.toUpperCase();

  return (
    <section className="page" onClick={() => setOpenMenu(null)}>
      <PageTitle
        icon={<Trophy />}
        title="World Skills"
        subtitle=""
      />

      {/* Program, season, and grade controls — one shared tab row */}
      <div className="ws-controls" onClick={(e) => e.stopPropagation()}>
        <div className="segmented ws-segmented-inline" role="group" aria-label="Program">
          <button aria-pressed={program === "v5rc"} className={program === "v5rc" ? "active" : ""} onClick={() => setProgram("v5rc")}>V5RC{program === "v5rc" && <SlideIndicator id="ws-program" />}</button>
          <button aria-pressed={program === "viqrc"} className={program === "viqrc" ? "active" : ""} onClick={() => setProgram("viqrc")}>VIQRC{program === "viqrc" && <SlideIndicator id="ws-program" />}</button>
        </div>

        <span className="ws-controls-sep" aria-hidden="true" />

        {/* Season dropdown — a tab-styled menu trigger, not a bordered box */}
        <div className={`ws-season-picker${openMenu === "season" ? " open" : ""}`}>
          <button
            aria-label="Season"
            aria-haspopup="listbox"
            aria-expanded={openMenu === "season"}
            title="Season"
            onClick={() => setOpenMenu(openMenu === "season" ? null : "season")}
          >
            {seasonOptions.find((s) => s.id === resolvedSeasonId)?.label ?? (seasonsAsync.loading ? "Loading…" : "Season")}
            <ChevronDown size={14} className="ws-season-chevron" />
          </button>
          {openMenu === "season" && (
            <div className="ws-filter-dropdown" role="listbox" aria-label="Season">
              <div className="ws-filter-list">
                {seasonOptions.map((s) => (
                  <button
                    key={s.id}
                    role="option"
                    aria-selected={s.id === resolvedSeasonId}
                    className={`ws-season-opt${s.id === resolvedSeasonId ? " active" : ""}`}
                    onClick={() => { setManualSeasonId(s.id); setPage(1); setOpenMenu(null); }}
                  >
                    {s.label}
                  </button>
                ))}
                {!seasonOptions.length && <div className="ws-filter-empty">Loading seasons…</div>}
              </div>
            </div>
          )}
        </div>

        <span className="ws-controls-sep" aria-hidden="true" />

        <div className="segmented ws-segmented-inline" role="group" aria-label="Grade level">
          {gradeOptions.map((g) => (
            <button
              key={g}
              aria-pressed={grade === g}
              className={grade === g ? "active" : ""}
              onClick={() => { setGrade(g); setPage(1); }}
            >
              {g}
              {grade === g && <SlideIndicator id="ws-grade" />}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="ws-toolbar" onClick={(e) => e.stopPropagation()}>
        <div className="ws-search-wrap">
          <Search size={14} className="ws-search-icon" />
          <input
            className="ws-search-input"
            placeholder={isNarrow ? "Search teams…" : "Search team #, name, organization, region, country…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="ws-search-clear" onClick={() => setSearch("")} aria-label="Clear">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Country filter */}
        <div className="ws-filter-menu" onClick={(e) => e.stopPropagation()}>
          <button
            className={filterCountries.length ? "active" : ""}
            onClick={() => setOpenMenu(openMenu === "country" ? null : "country")}
          >
            {filterCountries.length
              ? `${filterCountries.length} countr${filterCountries.length === 1 ? "y" : "ies"}`
              : "Country"}
            <ChevronDown size={12} />
          </button>
          {openMenu === "country" && (
            <div className="ws-filter-dropdown">
              <div className="ws-filter-actions">
                <button onClick={() => setFilterCountries([])}>Clear</button>
              </div>
              <div className="ws-filter-list">
                {countryOptions.map((c) => (
                  <label key={c}>
                    <input
                      type="checkbox"
                      checked={filterCountries.includes(c)}
                      onChange={() =>
                        setFilterCountries((prev) =>
                          prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                        )
                      }
                    />
                    <span>{c}</span>
                  </label>
                ))}
                {!countryOptions.length && <div className="ws-filter-empty">No data yet</div>}
              </div>
            </div>
          )}
        </div>

        {/* Region filter */}
        <div className="ws-filter-menu" onClick={(e) => e.stopPropagation()}>
          <button
            className={filterRegions.length ? "active" : ""}
            onClick={() => setOpenMenu(openMenu === "region" ? null : "region")}
          >
            {filterRegions.length
              ? `${filterRegions.length} region${filterRegions.length === 1 ? "" : "s"}`
              : "Region"}
            <ChevronDown size={12} />
          </button>
          {openMenu === "region" && (
            <div className="ws-filter-dropdown">
              <div className="ws-filter-actions">
                <button onClick={() => setFilterRegions([])}>Clear</button>
              </div>
              <div className="ws-filter-list">
                {regionOptions.map((r) => (
                  <label key={r}>
                    <input
                      type="checkbox"
                      checked={filterRegions.includes(r)}
                      onChange={() =>
                        setFilterRegions((prev) =>
                          prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
                        )
                      }
                    />
                    <span>{r}</span>
                  </label>
                ))}
                {!regionOptions.length && <div className="ws-filter-empty">No data yet</div>}
              </div>
            </div>
          )}
        </div>

        <div className="ws-toolbar-actions">
          <button
            className={`ws-utc-btn${useUtc ? " active" : ""}`}
            onClick={() => setUseUtc((u) => !u)}
            title={useUtc ? "Showing UTC — click for local time" : "Showing local time — click for UTC"}
          >
            {useUtc ? "UTC Time" : "Local Time"}
          </button>
          <button
            className={`ws-where-btn${wherePlaceOpen ? " active" : ""}`}
            onClick={() => setWherePlaceOpen((o) => !o)}
          >
            <ListOrdered size={13} /> Where Would I Place?
          </button>
          <ExportButton onExport={downloadCSV} title="Download filtered CSV" />
        </div>
      </div>

      {/* Where Would I Place panel */}
      {wherePlaceOpen && (
        <div className="ws-where-panel" onClick={(e) => e.stopPropagation()}>
          <span className="ws-where-label">Enter your scores:</span>
          <div className="ws-where-inputs">
            <div className="ws-where-field">
              <label>Autonomous</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={wpAuto}
                onChange={(e) => setWpAuto(e.target.value)}
              />
            </div>
            <span className="ws-where-plus">+</span>
            <div className="ws-where-field">
              <label>Driver</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={wpDriver}
                onChange={(e) => setWpDriver(e.target.value)}
              />
            </div>
            {(wpAuto || wpDriver) && (
              <span className="ws-where-combined">
                = <strong>{(Number(wpAuto) || 0) + (Number(wpDriver) || 0)}</strong> combined
              </span>
            )}
          </div>
          {wpPlacement && (
            <div className="ws-placement-result">
              {wpPlacement.rank <= wpPlacement.total ? (
                <>
                  You&apos;d rank <strong>#{wpPlacement.rank.toLocaleString()}</strong> of{" "}
                  {wpPlacement.total.toLocaleString()} — top <strong>{wpPlacement.percentile}%</strong>
                  {filtered !== (wsData ?? []) && " (with current filters)"}
                </>
              ) : (
                <>
                  Score of <strong>{wpPlacement.combined}</strong> would be unranked (below last entry in current view)
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stats bar */}
      <div className="ws-stats-bar">
        {wsLoading ? (
          <span className="muted">Loading…</span>
        ) : (
          <>
            <span>
              <strong>{filtered.length.toLocaleString()}</strong> team{filtered.length !== 1 ? "s" : ""}
              {filtered.length !== (wsData ?? []).length && ` (filtered from ${(wsData ?? []).length.toLocaleString()})`}
              {(debouncedSearch || filterCountries.length > 0 || filterRegions.length > 0) && <span className="ws-filter-ms"> ({filterMs} ms)</span>}
            </span>
            {isRefreshing && <span className="ws-refreshing">Updating…</span>}
            {filtered.length > 0 && totalPages > 1 && (
              <span className="muted">Page {page} of {totalPages}</span>
            )}
          </>
        )}
      </div>

      {/* Table */}
      <Status loading={wsLoading} error={wsError} />
      {!wsLoading && !wsError && (
        <CrossFade trigger={`${program}|${grade}|${resolvedSeasonId}|${debouncedSearch}|${filterCountries.join(",")}|${filterRegions.join(",")}|${page}|${sort.key}|${sort.dir}`}>
        <div className="ws-mobile-head" aria-hidden="true">
          <span>Rank</span><span>Team</span><span>Score</span><span>Auto / Driver</span>
        </div>
        <DragScroll className="ws-table-wrap">
          <table className="ws-table">
            <colgroup>
              <col style={{ width: "24px" }} />   {/* # */}
              <col style={{ width: "40px" }} />   {/* Rank */}
              <col style={{ width: "48px" }} />   {/* Score */}
              <col style={{ width: "52px" }} />   {/* Auto Skills */}
              <col style={{ width: "52px" }} />   {/* Driver Skills */}
              <col style={{ width: "54px" }} />   {/* Max Auto */}
              <col style={{ width: "54px" }} />   {/* Max Driver */}
              <col style={{ width: "130px" }} />  {/* Auto Date */}
              <col style={{ width: "130px" }} />  {/* Driver Date */}
              <col style={{ width: "46px" }} />   {/* Auto Stop */}
              <col style={{ width: "46px" }} />   {/* Driver Stop */}
              <col style={{ width: "58px" }} />   {/* Team # */}
              <col />                             {/* Team Name */}
              <col />                             {/* Organization */}
              <col style={{ width: "100px" }} />  {/* Event Region */}
              <col style={{ width: "100px" }} />  {/* Country */}
            </colgroup>
            <thead>
              <tr>
                <th className="ws-col-num">#</th>
                <SortableTh col="rank" label="Rank" sort={sort} onSort={onSort} title="Official combined-skills rank" />
                <SortableTh col="score" label="Score" sort={sort} onSort={onSort} />
                <SortableTh col="auto" label="Auto Skills" sort={sort} onSort={onSort} />
                <SortableTh col="driver" label="Driver Skills" sort={sort} onSort={onSort} />
                <SortableTh col="maxAuto" label="Max Auto" sort={sort} onSort={onSort} />
                <SortableTh col="maxDriver" label="Max Driver" sort={sort} onSort={onSort} />
                <SortableTh col="autoTs" label="Auto Timestamp" sort={sort} onSort={onSort} />
                <SortableTh col="driverTs" label="Driver Timestamp" sort={sort} onSort={onSort} />
                <SortableTh col="autoStop" label="Auto Stop" sort={sort} onSort={onSort} />
                <SortableTh col="driverStop" label="Driver Stop" sort={sort} onSort={onSort} />
                <SortableTh col="team" label="Team" sort={sort} onSort={onSort} />
                <SortableTh col="teamName" label="Team Name" sort={sort} onSort={onSort} />
                <SortableTh col="organization" label="Organization" sort={sort} onSort={onSort} />
                <SortableTh col="region" label="Region" sort={sort} onSort={onSort} />
                <SortableTh col="country" label="Country" sort={sort} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={16}>
                    <Empty>No results{debouncedSearch || filterCountries.length || filterRegions.length ? " — try adjusting filters" : ""}.</Empty>
                  </td>
                </tr>
              ) : (
                visibleRows.map((r, i) => (
                  <tr
                    key={r.team.id}
                    ref={r.team.id === focusTeamId ? focusRowRef : undefined}
                    className={r.team.id === focusTeamId ? "ws-row-focus" : undefined}
                  >
                    <td className="ws-col-num ws-hide-mobile">{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="ws-m-rank"><strong>{r.rank}</strong></td>
                    <td className="ws-m-stat" data-label="Score"><strong>{r.scores.score}</strong></td>
                    <td className="ws-m-stat" data-label="Auto"><span className="ws-m-tag" aria-hidden="true">P</span><strong>{r.scores.programming}</strong></td>
                    <td className="ws-m-stat" data-label="Driver"><span className="ws-m-tag" aria-hidden="true">D</span><strong>{r.scores.driver}</strong></td>
                    <td className="ws-max-auto ws-hide-mobile">{r.scores.maxProgramming ?? "—"}</td>
                    <td className="ws-max-driver ws-hide-mobile">{r.scores.maxDriver ?? "—"}</td>
                    <td className="ws-muted-cell ws-tip-cell ws-hide-mobile" data-tip={formatSkillsDate(r.scores.progScoredAt, useUtc)}><span className="ws-cell-inner">{renderSkillsDate(r.scores.progScoredAt, useUtc)}</span></td>
                    <td className="ws-muted-cell ws-tip-cell ws-hide-mobile" data-tip={formatSkillsDate(r.scores.driverScoredAt, useUtc)}><span className="ws-cell-inner">{renderSkillsDate(r.scores.driverScoredAt, useUtc)}</span></td>
                    <td className="ws-muted-cell ws-hide-mobile">{r.scores.progStopTime ?? "—"}</td>
                    <td className="ws-muted-cell ws-hide-mobile">{r.scores.driverStopTime ?? "—"}</td>
                    <td className="ws-m-team">
                      <CompareTeamLink
                        teamId={r.team.id}
                        teamNumber={r.team.team}
                        programCode={programCode}
                        teamName={r.team.teamName ?? undefined}
                      />
                    </td>
                    {/* data-tip deliberately keeps the ORIGINAL text, so hovering a
                        translated cell still shows the name as RobotEvents has it. */}
                    <td className="ws-text-cell ws-tip-cell ws-m-name" data-tip={r.team.teamName ?? "—"}><span className="ws-cell-inner">{r.team.teamName ? <TranslatedText text={r.team.teamName} country={r.team.country} /> : "—"}</span></td>
                    <td className="ws-muted-cell ws-tip-cell ws-hide-mobile" data-tip={r.team.organization ?? "—"}><span className="ws-cell-inner">{r.team.organization ? <TranslatedText text={r.team.organization} country={r.team.country} /> : "—"}</span></td>
                    <td className="ws-muted-cell ws-tip-cell ws-hide-mobile" data-tip={r.team.eventRegion ?? "—"}><span className="ws-cell-inner">{r.team.eventRegion ?? "—"}</span></td>
                    <td className="ws-muted-cell ws-tip-cell ws-hide-mobile" data-tip={r.team.country ?? "—"}><span className="ws-cell-inner">{r.team.country ?? "—"}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DragScroll>
        </CrossFade>
      )}
      <LocalPager page={page} totalPages={totalPages} onPage={setPage} />
    </section>
  );
}

function InsightsPage() {
  const [program, setProgram] = useState<"v5rc" | "viqrc">("v5rc");
  const { data, loading, error } = useAsync(() => api.superscore(program, { per_page: 50 }), [program]);
  const leaders = data?.data ?? [];
  const avgEpa = leaders.reduce((sum, row) => sum + (row.epa?.total ?? 0), 0) / Math.max(leaders.length, 1);

  return (
    <section className="page">
      <PageTitle icon={<BarChart3 />} title="Insights" subtitle="SuperScore, EPA, TrueSkill, and signature-win leaderboards from RoboStem." />
      <div className="segmented">
        <button className={program === "v5rc" ? "active" : ""} onClick={() => setProgram("v5rc")}>
          V5RC
          {program === "v5rc" && <SlideIndicator id="stats-program" />}
        </button>
        <button className={program === "viqrc" ? "active" : ""} onClick={() => setProgram("viqrc")}>
          VIQRC
          {program === "viqrc" && <SlideIndicator id="stats-program" />}
        </button>
      </div>
      <div className="stats-row">
        <Metric icon={<Trophy />} label="Ranked teams" value={data?.meta.total ?? 0} />
        <Metric icon={<Activity />} label="Average EPA top 50" value={Math.round(avgEpa)} />
        <Metric icon={<Medal />} label="Rows shown" value={leaders.length} />
      </div>
      <Panel title={`${program.toUpperCase()} SuperScore Rankings`} icon={<BarChart3 />}>
        <Status loading={loading} error={error} />
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team</th>
              <th>SuperScore</th>
              <th>EPA</th>
              <th>Auto Skill</th>
              <th>TrueSkill</th>
              <th>Matches</th>
              <th>Signature Wins</th>
            </tr>
          </thead>
          <TableBodySwap loading={loading} columns={8}>
              {leaders.map((row) => (
                <tr key={`${row.rank}-${row.team.id}`}>
                  <td>{row.rank}</td>
                  <td>
                    <CompareTeamLink teamId={row.team.id} teamNumber={row.team.number} programCode={program.toUpperCase()} />
                    <div className="muted">{row.team.name}</div>
                  </td>
                  <td>{formatNumber(row.superscore, 2)}</td>
                  <td>{formatNumber(row.epa?.total, 2)}</td>
                  <td>{formatNumber(row.auto_skill, 2)}</td>
                  <td>{formatNumber(row.trueskill?.mu, 2)}</td>
                  <td>{row.total_matches ?? "-"}</td>
                  <td>{row.signature_wins ?? "-"}</td>
                </tr>
              ))}
        </TableBodySwap>
        </table>
      </Panel>
    </section>
  );
}

function NotFound() {
  return (
    <section className="page">
      <PageTitle icon={<ExternalLink />} title="Page Not Found" subtitle="That OpenScout route does not exist yet." />
      <Link href="/" className="button-link">
        Go home
      </Link>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Terms of Service page
// ---------------------------------------------------------------------------

function TermsPage() {
  return (
    <section className="page terms-page">
      <PageTitle icon={<Shield />} title="Terms of Service" subtitle="Last updated: June 2026" />
      <div className="terms-body">
        <h3>1. Acceptance of these terms</h3>
        <p>
          OpenScout ("OpenScout", the "Service") is a web-based scouting and analytics tool for VEX Robotics events,
          provided by RoboSTEM Foundation, Inc. (legal name ROBOSTEM FOUNDATION INC), a 501(c)(3) nonprofit organization
          registered in California ("RoboSTEM Foundation", "we", "us", or "our"). By accessing or using the Service, you
          agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
        </p>

        <h3>2. Eligibility &amp; age requirement</h3>
        <p>
          The Service is not directed to children and you must be at least 13 years old to use it or to create an
          account. By using OpenScout you represent that you are 13 or older. If you are under 18, you may use the
          Service only with the involvement and consent of a parent or legal guardian. We do not knowingly collect
          personal information from anyone under 13; see our{" "}
          <Link href="/privacy">Privacy Policy</Link> for details.
        </p>

        <h3>3. Accounts</h3>
        <p>
          You may sign in using a third-party provider (such as Google or Discord). You are responsible for activity
          that occurs under your account and for keeping your login credentials with those providers secure. Provide
          accurate information and keep it up to date. You may delete your account at any time by contacting us.
        </p>

        <h3>4. Acceptable use</h3>
        <p>You agree not to:</p>
        <ul>
          <li>Reverse-engineer, scrape, overload, or disrupt the Service or its upstream data sources or APIs.</li>
          <li>Use OpenScout for any unlawful, harmful, or abusive purpose, or to harass other users.</li>
          <li>Attempt to gain unauthorized access to any account, system, or data connected to the Service.</li>
          <li>Misrepresent your identity or another team's identity, or upload unlawful or infringing content.</li>
        </ul>

        <h3>5. Intellectual property</h3>
        <p>
          The Service, including its software, design, and branding, is owned by RoboSTEM Foundation and protected by
          applicable intellectual-property laws. We grant you a limited, non-exclusive, non-transferable, revocable
          license to use the Service for its intended purpose. You retain ownership of any notes or content you create;
          by submitting it you grant us the rights needed to operate and provide the Service to you.
        </p>

        <h3>6. Third-party data &amp; no affiliation</h3>
        <p>
          OpenScout displays publicly available VEX Robotics event and team data sourced from Events.vex.com and other
          third-party databases. We do not control and are not responsible for that data, which may be incomplete or
          inaccurate. OpenScout and RoboSTEM Foundation are independent and are not affiliated with, endorsed by, or
          sponsored by VEX Robotics.
        </p>

        <h3>7. Privacy</h3>
        <p>
          Your use of the Service is also governed by our <Link href="/privacy">Privacy Policy</Link>, which explains
          what information we collect and how we handle it. By using OpenScout you acknowledge that you have read it.
        </p>

        <h3>8. Disclaimer of warranties</h3>
        <p>
          The Service is provided "as is" and "as available" without warranties of any kind, whether express or
          implied, including fitness for a particular purpose, accuracy, or non-infringement. We do not warrant that
          the Service will be uninterrupted, error-free, or that any data shown is accurate or current.
        </p>

        <h3>9. Limitation of liability</h3>
        <p>
          To the maximum extent permitted by applicable law, RoboSTEM Foundation and its officers, directors,
          volunteers, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive
          damages, or any loss of data, arising from or related to your use of the Service.
        </p>

        <h3>10. Termination</h3>
        <p>
          We may suspend or terminate your access to the Service at any time if you violate these Terms or to protect
          the Service or its users. You may stop using the Service at any time.
        </p>

        <h3>11. Governing law</h3>
        <p>
          These Terms are governed by the laws of the State of California, United States, without regard to its
          conflict-of-laws rules, except where superseded by mandatory consumer-protection laws of your country of
          residence.
        </p>

        <h3>12. Changes to these terms</h3>
        <p>
          We may update these Terms from time to time. When we do, we will revise the "Last updated" date above.
          Continued use of the Service after changes take effect constitutes acceptance of the updated Terms.
        </p>

        <h3>13. Contact</h3>
        <p>
          Questions about these Terms? Contact RoboSTEM Foundation, Inc. at{" "}
          <a href="mailto:contact@robostem.org">contact@robostem.org</a>.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Privacy Policy page
// ---------------------------------------------------------------------------

function PrivacyPage() {
  return (
    <section className="page terms-page">
      <PageTitle icon={<Shield />} title="Privacy Policy" subtitle="Last updated: June 2026" />
      <div className="terms-body">
        <h3>1. Who we are</h3>
        <p>
          OpenScout is operated by RoboSTEM Foundation, Inc. (legal name ROBOSTEM FOUNDATION INC), a 501(c)(3) nonprofit
          organization registered in California ("RoboSTEM Foundation", "we", "us", or "our"), which is the data
          controller for personal information processed through the Service. This policy explains what we collect, why,
          and the rights you have. You can reach us about privacy at{" "}
          <a href="mailto:contact@robostem.org">contact@robostem.org</a>.
        </p>

        <h3>2. Information we collect</h3>
        <ul>
          <li>
            <strong>Account information.</strong> When you sign in with Google or Discord, we receive your name, email
            address, profile picture, and a provider account identifier from that provider.
          </li>
          <li>
            <strong>Profile information you provide.</strong> An optional display name, team number, competition
            program, and appearance/theme preferences.
          </li>
          <li>
            <strong>Content you create.</strong> Notes, favorites, and pick lists you save within the Service.
          </li>
          <li>
            <strong>Usage &amp; device data.</strong> Aggregate, privacy-friendly analytics (for example via Vercel
            Analytics) such as pages viewed and approximate, non-identifying device information.
          </li>
          <li>
            <strong>Local storage.</strong> We cache event listings and your preferences in your browser
            (localStorage / IndexedDB) so the app loads faster. This stays on your device.
          </li>
        </ul>

        <h3>3. How we use your information</h3>
        <ul>
          <li>To provide, maintain, and personalize the Service and your account.</li>
          <li>To save your preferences, notes, and team data across devices.</li>
          <li>To understand usage in aggregate so we can improve and secure the Service.</li>
          <li>To communicate with you about your account or important changes.</li>
        </ul>

        <h3>4. Legal bases for processing (GDPR)</h3>
        <p>
          If you are in the European Economic Area or the United Kingdom, we process your personal data under the
          following legal bases: <strong>performance of a contract</strong> (to provide the Service you request),{" "}
          <strong>your consent</strong> (which you may withdraw at any time), and our{" "}
          <strong>legitimate interests</strong> (to keep the Service secure and to improve it), balanced against your
          rights.
        </p>

        <h3>5. Children's privacy (COPPA)</h3>
        <p>
          The Service is not intended for and is not directed to children under 13, and we do not knowingly collect
          personal information from anyone under 13. If you believe a child under 13 has provided us with personal
          information, please contact us at <a href="mailto:contact@robostem.org">contact@robostem.org</a> and we will delete
          it promptly.
        </p>

        <h3>6. How we share information</h3>
        <p>
          We do not sell your personal information. We share it only with service providers who process data on our
          behalf to operate the Service, including our hosting and database provider (Supabase), our hosting and
          analytics platform (Vercel), and the authentication providers you choose to sign in with (Google, Discord).
          We may also disclose information if required by law or to protect the rights and safety of our users.
        </p>

        <h3>7. International data transfers</h3>
        <p>
          We are based in the United States and our service providers may process data in the United States and other
          countries. Where we transfer personal data out of the EEA or UK, we rely on appropriate safeguards such as
          Standard Contractual Clauses.
        </p>

        <h3>8. Data retention</h3>
        <p>
          We keep your account and profile information for as long as your account is active. If you delete your account
          or ask us to delete your data, we will remove it within a reasonable period, except where we must retain it to
          comply with legal obligations.
        </p>

        <h3>9. Your rights</h3>
        <p>
          Depending on where you live, you may have the right to access, correct, delete, or export your personal data,
          to object to or restrict certain processing, and to withdraw consent. Residents of the EEA/UK may also lodge a
          complaint with their local data-protection authority; California residents have rights under the CCPA/CPRA,
          including the right to know and to delete. To exercise any of these rights, email us at{" "}
          <a href="mailto:contact@robostem.org">contact@robostem.org</a>.
        </p>

        <h3>10. Security</h3>
        <p>
          We use reasonable technical and organizational measures to protect your information. No method of transmission
          or storage is completely secure, so we cannot guarantee absolute security.
        </p>

        <h3>11. Cookies &amp; local storage</h3>
        <p>
          We use essential browser storage to keep you signed in and to remember your preferences, and privacy-friendly
          analytics to measure usage. We do not use advertising cookies.
        </p>

        <h3>12. Changes to this policy</h3>
        <p>
          We may update this Privacy Policy from time to time. When we do, we will revise the "Last updated" date above
          and, where appropriate, notify you within the Service.
        </p>

        <h3>13. Contact</h3>
        <p>
          Questions or requests about your privacy? Contact RoboSTEM Foundation, Inc. at{" "}
          <a href="mailto:contact@robostem.org">contact@robostem.org</a>.
        </p>
      </div>
    </section>
  );
}

// --- Settings page ---------------------------------------------------------

type SettingsTab = "profile" | "appearance";

const SETTINGS_TABS: Array<{ value: SettingsTab; label: string; icon: ReactNode }> = [
  { value: "profile", label: "Profile", icon: <User size={16} /> },
  { value: "appearance", label: "Appearance", icon: <Palette size={16} /> },
];

const SETTINGS_THEME_OPTIONS: Array<{ value: NonNullable<Profile["theme"]>; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

// Round avatar from the profile's stored OAuth image, falling back to the
// first initial of the display name when the image is missing or fails to load.
function SettingsAvatar({ size = 48 }: { size?: number }) {
  const { user, profile } = useAuth();
  const [failed, setFailed] = useState(false);
  const src = profile?.avatar_url || "";
  const initial = (profile?.display_name || suggestedName(user) || "?").charAt(0).toUpperCase();

  if (src && !failed) {
    return (
      <img
        className="settings-avatar"
        src={src}
        width={size}
        height={size}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="settings-avatar settings-avatar-fallback" style={{ width: size, height: size }}>
      {initial}
    </span>
  );
}

// Identity + account section. Seeds local form state from the profile once it
// loads (keyed on profile id so a different user re-seeds), then saves the patch.
function ProfileSettings() {
  const { user, profile, updateProfile, signOut } = useAuth();
  const [name, setName] = useState(() => profile?.display_name || suggestedName(user));
  const [teamNumber, setTeamNumber] = useState(profile?.team_number ?? "");
  const [program, setProgram] = useState(profile?.team_program ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const seeded = useRef<string | null>(null);

  useEffect(() => {
    if (!profile || seeded.current === profile.id) return;
    seeded.current = profile.id;
    setName(profile.display_name || suggestedName(user));
    setTeamNumber(profile.team_number ?? "");
    setProgram(profile.team_program ?? "");
  }, [profile, user]);

  const dirty =
    name.trim() !== (profile?.display_name || suggestedName(user) || "").trim() ||
    teamNumber.trim() !== (profile?.team_number ?? "") ||
    program !== (profile?.team_program ?? "");

  const save = async () => {
    setSaving(true);
    await updateProfile({
      display_name: name.trim() || null,
      team_number: teamNumber.trim() || null,
      team_program: program || null,
    });
    setSaving(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  const provider = profile?.provider ? profile.provider.charAt(0).toUpperCase() + profile.provider.slice(1) : null;
  const heroName = name.trim() || suggestedName(user) || "Your account";

  return (
    <div className="settings-card">
      <div className="settings-hero">
        <SettingsAvatar />
        <div className="settings-hero-id">
          <div className="settings-hero-name">{heroName}</div>
          <div className="settings-hero-sub">
            <span className="settings-hero-email">{user?.email || "Signed in"}</span>
            {provider && <span className="badge">{provider}</span>}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void signOut()}>
          <LogOut data-icon="inline-start" />
          Sign out
        </Button>
      </div>

      <div className="settings-card-body">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="settings-name">Name</FieldLabel>
            <Input
              id="settings-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={24}
              placeholder="Your name"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="settings-team">Team Number</FieldLabel>
              <Input
                id="settings-team"
                value={teamNumber}
                onChange={(event) => setTeamNumber(event.target.value.toUpperCase())}
                maxLength={10}
                placeholder="169W"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="settings-program">Program</FieldLabel>
              <Select value={program || "none"} onValueChange={(v) => setProgram(v === "none" ? "" : v)}>
                <SelectTrigger id="settings-program" className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {AUTH_PROGRAMS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </FieldGroup>

        <div className="settings-actions">
          <Button onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <span className={`settings-saved${saved ? " on" : ""}`} aria-live="polite">
            <span className="settings-saved-icon"><Check size={15} /></span>
            {saved ? "Saved" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

// Theme picker. Saves immediately on selection (optimistic local state + profile
// upsert) — no separate Save button needed.

const QUICK_VIEW_OPTIONS: Array<{ value: boolean; label: string }> = [
  { value: true, label: "Quick view first" },
  { value: false, label: "Open full team view" },
];

const TRANSLATE_MODE_OPTIONS: Array<{ value: TranslateMode; label: string }> = [
  { value: "auto", label: "Auto-translate" },
  { value: "manual", label: "Manual" },
];

// Mini wireframe preview: "quick view first" shows a content area with a side
// drawer; "full" shows a plain full-page content area.
function QuickViewWire({ value }: { value: boolean }) {
  return (
    <span className={`layout-wire qv-wire qv-wire-${value ? "quick" : "full"}`} aria-hidden="true">
      <span className="lw-body">
        <span className="lw-line" />
        <span className="lw-line short" />
      </span>
      {value && <span className="qv-wire-panel" aria-hidden="true" />}
    </span>
  );
}

const QUICK_VIEW_MODE_OPTIONS: Array<{ value: QuickViewMode; label: string }> = [
  { value: "sidebar", label: "Sidebar" },
  { value: "sheet", label: "Bottom sheet" },
];

const QUICK_VIEW_SIDE_OPTIONS: Array<{ value: QuickViewSide; label: string }> = [
  { value: "right", label: "Right" },
  { value: "left", label: "Left" },
  { value: "adaptive", label: "Adaptive" },
];

// Mini wireframe preview of where the quick view panel sits: docked right/left,
// the bottom sheet, or adaptive (both sides, one ghosted).
function QuickViewPlacementWire({ panel }: { panel: "bottom" | "right" | "left" | "adaptive" }) {
  return (
    <span className={`layout-wire qv-wire qv-p-${panel}`} aria-hidden="true">
      <span className="lw-body">
        <span className="lw-line" />
        <span className="lw-line short" />
      </span>
      <span className="qv-wire-panel" />
      {panel === "adaptive" && <span className="qv-wire-panel ghost" />}
    </span>
  );
}

function AppearanceSettings() {
  const { updateProfile } = useAuth();
  const theme = useTheme(); // global theme store — already reflects the synced cloud value
  const quickViewFirst = useQuickViewFirst(); // team-click behavior, synced
  const quickViewMode = useQuickViewMode(); // sidebar vs bottom sheet, synced
  const quickViewSide = useQuickViewSide(); // sidebar dock side, synced
  const translateMode = useTranslateMode(); // auto vs manual translation, synced

  const choose = (value: NonNullable<Profile["theme"]>) => {
    applyTheme(value); // instant local apply + localStorage
    void updateProfile({ theme: value }); // persist to the account
  };

  return (
    <div className="settings-card">
      <div className="settings-card-head">
        <h2 className="settings-card-title">Appearance</h2>
      </div>
      <div className="settings-card-body">
        <p className="settings-section-copy">Choose how OpenScout looks. Your pick syncs to your account.</p>
        <div className="theme-picker">
          {SETTINGS_THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`theme-tile ${theme === option.value ? "active" : ""} theme-tile-${option.value}`}
              onClick={() => choose(option.value)}
              aria-pressed={theme === option.value}
            >
              <span className="theme-wire" aria-hidden="true">
                <span className="theme-wire-bar" />
                <span className="theme-wire-line" />
                <span className="theme-wire-line short" />
              </span>
              <span className="theme-tile-label">{option.label}</span>
            </button>
          ))}
        </div>
        <p className="onboard-hint">Applies instantly and syncs across your devices.</p>

        <div className="settings-field">
          <h3 className="settings-field-title">Team click behavior</h3>
          <p className="settings-section-copy">
            When you click a team, open a quick overview panel first, or jump straight to the full team page.
          </p>
          <div className="layout-picker" role="group" aria-label="Team click behavior">
            {QUICK_VIEW_OPTIONS.map((option) => (
              <button
                key={String(option.value)}
                type="button"
                className={`theme-tile ${quickViewFirst === option.value ? "active" : ""}`}
                onClick={() => setQuickViewFirst(option.value)}
                aria-pressed={quickViewFirst === option.value}
              >
                <QuickViewWire value={option.value} />
                <span className="theme-tile-label">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-field">
          <h3 className="settings-field-title">Translate mode</h3>
          <p className="settings-section-copy">
            Non-English event, team, and organization names can be shown in English. Either way, the translate icon
            beside a name switches it back to the original.
          </p>
          <div className="seg-toggle seg-toggle-quiet" role="group" aria-label="Translate mode">
            {TRANSLATE_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={translateMode === option.value ? "active" : ""}
                onClick={() => setTranslateMode(option.value)}
                aria-pressed={translateMode === option.value}
              >
                {option.label}
                {translateMode === option.value && <SlideIndicator id="translate-mode" variant="pill" />}
              </button>
            ))}
          </div>
          <p className="onboard-hint">
            Manual makes no translation requests until you ask for one. Syncs across your devices.
          </p>
        </div>

        {quickViewFirst && (
          <div className="settings-field">
            <h3 className="settings-field-title">Quick view style</h3>
            <p className="settings-section-copy">
              Dock the quick view beside the page as a sidebar, or slide it up from the bottom.
            </p>
            <div className="layout-picker" role="group" aria-label="Quick view style">
              {QUICK_VIEW_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`theme-tile ${quickViewMode === option.value ? "active" : ""}`}
                  onClick={() => setQuickViewMode(option.value)}
                  aria-pressed={quickViewMode === option.value}
                >
                  <QuickViewPlacementWire panel={option.value === "sheet" ? "bottom" : quickViewSide === "left" ? "left" : "right"} />
                  <span className="theme-tile-label">{option.label}</span>
                </button>
              ))}
            </div>
            {quickViewMode === "sidebar" && (
              <>
                <p className="settings-section-copy" style={{ marginTop: 14 }}>
                  Which side the sidebar opens on. Adaptive picks the side closest to your cursor.
                </p>
                <div className="layout-picker layout-picker-3" role="group" aria-label="Sidebar side">
                  {QUICK_VIEW_SIDE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`theme-tile ${quickViewSide === option.value ? "active" : ""}`}
                      onClick={() => setQuickViewSide(option.value)}
                      aria-pressed={quickViewSide === option.value}
                    >
                      <QuickViewPlacementWire panel={option.value} />
                      <span className="theme-tile-label">{option.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsPage() {
  const { ready, configured, user } = useAuth();
  const [tab, setTab] = useState<SettingsTab>(() =>
    window.location.hash.replace("#", "") === "appearance" ? "appearance" : "profile",
  );

  // Signed out (or accounts layer dormant): invite sign-in instead of the editor.
  if (!configured || (ready && !user)) {
    return (
      <section className="page">
        <PageTitle icon={<Settings />} title="Settings" />
        <div className="settings-card">
          <div className="settings-card-head">
            <h2 className="settings-card-title">Sign up / Log in</h2>
          </div>
          <div className="settings-card-body">
            <p className="settings-section-copy">Sign in to sync your favorites and settings across devices.</p>
            <SignInButtons />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <PageTitle icon={<Settings />} title="Settings" />
      <div className="settings-layout">
        <nav className="settings-tabs" aria-label="Settings sections">
          {SETTINGS_TABS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              className={`settings-tab ${tab === entry.value ? "active" : ""}`}
              aria-current={tab === entry.value}
              onClick={() => {
                setTab(entry.value);
                window.history.replaceState(null, "", `/settings#${entry.value}`);
              }}
            >
              {entry.icon}
              {entry.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {!ready ? (
            <div className="settings-card">
              <div className="settings-card-body">
                <Status loading error={null} />
              </div>
            </div>
          ) : tab === "profile" ? (
            <ProfileSettings />
          ) : (
            <AppearanceSettings />
          )}
        </div>
      </div>
    </section>
  );
}

// ── Shared Team components ────────────────────────────────────────────────────

function SharedTeamFavoritesList({ sharedTeamId }: { sharedTeamId: string }) {
  const { teams: teamIds, events: eventIds, ready } = useSharedTeamFavorites(sharedTeamId);
  const resolved = useAsync(async () => {
    if (!ready) return null;
    const [teams, events] = await Promise.all([
      Promise.all(teamIds.map((id) => api.team(id).catch(() => null))),
      Promise.all(eventIds.map((id) => api.event(id).catch(() => null))),
    ]);
    return {
      teams: teams.filter((t): t is Team => !!t),
      events: events.filter((e): e is Event => !!e),
    };
  }, [teamIds, eventIds, ready]);

  const data = resolved.data;
  const loading = !ready || resolved.loading;
  const hasAny = !!data && (data.teams.length > 0 || data.events.length > 0);

  return (
    <div className="home-fav-list">
      {loading && <div className="home-fav-empty">Loading…</div>}
      {!loading && !hasAny && (
        <div className="home-fav-empty">No shared favorites yet — add teams or events to share with the shared team.</div>
      )}
      {data?.teams.map((team) => (
        <div key={`t-${team.id}`} className="home-fav-item-row">
          <Link href={teamPath(team)} className="home-fav-item">
            <span className="home-fav-badge team">{team.program?.code ?? "VEX"}</span>
            <span className="home-fav-text">
              <span className="home-fav-title">
                {team.number} · <TranslatedText text={team.team_name ?? "Unnamed Team"} country={team.location?.country} />
              </span>
              <span className="home-fav-sub">{locationLine(team)}</span>
            </span>
          </Link>
          <button
            type="button"
            className="home-fav-remove"
            title="Remove from shared team favorites"
            onClick={() => void toggleSharedTeamFavorite(sharedTeamId, "team", String(team.id))}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      {data?.events.map((event) => (
        <div key={`e-${event.id}`} className="home-fav-item-row">
          <Link href={eventPath(event)} className="home-fav-item">
            <span className="home-fav-badge event">{seasonYearLabel(event.season?.name) || <CalendarDays size={13} />}</span>
            <span className="home-fav-text">
              <TranslatedText className="home-fav-title" text={event.name} country={event.location?.country} />
              <span className="home-fav-sub">{locationLine(event)}</span>
            </span>
          </Link>
          <button
            type="button"
            className="home-fav-remove"
            title="Remove from shared team favorites"
            onClick={() => void toggleSharedTeamFavorite(sharedTeamId, "event", String(event.id))}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function CreateSharedTeamModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const myProgram = profile?.team_program ?? "";
  const myNumber = profile?.team_number ?? "";
  const hasMyTeam = !!(myProgram && myNumber);

  const [name, setName] = useState("");
  const [override, setOverride] = useState(!hasMyTeam); // no My Team ⇒ show fields
  const [program, setProgram] = useState(myProgram);
  const [teamNumber, setTeamNumber] = useState(myNumber);
  const [saving, setSaving] = useState(false);

  // When not overriding, the shared team inherits My Team's identity.
  const effProgram = override ? program : myProgram;
  const effNumber = override ? teamNumber : myNumber;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const id = await createSharedTeam(name.trim(), effProgram || null, effNumber.trim() || null);
      navigate(`/my-team/${id}#settings`);
    } finally { setSaving(false); onClose(); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create a shared team</DialogTitle></DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="st-name-input">Name</FieldLabel>
            <Input id="st-name-input" value={name} autoFocus
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              placeholder="e.g. 169W Scouting"
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }} />
          </Field>

          {hasMyTeam && !override && (
            <div className="shared-team-identity-summary">
              <span>Scouting for: {programLabel(myProgram)} {myNumber}</span>
              <label className="shared-team-override-toggle">
                <Checkbox checked={override}
                  onCheckedChange={(v) => setOverride(v === true)} />
                This shared team scouts for a different team
              </label>
            </div>
          )}

          {override && (
            <>
              {hasMyTeam && (
                <label className="shared-team-override-toggle">
                  <Checkbox checked={override}
                    onCheckedChange={(v) => setOverride(v === true)} />
                  This shared team scouts for a different team
                </label>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="st-program-select">Program</FieldLabel>
                  <Select value={program || "none"}
                    onValueChange={(v) => setProgram(v === "none" ? "" : v)}>
                    <SelectTrigger id="st-program-select" className="w-full">
                      <SelectValue placeholder="Any / none" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any / none</SelectItem>
                      {AUTH_PROGRAMS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="st-team-input">Team #</FieldLabel>
                  <Input id="st-team-input" value={teamNumber}
                    onChange={(e) => setTeamNumber(e.target.value.slice(0, 10))}
                    placeholder="e.g. 169W" />
                </Field>
              </div>
            </>
          )}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void handleCreate()} disabled={!name.trim() || saving}>
            {saving ? "Creating…" : "Create shared team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SharedTeamPanel() {
  const { user } = useAuth();
  const sharedTeams = useSharedTeams();
  const ready = useSharedTeamsReady();
  const [createOpen, setCreateOpen] = useState(false);

  if (!user) return null; // signed-out: hide entirely

  if (!ready) {
    return (
      <Panel title="Shared Team" icon={<Users size={15} />}>
        <div className="home-fav-empty">Loading…</div>
      </Panel>
    );
  }

  if (sharedTeams.length === 0) {
    return (
      <>
        <Panel title="Shared Team" icon={<Users size={15} />}>
          <div className="shared-team-panel-empty">
            <p>Collaborate with your scouting team.</p>
            <Button variant="outline" size="sm" className="self-start" onClick={() => setCreateOpen(true)}>
              Create a shared team
            </Button>
            <p className="shared-team-panel-hint">Or ask your coach for an invite link.</p>
          </div>
        </Panel>
        {createOpen && <CreateSharedTeamModal onClose={() => setCreateOpen(false)} />}
      </>
    );
  }

  return (
    <>
      {sharedTeams.map((team) => (
        <Panel
          key={team.sharedTeamId}
          title={team.name}
          icon={<Users size={15} />}
          action={<Link href={`/my-team/${team.sharedTeamId}#settings`}>Manage</Link>}
        >
          <SharedTeamFavoritesList sharedTeamId={team.sharedTeamId} />
        </Panel>
      ))}
    </>
  );
}

// ── Join Shared Team Page (/join/:token) ──────────────────────────────────────

function JoinSharedTeamPage({ token }: { token: string }) {
  const { user } = useAuth();
  type PeekResult = { valid: boolean; shared_team_id?: string; shared_team_name?: string; member_count?: number };
  const peek = useAsync<PeekResult | null>(async () => {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("peek_invite", { p_invite_id: token });
    if (error) return { valid: false };
    return data as PeekResult;
  }, [token]);

  const [joining, setJoining] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; alreadyMember?: boolean; error?: string } | null>(null);

  const handleJoin = async () => {
    if (!supabase) return;
    setJoining(true);
    try {
      const { data, error } = await supabase.rpc("join_shared_team_by_invite", { p_invite_id: token });
      if (error) {
        setResult({ error: "Something went wrong. Please try again." });
        return;
      }
      const res = data as { ok?: boolean; already_member?: boolean; error?: string };
      if (res.error === "invite_invalid") setResult({ error: "This invite link has expired or already been used." });
      else if (res.error === "shared_team_full") setResult({ error: "This shared team is full (20 members max)." });
      else {
        await reloadSharedTeams();
        setResult({ ok: true, alreadyMember: res.already_member });
        setTimeout(() => navigate("/"), 1200);
      }
    } finally {
      setJoining(false);
    }
  };

  const signInForJoin = async (provider: "discord" | "google") => {
    if (!supabase) return;
    // Redirect back to this exact join URL so the user lands here after OAuth
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.href },
    });
  };

  const info = peek.data;

  return (
    <section className="page join-shared-team-page">
      <div className="join-shared-team-card">
        <Users size={36} color="var(--accent)" />
        {peek.loading && <p className="join-shared-team-meta">Loading…</p>}
        {!peek.loading && (!info || !info.valid) && (
          <p className="join-shared-team-error">This invite link has expired or is no longer valid.</p>
        )}
        {!peek.loading && info?.valid && (
          <>
            <h2>Join {info.shared_team_name}</h2>
            <p className="join-shared-team-meta">{info.member_count ?? 0} member{info.member_count !== 1 ? "s" : ""}</p>
            {result?.ok && (
              <p className="join-shared-team-success">
                {result.alreadyMember ? "You're already a member!" : `Welcome to ${info.shared_team_name}!`} Redirecting…
              </p>
            )}
            {result?.error && <p className="join-shared-team-error">{result.error}</p>}
            {!result?.ok && !user && (
              <>
                <p className="join-shared-team-meta">Sign in to join this shared team.</p>
                <div className="auth-buttons" style={{ width: "100%", marginTop: 8 }}>
                  <span className="auth-recommended">Recommended</span>
                  <button type="button" className="auth-btn auth-btn-discord" onClick={() => void signInForJoin("discord")}>
                    <LogIn size={16} />
                    Sign in with Discord
                  </button>
                  <button type="button" className="auth-btn auth-btn-google" onClick={() => void signInForJoin("google")}>
                    <LogIn size={16} />
                    Sign in with Google
                  </button>
                </div>
              </>
            )}
            {!result?.ok && user && (
              <Button
                className="mt-2"
                onClick={() => void handleJoin()}
                disabled={joining}
              >
                {joining ? "Joining…" : `Join ${info.shared_team_name}`}
              </Button>
            )}
          </>
        )}
        <a href="/" className="join-shared-team-back" onClick={(e) => { e.preventDefault(); navigate("/"); }}>← Back to home</a>
      </div>
    </section>
  );
}

// ── Shared Team Settings Page (/shared-team/:id/settings) ─────────────────────

function SharedTeamMemberAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || "?").charAt(0).toUpperCase();
  if (avatarUrl && !failed) {
    return (
      <img
        className="shared-team-member-avatar"
        src={avatarUrl}
        width={28}
        height={28}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className="shared-team-member-avatar">{initial}</span>;
}

function SharedTeamOverviewTab({ sharedTeamId, team }: { sharedTeamId: string; team: SharedTeamMembership | undefined }) {
  const [name, setName] = useState(team?.name ?? "");
  const [program, setProgram] = useState(team?.teamProgram ?? "");
  const [teamNumber, setTeamNumber] = useState(team?.teamNumber ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Sync local fields if the shared team loads after mount
  useEffect(() => {
    if (team) {
      setName(team.name);
      setProgram(team.teamProgram ?? "");
      setTeamNumber(team.teamNumber ?? "");
    }
  }, [team?.sharedTeamId]);

  const handleSave = async () => {
    setSaving(true);
    await updateSharedTeam(sharedTeamId, { name, teamProgram: program || null, teamNumber: teamNumber.trim() || null });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLeaveOrDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    if (team?.role === "owner") {
      await deleteSharedTeam(sharedTeamId);
    } else {
      await leaveSharedTeam(sharedTeamId);
    }
    navigate("/");
  };

  if (!team) return <p className="join-shared-team-meta">Shared Team not found or you are not a member.</p>;

  return (
    <div className="shared-team-settings-form">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="os-name">Name</FieldLabel>
          <Input
            id="os-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            maxLength={40}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="os-program">Program</FieldLabel>
            <Select value={program || "none"} onValueChange={(v) => setProgram(v === "none" ? "" : v)}>
              <SelectTrigger id="os-program" className="w-full">
                <SelectValue placeholder="Any / none" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any / none</SelectItem>
                {AUTH_PROGRAMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="os-team">Team #</FieldLabel>
            <Input
              id="os-team"
              type="text"
              value={teamNumber}
              onChange={(e) => setTeamNumber(e.target.value.slice(0, 10))}
              placeholder="e.g. 169W"
            />
          </Field>
        </div>
      </FieldGroup>
      <Button
        className={`self-start${confirmClass(saved, "success")}`}
        onClick={() => void handleSave()}
        disabled={saving || !name.trim()}
      >
        <IconMorph morphed={saved} size={14} tone="success">
          <Save size={14} />
        </IconMorph>
        {saved ? "Saved!" : saving ? "Saving…" : "Save changes"}
      </Button>

      <div className="danger-zone">
        <h3>{team.role === "owner" ? "Delete shared team" : "Leave shared team"}</h3>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-muted)" }}>
          {team.role === "owner"
            ? "Permanently deletes the shared team and all shared data. This cannot be undone."
            : "You will lose access to this shared team's shared favorites and notes."}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="destructive" onClick={() => void handleLeaveOrDelete()}>
            {confirming
              ? (team.role === "owner" ? "Confirm delete" : "Confirm leave")
              : (team.role === "owner" ? "Delete shared team" : "Leave shared team")}
          </Button>
          {confirming && (
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SharedTeamMembersTab({ sharedTeamId, team }: { sharedTeamId: string; team: SharedTeamMembership | undefined }) {
  const { user } = useAuth();
  const [members, setMembers] = useState<SharedTeamMember[] | null>(null);
  const [loading, setLoading] = useState(true);
  const canManage = team?.role === "owner" || team?.role === "admin";

  const reload = useCallback(async () => {
    setLoading(true);
    const data = await getSharedTeamMembers(sharedTeamId);
    setMembers(data);
    setLoading(false);
  }, [sharedTeamId]);

  useEffect(() => { void reload(); }, [reload]);

  const handleRemove = async (memberId: string) => {
    await removeMember(sharedTeamId, memberId);
    void reload();
  };

  const handleRoleChange = async (memberId: string, newRole: SharedTeamRole) => {
    await updateMemberRole(sharedTeamId, memberId, newRole);
    void reload();
  };

  if (loading) return <p className="join-shared-team-meta">Loading members…</p>;

  return (
    <div className="shared-team-member-list">
      {(members ?? []).map((m) => (
        <div key={m.userId} className="shared-team-member-item">
          <SharedTeamMemberAvatar name={m.displayName} avatarUrl={m.avatarUrl} />
          <span className="shared-team-member-name">{m.displayName}</span>
          <span className={`shared-team-role-badge ${m.role}`}>{m.role}</span>
          {canManage && m.userId !== user?.id && (
            <>
              {team?.role === "owner" && (
                <Select value={m.role} onValueChange={(v) => void handleRoleChange(m.userId, v as SharedTeamRole)}>
                  <SelectTrigger size="sm" className="w-[108px]" aria-label={`Change role for ${m.displayName}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">admin</SelectItem>
                    <SelectItem value="member">member</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void handleRemove(m.userId)}
                title={`Remove ${m.displayName}`}
                aria-label={`Remove ${m.displayName}`}
              >
                <UserMinus size={13} />
              </Button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// Format a Date as a local yyyy-mm-dd string for <input type="date">.
function toDateInputValue(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const INVITE_USE_OPTIONS = ["1", "2", "3", "4", "5", "10", "unlimited"] as const;

function SharedTeamInvitesTab({ sharedTeamId }: { sharedTeamId: string }) {
  const [invites, setInvites] = useState<SharedTeamInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [maxUsesValue, setMaxUsesValue] = useState<string>("1");
  const [noExpiry, setNoExpiry] = useState(false);
  const [expiryDate, setExpiryDate] = useState<string>(() =>
    toDateInputValue(new Date(Date.now() + 7 * 86400000)),
  );

  const todayInputValue = toDateInputValue(new Date());

  useEffect(() => {
    getSharedTeamInvites(sharedTeamId).then((data) => { setInvites(data); setLoading(false); });
  }, [sharedTeamId]);

  const handleGenerate = async () => {
    setGenerating(true);
    const maxUses = maxUsesValue === "unlimited" ? null : Number(maxUsesValue);
    // Expire at the end of the chosen day (local), so "expires Jun 30" stays
    // valid through all of Jun 30.
    const expiresAt = noExpiry ? null : new Date(`${expiryDate}T23:59:59`).toISOString();
    const invite = await generateInvite(sharedTeamId, { maxUses, expiresAt });
    setInvites((prev) => [invite, ...prev]);
    setGenerating(false);
  };

  const handleRevoke = async (inviteId: string) => {
    await revokeInvite(inviteId);
    setInvites((prev) => prev.filter((i) => i.id !== inviteId));
  };

  const handleCopy = async (inviteId: string) => {
    const url = `${window.location.origin}/join/${inviteId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for browsers/contexts where Clipboard API is unavailable
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand("copy"); } catch { /* best-effort */ }
      document.body.removeChild(ta);
    }
    setCopied(inviteId);
    setTimeout(() => setCopied((c) => (c === inviteId ? null : c)), 2000);
  };

  const formatExpiry = (iso: string | null) =>
    iso
      ? `Expires ${new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : "No expiration";

  const formatUses = (invite: SharedTeamInvite) =>
    invite.maxUses === null
      ? `${invite.useCount} joined · unlimited`
      : `${invite.useCount} / ${invite.maxUses} used`;

  if (loading) return <p className="join-shared-team-meta">Loading…</p>;

  return (
    <div>
      <div className="shared-team-invite-form">
        <label className="shared-team-invite-field">
          <span className="shared-team-invite-field-label">Uses</span>
          <Select value={maxUsesValue} onValueChange={setMaxUsesValue}>
            <SelectTrigger size="sm" className="w-[120px]" aria-label="Number of uses">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INVITE_USE_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt === "unlimited" ? "Unlimited" : `${opt} use${opt === "1" ? "" : "s"}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="shared-team-invite-field">
          <span className="shared-team-invite-field-label">Expires</span>
          <Input
            type="date"
            className="w-[150px]"
            value={expiryDate}
            min={todayInputValue}
            disabled={noExpiry}
            onChange={(e) => setExpiryDate(e.target.value)}
            aria-label="Expiration date"
          />
        </label>
        <label className="shared-team-invite-noexpiry">
          <Checkbox
            checked={noExpiry}
            onCheckedChange={(v) => setNoExpiry(v === true)}
            aria-label="No expiration"
          />
          <span>No expiration</span>
        </label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleGenerate()}
          disabled={generating || (!noExpiry && !expiryDate)}
        >
          <Link2 data-icon="inline-start" />
          {generating ? "Generating…" : "Generate invite link"}
        </Button>
      </div>
      {invites.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No active invite links.</p>
      )}
      <div className="shared-team-invite-list">
        {invites.map((invite) => {
          const url = `${window.location.origin}/join/${invite.id}`;
          return (
            <div key={invite.id} className="shared-team-invite-item">
              <Input
                type="text"
                className="shared-team-invite-link-input flex-1"
                value={url}
                readOnly
                title={url}
              />
              <Button
                variant="ghost"
                size="icon"
                className={`shrink-0${confirmClass(copied === invite.id, "success")}`}
                onClick={() => void handleCopy(invite.id)}
                title="Copy link"
                aria-label="Copy invite link"
              >
                <IconMorph morphed={copied === invite.id} size={13} tone="success">
                  <LinkIcon size={13} />
                </IconMorph>
              </Button>
              <span className="shared-team-invite-expiry">{formatUses(invite)}</span>
              <span className="shared-team-invite-expiry">{formatExpiry(invite.expiresAt)}</span>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-destructive hover:text-destructive"
                onClick={() => void handleRevoke(invite.id)}
                title="Revoke"
                aria-label="Revoke invite"
              >
                <Unlink size={13} />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Shared Team Workspace (embedded in /my-team/:id) ──────────────────────────

const SHARED_TEAM_WORKSPACE_TABS = ["dashboard", "favorites", "notes", "picklists", "activity", "export", "settings"] as const;
type SharedTeamWorkspaceTab = typeof SHARED_TEAM_WORKSPACE_TABS[number];
const SHARED_TEAM_WORKSPACE_NAV: Array<{ value: SharedTeamWorkspaceTab; label: string; icon: ReactNode }> = [
  { value: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={15} /> },
  { value: "favorites", label: "Favorites", icon: <Star size={15} /> },
  { value: "notes",     label: "Notes",     icon: <StickyNote size={15} /> },
  { value: "picklists", label: "Picklists", icon: <ListOrdered size={15} /> },
  { value: "activity",  label: "Activity",  icon: <Activity size={15} /> },
  { value: "export",    label: "Export",    icon: <Download size={15} /> },
  { value: "settings",  label: "Settings",  icon: <Settings size={15} /> },
];

function sharedTeamSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "shared-team";
}

function activityVerb(item: ActivityItem): string {
  switch (item.kind) {
    case "note": return "added a note";
    case "picklist": return item.teamNumber ? `ranked ${item.teamNumber} in a picklist` : "updated a picklist";
    case "favorite": return item.refKind === "event" ? "favorited an event" : "favorited a team";
  }
}

function SharedTeamActivityRow({ item, eventName }: { item: ActivityItem; eventName: string | null }) {
  const initial = (item.userName || "?").charAt(0).toUpperCase();
  const when = formatRelativeTime(new Date(item.ts).getTime());
  const eventLabel = item.eventId ? (eventName ?? `Event ${item.eventId}`) : null;
  const href = item.eventId ? urlWithHash(`/event/${item.eventId}`, item.kind === "picklist" ? "picklist" : "matches") : null;
  const body = (
    <>
      <span className="shared-team-member-avatar" aria-hidden>{initial}</span>
      <span className="shared-team-activity-text">
        <strong>{item.userName}</strong> {activityVerb(item)}
        {eventLabel && <> · <span className="shared-team-activity-event">{eventLabel}</span></>}
      </span>
      <span className="shared-team-activity-time">{when}</span>
    </>
  );
  return href
    ? <Link href={href} className="shared-team-activity-row">{body}</Link>
    : <div className="shared-team-activity-row">{body}</div>;
}

function SharedTeamFavoritesTab({ sharedTeamId }: { sharedTeamId: string }) {
  return (
    <div className="shared-team-ws-section">
      <div className="shared-team-ws-block">
        <div className="shared-team-ws-block-head">
          <h3>Shared favorites</h3>
        </div>
        <SharedTeamFavoritesList sharedTeamId={sharedTeamId} />
      </div>
    </div>
  );
}

function SharedTeamDashboardTab({ sharedTeamId, onNavigate }: { sharedTeamId: string; onNavigate: (tab: SharedTeamWorkspaceTab) => void }) {
  const favs = useSharedTeamFavorites(sharedTeamId);
  const notes = useSharedTeamNotesList(sharedTeamId);
  const picks = useSharedTeamPicklistEvents(sharedTeamId);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getSharedTeamMembers(sharedTeamId).then((m) => { if (!cancelled) setMemberCount(m.length); });
    void loadSharedTeamActivity(sharedTeamId, 5).then((a) => { if (!cancelled) setActivity(a); });
    return () => { cancelled = true; };
  }, [sharedTeamId]);

  const names = useEventNames((activity ?? []).map((a) => a.eventId));
  const nameOf = (id: string | null) => { const ev = id ? names.get(id) : null; return ev?.name ?? null; };
  const favCount = favs.teams.length + favs.events.length;

  const tiles: Array<{ label: string; value: number | string; icon: ReactNode; tab?: SharedTeamWorkspaceTab }> = [
    { label: "Notes",            value: notes.length,                            icon: <StickyNote size={16} />,  tab: "notes" },
    { label: "Active picklists", value: picks.loading ? "…" : picks.data.length, icon: <ListOrdered size={16} />, tab: "picklists" },
    { label: "Shared favorites", value: favCount,                                icon: <Star size={16} />,       tab: "favorites" },
    { label: "Members",          value: memberCount ?? "…",                      icon: <Users size={16} />,       tab: "settings" },
  ];

  return (
    <div className="shared-team-ws-section">
      <div className="shared-team-ws-stats">
        {tiles.map((t) => {
          const inner = (
            <>
              <span className="shared-team-ws-stat-top">{t.icon}<span className="shared-team-ws-stat-value">{t.value}</span></span>
              <span className="shared-team-ws-stat-label">{t.label}</span>
            </>
          );
          return t.tab
            ? <button key={t.label} type="button" className="shared-team-ws-stat shared-team-ws-stat--btn" onClick={() => onNavigate(t.tab as SharedTeamWorkspaceTab)}>{inner}</button>
            : <div key={t.label} className="shared-team-ws-stat">{inner}</div>;
        })}
      </div>

      <div className="shared-team-ws-block">
        <div className="shared-team-ws-block-head">
          <h3>Recent activity</h3>
          <button type="button" className="panel-action-link" onClick={() => onNavigate("activity")}>View all</button>
        </div>
        <LoadingSwap loading={activity === null} skeleton={<Skeleton className="h-24 w-full" />}>
          {activity !== null && activity.length === 0 ? (
            <p className="shared-team-ws-empty">No shared activity yet.</p>
          ) : (
            <div className="shared-team-activity-list">{(activity ?? []).map((a, i) => <SharedTeamActivityRow key={i} item={a} eventName={nameOf(a.eventId)} />)}</div>
          )}
        </LoadingSwap>
      </div>
    </div>
  );
}

function SharedTeamNotesHubTab({ sharedTeamId }: { sharedTeamId: string }) {
  const notes = useSharedTeamNotesList(sharedTeamId);
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const names = useEventNames(notes.map((n) => n.eventId));
  const nameOf = (id: string | null) => { const ev = id ? names.get(id) : null; return ev?.name ?? (id ? `Event ${id}` : "No event"); };

  const eventOptions = useMemo(
    () => Array.from(new Set(notes.map((n) => n.eventId ?? "none"))),
    [notes],
  );

  const filtered = notes.filter((n) => {
    if (eventFilter !== "all" && (n.eventId ?? "none") !== eventFilter) return false;
    const q = query.trim().toLowerCase();
    if (q && !n.body.toLowerCase().includes(q) && !nameOf(n.eventId).toLowerCase().includes(q)) return false;
    return true;
  });

  const groups = useMemo(() => {
    const m = new Map<string, SharedTeamNoteListItem[]>();
    for (const n of filtered) {
      const k = n.eventId ?? "none";
      const arr = m.get(k) ?? []; arr.push(n); m.set(k, arr);
    }
    return [...m.entries()];
  }, [filtered]);

  if (notes.length === 0) {
    return <p className="shared-team-ws-empty">No shared notes yet. Add a note from any match's note button and switch it to your shared team to share it here.</p>;
  }

  return (
    <div className="shared-team-ws-section">
      <div className="shared-team-ws-toolbar">
        <Input placeholder="Search notes…" value={query} onChange={(e) => setQuery(e.target.value)} className="shared-team-ws-search" />
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {eventOptions.map((id) => (
              <SelectItem key={id} value={id}>{id === "none" ? "No event" : nameOf(id)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {groups.length === 0
        ? <p className="shared-team-ws-empty">No notes match your search.</p>
        : groups.map(([eid, items]) => (
          <div key={eid} className="shared-team-notes-group">
            <div className="shared-team-notes-group-head">
              <span className="shared-team-notes-group-name">{eid === "none" ? "No event" : nameOf(eid)}</span>
              <span className="shared-team-ws-badge">{items.length}</span>
            </div>
            {items.map((n) => {
              // Carry the match id in the query string (hash is reserved for the
              // tab selector) so the event page can scroll to + flash that row.
              const href = n.eventId
                ? `/event/${n.eventId}?match=${encodeURIComponent(n.matchId)}#matches`
                : null;
              const inner = <span className="shared-team-note-body">{n.body}</span>;
              return href
                ? <Link key={n.matchId} href={href} className="shared-team-note-row">{inner}<ChevronRight size={14} className="shared-team-note-go" /></Link>
                : <div key={n.matchId} className="shared-team-note-row">{inner}</div>;
            })}
          </div>
        ))}
    </div>
  );
}

function SharedTeamPicklistRow({ summary, eventName, eventSku }: { summary: SharedTeamPicklistSummary; eventName: string | null; eventSku: string | null }) {
  const name = eventName ?? `Event ${summary.eventId}`;
  const href = urlWithHash(`/event/${eventSku || summary.eventId}`, "picklist");
  return (
    <Link href={href} className="shared-team-picklist-card">
      <div className="shared-team-picklist-card-head">
        <span className="shared-team-picklist-name">{name}</span>
        <span className="shared-team-ws-badge">{summary.teamCount} team{summary.teamCount !== 1 ? "s" : ""}</span>
      </div>
      <div className="shared-team-picklist-preview">
        {summary.topTeams.map((t, i) => (
          <span key={t.teamNumber} className="shared-team-picklist-team"><span className="shared-team-picklist-rank">{i + 1}</span>{t.teamNumber}</span>
        ))}
        {summary.teamCount > summary.topTeams.length && (
          <span className="shared-team-picklist-more">+{summary.teamCount - summary.topTeams.length} more</span>
        )}
      </div>
    </Link>
  );
}

function SharedTeamPicklistsTab({ sharedTeamId }: { sharedTeamId: string }) {
  const { data, loading } = useSharedTeamPicklistEvents(sharedTeamId);
  const names = useEventNames(data.map((d) => d.eventId));
  return (
    <LoadingSwap loading={loading} skeleton={<Skeleton className="h-28 w-full" />}>
      {data.length === 0 ? (
        <p className="shared-team-ws-empty">No picklists yet. Build one from an event's Picklist tab and it will show up here.</p>
      ) : (
        <div className="shared-team-picklist-grid">
          {data.map((s) => {
            const ev = names.get(s.eventId);
            return <SharedTeamPicklistRow key={s.eventId} summary={s} eventName={ev?.name ?? null} eventSku={ev?.sku ?? null} />;
          })}
        </div>
      )}
    </LoadingSwap>
  );
}

function SharedTeamActivityTab({ sharedTeamId }: { sharedTeamId: string }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadSharedTeamActivity(sharedTeamId, 60).then((a) => { if (!cancelled) setItems(a); });
    return () => { cancelled = true; };
  }, [sharedTeamId]);
  const names = useEventNames((items ?? []).map((a) => a.eventId));
  const nameOf = (id: string | null) => { const ev = id ? names.get(id) : null; return ev?.name ?? null; };
  return (
    <LoadingSwap loading={items === null} skeleton={<Skeleton className="h-40 w-full" />}>
      {items !== null && items.length === 0 ? (
        <p className="shared-team-ws-empty">No shared activity yet.</p>
      ) : (
        <div className="shared-team-activity-list">{(items ?? []).map((a, i) => <SharedTeamActivityRow key={i} item={a} eventName={nameOf(a.eventId)} />)}</div>
      )}
    </LoadingSwap>
  );
}

function SharedTeamExportTab({ sharedTeamId, sharedTeamName }: { sharedTeamId: string; sharedTeamName: string }) {
  const notes = useSharedTeamNotesList(sharedTeamId);
  const [picklists, setPicklists] = useState<Array<{ eventId: string; entries: PicklistEntry[] }> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadSharedTeamPicklistEntries(sharedTeamId).then((p) => { if (!cancelled) setPicklists(p); });
    return () => { cancelled = true; };
  }, [sharedTeamId]);

  const eventIds = [...new Set([...notes.map((n) => n.eventId), ...(picklists ?? []).map((p) => p.eventId)])];
  const names = useEventNames(eventIds);
  const nameOf = (id: string | null) => { const ev = id ? names.get(id) : null; return ev?.name ?? (id ? `Event ${id}` : "No event"); };

  const downloadCsv = (filename: string, rows: (string | number)[][]) => {
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPicklists = () => {
    const rows: (string | number)[][] = [["Event", "Rank", "Team #", "Team Name", "Crossed Out", "Notes"]];
    for (const p of picklists ?? []) {
      p.entries.forEach((e, i) => rows.push([nameOf(p.eventId), i + 1, e.teamNumber, e.teamName ?? "", e.crossedOut ? "yes" : "", e.notes]));
    }
    downloadCsv(`${sharedTeamSlug(sharedTeamName)}-picklists.csv`, rows);
  };

  const exportNotes = () => {
    const rows: (string | number)[][] = [["Event", "Match ID", "Note", "Updated"]];
    for (const n of notes) rows.push([nameOf(n.eventId), n.matchId, n.body, n.updatedAt]);
    downloadCsv(`${sharedTeamSlug(sharedTeamName)}-notes.csv`, rows);
  };

  const hasPicklists = (picklists ?? []).some((p) => p.entries.length > 0);

  return (
    <div className="shared-team-ws-section">
      <p className="shared-team-ws-help">Download your shared team's shared data as CSV, or print a clean copy for the competition table.</p>
      <div className="shared-team-ws-export-actions">
        <Button variant="outline" onClick={exportPicklists} disabled={!hasPicklists}>
          <Download data-icon="inline-start" />Picklists CSV
        </Button>
        <Button variant="outline" onClick={exportNotes} disabled={notes.length === 0}>
          <Download data-icon="inline-start" />Notes CSV
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer data-icon="inline-start" />Print / Save PDF
        </Button>
      </div>

      {/* Print-only formatted view — hidden on screen, isolated for print */}
      <div className="shared-team-print-root">
        <h1>{sharedTeamName}</h1>
        <section className="shared-team-print-section">
          <h2>Picklists</h2>
          {!hasPicklists ? <p>No picklists.</p> : (picklists ?? []).filter((p) => p.entries.length > 0).map((p) => (
            <div key={p.eventId} className="shared-team-print-block">
              <h3>{nameOf(p.eventId)}</h3>
              <ol>
                {p.entries.map((e) => (
                  <li key={e.teamId} style={{ textDecoration: e.crossedOut ? "line-through" : "none" }}>
                    {e.teamNumber}{e.teamName ? ` — ${e.teamName}` : ""}{e.notes ? ` — ${e.notes}` : ""}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
        <section className="shared-team-print-section">
          <h2>Notes</h2>
          {notes.length === 0 ? <p>No notes.</p> : notes.map((n) => (
            <div key={n.matchId} className="shared-team-print-note">
              <strong>{nameOf(n.eventId)}</strong>
              <p>{n.body}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function SharedTeamSettingsSection({ sharedTeamId, team }: { sharedTeamId: string; team: SharedTeamMembership | undefined }) {
  return (
    <div className="shared-team-ws-section">
      <SharedTeamOverviewTab sharedTeamId={sharedTeamId} team={team} />
      <div className="shared-team-ws-subsection">
        <h3 className="shared-team-ws-subhead">Members</h3>
        <SharedTeamMembersTab sharedTeamId={sharedTeamId} team={team} />
      </div>
      <div className="shared-team-ws-subsection">
        <h3 className="shared-team-ws-subhead">Invites</h3>
        <SharedTeamInvitesTab sharedTeamId={sharedTeamId} />
      </div>
    </div>
  );
}

function SharedTeamWorkspace({ sharedTeamId }: { sharedTeamId: string }) {
  const team = useSharedTeam(sharedTeamId);
  const ready = useSharedTeamsReady();
  const { user } = useAuth();
  const [tab, setTab] = useState<SharedTeamWorkspaceTab>(() => hashTab(SHARED_TEAM_WORKSPACE_TABS, "dashboard"));

  useEffect(() => {
    const handler = () => setTab(hashTab(SHARED_TEAM_WORKSPACE_TABS, "dashboard"));
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  useEffect(() => { replaceCurrentHash(tab); }, [tab]);

  useEffect(() => {
    if (team?.name) refreshTrailLabel(window.location.pathname, team.name);
  }, [team?.name]);

  if (!user) {
    return <div className="myteam-state"><p style={{ color: "var(--text-muted)" }}>Sign in to view this shared team.</p></div>;
  }

  if (ready && !team) {
    return <div className="myteam-state"><p style={{ color: "var(--text-muted)" }}>Shared Team not found or you are not a member.</p></div>;
  }

  return (
    <div className="settings-layout">
        <nav className="settings-tabs" aria-label="Shared team sections">
          {SHARED_TEAM_WORKSPACE_NAV.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`settings-tab ${tab === t.value ? "active" : ""}`}
              onClick={() => setTab(t.value)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {tab === "dashboard" && <SharedTeamDashboardTab sharedTeamId={sharedTeamId} onNavigate={setTab} />}
          {tab === "favorites" && <SharedTeamFavoritesTab sharedTeamId={sharedTeamId} />}
          {tab === "notes"     && <SharedTeamNotesHubTab sharedTeamId={sharedTeamId} />}
          {tab === "picklists" && <SharedTeamPicklistsTab sharedTeamId={sharedTeamId} />}
          {tab === "activity"  && <SharedTeamActivityTab sharedTeamId={sharedTeamId} />}
          {tab === "export"    && <SharedTeamExportTab sharedTeamId={sharedTeamId} sharedTeamName={team?.name ?? "Shared Team"} />}
          {tab === "settings"  && <SharedTeamSettingsSection sharedTeamId={sharedTeamId} team={team} />}
        </div>
      </div>
  );
}

// ── Recently Viewed Panel (home sidebar) ────────────────────────────────────

function RecentlyViewedPanel() {
  const recent = useRecentlyViewed();
  if (recent.length === 0) return null;
  return (
    <Panel
      title="Recent"
      icon={<Clock size={15} />}
      collapsible
      storageKey="vex-panel-recent-collapsed"
      defaultCollapsed
      action={
        <button
          type="button"
          className="panel-action-link"
          onClick={clearRecentlyViewed}
        >
          Clear
        </button>
      }
    >
      <div className="home-fav-list">
        {recent.slice(0, 8).map((r) => (
          <Link key={r.path} href={r.path} className="home-fav-item">
            <span className="home-fav-badge">{r.badge}</span>
            <span className="home-fav-text">
              <span className="home-fav-title">{r.label}</span>
              <span className="home-fav-sub">{r.sub}</span>
            </span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

// ── Command Palette (Spotlight) ──────────────────────────────────────────────

type SpotlightItem =
  | { kind: "recent"; entry: RecentEntry }
  | { kind: "team";   team: Team }
  | { kind: "event";  event: Event }
  | { kind: "action"; label: string; sub: string; path: string; icon: ReactNode };

const SPOTLIGHT_ACTIONS: Array<{ label: string; sub: string; path: string; icon: ReactNode }> = [
  { label: "Home",     sub: "",                  path: "/",         icon: <Shield size={13} /> },
  { label: "Events",   sub: "Browse events",     path: "/events",   icon: <CalendarDays size={13} /> },
  { label: "Teams",    sub: "Search teams",      path: "/teams",    icon: <Users size={13} /> },
  { label: "Settings", sub: "Account & display", path: "/settings", icon: <Settings size={13} /> },
];

function SpotlightRow({
  item,
  active,
  onMouseEnter,
  onClick,
}: {
  item: SpotlightItem;
  active: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  const cls = `spotlight-item${active ? " active" : ""}`;

  if (item.kind === "team") {
    const t = item.team;
    return (
      <button type="button" className={cls} onMouseEnter={onMouseEnter} onClick={onClick}>
        <span className="spotlight-badge">{programSlug(t.program) || t.program?.code || "VEX"}</span>
        <span className="spotlight-item-text">
          <span className="spotlight-item-line">
            <span className="spotlight-item-main">
              {t.number}
              {t.team_name ? <> · <TranslatedText text={t.team_name} country={t.location?.country} /></> : ""}
            </span>
            {t.grade && (
              <span className="gs-result-tags">
                <span className={`event-grade-badge grade-${gradeCode(t.grade)}`}>{gradeCode(t.grade)}</span>
              </span>
            )}
          </span>
          <span className="spotlight-item-sub">{locationLine(t)}</span>
        </span>
        <span className="spotlight-item-enter">↵</span>
      </button>
    );
  }

  if (item.kind === "recent") {
    const r = item.entry;
    return (
      <button type="button" className={cls} onMouseEnter={onMouseEnter} onClick={onClick}>
        <span className="spotlight-badge">{r.badge}</span>
        <span className="spotlight-item-text">
          <span className="spotlight-item-main">{r.label}</span>
          <span className="spotlight-item-sub">{r.sub}</span>
        </span>
        <span className="spotlight-item-enter">↵</span>
      </button>
    );
  }

  if (item.kind === "event") {
    const ev = item.event;
    const category = eventCategory(ev);
    // The left badge already names the season, so the date line only needs the
    // bold treatment to mark an event as not-this-season.
    const older = !!olderSeasonLabel(ev);
    return (
      <button type="button" className={cls} onMouseEnter={onMouseEnter} onClick={onClick}>
        <span className="spotlight-badge">{seasonYearLabel(ev.season?.name) ?? <CalendarDays size={11} />}</span>
        <span className="spotlight-item-text">
          <span className="spotlight-item-line">
            <TranslatedText className="spotlight-item-main" text={ev.name} country={ev.location?.country} />
            <span className="gs-result-tags">
              {category.label !== "Other" && (
                <span className={`event-priority priority-${category.rank}`}>{category.label}</span>
              )}
              <ProgramBadge program={ev.program} />
            </span>
          </span>
          <span className="spotlight-item-sub">
            <span className={`gs-result-date${older ? " is-older" : ""}`}>{formatEventDateRangeShort(ev.start, ev.end)}</span>
            <span className="gs-result-where">{locationLine(ev)}</span>
          </span>
        </span>
        <span className="spotlight-item-enter">↵</span>
      </button>
    );
  }

  // action
  return (
    <button type="button" className={cls} onMouseEnter={onMouseEnter} onClick={onClick}>
      <span className="spotlight-badge action">{item.icon}</span>
      <span className="spotlight-item-text">
        <span className="spotlight-item-main">{item.label}</span>
        {item.sub && <span className="spotlight-item-sub">{item.sub}</span>}
      </span>
      <span className="spotlight-item-enter">↵</span>
    </button>
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  // Match GlobalSearch's 220ms debounce — same perceived speed
  const debounced = useDebouncedValue(query.trim(), 220);
  const [teams, setTeams] = useState<Team[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  // True while we're fetching older seasons to fill up to 3 — results already visible but more may come
  const [searchingOlderSeasons, setSearchingOlderSeasons] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showAllRecents, setShowAllRecents] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recent = useRecentlyViewed();
  const trayEntries = useCompareTray();
  // See GlobalSearch: re-search once the profile's program/grade is known.
  const searchBias = useSearchBias();
  const scope = useSearchProgram();

  const RECENT_COLLAPSED_LIMIT = 4;
  const RECENT_MAX = 10;
  const visibleRecentCount = showAllRecents ? Math.min(RECENT_MAX, recent.length) : Math.min(RECENT_COLLAPSED_LIMIT, recent.length);
  const shouldCollapseRecents = !showAllRecents && recent.length > RECENT_COLLAPSED_LIMIT;

  // Pre-warm older season caches the moment the palette opens so fallback
  // fetches are already in flight (or done) by the time the user types.
  // The current season is already warm from GlobalSearch usage; these two aren't.
  useEffect(() => {
    void loadPrevSeasonEvents().catch(() => {});
    void loadOlderSeasonEvents().catch(() => {});
  }, []);

  // Mirror GlobalSearch exactly: fire both searches independently in parallel
  useEffect(() => {
    if (!debounced) {
      setTeams([]); setEvents([]);
      setTeamsLoading(false); setEventsLoading(false);
      setSearchingOlderSeasons(false);
      return;
    }

    let live = true;

    // Teams — same logic as GlobalSearch (VEX-first for full team numbers), capped at 3.
    const programIds = searchProgramIds(scope);
    const cachedTeams = rankTeamsForSearch(scopeTeamsToPrograms(allCachedTeams(), programIds), debounced);
    void runGlobalTeamSearch(debounced, 3, cachedTeams, () => live, setTeams, setTeamsLoading, programIds);

    // Events — 3 results, lazily falling back through older seasons:
    //   • Current season results appear immediately when the first fetch resolves.
    //   • If < 3, a subtle "Searching older seasons…" note appears while we fetch more.
    //   • Each older-season cache is loaded on demand and reused within the 5-min TTL.
    const SPOTLIGHT_EVENT_LIMIT = 3;
    const opts = { search: debounced, hideCanceled: true, sort: "smart" as const, programIds: SEARCH_PROGRAM_IDS[scope]?.map(String) };
    setEventsLoading(true);
    setSearchingOlderSeasons(false);

    const doEventSearch = async () => {
      const currentEvents = await loadGlobalEventSearchEvents();
      if (!live) return;

      const current = filterAndSortEvents(currentEvents, opts);
      // Surface whatever we have right now — don't wait for fallbacks
      setEvents(current.slice(0, SPOTLIGHT_EVENT_LIMIT));
      setEventsLoading(false);

      if (current.length >= SPOTLIGHT_EVENT_LIMIT) return;

      // Need older seasons — show the inline indicator while fetching
      setSearchingOlderSeasons(true);
      try {
        // Season 1 fallback
        const prev1 = await loadPrevSeasonEvents();
        if (!live) return;
        const after1 = [...current, ...filterAndSortEvents(prev1, opts)];
        setEvents(after1.slice(0, SPOTLIGHT_EVENT_LIMIT));
        if (after1.length >= SPOTLIGHT_EVENT_LIMIT) return;

        // Season 2 fallback
        const prev2 = await loadOlderSeasonEvents();
        if (!live) return;
        setEvents([...after1, ...filterAndSortEvents(prev2, opts)].slice(0, SPOTLIGHT_EVENT_LIMIT));
      } finally {
        if (live) setSearchingOlderSeasons(false);
      }
    };

    doEventSearch().catch(() => {
      if (live) { setEvents([]); setEventsLoading(false); setSearchingOlderSeasons(false); }
    });

    return () => { live = false; };
  }, [debounced, searchBias, scope]);

  // Reset active row when results change
  useEffect(() => { setActiveIndex(0); }, [debounced]);

  // Build flat items list for keyboard navigation
  const items = useMemo<SpotlightItem[]>(() => {
    // Dynamic "Open comparison" action injected when tray has ≥ 2 teams
    const compareAction: SpotlightItem | null = trayEntries.length >= 2
      ? { kind: "action", label: `Compare: ${trayEntries.map((e) => e.teamNumber).join(" · ")}`, sub: "Open comparison view", path: "__compare__", icon: <Scale size={13} /> }
      : null;

    if (!debounced) {
      return [
        ...(compareAction ? [compareAction] : []),
        ...recent.slice(0, visibleRecentCount).map((entry): SpotlightItem => ({ kind: "recent", entry })),
        ...SPOTLIGHT_ACTIONS.map((a): SpotlightItem => ({ kind: "action", ...a })),
      ];
    }
    const actionMatches = SPOTLIGHT_ACTIONS.filter((a) => a.label.toLowerCase().includes(debounced.toLowerCase())).slice(0, 2);
    // Mirror GlobalSearch: number-like queries lead with Teams, else Events first.
    const teamNumberLike = /^\d+[a-z]?$/i.test(debounced);
    const teamItems = teams.map((t): SpotlightItem => ({ kind: "team", team: t }));
    const eventItems = events.map((ev): SpotlightItem => ({ kind: "event", event: ev }));
    return [
      ...(teamNumberLike ? [...teamItems, ...eventItems] : [...eventItems, ...teamItems]),
      ...actionMatches.map((a): SpotlightItem => ({ kind: "action", ...a })),
    ];
  }, [debounced, teams, events, recent, trayEntries, visibleRecentCount]);

  const handleSelect = useCallback((item: SpotlightItem) => {
    if (item.kind === "action" && item.path === "__compare__") {
      openCompareModal(_currentEventSeasonId ?? undefined, _currentEventId ?? undefined);
      onClose();
      return;
    }
    const path =
      item.kind === "team"   ? teamPath(item.team) :
      item.kind === "event"  ? eventPath(item.event) :
      item.kind === "recent" ? item.entry.path :
      item.path;
    navigate(path);
    onClose();
  }, [onClose]);

  // Window-level keyboard handler
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, items.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter")     { e.preventDefault(); if (items[activeIndex]) handleSelect(items[activeIndex]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [items, activeIndex, onClose, handleSelect]);

  const loading = teamsLoading || eventsLoading;
  const showEmpty = !!debounced && !loading && !searchingOlderSeasons && items.length === 0;

  // Section labels for grouped display
  const hasRecent  = !debounced && recent.length > 0;
  const hasTeams   = !!debounced && teams.length > 0;
  const hasEvents  = !!debounced && events.length > 0;

  // Offset for event section label — appears after all team rows
  const eventOffset = teams.length;

  // Offsets for no-query keyboard navigation
  const cmpOffset = !debounced && trayEntries.length >= 2 ? 1 : 0;
  const recentOffset = cmpOffset;
  const actionOffset = cmpOffset + visibleRecentCount;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="top-[14vh] translate-y-0 w-[min(580px,100%)] max-w-[580px] sm:max-w-[580px] gap-0 border-0 bg-transparent p-0 shadow-none"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="spotlight-modal">

        {/* Input */}
        <div className="spotlight-input-row">
          <Search size={17} className="spotlight-icon" />
          <input
            ref={inputRef}
            autoFocus
            className="spotlight-input"
            placeholder="Search teams, events, or go to…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search"
          />
          {query && (
            <button type="button" className="spotlight-clear" onClick={() => setQuery("")} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Scope — same Auto / V5 / IQ preference the header search bar writes. */}
        <SearchScopeToggle scope={scope} />

        {/* Results */}
        <div className="spotlight-results" role="listbox">
          {loading && <div className="spotlight-loading">Searching…</div>}

          {/* No-query state: render recents and actions in separate sections */}
          {!debounced && (
            <>
              {/* Compare action (if tray has ≥ 2 teams) */}
              {trayEntries.length >= 2 && items[0] && (
                <SpotlightRow
                  item={items[0]}
                  active={0 === activeIndex}
                  onMouseEnter={() => setActiveIndex(0)}
                  onClick={() => handleSelect(items[0])}
                />
              )}

              {/* Recent section */}
              {hasRecent && (
                <>
                  <div className="spotlight-section-label">Recent</div>
                  <div className={`spotlight-recents-wrap${shouldCollapseRecents ? " is-collapsed" : ""}`}>
                    {items.slice(recentOffset, recentOffset + visibleRecentCount).map((item, i) => (
                      <SpotlightRow
                        key={`r-${item.kind === "recent" ? item.entry.path : i}`}
                        item={item}
                        active={(recentOffset + i) === activeIndex}
                        onMouseEnter={() => setActiveIndex(recentOffset + i)}
                        onClick={() => handleSelect(item)}
                      />
                    ))}
                  </div>
                  {shouldCollapseRecents && (
                    <button
                      className="spotlight-show-all-recents"
                      onClick={() => setShowAllRecents(true)}
                    >
                      Show {Math.min(recent.length, RECENT_MAX) - RECENT_COLLAPSED_LIMIT} more recent{Math.min(recent.length, RECENT_MAX) - RECENT_COLLAPSED_LIMIT > 1 ? "s" : ""}
                    </button>
                  )}
                </>
              )}

              {/* Go to / Quick navigation section */}
              <div className="spotlight-section-label">{hasRecent ? "Go to" : "Quick navigation"}</div>
              {items.slice(actionOffset).map((item, i) => (
                <SpotlightRow
                  key={`a-${item.kind === "action" ? item.label : i}`}
                  item={item}
                  active={(actionOffset + i) === activeIndex}
                  onMouseEnter={() => setActiveIndex(actionOffset + i)}
                  onClick={() => handleSelect(item)}
                />
              ))}
            </>
          )}

          {/* Query state: flat list with team/event section labels */}
          {!!debounced && hasTeams && (
            <div className="spotlight-section-label">Teams</div>
          )}
          {!!debounced && items.map((item, i) => {
            const isEventSectionStart = hasEvents && i === eventOffset;
            return (
              <Fragment key={
                item.kind === "team"   ? `t-${item.team.id}` :
                item.kind === "event"  ? `e-${item.event.id}` :
                item.kind === "recent" ? `r-${item.entry.path}` :
                `a-${item.label}`
              }>
                {isEventSectionStart && <div className="spotlight-section-label">Events</div>}
                <SpotlightRow
                  item={item}
                  active={i === activeIndex}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => handleSelect(item)}
                />
              </Fragment>
            );
          })}

          {searchingOlderSeasons && (
            <div className="spotlight-older-seasons">Searching older seasons…</div>
          )}

          {showEmpty && (
            <div className="spotlight-empty">No results for "{debounced}"</div>
          )}
        </div>

        {/* Footer */}
        <div className="spotlight-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Shortcuts cheat-sheet overlay ────────────────────────────────────────────

// ── Compare Tray ─────────────────────────────────────────────────────────────

function CompareTray({ entries }: { entries: TrayEntry[] }) {
  const canCompare = entries.length >= 2;
  return (
    <div className="compare-tray visible" role="complementary" aria-label="Comparison tray">
      {[0, 1, 2].map((i) => {
        const e = entries[i];
        return (
          <div key={i} className={`compare-slot${e ? " filled" : ""}`}>
            {e ? (
              <>
                <span className="compare-slot-label">{e.teamNumber}</span>
                <button type="button" className="compare-slot-remove" onClick={() => removeFromTray(e.teamId)} aria-label={`Remove ${e.teamNumber}`}>
                  <X size={11} />
                </button>
              </>
            ) : (
              <span className="compare-slot-empty">+</span>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="compare-tray-btn"
        disabled={!canCompare}
        onClick={() => openCompareModal(_currentEventSeasonId ?? undefined, _currentEventId ?? undefined)}
      >
        {canCompare ? "Compare" : `Add ${2 - entries.length} more`}
      </button>
      <button type="button" className="compare-tray-clear" onClick={clearTray}>
        Clear
      </button>
    </div>
  );
}

// ── Comparison Modal ──────────────────────────────────────────────────────────

type TeamCompareSlot = {
  entry: TrayEntry;
  profileLoading: boolean;
  profileError: string | null;
  profile: Team | null;
  dataLoading: boolean;
  dataError: string | null;
  events: Event[];
  rankings: Ranking[];
  awards: Award[];
  skills: Skill[];          // season skills — IQ avg driver/prog (loaded for IQ only)
  eventMatches: Match[];    // team's matches at the context event — IQ event Low/Dropped
  seasonId: number | null;
  worldSkillsLoading: boolean;
  worldSkillsEntry: WorldSkillsEntry | null;
};

type CompareStats = {
  // Season-wide performance
  wins: number; losses: number; ties: number; totalMatches: number;
  winRate: number | null;
  avgAwp: number | null;
  sigAwp: number;
  avgWp: number | null;
  avgAp: number | null;
  // IQ season performance
  seasonHigh: number | null;
  avgScore: number | null;
  avgDriverSkill: number | null;
  avgProgSkill: number | null;
  avgRank: number | null;
  consistency: number | null; // % — higher = tighter qual-score spread
  // World Skills ranking
  wsRank: number | null; wsScore: number | null;
  wsDriver: number | null; wsProg: number | null;
  // Accolades
  awardCount: number; topAwardTitle: string | null;
  eventCount: number;
  // Event-specific (null when not in event context)
  evtRank: number | null; evtRecord: string | null;
  evtWp: number | null; evtAp: number | null; evtAwp: number | null;
  // IQ event-specific
  evtAvg: number | null; evtHigh: number | null; evtLow: number | null; evtDropped: number | null;
  // Per-event OPR/DPR/CCWM (null when not in event context). DPR/CCWM are only
  // meaningful for V5RC/VURC (opposing alliances), not IQ teamwork.
  evtOpr: number | null; evtDpr: number | null; evtCcwm: number | null;
};

function emptyCompareStats(): CompareStats {
  return {
    wins: 0, losses: 0, ties: 0, totalMatches: 0, winRate: null,
    avgAwp: null, sigAwp: 0, avgWp: null, avgAp: null,
    seasonHigh: null, avgScore: null, avgDriverSkill: null, avgProgSkill: null, avgRank: null, consistency: null,
    wsRank: null, wsScore: null, wsDriver: null, wsProg: null,
    awardCount: 0, topAwardTitle: null, eventCount: 0,
    evtRank: null, evtRecord: null, evtWp: null, evtAp: null, evtAwp: null,
    evtAvg: null, evtHigh: null, evtLow: null, evtDropped: null,
    evtOpr: null, evtDpr: null, evtCcwm: null,
  };
}

// Memoized OPR/DPR/CCWM for the current event, shared across compare slots so
// we solve the linear system once per modal, not once per team.
let _oprCache: { matches: Match[]; map: Map<number, TeamOpr> } | null = null;
function currentEventOprMap(): Map<number, TeamOpr> {
  if (!_oprCache || _oprCache.matches !== _currentEventMatches) {
    _oprCache = { matches: _currentEventMatches, map: computeEventOpr(_currentEventMatches) };
  }
  return _oprCache.map;
}

function rankingAwp(ranking: Ranking) {
  return Math.max(0, (ranking.wp ?? 0) - ((ranking.wins ?? 0) * 2 + (ranking.ties ?? 0)));
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function currentEventRankingForTeam(teamId: number, contextEventId: number | null) {
  if (!contextEventId) return null;
  return _currentEventRankings.find((r) => r.event.id === contextEventId && r.team.id === teamId) ?? null;
}

async function loadCompareRankings(teamId: string, seasonId: number, numericTeamId: number, contextEventId: number | null) {
  const load = () => collectAllPages<Ranking>((page) => api.teamRankings(teamId, { "season[]": [seasonId], per_page: 250, page }));
  let result = await load();

  if (!result.data.length) {
    await delay(350);
    result = await load();
  }

  const eventRanking = currentEventRankingForTeam(numericTeamId, contextEventId);
  if (eventRanking && !result.data.some((r) => r.event.id === eventRanking.event.id)) {
    return { ...result, data: [...result.data, eventRanking] };
  }

  return result;
}

function compareSeasonCandidates(events: Event[], contextSeasonId: number | null) {
  if (contextSeasonId) return [contextSeasonId];

  const latestBySeason = new Map<number, number>();
  for (const event of events) {
    if (isScrimmageEvent(event)) continue;
    const latest = latestBySeason.get(event.season.id) ?? 0;
    latestBySeason.set(event.season.id, Math.max(latest, event.start ? new Date(event.start).getTime() : 0));
  }

  return [...latestBySeason.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .map(([seasonId]) => seasonId);
}

async function loadCompareSeasonRankings(
  teamId: string,
  numericTeamId: number,
  contextEventId: number | null,
  candidateSeasonIds: number[],
) {
  let fallback: { seasonId: number; rankingsRes: Awaited<ReturnType<typeof loadCompareRankings>> } | null = null;

  for (const seasonId of candidateSeasonIds) {
    const rankingsRes = await loadCompareRankings(teamId, seasonId, numericTeamId, contextEventId);
    fallback ??= { seasonId, rankingsRes };
    if (contextEventId || rankingsRes.data.length) return { seasonId, rankingsRes };
  }

  return fallback;
}

function computeCompareStats(slot: TeamCompareSlot, contextEventId: number | null): CompareStats {
  const { profile, events, rankings, awards, seasonId, worldSkillsEntry } = slot;
  if (!profile || !seasonId || slot.dataLoading) return emptyCompareStats();

  const isIq = isIqProgramInfo(profile.program);
  const teamId = profile.id;
  const eventIndex = makeEventIndex(events);
  const nonScrimmageRankings = rankings.filter((r) => !isScrimmageEvent(eventIndex.get(r.event.id)));

  // ── Season record — use ranking entries for both VRC and IQ
  let wins = 0, losses = 0, ties = 0;
  for (const r of nonScrimmageRankings) {
    wins   += r.wins   ?? 0;
    losses += r.losses ?? 0;
    ties   += r.ties   ?? 0;
  }
  const totalMatches = wins + losses + ties;
  const winRate = (!isIq && totalMatches > 0) ? wins / totalMatches : null;

  const withMatches = nonScrimmageRankings.filter((r) => (r.wins ?? 0) + (r.losses ?? 0) + (r.ties ?? 0) > 0);
  const avgFromRankings = (value: (ranking: Ranking) => number | null | undefined) => {
    const values = withMatches.map(value).filter((v): v is number => v != null);
    return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  };
  const avgAwp = avgFromRankings((r) => rankingAwp(r));
  const avgWp = avgFromRankings((r) => r.wp);
  const avgAp = avgFromRankings((r) => r.ap);
  const sigAwp = nonScrimmageRankings.reduce((sum, r) => sum + (isMarqueeEvent(eventIndex.get(r.event.id)) ? rankingAwp(r) : 0), 0);

  // ── IQ season performance ──
  // IQ rankings are cooperative (no W/L/T), so the withMatches filter above would
  // be empty — average over the rankings that actually carry each value instead.
  const avgOver = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
  const scoreVals = nonScrimmageRankings.map((r) => r.average_points).filter((v): v is number => v != null && v > 0);
  const rankVals = nonScrimmageRankings.map((r) => r.rank).filter((v): v is number => v != null && v > 0);
  const avgScore = avgOver(scoreVals);
  const avgRank = avgOver(rankVals);
  const highVals = nonScrimmageRankings.map((r) => r.high_score).filter((v): v is number => v != null && v > 0);
  const seasonHigh = highVals.length ? Math.max(...highVals) : null;
  // Avg best driver/prog skill per event, averaged across the season's events.
  const avgEventSkill = (wantDriver: boolean): number | null => {
    const byEvent = new Map<number, number>();
    for (const s of slot.skills) {
      if (isScrimmageEvent(eventIndex.get(s.event.id))) continue;
      const isDriver = (s.type ?? "").toLowerCase().includes("driver");
      if (wantDriver !== isDriver) continue;
      byEvent.set(s.event.id, Math.max(byEvent.get(s.event.id) ?? 0, s.score ?? 0));
    }
    const vals = [...byEvent.values()];
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const avgDriverSkill = isIq ? avgEventSkill(true) : null;
  const avgProgSkill = isIq ? avgEventSkill(false) : null;
  // Consistency: tightness of per-event average qual scores (no extra API calls).
  let consistency: number | null = null;
  if (scoreVals.length >= 2) {
    const mean = scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length;
    const stdev = Math.sqrt(scoreVals.reduce((a, v) => a + (v - mean) ** 2, 0) / scoreVals.length);
    consistency = mean > 0 ? Math.max(0, Math.min(100, 100 * (1 - stdev / mean))) : null;
  }

  // ── World Skills ──
  const wsRank   = worldSkillsEntry?.rank ?? null;
  const wsScore  = worldSkillsEntry?.scores.score ?? null;
  const wsDriver = worldSkillsEntry?.scores.driver ?? null;
  const wsProg   = worldSkillsEntry?.scores.programming ?? null;

  // ── Awards ──
  const teamAwards = awards.filter((a) => awardTeamWinners(a).some((w) => w.team.id === teamId));
  const sorted = sortAwards(teamAwards);
  const uniqueEventIds = new Set(events.filter((e) => !isScrimmageEvent(e)).map((e) => e.id));

  // ── Event-specific stats (only when contextEventId is set) ──
  const evtRanking = contextEventId ? nonScrimmageRankings.find((r) => r.event.id === contextEventId) ?? null : null;
  // IQ: derive Avg/High/Low + dropped scores from the team's qual matches at the event.
  const evtIq = isIq && contextEventId ? iqTeamQualStats(slot.eventMatches, teamId, evtRanking) : null;
  // Per-event OPR/DPR/CCWM, available only when comparing within the event
  // currently open (we have all its matches via _currentEventMatches).
  const evtOprStats = contextEventId && contextEventId === _currentEventId ? currentEventOprMap().get(teamId) ?? null : null;

  return {
    wins, losses, ties, totalMatches, winRate,
    avgAwp, sigAwp, avgWp, avgAp,
    seasonHigh, avgScore, avgDriverSkill, avgProgSkill, avgRank, consistency,
    wsRank, wsScore, wsDriver, wsProg,
    awardCount: teamAwards.length,
    topAwardTitle: sorted[0]?.title ?? null,
    eventCount: uniqueEventIds.size,
    evtRank:      evtRanking?.rank ?? null,
    evtRecord:    evtRanking ? `${evtRanking.wins ?? 0}W ${evtRanking.losses ?? 0}L ${evtRanking.ties ?? 0}T` : null,
    evtWp:        evtRanking?.wp ?? null,
    evtAp:        evtRanking?.ap ?? null,
    evtAwp:       evtRanking ? rankingAwp(evtRanking) : null,
    evtAvg:       evtIq?.avg ?? evtRanking?.average_points ?? null,
    evtHigh:      evtIq?.high ?? evtRanking?.high_score ?? null,
    evtLow:       evtIq?.low ?? null,
    evtDropped:   evtIq ? evtIq.dropped.reduce((sum, d) => sum + d.score, 0) : null,
    evtOpr:       evtOprStats ? Number(evtOprStats.opr.toFixed(1)) : null,
    evtDpr:       evtOprStats ? Number(evtOprStats.dpr.toFixed(1)) : null,
    evtCcwm:      evtOprStats ? Number(evtOprStats.ccwm.toFixed(1)) : null,
  };
}

type CompareRowDef =
  | { key: string; isSection: true; label: string }
  | { key: string; isSection?: false; label: string; getValue: (s: CompareStats, slot: TeamCompareSlot) => string | number | null; higherBetter: boolean | null };

function buildCompareRows(hasEventContext: boolean, isIq: boolean): CompareRowDef[] {
  const seasonRows: CompareRowDef[] = isIq
    ? [
        { key: "s-perf",    isSection: true, label: "Season Performance" },
        { key: "seasonHigh", label: "High Score", getValue: (s) => s.seasonHigh ?? null, higherBetter: true },
        { key: "avgScore",  label: "Avg Score",   getValue: (s) => s.avgScore != null ? Number(s.avgScore.toFixed(1)) : null, higherBetter: true },
        { key: "avgDriver", label: "Avg Driver Skill", getValue: (s) => s.avgDriverSkill != null ? Number(s.avgDriverSkill.toFixed(1)) : null, higherBetter: true },
        { key: "avgProg",   label: "Avg Prog Skill",   getValue: (s) => s.avgProgSkill != null ? Number(s.avgProgSkill.toFixed(1)) : null, higherBetter: true },
        { key: "avgRank",   label: "Avg Rank (Quals)", getValue: (s) => s.avgRank != null ? `#${s.avgRank.toFixed(1)}` : null, higherBetter: false },
        { key: "consistency", label: "Consistency", getValue: (s) => s.consistency != null ? `${s.consistency.toFixed(0)}%` : null, higherBetter: true },
      ]
    : [
        { key: "s-perf",    isSection: true, label: "Season Performance" },
        { key: "winRate",   label: "Win Rate",    getValue: (s) => s.winRate != null ? `${(s.winRate * 100).toFixed(0)}%` : null, higherBetter: true },
        { key: "record",    label: "Record",      getValue: (s) => s.totalMatches > 0 ? `${s.wins}W ${s.losses}L ${s.ties}T` : null, higherBetter: null },
        { key: "avgAwp",    label: "Avg AWP",     getValue: (s) => s.avgAwp != null ? Number(s.avgAwp.toFixed(1)) : null, higherBetter: true },
        { key: "sigAwp",    label: "Sig AWP",     getValue: (s) => s.sigAwp > 0 ? s.sigAwp : null, higherBetter: true },
        { key: "avgWp",     label: "Avg WP",      getValue: (s) => s.avgWp != null ? Number(s.avgWp.toFixed(1)) : null, higherBetter: true },
        { key: "avgAp",     label: "Avg AP",      getValue: (s) => s.avgAp != null ? Number(s.avgAp.toFixed(1)) : null, higherBetter: true },
      ];
  const eventRows: CompareRowDef[] = !hasEventContext
    ? []
    : isIq
      ? [
          { key: "s-evt",    isSection: true, label: "At This Event" },
          { key: "evtAvg",     label: "Avg",            getValue: (s) => s.evtAvg != null ? Number(s.evtAvg.toFixed(1)) : null, higherBetter: true },
          { key: "evtHigh",    label: "High",           getValue: (s) => s.evtHigh ?? null, higherBetter: true },
          { key: "evtLow",     label: "Low",            getValue: (s) => s.evtLow ?? null, higherBetter: true },
          { key: "evtDropped", label: "Dropped Scores", getValue: (s) => s.evtDropped ?? null, higherBetter: true },
          { key: "evtOpr",     label: "OPR",            getValue: (s) => s.evtOpr ?? null, higherBetter: true },
        ]
      : [
          { key: "s-evt",      isSection: true,  label: "At This Event" },
          { key: "evtRank",    label: "Rank",        getValue: (s: CompareStats) => s.evtRank != null ? `#${s.evtRank}` : null, higherBetter: false },
          { key: "evtRecord",  label: "Record",      getValue: (s: CompareStats) => s.evtRecord, higherBetter: null },
          { key: "evtWp",      label: "WP",          getValue: (s: CompareStats) => s.evtWp ?? null, higherBetter: true },
          { key: "evtAp",      label: "AP",          getValue: (s: CompareStats) => s.evtAp ?? null, higherBetter: true },
          { key: "evtAwp",     label: "AWP",         getValue: (s: CompareStats) => s.evtAwp ?? null, higherBetter: true },
          { key: "evtOpr",     label: "OPR",         getValue: (s: CompareStats) => s.evtOpr ?? null, higherBetter: true },
          { key: "evtDpr",     label: "DPR",         getValue: (s: CompareStats) => s.evtDpr ?? null, higherBetter: false },
          { key: "evtCcwm",    label: "CCWM",        getValue: (s: CompareStats) => s.evtCcwm ?? null, higherBetter: true },
        ];
  return [
    ...seasonRows,
    ...eventRows,
    { key: "s-ws",      isSection: true, label: "World Skills" },
    { key: "wsRank",    label: "World Rank",  getValue: (s) => s.wsRank != null ? `#${s.wsRank}` : null, higherBetter: false },
    { key: "wsScore",   label: "Score",       getValue: (s) => s.wsScore ?? null, higherBetter: true },
    { key: "wsDriver",  label: "Driver",      getValue: (s) => s.wsDriver ?? null, higherBetter: true },
    { key: "wsProg",    label: "Autonomous",  getValue: (s) => s.wsProg ?? null, higherBetter: true },
    { key: "s-awards",  isSection: true, label: "Accolades" },
    { key: "awards",    label: "Awards",      getValue: (s) => s.awardCount > 0 ? s.awardCount : null, higherBetter: true },
    { key: "topAward",  label: "Top Award",   getValue: (s) => s.topAwardTitle, higherBetter: null },
    { key: "events",    label: "Events",      getValue: (s) => s.eventCount > 0 ? s.eventCount : null, higherBetter: null },
    { key: "s-profile", isSection: true, label: "Profile" },
    { key: "location",  label: "Location",    getValue: (_s, slot) => slot.profile ? locationLine(slot.profile) : null, higherBetter: null },
    { key: "grade",     label: "Grade",       getValue: (_s, slot) => slot.profile?.grade ?? null, higherBetter: null },
  ];
}

function ComparisonModal({ entries, onClose }: { entries: TrayEntry[]; onClose: () => void }) {
  const [slots, setSlots] = useState<TeamCompareSlot[]>(() =>
    entries.map((entry) => ({
      entry,
      profileLoading: true, profileError: null, profile: null,
      dataLoading: false, dataError: null,
      events: [], rankings: [], awards: [], skills: [], eventMatches: [],
      seasonId: null,
      worldSkillsLoading: false,
      worldSkillsEntry: null,
    }))
  );
  const [copyDone, setCopyDone] = useState(false);
  const [copyError, setCopyError] = useState(false);

  // Capture context (season + event) from the store at mount time — stable for
  // this modal instance even if the user navigates away while it is open.
  const contextSeasonId = useMemo(() => getContextSeasonId() ?? _currentEventSeasonId, []);
  const contextEventId  = useMemo(() => getContextEventId() ?? _currentEventId, []);

  // Each team's pipeline runs fully in parallel. Profile headers appear after
  // the light profile request; season-scoped stats fill independently after.
  useEffect(() => {
    const live = { value: true };

    void Promise.allSettled(entries.map(async (entry, i) => {
      const teamId = String(entry.teamId);
      try {
        // ── Step 1: profile ─────────────────────────────────────────────────────
        const profile = await api.team(teamId);
        if (!live.value) return;

        // Column header appears immediately once profile is known
        setSlots((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], profile, profileLoading: false, dataLoading: true };
          return next;
        });

        // ── Step 2: load team events and pick the right stats season ───────────
        const allEventsRes = await collectAllPages<Event>((page) =>
          api.teamEvents(teamId, {
            "season[]": contextSeasonId ? [contextSeasonId] : undefined,
            per_page: 250,
            page,
          }),
        );
        if (!live.value) return;
        const allEvents = allEventsRes.data;

        const seasonRankings = await loadCompareSeasonRankings(
          teamId,
          entry.teamId,
          contextEventId,
          compareSeasonCandidates(allEvents, contextSeasonId),
        );
        if (!live.value) return;

        if (!seasonRankings) {
          setSlots((prev) => {
            const next = [...prev];
            next[i] = { ...next[i], dataLoading: false, dataError: "No ranked season found for this team." };
            return next;
          });
          return;
        }

        const { seasonId, rankingsRes } = seasonRankings;
        const seasonEvents = allEvents.filter((event) => event.season.id === seasonId);

        setSlots((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], seasonId, events: seasonEvents, worldSkillsLoading: true };
          return next;
        });

        // ── Step 3: stats (rankings / awards) ──────────────────────────────────
        const grade = profile.grade ?? "High School";
        const slotIsIq = isIqProgramInfo(profile.program);
        const worldSkillsPromise = loadWorldSkills(seasonId, grade).catch(() => [] as WorldSkillsEntry[]);
        const awardsRes = await collectAllPages<Award>((page) => api.teamAwards(teamId, { "season[]": [seasonId], per_page: 250, page }));
        if (!live.value) return;
        // IQ-only: season skills (avg driver/prog) + event matches (event Low/Dropped).
        const skillsRes = slotIsIq
          ? await collectAllPages<Skill>((page) => api.teamSkills(teamId, { "season[]": [seasonId], per_page: 250, page }))
          : { data: [] as Skill[] };
        if (!live.value) return;
        const eventMatchesRes = slotIsIq && contextEventId
          ? await collectAllPages<Match>((page) => api.teamMatches(teamId, { "event[]": [contextEventId], per_page: 250, page }))
          : { data: [] as Match[] };
        if (!live.value) return;

        // Column stats appear as soon as this team's ranking/award data arrives.
        setSlots((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            dataLoading: false,
            events: seasonEvents,
            rankings: rankingsRes.data,
            awards: awardsRes.data,
            skills: skillsRes.data,
            eventMatches: eventMatchesRes.data,
          };
          return next;
        });

        const wsData = await worldSkillsPromise;
        if (!live.value) return;

        const wsEntry = wsData.length
          ? (wsData.find((e) => e.team.id === entry.teamId) ??
             wsData.find((e) => e.team.team?.toUpperCase() === entry.teamNumber.toUpperCase()) ??
             null)
          : null;

        setSlots((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            worldSkillsLoading: false,
            worldSkillsEntry: wsEntry,
          };
          return next;
        });
      } catch (err) {
        if (!live.value) return;
        setSlots((prev) => {
          const next = [...prev];
          // Distinguish profile-load failure from data-load failure
          next[i] = prev[i].profileLoading
            ? { ...next[i], profileLoading: false, dataLoading: false, profileError: String(err) }
            : { ...next[i], dataLoading: false, worldSkillsLoading: false, dataError: String(err) };
          return next;
        });
      }
    }));

    return () => { live.value = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally runs once on mount

  const loadedProfiles = slots.map((s) => s.profile).filter((p): p is Team => !!p);
  const isIqCompare = loadedProfiles.length > 0 && loadedProfiles.every((p) => isIqProgramInfo(p.program));
  const compareRows = useMemo(() => buildCompareRows(!!contextEventId, isIqCompare), [contextEventId, isIqCompare]);
  const stats = useMemo(() => slots.map((s) => computeCompareStats(s, contextEventId)), [slots, contextEventId]);
  const colCount = slots.length;

  // Compute best index per numeric row for green-highlight diffing
  function getBestIndex(rowKey: string): number | null {
    const row = compareRows.find((r) => !r.isSection && r.key === rowKey);
    if (!row || row.isSection || row.higherBetter == null) return null;
    const values = stats.map((s, i) => {
      if (slots[i].profileLoading || slots[i].dataLoading || (row.key.startsWith("ws") && slots[i].worldSkillsLoading)) return null;
      const raw = row.getValue(s, slots[i]);
      if (raw == null) return null;
      const num = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^0-9.-]/g, ""));
      return isNaN(num) ? null : num;
    });
    const valid = values.filter((v): v is number => v != null);
    if (valid.length < 2) return null;
    const target = row.higherBetter ? Math.max(...valid) : Math.min(...valid);
    return values.findIndex((v) => v === target);
  }

  async function copyLink() {
    const url = new URL(`/compare/${entries.map((e) => encodeURIComponent(e.teamNumber)).join("/")}`, window.location.origin);
    url.searchParams.set("ids", entries.map((e) => e.teamId).join(","));
    url.searchParams.set("programs", entries.map((e) => e.programCode).join(","));
    if (contextEventId != null) url.searchParams.set("event", String(contextEventId));
    if (contextSeasonId != null) url.searchParams.set("season", String(contextSeasonId));
    if (import.meta.env.DEV) console.info("Compare link:", url.toString());
    const copied = await writeClipboardText(url.toString());
    setCopyDone(copied);
    setCopyError(!copied);
    setTimeout(() => {
      setCopyDone(false);
      setCopyError(false);
    }, 1500);
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showCloseButton={false} className="w-fit max-w-none sm:max-w-none border-0 bg-transparent p-0 shadow-none">
        <DialogTitle className="sr-only">Compare teams</DialogTitle>
      <div
        className="compare-modal"
        style={{ "--col-count": colCount } as React.CSSProperties}
      >
        {/* Header */}
        <div className="compare-modal-header">
          <div className="compare-modal-title">
            <Scale size={16} />
            <strong>Compare Teams</strong>
          </div>
          <div className="compare-modal-header-actions">
            <button
              type="button"
              className={`compare-copy-link${confirmClass(copyDone, "success")}`}
              onClick={copyLink}
              title="Copy shareable link"
            >
              <IconMorph morphed={copyDone} size={14} tone="success">
                <Link2 size={14} />
              </IconMorph>
              <span>{copyDone ? "Copied!" : copyError ? "Copy failed" : "Copy link"}</span>
            </button>
            <CloseButton onClose={onClose} />
          </div>
        </div>

        {/* Grid */}
        <div className="compare-grid">
          {/* Team header row */}
          <div className="compare-label-cell compare-team-header-label" />
          {slots.map((slot, i) => (
            <div key={i} className="compare-team-header-cell">
              {slot.profileLoading ? (
                <>
                  <div className="compare-skeleton compare-skeleton-title" />
                  <div className="compare-skeleton compare-skeleton-sub" style={{ width: "60%", marginTop: 6 }} />
                </>
              ) : slot.profileError ? (
                <span className="compare-error">Error loading</span>
              ) : slot.profile ? (
                <>
                  <div className="compare-team-number">
                    <Link href={teamPath(slot.profile)}>{slot.profile.number}</Link>
                  </div>
                  {slot.profile.team_name && (
                    <div className="compare-team-name">
                      <TranslatedText text={slot.profile.team_name} country={slot.profile.location?.country} />
                    </div>
                  )}
                  <div className="compare-team-meta">
                    <ProgramBadge program={slot.profile.program} />
                    <span>{locationLine(slot.profile)}</span>
                  </div>
                  {slot.dataError && (
                    <div className="compare-data-error" title={slot.dataError}>
                      ⚠ Stats unavailable
                    </div>
                  )}
                </>
              ) : null}
            </div>
          ))}

          {/* Stat rows */}
          {compareRows.map((row) => {
            if (row.isSection) {
              return (
                <div key={row.key} className="compare-section-row">
                  {row.label}
                </div>
              );
            }
            const bestIndex = getBestIndex(row.key);
            return (
              <Fragment key={row.key}>
                <div className="compare-label-cell">{row.label}</div>
                {slots.map((slot, i) => {
                  const isWorldSkillsRow = row.key.startsWith("ws");
                  const isProfileRow = row.key === "location" || row.key === "grade";
                  const isLoading =
                    slot.profileLoading ||
                    (!isProfileRow && slot.dataLoading) ||
                    (isWorldSkillsRow && slot.worldSkillsLoading);
                  const hasError = !isProfileRow && !isLoading && !!slot.dataError;
                  const value = isLoading || hasError ? null : row.getValue(stats[i], slot);
                  const isBest = !hasError && bestIndex === i;
                  return (
                    <div key={i} className={`compare-data-cell${isBest ? " best-value" : ""}${hasError ? " has-error" : ""}`}>
                      {isLoading ? (
                        <div className="compare-skeleton" />
                      ) : hasError ? (
                        <span className="compare-cell-err">—</span>
                      ) : (
                        <span>{value ?? "—"}</span>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Compare URL route ─────────────────────────────────────────────────────────

function CompareFromUrl({ param }: { param: string }) {
  const numbers = useMemo(
    () => param.split("/").map(decodeURIComponent).map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 3),
    [param],
  );
  const ids = useMemo(
    () => (new URLSearchParams(window.location.search).get("ids") ?? "")
      .split(",")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .slice(0, 3),
    [param],
  );
  const programs = useMemo(
    () => (new URLSearchParams(window.location.search).get("programs") ?? "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 3),
    [param],
  );
  const compareContext = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const seasonId = Number(params.get("season"));
    const eventId = Number(params.get("event"));
    return {
      seasonId: Number.isFinite(seasonId) && seasonId > 0 ? seasonId : undefined,
      eventId: Number.isFinite(eventId) && eventId > 0 ? eventId : undefined,
    };
  }, [param]);
  const lookup = useAsync(async () => {
    if (ids.length === numbers.length) {
      const results = await Promise.all(ids.map((id) => api.team(id).catch(() => null)));
      return results.filter((t): t is Team => t !== null);
    }

    const results = await Promise.all(
      numbers.map((n, i) =>
        api.robotEventsTeams({ number: n, "program[]": vexProgramIds, per_page: 10 })
          .then((r) => {
            const program = programs[i];
            const filtered = program ? r.data.filter((team) => programMatchesSlug(team.program, program)) : r.data;
            return filtered[0] ?? null;
          })
          .catch(() => null),
      ),
    );
    return results.filter((t): t is Team => t !== null);
  }, [numbers.join(","), ids.join(","), programs.join(",")]);

  useEffect(() => {
    if (!lookup.data?.length) return;
    clearTray();
    lookup.data.forEach((t) =>
      addToTray({ teamId: t.id, teamNumber: t.number, programCode: programSlug(t.program), teamName: t.team_name ?? undefined }),
    );
    openCompareModal(compareContext.seasonId, compareContext.eventId);
  }, [lookup.data, compareContext.seasonId, compareContext.eventId]);

  if (lookup.loading) return <Status loading error={null} />;
  return <Home />;
}

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <table className="shortcuts-table">
          <tbody>
            <tr><td><kbd>{isMac ? "⌘K" : "Ctrl+K"}</kbd></td><td>Open command palette</td></tr>
            <tr><td><kbd>/</kbd></td><td>Open command palette</td></tr>
            <tr><td><kbd>?</kbd></td><td>Show this help</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Close any overlay</td></tr>
            <tr><td><kbd>G</kbd> then <kbd>H</kbd></td><td>Go to Home</td></tr>
            <tr><td><kbd>G</kbd> then <kbd>E</kbd></td><td>Go to Events</td></tr>
            <tr><td><kbd>G</kbd> then <kbd>T</kbd></td><td>Go to Teams</td></tr>
            <tr><td><kbd>C</kbd> (on team page)</td><td>Toggle team in comparison tray</td></tr>
            <tr><td><kbd>F</kbd> (on event page)</td><td>Search teams within the event</td></tr>
            <tr><td><kbd>G</kbd> then <kbd>C</kbd></td><td>Open comparison modal</td></tr>
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}

// The Apple-style shareable team card is kept here but not surfaced yet.
const SHOW_TEAM_SHARE_CARD = false;

function myTeamDateLabel(iso?: string | null) {
  return formatEventDayPadded(iso);
}

type MyTeamTimelineWins = {
  // "full" = overall event Tournament Champion; "division" = division-only champion
  // at a multi-division event; null = not a champion here.
  champion: "full" | "division" | null;
  skills: boolean;
  excellence: boolean;
  // Count of awards won that aren't Champion/Skills/Excellence ("other" awards).
  otherAwards: number;
  // Every award the team won at this event, with what each qualifies them for.
  all: Array<{ title: string; qualifies: string[] }>;
};

// Shared by the My Team timeline and the team-focused Events list (crown row):
// tallies a team's award wins at one event into the champion/skills/excellence/
// other buckets the crown display lights up from.
function computeEventAwardWins(event: Event, eventAwards: Award[], teamId: number, isIq: boolean): MyTeamTimelineWins {
  const teamWonAwards = eventAwards.filter((a) => awardTeamWinners(a).some((w) => w.team?.id === teamId));
  const champRe = isIq ? /teamwork.*champions?/i : /world champions?|tournament champions?|event champions?/i;
  const skillsRe = /(?:robot\s*)?skills?.*champions?/i;
  const excellenceRe = /excellence award/i;
  const champAward = teamWonAwards.find((a) => champRe.test(a.title)) ?? null;
  let champion: MyTeamTimelineWins["champion"] = null;
  if (champAward) {
    // Half crown when the win is division-scoped at a multi-division event: the
    // winning entry carries a `division` and the event has >1 division. A win with
    // no division (or a single-division event) is the overall event champion.
    const multiDivision = (event.divisions?.length ?? 0) > 1;
    const wonOverall = awardTeamWinners(champAward).some((w) => w.team?.id === teamId && !w.division);
    champion = wonOverall || !multiDivision ? "full" : "division";
  }
  return {
    champion,
    skills: teamWonAwards.some((a) => skillsRe.test(a.title)),
    excellence: teamWonAwards.some((a) => excellenceRe.test(a.title)),
    otherAwards: teamWonAwards.filter((a) => a !== champAward && !skillsRe.test(a.title) && !excellenceRe.test(a.title)).length,
    all: teamWonAwards.map((a) => ({ title: a.title, qualifies: a.qualifications ?? [] })),
  };
}

// Crowns show an accumulated award "value" that fills LEFT TO RIGHT across three
// crowns. Each important award (Tournament Champion, Robot Skills Champion, Excellence)
// adds a full crown; a division-only champion adds a half; any number of "other" awards
// together add a half. The total is rendered as N full crowns + an optional trailing
// half, left-packed, and capped at 3 crowns. If the value exceeds 3, a "+" trails the
// three full crowns. The hover popup always lists every award in full.
function AwardCrowns({ wins, showHint }: { wins: MyTeamTimelineWins; showHint?: boolean }) {
  const { champion, skills, excellence, otherAwards, all } = wins;
  let value = 0;
  if (champion === "full") value += 1;
  else if (champion === "division") value += 0.5;
  if (skills) value += 1;
  if (excellence) value += 1;
  if (otherAwards > 0) value += 0.5;

  const capped = Math.min(value, 3);
  const fulls = Math.floor(capped);
  const hasHalf = capped - fulls >= 0.5;
  const showOtherPlus = value > 3;
  type CrownState = "full" | "half" | "off";
  const slots: CrownState[] = Array.from({ length: 3 }, (_, i) =>
    i < fulls ? "full" : i === fulls && hasHalf ? "half" : "off",
  );
  const crownsLabel = value > 0 ? `Awards won: ${all.length}` : "No awards won";
  return (
    <span className="myteam-crowns" tabIndex={all.length ? 0 : -1} aria-label={crownsLabel}>
      {slots.map((state, i) =>
        state === "full" ? (
          <Crown key={i} className="mt-crown on" aria-hidden="true" />
        ) : state === "half" ? (
          <span key={i} className="mt-crown-half" aria-hidden="true">
            <Crown className="mt-crown off" />
            <span className="mt-crown-clip"><Crown className="mt-crown on" /></span>
          </span>
        ) : (
          <Crown key={i} className="mt-crown off" aria-hidden="true" />
        ),
      )}
      {showOtherPlus && <span className="mt-crown-plus" aria-hidden="true">+</span>}
      {showHint && <span className="myteam-crowns-hint">Hover for all awards</span>}
      {all.length > 0 && (
        <span className="myteam-crowns-pop">
          {all.map((a, i) => (
            <span key={i} className="mt-crown-popitem">
              <span className="mt-crown-poptitle">{a.title}</span>
              {a.qualifies.length > 0 && <span className="mt-crown-popq">Qualifies: {a.qualifies.join(", ")}</span>}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

type MyTeamTimelineRow = {
  event: Event;
  state: "live" | "up" | "done";
  start: number;
  isNext: boolean;
  // Award wins earned by this team at this event, used to light up the crown row.
  wins: MyTeamTimelineWins;
  rank: number | null;
  record: string | null;
  avgScore: number | null;
  skills: number | null;
  days: number | null;
  nextMatch: string | null;
};

function MyTeamPage({ sharedTeamId }: { sharedTeamId: string | null }) {
  const sharedTeams = useSharedTeams();
  const ready = useSharedTeamsReady();
  const active = sharedTeamId ? sharedTeams.find((t) => t.sharedTeamId === sharedTeamId) : null;

  // Deep-linked to a team you're not a member of (once memberships load) → home tab.
  useEffect(() => {
    if (sharedTeamId && ready && !active) navigate("/my-team");
  }, [sharedTeamId, ready, active]);

  const tabs: Array<{ id: string | null; label: string }> = [
    { id: null, label: "My Team" },
    ...sharedTeams.map((t) => ({ id: t.sharedTeamId, label: t.teamNumber || t.name })),
  ];

  return (
    <section className="page myteam-shell">
      {tabs.length > 1 && (
        <nav className="myteam-tabs" aria-label="My Team sections">
          {tabs.map((t) => {
            const isActive = (t.id ?? null) === (sharedTeamId ?? null);
            return (
              <button
                key={t.id ?? "__my"}
                type="button"
                className={`myteam-tab ${isActive ? "active" : ""}`}
                onClick={() => navigate(t.id ? `/my-team/${t.id}` : "/my-team")}
              >
                {t.id ? <Users size={15} /> : <Star size={15} />}
                {t.label}
                {isActive && <SlideIndicator id="myteam-tabs" />}
              </button>
            );
          })}
        </nav>
      )}
      {sharedTeamId && active
        ? <SharedTeamWorkspace sharedTeamId={sharedTeamId} />
        : sharedTeamId && !ready
          ? <div className="myteam-state"><p style={{ color: "var(--text-muted)" }}>Loading…</p></div>
          : <MyTeamDashboard />}
    </section>
  );
}

function MyTeamDashboard() {
  const { profile, ready } = useAuth();
  const teamNumber = profile?.team_number?.trim() ?? "";
  const teamProgramId = profile?.team_program ? Number(profile.team_program) : null;
  const [playback, setPlayback] = useState<MatchPlayback | null>(null);

  // Resolve the team object from the signed-in user's profile team.
  const lookup = useAsync(async () => {
    if (!teamNumber || !teamProgramId) return null;
    const res = await api.robotEventsTeams({ number: teamNumber.toUpperCase(), "program[]": [teamProgramId], per_page: 50 });
    return res.data[0] ?? null;
  }, [teamNumber, teamProgramId]);
  const team = lookup.data ?? null;
  const id = team ? String(team.id) : "";
  const isIq = isIqProgramInfo(team?.program);

  // All events → most-recent season.
  const events = useAsync(async () => {
    if (!team) return null;
    return collectAllPages<Event>((page) => api.teamEvents(id, { per_page: 250, page }));
  }, [id]);
  const teamEvents = useMemo(() => events.data?.data ?? [], [events.data]);
  const eventIndex = useMemo(() => makeEventIndex(teamEvents), [teamEvents]);
  const season = useMemo(() => {
    let best: { id: number; name: string; latest: number } | null = null;
    for (const e of teamEvents) {
      const t = new Date(e.start ?? 0).getTime();
      if (!best || t > best.latest) best = { id: e.season.id, name: e.season.name, latest: t };
    }
    return best;
  }, [teamEvents]);
  const seasonOptions = useMemo(() => {
    const bySeason = new Map<number, { id: number; name: string; latest: number }>();
    for (const e of teamEvents) {
      const t = new Date(e.start ?? 0).getTime();
      const existing = bySeason.get(e.season.id);
      if (!existing || t > existing.latest) bySeason.set(e.season.id, { id: e.season.id, name: e.season.name, latest: t });
    }
    return [...bySeason.values()].sort((a, b) => b.latest - a.latest);
  }, [teamEvents]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  // Clear a stale selection when switching teams (season no longer in this team's list).
  useEffect(() => {
    if (selectedSeasonId != null && !seasonOptions.some((s) => s.id === selectedSeasonId)) setSelectedSeasonId(null);
  }, [seasonOptions, selectedSeasonId]);
  const seasonId = selectedSeasonId ?? season?.id ?? null;
  const liveRefresh = teamEvents.some(eventIsLive) ? liveEventRefreshMs : 0;

  // Season data buckets.
  const matches = useAsync(async () => {
    if (!team || !seasonId) return null;
    return collectAllPages<Match>((page) => api.teamMatches(id, { "season[]": [seasonId], per_page: 250, page }));
  }, [id, seasonId], 0, liveRefresh);
  const rankings = useAsync(async () => {
    if (!team || !seasonId) return null;
    return collectAllPages<Ranking>((page) => api.teamRankings(id, { "season[]": [seasonId], per_page: 250, page }));
  }, [id, seasonId], 300, liveRefresh);
  const skills = useAsync(async () => {
    if (!team || !seasonId) return null;
    return collectAllPages<Skill>((page) => api.teamSkills(id, { "season[]": [seasonId], per_page: 250, page }));
  }, [id, seasonId], 600);
  const awards = useAsync(async () => {
    if (!team || !seasonId) return null;
    return collectAllPages<Award>((page) => api.teamAwards(id, { "season[]": [seasonId], per_page: 250, page }));
  }, [id, seasonId], 900);

  const grade = team?.grade ?? "";
  // Re-reads the board when a background refresh lands (see world-skills-cache).
  const wsVersion = useWorldSkillsVersion();
  const worldSkills = useAsync(async () => {
    if (!seasonId || !grade) return null;
    return loadWorldSkills(seasonId, grade);
  }, [seasonId, grade, wsVersion]);
  const wsEntry = useMemo(() => {
    if (!worldSkills.data || !team) return null;
    return (
      worldSkills.data.find((e) => e.team.id === team.id) ??
      worldSkills.data.find((e) => e.team.team?.toUpperCase() === team.number.toUpperCase()) ??
      null
    );
  }, [worldSkills.data, team]);

  const seasonMatches = useMemo(() => matches.data?.data ?? [], [matches.data]);
  const seasonRankings = useMemo(() => rankings.data?.data ?? [], [rankings.data]);
  const seasonSkills = useMemo(() => skills.data?.data ?? [], [skills.data]);
  const seasonAwards = useMemo(() => awards.data?.data ?? [], [awards.data]);

  // Season record from real match results (qualification + elims), excluding practice/scrimmage.
  const record = useMemo(() => {
    let w = 0, l = 0, t = 0;
    if (!isIq && team) {
      for (const m of seasonMatches) {
        if (/practice/i.test(m.name)) continue;
        if (isScrimmageEvent(eventIndex.get(m.event.id))) continue;
        const color = teamAllianceColor(m, team.id);
        if (!color) continue;
        const { winner } = matchWinner(m);
        if (winner === "-") continue;
        if (winner === "Tie") t += 1;
        else if (winner.toLowerCase() === color.toLowerCase()) w += 1;
        else l += 1;
      }
    }
    return { w, l, t };
  }, [seasonMatches, eventIndex, isIq, team]);
  const totalGames = record.w + record.l + record.t;
  const winPct = totalGames ? Math.round((record.w / totalGames) * 1000) / 10 : 0;
  const seasonSkillsSummary = useMemo(() => skillSummary(seasonSkills), [seasonSkills]);
  // VEX IQ is cooperative (no win/loss), so show teamwork stats instead of a W-L
  // record / win rate in the summary strip.
  const iqTeamworkSummary = useMemo(() => {
    const avgs = seasonRankings
      .map((r) => r.average_points)
      .filter((n): n is number => n != null);
    const avgTeamwork = avgs.length
      ? Math.round((avgs.reduce((sum, v) => sum + v, 0) / avgs.length) * 10) / 10
      : null;
    const eventCount = new Set(seasonRankings.map((r) => r.event.id)).size;
    return { avgTeamwork, eventCount };
  }, [seasonRankings]);

  // Live event (running today) within the current season.
  const seasonEvents = useMemo(() => teamEvents.filter((e) => !seasonId || e.season.id === seasonId), [teamEvents, seasonId]);
  const liveEvent = useMemo(() => seasonEvents.find(eventIsLive) ?? null, [seasonEvents]);
  const liveTz = useMemo(() => eventTimeZone(liveEvent), [liveEvent]);
  const liveRanking = useMemo(() => (liveEvent ? seasonRankings.find((r) => r.event.id === liveEvent.id) ?? null : null), [liveEvent, seasonRankings]);
  const liveSkills = useMemo(() => (liveEvent ? skillSummary(seasonSkills.filter((s) => s.event.id === liveEvent.id)) : null), [liveEvent, seasonSkills]);
  const liveMatches = useMemo(
    () => (liveEvent ? seasonMatches.filter((m) => m.event.id === liveEvent.id).slice().sort((a, b) => compareMatchesDisplay(a, b)) : []),
    [liveEvent, seasonMatches],
  );
  const nextUp = useMemo(() => liveMatches.find((m) => !m.scored) ?? null, [liveMatches]);
  const partner = useMemo(() => {
    if (!nextUp || !team) return null;
    for (const alliance of nextUp.alliances) {
      const mine = alliance.teams.find((x) => x.team.id === team.id);
      if (mine) return alliance.teams.map((x) => x.team).find((tm) => tm.id !== team.id) ?? null;
    }
    return null;
  }, [nextUp, team]);

  // Jumper livestream timestamps for the live event (drives the play button).
  const preset = useAsync(async () => {
    if (!liveEvent) return null;
    return api.jumperPresetEventExists(liveEvent.sku);
  }, [liveEvent?.sku]);
  const matchTimestamps = useAsync(async () => {
    if (!liveEvent || !preset.data?.exists) return null;
    return api.jumperMatchTimestamps(liveEvent.sku, { offsetSeconds: -5 });
  }, [liveEvent?.sku, preset.data?.exists]);
  const timestampMap = useMemo(() => new Map((matchTimestamps.data ?? []).map((ts) => [ts.id, ts])), [matchTimestamps.data]);
  const presetSupported = !!preset.data?.exists;

  // Next upcoming event (any season) for the idle "Up next" panel.
  const now = today.getTime();
  const upcoming = useMemo(
    () => teamEvents.filter((e) => (daysUntilEventDay(e.start, eventTimeZone(e)) ?? -1) > 0 && !eventIsLive(e)).sort((a, b) => new Date(a.start ?? 0).getTime() - new Date(b.start ?? 0).getTime()),
    [teamEvents, now],
  );
  const nextEvent = upcoming[0] ?? null;
  const nextEventTeams = useAsync(async () => {
    if (!nextEvent) return null;
    return api.eventTeams(nextEvent.id, { per_page: 1 });
  }, [nextEvent?.id]);
  const nextEventTeamCount = nextEventTeams.data?.meta.total ?? null;

  // Season timeline rows for the chosen season only, ascending.
  const timeline = useMemo<MyTeamTimelineRow[]>(() => {
    const source = teamEvents.filter((e) => e.season.id === seasonId);
    const rows = source.map((event) => {
      const start = new Date(event.start ?? 0).getTime();
      const live = eventIsLive(event);
      // Calendar days, so an event starting today is never already "done" for a
      // reader west of it (and the countdown below can't be a day out).
      const untilDays = daysUntilEventDay(event.start, eventTimeZone(event));
      const up = !live && (untilDays ?? 0) > 0;
      const state: MyTeamTimelineRow["state"] = live ? "live" : up ? "up" : "done";
      const eventAwards = seasonAwards.filter((a) => a.event.id === event.id);
      const wins = team ? computeEventAwardWins(event, eventAwards, team.id, isIq) : computeEventAwardWins(event, [], 0, isIq);
      const rk = seasonRankings.find((r) => r.event.id === event.id) ?? null;
      const sk = skillSummary(seasonSkills.filter((s) => s.event.id === event.id));
      return {
        event,
        state,
        start,
        isNext: false,
        wins,
        rank: rk?.rank ?? null,
        // VEX IQ is cooperative — no win/loss. Show the teamwork average instead of a
        // meaningless "0–0" record.
        record: isIq ? null : (rk ? `${rk.wins ?? 0}–${rk.losses ?? 0}` : null),
        avgScore: isIq ? (rk?.average_points ?? null) : null,
        skills: sk.combined ?? null,
        days: up ? Math.max(0, untilDays ?? 0) : null,
        nextMatch: live && nextUp ? shortMatchName(nextUp.name) : null,
      };
    });
    rows.sort((a, b) => a.start - b.start);
    const firstUp = rows.find((r) => r.state === "up");
    if (firstUp) firstUp.isNext = true;
    return rows;
  }, [teamEvents, seasonId, seasonAwards, seasonRankings, seasonSkills, nextUp, now, isIq, team]);

  // Recent matches (most recent first) for the season-timeline aside.
  const recentMatches = useMemo(() => {
    if (!team) return [];
    // NOTE: RobotEvents `scored` is unreliable here (often false even for played
    // matches), so we key off actual alliance scores like the season record does.
    return seasonMatches
      .filter((m) => !/practice/i.test(m.name) && !isScrimmageEvent(eventIndex.get(m.event.id)) && m.alliances.some((a) => a.teams.some((t) => t.team.id === team.id)))
      .map((m) => {
        const mine = m.alliances.find((a) => a.teams.some((t) => t.team.id === team.id));
        const opp = m.alliances.find((a) => a !== mine);
        const ev = eventIndex.get(m.event.id);
        return {
          id: m.id,
          label: shortMatchName(m.name),
          outcome: isIq ? null : teamMatchOutcome(m, team.id),
          teamScore: mine?.score ?? null,
          oppScore: opp?.score ?? null,
          sort: ev ? new Date(ev.start ?? 0).getTime() : 0,
          order: m.matchnum ?? 0,
        };
      })
      .filter((r) => r.teamScore != null && r.oppScore != null)
      .sort((a, b) => (b.sort - a.sort) || (b.order - a.order))
      .slice(0, 6);
  }, [seasonMatches, team, eventIndex, isIq]);

  // Recent skills grouped by event (driver + programming on one row), newest first.
  const recentSkills = useMemo(() => {
    const byEvent = new Map<number, { eventId: number; event: Event | undefined; driver: number | null; prog: number | null; sort: number }>();
    for (const s of seasonSkills) {
      if ((s.score ?? 0) <= 0) continue;
      const ev = eventIndex.get(s.event.id);
      const cur = byEvent.get(s.event.id) ?? { eventId: s.event.id, event: ev, driver: null, prog: null, sort: ev ? new Date(ev.start ?? 0).getTime() : 0 };
      const t = s.type.toLowerCase();
      if (t.includes("driver")) cur.driver = Math.max(cur.driver ?? 0, s.score ?? 0);
      else if (t.includes("program")) cur.prog = Math.max(cur.prog ?? 0, s.score ?? 0);
      byEvent.set(s.event.id, cur);
    }
    return [...byEvent.values()]
      .filter((r) => r.driver != null || r.prog != null)
      .sort((a, b) => b.sort - a.sort)
      .slice(0, 5);
  }, [seasonSkills, eventIndex]);

  // Height-match the live timeline to the matches panel and open scrolled to "now".
  const matchesPanelRef = useRef<HTMLDivElement>(null);
  const tlPanelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!liveEvent) return;
    const mp = matchesPanelRef.current, tp = tlPanelRef.current;
    if (!mp || !tp) return;
    if (window.matchMedia("(max-width:880px)").matches) { tp.style.height = ""; return; }
    tp.style.height = `${mp.offsetHeight}px`;
    const scroll = tp.querySelector<HTMLElement>(".myteam-tl-scroll");
    const node = tp.querySelector<HTMLElement>(".myteam-node.live");
    if (scroll && node) scroll.scrollTop = Math.max(0, node.offsetTop - 8);
  }, [liveEvent, liveMatches.length, timeline.length]);

  // ── states ──────────────────────────────────────────────────────────────
  if (ready && (!teamNumber || !teamProgramId)) {
    return (
      <div className="myteam-page">
        <div className="panel myteam-empty">
          <Star size={26} />
          <h2>Set your team</h2>
          <p>Add your team number and program to your profile to unlock the My Team tab — your live events, matches, and season at a glance.</p>
          <Link href="/settings" className="button-link">Go to settings</Link>
        </div>
      </div>
    );
  }
  if (lookup.loading || (!team && events.loading)) {
    return <div className="myteam-page"><Status loading={true} error={null} /></div>;
  }
  if (!team) {
    return <div className="myteam-page"><div className="panel myteam-empty"><h2>Team not found</h2><p>We couldn't find {programLabel(profile?.team_program)} {teamNumber}.</p><Link href="/settings" className="button-link">Update profile</Link></div></div>;
  }

  const renderPieces = (row: MyTeamTimelineRow) => {
    const pieces: ReactNode[] = [];
    if (row.state === "up") {
      pieces.push("Registered");
      if (row.days != null) pieces.push(<>in <b>{row.days}</b> days</>);
    } else if (row.state === "live") {
      if (row.rank != null) pieces.push(<>Rank <b>#{row.rank}</b></>);
      if (row.record) pieces.push(<b>{row.record}</b>);
      else if (row.avgScore != null) pieces.push(<>Avg <b>{row.avgScore}</b></>);
      if (row.nextMatch) pieces.push(<>Next <b>{row.nextMatch}</b></>);
      if (!pieces.length) pieces.push("In progress");
    } else {
      if (row.rank != null) pieces.push(<>Rank <b>#{row.rank}</b></>);
      if (row.record) pieces.push(<b>{row.record}</b>);
      else if (row.avgScore != null) pieces.push(<>Avg <b>{row.avgScore}</b></>);
      if (row.skills) pieces.push(<>Skills <b>{row.skills}</b></>);
      if (!pieces.length) pieces.push("Played");
    }
    return pieces.map((p, i) => <span key={i} className={`myteam-rp${i === 0 ? " lead" : ""}`}>{p}</span>);
  };

  const liveAlliances = (m: Match) => {
    const { red, blue } = matchWinner(m);
    return { red, blue };
  };

  const header = (
    <div className="myteam-head">
      <span className="myteam-num">{team.number}</span>
      <div>
        <h1>
          {team.team_name
            ? <TranslatedText text={team.team_name} country={team.location?.country} />
            : team.number}
        </h1>
        <div className="myteam-meta">
          {team.organization && (
            <TranslatedText text={team.organization} country={team.location?.country} />
          )}
          <span>{locationLine(team)}</span>
          <span className="badge">{programSlug(team.program)}</span>
          {team.grade && <span className="badge">{team.grade}</span>}
        </div>
      </div>
      <div className="myteam-actions">
        <Link href="/settings" className="button-link secondary sm">Change team</Link>
        {seasonOptions.length > 0 && (
          <Select value={seasonId != null ? String(seasonId) : undefined} onValueChange={(v) => setSelectedSeasonId(Number(v))}>
            <SelectTrigger className="myteam-season-select" aria-label="Season">
              <SelectValue placeholder="Season" />
            </SelectTrigger>
            <SelectContent>
              {seasonOptions.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{shortSeasonName(s.name)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );

  const statStrip = (
    <div className="myteam-stats">
      {isIq ? (
        <>
          <div className="myteam-stat"><div className="k">Avg teamwork</div><div className="v">{iqTeamworkSummary.avgTeamwork ?? "—"}</div><div className="sub">qualification avg</div></div>
          <div className="myteam-stat"><div className="k">Events</div><div className="v">{iqTeamworkSummary.eventCount}</div><div className="sub">this season</div></div>
        </>
      ) : (
        <>
          <div className="myteam-stat"><div className="k">Record</div><div className="v">{record.w}–{record.l}{record.t ? `–${record.t}` : ""}</div><div className="sub">{totalGames} matches played</div></div>
          <div className="myteam-stat"><div className="k">Win rate</div><div className="v">{winPct}<small>%</small></div><div className="sub">season to date</div></div>
        </>
      )}
      <div className="myteam-stat"><div className="k">Skills score</div><div className="v"><ScoreBreakdown combined={seasonSkillsSummary.combined} programming={seasonSkillsSummary.programming?.score} driver={seasonSkillsSummary.driver?.score} /></div><div className="sub">{seasonSkillsSummary.programming?.score ?? 0} auto / {seasonSkillsSummary.driver?.score ?? 0} driver</div></div>
      <div className="myteam-stat"><div className="k">World skills rank</div><div className="v">{worldSkills.loading ? "…" : wsEntry ? `#${wsEntry.rank.toLocaleString()}` : "—"}</div><div className="sub">globally this season</div></div>
      <div className="myteam-stat"><div className="k">Awards</div><div className="v">{seasonAwards.length}</div><div className="sub">this season</div></div>
    </div>
  );

  const liveBand = liveEvent && (
    <section className="panel myteam-live">
      <h2>
        <span className="ttl"><span className="live-dot">Competing now</span><span className="myteam-evname">{liveEvent.name}</span></span>
        <Link className="myteam-act" href={eventPath(liveEvent)}>Event page →</Link>
      </h2>
      <div className="myteam-live-body">
        <div className="myteam-seg">
          <div className="myteam-seg-lab">Next up {nextUp && <span className="q">queuing</span>}</div>
          {nextUp ? (
            <>
              <div className="myteam-deck">
                <span className="myteam-mname">{shortMatchName(nextUp.name)}</span>
                <span className="alliance-cell red-alliance-cell"><AllianceTeamLinks teams={liveAlliances(nextUp).red?.teams} focusTeamId={team.id} /></span>
                <span className="myteam-vs">vs</span>
                <span className="alliance-cell blue-alliance-cell"><AllianceTeamLinks teams={liveAlliances(nextUp).blue?.teams} focusTeamId={team.id} /></span>
              </div>
              <div className="myteam-kvrow">
                {nextUp.field && <div className="myteam-kv"><span className="kl">Field</span><span className="kv-v">{nextUp.field}</span></div>}
                {formatMatchClock(nextUp, liveTz) && <div className="myteam-kv"><span className="kl">Est. time</span><MatchTime match={nextUp} eventTz={liveTz} className="kv-v" /></div>}
                {partner && <div className="myteam-kv"><span className="kl">Partner</span><span className="kv-v">{partner.name}</span></div>}
              </div>
            </>
          ) : (
            <div className="myteam-seg-empty">All qualification matches complete.</div>
          )}
        </div>
        <div className="myteam-seg">
          <div className="myteam-seg-lab">Qualification</div>
          {liveRanking ? (
            <>
              <div className="myteam-seg-rank"><span className="n">#{liveRanking.rank}</span>{liveRanking.division?.name && <TranslatedText className="of" text={liveRanking.division.name} />}</div>
              <div className="myteam-kvrow">
                <div className="myteam-kv"><span className="kl">Record</span><span className="kv-v">{liveRanking.wins ?? 0}–{liveRanking.losses ?? 0}{liveRanking.ties ? `–${liveRanking.ties}` : ""}</span></div>
                <div className="myteam-kv"><span className="kl">WP</span><span className="kv-v">{liveRanking.wp ?? 0}</span></div>
                <div className="myteam-kv"><span className="kl">AP</span><span className="kv-v">{liveRanking.ap ?? 0}</span></div>
                <div className="myteam-kv"><span className="kl">SP</span><span className="kv-v">{liveRanking.sp ?? 0}</span></div>
              </div>
            </>
          ) : (
            <div className="myteam-seg-empty">Rankings not posted yet.</div>
          )}
        </div>
        <div className="myteam-seg">
          <div className="myteam-seg-lab">Skills</div>
          {liveSkills && liveSkills.combined != null ? (
            <>
              <div className="myteam-seg-rank"><span className="n">{liveSkills.rank ? `#${liveSkills.rank}` : "—"}</span><span className="of">{liveSkills.combined} pts</span></div>
              <div className="myteam-kvrow">
                <div className="myteam-kv"><span className="kl">Auto</span><span className="kv-v">{liveSkills.programming?.score ?? 0}</span></div>
                <div className="myteam-kv"><span className="kl">Driver</span><span className="kv-v">{liveSkills.driver?.score ?? 0}</span></div>
              </div>
            </>
          ) : (
            <div className="myteam-seg-empty">No skills runs yet.</div>
          )}
        </div>
      </div>
    </section>
  );

  const upNextPanel = !liveEvent && (
    <section className="panel myteam-upnext-panel">
      <h2><span className="ttl">Up next</span><span className="myteam-act muted-act">Not currently at an event</span></h2>
      {nextEvent ? (
        <div className="myteam-upnext">
          <Link className="myteam-cal" href={eventPath(nextEvent)}><div className="mo">{new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(nextEvent.start ?? 0))}</div><div className="day">{new Date(nextEvent.start ?? 0).getDate()}</div></Link>
          <div className="info">
            <Link className="nm" href={eventPath(nextEvent)}>{nextEvent.name}</Link>
            <div className="sub"><span>{locationLine(nextEvent)}</span><span className={`event-priority priority-${eventCategory(nextEvent).rank}`}>{eventCategory(nextEvent).label}</span><span>{myTeamDateLabel(nextEvent.start)}</span></div>
          </div>
          <div className="right">
            <div className="count"><div className="n">{Math.max(0, Math.round((new Date(nextEvent.start ?? 0).getTime() - now) / oneDay))}</div><div className="l">days away</div></div>
            <div className="count"><div className="n">{nextEventTeamCount ?? "…"}</div><div className="l">teams</div></div>
          </div>
        </div>
      ) : (
        <div className="myteam-upnext-empty">No upcoming events on the calendar.</div>
      )}
    </section>
  );

  const matchesPanel = liveEvent && (
    <div className="panel myteam-matches-panel" ref={matchesPanelRef}>
      <h2><span className="ttl">Matches</span><span className="myteam-act muted-act">{liveEvent.name}</span></h2>
      <table className="results-match-table">
        <colgroup>
          <col className="results-play-col" />
          <col className="results-match-col" />
          <col className="results-alliance-col" />
          <col className="results-score-col" />
          <col className="results-alliance-col" />
        </colgroup>
        <thead><tr><th aria-label="Play" /><th>Match</th><th>Red Alliance</th><th>Score</th><th>Blue Alliance</th></tr></thead>
        <tbody>
          {liveMatches.map((m) => {
            const { red, blue, redScore, blueScore, winner } = matchWinner(m);
            const hasScore = winner !== "-";
            const ts = timestampMap.get(m.id);
            const canPlay = presetSupported && ts && ts.timestamp !== null && ts.videoId;
            const isNext = nextUp?.id === m.id;
            return (
              <tr key={m.id} className={isNext ? "myteam-next-row" : ""}>
                <td className="play-cell">
                  {canPlay ? (
                    <button className="play-dot active" onClick={() => onMyTeamOpenMatch(m, ts!, setPlayback)} title={`Play ${m.name}`} />
                  ) : (
                    <span className="play-dot disabled" />
                  )}
                </td>
                <td className="result-match-name">
                  <span className="result-match-line">
                    <span className="result-match-label">{shortMatchName(m.name)}</span>
                    {m.field && <span className="result-field-name">{m.field}</span>}
                  </span>
                </td>
                <td className={`alliance-cell red-alliance-cell ${winner === "Red" ? "winning-alliance-cell" : ""}`}><AllianceTeamLinks teams={red?.teams} focusTeamId={team.id} /></td>
                <td className="score-cell">
                  {hasScore ? (
                    <FocusScorePair match={m} focusTeamId={team.id} redScore={redScore} blueScore={blueScore} winner={winner} />
                  ) : isNext ? (
                    <span className="myteam-nextpill">Next up</span>
                  ) : (
                    <MatchTime match={m} eventTz={liveTz} />
                  )}
                </td>
                <td className={`alliance-cell blue-alliance-cell ${winner === "Blue" ? "winning-alliance-cell" : ""}`}><AllianceTeamLinks teams={blue?.teams} focusTeamId={team.id} /></td>
              </tr>
            );
          })}
          {!liveMatches.length && <tr><td colSpan={5}><Empty>No matches posted yet.</Empty></td></tr>}
        </tbody>
      </table>
    </div>
  );

  const timelineNode = (row: MyTeamTimelineRow, showHint?: boolean) => (
    <>
      <div className="row"><TranslatedText className="nm" text={row.event.name} country={row.event.location?.country} /><span className="dt">{myTeamDateLabel(row.event.start)}</span></div>
      <div className="myteam-evmeta"><span className="loc">{locationLine(row.event)}</span></div>
      <div className="myteam-evtags"><span className={`event-priority priority-${eventCategory(row.event).rank}`}>{eventCategory(row.event).label}</span><AwardCrowns wins={row.wins} showHint={showHint} /></div>
      <div className="myteam-resline">{renderPieces(row)}</div>
    </>
  );

  const liveTimeline = liveEvent && (
    <div className="panel myteam-tl-panel" ref={tlPanelRef}>
      <h2><span className="ttl">Season timeline</span><span className="myteam-act muted-act">{timeline.length} events</span></h2>
      <div className="myteam-tl-scroll">
        <div className="myteam-timeline">
          {timeline.map((row, i) => (
            <Link key={row.event.id} href={eventPath(row.event)} className={`myteam-node ${row.state}`}>{timelineNode(row, i === 0)}</Link>
          ))}
        </div>
      </div>
      <div className="myteam-tl-legend">
        <span><i className="live" /> Live</span><span><i className="done" /> Completed</span><span><i className="up" /> Upcoming</span>
      </div>
    </div>
  );

  const fullTimeline = !liveEvent && (
    <div className="myteam-timeline-row">
      <section className="panel myteam-tl2-panel">
        <h2><span className="ttl">Season timeline</span><span className="myteam-act muted-act">{timeline.length} events</span></h2>
        <div className="myteam-tl2-scroll">
        <div className="myteam-timeline2">
          {timeline.map((row, i) => (
            <div key={row.event.id} className={`myteam-tnode ${i % 2 ? "right" : "left"} ${row.state} ${row.isNext ? "next" : ""}`}>
              <Link href={eventPath(row.event)} className="myteam-tcard">{timelineNode(row, i === 0)}</Link>
            </div>
          ))}
          {!timeline.length && <div className="myteam-upnext-empty">No events this season yet.</div>}
        </div>
        </div>
        <div className="myteam-tl-legend center">
          <span><i className="nextpt" /> Next up</span><span><i className="up" /> Upcoming</span><span><i className="done" /> Completed</span>
        </div>
      </section>
      <aside className="panel myteam-recent myteam-timeline-aside">
        <div className="myteam-recent-block">
          <div className="myteam-recent-head">Recent matches</div>
          {recentMatches.length > 0 ? (
            <ul className="myteam-recent-list">
              {recentMatches.map((m) => (
                <li key={m.id} className="myteam-recent-row">
                  <span className="rr-label">{m.label}</span>
                  <span className="rr-right">
                    {m.outcome && <span className={`rr-badge rr-${m.outcome}`}>{m.outcome}</span>}
                    <span className="rr-score">{m.teamScore ?? "—"}<span className="rr-dash">–</span>{m.oppScore ?? "—"}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="myteam-recent-empty">No matches yet.</p>
          )}
        </div>
        <div className="myteam-recent-block">
          <div className="myteam-recent-head">Recent skills</div>
          {recentSkills.length > 0 ? (
            <ul className="myteam-recent-list">
              {recentSkills.map((r) => {
                const ev = r.event;
                const href = ev ? urlWithHash(`${eventPath(ev)}?focusTeam=${team.id}&focusTeamNum=${encodeURIComponent(team.number)}`, "skills") : null;
                return (
                  <li key={r.eventId} className="myteam-recent-row myteam-recent-skill">
                    {href
                      ? <Link className="rr-open" href={href} title="Open event skills"><ExternalLink size={13} /></Link>
                      : <span className="rr-open rr-open-off"><ExternalLink size={13} /></span>}
                    <span className="rr-label rr-label-event">{ev?.name ?? "Event"}</span>
                    <span className="rr-right">
                      <span className="rr-skill"><span className="rr-skill-k">D</span>{r.driver ?? "—"}</span>
                      <span className="rr-skill"><span className="rr-skill-k">P</span>{r.prog ?? "—"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="myteam-recent-empty">No skills runs yet.</p>
          )}
        </div>
      </aside>
    </div>
  );

  return (
    <div className="myteam-page">
      {header}
      {liveBand}
      {upNextPanel}
      {statStrip}
      {liveEvent ? (
        <div className="myteam-lower">{matchesPanel}{liveTimeline}</div>
      ) : (
        fullTimeline
      )}
      {SHOW_TEAM_SHARE_CARD && (
        <TeamShareCard team={team} record={record} winPct={winPct} skills={seasonSkillsSummary.combined} worldRank={wsEntry?.rank ?? null} awards={seasonAwards.length} season={season?.name} />
      )}
      {playback && <MatchVideoOverlay playback={playback} onClose={() => setPlayback(null)} />}
    </div>
  );
}

function onMyTeamOpenMatch(match: Match, timestamp: MatchTimestamp, setPlayback: (p: MatchPlayback) => void) {
  setPlayback({ match, timestamp });
}

// Apple-style shareable team card. Kept for later; gated behind SHOW_TEAM_SHARE_CARD.
function TeamShareCard({ team, record, winPct, skills, worldRank, awards, season }: {
  team: Team;
  record: { w: number; l: number; t: number };
  winPct: number;
  skills: number | null;
  worldRank: number | null;
  awards: number;
  season?: string;
}) {
  return (
    <section className="panel myteam-share">
      <svg viewBox="0 0 1600 900" className="myteam-share-svg" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="1600" height="900" rx="28" fill="#08090b" />
        <text x="64" y="120" fill="#7fe9f7" fontFamily="var(--font-geist-mono)" fontSize="22" letterSpacing="6">MY TEAM {season ? `· ${season}` : ""}</text>
        <text x="60" y="280" fill="#22d3ee" fontFamily="var(--font-geist-mono)" fontSize="130" fontWeight="700">{team.number}</text>
        <text x="62" y="390" fill="#ffffff" fontSize="92" fontWeight="600">{team.team_name || team.number}</text>
        <text x="64" y="520" fill="#c7cbd2" fontSize="40" fontWeight="600">{record.w}–{record.l}{record.t ? `–${record.t}` : ""} · {winPct}% win</text>
        <text x="64" y="600" fill="#c7cbd2" fontSize="40" fontWeight="600">Skills {skills ?? "–"}{worldRank ? ` · #${worldRank} world` : ""}</text>
        <text x="64" y="680" fill="#c7cbd2" fontSize="40" fontWeight="600">{awards} awards</text>
        <text x="64" y="840" fill="#5a5e66" fontFamily="var(--font-geist-mono)" fontSize="20" letterSpacing="2">OPENSCOUT.ING</text>
      </svg>
    </section>
  );
}

function route(path: string) {
  if (path === "/") return <Home />;
  if (path === "/settings") return <SettingsPage />;
  if (path === "/events") return <EventsPage />;
  if (path === "/teams") return <TeamsPage />;
  if (path === "/skills") return <WorldSkillsPage />;
  if (path === "/jumper") return <JumperPage />;
  const myTeamMatch = path.match(/^\/my-team(?:\/([0-9a-f-]+))?$/i);
  if (myTeamMatch) return <MyTeamPage sharedTeamId={myTeamMatch[1] ?? null} />;
  if (path === "/insights") return <InsightsPage />;
  if (path === "/terms") return <TermsPage />;
  if (path === "/privacy") return <PrivacyPage />;
  const joinMatch = path.match(/^\/join\/([0-9a-f-]+)$/i);
  if (joinMatch) return <JoinSharedTeamPage token={joinMatch[1]} />;
  // Redirect legacy /org/:id[/settings] and /shared-team/:id[/settings] → /my-team/:id
  const legacyOrg = path.match(/^\/org\/([0-9a-f-]+)(\/settings)?$/i);
  if (legacyOrg) { navigate(`/my-team/${legacyOrg[1]}${legacyOrg[2] ? "#settings" : ""}`); return null; }
  const stMatch = path.match(/^\/shared-team\/([0-9a-f-]+)(\/settings)?$/i);
  if (stMatch) { navigate(`/my-team/${stMatch[1]}${stMatch[2] ? "#settings" : ""}`); return null; }
  const compareMatch = path.match(/^\/compare\/(.+)$/);
  if (compareMatch) return <CompareFromUrl param={compareMatch[1]} />;
  const eventMatch = path.match(/^\/events?\/(.+)$/);
  if (eventMatch) return <EventDetail param={decodeURIComponent(eventMatch[1])} />;
  const teamMatch = path.match(/^\/teams?\/(.+)$/);
  if (teamMatch) return <TeamDetail param={teamMatch[1]} />;
  return <NotFound />;
}

// Feed the breadcrumb history store from route changes. Listing pages start a
// fresh trail, entity pages append (with a placeholder label refined once the
// page loads), home clears it, and other pages leave the trail untouched.
function recordBreadcrumb(path: string) {
  const p = path.split("?")[0].split("#")[0];
  if (p === "/") return clearTrail();
  if (p === "/events") return recordTrail({ path: p, kind: "list", label: "Events" });
  if (p === "/teams") return recordTrail({ path: p, kind: "list", label: "Teams" });
  if (p === "/skills") return recordTrail({ path: p, kind: "list", label: "Skills" });
  const eventMatch = p.match(/^\/events?\/(.+)$/);
  if (eventMatch) return recordTrail({ path: p, kind: "event", label: decodeURIComponent(eventMatch[1]) });
  const teamMatch = p.match(/^\/teams?\/(.+)$/);
  if (teamMatch) return recordTrail({ path: p, kind: "team", label: decodeURIComponent(teamMatch[1].split("/").pop() ?? teamMatch[1]) });
  const myTeamTeamMatch = p.match(/^\/my-team\/([0-9a-f-]+)/i);
  if (myTeamTeamMatch) return recordTrail({ path: p, kind: "shared-team", label: "Shared Team" });
  // Everything else (settings, insights, my-team, compare, join, legal) is not
  // part of the breadcrumb hierarchy — leave the trail as it is.
}

export default function App() {
  const path = useRoute();
  const spotlightOpen = useSyncExternalStore(subscribeSpotlight, getSpotlightOpen, getSpotlightOpen);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const trayEntries = useCompareTray();
  const compareModalOpen = useCompareModalOpen();
  const quickView = useQuickView();

  // Re-render once the Spotlight-tier SKUs land, since eventCategory reads them
  // from module scope rather than from props. The fetch itself is triggered by the
  // api layer, only when an events payload actually contains a `level: "World"`
  // row — see src/spotlightTier.ts.
  useSyncExternalStore(subscribeSpotlightTier, getSpotlightTierVersion, getSpotlightTierVersion);

  // Keep the search nudge pointed at the profile's own team (never the shared
  // teams). Clears itself on sign-out, so a signed-out visitor searches unbiased.
  const { profile } = useAuth();
  useEffect(() => {
    syncSearchBias(profile?.team_program, profile?.team_number);
  }, [profile?.team_program, profile?.team_number]);

  useEffect(() => {
    loadYouTubeApi();
    // Four one-row requests — warm them on any entry point so the home sidebar's
    // skills leaders are already there when the visit reaches them.
    prefetchSkillsLeaders();
  }, []);

  // Update the breadcrumb history before paint so the trail is correct on the
  // first frame of each route (no one-frame flash of the previous trail).
  useLayoutEffect(() => {
    recordBreadcrumb(path);
  }, [path]);

  // Global keyboard shortcuts
  useEffect(() => {
    let lastChordKey = "";
    let lastChordTime = 0;

    const handler = (e: globalThis.KeyboardEvent) => {
      // Cmd+K / Ctrl+K — fires even when typing in an input
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        _spotlightOpen ? closeSpotlight() : openSpotlight();
        return;
      }

      // All remaining shortcuts are suppressed when typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable) return;

      // / → open spotlight
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        openSpotlight();
        return;
      }

      // ? → shortcuts cheat sheet
      if (e.key === "?") {
        setShortcutsOpen(true);
        return;
      }

      // F → open the in-event team search (when on an event page)
      if (e.key === "f" && !e.metaKey && !e.ctrlKey && !e.altKey && _openEventSearch !== null) {
        e.preventDefault();
        _openEventSearch();
        return;
      }

      // C → toggle current team in compare tray (when on a team page)
      if (e.key === "c" && !e.metaKey && !e.ctrlKey && _currentTeam !== null) {
        const t = _currentTeam;
        isInTray(t.id)
          ? removeFromTray(t.id)
          : addToTray({ teamId: t.id, teamNumber: t.number, programCode: programSlug(t.program), teamName: t.team_name ?? undefined });
        return;
      }

      // Chord navigation: G then H / E / T / C within 500ms
      const now = Date.now();
      if (now - lastChordTime < 500 && lastChordKey === "g") {
        if (e.key === "h") { navigate("/");        lastChordKey = ""; lastChordTime = 0; return; }
        if (e.key === "e") { navigate("/events");  lastChordKey = ""; lastChordTime = 0; return; }
        if (e.key === "t") { navigate("/teams");   lastChordKey = ""; lastChordTime = 0; return; }
        if (e.key === "c") { if (getTrayEntries().length >= 2) openCompareModal(_currentEventSeasonId ?? undefined, _currentEventId ?? undefined); lastChordKey = ""; lastChordTime = 0; return; }
      }
      if (e.key === "g") { lastChordKey = "g"; lastChordTime = now; }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // intentionally stable — reads module-level _spotlightOpen directly

  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <Layout path={path}>
          {/* Keyed by route so a caught error clears automatically when the user
              navigates elsewhere; the nav shell (Layout) stays mounted. */}
          <ErrorBoundary key={path}>{route(path)}</ErrorBoundary>
        </Layout>
        <ErrorBoundary silent><OnboardingModal /></ErrorBoundary>
        {spotlightOpen && <ErrorBoundary silent><CommandPalette onClose={closeSpotlight} /></ErrorBoundary>}
        {shortcutsOpen && <ErrorBoundary silent><ShortcutsOverlay onClose={() => setShortcutsOpen(false)} /></ErrorBoundary>}
        {trayEntries.length > 0 && <ErrorBoundary silent><CompareTray entries={trayEntries} /></ErrorBoundary>}
        {compareModalOpen && <ErrorBoundary silent><ComparisonModal entries={trayEntries} onClose={closeCompareModal} /></ErrorBoundary>}
        {quickView && <ErrorBoundary silent><TeamQuickView key={_quickViewSeq} state={quickView} onClose={closeQuickView} /></ErrorBoundary>}
      </ErrorBoundary>
    </MotionConfig>
  );
}
