const fs = require('fs');
const path = require('path');

// Load advisory JSON data
const advisoryData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../data/advisory_with_financial_advice.json'), 'utf8')
);

// GET all unique dropdown values (for dynamic filters)
exports.getAllAdvisories = (req, res) => {
    console.log('\n📥 [GET] /api/advisory requested');

    try {
        const regions = [...new Set(advisoryData.map(item => item.region))].filter(Boolean).sort();
        const seasons = [...new Set(advisoryData.flatMap(item => item.seasons))].filter(Boolean).sort();
        const soil_types = [...new Set(advisoryData.flatMap(item => item.common_soil_types))].filter(Boolean).sort();

        console.log(`📊 Extracted dropdowns:
       • Regions: ${regions.length}
       • Seasons: ${seasons.length}
       • Soil Types: ${soil_types.length}`);

        res.json({ regions, seasons, soil_types });
    } catch (error) {
        console.error('❌ Error loading dropdown data:', error);
        res.status(500).json({ message: 'Failed to load dropdown data' });
    }
};

// POST: Get advisory by filters (changed from GET to match your route)
exports.getAdvisory = (req, res) => {
    // Changed from req.query to req.body for POST requests
    const { region, season, soil } = req.body;

    console.log(`📥 [POST] /api/advisory requested with:
   • Region: ${region}
   • Season: ${season} 
   • Soil: ${soil}`);

    // Validate required fields
    if (!region || !season || !soil) {
        console.log('❌ Missing required parameters');
        return res.status(400).json({
            message: 'Missing required parameters. Please provide region, season, and soil.'
        });
    }

    try {
        // Find matching advisory data
        const result = advisoryData.find(item => {
            const regionMatch = item.region === region;
            const seasonMatch = item.seasons.includes(season);
            const soilMatch = item.common_soil_types.includes(soil);

            console.log(`🔍 Checking region "${item.region}":
           • Region match: ${regionMatch}
           • Season match: ${seasonMatch} (available: ${item.seasons.join(', ')})
           • Soil match: ${soilMatch} (available: ${item.common_soil_types.join(', ')})`);

            return regionMatch && seasonMatch && soilMatch;
        });

        if (!result) {
            console.log('❌ No advisory found for these parameters.');

            // Provide helpful debugging info
            const availableRegions = advisoryData.map(item => item.region);
            const availableSeasons = [...new Set(advisoryData.flatMap(item => item.seasons))];
            const availableSoils = [...new Set(advisoryData.flatMap(item => item.common_soil_types))];

            console.log(`📋 Available options:
           • Regions: ${availableRegions.join(', ')}
           • Seasons: ${availableSeasons.join(', ')}
           • Soils: ${availableSoils.join(', ')}`);

            return res.status(404).json({
                message: 'No matching advisory found for the selected criteria.',
                debug: {
                    requested: { region, season, soil },
                    available: {
                        regions: availableRegions,
                        seasons: availableSeasons,
                        soils: availableSoils
                    }
                }
            });
        }

        console.log('✅ Advisory found and sent.');

        // Return the complete advisory data including financial advice
        res.json({
            region: result.region,
            common_soil_types: result.common_soil_types,
            seasons: result.seasons,
            crop_recommendations: result.crop_recommendations,
            crop_rotation_plans: result.crop_rotation_plans,
            advisory_notes: result.advisory_notes,
            financial_advice: result.financial_advice
        });

    } catch (error) {
        console.error('❌ Error processing advisory request:', error);
        res.status(500).json({ message: 'Internal server error while processing advisory request' });
    }
};