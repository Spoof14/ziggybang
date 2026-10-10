"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CircleMarker,
  Polyline,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { Control, DomEvent, DomUtil, type Map as LeafletMap } from "leaflet";
import {
  METRO_STATION_MIN_ZOOM,
  metroLineWeight,
  metroLines,
  metroStations,
  readMetroPref,
  stationTooltip,
  stationsInBounds,
  writeMetroPref,
} from "~/lib/geo/metro";

function ensureMetroPanes(map: LeafletMap) {
  if (!map.getPane("metro")) {
    const pane = map.createPane("metro");
    pane.style.zIndex = "350";
    pane.style.pointerEvents = "none";
  }
  if (!map.getPane("metroStations")) {
    const pane = map.createPane("metroStations");
    pane.style.zIndex = "360";
  }
}

function MetroIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="4.5"
        y="3.5"
        width="15"
        height="13"
        rx="3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 16.5v3.2M16 16.5v3.2M7 21h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="9" cy="10" r="1.3" fill="currentColor" />
      <circle cx="15" cy="10" r="1.3" fill="currentColor" />
    </svg>
  );
}

function MetroToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const map = useMap();
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const control = new Control({ position: "bottomright" });
    control.onAdd = () => {
      const el = DomUtil.create(
        "div",
        "leaflet-bar leaflet-control leaflet-control-metro",
      );
      DomEvent.disableClickPropagation(el);
      DomEvent.disableScrollPropagation(el);
      return el;
    };
    control.addTo(map);
    setHost(control.getContainer() ?? null);
    return () => {
      control.remove();
      setHost(null);
    };
  }, [map]);

  const title = on ? "Hide metro lines" : "Show metro lines";

  if (!host) return null;
  return createPortal(
    <a
      href="#"
      role="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      className={on ? "is-on" : undefined}
      onClick={(event) => {
        event.preventDefault();
        onToggle();
      }}
    >
      <MetroIcon />
    </a>,
    host,
  );
}

export function MetroLayer({ toggle = true }: { toggle?: boolean }) {
  const map = useMap();
  const [on, setOn] = useState(true);
  const [zoom, setZoom] = useState(() => map.getZoom());
  const [bounds, setBounds] = useState(() => {
    const next = map.getBounds();
    return {
      south: next.getSouth(),
      west: next.getWest(),
      north: next.getNorth(),
      east: next.getEast(),
    };
  });

  useLayoutEffect(() => {
    ensureMetroPanes(map);
  }, [map]);

  useEffect(() => {
    if (toggle) setOn(readMetroPref());
  }, [toggle]);

  useMapEvents({
    zoomend: () => {
      setZoom(map.getZoom());
      const next = map.getBounds();
      setBounds({
        south: next.getSouth(),
        west: next.getWest(),
        north: next.getNorth(),
        east: next.getEast(),
      });
    },
    moveend: () => {
      const next = map.getBounds();
      setBounds({
        south: next.getSouth(),
        west: next.getWest(),
        north: next.getNorth(),
        east: next.getEast(),
      });
    },
  });

  const weight = metroLineWeight(zoom);
  const visibleStations = useMemo(() => {
    if (!on || zoom < METRO_STATION_MIN_ZOOM) return [];
    return stationsInBounds(metroStations, bounds);
  }, [bounds, on, zoom]);

  const lines = useMemo(() => {
    if (!on) return null;
    return metroLines.flatMap((line) =>
      line.paths.map((path, index) => (
        <Polyline
          key={`${line.id}-${index}`}
          pane="metro"
          positions={path}
          interactive={false}
          pathOptions={{
            color: line.color,
            weight,
            opacity: 0.92,
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      )),
    );
  }, [on, weight]);

  return (
    <>
      {toggle ? (
        <MetroToggle
          on={on}
          onToggle={() => {
            setOn((current) => {
              const next = !current;
              writeMetroPref(next);
              return next;
            });
          }}
        />
      ) : null}
      {lines}
      {visibleStations.map((station) => (
        <CircleMarker
          key={station.id}
          pane="metroStations"
          center={[station.lat, station.lng]}
          radius={zoom >= 15 ? 5 : 4}
          pathOptions={{
            color: "#0f172a",
            weight: 1,
            fillColor: "#f8fafc",
            fillOpacity: 0.95,
          }}
        >
          <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
            {stationTooltip(station)}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}
