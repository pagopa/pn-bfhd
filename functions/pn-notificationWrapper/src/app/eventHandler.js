const axios = require("axios");

function getCommonHeaders(origin, requestHeaders) {
    return {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Headers":
            requestHeaders ||
            "Content-Type,Authorization,x-pagopa-pn-cx-type,x-pagopa-pn-uid,x-pagopa-pn-cx-id",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Credentials": "true",
        "Strict-Transport-Security":
            "max-age=31536000; includeSubDomains; preload",
    };
}

function createResponse(statusCode, origin, body = "", requestHeaders) {
    return {
        statusCode: statusCode,
        headers: getCommonHeaders(origin, requestHeaders),
        body: typeof body === "string" ? body : JSON.stringify(body),
    };
}

async function handleEvent(event) {
    const origin = event.headers?.origin || "*";
    const requestHeaders =
        event.headers?.["access-control-request-headers"] || "";

    // Preflight CORS
    if (event.httpMethod === "OPTIONS") {
        return createResponse(200, origin, "", requestHeaders);
    }

    const path = "/delivery/v2.8/notifications/sent/";
    console.log('event :>> ', event);
    const iun = event.pathParameters["iun"];
    if (!iun) {
        return createResponse(
            400,
            origin,
            { error: "Missing iun parameter" },
            requestHeaders
        );
    }

    const url = `http://${process.env.APPLICATION_LOAD_BALANCER_DOMAIN}:8080${path}${iun}`;

    const authorizer = event.requestContext?.authorizer || {};

    const forwardHeaders = {};

    if (authorizer.cx_id) {
        forwardHeaders["x-pagopa-pn-cx-id"] = authorizer.cx_id;
    }

    if (authorizer.cx_type) {
        forwardHeaders["x-pagopa-pn-cx-type"] = authorizer.cx_type;
    }

    if (authorizer.uid) {
        forwardHeaders["x-pagopa-pn-uid"] = authorizer.uid;
    }

    try {
        const body = event.body ? JSON.parse(event.body) : {};

        const apiResponse = await axios.post(url, body, {
            headers: forwardHeaders,
            timeout: 10000,
        });

        return createResponse(
            200,
            origin,
            apiResponse.data,
            requestHeaders
        );
    } catch (error) {
        const status = error.response?.status || 500;
        const errorData = error.response?.data || {
            error: error.message,
        };

        console.error("Errore BFHD:", JSON.stringify(errorData));

        return createResponse(status, origin, errorData, requestHeaders);
    }
}

module.exports = { handleEvent };
