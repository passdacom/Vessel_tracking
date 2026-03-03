import React, { useState } from "react";

export default function ManualPositionModal({ vessels, onSave, onClose }) {
  const [vesselId, setVesselId] = useState(vessels[0]?.id || "");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [sog, setSog] = useState("");
  const [cog, setCog] = useState("");
  const [heading, setHeading] = useState("");
  const [timestamp, setTimestamp] = useState(new Date().toISOString().slice(0, 16));
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!vesselId) return setError("Please select a vessel");
    const latN = parseFloat(lat), lonN = parseFloat(lon);
    if (isNaN(latN) || latN < -90 || latN > 90) return setError("Latitude must be between -90 and 90");
    if (isNaN(lonN) || lonN < -180 || lonN > 180) return setError("Longitude must be between -180 and 180");
    setLoading(true);
    const err = await onSave(parseInt(vesselId), {
      lat: latN, lon: lonN,
      sog: sog !== "" ? parseFloat(sog) : null,
      cog: cog !== "" ? parseFloat(cog) : null,
      heading: heading !== "" ? parseFloat(heading) : null,
      timestamp: new Date(timestamp).toISOString(),
    });
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[10000] p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-600">
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <div>
            <h2 className="text-white font-bold text-lg">Manual Position Entry</h2>
            <p className="text-gray-400 text-xs mt-0.5">Add position data manually</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="bg-red-900 border border-red-600 text-red-200 text-sm px-3 py-2 rounded">{error}</div>}

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1">Vessel</label>
            <select
              value={vesselId}
              onChange={(e) => setVesselId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg text-sm focus:border-blue-400 focus:outline-none"
            >
              {vessels.map((v) => (
                <option key={v.id} value={v.id}>{v.alias || v.name || v.mmsi} (MMSI: {v.mmsi})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-1">Latitude *</label>
              <input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)}
                placeholder="e.g. 25.1234" required
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg text-sm focus:border-blue-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-1">Longitude *</label>
              <input type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)}
                placeholder="e.g. 55.5678" required
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg text-sm focus:border-blue-400 focus:outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-1">Speed (kn)</label>
              <input type="number" step="any" min="0" value={sog} onChange={(e) => setSog(e.target.value)}
                placeholder="SOG"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg text-sm focus:border-blue-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-1">Course (°)</label>
              <input type="number" step="any" min="0" max="360" value={cog} onChange={(e) => setCog(e.target.value)}
                placeholder="COG"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg text-sm focus:border-blue-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-1">Heading (°)</label>
              <input type="number" step="any" min="0" max="360" value={heading} onChange={(e) => setHeading(e.target.value)}
                placeholder="HDG"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg text-sm focus:border-blue-400 focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1">Date / Time (UTC)</label>
            <input type="datetime-local" value={timestamp} onChange={(e) => setTimestamp(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg text-sm focus:border-blue-400 focus:outline-none" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 bg-gray-600 hover:bg-gray-500 text-white text-sm font-semibold rounded-lg transition">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition">
              {loading ? "Saving..." : "Save Position"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
