import React from 'react';
import { Polyline, CircleMarker, Tooltip } from 'react-leaflet';

export default function VesselTrack({ positions, color }) {
  if (!positions || positions.length < 2) return null;

  // positions are ordered newest-first, reverse for drawing oldest→newest
  const ordered = [...positions].reverse();
  const latLngs = ordered.map((p) => [p.lat, p.lon]);

  return (
    <>
      <Polyline
        positions={latLngs}
        pathOptions={{ color, weight: 2, opacity: 0.65, dashArray: '6 4' }}
      />
      {/* Dot at the oldest visible position */}
      <CircleMarker
        center={latLngs[0]}
        radius={3}
        pathOptions={{ color, fillColor: color, fillOpacity: 0.5, weight: 1 }}
      >
        <Tooltip>
          {new Date(positions[positions.length - 1].timestamp).toLocaleString('ko-KR')}
        </Tooltip>
      </CircleMarker>
    </>
  );
}
