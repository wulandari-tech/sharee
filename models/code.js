const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  text: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

const codeSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  programmingLanguage: { type: String, default: 'plaintext', index: true }, // Diubah dari 'language'
  content: { type: String },
  tags: { type: [String], default: [], index: true }, // Pastikan ini array
  fileurl: { type: String },
  filename: { type: String },
  mimetype: { type: String },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  likes: { type: Number, default: 0 },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [commentSchema], // Embed komentar atau referensi ke model Comment terpisah
  viewCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

codeSchema.index({ title: 'text', description: 'text', tags: 'text' }); // Text index untuk pencarian

codeSchema.pre('save', function(next) {
  if (this.isModified()) { // Hanya update jika ada perubahan
    this.updatedAt = Date.now();
  }
  // Bersihkan dan standarisasi tags
  if (this.isModified('tags') && this.tags) {
    this.tags = this.tags
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0)
      .filter((value, index, self) => self.indexOf(value) === index); // Unik
  }
  next();
});

module.exports = mongoose.model('Code', codeSchema);