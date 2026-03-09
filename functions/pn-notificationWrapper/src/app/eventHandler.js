const axios = require('axios');

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

async function handleEvent(event, context) {
    const allowedOrigin = event.headers?.origin || "*";
    const requestHeaders =
        event.headers?.["access-control-request-headers"] || "";

    if (event.httpMethod === "OPTIONS") {
        return createResponse(200, allowedOrigin, "", requestHeaders);
    }

    const path = "/delivery/v2.8/notifications/sent/";
    const iun = event.body?.iun;
    if (!iun) return createResponse(400, allowedOrigin, { error: "Missing iun parameter" }, requestHeaders);

    const url = `http://${process.env.APPLICATION_LOAD_BALANCER_DOMAIN}:8080${path}${iun}`;

    const headers = JSON.parse(JSON.stringify(event["headers"] || {}));

    if (event.requestContext?.authorizer?.cx_id) {
        headers["x-pagopa-pn-cx-id"] = event.requestContext.authorizer.cx_id;
    }

    if (event.requestContext?.authorizer?.cx_type) {
        headers["x-pagopa-pn-cx-type"] = event.requestContext.authorizer.cx_type;
    }

    if (event.requestContext?.authorizer?.uid) {
        headers["x-pagopa-pn-uid"] = event.requestContext.authorizer.uid;
    }

    let body = {};
    try {
        body = event.body ? JSON.parse(event.body) : {};
    } catch (e) {
        return createResponse(400, allowedOrigin, { error: "Invalid JSON body" }, requestHeaders);
    }

    try {
        const apiResponse = await axios.post(
            url,
            body,
            {
                headers: {
                    "x-pagopa-pn-uid": headers["x-pagopa-pn-uid"],
                    "x-pagopa-pn-cx-type": headers["x-pagopa-pn-cx-type"],
                    "x-pagopa-pn-cx-id": headers["x-pagopa-pn-cx-id"]
                }
            }
        );

        return createResponse(200, allowedOrigin, apiResponse.data, requestHeaders);

    } catch (error) {
        const errorData = error.response?.data || { error: error.message };
        console.error("Errore BFHD:", JSON.stringify(errorData));

        return createResponse(error.response?.status || 500, allowedOrigin, errorData, requestHeaders);
    }
}

module.exports = { handleEvent };