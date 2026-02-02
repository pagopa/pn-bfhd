async function handleEvent(event) {
    // log event
    console.debug("Handling event:", JSON.stringify(event));
    
    // process event (placeholder logic)
    const response = {
        statusCode: 200,
        body: JSON.stringify({ message: "Event handled successfully" })
    };
    
    return response;
}

module.exports = {handleEvent}