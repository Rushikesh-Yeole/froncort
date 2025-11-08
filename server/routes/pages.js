import express from 'express';
import Page from '../models/Page.js';
import PageVersion from '../models/PageVersion.js';
import Project from '../models/Project.js';
import { authenticate } from '../middleware/auth.js';
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    const project = await Project.findOne({
      _id: projectId,
      $or: [{ ownerId: req.userId }, { 'collaborators.userId': req.userId }]
    });
    if (!project) return res.status(403).json({ error: 'Access denied' });
    const pages = await Page.find({ projectId }, '_id title updatedAt').sort({ updatedAt: -1 });
    res.json(pages);
  } catch (e) {
    res.status(500).json({ error: 'Failed to list pages' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { id, title, content, projectId, author } = req.body;
    if (!title || !projectId) return res.status(400).json({ error: 'Missing fields' });

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const isOwner = project.ownerId.toString() === req.userId;
    const isEditor = project.collaborators.some(
      c => c.userId.toString() === req.userId && c.role === 'editor'
    );

    if (!isOwner && !isEditor) {
      return res.status(403).json({ error: 'You do not have permission to edit this page.' });
    }

    let page;
    if (id) {
      // Update existing page
      page = await Page.findById(id);
      if (!page) return res.status(404).json({ error: 'Page not found' });

      page.title = title;
      if (content) page.content = content;
      page.updatedAt = new Date();
      await page.save();

      if (content) {
        await PageVersion.create({
          pageId: id,
          contentJSON: content,
          author: author || 'unknown'
        });
      }
    } else {
      page = await Page.create({
        title,
        content: content || { type: 'doc', content: [] },
        projectId
      });

      await PageVersion.create({
        pageId: page._id,
        contentJSON: content || { type: 'doc', content: [] },
        author: author || 'unknown'
      });
    }

    await Project.findByIdAndUpdate(projectId, { updatedAt: new Date() });
    res.json(page);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save page' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const page = await Page.findById(req.params.id);
    const project = await Project.findOne({
      _id: page.projectId,
      $or: [{ ownerId: req.userId }, { 'collaborators.userId': req.userId }]
    });
    if (!project) return res.status(403).json({ error: 'Access denied' });
    res.json(page);
  } catch (e) {
    res.status(404).json({ error: 'Invalid ID' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await PageVersion.deleteMany({ pageId: req.params.id });
    await Page.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

router.get('/:id/versions', async (req, res) => {
  try {
    const versions = await PageVersion.find({ pageId: req.params.id }, '_id author createdAt').sort({ createdAt: -1 });
    res.json(versions);
  } catch (e) {
    res.status(500).json({ error: 'Failed to list versions' });
  }
});

// Get version
router.get('/:id/versions/:vid', async (req, res) => {
  try {
    const v = await PageVersion.findById(req.params.vid);
    if (!v) return res.status(404).json({ error: 'Version not found' });
    res.json(v);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get version' });
  }
});

// Restore version
router.post('/:id/versions/:vid/restore', async (req, res) => {
  try {
    const v = await PageVersion.findById(req.params.vid);
    if (!v) return res.status(4404).json({ error: 'Version not found' });

    const page = await Page.findByIdAndUpdate(req.params.id, { content: v.contentJSON, updatedAt: new Date() }, { new: true });
    await PageVersion.create({ pageId: req.params.id, contentJSON: v.contentJSON, author: req.body.author || 'restorer' });

    res.json({ ok: true, page });
  } catch (e) {
    res.status(500).json({ error: 'Failed to restore' });
  }
});

// persisted Yjs state
router.get('/:id/yjs', async (req, res) => {
  try {
    const page = await Page.findById(req.params.id);
    if (!page) return res.status(404).json({ error: 'Not found' });

    const project = await Project.findOne({
      _id: page.projectId,
      $or: [{ ownerId: req.userId }, { 'collaborators.userId': req.userId }]
    });
    if (!project) return res.status(403).json({ error: 'Access denied' });

    if (!page.yjsState) return res.json({ yjsBase64: null });

    const b64 = page.yjsState.toString('base64');
    res.json({ yjsBase64: b64 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read yjs state' });
  }
});

//persist Yjs state (and update snapshot)
router.post('/:id/yjs', async (req, res) => {
  try {
    const { yjsBase64, contentJSON, author } = req.body;
    if (!yjsBase64) return res.status(400).json({ error: 'Missing yjsBase64' });

    const page = await Page.findById(req.params.id);
    if (!page) return res.status(404).json({ error: 'Not found' });

    const project = await Project.findById(page.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const isOwner = project.ownerId.toString() === req.userId;
    const isEditor = project.collaborators.some(
      c => c.userId.toString() === req.userId && c.role === 'editor'
    );
    if (!isOwner && !isEditor) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const buf = Buffer.from(yjsBase64, 'base64');

    page.yjsState = buf;
    if (contentJSON) {
      page.content = contentJSON;
    }
    page.updatedAt = new Date();
    await page.save();

    res.json({ ok: true });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to persist yjs state' });
  }
});

export default router;