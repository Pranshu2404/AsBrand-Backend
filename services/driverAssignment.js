const Driver = require('../model/driver');
const Order = require('../model/order');
const User = require('../model/user');
const { getDistanceAndETA } = require('./googleMapsService');
// Optional: If you need to manipulate socket.io directly here, you can require it or pass it in.

// Simple distance calculation (Haversine formula in km)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

class DriverAssignmentEngine {
    constructor() {
        // activeAssignments tracks the state of assigning a driver to an order
        // Key: orderId, Value: { timerId, currentDriverIndex, driversList: [], attempts: 0 }
        this.activeAssignments = new Map();
        this.io = null;
    }

    setIO(ioInstance) {
        this.io = ioInstance;
    }

    async startAssignment(orderId) {
        try {
            console.log(`[AssignmentEngine] Starting driver assignment for order: ${orderId}`);
            
            const order = await Order.findById(orderId).populate('userID', 'name phone');
            if (!order) throw new Error('Order not found');

            // Find the supplier. We assume one supplier per order for this logic, based on the first item
            if (!order.items || order.items.length === 0) throw new Error('Order has no items');
            
            const supplierId = order.items[0].supplierId;
            const supplier = await User.findById(supplierId);
            if (!supplier || !supplier.supplierProfile) throw new Error('Supplier not found');

            const pickupLat = supplier.supplierProfile.pickupAddress.latitude;
            const pickupLng = supplier.supplierProfile.pickupAddress.longitude;
            const supplierShopName = supplier.supplierProfile.storeName;

            // Product details summary
            const productNames = order.items.map(i => i.productName).join(', ');

            // Drop distance (supplier → customer)
            const customerLat = order.shippingAddress?.latitude;
            const customerLng = order.shippingAddress?.longitude;
            let dropDistanceKm = 0;
            if (customerLat && customerLng) {
                dropDistanceKm = calculateDistance(pickupLat, pickupLng, customerLat, customerLng);
            }

            // Fetch admin rate settings
            const Setting = require('../model/setting');
            let settings = await Setting.findOne();
            if (!settings) settings = new Setting();
            const pickupFreeKm = settings.driverPickupFreeKm || 1;
            const pickupRate = settings.driverPickupRatePerKm || 3;
            const dropRate = settings.driverDropRatePerKm || 12;

            // Find online drivers
            const onlineDrivers = await Driver.find({ isOnline: true });

            if (onlineDrivers.length === 0) {
                console.log(`[AssignmentEngine] No online drivers available for order ${orderId}`);
                return;
            }

            // Calculate distance for all online drivers
            const driversWithDistance = onlineDrivers.map(d => {
                const distance = calculateDistance(
                    pickupLat, pickupLng,
                    d.currentLocation.lat, d.currentLocation.lng
                );
                return { driver: d, distance };
            });

            // Filter drivers within 10km and sort by nearest
            const eligibleDrivers = driversWithDistance
                .filter(d => d.distance <= 10)
                .sort((a, b) => a.distance - b.distance);

            if (eligibleDrivers.length === 0) {
                console.log(`[AssignmentEngine] No drivers within 10km for order ${orderId}`);
                return;
            }

            // Prepare payload (enhanced for Zomato-style UI)
            const orderPayload = {
                orderId: order._id.toString(),
                pickupAddress: `${supplierShopName}, ${supplier?.supplierProfile?.pickupAddress?.street || supplier?.supplierProfile?.pickupAddress?.address || ''}`,
                dropAddress: `${order.shippingAddress?.street || order.shippingAddress?.address || ''}, ${order.shippingAddress?.city || ''}`,
                amount: order.totalPrice || (order.orderTotal && order.orderTotal.total) || 0,
                products: productNames,
                // Coordinates for map
                supplierLat: pickupLat,
                supplierLng: pickupLng,
                customerLat: customerLat,
                customerLng: customerLng,
                // Contact info
                supplierName: supplierShopName,
                supplierPhone: supplier.phone || '',
                customerName: order.userID?.name || 'Customer',
                customerPhone: order.userID?.phone || '',
                // Payment & order info
                paymentMethod: order.paymentMethod || 'prepaid',
                orderShortId: order._id.toString().slice(-8).toUpperCase(),
                // Distances
                dropDistanceKm: parseFloat(dropDistanceKm.toFixed(2)),
                // Rates for earnings calculation on driver app
                pickupFreeKm,
                pickupRate,
                dropRate,
            };

            // Start cascading
            this.activeAssignments.set(orderId.toString(), {
                driversList: eligibleDrivers,
                currentDriverIndex: 0,
                payload: orderPayload
            });

            this.notifyNextDriver(orderId.toString());

        } catch (error) {
            console.error(`[AssignmentEngine] Error starting assignment:`, error);
        }
    }

