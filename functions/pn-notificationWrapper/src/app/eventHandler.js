const axios = require('axios');

function getCommonHeaders(allowedOrigin) {
    return {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "POST",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    };
}

function createResponse(
    statusCode,
    allowedOrigin,
    body = "",
    additionalHeaders = {}
) {
    return {
        statusCode,
        headers: {
            ...getCommonHeaders(allowedOrigin),
            ...additionalHeaders,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
    };
}

async function handleEvent(event, context) {


    // Gestione OPTIONS
    if (event.httpMethod === "OPTIONS") {
        return createResponse(200, allowedOrigin, "");
    }

    const path = "/delivery/v2.8/notifications/sent/";
    const iun = event.pathParameters["iun"];
    const url = `http://${process.env.APPLICATION_LOAD_BALANCER_DOMAIN}:8080${path}${iun}`;
    const headers = JSON.parse(JSON.stringify(event["headers"]));
    if (event.requestContext.authorizer["cx_id"]) {
        headers["x-pagopa-pn-cx-id"] = event.requestContext.authorizer["cx_id"];
    }
    if (event.requestContext.authorizer["cx_type"]) {
        headers["x-pagopa-pn-cx-type"] = event.requestContext.authorizer["cx_type"];
    }
    if (event.requestContext.authorizer["uid"]) {
        headers["x-pagopa-pn-uid"] = event.requestContext.authorizer["uid"];
    }
    try {
        const apiResponse = await axios.post(url,
            {
                headers: {
                    "x-pagopa-pn-uid": headers["x-pagopa-pn-cx-uid"],
                    "x-pagopa-pn-cx-type": headers["x-pagopa-pn-cx-type"],
                    "x-pagopa-pn-cx-id": headers["x-pagopa-pn-id"]
                }
            },
            event.body);
        return createResponse(200, allowedOrigin, JSON.stringify(apiResponse.data));
    } catch (error) {
        const errorData = error.response?.data || { error: error.message };
        console.error("Errore BFHD:", JSON.stringify(errorData));

        return {
            statusCode: error.response?.status || 500,
            body: JSON.stringify(errorData)
        };
    }
}

module.exports = { handleEvent };