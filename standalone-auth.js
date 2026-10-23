const config = {"mode":"oauth","appId":"u3C9FkOvlbDIJ5cB","portalUrl":"https://www.arcgis.com","redirectUri":"https://joezl.github.io/nyc-police-response-coverage/"};
const moduleIds = {"identityManager":"@arcgis/core/identity/IdentityManager.js","oauthInfo":"@arcgis/core/identity/OAuthInfo.js","config":"@arcgis/core/config.js"};
const catalog = {"en-US":{"reading":"Reading…","readAt":"Read {time}","staleError":"Stale — {message}","unavailableError":"Unavailable — {message}","targetValue":"Target {value}","changeFrom":"Change from {label}","noFeaturesMatch":"No features match.","total":"Total","all":"All","appLoadError":"This app could not load: {message}","moduleLoaderUnavailable":"The ArcGIS module loader is unavailable.","actionsForLayer":"Actions for {title}","adjustBuffer":"Adjust buffer","arcgisBufferUnavailable":"ArcGIS buffer operations are unavailable in this app.","ask":"Ask","askNova":"Ask Nova about this","attachToChat":"Attach to chat","back":"Back","backToMapContents":"Back to map contents","backToSelectionActions":"Back to selection actions","basemap":"Basemap","basemapsLoadError":"Basemaps could not be loaded","buffer":"Buffer","bufferCreateError":"Buffer could not be created.","bufferDistance":"{distance} meter buffer","bufferMinimum":"Enter a distance of at least 25 meters.","bufferSelection":"Create a buffer","cancelBuffer":"Cancel buffer","clearAllLayers":"Clear all layers","closeSelectedFeatures":"Close selected features","closeSpatialSuggestions":"Close spatial suggestions","collapseLayer":"Collapse layer","collapsePanel":"Collapse {title}","collapseUntitledPanel":"Collapse panel","copyLayerUrl":"Copy layer URL","darkGrayCanvas":"Dark Gray Canvas","details":"Details","distanceMeters":"Distance (meters)","editInChat":"Edit in chat","enableTerrain":"Enable terrain","disableTerrain":"Disable terrain","expandLayer":"Expand layer","expandPanel":"Expand {title}","expandUntitledPanel":"Expand panel","hideMapContents":"Hide map contents","imagery":"Imagery","keepBuffer":"Keep buffer","layers":"Layers","loadingLegend":"Loading legend","mapContents":"Map contents","mark":"Mark","markLocation":"Mark this location","markSaveUnconfirmed":"Mark save was not confirmed.","markedLocation":"Marked location {count}","moveDown":"Move down","moveUp":"Move up","navigation":"Navigation","next":"Next","noBasemaps":"No basemaps found","noLayers":"No layers","noMatchingLayers":"No matching layers","openBasemapPanel":"Open basemap panel","other":"Other","previous":"Previous","removeAllLayersConfirmation":"Remove all layers from this map?","removeLayer":"Remove layer","searchBasemaps":"Search basemaps","searchLayers":"Search layers","savingMark":"Saving mark...","selectedFeature":"Selected feature","selectedFeatures":"Selected features","selectionActions":"Selection actions","selectionBuffer":"Selection buffer","selectionBufferTitle":"{distance} m selection buffer","selectionGeometryError":"The selected geometry could not be converted into a buffer polygon.","showFeaturePosition":"{current} of {total}","suggest":"Suggest","suggestRelevantActions":"Suggest relevant actions","thinking":"Thinking","toggleLayerVisibility":"Toggle {title} visibility","topographic":"Topographic","terrain":"Terrain","untitledLayer":"Untitled layer","viewDetails":"View details","zoomToLayer":"Zoom to layer","zoomIn":"Zoom in","zoomOut":"Zoom out","resetCompass":"Reset compass"}};
const locale = document.documentElement.lang || 'en-US';
const messages = catalog[locale] ?? catalog[locale.split('-', 1)[0]] ?? catalog['en-US'];

function showFailure(error) {
  const node = document.getElementById('app-error');
  if (!node) return;
  node.hidden = false;
  node.textContent = error instanceof Error ? error.message : String(error);
}

async function start() {
  if (config.mode === 'public') {
    await import('./app.js');
    return;
  }
  const loader = globalThis.$arcgis;
  if (!loader || typeof loader.import !== 'function') {
    throw new Error(messages.moduleLoaderUnavailable);
  }
  const [IdentityManager, OAuthInfo, esriConfig] = await Promise.all([
    loader.import(moduleIds.identityManager),
    loader.import(moduleIds.oauthInfo),
    loader.import(moduleIds.config),
  ]);
  esriConfig.portalUrl = config.portalUrl;
  IdentityManager.registerOAuthInfos([
    new OAuthInfo({
      appId: config.appId,
      portalUrl: config.portalUrl,
      redirectUri: config.redirectUri,
      popup: false,
    }),
  ]);
  const sharingUrl = config.portalUrl.replace(/\/+$/, '') + '/sharing';
  try {
    await IdentityManager.checkSignInStatus(sharingUrl);
  } catch {
    await IdentityManager.getCredential(sharingUrl);
    location.reload();
    return;
  }
  await import('./app.js');
}

void start().catch(showFailure);
