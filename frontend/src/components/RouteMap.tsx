"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LMap, Marker, Polyline } from "leaflet";
import { haversineKm, type LatLng } from "@/lib/geo";
import { ATTRIBUTION, loadLeaflet, pin, TILES, type Leaflet } from "@/lib/leaflet";

// Road routes come from an OSRM server. The public demo server is fine for trying things out; set
// NEXT_PUBLIC_OSRM_URL to your own, or to an empty string to switch road routing off.
const OSRM = process.env.NEXT_PUBLIC_OSRM_URL ?? "https://router.project-osrm.org";

type Props = {
  from?: LatLng | null;
  to?: LatLng | null;
  editable?: boolean;
  onChange?: (from: LatLng | null, to: LatLng | null) => void;
  label?: string;
  height?: number;
};

export function RouteMap({ from = null, to = null, editable = false, onChange, label = "Route map", height = 280 }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const lib = useRef<Leaflet | null>(null);
  const map = useRef<LMap | null>(null);
  const markers = useRef<{ from?: Marker; to?: Marker }>({});
  const line = useRef<Polyline | null>(null);
  const latest = useRef({ from, to, editable, onChange });
  latest.current = { from, to, editable, onChange };
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState("");

  useEffect(() => {
    let disposed = false;
    (async () => {
      const L = await loadLeaflet();
      if (disposed || !el.current) return;
      lib.current = L;
      const m = L.map(el.current, { scrollWheelZoom: false }).setView([30.35, 76.4], 9);
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
      m.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        const cur = latest.current;
        if (!cur.editable || !cur.onChange) return;
        const p = { lat: e.latlng.lat, lng: e.latlng.lng };
        if (!cur.from) cur.onChange(p, cur.to);
        else if (!cur.to) cur.onChange(cur.from, p);
      });
      map.current = m;
      setReady(true);
    })();
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      markers.current = {};
      line.current = null;
    };
  }, []);

  useEffect(() => {
    const L = lib.current;
    const m = map.current;
    if (!ready || !L || !m) return;
    const ctrl = new AbortController();

    const place = (kind: "from" | "to", p: LatLng | null) => {
      const existing = markers.current[kind];
      if (!p) {
        existing?.remove();
        markers.current[kind] = undefined;
        return;
      }
      if (existing) {
        existing.setLatLng([p.lat, p.lng]);
        return;
      }
      const mk = L.marker([p.lat, p.lng], { icon: pin(L, kind), draggable: latest.current.editable, keyboard: latest.current.editable, title: kind === "from" ? "Pickup" : "Destination" }).addTo(m);
      mk.on("dragend", () => {
        const cur = latest.current;
        const at = mk.getLatLng();
        const moved = { lat: at.lat, lng: at.lng };
        cur.onChange?.(kind === "from" ? moved : cur.from, kind === "to" ? moved : cur.to);
      });
      markers.current[kind] = mk;
    };
    place("from", from);
    place("to", to);

    line.current?.remove();
    line.current = null;
    setInfo("");
    const points = [from, to].filter((p): p is LatLng => !!p);
    if (points.length === 2 && from && to) {
      const straightKm = haversineKm(from, to);
      const draw = (coords: [number, number][], dashed: boolean) => {
        line.current?.remove();
        line.current = L.polyline(coords, { color: document.documentElement.dataset.theme === "dark" ? "#74e3b2" : "#0f6b4c", weight: 4, opacity: 0.85, dashArray: dashed ? "8 8" : undefined }).addTo(m);
      };
      draw([[from.lat, from.lng], [to.lat, to.lng]], true);
      m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40] });
      setInfo(`About ${Math.round(straightKm)} km in a straight line.`);
      if (OSRM) {
        fetch(`${OSRM}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`, { signal: ctrl.signal })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error("routing unavailable"))))
          .then((data: { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] }) => {
            const route = data.routes?.[0];
            if (!route || ctrl.signal.aborted) return;
            draw(route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]), false);
            setInfo(`About ${Math.round(route.distance / 1000)} km, roughly ${Math.max(1, Math.round(route.duration / 60))} min by road. An estimate from OpenStreetMap routing.`);
          })
          .catch(() => undefined); // keep the straight line
      }
    } else if (points.length === 1) {
      m.setView([points[0].lat, points[0].lng], 12);
    }
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, from?.lat, from?.lng, to?.lat, to?.lng]);

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-line" style={{ height }}>
        <div ref={el} className="h-full w-full" role="img" aria-label={label} />
        {editable && !from && !to && <p className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-paper px-4 py-1.5 text-sm shadow">Click the map to place the pickup, then the destination</p>}
      </div>
      <p className="mt-2 text-xs text-mist" aria-live="polite">
        {info || (editable ? "Drag a pin to adjust it. Map data from OpenStreetMap." : "Map data from OpenStreetMap.")}
      </p>
    </div>
  );
}
