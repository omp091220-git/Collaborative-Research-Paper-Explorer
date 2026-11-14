import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidUUID,
  validateMessageContent,
  validateCreateConversationPayload,
  validateSendMessagePayload,
  validatePagination,
  MAX_MESSAGE_LENGTH,
} from '../utils/directMessageValidation.js';

describe('FR-31 Direct Messaging Validation Unit Tests', () => {
  describe('isValidUUID', () => {
    it('accepts valid RFC-compliant UUIDs', () => {
      assert.strictEqual(
        isValidUUID('123e4567-e89b-12d3-a456-426614174000'),
        true
      );
      assert.strictEqual(
        isValidUUID('a0000000-0000-4000-8000-000000000001'),
        true
      );
    });

    it('rejects malformed or empty UUID strings', () => {
      assert.strictEqual(isValidUUID(''), false);
      assert.strictEqual(isValidUUID('   '), false);
      assert.strictEqual(isValidUUID('not-a-uuid'), false);
      assert.strictEqual(isValidUUID(null), false);
      assert.strictEqual(isValidUUID(undefined), false);
      assert.strictEqual(isValidUUID(12345), false);
      assert.strictEqual(
        isValidUUID('123e4567-e89b-12d3-a456-42661417400Z'),
        false
      );
    });
  });

  describe('validateMessageContent', () => {
    it('accepts valid text and trims whitespace', () => {
      const res = validateMessageContent('  Hello, fellow researcher!  ');
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.sanitized, 'Hello, fellow researcher!');
    });

    it('rejects empty or whitespace-only messages', () => {
      assert.strictEqual(validateMessageContent('').valid, false);
      assert.strictEqual(validateMessageContent('   \n\t   ').valid, false);
      assert.strictEqual(validateMessageContent(null).valid, false);
      assert.strictEqual(validateMessageContent(undefined).valid, false);
    });

    it('rejects non-string message types', () => {
      assert.strictEqual(validateMessageContent(123).valid, false);
      assert.strictEqual(validateMessageContent({ text: 'hi' }).valid, false);
      assert.strictEqual(validateMessageContent(['hi']).valid, false);
    });

    it('rejects messages exceeding MAX_MESSAGE_LENGTH', () => {
      const longMessage = 'x'.repeat(MAX_MESSAGE_LENGTH + 1);
      const res = validateMessageContent(longMessage);
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /cannot exceed/i);
    });

    it('accepts messages exactly at MAX_MESSAGE_LENGTH', () => {
      const boundaryMessage = 'a'.repeat(MAX_MESSAGE_LENGTH);
      const res = validateMessageContent(boundaryMessage);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.sanitized.length, MAX_MESSAGE_LENGTH);
    });
  });

  describe('validateCreateConversationPayload', () => {
    const currentUserId = '10000000-0000-4000-8000-000000000001';
    const recipientId = '20000000-0000-4000-8000-000000000002';

    it('accepts valid recipientId different from current user', () => {
      const res = validateCreateConversationPayload(
        { recipientId },
        currentUserId
      );
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.sanitized.recipientId, recipientId);
    });

    it('rejects self-conversation attempt', () => {
      const res = validateCreateConversationPayload(
        { recipientId: currentUserId },
        currentUserId
      );
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /cannot start a direct message conversation with yourself/i);
    });

    it('rejects missing recipientId', () => {
      const res = validateCreateConversationPayload({}, currentUserId);
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /recipientId is required/i);
    });

    it('rejects invalid recipientId UUID', () => {
      const res = validateCreateConversationPayload(
        { recipientId: 'invalid-id' },
        currentUserId
      );
      assert.strictEqual(res.valid, false);
      assert.match(res.error, /must be a valid UUID/i);
    });

    it('rejects non-object payload', () => {
      assert.strictEqual(
        validateCreateConversationPayload('string', currentUserId).valid,
        false
      );
      assert.strictEqual(
        validateCreateConversationPayload(null, currentUserId).valid,
        false
      );
      assert.strictEqual(
        validateCreateConversationPayload([], currentUserId).valid,
        false
      );
    });
  });

  describe('validateSendMessagePayload', () => {
    it('accepts valid message payload', () => {
      const res = validateSendMessagePayload({ content: 'Discussing the paper methodology.' });
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.sanitized.content, 'Discussing the paper methodology.');
    });

    it('rejects missing or empty content', () => {
      assert.strictEqual(validateSendMessagePayload({}).valid, false);
      assert.strictEqual(validateSendMessagePayload({ content: '   ' }).valid, false);
      assert.strictEqual(validateSendMessagePayload(null).valid, false);
    });
  });

  describe('validatePagination', () => {
    it('defaults limit to 50 and offset to 0 when omitted', () => {
      const p = validatePagination({});
      assert.strictEqual(p.limit, 50);
      assert.strictEqual(p.offset, 0);
    });

    it('caps limit at 100', () => {
      const p = validatePagination({ limit: 500, offset: 10 });
      assert.strictEqual(p.limit, 100);
      assert.strictEqual(p.offset, 10);
    });

    it('corrects negative numbers or non-numbers', () => {
      const p = validatePagination({ limit: -5, offset: -2 });
      assert.strictEqual(p.limit, 50);
      assert.strictEqual(p.offset, 0);

      const p2 = validatePagination({ limit: 'abc', offset: 'xyz' });
      assert.strictEqual(p2.limit, 50);
      assert.strictEqual(p2.offset, 0);
    });
  });
});
