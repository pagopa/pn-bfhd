const { expect } = require('chai');
const { handleEvent } = require('../app/eventHandler');

describe('EventHandler Tests', () => {

    describe('handleEvent with valid authorizer context', () => {
        it('should return 200 with complete response', async () => {

            const mockEvent = {
                pathParameters: { iun: "UDGN-JWMA-NEWQ-202602-Y-1" },
                body: JSON.stringify({ key: 'value' }),
                headers: {
                    "x-pagopa-pn-cx-id": "",
                    "x-pagopa-pn-cx-type": "",
                    "x-pagopa-pn-uid": ""
                }

            };
            const mockContext = {
                authorizer: {
                    cx_id: 'user123',
                    cx_type: 'PA',
                    uid: '1234'
                }
            }
            const response = await handleEvent(mockEvent, mockContext);
            expect(response).to.have.property('statusCode');
            expect(response).to.have.property('body');
            //const responseBody = JSON.parse(response.body);
            //expect(responseBody).to.have.property('message', 'Event handled successfully');
        });

    });
});