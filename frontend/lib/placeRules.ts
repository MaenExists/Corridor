/** Shared by the server index and the browser: how names are compared and which places show at which zoom. */

export type PlaceHit = { name: string; ml: string; kind: string; rank: number; lat: number; lon: number; district: string };

/**
 * Fold a place name so common Malayalam-to-English spelling variants meet:
 * Vyttila / Vytilla, Kozhikode / Kolikode, Thrissur / Trissur, Edappally / Edapally, Kalamassery / Kalamasseri.
 */
export function fold(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/zh/g, "l").replace(/([tdkgpbcs])h/g, "$1").replace(/w/g, "v")
    .replace(/ee/g, "i").replace(/oo/g, "u").replace(/y/g, "i")
    .replace(/(.)\1+/g, "$1");
}

/** Largest place rank to label at a zoom: cities first, hamlets and landmarks only close in. */
export const labelRank = (zoom: number) => zoom <= 8 ? 1 : zoom <= 9 ? 2 : zoom <= 11 ? 3 : zoom <= 12 ? 4 : zoom <= 13 ? 5 : 6;

export const KIND_LABEL: Record<string, string> = {
  city: "City", town: "Town", suburb: "Area", village: "Village", neighbourhood: "Neighbourhood", hamlet: "Hamlet",
  locality: "Locality", junction: "Junction", "railway station": "Railway station", "bus stand": "Bus stand",
  college: "College", hospital: "Hospital", "police station": "Police station", market: "Market", park: "Park",
  stadium: "Stadium", attraction: "Attraction", mall: "Mall", "town hall": "Town hall", airport: "Airport", harbour: "Harbour",
};
