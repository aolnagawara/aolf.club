import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ApiRequest,
  ApiResponse
} from '../../../api/_lib/http/responses.js';

const {
  mockSendConfirmationButtons,
  mockSendTextMessage,
  mockVerifyWebhookSignature,
  mockHandleIncomingText,
  mockHandleButtonReply,
  mockWasMessageProcessed,
  mockMarkMessageProcessed
} = vi.hoisted(() => ({
  mockSendConfirmationButtons: vi.fn(async () => {}),
  mockSendTextMessage: vi.fn(async () => {}),
  mockVerifyWebhookSignature: vi.fn(() => true),
  mockHandleIncomingText: vi.fn(),
  mockHandleButtonReply: vi.fn(),
  mockWasMessageProcessed: vi.fn(() => false),
  mockMarkMessageProcessed: vi.fn()
}));

vi.mock('../../../api/_lib/whatsapp/cloudApi.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../api/_lib/whatsapp/cloudApi.js')
    >();
  return {
    ...actual,
    verifyWebhookSignature: mockVerifyWebhookSignature,
    sendConfirmationButtons: mockSendConfirmationButtons,
    sendTextMessage: mockSendTextMessage
  };
});

vi.mock('../../../api/_lib/whatsapp/leadCaptureService.js', () => {
  return {
    handleIncomingText: mockHandleIncomingText,
    handleButtonReply: mockHandleButtonReply
  };
});

vi.mock('../../../api/_lib/whatsapp/pendingStore.js', () => ({
  wasMessageProcessed: mockWasMessageProcessed,
  markMessageProcessed: mockMarkMessageProcessed
}));

import handler from '../../../api/whatsapp/webhook.js';

type ResponseCapture = {
  statusCode: number;
  jsonBody: unknown;
  endBody: string;
  headers: Record<string, string | string[]>;
};

function createResponseCapture(): {
  res: ApiResponse;
  capture: ResponseCapture;
} {
  const capture: ResponseCapture = {
    statusCode: 200,
    jsonBody: null,
    endBody: '',
    headers: {}
  };

  const res: ApiResponse = {
    status(code) {
      capture.statusCode = code;
      return res;
    },
    json(body) {
      capture.jsonBody = body;
      return res;
    },
    setHeader(name, value) {
      capture.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return capture.headers[name.toLowerCase()];
    },
    end(body) {
      capture.endBody = body || '';
    }
  };

  return { res, capture };
}

function createRequest(body: unknown): ApiRequest {
  return {
    method: 'POST',
    headers: {
      'x-hub-signature-256': 'sha256=test'
    },
    query: {},
    body
  };
}

