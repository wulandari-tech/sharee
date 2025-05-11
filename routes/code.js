const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const axios = require('axios');
const Code = require('../models/code');
const Comment = require('../models/comment');
const { isLoggedIn, isAuthor } = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === 'application/zip' ||
      file.mimetype.startsWith('text/') ||
      file.mimetype === 'application/octet-stream' ||
      file.mimetype.startsWith('image/')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Jenis file tidak didukung. Hanya ZIP, text, atau gambar.'), false);
    }
  }
});

const ITEMS_PER_PAGE_MY_SNIPPETS = 8;

router.get('/upload', isLoggedIn, (req, res) => {
  res.render('upload', { title: 'Upload Kode/File - SHARE SOURCE CODE', code: null });
});

router.post('/upload', isLoggedIn, upload.single('file'), async (req, res) => {
  const { title, description, language, content, tags, 'g-recaptcha-response': recaptchaResponse } = req.body;

  const formData = { ...req.body };
  formData.tags = tags ? tags.split(',').map(tag => tag.trim().toLowerCase()) : [];

  if (!recaptchaResponse) {
    req.flash('error_msg', 'Mohon verifikasi reCAPTCHA');
    return res.render('upload', { title: 'Upload Kode/File - SHARE SOURCE CODE', code: formData });
  }

  try {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    const verificationURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaResponse}&remoteip=${req.connection.remoteAddress}`;
    const recaptchaVerifyResponse = await axios.post(verificationURL);
    if (!recaptchaVerifyResponse.data.success) {
      req.flash('error_msg', 'Verifikasi reCAPTCHA gagal. Coba lagi.');
      return res.render('upload', { title: 'Upload Kode/File - SHARE SOURCE CODE', code: formData });
    }
  } catch (error) {
    console.error("reCAPTCHA verification error:", error);
    req.flash('error_msg', 'Terjadi kesalahan saat verifikasi reCAPTCHA.');
    return res.render('upload', { title: 'Upload Kode/File - SHARE SOURCE CODE', code: formData });
  }

  if (!title || (!content && !req.file)) {
    req.flash('error_msg', 'Judul dan Konten Kode atau File harus diisi.');
    return res.render('upload', { title: 'Upload Kode/File - SHARE SOURCE CODE', code: formData });
  }

  const codeData = {
    title,
    description,
    language: content ? language : (req.file ? 'file' : 'plaintext'),
    content: content || '',
    author: req.session.user.id,
    tags: formData.tags
  };

  if (req.file) {
    try {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: "auto", folder: "code_share_uploads" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(req.file.buffer);
      });
      codeData.fileurl = result.secure_url;
      codeData.filename = req.file.originalname;
      if (!content) codeData.content = `File: ${req.file.originalname}`;
    } catch (err) {
      console.error('Cloudinary upload error:', err);
      req.flash('error_msg', 'Gagal mengunggah file ke Cloudinary.');
      return res.render('upload', { title: 'Upload Kode/File - SHARE SOURCE CODE', code: formData });
    }
  }

  try {
    const newCode = new Code(codeData);
    await newCode.save();
    req.flash('success_msg', 'Kode/File berhasil diunggah!');
    res.redirect(`/code/view/${newCode._id}`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Gagal menyimpan kode/file.');
    res.render('upload', { title: 'Upload Kode/File - SHARE SOURCE CODE', code: formData });
  }
});

router.get('/view/:id', async (req, res) => {
  try {
    const code = await Code.findById(req.params.id).populate('author', 'username');
    if (!code) {
      req.flash('error_msg', 'Kode tidak ditemukan.');
      return res.redirect('/');
    }
    const comments = await Comment.find({ codeSnippet: code._id }).populate('author', 'username').sort({ createdAt: -1 });
    const userHasLiked = req.session.user ? code.likedBy.includes(req.session.user.id) : false;

    res.render('view', {
      code,
      comments,
      userHasLiked,
      title: `${code.title} - SHARE SOURCE CODE`
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Gagal memuat kode.');
    res.redirect('/');
  }
});

router.get('/edit/:id', isLoggedIn, isAuthor, async (req, res) => {
  try {
    const code = await Code.findById(req.params.id);
    if (!code) {
      req.flash('error_msg', 'Kode tidak ditemukan.');
      return res.redirect('/');
    }
    res.render('edit', { code, title: `Edit: ${code.title} - SHARE SOURCE CODE` });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Gagal memuat kode untuk diedit.');
    res.redirect('/');
  }
});

router.post('/edit/:id', isLoggedIn, isAuthor, upload.single('file'), async (req, res) => {
  const { title, description, language, content, tags, remove_file } = req.body;
  if (!title) {
    req.flash('error_msg', 'Judul harus diisi.');
    return res.redirect(`/code/edit/${req.params.id}`);
  }

  try {
    const code = await Code.findById(req.params.id);
    if (!code) {
      req.flash('error_msg', 'Kode tidak ditemukan.');
      return res.redirect('/');
    }

    code.title = title;
    code.description = description;
    code.language = language;
    code.content = content;
    code.tags = tags ? tags.split(',').map(tag => tag.trim().toLowerCase()) : [];

    if (req.file) {
        // If there was an old file, attempt to delete it from Cloudinary
        if (code.fileurl) {
            try {
                const publicId = code.fileurl.substring(code.fileurl.lastIndexOf('/') + 1, code.fileurl.lastIndexOf('.'));
                await cloudinary.uploader.destroy(`code_share_uploads/${publicId}`);
            } catch (cdnErr) {
                console.error("Error deleting old file from Cloudinary:", cdnErr);
            }
        }
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: "auto", folder: "code_share_uploads" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(req.file.buffer);
      });
      code.fileurl = result.secure_url;
      code.filename = req.file.originalname;
    } else if (remove_file === 'true' && code.fileurl) {
        try {
            const publicId = code.fileurl.substring(code.fileurl.lastIndexOf('/') + 1, code.fileurl.lastIndexOf('.'));
            await cloudinary.uploader.destroy(`code_share_uploads/${publicId}`);
            code.fileurl = null;
            code.filename = null;
        } catch (cdnErr) {
            console.error("Error deleting file from Cloudinary:", cdnErr);
            req.flash('error_msg', 'Gagal menghapus file lama dari Cloudinary.');
        }
    }


    await code.save();
    req.flash('success_msg', 'Kode berhasil diperbarui!');
    res.redirect(`/code/view/${code._id}`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Gagal memperbarui kode.');
    res.redirect(`/code/edit/${req.params.id}`);
  }
});

router.post('/delete/:id', isLoggedIn, isAuthor, async (req, res) => {
  try {
    const code = await Code.findById(req.params.id);
    if (!code) {
      req.flash('error_msg', 'Kode tidak ditemukan.');
      return res.redirect('/');
    }

    if (code.fileurl) {
      try {
        const publicId = code.fileurl.substring(code.fileurl.lastIndexOf('/') + 1, code.fileurl.lastIndexOf('.'));
        await cloudinary.uploader.destroy(`code_share_uploads/${publicId}`, { resource_type: code.fileurl.includes('/image/') ? 'image' : 'raw' });
      } catch (cdnErr) {
        console.error("Error deleting file from Cloudinary:", cdnErr);
      }
    }
    await Comment.deleteMany({ codeSnippet: code._id });
    await Code.findByIdAndDelete(req.params.id);

    req.flash('success_msg', 'Kode berhasil dihapus.');
    res.redirect('/code/my-snippets');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Gagal menghapus kode.');
    res.redirect('/');
  }
});

router.get('/my-snippets', isLoggedIn, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const query = { author: req.session.user.id };

    const totalCodes = await Code.countDocuments(query);
    const codes = await Code.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * ITEMS_PER_PAGE_MY_SNIPPETS)
      .limit(ITEMS_PER_PAGE_MY_SNIPPETS);

    res.render('my_snippets', {
      codes,
      currentPage: page,
      hasNextPage: ITEMS_PER_PAGE_MY_SNIPPETS * page < totalCodes,
      hasPreviousPage: page > 1,
      nextPage: page + 1,
      previousPage: page - 1,
      lastPage: Math.ceil(totalCodes / ITEMS_PER_PAGE_MY_SNIPPETS),
      title: 'Snippet Saya - SHARE SOURCE CODE'
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Gagal memuat snippet Anda.');
    res.redirect('/');
  }
});

router.post('/:id/like', isLoggedIn, async (req, res) => {
  try {
    const code = await Code.findById(req.params.id);
    if (!code) {
      return res.status(404).json({ message: 'Kode tidak ditemukan' });
    }

    const userId = req.session.user.id;
    const index = code.likedBy.indexOf(userId);

    if (index === -1) {
      code.likedBy.push(userId);
      code.likes = code.likedBy.length;
    } else {
      code.likedBy.splice(index, 1);
      code.likes = code.likedBy.length;
    }
    await code.save();
    res.json({ likes: code.likes, liked: index === -1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal memproses like' });
  }
});

router.post('/:id/comment', isLoggedIn, async (req, res) => {
  const { text } = req.body;
  if (!text || text.trim() === '') {
    req.flash('error_msg', 'Komentar tidak boleh kosong.');
    return res.redirect(`/code/view/${req.params.id}`);
  }
  try {
    const code = await Code.findById(req.params.id);
    if (!code) {
      req.flash('error_msg', 'Kode tidak ditemukan.');
      return res.redirect('/');
    }
    const newComment = new Comment({
      text,
      codeSnippet: req.params.id,
      author: req.session.user.id
    });
    await newComment.save();
    req.flash('success_msg', 'Komentar berhasil ditambahkan.');
    res.redirect(`/code/view/${req.params.id}#comments-section`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Gagal menambahkan komentar.');
    res.redirect(`/code/view/${req.params.id}`);
  }
});

router.get('/:id/download', async (req, res) => {
    try {
        const code = await Code.findById(req.params.id);
        if (!code || !code.content) {
            req.flash('error_msg', 'Konten kode tidak ditemukan untuk diunduh.');
            return res.redirect('back');
        }

        let filename = `${code.title.replace(/\s+/g, '_') || 'code'}`;
        let contentType = 'text/plain';

        if (code.language === 'htmlmixed' || code.language === 'html') filename += '.html';
        else if (code.language === 'css') filename += '.css';
        else if (code.language === 'javascript') filename += '.js';
        else if (code.language === 'python') filename += '.py';
        else if (code.language === 'text/x-java') filename += '.java';
        else if (code.language === 'text/x-csrc') filename += '.c';
        else if (code.language === 'text/x-c++src') filename += '.cpp';
        else filename += '.txt';

        if (code.language.includes('html')) contentType = 'text/html';
        else if (code.language === 'css') contentType = 'text/css';
        else if (code.language === 'javascript') contentType = 'application/javascript';


        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.setHeader('Content-Type', contentType);
        res.send(code.content);

    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Gagal mengunduh kode.');
        res.redirect('back');
    }
});


module.exports = router;