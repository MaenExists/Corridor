"use client";
import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useId,
} from "react";
import { Search, X, ArrowUpRight } from "lucide-react";
import { searchPlaces, type PublicPlace } from "../lib/places";
type SearchCategory = "all" | "districts" | "places" | "transport";
export default function MapFeatureSearch({
  places,
  query,
  onQueryChange,
  onSelect,
  externalRequest,
}: {
  places: PublicPlace[];
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (place: PublicPlace) => void;
  externalRequest: number;
}) {
  const [category, setCategory] = useState<SearchCategory>("all");
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const handled = useRef(externalRequest);
  const id = useId();
  const results = useMemo(
    () => searchPlaces(places.filter(p=>category==="all" ||
      (category==="districts" && ["district","district reference"].includes(p.kind)) ||
      (category==="transport" && !!p.transportType) || (category==="places" && p.kind==="populated place")), query),
    [places, query, category],
  );
  useEffect(() => setActive(-1), [query, category]);
  const submit = useCallback(() => {
    setOpen(true);
    setActive(-1);
  }, []);
  useEffect(() => {
    if (externalRequest === handled.current) return;
    handled.current = externalRequest;
    submit();
  }, [externalRequest, submit]);
  function choose(place: PublicPlace) {
    setOpen(false);
    setActive(-1);
    onSelect(place);
  }
  return (
    <div className="map-search universal-map-search">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="map-search-field">
          <Search size={15} />
          <input
            aria-label="Find a Kerala place"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open && Boolean(query.trim())}
            aria-controls={`${id}-results`}
            aria-activedescendant={
              active >= 0 ? `${id}-option-${active}` : undefined
            }
            placeholder="Find a town, station or district"
            value={query}
            maxLength={180}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                setActive(-1);
              }
              if (e.key === "ArrowDown" && results.length) {
                e.preventDefault();
                setOpen(true);
                setActive((i) => (i + 1) % results.length);
              }
              if (e.key === "ArrowUp" && results.length) {
                e.preventDefault();
                setActive((i) => (i - 1 + results.length) % results.length);
              }
              if (e.key === "Enter" && active >= 0 && results[active]) {
                e.preventDefault();
                choose(results[active]);
              }
            }}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear place search"
              onClick={() => {
                onQueryChange("");
                setOpen(false);
              }}
            >
              <X size={13} />
            </button>
          )}
          <button
            type="submit"
            className="online-map-search-button"
            aria-label="Search bundled places"
          >
            <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="map-search-options">
          <select
            aria-label="Map search feature type"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as SearchCategory);
              setOpen(true);
            }}
          >
            <option value="all">All map features</option>
            <option value="districts">Districts</option>
            <option value="places">Cities & localities</option>
            <option value="transport">Public transport context</option>
          </select>
        </div>
      </form>
      {open && query.trim() && (
        <div
          className="map-search-results"
          id={`${id}-results`}
          role="listbox"
          aria-label="Map search results"
        >
          {Boolean(results.length) && (
            <div className="search-result-heading">
              Bundled place profiles <span>Offline</span>
            </div>
          )}
          {results.map((p, index) => {
            return (
              <button
                type="button"
                key={p.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={active === index}
                onClick={() => choose(p)}
              >
                <span>
                  {p.name}
                  <small>
                    {[
                      p.localName,
                      p.district,
                      p.transportType ?? p.featureLabel ?? p.kind,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
                <span>Profile</span>
              </button>
            );
          })}
          {!results.length && <p>No offline matches. Try a district, town or station.</p>}
          <footer>
            <a
              href="https://www.geonames.org/"
              target="_blank"
              rel="noreferrer"
            >
              GeoNames
            </a>
            {" "}offline reference. Geographic context only.
          </footer>
        </div>
      )}
    </div>
  );
}
