const axios = require('axios');

const API_BASE = process.env.SHIPROCKET_API_BASE || 'https://apiv2.shiprocket.in/v1/external';

// ==========================================
// TOKEN MANAGEMENT (cached in memory)
// ==========================================

let cachedToken = null;
let tokenExpiry = null;

/**
 * Get Shiprocket auth token. Caches token for 24 hours.
 * Shiprocket tokens are valid ~10 days, but we refresh daily for safety.
 */
async function getToken() {
    const now = Date.now();
    if (cachedToken && tokenExpiry && now < tokenExpiry) {
        return cachedToken;
    }

    const email = process.env.SHIPROCKET_EMAIL;
    const password = process.env.SHIPROCKET_PASSWORD;

    if (!email || !password) {
        throw new Error('Shiprocket credentials not configured. Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD to .env');
    }

    try {
        const response = await axios.post(`${API_BASE}/auth/login`, {
            email,
            password
        });

        cachedToken = response.data.token;
        // Cache for 24 hours
        tokenExpiry = now + 24 * 60 * 60 * 1000;

        return cachedToken;
    } catch (error) {
        console.error('Shiprocket auth error:', error.response?.data || error.message);
        throw new Error('Failed to authenticate with Shiprocket');
    }
}

/**
 * Make an authenticated request to Shiprocket API
 */
