import type * as LeafletNS from "leaflet";

export type Leaflet = typeof LeafletNS;

/** Leaflet touches `window`, so it is only imported in the browser. */
export async function loadLeaflet(): Promise<Leaflet> {
  const mod = (await import("leaflet")) as unknown as { default?: Leaflet } & Leaflet;
  return mod.default ?? mod;
}

/** Plain HTML pins, so no marker image files are needed. */
export function pin(L: Leaflet, kind: "from" | "to") {
  const fill = kind === "from" ? "#ffffff" : "#174d3a";
  const ring = kind === "from" ? "#174d3a" : "#c8f169";
  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<span style="display:block;width:20px;height:20px;border-radius:9999px;background:${fill};border:4px solid ${ring};box-shadow:0 2px 6px rgba(0,0,0,.35)"></span>`,
  });
}

export function timePin(L: Leaflet, label: string) {
  return L.divIcon({
    className: "",
    iconSize: [58, 28],
    iconAnchor: [29, 14],
    html: `<span style="display:block;text-align:center;font:600 13px system-ui;padding:4px 8px;border-radius:9999px;background:#174d3a;color:#c8f169;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${label}</span>`,
  });
}

export const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
