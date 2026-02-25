const axios = require('axios');

async function handleEvent(event, context) {


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
        const apiResponse = await axios.get(url,
            {
                headers: {
                    "x-pagopa-pn-uid": headers["x-pagopa-pn-cx-id"],
                    "x-pagopa-pn-cx-type": headers["x-pagopa-pn-cx-type"],
                    "x-pagopa-pn-cx-id": headers["x-pagopa-pn-uid"]
                }
            },
            {});

        return {
            statusCode: 200,
            body: JSON.stringify(apiResponse.data)
        };

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