    notifyNextDriver(orderIdStr) {
        const assignment = this.activeAssignments.get(orderIdStr);
        if (!assignment) return;

        const { driversList, currentDriverIndex, payload } = assignment;

        if (currentDriverIndex >= driversList.length) {
            console.log(`[AssignmentEngine] All eligible drivers exhausted for order ${orderIdStr}`);
            this.activeAssignments.delete(orderIdStr);
            return;
        }

        const nextDriver = driversList[currentDriverIndex];
        console.log(`[AssignmentEngine] Notifying driver ${nextDriver.driver._id} at distance ${nextDriver.distance.toFixed(2)}km`);

        // Emit to the specific driver room or via general broadcast if they are listening to their ID
        if (this.io) {
            // We append distance to payload
            const payloadWithDistance = {
                ...payload,
                distance: `${nextDriver.distance.toFixed(1)} km`,
                pickupDistanceKm: parseFloat(nextDriver.distance.toFixed(2)),
            };

            this.io.emit(`new_order_${nextDriver.driver._id.toString()}`, payloadWithDistance);
        }

        // Set 30 second timeout to cascade to next driver
        const timerId = setTimeout(() => {
            console.log(`[AssignmentEngine] Driver ${nextDriver.driver._id} timed out for order ${orderIdStr}`);
            this.handleReject(orderIdStr, nextDriver.driver._id.toString());
        }, 31000); // 31 seconds to be safe

        assignment.timerId = timerId;
        this.activeAssignments.set(orderIdStr, assignment);
    }

    async handleAccept(orderIdStr, driverIdStr) {
        const assignment = this.activeAssignments.get(orderIdStr);

        // Clear timeout if exists
        if (assignment && assignment.timerId) clearTimeout(assignment.timerId);

        console.log(`[AssignmentEngine] Driver ${driverIdStr} attempting to accept order ${orderIdStr}...`);
        
        try {
            // Get the order for ETA calculation
            const order = await Order.findById(orderIdStr);
            if (!order) return;
            if (order.assignedDriver && order.assignedDriver.toString() !== driverIdStr) {
                console.log(`[AssignmentEngine] Order ${orderIdStr} was already captured by ${order.assignedDriver}`);
                // Remove from this driver's scope
                this.activeAssignments.delete(orderIdStr);
                return;
            }
            if (order && order.shippingAddress) {
                // Find supplier pickup coords
                const supplierId = order.items?.[0]?.supplierId;
                const supplier = supplierId ? await User.findById(supplierId) : null;
                const pickupLat = supplier?.supplierProfile?.pickupAddress?.latitude;
                const pickupLng = supplier?.supplierProfile?.pickupAddress?.longitude;
                const dropLat = order.shippingAddress.latitude;
                const dropLng = order.shippingAddress.longitude;

                if (pickupLat && pickupLng && dropLat && dropLng) {
                    const eta = await getDistanceAndETA(pickupLat, pickupLng, dropLat, dropLng);
                    order.estimatedDeliveryMinutes = eta.durationMinutes;
                    order.assignedDriver = driverIdStr;
                    order.orderStatus = 'shipped';
                    order.deliveryStatus = 'CREATED';
                    await order.save();

                    // Notify customer app
                    if (this.io) {
                        this.io.emit(`order_accepted_${order.userID.toString()}`, {
                            orderId: orderIdStr,
                            driverId: driverIdStr,
                            estimatedMinutes: eta.durationMinutes,
                            distanceKm: eta.distanceKm,
                            distanceText: eta.distanceText,
                            durationText: eta.durationText
                        });
                    }
                } else {
                    // No coords, just assign without ETA
                    await Order.findByIdAndUpdate(orderIdStr, {
                        assignedDriver: driverIdStr,
                        orderStatus: 'shipped',
                        deliveryStatus: 'CREATED',
                        estimatedDeliveryMinutes: 15 // default estimate
                    });
                }
            } else {
                await Order.findByIdAndUpdate(orderIdStr, {
                    assignedDriver: driverIdStr,
                    orderStatus: 'shipped',
                    deliveryStatus: 'CREATED',
                    estimatedDeliveryMinutes: 15
                });
            }
        } catch (error) {
            console.error(`[AssignmentEngine] ETA calc error:`, error.message);
            // Fallback: just assign
            await Order.findByIdAndUpdate(orderIdStr, {
                assignedDriver: driverIdStr,
                orderStatus: 'shipped',
                deliveryStatus: 'CREATED',
                estimatedDeliveryMinutes: 15
            }).exec();
        }

        // Cleanup
        this.activeAssignments.delete(orderIdStr);
    }

    handleReject(orderIdStr, driverIdStr) {
        const assignment = this.activeAssignments.get(orderIdStr);
        if (!assignment) return;

        if (assignment.timerId) clearTimeout(assignment.timerId);

        console.log(`[AssignmentEngine] Driver ${driverIdStr} rejected order ${orderIdStr}. Cascading...`);

        // Move to next driver
        assignment.currentDriverIndex++;
        this.activeAssignments.set(orderIdStr, assignment);
        
        this.notifyNextDriver(orderIdStr);
    }
}

const assignmentEngine = new DriverAssignmentEngine();
module.exports = assignmentEngine;
