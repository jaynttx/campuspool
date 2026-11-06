"use client";

import "leaflet/dist/leaflet.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Map as LMap } from "leaflet";
import type { Ride } from "@/data/types";
import { ATTRIBUTION, loadLeaflet, timePin, TILES } from "@/lib/leaflet";

/** Open rides as time pins at their destination. Click a pin to open the ride. */
export function RidesMap({ rides }: { rides: Ride[] }) {
  const router = useRouter();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const go = useRef(router);
  go.current = router;

  useEffect(() => {
    let disposed = false;
    (async () => {
      const L = await loadLeaflet();
      if (disposed || !el.current) return;
      const m = L.map(el.current, { scrollWheelZoom: false }).setView([30.5, 76.6], 8);
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
      const pts: [number, number][] = [];
      for (const r of rides) {
        if (typeof r.dstLat !== "number" || typeof r.dstLng !== "number") continue;
        pts.push([r.dstLat, r.dstLng]);
        L.marker([r.dstLat, r.dstLng], { icon: timePin(L, r.time), title: `${r.destination} at ${r.time}`, keyboard: true })
          .on("click", () => go.current.push(`/rides/${r.id}`))
          .addTo(m);
      }
      if (pts.length > 0) m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 11 });
      map.current = m;
    })();
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, [rides]);

  const mapped = rides.filter((r) => typeof r.dstLat === "number").length;
  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-line" style={{ height: 420 }}>
        <div ref={el} className="h-full w-full" role="img" aria-label="Map of open rides by destination" />
      </div>
      <p className="mt-2 text-xs text-mist">
        {mapped} of {rides.length} rides have map points. Rides without them appear in the list view. Map data from OpenStreetMap.
      </p>
    </div>
  );
}
