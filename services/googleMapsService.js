const axios = require('axios');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Get road distance (km) and ETA (minutes) between two coordinates
 * Uses Google Distance Matrix API
 */
async function getDistanceAndETA(originLat, originLng, destLat, destLng) {
    try {
        if (!GOOGLE_MAPS_API_KEY) {
            console.warn('[GoogleMaps] API key not configured, using fallback estimate');
            return getFallbackEstimate(originLat, originLng, destLat, destLng);
        }

        const url = `https://maps.googleapis.com/maps/api/distancematrix/json`;
        const response = await axios.get(url, {
            params: {
                origins: `${originLat},${originLng}`,
                destinations: `${destLat},${destLng}`,
                mode: 'driving',
                key: GOOGLE_MAPS_API_KEY
            }
        });

        const data = response.data;
        if (data.status === 'OK' &&
            data.rows[0]?.elements[0]?.status === 'OK') {
            const element = data.rows[0].elements[0];
            return {
                distanceKm: element.distance.value / 1000,    // meters to km
                durationMinutes: Math.ceil(element.duration.value / 60), // seconds to minutes
                distanceText: element.distance.text,
                durationText: element.duration.text
            };
        }

        console.warn('[GoogleMaps] API returned non-OK status, using fallback');
        return getFallbackEstimate(originLat, originLng, destLat, destLng);
    } catch (error) {
        console.error('[GoogleMaps] Error:', error.message);
        return getFallbackEstimate(originLat, originLng, destLat, destLng);
    }
}

/**
 * Fallback: Haversine straight-line distance with estimated speed
 */
function getFallbackEstimate(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Assume 20 km/h average speed in city + 5 min for pickup
    const durationMinutes = Math.ceil((distanceKm / 20) * 60) + 5;

    return {
        distanceKm: Math.round(distanceKm * 10) / 10,
        durationMinutes,
        distanceText: `${distanceKm.toFixed(1)} km`,
        durationText: `${durationMinutes} min`
    };
}

module.exports = { getDistanceAndETA };
