export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: 45,
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_min: number;
  multiple_max: number;
  min_comparables: number;
}

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: string;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number;
    farm_steps: FarmStep[];
  };
  farm_steps: FarmStep[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: FarmStep[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  watchlist_slugs: string[];
  rows: RadarRow[];
  live: LiveRow[];
  comparables: Array<{ category: string; n: number; median_multiple: number }>;
}

export const MODEL_VERSION = "radar-2";

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -40,
  growth_cap: 60,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_min: 0.05,
  multiple_max: 1.5,
  min_comparables: 3,
};

export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

export function ageDays(listedAt: string | null, asOf: string): number | null {
  if (!listedAt) return null;
  const listed = new Date(listedAt).getTime();
  const current = new Date(asOf).getTime();
  if (isNaN(listed) || isNaN(current)) return null;
  const diff = current - listed;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return days < 0 ? 0 : days;
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol, asOf: string): boolean {
  if (!isPreToken(p)) return false;
  const cat = (p.category || "").trim().toLowerCase();
  const excludedCats = [
    "cex",
    "bridge",
    "canonical bridge",
    "liquid staking",
    "liquid restaking",
    "restaked btc",
  ];
  if (excludedCats.includes(cat)) return false;

  const name = p.name || "";
  const words = name.toLowerCase().split(/\s+/);
  const forbiddenWords = ["wrapped", "staked", "staking"];
  if (words.some((w) => forbiddenWords.includes(w))) return false;

  // Check version marker at end of name: space followed by v/V + digits(.digits)?, or digits.digits
  const versionRegex = /(?:\s+[vV]?\d+(?:\.\d+)?|\s+\d+\.\d+)$/;
  if (versionRegex.test(name)) return false;

  return true;
}

export function categoryMultiples(snapshot: Snapshot): Map<string, number> {
  const map = new Map<string, number[]>();

  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.tvl_usd > 0) {
      const mult = p.mcap_usd / p.tvl_usd;
      const cat = p.category || "Unknown";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(mult);
    }
  }

  const result = new Map<string, number>();
  const allMults: number[] = [];

  for (const [cat, mults] of map.entries()) {
    if (mults.length >= MODEL.min_comparables) {
      mults.sort((a, b) => a - b);
      const mid = Math.floor(mults.length / 2);
      const median =
        mults.length % 2 !== 0
          ? mults[mid]
          : (mults[mid - 1] + mults[mid]) / 2;
      const clamped = Math.max(
        MODEL.multiple_min,
        Math.min(MODEL.multiple_max, median)
      );
      result.set(cat, clamped);
    }
    allMults.push(...mults);
  }

  if (allMults.length > 0) {
    allMults.sort((a, b) => a - b);
    const mid = Math.floor(allMults.length / 2);
    const median =
      allMults.length % 2 !== 0
        ? allMults[mid]
        : (allMults[mid - 1] + allMults[mid]) / 2;
    const clamped = Math.max(
      MODEL.multiple_min,
      Math.min(MODEL.multiple_max, median)
    );
    result.set("OVERALL", clamped);
  } else {
    result.set("OVERALL", 0.3);
  }

  return result;
}

export function comparables(
  snapshot: Snapshot
): Array<{ category: string; n: number; median_multiple: number }> {
  const map = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.tvl_usd > 0) {
      const mult = p.mcap_usd / p.tvl_usd;
      const cat = p.category || "Unknown";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(mult);
    }
  }

  const out: Array<{ category: string; n: number; median_multiple: number }> =
    [];
  for (const [cat, mults] of map.entries()) {
    if (mults.length >= MODEL.min_comparables) {
      mults.sort((a, b) => a - b);
      const mid = Math.floor(mults.length / 2);
      const median =
        mults.length % 2 !== 0
          ? mults[mid]
          : (mults[mid - 1] + mults[mid]) / 2;
      const clamped = Math.max(
        MODEL.multiple_min,
        Math.min(MODEL.multiple_max, median)
      );
      out.push({ category: cat, n: mults.length, median_multiple: clamped });
    }
  }

  out.sort((a, b) => {
    if (b.n !== a.n) return b.n - a.n;
    return a.category.localeCompare(b.category);
  });

  return out;
}

export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: Map<string, number>
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
  category: string;
  multiple: number;
} {
  const age = ageDays(protocol.listed_at, asOf);
  const growthRaw = protocol.change_7d ?? 0;
  const growthPct = Math.max(
    MODEL.growth_floor,
    Math.min(MODEL.growth_cap, growthRaw)
  );
  const growthMult = 1 + (growthPct / 100) * MODEL.growth_weight;

  const effectiveAge =
    age === null ? MODEL.unknown_age_days : Math.max(0, age);
  const clampedAge = Math.min(effectiveAge, MODEL.maturity_days);
  const maturityMult =
    MODEL.maturity_floor +
    (clampedAge / MODEL.maturity_days) * MODEL.maturity_range;

  const cat = protocol.category || "Unknown";
  const multiple =
    multiples.get(cat) ?? multiples.get("OVERALL") ?? MODEL.multiple_min;

  const rawImplied = protocol.tvl_usd * multiple * growthMult * maturityMult;
  const implied = Math.max(1, Math.round(rawImplied));

  return {
    implied,
    growthPct,
    growthMult,
    maturityMult,
    age,
    category: cat,
    multiple,
  };
}

