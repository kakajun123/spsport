import spsport from "../../venues/spsport.json";
import spsportLarge from "../../venues/spsport-large.json";
import type { Resource, ResourceUnit } from "./types";

export interface VenueResourceConfig {
  key: string;
  category: string;
  name_en: string;
  name_zh: string;
  price_member: number;
  price_non_member: number;
  units: number;
  is_addon?: boolean;
  addon_for?: string | null;
}

export interface VenueConfig {
  id: string;
  name_en: string;
  name_zh: string;
  resources: VenueResourceConfig[];
  pricing?: {
    peak_multiplier: number;
    weekday_peak?: { start: string; end: string };
    weekend_peak?: { start: string; end: string };
  };
}

// 想加一个自己的球馆？在 venues/ 目录加一个 json，然后在这里注册即可。
export const venueConfigs: Record<string, VenueConfig> = {
  spsport: spsport as VenueConfig,
  "spsport-large": spsportLarge as VenueConfig,
};

export const DEFAULT_VENUE_ID = "spsport";

export function getVenueConfig(id: string): VenueConfig {
  return venueConfigs[id] ?? venueConfigs[DEFAULT_VENUE_ID];
}

// 由球馆配置生成「资源 + 单元」，demo 模式直接用它渲染
export function buildResourcesAndUnits(config: VenueConfig): {
  resources: Resource[];
  units: ResourceUnit[];
} {
  const resources: Resource[] = config.resources.map((r, i) => ({
    id: `${config.id}-${r.key}`,
    key: r.key,
    name_en: r.name_en,
    name_zh: r.name_zh,
    category: r.category,
    price_member: r.price_member,
    price_non_member: r.price_non_member,
    is_addon: r.is_addon ?? false,
    addon_for: r.addon_for ?? null,
    active: true,
    sort_order: i + 1,
  }));

  const units: ResourceUnit[] = [];
  for (const r of config.resources) {
    const res = resources.find((x) => x.key === r.key)!;
    for (let i = 0; i < r.units; i++) {
      units.push({
        id: `${config.id}-${r.key}-${i + 1}`,
        resource_id: res.id,
        label_en: `${r.name_en} ${i + 1}`,
        label_zh: `${r.name_zh} ${i + 1}`,
        active: true,
        sort_order: i + 1,
        resource: res,
      });
    }
  }
  return { resources, units };
}
