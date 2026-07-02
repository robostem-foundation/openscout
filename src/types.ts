export type IdInfo = {
  id: number;
  name: string;
  code?: string | null;
};

export type PageMeta = {
  current_page: number;
  last_page: number;
  next_page_url: string | null;
  prev_page_url: string | null;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
};

export type Paginated<T> = {
  meta: PageMeta;
  data: T[];
};

export type Location = {
  venue?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  coordinates?: { lat: number; lon: number } | null;
};

export type Program = {
  id: number;
  abbr: string;
  name: string;
};

export type CountryOption = {
  label: string;
  value: number;
  country_id: string;
};

export type CountryGroup = {
  label: string;
  options: CountryOption[];
};

export type CountryRegion = {
  id: number;
  country_id: number;
  code: string;
  name: string;
};

export type Season = {
  id: number;
  name: string;
  code?: string | null;
  start?: string;
  end?: string;
  program?: IdInfo;
};

export type Division = {
  id: number;
  name: string;
  order?: number;
};

export type Event = {
  id: number;
  sku: string;
  name: string;
  start?: string;
  end?: string;
  season: IdInfo;
  program: IdInfo;
  location: Location;
  divisions?: Division[];
  level?: string | null;
  grade?: string | null;
  ongoing?: boolean;
  awards_finalized?: boolean;
  event_type?: string | null;
  // Additional fields returned by the API but not always documented
  format?: string | null;
  capacity?: number | null;
  spots?: { open?: number | null; total?: number | null } | null;
};

export type Team = {
  id: number;
  number: string;
  team_name?: string | null;
  robot_name?: string | null;
  organization?: string | null;
  location?: Location | null;
  registered?: boolean;
  program: IdInfo;
  grade?: string | null;
};

// Raw record from the RoboSTEM `teams_light` endpoint. Leaner field *names* than
// `teams` (team_id/team_num/org), but as of the alphabetical-ordering update it now
// carries location, grade, and registered too.
export type TeamLight = {
  team_id: number;
  team_num: string;
  team_name?: string | null;
  org?: string | null;
  location?: Location | null;
  grade?: string | null;
  registered?: boolean;
  program: IdInfo;
};

export type AllianceTeam = {
  team: IdInfo;
  sitting?: boolean;
};

export type Alliance = {
  color: "red" | "blue" | string;
  score: number | null;
  teams: AllianceTeam[];
};

export type Match = {
  id: number;
  event: IdInfo;
  division: IdInfo;
  round: number;
  instance: number;
  matchnum: number;
  scheduled?: string | null;
  started?: string | null;
  field?: string | null;
  scored: boolean;
  name: string;
  alliances: Alliance[];
};

export type JumperPresetExists = {
  exists: boolean;
  sku?: string;
  preset?: string;
  presetName?: string;
  preset_name?: string;
};

export type MatchTimestamp = {
  id: number;
  name: string;
  divisionId: number;
  timestamp: number | null;
  livestreamLink: string | null;
  videoId: string | null;
};

export type Ranking = {
  id: number;
  event: IdInfo;
  division?: IdInfo | null;
  rank: number;
  team: IdInfo;
  wins?: number | null;
  losses?: number | null;
  ties?: number | null;
  wp?: number | null;
  ap?: number | null;
  sp?: number | null;
  high_score?: number | null;
  average_points?: number | null;
  total_points?: number | null;
};

export type Skill = {
  id: number;
  event: IdInfo;
  team: IdInfo;
  type: string;
  season: IdInfo;
  division?: IdInfo | null;
  rank?: number | null;
  score?: number | null;
  attempts?: number | null;
};

export type Award = {
  id: number;
  event: IdInfo;
  order?: number;
  title: string;
  qualifications?: string[];
  classification?: string | null;
  teamWinners?: Array<{ division?: IdInfo | null; team: IdInfo }>;
  individualWinners?: string[];
};

export type WorldSkillsEntry = {
  rank: number;
  team: {
    id: number;
    program?: string;
    team: string;
    teamName?: string | null;
    organization?: string | null;
    city?: string | null;
    region?: string | null;
    eventRegion?: string | null;
    eventRegionId?: number | null;
    country?: string | null;
    gradeLevel?: string | null;
  };
  event?: {
    sku?: string;
    startDate?: string;
    seasonName?: string;
  };
  scores: {
    score: number;
    programming: number;
    driver: number;
    maxProgramming?: number;
    maxDriver?: number;
    combinedStopTime?: number | null;
    progStopTime?: number | null;
    driverStopTime?: number | null;
    progScoredAt?: string | null;
    driverScoredAt?: string | null;
  };
  eligible?: boolean;
};

export type EventInfoWebcastLink = { url: string; platform: "youtube" | "vimeo" | "other"; label: string };

export type EventInfoData = {
  // Raw sanitized inner HTML from the Agenda tab (preserves organiser formatting)
  agenda: { html: string } | null;
  webcast: { description: string; links: EventInfoWebcastLink[] } | null;
  sourceUrl: string;
};

export type SuperscoreRow = {
  rank: number;
  team: { id: number; number: string; name: string };
  season: IdInfo;
  superscore: number;
  auto_skill?: number | null;
  epa?: { total?: number; auto?: number; driver?: number };
  stats?: { offense?: number; defense?: number; ccwm?: number };
  trueskill?: { mu?: number; sigma?: number; conservative?: number };
  signature_wins?: number;
  total_matches?: number;
  calculated_at?: string;
};
