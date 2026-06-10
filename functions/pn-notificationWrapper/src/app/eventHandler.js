const axios = require('axios');
const jsonwebtoken = require('jsonwebtoken');
const { auditLog } = require("./log.js");

function getCommonHeaders(origin, requestHeaders) {
    return {
        "Access-Control-Allow-Origin": process.env.NOTIFICATION_WRAPPER_ALLOWED_ORIGINS,
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
    const allowedOrigin = event.headers?.origin;
    const requestHeaders =
        event.headers?.["access-control-request-headers"] || "";
    auditLog("", "AUD_ACC_LOGIN", allowedOrigin).info("info");
    // const headers = JSON.parse(JSON.stringify(event["headers"] || {}));

    if (event.httpMethod === "OPTIONS") {

        return createResponse(200, allowedOrigin, "", requestHeaders);
    }

    let jwt;
    let uid;
    let cx_id;
    const cx_type = "BO";
    let decode;

    try {
        jwt = event.headers.Authorization.replace("Bearer ", "");
        decode = jsonwebtoken.decode(jwt);
        uid = decode["cognito:username"]
        cx_id = `BO-${uid}`
        auditLog(
            `Token successful decode`,
            "AUD_ACC_LOGIN",
            allowedOrigin,
            "OK",
            cx_type,
            cx_id,
            "",
            uid,
            ""
        ).info("success");
    } catch (err) {
        auditLog(
            `Error decode token ${err.message}`,
            "AUD_ACC_LOGIN",
            allowedOrigin,
            "KO"
        ).warn("error");
        const errorData = err.response?.data || { error: err.message };
        return createResponse(err.response?.status || 500, allowedOrigin, errorData, requestHeaders);
    }



    let body = {};
    try {
        body = event.body ? JSON.parse(event.body) : {};
    } catch (e) {
        auditLog(
            `Error take body ${e.message}`,
            "AUD_ACC_LOGIN",
            allowedOrigin,
            "KO"
        ).warn("error");
        return createResponse(400, allowedOrigin, { error: "Invalid JSON body" }, requestHeaders);
    }

    const pathDelivery = "/delivery-private/notifications/";
    const pathTimeline = "/timeline-service-private/history/";
    const pathSafeStorage = "safe-storage/v1/files/";
    const iun = body.iun
    if (!iun) return createResponse(400, allowedOrigin, { error: "Missing iun parameter" }, requestHeaders);

    const urlDelivery = `http://${process.env.APPLICATION_LOAD_BALANCER_DOMAIN}:8080${pathDelivery}${iun}`;
    const urlTimeline = `http://${process.env.APPLICATION_LOAD_BALANCER_DOMAIN}:8080${pathTimeline}${iun}`
    try {
        const apiResponseDelivery = await axios.get(
            urlDelivery,
            {
                headers: {
                    "x-pagopa-pn-uid": uid,
                    "x-pagopa-pn-cx-type": cx_type,
                    "x-pagopa-pn-cx-id": cx_id
                }
            }
        );
        auditLog(
            `Get delivery success`,
            "AUD_ACC_LOGIN",
            allowedOrigin,
            "OK",
            cx_type,
            cx_id,
            "",
            uid,
            ""
        ).info("success");
        const createdAt = apiResponseDelivery.data?.sentAt
        const apiResponseTimeline = await axios.get(
            urlTimeline,
            {

                headers: {
                    "x-pagopa-pn-uid": uid,
                    "x-pagopa-pn-cx-type": cx_type,
                    "x-pagopa-pn-cx-id": cx_id
                },
                params: {
                    numberOfRecipients: 0,
                    createdAt: createdAt
                }
            }
        );
        auditLog(
            `Get timeline success`,
            "AUD_ACC_LOGIN",
            allowedOrigin,
            "OK",
            cx_type,
            cx_id,
            "",
            uid,
            ""
        ).info("success");
        const apiResponseSafeStorage = await Promise.all(
            apiResponseDelivery.data.documents.map((element) => {
                const fileKey = element.ref.key;
                const urlSafeStorage = `${process.env.SAFE_STORAGE}${pathSafeStorage}${fileKey}`;
                s = urlSafeStorage
                return axios.get(urlSafeStorage, {
                    headers: {
                        "x-api-key": "pn-bfhd_api_key",
                        "x-pagopa-safestorage-cx-id": "pn-bfhd",
                    },
                });
            })
        );
        const safeStorageDocuments = apiResponseSafeStorage.map(res => res.data);

        const response = {
            ...apiResponseDelivery.data,
            ...apiResponseTimeline.data,
            documents: apiResponseDelivery.data.documents.map((doc, index) => ({
                ...doc,
                safeStorage: safeStorageDocuments[index]
            }))
        };
        return createResponse(200, allowedOrigin, response, requestHeaders);

    } catch (error) {
        auditLog(
            `Error retrieve data ${error.message}`,
            "AUD_ACC_LOGIN",
            allowedOrigin,
            "KO"
        ).warn("error");
        const errorData = error.response?.data || { error: error.message };

        return createResponse(error.response?.status || 500, allowedOrigin, errorData, requestHeaders);
    }
}

module.exports = { handleEvent };