async function apiRequest(method, endpoint, data = null, retries = 1) {
    const token = await getToken();

    const config = {
        method,
        url: `${API_BASE}${endpoint}`,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    if (data) {
        config.data = data;
    }

    try {
        const response = await axios(config);
        return response.data;
    } catch (error) {
        if (retries > 0) {
            console.warn(`Shiprocket API request failed, retrying... (${retries} retries left)`);
            // If 401, clear cached token and retry
            if (error.response?.status === 401) {
                cachedToken = null;
                tokenExpiry = null;
            }
            return apiRequest(method, endpoint, data, retries - 1);
        }
        console.error('Shiprocket API error:', error.response?.data || error.message);
        throw error;
    }
}

// ==========================================
// SHIPMENT OPERATIONS
// ==========================================

/**
 * Create a shipment on Shiprocket for the given order.
 * Maps our Order model → Shiprocket Create Order API payload.
 *
 * @param {Object} order - Mongoose Order document (populated)
 * @returns {Object} - { shipment_id, order_id, awb_code, courier_name, tracking_url }
 */
async function createShipment(order) {
    // Build line items for Shiprocket
    const orderItems = order.items.map((item, index) => ({
        name: item.productName,
        sku: item.productID?.toString() || `SKU-${index + 1}`,
        units: item.quantity,
        selling_price: item.price,
        discount: 0,
        tax: 0,
        hsn: ''  // HSN code - can be added later for GST
    }));

    // Calculate total dimensions (clothing defaults)
    const totalWeight = Math.max(0.3, order.items.reduce((sum, item) => sum + (item.quantity * 0.3), 0));

    const payload = {
        order_id: order._id.toString(),
        order_date: new Date(order.orderDate || order.createdAt).toISOString().split('T')[0],
        pickup_location: 'Primary',  // Default pickup location in Shiprocket
        channel_id: '',
        comment: `AsBrand Order #${order._id}`,
        billing_customer_name: order.shippingAddress?.name || order.shippingAddress?.phone || 'Customer',
        billing_last_name: '',
        billing_address: order.shippingAddress?.street || '',
        billing_address_2: '',
        billing_city: order.shippingAddress?.city || '',
        billing_pincode: order.shippingAddress?.postalCode || order.shippingAddress?.pincode || '',
        billing_state: order.shippingAddress?.state || '',
        billing_country: 'India',
        billing_email: '',
        billing_phone: order.shippingAddress?.phone || '',
        shipping_is_billing: true,
        shipping_customer_name: '',
        shipping_last_name: '',
        shipping_address: '',
        shipping_address_2: '',
        shipping_city: '',
        shipping_pincode: '',
        shipping_country: '',
        shipping_state: '',
        shipping_email: '',
        shipping_phone: '',
        order_items: orderItems,
        payment_method: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
        shipping_charges: order.shippingCharge || 0,
        giftwrap_charges: 0,
        transaction_charges: 0,
        total_discount: order.orderTotal?.discount || 0,
        sub_total: order.orderTotal?.total || order.totalPrice,
        length: 25,   // cm - typical clothing package
        breadth: 20,  // cm
        height: 5,    // cm
        weight: Math.min(totalWeight, 2)  // kg, capped at 2kg for clothing
    };

    const result = await apiRequest('POST', '/orders/create/adhoc', payload);

    // Extract shipment details from response
    return {
        shiprocketOrderId: result.order_id,
        shipmentId: result.shipment_id?.toString(),
        awbCode: result.awb_code || null,
        courierName: result.courier_name || null,
        trackingUrl: result.awb_code
            ? `https://shiprocket.co/tracking/${result.awb_code}`
            : null,
        status: result.status,
        statusCode: result.status_code
    };
}

/**
 * Request courier assignment (AWB) for an existing Shiprocket shipment.
 * This is needed if createShipment didn't auto-assign a courier.
 *
 * @param {string} shipmentId - Shiprocket shipment ID
 * @returns {Object} - { awb_code, courier_name, ... }
 */
async function assignCourier(shipmentId) {
    const result = await apiRequest('POST', '/courier/assign/awb', {
        shipment_id: shipmentId
    });

    return {
        awbCode: result.response?.data?.awb_code || null,
        courierName: result.response?.data?.courier_name || null,
        trackingUrl: result.response?.data?.awb_code
            ? `https://shiprocket.co/tracking/${result.response.data.awb_code}`
            : null
    };
}

/**
 * Get tracking info for a shipment.
 *
 * @param {string} shipmentId - Shiprocket shipment ID
 * @returns {Object} - Tracking details including status, timeline, EDD
 */
async function getTracking(shipmentId) {
    try {
        const result = await apiRequest('GET', `/courier/track/shipment/${shipmentId}`);

        const trackingData = result.tracking_data || {};

        return {
            currentStatus: trackingData.shipment_status || 'Unknown',
            statusCode: trackingData.shipment_status_id,
            estimatedDeliveryDate: trackingData.etd || null,
            trackingUrl: trackingData.track_url || null,
            timeline: trackingData.shipment_track_activities || [],
            courierName: trackingData.courier_name || null
        };
    } catch (error) {
        console.error('Tracking fetch error:', error.message);
        return {
            currentStatus: 'Unknown',
            statusCode: null,
            estimatedDeliveryDate: null,
            trackingUrl: null,
            timeline: [],
            courierName: null,
            error: 'Failed to fetch tracking info'
        };
    }
}

/**
 * Get tracking info by AWB code.
 *
 * @param {string} awbCode - AWB tracking code
 * @returns {Object} - Tracking details
 */
async function getTrackingByAwb(awbCode) {
    try {
        const result = await apiRequest('GET', `/courier/track/awb/${awbCode}`);

        const trackingData = result.tracking_data || {};

        return {
            currentStatus: trackingData.shipment_status || 'Unknown',
            statusCode: trackingData.shipment_status_id,
            estimatedDeliveryDate: trackingData.etd || null,
            trackingUrl: trackingData.track_url || null,
            timeline: trackingData.shipment_track_activities || [],
            courierName: trackingData.courier_name || null
        };
    } catch (error) {
        console.error('AWB tracking fetch error:', error.message);
        return {
            currentStatus: 'Unknown',
            error: 'Failed to fetch tracking info'
        };
    }
}

/**
 * Map Shiprocket status codes/strings to our deliveryStatus enum.
 */
function mapShiprocketStatus(shiprocketStatus) {
    const statusStr = (shiprocketStatus || '').toLowerCase().trim();

    // Shiprocket status mapping
    const statusMap = {
        'new': 'CREATED',
        'pickup scheduled': 'CREATED',
        'pickup queued': 'CREATED',
        'pickup generated': 'CREATED',
        'picked up': 'SHIPPED',
        'shipped': 'SHIPPED',
        'in transit': 'IN_TRANSIT',
        'out for delivery': 'OUT_FOR_DELIVERY',
        'delivered': 'DELIVERED',
        'undelivered': 'OUT_FOR_DELIVERY',
        'rto initiated': 'IN_TRANSIT',
        'rto delivered': 'DELIVERED',
        'cancelled': 'PENDING'
    };

    return statusMap[statusStr] || 'IN_TRANSIT';
}

module.exports = {
    getToken,
    createShipment,
    assignCourier,
    getTracking,
    getTrackingByAwb,
    mapShiprocketStatus
};
