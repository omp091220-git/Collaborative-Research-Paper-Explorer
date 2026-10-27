import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import pool from '../config/database.js';
import notificationRoutes from '../routes/notification.routes.js';
import * as notificationService from '../services/notification.service.js';
import * as notificationRepo from '../repositories/notification.repository.js';
import * as paperStarRepo from '../repositories/paperStar.repository.js';
import {
  extractMentions,
  computeMentionDiff,
  resolveMentionedUsers,
} from '../utils/mentionHelper.js';

const TEST_SECRET =
  process.env.JWT_SECRET || 'super_secure_test_jwt_secret_with_32_characters_12345';

const USER_ALICE = {
  id: 'a0000000-0000-4000-8000-000000000001',
  email: 'alice@university.edu',
  username: 'alice',
  full_name: 'Alice Smith',
  role: 'RESEARCHER',
};

const USER_BOB = {
  id: 'b0000000-0000-4000-8000-000000000002',
  email: 'bob@university.edu',
  username: 'bob',
  full_name: 'Bob Jones',
  role: 'RESEARCHER',
};

const USER_CHARLIE = {
  id: 'c0000000-0000-4000-8000-000000000003',
  email: 'charlie@university.edu',
  username: 'charlie',
  full_name: 'Charlie Brown',
  role: 'STUDENT',
};

const PAPER_1 = {
  id: 'p0000000-0000-4000-8000-000000000001',
  title: 'Quantum Advantage in Chemistry',
  abstract: 'Exploring VQE algorithms.',
  authors: ['Alice Smith', 'Bob Jones'],
  uploader_id: USER_ALICE.id,
};

function tokenFor(userId) {
  return jwt.sign({ id: userId }, TEST_SECRET, { expiresIn: '15m' });
}

function createNotificationApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationRoutes);
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({ error: err.message });
  });
  return app;
}

