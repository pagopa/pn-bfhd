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
    const iun = body.iuns[0]
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
        let documentCancelledCount = 0;
        const apiResponseSafeStorage = await Promise.all(
            apiResponseDelivery.data.documents.map((element) => {
                const fileKey = element.ref.key;
                const urlSafeStorage = `${process.env.SAFE_STORAGE}${pathSafeStorage}${fileKey}`;
                return axios.get(urlSafeStorage, {
                    headers: {
                        "x-api-key": "pn-bfhd_api_key",
                        "x-pagopa-safestorage-cx-id": "pn-bfhd",
                    },
                })
                    .then((res) => {
                        return {
                            ...element,
                            safeStorage: res.data
                        };
                    })
                    .catch((error) => {
                        if (error.response && error.response.status === 410) {
                            documentCancelledCount++;
                            return "Documenti non disponibili in quanto cancellati dopo 120gg dal perfezionamento";
                        }
                        throw error;
                    });
            })
        );

        const updatedTimeline = await Promise.all(
            apiResponseTimeline.data.timeline.map(async (event) => {
                // Cloniamo l'evento e i suoi sotto-oggetti per poterli sovrascrivere in sicurezza
                let updatedEvent = {
                    ...event,
                    details: { ...event.details },
                    categorizedAttachmentsResult: event.categorizedAttachmentsResult
                        ? { ...event.categorizedAttachmentsResult }
                        : undefined
                };

                // --- CASO 1: Sostituzione di details.legalFactId ---
                const legalFactId = updatedEvent.details?.legalFactId;
                if (legalFactId && legalFactId.includes("PN_LEGAL_FACTS")) {
                    try {
                        const fileKey = legalFactId.replace("safestorage://", "").split('?')[0];
                        const urlSafeStorage = `${process.env.SAFE_STORAGE}${pathSafeStorage}${fileKey}`;

                        const res = await axios.get(urlSafeStorage, {
                            headers: {
                                "x-api-key": "pn-bfhd_api_key",
                                "x-pagopa-safestorage-cx-id": "pn-bfhd",
                            },
                        });

                        // Sostituiamo la stringa "safestorage://..." direttamente con l'oggetto di risposta
                        updatedEvent.details.legalFactId = res.data;
                    } catch (error) {
                        if (error.response && error.response.status === 410) {
                            documentCancelledCount++;
                            updatedEvent.details.legalFactId = "Documenti non disponibili in quanto cancellati dopo 120gg dal perfezionamento";
                        } else {
                            throw error;
                        }
                    }
                }

                // --- CASO 2: Sostituzione di fileKey dentro categorizedAttachmentsResult.acceptedAttachments ---
                const acceptedAttachments = updatedEvent.categorizedAttachmentsResult?.acceptedAttachments;
                if (acceptedAttachments && Array.isArray(acceptedAttachments) && acceptedAttachments.length > 0) {
                    updatedEvent.categorizedAttachmentsResult.acceptedAttachments = await Promise.all(
                        acceptedAttachments.map(async (attachment) => {
                            if (attachment.fileKey && attachment.fileKey.startsWith("safestorage://")) {
                                try {
                                    const fileKey = attachment.fileKey.replace("safestorage://", "").split('?')[0];
                                    const urlSafeStorage = `${process.env.SAFE_STORAGE}${pathSafeStorage}${fileKey}`;

                                    const res = await axios.get(urlSafeStorage, {
                                        headers: {
                                            "x-api-key": "pn-bfhd_api_key",
                                            "x-pagopa-safestorage-cx-id": "pn-bfhd",
                                        },
                                    });

                                    // Sovrascriviamo la proprietà fileKey con l'oggetto ritornato dall'API
                                    return {
                                        ...attachment,
                                        fileKey: res.data
                                    };
                                } catch (error) {
                                    if (error.response && error.response.status === 410) {
                                        documentCancelledCount++;
                                        return {
                                            ...attachment,
                                            fileKey: "Documenti non disponibili in quanto cancellati dopo 120gg dal perfezionamento"
                                        };
                                    }
                                    throw error;
                                }
                            }
                            return attachment;
                        })
                    );
                }

                // --- CASO 3: Sostituzione di url dentro details.attachments ---
                const attachments = updatedEvent.details?.attachments;
                if (attachments && Array.isArray(attachments) && attachments.length > 0) {
                    updatedEvent.details.attachments = await Promise.all(
                        attachments.map(async (attachment) => {
                            // Controlliamo ed estraiamo dal campo .url invece di .fileKey
                            if (attachment.url && attachment.url.startsWith("safestorage://")) {
                                try {
                                    const fileKey = attachment.url.replace("safestorage://", "").split('?')[0];
                                    const urlSafeStorage = `${process.env.SAFE_STORAGE}${pathSafeStorage}${fileKey}`;

                                    const res = await axios.get(urlSafeStorage, {
                                        headers: {
                                            "x-api-key": "pn-bfhd_api_key",
                                            "x-pagopa-safestorage-cx-id": "pn-bfhd",
                                        },
                                    });

                                    // Sovrascriviamo la proprietà .url con l'oggetto di risposta di SafeStorage
                                    return {
                                        ...attachment,
                                        url: res.data
                                    };
                                } catch (error) {
                                    if (error.response && error.response.status === 410) {
                                        documentCancelledCount++;
                                        return {
                                            ...attachment,
                                            url: "Documenti non disponibili in quanto cancellati dopo 120gg dal perfezionamento"
                                        };
                                    }
                                    throw error;
                                }
                            }
                            return attachment;
                        })
                    );
                }

                return updatedEvent;
            })
        );



        // Ora puoi riassegnare l'array aggiornato al tuo oggetto originale
        data.timeline = updatedTimeline;


        const rawTimeline = apiResponseTimeline.data.timeline || [];
        const recipientsList = apiResponseDelivery.data.recipients || [];

        const timelineByRecipient = {};
        recipientsList.forEach((_, index) => {
            timelineByRecipient[index] = [];
        });

        rawTimeline.forEach((timelineEvent) => {
            if (timelineEvent.details && typeof timelineEvent.details.recIndex !== "undefined" && timelineEvent.details.recIndex !== null) {
                const index = timelineEvent.details.recIndex;
                if (timelineByRecipient[index]) {
                    timelineByRecipient[index].push(timelineEvent);
                }
            } else if (timelineEvent.elementId && timelineEvent.elementId.includes(".RECINDEX_")) {
                const match = timelineEvent.elementId.match(/\.RECINDEX_(\d+)/);
                if (match && match[1]) {
                    const index = parseInt(match[1], 10);
                    if (timelineByRecipient[index]) {
                        timelineByRecipient[index].push(timelineEvent);
                    }
                }
            }
        });

        const recipientsWithTimeline = recipientsList.map((recipient, index) => ({
            ...recipient,
            timeline: timelineByRecipient[index] || []
        }));


        const response = {
            ...apiResponseDelivery.data,
            ...apiResponseTimeline.data,
            recipients: recipientsWithTimeline,
            timeline: rawTimeline,
            documents: apiResponseSafeStorage
        };

        if (documentCancelledCount === apiResponseDelivery.data.documents.length) {
            response.documents = { description: "Documenti non disponibili in quanto cancellati dopo 120gg dal perfezionamento", documentCancelledCount: documentCancelledCount };
        }

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