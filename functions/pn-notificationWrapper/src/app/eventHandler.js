const axios = require('axios');

async function handleEvent(event, context) {

    try {
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        const iun = body?.iun || body?.iuns?.[0] || event.iun;
    } catch (e) {
        console.log(e);
    }

    // bisogna definire questo parametro su aws, nella lambda, come parametro di impostazione in base all ambiente.
    //definirlo poi dentro microservice.yml e utilizzarlo qui
    const host = process.env.BFHD_API_HOST || 'https://api.bo.uat.notifichedigitali.it';
    const logPath = '/bfhd/logs/v1/notifications/info';
    const path = "/notifications/sent/";
    const IUN = event.pathParameters["iun"];
    const url = `${process.env.PN_DELIVERY_URL}${path}${IUN}`;

   //Token deve essere preso dagli headers
    //const token = process.env.AUTH_TOKEN ? process.env.AUTH_TOKEN.replace('Bearer ', '') : '';

    try {
        const apiResponse = await axios.post(url,
        {
            iuns: iun ? [iun] : [],
            ticketNumber: "SNDA-1000"
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