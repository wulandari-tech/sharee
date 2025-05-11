// routes/code.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Code = require('../models/code'); 
// const { ensureAuthenticated } = require('../config/auth'); // Asumsi Anda punya ini
const cloudinary = require('cloudinary').v2;
const axios = require('axios'); // Untuk reCAPTCHA

// Middleware dummy jika ensureAuthenticated tidak ada, ganti dengan yang asli
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated ? req.isAuthenticated() : (req.user != null) ) { // Ganti dengan implementasi auth Anda
    return next();
  }
  req.flash('error_msg', 'Silakan login untuk mengakses halaman ini.');
  res.redirect('/auth/login'); // Ganti dengan rute login Anda
};


cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/zip', 'application/x-zip-compressed', 'application/octet-stream', // Untuk ZIP
    'text/plain', 'text/html', 'text/css', 'text/javascript', 'application/json', 'application/xml', 'text/markdown',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'
  ];
  // Ekstensi yang lebih permisif karena mimetype bisa bervariasi
  const allowedExtensions = /\.(zip|txt|md|html|css|js|json|xml|jpg|jpeg|png|gif|webp|svg|log|java|py|c|cpp|cs|rb|php|go|rs|swift|kt|ts|jsx|vue|conf|ini|yaml|yml|sh|bat|ps1)$/i;

  const isMimeAllowed = allowedMimeTypes.includes(file.mimetype);
  const isExtAllowed = allowedExtensions.test(path.extname(file.originalname).toLowerCase());

  if (isMimeAllowed || isExtAllowed) { // Cukup salah satu terpenuhi untuk lebih fleksibel
    cb(null, true);
  } else {
    console.warn(`File rejected: originalname='${file.originalname}', mimetype='${file.mimetype}', ext='${path.extname(file.originalname)}'`);
    const err = new Error('Jenis file tidak didukung. Hanya ZIP, arsip umum, file teks, atau gambar.');
    err.code = 'LIMIT_FILE_TYPE_CUSTOM';
    cb(err, false);
  }
};

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: fileFilter,
});