export function farmSteps(protocol: SnapshotProtocol): FarmStep[] {
  const chain = protocol.chains[0] || "Ethereum";
  let capital = 50;
  if (protocol.tvl_usd >= 5_000_000_000) capital = 250;
  else if (protocol.tvl_usd >= 1_000_000_000) capital = 150;
  else if (protocol.tvl_usd >= 100_000_000) capital = 100;

  const cat = (protocol.category || "").toLowerCase();
  let actionText = `Deposit funds into ${protocol.name}`;
  if (cat.includes("lending")) {
    actionText = `Supply assets on ${protocol.name} lending markets`;
  } else if (cat.includes("dex") || cat.includes("amm")) {
    actionText = `Provide liquidity on ${protocol.name} pools`;
  } else if (cat.includes("bridge")) {
    actionText = `Bridge assets securely via ${protocol.name}`;
  } else if (cat.includes("staking")) {
    actionText = `Stake assets on ${protocol.name}`;
  } else if (cat.includes("perpetual") || cat.includes("deriv")) {
    actionText = `Open perpetual margin positions on ${protocol.name}`;
  } else if (cat.includes("prediction")) {
    actionText = `Participate in prediction markets on ${protocol.name}`;
  } else if (cat.includes("vault") || cat.includes("yield")) {
    actionText = `Deposit into yield vaults on ${protocol.name}`;
  } else if (cat.includes("stablecoin")) {
    actionText = `Mint stablecoins using ${protocol.name}`;
  } else if (cat.includes("rwa")) {
    actionText = `Mint real-world assets on ${protocol.name}`;
  } else if (cat.includes("insurance")) {
    actionText = `Provide insurance cover on ${protocol.name}`;
  }

  let holdDays = 30;
  // ageDays isn't directly available here without asOf, so estimate or use standard rule. We can default to 30 or check listed_at if needed.
  // Since farmSteps takes only protocol, we use 30 as default for hold.

  const rawSteps = [
    {
      text: `Prepare a fresh non-custodial wallet funded on ${chain} with native gas tokens.`,
      cost: "$5-$20 gas",
      time: "5 mins",
    },
    {
      text: `${actionText} on ${chain} to establish protocol interaction history.`,
      cost: `$${capital} capital`,
      time: "10 mins",
    },
    {
      text: `Perform a weekly qualifying-action or volume swap to maintain active user status.`,
      cost: "$2 gas",
      time: "2 mins/wk",
    },
    {
      text: `Hold position consistently for ${holdDays} days without withdrawing principal.`,
      cost: "opportunity",
      time: `${holdDays} days`,
    },
    {
      text: `Check the protocol own points page regularly and never pay private keys or fees to claim.`,
      cost: "$0",
      time: "1 min",
    },
    {
      text: `Log transaction hashes and interaction dates in your personal farm tracker spreadsheet.`,
      cost: "$0",
      time: "5 mins",
    },
  ];

  return rawSteps.map((s) => stepText(s.text, s.cost, s.time));
}

export function stepText(text: string, cost: string, time: string): FarmStep {
  let combined = `${text} Cost: ${cost}. Time: ${time}.`;
  if (combined.length < 20) {
    combined = combined.padEnd(20, " ");
  }
  if (combined.length > 600) {
    combined = combined.slice(0, 597) + "...";
  }
  return { text: combined, cost, time };
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  const lives: LiveRow[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0) {
      lives.push({
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd,
        change_7d: p.change_7d,
      });
    }
  }
  lives.sort((a, b) => b.mcap_usd - a.mcap_usd);
  return lives.slice(0, LIVE_ROWS);
}

export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const multiples = categoryMultiples(snapshot);
  const watchlistSlugs = new Set(snapshot.watchlist || []);

  const watchlistProtocols: SnapshotProtocol[] = [];
  const otherProtocols: SnapshotProtocol[] = [];

  for (const p of snapshot.protocols) {
    if (watchlistSlugs.has(p.slug)) {
      watchlistProtocols.push(p);
    } else if (isRankable(p, snapshot.as_of) && p.tvl_usd < snapshot.floor_usd) {
      otherProtocols.push(p);
    }
  }

  otherProtocols.sort((a, b) => b.tvl_usd - a.tvl_usd);

  const selectedMap = new Map<string, SnapshotProtocol>();
  for (const p of watchlistProtocols) {
    selectedMap.set(p.slug, p);
  }

  for (const p of otherProtocols) {
    if (selectedMap.size >= EARLY_ROWS) break;
    selectedMap.set(p.slug, p);
  }

  const evaluated: Array<{ protocol: SnapshotProtocol; res: ReturnType<typeof impliedValue> }> = [];
  for (const p of selectedMap.values()) {
    const res = impliedValue(p, snapshot.as_of, multiples);
    evaluated.push({ protocol: p, res });
  }

  evaluated.sort((a, b) => {
    if (b.res.implied !== a.res.implied) {
      return b.res.implied - a.res.implied;
    }
    return a.protocol.slug.localeCompare(b.protocol.slug);
  });

  const boardRows: BoardRow[] = [];
  let rank = 1;
  for (const item of evaluated) {
    const p = item.protocol;
    const res = item.res;
    const steps = farmSteps(p);
    boardRows.push({
      rank: rank++,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: "pre-token",
      age_days: res.age,
      implied_value_usd: res.implied,
      model: {
        multiple: res.multiple,
        growth_pct: res.growthPct,
        growth_multiplier: res.growthMult,
        maturity_multiplier: res.maturityMult,
        age_days: res.age ?? MODEL.unknown_age_days,
        farm_steps: steps,
      },
      farm_steps: steps,
    });
  }

  return boardRows;
}

