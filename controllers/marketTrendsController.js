const Product = require('../models/Product');
const ProductPriceLog = require('../models/ProductPriceLog');
const { Op } = require('sequelize');

const CAMEROON_REGIONS = [
    'Adamawa',
    'Centre',
    'East',
    'Far North',
    'Littoral',
    'North',
    'North West',
    'South',
    'South West',
    'West',
];

const UNIT_TO_KG = {
    kg: 1,
    kilogram: 1,
    basket: 50,
    bag: 50,
    crate: 25,
    bucket: 15,
    basin: 35,
};

function normalizeUnit(unit) {
    return (unit || 'kg').toString().trim().toLowerCase();
}

function getUnitFactor(unit) {
    return UNIT_TO_KG[normalizeUnit(unit)] || 1;
}

function normalizePrice(price, unit) {
    const numericPrice = parseFloat(price);
    const factor = getUnitFactor(unit);
    if (!factor || Number.isNaN(numericPrice)) return 0;
    return parseFloat((numericPrice / factor).toFixed(2));
}

function normalizeConfidence(sourceType, sourceConfidence) {
    if (sourceConfidence != null) {
        return parseFloat(sourceConfidence);
    }

    switch ((sourceType || '').toLowerCase()) {
        case 'admin':
            return 0.95;
        case 'field_agent':
            return 0.9;
        case 'imported_dataset':
            return 0.82;
        case 'order':
            return 0.88;
        case 'seller':
        default:
            return 0.7;
    }
}

