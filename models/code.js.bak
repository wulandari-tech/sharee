const mongoose = require('mongoose');

const CodeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  content: {
    type: String,
    required: function() { return !this.fileurl; }
  },
  language: {
    type: String,
    default: 'plaintext'
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fileurl: { // For ZIP files or other direct file uploads (Cloudinary URL)
    type: String
  },
  filename: { // Original name of the uploaded file
    type: String
  },
  likes: {
    type: Number,
    default: 0
  },
  likedBy: [{ // Store user IDs who liked this
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

CodeSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Code', CodeSchema);