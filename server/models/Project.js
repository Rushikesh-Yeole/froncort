import mongoose from 'mongoose';

const ProjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  collaborators: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['editor', 'viewer'], default: 'viewer' }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.Project || mongoose.model('Project', ProjectSchema);