async function verifyRecaptcha(token) {
  if (!token || !process.env.RECAPTCHA_SECRET_KEY) return false;
  try {
    const response = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`
    );
    return response.data.success;
  } catch (error) {
    console.error('reCAPTCHA verification error:', error);
    return false;
  }
}

// Helper untuk membersihkan dan memformat tags
function parseTags(tagsString) {
  if (tagsString && typeof tagsString === 'string' && tagsString.trim() !== '') {
    return tagsString.split(',')
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag && tag.length > 0 && tag.length <= 25) // Filter tag kosong & batasi panjang
      .slice(0, 10); // Batasi jumlah tag (misal 10)
  }
  return [];
}

router.get('/upload', ensureAuthenticated, (req, res) => {
  res.render('upload', {
    title: 'Unggah Kode/File Baru',
    code: null, // Untuk form baru, code adalah null
    // formData di-pass dari global middleware jika ada flash
  });
});

router.post('/upload', ensureAuthenticated, upload.single('file'), async (req, res) => {
  const recaptchaToken = req.body['g-recaptcha-response'];
  const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);

  if (!isRecaptchaValid) {
    req.flash('error_msg', 'Verifikasi reCAPTCHA gagal. Silakan coba lagi.');
    req.flash('formData', req.body); // Simpan input form
    return res.redirect('/code/upload');
  }

  const { title, description, language, content, tags: tagsString } = req.body;

  if (!title || title.trim() === "") {
    req.flash('error_msg', 'Judul tidak boleh kosong.');
    req.flash('formData', req.body);
    return res.redirect('/code/upload');
  }
  if (!content && !req.file) {
    req.flash('error_msg', 'Anda harus mengisi konten kode atau mengunggah file.');
    req.flash('formData', req.body);
    return res.redirect('/code/upload');
  }
  if (content && req.file) {
    req.flash('error_msg', 'Harap isi konten kode ATAU unggah file, jangan keduanya.');
    req.flash('formData', req.body);
    return res.redirect('/code/upload');
  }

  const tagsArray = parseTags(tagsString);

  try {
    const newCodeData = {
      title,
      description,
      language: req.file ? 'file' : (language || 'plaintext'), // Jika file diupload, language jadi 'file'
      content: req.file ? null : content, // Jika file diupload, content jadi null
      tags: tagsArray,
      author: req.user.id, // Asumsi req.user.id tersedia
    };

    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: "auto", folder: "sharee_files" },
          (error, uploadResult) => {
            if (error) return reject(error);
            resolve(uploadResult);
          }
        );
        stream.end(req.file.buffer);
      });
      newCodeData.fileurl = result.secure_url;
      newCodeData.filename = req.file.originalname;
      newCodeData.publicId = result.public_id;
    }
    
    const newCode = new Code(newCodeData);
    await newCode.save();
    req.flash('success_msg', `Snippet "${newCode.title}" berhasil diunggah!`);
    res.redirect(`/code/view/${newCode._id}`);

  } catch (err) {
    console.error("Error saat upload:", err);
    req.flash('error_msg', 'Terjadi kesalahan saat menyimpan data.');
    req.flash('formData', req.body);
    res.redirect('/code/upload');
  }
});

router.get('/edit/:id', ensureAuthenticated, async (req, res) => {
  try {
    const codeToEdit = await Code.findById(req.params.id).lean(); // .lean() untuk plain JS object
    if (!codeToEdit) {
      req.flash('error_msg', 'Snippet tidak ditemukan.');
      return res.redirect('/404'); // Atau halaman daftar snippet pengguna
    }
    // Pastikan req.user.id adalah string jika codeToEdit.author juga string (hasil dari .lean())
    if (codeToEdit.author.toString() !== req.user.id.toString()) {
      req.flash('error_msg', 'Anda tidak berhak mengedit snippet ini.');
      return res.redirect('/');
    }
    
    // `codeToEdit.tags` sudah pasti array dari model atau pre-save hook.
    // `upload.ejs` akan menggunakan `code.tags.join(', ')`
    res.render('upload', {
      title: 'Edit Kode/File',
      code: codeToEdit, // Kirim data yang sudah pasti plain object dan tags-nya array
    });
  } catch (err) {
    console.error("Error saat mengambil data untuk edit (ID: " + req.params.id + "):", err);
    req.flash('error_msg', 'Gagal memuat data untuk diedit.');
    res.redirect('/');
  }
});

router.post('/edit/:id', ensureAuthenticated, upload.single('file'), async (req, res) => {
  const { title, description, language, content, tags: tagsString, remove_file } = req.body;
  const codeId = req.params.id;

  if (!title || title.trim() === "") {
    req.flash('error_msg', 'Judul tidak boleh kosong.');
    req.flash('formData', { ...req.body, _id: codeId }); // Kirim ID untuk re-render form edit
    return res.redirect(`/code/edit/${codeId}`);
  }
  
  const isNewFileUploaded = !!req.file;
  const isContentProvided = content && content.trim() !== '';

  if (isContentProvided && isNewFileUploaded) {
    req.flash('error_msg', 'Harap isi konten kode ATAU unggah file baru, jangan keduanya saat mengedit.');
    req.flash('formData', { ...req.body, _id: codeId });
    return res.redirect(`/code/edit/${codeId}`);
  }

  const tagsArray = parseTags(tagsString);

  try {
    const codeToUpdate = await Code.findById(codeId);
    if (!codeToUpdate) {
      req.flash('error_msg', 'Snippet tidak ditemukan.');
      return res.redirect('/404');
    }
    if (codeToUpdate.author.toString() !== req.user.id.toString()) {
      req.flash('error_msg', 'Anda tidak berhak mengedit snippet ini.');
      return res.redirect('/');
    }

    codeToUpdate.title = title;
    codeToUpdate.description = description;
    codeToUpdate.tags = tagsArray;

    if (remove_file === 'true' && codeToUpdate.publicId) {
      await cloudinary.uploader.destroy(codeToUpdate.publicId);
      codeToUpdate.fileurl = null;
      codeToUpdate.filename = null;
      codeToUpdate.publicId = null;
      // Jika file dihapus, dan tidak ada konten baru, maka jadi 'file' tanpa file
      // atau update language berdasarkan content
      if (!isContentProvided) {
        codeToUpdate.language = 'file'; // Menandakan ini adalah entri file, tapi filenya kosong
        codeToUpdate.content = null;
      } else {
        codeToUpdate.language = language || 'plaintext';
        codeToUpdate.content = content;
      }
    }

    if (isNewFileUploaded) {
      if (codeToUpdate.publicId) { 
        await cloudinary.uploader.destroy(codeToUpdate.publicId);
      }
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: "auto", folder: "sharee_files" },
          (error, uploadResult) => {
            if (error) return reject(error);
            resolve(uploadResult);
          }
        );
        stream.end(req.file.buffer);
      });
      
      codeToUpdate.fileurl = result.secure_url;
      codeToUpdate.filename = req.file.originalname;
      codeToUpdate.publicId = result.public_id;
      codeToUpdate.language = 'file'; // Update language menjadi 'file'
      codeToUpdate.content = null;   // Konten teks di-null-kan
    } else if (remove_file !== 'true' && isContentProvided) {
      // Jika file lama tidak dihapus, tidak ada file baru, TAPI ada konten teks
      // Ini berarti pengguna ingin mengganti file lama (jika ada) dengan konten teks.
      if (codeToUpdate.language === 'file' && codeToUpdate.publicId) {
          await cloudinary.uploader.destroy(codeToUpdate.publicId);
          codeToUpdate.fileurl = null;
          codeToUpdate.filename = null;
          codeToUpdate.publicId = null;
      }
      codeToUpdate.content = content;
      codeToUpdate.language = language || 'plaintext';
    } else if (remove_file !== 'true' && !isNewFileUploaded && !isContentProvided && codeToUpdate.language !== 'file') {
        // Tidak ada file baru, file lama tidak dihapus, tidak ada konten teks BARU, dan BUKAN tipe 'file' sebelumnya
        // Artinya konten teks yang ada sebelumnya dikosongkan.
        codeToUpdate.content = null; 
        // Biarkan language seperti sebelumnya, atau reset jika diperlukan
        // codeToUpdate.language = language || 'plaintext'; // Tergantung logika bisnis
    }
    // Kasus: tidak ada file baru, file lama (jika ada) tidak dihapus, tidak ada konten teks, dan tipe 'file' -> tidak ada perubahan pada file/content.

    await codeToUpdate.save();
    req.flash('success_msg', 'Snippet berhasil diperbarui!');
    res.redirect(`/code/view/${codeToUpdate._id}`);

  } catch (err) {
    console.error(`Error saat edit snippet ID ${codeId}:`, err);
    req.flash('error_msg', 'Gagal memperbarui snippet.');
    req.flash('formData', { ...req.body, _id: codeId });
    res.redirect(`/code/edit/${codeId}`);
  }
});

// Rute untuk melihat detail snippet
router.get('/view/:id', async (req, res) => {
    try {
        const code = await Code.findById(req.params.id).populate('author', 'username').populate('comments.author', 'username').lean();
        if (!code) {
            req.flash('error_msg', 'Snippet tidak ditemukan.');
            return res.status(404).render('404', { title: '404 - Snippet Tidak Ditemukan' });
        }
        // Pastikan `code.tags` adalah array untuk EJS
        if (code.tags && !Array.isArray(code.tags)) {
            code.tags = typeof code.tags === 'string' ? code.tags.split(',').map(t=>t.trim()) : [];
        } else if (!code.tags) {
            code.tags = [];
        }
        
        let userHasLiked = false;
        if (req.user && code.likedBy) {
            userHasLiked = code.likedBy.some(userId => userId.equals(req.user._id));
        }

        res.render('view', {
            title: code.title,
            code,
            comments: code.comments || [],
            currentUser: req.user,
            userHasLiked
        });
    } catch (error) {
        console.error('Error fetching code for view:', error);
        req.flash('error_msg', 'Gagal memuat snippet.');
        res.redirect('/');
    }
});


// Rute lainnya (delete, my-snippets, like, comment, dll.) perlu Anda implementasikan atau periksa.
// Contoh dasar untuk rute GET utama (indeks) jika Anda belum punya:
router.get('/', async (req, res) => {
    // Logika untuk mengambil dan menampilkan semua snippet (dengan paginasi, filter, dll.)
    // Ini hanyalah placeholder
    try {
        const codes = await Code.find().populate('author', 'username').sort({ createdAt: -1 }).limit(10).lean();
        const languages = await Code.distinct('language'); // Ambil daftar bahasa unik
        res.render('index', {
            title: 'Beranda - SHARECODE',
            codes,
            languages: languages.filter(lang => lang !== 'file'), // Jangan tampilkan 'file' di filter bahasa
            query: req.query, // Untuk mempertahankan filter
            currentPage: 1, // Implementasi paginasi diperlukan
            lastPage: 1,
            hasPreviousPage: false,
            hasNextPage: false,
            previousPage: null,
            nextPage: null,
            currentUser: req.user
        });
    } catch (error) {
        console.error('Error fetching codes for index:', error);
        req.flash('error_msg', 'Gagal memuat daftar kode.');
        res.render('index', {
            title: 'Beranda - SHARECODE',
            codes: [],
            languages: [],
            query: {},
            currentPage: 1,
            lastPage: 1,
            hasPreviousPage: false,
            hasNextPage: false,
            previousPage: null,
            nextPage: null,
            currentUser: req.user
        });
    }
});


module.exports = router;