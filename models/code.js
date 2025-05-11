// models/Code.js
const mongoose = require('mongoose');

const codeSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, index: true },
  description: { type: String, trim: true },
  content: { type: String },
  language: { type: String, default: 'plaintext', index: true },
  tags: { type: [String], default: [], index: true }, // Pastikan ini array of strings
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fileurl: String,
  filename: String,
  publicId: String, // Untuk Cloudinary
  likes: { type: Number, default: 0 },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [{
    text: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Perbaikan untuk MongoServerError: language override unsupported
// Menggunakan 'none' atau bahasa spesifik yang didukung (mis. 'english')
// Atau hapus opsi bahasa jika tidak yakin/perlu.
codeSchema.index(
  { title: 'text', description: 'text', tags: 'text' }, // content dan language juga bisa di-index sebagai text jika perlu
  { default_language: 'none' } // Atau 'english', atau hilangkan opsi ini
);

codeSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  // Pastikan tags selalu array dan bersih
  if (this.tags && !Array.isArray(this.tags) && typeof this.tags === 'string') {
    this.tags = this.tags.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag);
  } else if (Array.isArray(this.tags)) {
    this.tags = this.tags.map(tag => tag.trim().toLowerCase()).filter(tag => tag);
  } else {
    this.tags = [];
  }
  next();
});

const Code = mongoose.model('Code', codeSchema);
module.exports = Code;