function average(numbers) {
    if (!numbers.length) return 0;
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function stdDev(numbers) {
    if (numbers.length <= 1) return 0;
    const avg = average(numbers);
    const variance = average(numbers.map((value) => (value - avg) ** 2));
    return Math.sqrt(variance);
}

function startOfPeriod(date, granularity) {
    const next = new Date(date);

    if (granularity === 'month') {
        return new Date(next.getFullYear(), next.getMonth(), 1);
    }

    if (granularity === 'week') {
        const weekday = next.getDay();
        const diff = weekday === 0 ? -6 : 1 - weekday;
        next.setDate(next.getDate() + diff);
    }

    next.setHours(0, 0, 0, 0);
    return next;
}

function formatPeriod(date, granularity) {
    const next = startOfPeriod(date, granularity);
    return next.toISOString().split('T')[0];
}

async function fetchLogs({
    categoryId,
    cropName,
    region,
    market,
    from,
    to,
}) {
    const logWhere = {};
    if (from && to) {
        logWhere.logged_at = {
            [Op.between]: [new Date(from), new Date(to)],
        };
    }

    const productWhere = {};
    if (categoryId) productWhere.CategoryId = categoryId;
    if (region && region !== 'All') productWhere.market_region = region;
    if (cropName && cropName !== 'All') {
        productWhere.name = { [Op.like]: cropName };
    }

    const logs = await ProductPriceLog.findAll({
        where: logWhere,
        include: [
            {
                model: Product,
                as: 'Product',
                required: true,
                attributes: [
                    'id',
                    'name',
                    'CategoryId',
                    'market_region',
                    'unit',
                ],
                where: productWhere,
            },
        ],
        order: [['logged_at', 'ASC']],
    });

    return logs.filter((log) => {
        if (!market || market === 'All') return true;
        return (log.market_name || 'General Market') === market;
    });
}

function buildTrendPayload(logs, granularity) {
    const grouped = {};

    logs.forEach((log) => {
        const dateKey = formatPeriod(log.logged_at, granularity);
        const numericPrice = parseFloat(log.normalized_price || log.price || 0);
        const sourceConfidence = normalizeConfidence(
            log.source_type,
            log.source_confidence
        );
        const region = log.market_region || log.Product?.market_region || 'Unknown';
        const market = log.market_name || 'General Market';
        const crop = log.crop_name || log.Product?.name || 'Unknown Crop';

        if (!grouped[dateKey]) {
            grouped[dateKey] = {
                prices: [],
                confidences: [],
                sources: {},
            };
        }

        grouped[dateKey].prices.push(numericPrice);
        grouped[dateKey].confidences.push(sourceConfidence);
        grouped[dateKey].sources[log.source_type || 'seller'] =
            (grouped[dateKey].sources[log.source_type || 'seller'] || 0) + 1;

        grouped[dateKey].region ??= region;
        grouped[dateKey].market ??= market;
        grouped[dateKey].crop ??= crop;
    });

    const dates = Object.keys(grouped).sort();
    const avgPrices = dates.map((date) => parseFloat(average(grouped[date].prices).toFixed(2)));
    const minPrices = dates.map((date) => parseFloat(Math.min(...grouped[date].prices).toFixed(2)));
    const maxPrices = dates.map((date) => parseFloat(Math.max(...grouped[date].prices).toFixed(2)));
    const confidenceScores = dates.map((date) =>
        parseFloat(average(grouped[date].confidences).toFixed(2))
    );

    const allNormalizedPrices = logs.map((log) =>
        parseFloat(log.normalized_price || log.price || 0)
    );

    const latestLog =
        logs.length > 0 ? logs.reduce((a, b) => (a.logged_at > b.logged_at ? a : b)) : null;
    const sortedByPrice = [...logs].sort(
        (a, b) =>
            parseFloat(b.normalized_price || b.price || 0) -
            parseFloat(a.normalized_price || a.price || 0)
    );

    const regionMap = new Set(
        logs.map((log) => log.market_region || log.Product?.market_region).filter(Boolean)
    );
    const marketMap = new Set(logs.map((log) => log.market_name).filter(Boolean));
    const cropMap = new Set(
        logs.map((log) => log.crop_name || log.Product?.name).filter(Boolean)
    );

    const momChange =
        avgPrices.length >= 2 && avgPrices[0] != 0
            ? parseFloat((((avgPrices[avgPrices.length - 1] - avgPrices[0]) / avgPrices[0]) * 100).toFixed(2))
            : 0;

    return {
        dates,
        avg_prices: avgPrices,
        min_prices: minPrices,
        max_prices: maxPrices,
        confidence_scores: confidenceScores,
        summary: {
            observations: logs.length,
            daily_average: parseFloat(average(allNormalizedPrices).toFixed(2)),
            volatility: parseFloat(stdDev(allNormalizedPrices).toFixed(2)),
            month_over_month_change: momChange,
            highest_market:
                sortedByPrice[0]
                    ? {
                        price: parseFloat(sortedByPrice[0].normalized_price || sortedByPrice[0].price || 0),
                        market_name: sortedByPrice[0].market_name || 'General Market',
                        region:
                            sortedByPrice[0].market_region ||
                            sortedByPrice[0].Product?.market_region ||
                            'Unknown',
                      }
                    : null,
            lowest_market:
                sortedByPrice.length > 0
                    ? {
                        price: parseFloat(
                            sortedByPrice[sortedByPrice.length - 1].normalized_price ||
                                sortedByPrice[sortedByPrice.length - 1].price ||
                                0
                        ),
                        market_name:
                            sortedByPrice[sortedByPrice.length - 1].market_name ||
                            'General Market',
                        region:
                            sortedByPrice[sortedByPrice.length - 1].market_region ||
                            sortedByPrice[sortedByPrice.length - 1].Product?.market_region ||
                            'Unknown',
                      }
                    : null,
            freshness:
                latestLog != null
                    ? `${Math.max(
                        0,
                        Math.round((Date.now() - new Date(latestLog.logged_at).getTime()) / 3600000)
                    )}h ago`
                    : 'No recent updates',
            overall_confidence: parseFloat(
                average(logs.map((log) => normalizeConfidence(log.source_type, log.source_confidence))).toFixed(2)
            ),
        },
        source_breakdown: logs.reduce((acc, log) => {
            const key = log.source_type || 'seller';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {}),
        available_regions: [...new Set([...CAMEROON_REGIONS, ...regionMap])],
        available_markets: [...marketMap].sort(),
        available_crops: [...cropMap].sort(),
    };
}

const getMarketSummary = async (req, res) => {
    const { region, from, to } = req.query;

    try {
        const logs = await fetchLogs({ region, from, to });
        const payload = buildTrendPayload(logs, 'day');
        return res.json(payload.summary);
    } catch (err) {
        console.error('Market summary error:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

const getCropTrend = async (req, res) => {
    try {
        const cropName = req.params.cropName;
        const { region, market, from, to, granularity = 'day' } = req.query;
        const logs = await fetchLogs({
            cropName,
            region,
            market,
            from,
            to,
        });
        return res.status(200).json({
            crop: cropName,
            ...buildTrendPayload(logs, granularity),
        });
    } catch (err) {
        console.error('Error in getCropTrend:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

const getCategoryDailyTrend = async (req, res) => {
    const {
        category_id,
        crop,
        region,
        market,
        from,
        to,
        granularity = 'day',
    } = req.query;

    if (!category_id || !from || !to) {
        return res.status(400).json({
            message: 'category_id, from, and to are required.',
        });
    }

    try {
        const logs = await fetchLogs({
            categoryId: category_id,
            cropName: crop,
            region,
            market,
            from,
            to,
        });

        return res.json({
            category_id,
            granularity,
            ...buildTrendPayload(logs, granularity),
        });
    } catch (err) {
        console.error('Error in getCategoryDailyTrend:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

const getRegionTrend = async (req, res) => {
    const { region, from, to, crop, granularity = 'day' } = req.query;
    if (!region || !from || !to) {
        return res.status(400).json({ message: 'region, from, and to are required.' });
    }

    try {
        const logs = await fetchLogs({
            region,
            cropName: crop,
            from,
            to,
        });

        return res.json({
            region,
            granularity,
            ...buildTrendPayload(logs, granularity),
        });
    } catch (err) {
        console.error('Error in getRegionTrend:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

const getLatestPrices = async (req, res) => {
    const { region, crop, limit = 20 } = req.query;

    try {
        const logs = await fetchLogs({
            region,
            cropName: crop,
        });

        const latest = [...logs]
            .sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at))
            .slice(0, parseInt(limit, 10))
            .map((log) => ({
                crop_name: log.crop_name || log.Product?.name,
                category_id: log.Product?.CategoryId,
                market_region: log.market_region || log.Product?.market_region,
                market_name: log.market_name || 'General Market',
                raw_price: parseFloat(log.price),
                unit: log.unit || log.Product?.unit || 'kg',
                normalized_price: parseFloat(log.normalized_price || log.price),
                normalized_unit: log.normalized_unit || 'kg',
                source_type: log.source_type || 'seller',
                source_confidence: normalizeConfidence(
                    log.source_type,
                    log.source_confidence
                ),
                logged_at: log.logged_at,
            }));

        return res.json({
            prices: latest,
            available_regions: CAMEROON_REGIONS,
        });
    } catch (err) {
        console.error('Error in getLatestPrices:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

const submitMarketPrice = async (req, res) => {
    const {
        crop_name,
        category_id,
        price,
        market_region,
        market_name,
        unit = 'kg',
        source_type = 'field_agent',
        source_confidence,
        notes,
    } = req.body;
    const userId = req.user?.id;

    if (!crop_name || !price || !market_region) {
        return res.status(400).json({ message: 'crop_name, price, and market_region are required' });
    }

    try {
        let product = await Product.findOne({
            where: {
                name: crop_name,
                market_region,
            },
        });

        if (!product) {
            product = await Product.create({
                name: crop_name,
                price,
                market_region,
                description: 'Market price observation',
                stock_quantity: 1,
                seller_id: userId || 1,
                CategoryId: category_id || 1,
                SubCategoryId: 1,
                unit,
            });
        } else {
            product.price = price;
            if (!product.unit && unit) product.unit = unit;
            await product.save();
        }

        const normalized = normalizePrice(price, unit);
        const confidence = normalizeConfidence(source_type, source_confidence);

        const log = await ProductPriceLog.create({
            product_id: product.id,
            crop_name,
            price,
            unit,
            normalized_unit: 'kg',
            normalized_price: normalized,
            market_region,
            market_name: market_name || `${market_region} Main Market`,
            source_type,
            source_confidence: confidence,
            notes: notes || null,
            logged_at: new Date(),
        });

        return res.status(201).json({
            message: 'Market price submitted',
            product,
            log,
        });
    } catch (e) {
        console.error('Submission failed:', e);
        return res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    CAMEROON_REGIONS,
    getMarketSummary,
    getCropTrend,
    getCategoryDailyTrend,
    getRegionTrend,
    getLatestPrices,
    submitMarketPrice,
};
