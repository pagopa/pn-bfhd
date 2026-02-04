const { expect } = require('chai');
const { handleEvent } = require('../app/eventHandler');

describe('EventHandler Tests', () => {

    describe('handleEvent with valid authorizer context', () => {
        it('should return 200 with complete response', async () => {
            
            const mockEvent = {
                requestContext: {
                    authorizer: {
                        principalId: 'user123',
                        roles: ['admin', 'user']
                    }
                },
                body: JSON.stringify({ key: 'value' })
            };

            const response = await handleEvent(mockEvent);
            expect(response).to.have.property('statusCode', 200);
            expect(response).to.have.property('body');
            const responseBody = JSON.parse(response.body);
            expect(responseBody).to.have.property('message', 'Event handled successfully');
        });

    });
});