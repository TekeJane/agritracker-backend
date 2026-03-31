const fs = require('fs');
const path = require('path');

const advisoryData = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../data/advisory_with_financial_advice.json'),
    'utf8',
  ),
);

function getUniqueValues(selector) {
  return [...new Set(advisoryData.flatMap(selector))].filter(Boolean).sort();
}

function resolveRegionProfile(region) {
  return advisoryData.find((item) => item.region === region) || null;
}

function pickSeasonForRegion(item, weather) {
  const seasons = Array.isArray(item?.seasons) ? item.seasons.filter(Boolean) : [];
  if (!seasons.length) return null;

  const summary = weather?.summary?.toString().toLowerCase() || '';
  const humidity = Number(weather?.humidity ?? 0);
  const rainySignal =
    summary.includes('rain') || summary.includes('storm') || humidity >= 75;
  const rainySeason = seasons.find((season) =>
    season.toLowerCase().includes('rain'),
  );
  const drySeason = seasons.find((season) =>
    season.toLowerCase().includes('dry'),
  );

  if (rainySignal && rainySeason) return rainySeason;
  if (!rainySignal && drySeason) return drySeason;
  return seasons[0];
}

function pickSoilForRegion(item) {
  const soils = Array.isArray(item?.common_soil_types)
    ? item.common_soil_types.filter(Boolean)
    : [];
  return soils[0] || null;
}

function buildRegionDefaults() {
  return advisoryData.reduce((acc, item) => {
    if (!item?.region || acc[item.region]) return acc;
    acc[item.region] = {
      suggested_season: pickSeasonForRegion(item, null),
      suggested_soil: pickSoilForRegion(item),
      available_seasons: item.seasons || [],
      available_soils: item.common_soil_types || [],
    };
    return acc;
  }, {});
}

exports.getAllAdvisories = (req, res) => {
  try {
    const regions = [...new Set(advisoryData.map((item) => item.region))]
      .filter(Boolean)
      .sort();
    const seasons = getUniqueValues((item) => item.seasons || []);
    const soil_types = getUniqueValues((item) => item.common_soil_types || []);

    return res.json({
      regions,
      seasons,
      soil_types,
      region_defaults: buildRegionDefaults(),
    });
  } catch (error) {
    console.error('[ADVISORY] Failed to load dropdown data:', error);
    return res.status(500).json({ message: 'Failed to load dropdown data' });
  }
};

exports.getAdvisory = (req, res) => {
  const { region, season, soil, weather } = req.body || {};

  if (!region) {
    return res.status(400).json({
      message: 'Missing required parameters. Please provide region.',
    });
  }

  try {
    const regionProfile = resolveRegionProfile(region);
    if (!regionProfile) {
      return res.status(404).json({
        message: 'No advisory found for the selected region.',
      });
    }

    const resolvedSeason = season || pickSeasonForRegion(regionProfile, weather);
    const resolvedSoil = soil || pickSoilForRegion(regionProfile);

    if (!resolvedSeason || !resolvedSoil) {
      return res.status(404).json({
        message: 'No advisory context could be inferred for this region.',
      });
    }

    const result = advisoryData.find((item) => {
      const regionMatch = item.region === region;
      const seasonMatch = (item.seasons || []).includes(resolvedSeason);
      const soilMatch = (item.common_soil_types || []).includes(resolvedSoil);
      return regionMatch && seasonMatch && soilMatch;
    });

    if (!result) {
      const availableRegions = advisoryData.map((item) => item.region);
      const availableSeasons = getUniqueValues((item) => item.seasons || []);
      const availableSoils = getUniqueValues(
        (item) => item.common_soil_types || [],
      );

      return res.status(404).json({
        message: 'No matching advisory found for the selected criteria.',
        debug: {
          requested: { region, season, soil },
          resolved: { region, season: resolvedSeason, soil: resolvedSoil },
          available: {
            regions: availableRegions,
            seasons: availableSeasons,
            soils: availableSoils,
          },
        },
      });
    }

    return res.json({
      region: result.region,
      common_soil_types: result.common_soil_types,
      seasons: result.seasons,
      resolved_selection: {
        region,
        season: resolvedSeason,
        soil: resolvedSoil,
      },
      crop_recommendations: result.crop_recommendations,
      crop_rotation_plans: result.crop_rotation_plans,
      advisory_notes: result.advisory_notes,
      financial_advice: result.financial_advice,
    });
  } catch (error) {
    console.error('[ADVISORY] Failed to process request:', error);
    return res.status(500).json({
      message: 'Internal server error while processing advisory request',
    });
  }
};
