// Shared types for the model artifact and the simulation outputs.

export type Stage =
  | "group"
  | "R32"
  | "R16"
  | "QF"
  | "SF"
  | "third_place"
  | "final";

export interface GlobalParams {
  mu: number;
  gamma_host: number;
  rho: number;
}

export interface TeamRating {
  name: string;
  group: string;
  pot: number;
  confederation: string;
  fifa_rank: number;
  host: boolean;
  elo: number;
  atk: number;
  def: number;
  rating: number;
  prior: { z_overall_mle: number; z_elo: number; z_tilt_mle: number };
}

export interface GroupFixture {
  id: string;
  stage: "group";
  group: string;
  matchday: number;
  home: string;
  away: string;
  host_home: boolean;
  host_away: boolean;
}

export interface ScorerWeight {
  player: string;
  weight: number;
}

export interface ScorerModel {
  open_play: ScorerWeight[];
  penalty_taker: string;
  penalty_share: number;
  own_goal_share: number;
}

export interface SquadPlayer {
  name: string;
  role: string;
  group: string; // position group GK/DF/MF/FW
  club: string;
  tier: string;
  real: boolean;
  npxg90: number;
  xa90: number;
  ability: number;
  club_strength: number;
  position_factor: number;
  defense_factor: number;
  caps?: number;
  intl_goals?: number;
  number?: number;
}

export interface Squad {
  team: string;
  formation: string;
  players: SquadPlayer[];
  projected_eleven: string[];
  captain: string;
  penalty_taker: string;
  set_piece_taker: string;
}

export interface BlendConstants {
  base_mean: number;
  base_std: number;
  tilt_mean: number;
  tilt_std: number;
  squad_attack_mean: number;
  squad_attack_std: number;
  squad_def_mean: number;
  squad_def_std: number;
  squad_overall_std: number;
  squad_tilt_std: number;
}

export interface ModelMeta {
  name: string;
  snapshot_date: string;
  generated: string;
  model: string;
  global: GlobalParams;
  hosts: string[];
  hyperparameters: Record<string, number>;
  blend: BlendConstants;
  format: { n_teams: number; n_groups: number; group_size: number; matches: number };
  sources: string[];
  n_fit_matches: number;
  n_fit_teams: number;
}

export interface Model {
  meta: ModelMeta;
  validation: Record<string, unknown>;
  teams: TeamRating[];
  fixtures: GroupFixture[];
  squads: Record<string, Squad>;
  scorers: Record<string, ScorerModel>;
}

// --- simulation result types --------------------------------------------------

export interface MatchResult {
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  stage: Stage;
  /** Set for knockout ties decided after level scores. */
  afterExtraTime?: boolean;
  shootout?: { home: number; away: number; winner: string };
  winner?: string; // for knockout ties
  scorers: GoalEvent[];
}

export interface GoalEvent {
  team: string;
  player: string;
  kind: "open" | "penalty" | "own";
  assist?: string;
}

export interface GroupStanding {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  rank: number; // 1..4 within the group
}

export interface TournamentResult {
  champion: string;
  runnerUp: string;
  third: string;
  groupStandings: Record<string, GroupStanding[]>;
  bestThirds: string[];
  // furthest stage reached by each team
  reached: Record<string, Stage>;
  goals: Record<string, number>; // player -> goals (Golden Boot)
  assists: Record<string, number>; // player -> assists
  cleanSheets: Record<string, number>; // goalkeeper -> clean sheets
  matches: MatchResult[];
}
