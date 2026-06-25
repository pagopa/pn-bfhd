const {handleEvent} = require("./src/app/eventHandler.js");

async function handler(event, context) {
    console.info("PN Notification Wrapper - new Request received");
    return handleEvent(event,context);
}

exports.handler=handler;