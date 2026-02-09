const axios = require('axios');

async function handleEvent(event) {

    try {
        // Gestione flessibile del body
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        const iun = body?.iun || body?.iuns?.[0] || event.iun;
    } catch (e) {
        console.log(e);
    }

    const host = process.env.BFHD_API_HOST || 'https://api.bo.uat.notifichedigitali.it';
    const logPath = '/bfhd/logs/v1/notifications/info';

   //Token deve essere preso dagli headers
    //const token = process.env.AUTH_TOKEN ? process.env.AUTH_TOKEN.replace('Bearer ', '') : '';

    try {
        const apiResponse = await axios.post(`${host}${logPath}`,
        {
            // Come richiesto dallo YAML: array di stringhe e data
            iuns: iun ? [iun] : [],
            dateFrom: new Date().toISOString()
        },
        {
        //da verificare
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'x-pagopa-pn-uid': event.requestContext?.authorizer?.principalId || process.env.PN_UID,
                'x-pagopa-pn-cx-type': 'BO'
            },
            timeout: 15000 // Alzato leggermente per UAT
        });

        return {
            statusCode: 200,
            body: JSON.stringify(apiResponse.data)
        };
    } catch (error) {
        // Log dettagliato per il debug in UAT
        const errorData = error.response?.data || { error: error.message };
        console.error("Errore BFHD:", JSON.stringify(errorData));

        return {
            statusCode: error.response?.status || 500,
            body: JSON.stringify(errorData)
        };
    }
}

module.exports = { handleEvent };