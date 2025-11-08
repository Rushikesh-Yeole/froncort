import mongoose from 'mongoose';

const PageVersionSchema = new mongoose.Schema({
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Page', required: true },
  contentJSON: { type: Object, required: true },
  author: { type: String, default: 'unknown' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.PageVersion || mongoose.model('PageVersion', PageVersionSchema);