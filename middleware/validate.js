const Joi = require('joi');

// Validation middleware factory
const validate = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,  // Return all errors, not just first
            stripUnknown: true  // Remove unknown fields
        });

        if (error) {
            const errorMessages = error.details.map(detail => detail.message);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errorMessages
            });
        }

        // Replace req.body with validated & sanitized value
        req.body = value;
        next();
    };
};

// Validate query params
const validateQuery = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.query, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errorMessages = error.details.map(detail => detail.message);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errorMessages
            });
        }

        req.query = value;
        next();
    };
};

// Validate params (like :id)
const validateParams = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.params, {
            abortEarly: false
        });

        if (error) {
            const errorMessages = error.details.map(detail => detail.message);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errorMessages
            });
        }

        req.params = value;
        next();
    };
};

module.exports = { validate, validateQuery, validateParams };
