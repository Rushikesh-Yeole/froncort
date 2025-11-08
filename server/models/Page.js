import mongoose from 'mongoose';

const PageSchema = new mongoose.Schema({
  title: { type: String, default: 'Untitled' },
  content: { type: Object, required: true },
  yjsState: { type: Buffer, default: null },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.Page || mongoose.model('Page', PageSchema);