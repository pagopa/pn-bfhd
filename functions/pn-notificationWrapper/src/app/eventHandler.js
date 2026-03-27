const axios = require('axios');
const jsonwebtoken = require('jsonwebtoken');

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
    // auditLog("", "AUD_ACC_LOGIN", allowedOrigin).info("info");
    const headers = JSON.parse(JSON.stringify(event["headers"] || {}));

    if (event.httpMethod === "OPTIONS") {

        return createResponse(200, allowedOrigin, "", requestHeaders);
    }

    let jwt;
    try {
        jwt = event.headers.Authorization.replace("Bearer ", "");
        const decode = jsonwebtoken.decode(jwt)
        return createResponse(200, allowedOrigin, decode, {});

    } catch (err) {
        /* auditLog(
            `Error generating token ${err.message}`,
            "AUD_ACC_LOGIN",
            allowedOrigin,
            "KO"
        ).warn("error"); */
        const errorData = err.response?.data || { error: err.message };
        return createResponse(err.response?.status || 500, allowedOrigin, errorData, requestHeaders);
    }

    /*  auditLog(
         `Token successful generated with id ${enrichedToken.jti}`,
         "AUD_ACC_LOGIN",
         allowedOrigin,
         "OK",
         cx_type,
         cx_id,
         cx_role,
         uid,
         enrichedToken.jti
     ).info("success");
  */
    let body = {};
    try {
        body = event.body ? JSON.parse(event.body) : {};
    } catch (e) {
        return createResponse(400, allowedOrigin, { error: "Invalid JSON body" }, requestHeaders);
    }

    const path = "/delivery-private/notifications/";
    const iun = body.iun
    if (!iun) return createResponse(400, allowedOrigin, { error: "Missing iun parameter" }, requestHeaders);

    const url = `http://${process.env.APPLICATION_LOAD_BALANCER_DOMAIN}:8080${path}${iun}`;


    if (context?.authorizer?.cx_id) {
        headers["x-pagopa-pn-cx-id"] = context.authorizer.cx_id;
    }

    if (context?.authorizer?.cx_type) {
        headers["x-pagopa-pn-cx-type"] = context.authorizer.cx_type;
    }

    if (context?.authorizer?.uid) {
        headers["x-pagopa-pn-uid"] = context.authorizer.uid;
    }

    try {
        const apiResponse = await axios.get(
            url,
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

        return createResponse(error.response?.status || 500, allowedOrigin, errorData, requestHeaders);
    }
}

module.exports = { handleEvent };