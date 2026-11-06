import type { LatLng } from "@/lib/geo";

export type Place = { name: string } & LatLng;

/** Common pickup and drop-off points around Thapar. Positions are approximate: drag the pins to adjust. */
export const PLACES: Place[] = [
  { name: "Thapar Main Gate", lat: 30.3564, lng: 76.3647 },
  { name: "Patiala Railway Station", lat: 30.3361, lng: 76.3899 },
  { name: "Rajpura Bus Stand", lat: 30.4846, lng: 76.5942 },
  { name: "Chandigarh ISBT 43", lat: 30.7194, lng: 76.7462 },
  { name: "Chandigarh Sector 17", lat: 30.7398, lng: 76.7827 },
  { name: "Chandigarh Railway Station", lat: 30.704, lng: 76.802 },
  { name: "Chandigarh Airport", lat: 30.6735, lng: 76.7885 },
  { name: "Ludhiana Railway Station", lat: 30.9065, lng: 75.8712 },
  { name: "Delhi Kashmere Gate ISBT", lat: 28.6677, lng: 77.2291 },
  { name: "Delhi IGI Airport", lat: 28.5562, lng: 77.1 },
];

export function findPlace(text: string): Place | undefined {
  const t = text.trim().toLowerCase();
  return t ? PLACES.find((p) => p.name.toLowerCase() === t) : undefined;
}