describe('Notification System Test Suite', () => {
  // In-memory mock store for notifications, stars, and papers
  let mockNotifications = [];
  let mockStars = [];
  const originalQuery = pool.query;

  beforeEach(() => {
    mockNotifications = [];
    mockStars = [];

    // Mock pool.query for unit test isolation
    pool.query = async (sql, params) => {
      const text = String(sql);

      // 1. Auth middleware: find user by id
      if (text.includes('FROM users') && text.includes('WHERE id = $1')) {
        const id = params?.[0];
        const found = [USER_ALICE, USER_BOB, USER_CHARLIE].find((u) => u.id === id);
        return { rows: found ? [found] : [] };
      }

      // 2. Mention resolution: find users by lower usernames or emails
      if (text.includes('FROM users') && text.includes('ANY($1::text[])')) {
        const targetUsernames = params?.[0] || [];
        const matches = [USER_ALICE, USER_BOB, USER_CHARLIE].filter((u) =>
          targetUsernames.includes(u.username.toLowerCase())
        );
        return { rows: matches };
      }

      // 3. Paper query
      if (text.includes('FROM papers WHERE id = $1')) {
        const id = params?.[0];
        return { rows: id === PAPER_1.id ? [PAPER_1] : [] };
      }

      // 4. Topic tag query
      if (text.includes('FROM topic_tags WHERE id = $1')) {
        return { rows: [{ id: params?.[0], name: 'Quantum Physics' }] };
      }

      // 5. Notifications insert
      if (text.includes('INSERT INTO notifications')) {
        const newNotif = {
          id: `e0000000-0000-4000-8000-${String(mockNotifications.length + 1).padStart(12, '0')}`,
          recipient_id: params[0],
          actor_id: params[1],
          type: params[2],
          title: params[3],
          message: params[4],
          paper_id: params[5],
          source_type: params[6],
          source_id: params[7],
          data: JSON.parse(params[8] || '{}'),
          link: params[9],
          is_read: false,
          read_at: null,
          created_at: new Date().toISOString(),
        };
        mockNotifications.push(newNotif);
        return { rows: [newNotif] };
      }

      // 6. Notifications select for user
      if (text.includes('FROM notifications') && text.includes('recipient_id = $1')) {
        const userId = params[0];
        let filtered = mockNotifications.filter((n) => n.recipient_id === userId);

        if (text.includes('is_read = FALSE') && text.includes('COUNT(*)')) {
          const unreadCount = filtered.filter((n) => !n.is_read).length;
          return { rows: [{ count: unreadCount }] };
        }

        if (text.includes('COUNT(*)')) {
          if (text.includes('AND is_read = FALSE')) {
            filtered = filtered.filter((n) => !n.is_read);
          }
          return { rows: [{ count: filtered.length }] };
        }

        if (text.includes('AND n.is_read = FALSE')) {
          filtered = filtered.filter((n) => !n.is_read);
        }

        return {
          rows: filtered.map((n) => ({
            ...n,
            actor_name: 'Actor User',
            paper_title: PAPER_1.title,
          })),
        };
      }

      // 7. Notification mark as read
      if (text.includes('UPDATE notifications') && text.includes('SET is_read = TRUE')) {
        if (text.includes('WHERE id = $1 AND recipient_id = $2')) {
          const notifId = params[0];
          const userId = params[1];
          const found = mockNotifications.find(
            (n) => n.id === notifId && n.recipient_id === userId
          );
          if (found) {
            found.is_read = true;
            found.read_at = new Date().toISOString();
            return { rows: [found] };
          }
          return { rows: [] };
        }

        if (text.includes('WHERE recipient_id = $1 AND is_read = FALSE')) {
          const userId = params[0];
          let updated = 0;
          for (const n of mockNotifications) {
            if (n.recipient_id === userId && !n.is_read) {
              n.is_read = true;
              n.read_at = new Date().toISOString();
              updated++;
            }
          }
          return { rowCount: updated };
        }
      }

      // 8. Notification delete
      if (text.includes('DELETE FROM notifications') && text.includes('WHERE id = $1 AND recipient_id = $2')) {
        const notifId = params[0];
        const userId = params[1];
        const idx = mockNotifications.findIndex(
          (n) => n.id === notifId && n.recipient_id === userId
        );
        if (idx !== -1) {
          const removed = mockNotifications.splice(idx, 1)[0];
          return { rows: [removed] };
        }
        return { rows: [] };
      }

      // 9. Stars queries
      if (text.includes('INSERT INTO paper_stars')) {
        const userId = params[0];
        const paperId = params[1];
        const exists = mockStars.some((s) => s.user_id === userId && s.paper_id === paperId);
        if (!exists) {
          mockStars.push({ user_id: userId, paper_id: paperId });
          return { rowCount: 1 };
        }
        return { rowCount: 0 };
      }

      if (text.includes('DELETE FROM paper_stars')) {
        const userId = params[0];
        const paperId = params[1];
        const idx = mockStars.findIndex((s) => s.user_id === userId && s.paper_id === paperId);
        if (idx !== -1) {
          mockStars.splice(idx, 1);
          return { rowCount: 1 };
        }
        return { rowCount: 0 };
      }

      if (text.includes('FROM paper_stars WHERE paper_id = $1')) {
        const paperId = params[0];
        let starrers = mockStars.filter((s) => s.paper_id === paperId);
        if (text.includes('user_id != $2')) {
          const excludeId = params[1];
          starrers = starrers.filter((s) => s.user_id !== excludeId);
        }
        return { rows: starrers };
      }

      return { rows: [] };
    };
  });

  // -------------------------------------------------------------------------
  // Part 1: User Mention Notifications
  // -------------------------------------------------------------------------
  describe('A. User Mention Notifications', () => {
    it('1. Mentioning one valid user creates the correct notification', async () => {
      const created = await notificationService.notifyMentions({
        text: 'Great point @bob! Let us review section 2.',
        actorUser: USER_ALICE,
        paperId: PAPER_1.id,
        sourceType: 'annotation',
        sourceId: 'ann-1',
        pageNumber: 2,
      });

      assert.equal(created.length, 1);
      assert.equal(created[0].recipient_id, USER_BOB.id);
      assert.equal(created[0].type, 'MENTION');
      assert.ok(created[0].message.includes('Alice Smith mentioned you'));
    });

    it('2. Mentioning multiple distinct users notifies each user', async () => {
      const created = await notificationService.notifyMentions({
        text: 'Check this proof @bob and @charlie.',
        actorUser: USER_ALICE,
        paperId: PAPER_1.id,
        sourceType: 'annotation',
        sourceId: 'ann-2',
      });

      assert.equal(created.length, 2);
      const recipientIds = created.map((n) => n.recipient_id);
      assert.ok(recipientIds.includes(USER_BOB.id));
      assert.ok(recipientIds.includes(USER_CHARLIE.id));
    });

    it('3. Mentioning the same user multiple times does not create duplicates', async () => {
      const created = await notificationService.notifyMentions({
        text: 'Hello @bob! Did you see this @bob? Ping @bob again.',
        actorUser: USER_ALICE,
        paperId: PAPER_1.id,
        sourceType: 'annotation',
        sourceId: 'ann-3',
      });

      assert.equal(created.length, 1);
      assert.equal(created[0].recipient_id, USER_BOB.id);
    });

    it('4. The actor does not receive a self-notification', async () => {
      const created = await notificationService.notifyMentions({
        text: 'Note to myself @alice and peer @bob.',
        actorUser: USER_ALICE,
        paperId: PAPER_1.id,
        sourceType: 'annotation',
        sourceId: 'ann-4',
      });

      assert.equal(created.length, 1);
      assert.equal(created[0].recipient_id, USER_BOB.id);
      const aliceNotif = created.find((n) => n.recipient_id === USER_ALICE.id);
      assert.equal(aliceNotif, undefined);
    });

    it('5. Nonexistent or invalid mentions do not create invalid notifications', async () => {
      const created = await notificationService.notifyMentions({
        text: 'Mentioning @nonexistent_user_123 and @fake_researcher.',
        actorUser: USER_ALICE,
        paperId: PAPER_1.id,
        sourceType: 'annotation',
        sourceId: 'ann-5',
      });

      assert.equal(created.length, 0);
    });

    it('6. Editing content with unchanged mentions does not repeatedly notify same recipients', async () => {
      const oldText = 'Hey @bob please look at this equation.';
      const newText = 'Hey @bob please look at this revised equation on page 4.';

      const created = await notificationService.notifyMentions({
        text: newText,
        oldText,
        actorUser: USER_ALICE,
        paperId: PAPER_1.id,
        sourceType: 'annotation',
        sourceId: 'ann-6',
      });

      assert.equal(created.length, 0, 'No notification for unchanged mention');
    });

    it('7. Editing content with newly added mentions notifies only newly added recipients', async () => {
      const oldText = 'Hey @bob look here.';
      const newText = 'Hey @bob and @charlie look here.';

      const created = await notificationService.notifyMentions({
        text: newText,
        oldText,
        actorUser: USER_ALICE,
        paperId: PAPER_1.id,
        sourceType: 'annotation',
        sourceId: 'ann-7',
      });

      assert.equal(created.length, 1);
      assert.equal(created[0].recipient_id, USER_CHARLIE.id);
    });
  });

  // -------------------------------------------------------------------------
  // Part 2: Paper Tags and Stars
  // -------------------------------------------------------------------------
  describe('B. Paper Tags and Stars Notifications', () => {
    it('8. Adding a tag notifies all eligible users who starred the paper', async () => {
      // Bob and Charlie star Paper 1
      await paperStarRepo.starPaper(USER_BOB.id, PAPER_1.id);
      await paperStarRepo.starPaper(USER_CHARLIE.id, PAPER_1.id);

      // Alice adds a tag
      const created = await notificationService.notifyStarrersPaperTagChange({
        paperId: PAPER_1.id,
        actorUser: USER_ALICE,
        action: 'ADDED',
        tagName: 'Quantum Physics',
      });

      assert.equal(created.length, 2);
      const recipients = created.map((n) => n.recipient_id);
      assert.ok(recipients.includes(USER_BOB.id));
      assert.ok(recipients.includes(USER_CHARLIE.id));
      assert.equal(created[0].type, 'PAPER_TAG_CHANGE');
      assert.ok(created[0].message.includes('Quantum Physics'));
    });

    it('9. Removing a tag notifies all eligible users who starred the paper', async () => {
      await paperStarRepo.starPaper(USER_BOB.id, PAPER_1.id);

      const created = await notificationService.notifyStarrersPaperTagChange({
        paperId: PAPER_1.id,
        actorUser: USER_ALICE,
        action: 'REMOVED',
        tagName: 'Quantum Physics',
      });

      assert.equal(created.length, 1);
      assert.equal(created[0].recipient_id, USER_BOB.id);
      assert.ok(created[0].message.includes('removed from paper'));
    });

    it('10. Bulk tag update notifies starrers with exact added and removed tag names', async () => {
      await paperStarRepo.starPaper(USER_BOB.id, PAPER_1.id);

      const created = await notificationService.notifyStarrersPaperTagChange({
        paperId: PAPER_1.id,
        actorUser: USER_ALICE,
        action: 'BULK_UPDATE',
        addedTags: ['Quantum Algorithms', 'VQE'],
        removedTags: ['Classical Physics'],
      });

      assert.equal(created.length, 1);
      assert.ok(created[0].message.includes('Added: [Quantum Algorithms, VQE]'));
      assert.ok(created[0].message.includes('Removed: [Classical Physics]'));
    });

    it('11. Submitting unchanged tags does not create notifications', async () => {
      await paperStarRepo.starPaper(USER_BOB.id, PAPER_1.id);

      const created = await notificationService.notifyStarrersPaperTagChange({
        paperId: PAPER_1.id,
        actorUser: USER_ALICE,
        action: 'BULK_UPDATE',
        addedTags: [],
        removedTags: [],
      });

      assert.equal(created.length, 0);
    });

    it('12. The actor does not receive a self-notification when modifying tags', async () => {
      // Alice stars paper 1 and Alice modifies the tags
      await paperStarRepo.starPaper(USER_ALICE.id, PAPER_1.id);
      await paperStarRepo.starPaper(USER_BOB.id, PAPER_1.id);

      const created = await notificationService.notifyStarrersPaperTagChange({
        paperId: PAPER_1.id,
        actorUser: USER_ALICE,
        action: 'ADDED',
        tagName: 'Quantum Physics',
      });

      assert.equal(created.length, 1);
      assert.equal(created[0].recipient_id, USER_BOB.id);
    });

    it('13. Non-starrers do not receive star-based notifications', async () => {
      // Only Bob stars the paper, Charlie does not
      await paperStarRepo.starPaper(USER_BOB.id, PAPER_1.id);

      const created = await notificationService.notifyStarrersPaperTagChange({
        paperId: PAPER_1.id,
        actorUser: USER_ALICE,
        action: 'ADDED',
        tagName: 'Nanotech',
      });

      const recipients = created.map((n) => n.recipient_id);
      assert.ok(!recipients.includes(USER_CHARLIE.id));
    });

    it('14. A user who has unstarred the paper does not receive future star notifications', async () => {
      // Bob stars then unstars
      await paperStarRepo.starPaper(USER_BOB.id, PAPER_1.id);
      await paperStarRepo.unstarPaper(USER_BOB.id, PAPER_1.id);

      const created = await notificationService.notifyStarrersPaperTagChange({
        paperId: PAPER_1.id,
        actorUser: USER_ALICE,
        action: 'ADDED',
        tagName: 'Robotics',
      });

      assert.equal(created.length, 0);
    });

    it('15. Meaningful metadata update notifies eligible starrers', async () => {
      await paperStarRepo.starPaper(USER_BOB.id, PAPER_1.id);

      const created = await notificationService.notifyStarrersMetadataChange({
        paperId: PAPER_1.id,
        actorUser: USER_ALICE,
        changedFields: ['title', 'abstract'],
        oldPaper: PAPER_1,
        newPaper: { ...PAPER_1, title: 'Updated Title' },
      });

      assert.equal(created.length, 1);
      assert.equal(created[0].type, 'PAPER_METADATA_UPDATE');
      assert.ok(created[0].message.includes('Modified fields: title, abstract'));
    });

    it('16. Unchanged metadata does not generate notifications', async () => {
      await paperStarRepo.starPaper(USER_BOB.id, PAPER_1.id);

      const created = await notificationService.notifyStarrersMetadataChange({
        paperId: PAPER_1.id,
        actorUser: USER_ALICE,
        changedFields: [],
        oldPaper: PAPER_1,
        newPaper: PAPER_1,
      });

      assert.equal(created.length, 0);
    });
  });

  // -------------------------------------------------------------------------
  // Part 3: Notification REST APIs & Authorization
  // -------------------------------------------------------------------------
  describe('C. Notification REST APIs & Security', () => {
    const app = createNotificationApp();

    it('17. Unauthenticated request returns 401 Unauthorized', async () => {
      const res = await request(app).get('/api/notifications');
      assert.equal(res.status, 401);
    });

    it('18. Users can retrieve their own notifications and unread count', async () => {
      // Create notification for Bob
      await notificationRepo.createNotification({
        recipientId: USER_BOB.id,
        actorId: USER_ALICE.id,
        type: 'MENTION',
        title: 'Alice mentioned you',
        message: 'Hello @bob!',
        paperId: PAPER_1.id,
      });

      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${tokenFor(USER_BOB.id)}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.notifications.length, 1);
      assert.equal(res.body.unread_count, 1);
      assert.equal(res.body.notifications[0].recipient_id, USER_BOB.id);
    });

    it('19. Users cannot see notifications belonging to other users', async () => {
      // Alice tries to fetch notifications
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${tokenFor(USER_ALICE.id)}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.notifications.length, 0);
      assert.equal(res.body.unread_count, 0);
    });

    it('20. Marking an individual notification as read updates status', async () => {
      const notif = await notificationRepo.createNotification({
        recipientId: USER_BOB.id,
        actorId: USER_ALICE.id,
        type: 'MENTION',
        title: 'Mention title',
        message: 'Content',
        paperId: PAPER_1.id,
      });

      const res = await request(app)
        .patch(`/api/notifications/${notif.id}/read`)
        .set('Authorization', `Bearer ${tokenFor(USER_BOB.id)}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.notification.is_read, true);
    });

    it('21. User cannot mark another user\'s notification as read (404/denied)', async () => {
      const notif = await notificationRepo.createNotification({
        recipientId: USER_BOB.id,
        actorId: USER_ALICE.id,
        type: 'MENTION',
        title: 'Mention title',
        message: 'Content',
      });

      // Charlie tries to mark Bob's notification as read
      const res = await request(app)
        .patch(`/api/notifications/${notif.id}/read`)
        .set('Authorization', `Bearer ${tokenFor(USER_CHARLIE.id)}`);

      assert.equal(res.status, 404);
    });

    it('22. Marking all notifications as read updates all unread notifications', async () => {
      await notificationRepo.createNotification({
        recipientId: USER_BOB.id,
        actorId: USER_ALICE.id,
        type: 'PAPER_TAG_CHANGE',
        title: 'Tag 1',
        message: 'Tag 1 added',
      });
      await notificationRepo.createNotification({
        recipientId: USER_BOB.id,
        actorId: USER_ALICE.id,
        type: 'PAPER_TAG_CHANGE',
        title: 'Tag 2',
        message: 'Tag 2 added',
      });

      const res = await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${tokenFor(USER_BOB.id)}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.updated_count >= 2);
    });

    it('23. Deleting a notification removes only the user\'s notification', async () => {
      const notif = await notificationRepo.createNotification({
        recipientId: USER_BOB.id,
        actorId: USER_ALICE.id,
        type: 'MENTION',
        title: 'Delete me',
        message: 'Delete content',
      });

      const res = await request(app)
        .delete(`/api/notifications/${notif.id}`)
        .set('Authorization', `Bearer ${tokenFor(USER_BOB.id)}`);

      assert.equal(res.status, 200);
    });
  });
});
