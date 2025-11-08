import express from 'express';
import Project from '../models/Project.js';
import Page from '../models/Page.js';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import dotenv from "dotenv";
dotenv.config();
const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const projects = await Project.find({
      $or: [
        { ownerId: req.userId },
        { 'collaborators.userId': req.userId }
      ]
    }).populate('ownerId', 'name email').sort({ updatedAt: -1 });
    
    res.json(projects);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    
    const project = await Project.create({ 
      name, 
      ownerId: req.userId,
      collaborators: []
    });
    
    res.json(project);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Share project
router.post('/:id/share', async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Valid email and role required' });
    }

    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    // Only owner can share
    if (project.ownerId.toString() !== req.userId) {
      return res.status(403).json({ error: 'Only owner can share' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user._id.toString() === project.ownerId.toString()) {
      return res.status(400).json({ error: 'Cannot share with owner' });
    }

    const exists = project.collaborators.find(c => c.userId.toString() === user._id.toString());
    if (exists) {
      return res.status(400).json({ error: 'User already has access' });
    }

    project.collaborators.push({ userId: user._id, role });
    await project.save();
    
    res.json({ success: true, project });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to share project' });
  }
});

// Remove collaborator
router.delete('/:id/collaborators/:userId', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    if (project.ownerId.toString() !== req.userId) {
      return res.status(403).json({ error: 'Only owner can remove collaborators' });
    }

    project.collaborators = project.collaborators.filter(
      c => c.userId.toString() !== req.params.userId
    );
    await project.save();
    
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to remove collaborator' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    if (project.ownerId.toString() !== req.userId) {
      return res.status(403).json({ error: 'Only owner can delete' });
    }

    await Page.deleteMany({ projectId: req.params.id });
    await Project.findByIdAndDelete(req.params.id);
    
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('ownerId', 'name email')
      .populate('collaborators.userId', 'name email');
    
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    // Check access
    const isOwner = project.ownerId._id.toString() === req.userId;
    const isCollaborator = project.collaborators.some(c => c.userId._id.toString() === req.userId);
    
    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(project);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

export default router;