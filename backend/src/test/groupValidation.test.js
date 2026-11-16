import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidUUID,
  validateGroupName,
  validateGroupDescription,
  validateInitialMembers,
  validateCreateGroupPayload,
  MIN_GROUP_NAME_LENGTH,
  MAX_GROUP_NAME_LENGTH,
  MAX_GROUP_DESCRIPTION_LENGTH,
  MAX_INITIAL_MEMBERS,
} from '../utils/groupValidation.js';

describe('FR-32 Group Validation Utilities', () => {
  describe('isValidUUID', () => {
    it('accepts valid v4 UUIDs', () => {
      const valid = '123e4567-e89b-12d3-a456-426614174000';
      assert.equal(isValidUUID(valid), true);
    });

    it('rejects malformed UUIDs', () => {
      assert.equal(isValidUUID(''), false);
      assert.equal(isValidUUID('not-a-uuid'), false);
      assert.equal(isValidUUID(null), false);
      assert.equal(isValidUUID(undefined), false);
      assert.equal(isValidUUID(12345), false);
      assert.equal(isValidUUID('123e4567-e89b-12d3-a456-42661417400'), false); // too short
    });
  });

  describe('validateGroupName', () => {
    it('accepts valid group names and trims whitespace', () => {
      const result = validateGroupName('  Deep Learning Reading Group  ');
      assert.equal(result.valid, true);
      assert.equal(result.sanitized, 'Deep Learning Reading Group');
    });

    it('accepts names at minimum length', () => {
      const name = 'AI';
      const result = validateGroupName(name);
      assert.equal(result.valid, true);
      assert.equal(result.sanitized, 'AI');
    });

    it('rejects missing or empty name', () => {
      assert.equal(validateGroupName(null).valid, false);
      assert.equal(validateGroupName(undefined).valid, false);
      assert.equal(validateGroupName('').valid, false);
      assert.equal(validateGroupName('   ').valid, false);
    });

    it('rejects names shorter than minimum length', () => {
      const result = validateGroupName('A');
      assert.equal(result.valid, false);
      assert.match(result.error, /at least 2 characters/);
    });

    it('rejects names longer than maximum length', () => {
      const longName = 'x'.repeat(MAX_GROUP_NAME_LENGTH + 1);
      const result = validateGroupName(longName);
      assert.equal(result.valid, false);
      assert.match(result.error, /cannot exceed 100 characters/);
    });

    it('rejects non-string values', () => {
      assert.equal(validateGroupName(12345).valid, false);
      assert.equal(validateGroupName({}).valid, false);
    });
  });

  describe('validateGroupDescription', () => {
    it('allows undefined, null, or empty string as optional description', () => {
      assert.deepEqual(validateGroupDescription(undefined), { valid: true, sanitized: null });
      assert.deepEqual(validateGroupDescription(null), { valid: true, sanitized: null });
      assert.deepEqual(validateGroupDescription(''), { valid: true, sanitized: null });
      assert.deepEqual(validateGroupDescription('   '), { valid: true, sanitized: null });
    });

    it('accepts and trims valid descriptions', () => {
      const desc = '   Discussion forum for LLM fine-tuning techniques and papers.   ';
      const result = validateGroupDescription(desc);
      assert.equal(result.valid, true);
      assert.equal(result.sanitized, 'Discussion forum for LLM fine-tuning techniques and papers.');
    });

    it('rejects descriptions exceeding max length', () => {
      const longDesc = 'a'.repeat(MAX_GROUP_DESCRIPTION_LENGTH + 1);
      const result = validateGroupDescription(longDesc);
      assert.equal(result.valid, false);
      assert.match(result.error, /cannot exceed 500 characters/);
    });

    it('rejects non-string description', () => {
      assert.equal(validateGroupDescription(123).valid, false);
    });
  });

  describe('validateInitialMembers', () => {
    const creatorId = '11111111-1111-4111-a111-111111111111';
    const member1 = '22222222-2222-4222-a222-222222222222';
    const member2 = '33333333-3333-4333-a333-333333333333';

    it('returns empty array when no members provided', () => {
      assert.deepEqual(validateInitialMembers(undefined, creatorId), { valid: true, sanitized: [] });
      assert.deepEqual(validateInitialMembers(null, creatorId), { valid: true, sanitized: [] });
      assert.deepEqual(validateInitialMembers([], creatorId), { valid: true, sanitized: [] });
    });

    it('accepts valid array of UUIDs and excludes creatorId', () => {
      const result = validateInitialMembers([member1, creatorId, member2], creatorId);
      assert.equal(result.valid, true);
      assert.equal(result.sanitized.length, 2);
      assert.ok(result.sanitized.includes(member1));
      assert.ok(result.sanitized.includes(member2));
      assert.ok(!result.sanitized.includes(creatorId));
    });

    it('deduplicates member IDs', () => {
      const result = validateInitialMembers([member1, member1, member2], creatorId);
      assert.equal(result.valid, true);
      assert.equal(result.sanitized.length, 2);
    });

    it('rejects non-array member lists', () => {
      const result = validateInitialMembers('not-an-array', creatorId);
      assert.equal(result.valid, false);
      assert.match(result.error, /must be an array/);
    });

    it('rejects invalid UUIDs within member list', () => {
      const result = validateInitialMembers([member1, 'invalid-uuid'], creatorId);
      assert.equal(result.valid, false);
      assert.match(result.error, /Invalid user ID/);
    });

    it('rejects more than MAX_INITIAL_MEMBERS', () => {
      const tooMany = Array.from({ length: MAX_INITIAL_MEMBERS + 1 }, (_, i) =>
        `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`
      );
      const result = validateInitialMembers(tooMany, creatorId);
      assert.equal(result.valid, false);
      assert.match(result.error, /Cannot add more than 50 members/);
    });
  });

  describe('validateCreateGroupPayload', () => {
    const creatorId = '11111111-1111-4111-a111-111111111111';

    it('validates complete valid payload', () => {
      const payload = {
        name: 'Quantum Computing Research',
        description: 'Papers on quantum algorithms and error correction.',
        initialMemberIds: ['22222222-2222-4222-a222-222222222222'],
      };

      const result = validateCreateGroupPayload(payload, creatorId);
      assert.equal(result.valid, true);
      assert.equal(result.sanitized.name, 'Quantum Computing Research');
      assert.equal(result.sanitized.description, 'Papers on quantum algorithms and error correction.');
      assert.deepEqual(result.sanitized.initialMemberIds, ['22222222-2222-4222-a222-222222222222']);
    });

    it('rejects non-object payload', () => {
      assert.equal(validateCreateGroupPayload(null, creatorId).valid, false);
      assert.equal(validateCreateGroupPayload('string', creatorId).valid, false);
      assert.equal(validateCreateGroupPayload([], creatorId).valid, false);
    });

    it('rejects invalid name in payload', () => {
      const payload = { name: '' };
      const result = validateCreateGroupPayload(payload, creatorId);
      assert.equal(result.valid, false);
    });
  });
});