describe('whatsapp webhook event routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyWebhookSignature.mockReturnValue(true);
    mockWasMessageProcessed.mockReturnValue(false);
  });

  it('rejects an invalid signature before processing events', async () => {
    mockVerifyWebhookSignature.mockReturnValue(false);
    const req = createRequest({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'msg-invalid-signature',
                    from: '919876543210',
                    type: 'text',
                    text: { body: 'private message body' }
                  }
                ]
              }
            }
          ]
        }
      ]
    });
    const { res, capture } = createResponseCapture();

    await handler(req, res);

    expect(mockHandleIncomingText).not.toHaveBeenCalled();
    expect(capture.statusCode).toBe(403);
  });

  it('parses a text event and sends confirmation buttons', async () => {
    mockHandleIncomingText.mockResolvedValue({
      action: 'show_confirmation',
      parsed: {
        mobile: '9876543210',
        name: 'Sandip',
        course: 'HP',
        leadQuality: 'Hot',
        month: 'Aug',
        notes: 'Need callback',
        originalMessage: 'Need callback 9876543210 Sandip HP Hot Aug'
      }
    });

    const req = createRequest({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'msg-1',
                    from: '919876543210',
                    type: 'text',
                    text: { body: 'Need callback 9876543210 Sandip HP Hot Aug' }
                  }
                ]
              }
            }
          ]
        }
      ]
    });
    const { res, capture } = createResponseCapture();

    await handler(req, res);

    expect(mockHandleIncomingText).toHaveBeenCalledWith(
      '919876543210',
      'Need callback 9876543210 Sandip HP Hot Aug',
      'msg-1'
    );
    expect(mockSendConfirmationButtons).toHaveBeenCalledTimes(1);
    expect(mockSendTextMessage).not.toHaveBeenCalled();
    expect(mockMarkMessageProcessed).toHaveBeenCalledWith('msg-1');
    expect(capture.statusCode).toBe(200);
    expect(capture.jsonBody).toEqual({ success: true });
  });

  it('sends the edit instruction and copyable lead draft', async () => {
    const editMessages = [
      'Copy the next message, correct any details, and send it back.',
      'Sandip 9876543210 HP,DSN Hot Aug Need callback'
    ];
    mockHandleButtonReply.mockResolvedValue({
      action: 'send_text',
      messages: editMessages
    });

    const req = createRequest({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'msg-2',
                    from: '919876543210',
                    type: 'interactive',
                    interactive: {
                      button_reply: {
                        id: 'edit_lead',
                        title: 'Edit'
                      }
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    });
    const { res, capture } = createResponseCapture();

    await handler(req, res);

    expect(mockHandleButtonReply).toHaveBeenCalledWith(
      '919876543210',
      'edit_lead'
    );
    expect(mockSendTextMessage).toHaveBeenNthCalledWith(
      1,
      '919876543210',
      editMessages[0]
    );
    expect(mockSendTextMessage).toHaveBeenNthCalledWith(
      2,
      '919876543210',
      editMessages[1]
    );
    expect(mockMarkMessageProcessed).toHaveBeenCalledWith('msg-2');
    expect(mockSendConfirmationButtons).not.toHaveBeenCalled();
    expect(capture.statusCode).toBe(200);
    expect(capture.jsonBody).toEqual({ success: true });
  });

  it('does not mark the message processed when sending a reply fails', async () => {
    mockHandleIncomingText.mockResolvedValue({
      action: 'send_text',
      message: 'Please resend with mobile.'
    });
    mockSendTextMessage.mockRejectedValueOnce(new Error('Meta unavailable'));
    const req = createRequest({
      value: {
        messages: [
          {
            id: 'msg-send-fails',
            from: '919876543210',
            type: 'text',
            text: { body: 'bad message' }
          }
        ]
      }
    });
    const { res, capture } = createResponseCapture();

    await handler(req, res);

    expect(capture.statusCode).toBe(502);
    expect(mockMarkMessageProcessed).not.toHaveBeenCalled();
  });

  it('parses dashboard sample payload in top-level field/value format', async () => {
    mockHandleIncomingText.mockResolvedValue({
      action: 'show_confirmation',
      parsed: {
        mobile: '6315551181',
        name: 'Test User',
        course: '',
        leadQuality: '',
        month: '',
        notes: '',
        originalMessage: 'this is a text message'
      }
    });

    const req = createRequest({
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: {
          display_phone_number: '16505551111',
          phone_number_id: '123456123'
        },
        contacts: [
          {
            profile: {
              name: 'test user name'
            },
            wa_id: '16315551181',
            user_id: 'US.13491208655302741918'
          }
        ],
        messages: [
          {
            id: 'ABGGFlA5Fpa',
            timestamp: '1504902988',
            from: '16315551181',
            from_user_id: 'US.13491208655302741918',
            type: 'text',
            text: {
              body: 'this is a text message'
            }
          }
        ]
      }
    });
    const { res, capture } = createResponseCapture();

    await handler(req, res);

    expect(mockHandleIncomingText).toHaveBeenCalledWith(
      '16315551181',
      'this is a text message',
      'ABGGFlA5Fpa'
    );
    expect(mockSendConfirmationButtons).toHaveBeenCalledTimes(1);
    expect(capture.statusCode).toBe(200);
    expect(capture.jsonBody).toEqual({ success: true });
  });

  it('does not process or reply to an already-processed duplicate event', async () => {
    mockWasMessageProcessed.mockReturnValue(true);
    const req = createRequest({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'msg-duplicate',
                    from: '919876543210',
                    type: 'text',
                    text: { body: '9876543210 Sandip HP Hot Aug' }
                  }
                ]
              }
            }
          ]
        }
      ]
    });
    const { res, capture } = createResponseCapture();

    await handler(req, res);

    expect(mockHandleIncomingText).not.toHaveBeenCalled();
    expect(mockSendConfirmationButtons).not.toHaveBeenCalled();
    expect(mockSendTextMessage).not.toHaveBeenCalled();
    expect(mockMarkMessageProcessed).not.toHaveBeenCalled();
    expect(capture.statusCode).toBe(200);
  });

  it('coalesces overlapping deliveries of the same message id', async () => {
    let resolveHandling!: (value: {
      action: 'send_text';
      message: string;
    }) => void;
    const handling = new Promise<{
      action: 'send_text';
      message: string;
    }>((resolve) => {
      resolveHandling = resolve;
    });
    mockHandleIncomingText.mockReturnValue(handling);
    const body = {
      value: {
        messages: [
          {
            id: 'msg-overlapping',
            from: '919876543210',
            type: 'text',
            text: { body: '9876543210 Sandip HP Hot Aug' }
          }
        ]
      }
    };
    const firstResponse = createResponseCapture();
    const secondResponse = createResponseCapture();

    const firstRequest = handler(createRequest(body), firstResponse.res);
    await vi.waitFor(() => {
      expect(mockHandleIncomingText).toHaveBeenCalledTimes(1);
    });

    const secondRequest = handler(createRequest(body), secondResponse.res);
    await vi.waitFor(() => {
      expect(mockWasMessageProcessed).toHaveBeenCalledTimes(2);
      expect(mockHandleIncomingText).toHaveBeenCalledTimes(1);
    });

    resolveHandling({ action: 'send_text', message: 'Handled once.' });
    await Promise.all([firstRequest, secondRequest]);

    expect(mockHandleIncomingText).toHaveBeenCalledTimes(1);
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
    expect(mockMarkMessageProcessed).toHaveBeenCalledTimes(1);
    expect(firstResponse.capture.statusCode).toBe(200);
    expect(secondResponse.capture.statusCode).toBe(200);
  });

  it('processes multiple events sequentially in delivery order', async () => {
    mockHandleIncomingText.mockImplementation(
      async (_from: string, text: string) => ({
        action: 'send_text',
        message: `handled: ${text}`
      })
    );
    const req = createRequest({
      value: {
        messages: [
          {
            id: 'msg-first',
            from: '919876543210',
            type: 'text',
            text: { body: 'first message' }
          },
          {
            id: 'msg-second',
            from: '919876543211',
            type: 'text',
            text: { body: 'second message' }
          }
        ]
      }
    });
    const { res, capture } = createResponseCapture();

    await handler(req, res);

    expect(mockHandleIncomingText.mock.invocationCallOrder[0]).toBeLessThan(
      mockHandleIncomingText.mock.invocationCallOrder[1]
    );
    expect(mockSendTextMessage).toHaveBeenNthCalledWith(
      1,
      '919876543210',
      'handled: first message'
    );
    expect(mockSendTextMessage).toHaveBeenNthCalledWith(
      2,
      '919876543211',
      'handled: second message'
    );
    expect(mockMarkMessageProcessed).toHaveBeenCalledWith('msg-first');
    expect(mockMarkMessageProcessed).toHaveBeenCalledWith('msg-second');
    expect(capture.statusCode).toBe(200);
  });
});