export function buildRadar(snapshot: Snapshot): RadarData {
  parseSnapshot(snapshot);
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const comps = comparables(snapshot);

  const rows = board.map(radarRow);

  return {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) =>
      snapshot.watchlist.includes(r.slug)
        ? false
        : r.tvl_usd >= snapshot.floor_usd
    ).length,
    live_size: live.length,
    watchlist_slugs: snapshot.watchlist,
    rows,
    live,
    comparables: comps,
  };
}

export function parseSnapshot(data: any): Snapshot {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new SnapshotError("Snapshot must be an object");
  }
  if (typeof data.as_of !== "string") {
    throw new SnapshotError("Snapshot missing as_of string");
  }
  if (typeof data.source !== "string") {
    throw new SnapshotError("Snapshot missing source string");
  }
  if (typeof data.floor_usd !== "number" || isNaN(data.floor_usd)) {
    throw new SnapshotError("Snapshot missing floor_usd number");
  }
  if (!Array.isArray(data.protocols)) {
    throw new SnapshotError("Snapshot protocols must be an array");
  }
  if (!Array.isArray(data.watchlist)) {
    throw new SnapshotError("Snapshot watchlist must be an array");
  }

  for (const p of data.protocols) {
    if (!p || typeof p !== "object")
      throw new SnapshotError("Protocol must be an object");
    if (typeof p.slug !== "string")
      throw new SnapshotError("Protocol missing slug");
    if (typeof p.name !== "string")
      throw new SnapshotError("Protocol missing name");
    if (p.category !== null && typeof p.category !== "string")
      throw new SnapshotError("Protocol category must be string or null");
    if (!Array.isArray(p.chains) || p.chains.some((c: any) => typeof c !== "string"))
      throw new SnapshotError("Protocol chains must be string array");
    if (typeof p.tvl_usd !== "number" || isNaN(p.tvl_usd))
      throw new SnapshotError("Protocol tvl_usd must be a number");
    if (p.change_7d !== null && (typeof p.change_7d !== "number" || isNaN(p.change_7d)))
      throw new SnapshotError("Protocol change_7d must be number or null");
    if (p.mcap_usd !== null && (typeof p.mcap_usd !== "number" || isNaN(p.mcap_usd)))
      throw new SnapshotError(
        "Protocol mcap_usd must be number or null"
      );
    if (p.listed_at !== null && typeof p.listed_at !== "string")
      throw new SnapshotError("Protocol listed_at must be string or null");
    if (p.gecko_id !== null && typeof p.gecko_id !== "string")
      throw new SnapshotError("Protocol gecko_id must be string or null");
    if (p.symbol !== null && typeof p.symbol !== "string")
      throw new SnapshotError("Protocol symbol must be string or null");
  }

  for (const w of data.watchlist) {
    if (typeof w !== "string")
      throw new SnapshotError("Watchlist item must be a string");
  }

  return data as Snapshot;
}

export function boardIssue(board: BoardRow[], watchlist: string[]): string | null {
  const watchlistSet = new Set(watchlist);
  const boardSlugs = new Set(board.map((r) => r.slug));

  for (const slug of watchlistSet) {
    if (!boardSlugs.has(slug)) {
      return `Watchlist slug ${slug} is missing from the board`;
    }
  }

  for (let i = 0; i < board.length; i++) {
    if (board[i].rank !== i + 1) {
      return `Board ranks are not strictly 1 to N`;
    }
  }

  for (let i = 0; i < board.length - 1; i++) {
    if (board[i].implied_value_usd < board[i + 1].implied_value_usd) {
      return `Implied values are not non-rising by rank`;
    }
  }

  const allEqual = board.every(
    (r) => r.implied_value_usd === board[0].implied_value_usd
  );
  if (allEqual && board.length > 1) {
    return `All implied values are equal`;
  }

  for (const row of board) {
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `Implied value must be a positive safe integer`;
    }
    if (!row.farm_steps || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `Farm steps must be between 3 and 12 steps`;
    }
    for (const step of row.farm_steps) {
      if (step.text.length < 20 || step.text.length > 600) {
        return `Farm step text length must be between 20 and 600 characters`;
      }
    }
  }

  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar, null, 2)};\n`;
}
