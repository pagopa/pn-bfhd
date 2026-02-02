const {handleEvent} = require("./src/app/eventHandler.js");

async function handler(event) {
    console.info("PN Notification Wrapper - new Request received");
    return handleEvent(event);
}

exports.handler=handler;