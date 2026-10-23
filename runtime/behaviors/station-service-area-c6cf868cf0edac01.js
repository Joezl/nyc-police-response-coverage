export default async function install(app) {
  const mount = app.getMount("station-service-area");
  const stationLayer = app.layers[app.config.stationLayerId];
  app.assert(stationLayer, "The police stations layer is not available.");

  const root = document.createElement("div");
  root.style.display = "grid";
  root.style.gap = "12px";
  root.style.minWidth = "0";

  const intro = document.createElement("p");
  intro.textContent = "Search for a station or click a station point on the map. The app will calculate a 10-minute driving-time coverage area.";
  intro.style.margin = "0";
  intro.style.color = "var(--app-text-muted)";
  intro.style.fontSize = "0.9rem";

  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Search station, precinct, address…";
  input.setAttribute("aria-label", "Search police stations");
  input.style.width = "100%";
  input.style.boxSizing = "border-box";
  input.style.padding = "10px";
  input.style.border = "1px solid var(--app-border)";
  input.style.borderRadius = "var(--app-radius)";
  input.style.background = "var(--app-surface)";
  input.style.color = "var(--app-text)";

  const results = document.createElement("div");
  results.style.display = "grid";
  results.style.gap = "6px";
  results.style.maxHeight = "230px";
  results.style.overflowY = "auto";

  const status = document.createElement("div");
  status.setAttribute("role", "status");
  status.style.color = "var(--app-text-muted)";
  status.style.fontSize = "0.9rem";

  root.append(intro, input, results, status);
  mount.replaceChildren(root);

  const [serviceArea, networkService, ServiceAreaParameters, FeatureSet, Graphic, Portal] = await Promise.all([
    app.import("esri/rest/serviceArea"),
    app.import("esri/rest/networkService"),
    app.import("esri/rest/support/ServiceAreaParameters"),
    app.import("esri/rest/support/FeatureSet"),
    app.import("esri/Graphic"),
    app.import("esri/portal/Portal"),
  ]);

  const coverage = await app.createResultLayer({
    id: "ten-minute-driving-coverage",
    title: "10-minute driving coverage",
    geometryType: "polygon",
    fields: [
      { name: "ToBreak", type: "double" },
      { name: "Station", type: "string" },
      { name: "Precinct", type: "string" }
    ],
    renderer: {
      type: "simple",
      symbol: {
        type: "simple-fill",
        color: [30, 136, 229, 0.20],
        outline: { color: [13, 71, 161, 0.9], width: 2 }
      }
    },
    popupTemplate: { title: "{Station} — {ToBreak} minute driving coverage", content: "Precinct: {Precinct}" }
  });

  let stations = [];
  let requestId = 0;
  let drivingMode;
  let serviceAreaUrl;

  const stationLabel = (feature) => {
    const a = feature.attributes || {};
    return String(a.FACILITY_NAME || a.ID || (a.POLICE_PREC != null ? `NYPD Precinct ${a.POLICE_PREC}` : "Police station"));
  };
  const stationDetail = (feature) => {
    const a = feature.attributes || {};
    const parts = [];
    if (a.POLICE_PREC != null) parts.push(`Precinct ${a.POLICE_PREC}`);
    if (a.FACILITY_ADDRESS) parts.push(a.FACILITY_ADDRESS);
    if (a.BOROUGH) parts.push(a.BOROUGH);
    return parts.join(" · ") || "NYPD station";
  };
  const renderMatches = () => {
    const term = input.value.trim().toLowerCase();
    const matches = term ? stations.filter((f) => `${stationLabel(f)} ${stationDetail(f)}`.toLowerCase().includes(term)).slice(0, 12) : [];
    results.replaceChildren(...matches.map((feature) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${stationLabel(feature)} — ${stationDetail(feature)}`;
      button.style.textAlign = "left";
      button.style.padding = "8px";
      button.style.border = "1px solid var(--app-border-subtle)";
      button.style.borderRadius = "var(--app-radius)";
      button.style.background = "var(--app-surface-raised)";
      button.style.color = "var(--app-text)";
      button.addEventListener("click", () => solve(feature));
      return button;
    }));
    if (term && matches.length === 0) status.textContent = "No matching police stations.";
    else if (term) status.textContent = `${matches.length} matching station${matches.length === 1 ? "" : "s"}.`;
    else status.textContent = "Start typing to find a station.";
  };

  const ensureDrivingMode = async () => {
    if (drivingMode) return drivingMode;
    const portal = new Portal(app.portalUrl ? { url: app.portalUrl } : {});
    await portal.load();
    serviceAreaUrl = portal.helperServices?.serviceArea?.url;
    app.assert(serviceAreaUrl, "This portal does not advertise a service-area helper service.");
    const description = await networkService.fetchServiceDescription(serviceAreaUrl);
    const modes = description.supportedTravelModes || [];
    drivingMode = modes.find((mode) => {
      const text = `${mode.name || ""} ${mode.type || ""}`.toLowerCase();
      return (text.includes("drive") || text.includes("car") || text.includes("automobile")) && mode.impedanceAttributeName === mode.timeAttributeName;
    });
    app.assert(drivingMode, "This service-area helper has no time-based driving travel mode.");
    return drivingMode;
  };

  const solve = async (selected) => {
    const current = ++requestId;
    status.textContent = `Calculating ${app.config.minutes}-minute driving coverage for ${stationLabel(selected)}…`;
    results.replaceChildren();
    try {
      const oid = selected.getObjectId();
      const query = stationLayer.createQuery();
      query.objectIds = [oid];
      query.outFields = ["*"];
      query.returnGeometry = true;
      const queried = await stationLayer.queryFeatures(query);
      const station = queried.features[0];
      app.assert(station && station.geometry, "The selected station has no usable location.");
      const result = await serviceArea.solve(serviceAreaUrl || (await ensureDrivingMode() && serviceAreaUrl), new ServiceAreaParameters({
        facilities: new FeatureSet({ features: [new Graphic({ geometry: station.geometry })] }),
        travelMode: await ensureDrivingMode(),
        defaultBreaks: [app.config.minutes],
        outSpatialReference: app.view.spatialReference,
        outputPolygons: "simplified",
        trimOuterPolygon: true
      }), null);
      if (current !== requestId) return { ignored: true };
      const polygons = result.serviceAreaPolygons?.features || [];
      await coverage.replaceFeatures(polygons.map((polygon) => ({
        geometry: polygon.geometry,
        attributes: { ToBreak: polygon.attributes?.ToBreak ?? app.config.minutes, Station: stationLabel(station), Precinct: String(station.attributes?.POLICE_PREC ?? "Not listed") }
      })));
      if (station.geometry.extent) await app.view.goTo(station.geometry.extent.expand(1.8));
      status.textContent = polygons.length ? `${app.config.minutes}-minute driving coverage is displayed for ${stationLabel(station)}.` : "The service returned no coverage polygon.";
      return { station: stationLabel(station), polygons: polygons.length, minutes: app.config.minutes };
    } catch (error) {
      if (current === requestId) status.textContent = `Could not calculate coverage: ${error.message || error}`;
      throw error;
    }
  };

  const stationQuery = stationLayer.createQuery();
  stationQuery.where = "1=1";
  stationQuery.outFields = ["OBJECTID", "FACILITY_NAME", "ID", "POLICE_PREC", "FACILITY_ADDRESS", "BOROUGH"];
  stationQuery.returnGeometry = false;
  const stationResponse = await stationLayer.queryFeatures(stationQuery);
  stations = stationResponse.features || [];
  status.textContent = `${stations.length} police stations loaded. Start typing or click a station on the map.`;

  const inputHandler = () => renderMatches();
  input.addEventListener("input", inputHandler);
  const registration = app.actions.register("solve-station-area", async ({ graphic }) => solve(graphic));
  app.onCleanup(() => {
    input.removeEventListener("input", inputHandler);
    registration.remove();
    mount.replaceChildren();
  });
}