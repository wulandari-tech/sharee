// server.js (bagian relevan)
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo'); // Sudah ada di package.json Anda
const flash = require('connect-flash');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Koneksi MongoDB (asumsi sudah ada dan benar)
mongoose.connect(process.env.MONGO_URI, { /* opsi koneksi */ })
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Connection Error:', err));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// app.use(express.static(path.join(__dirname, 'public'))); // Jika ada

// Express Session Middleware dengan connect-mongo
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret_key_sharee',
  resave: false,
  saveUninitialized: false, // atau true tergantung kebutuhan
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'app_sessions', // Opsional: nama koleksi
    ttl: 14 * 24 * 60 * 60, // 14 hari
    autoRemove: 'native' // Rekomendasi
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true jika HTTPS
    httpOnly: true,
    maxAge: 14 * 24 * 60 * 60 * 1000, // Sama dengan TTL store
    // sameSite: 'lax' // Pertimbangkan untuk keamanan
  }
}));

app.use(flash());

app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.errors = req.flash('errors'); // Untuk array errors jika ada
  res.locals.currentUser = req.user || null; // Asumsi Anda menggunakan Passport.js
  // Menyediakan process.env ke EJS dengan aman
  res.locals.process = { env: { RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY } };
  // Menyediakan data form sebelumnya jika ada error validasi (contoh sederhana)
  res.locals.formData = req.flash('formData')[0] || {};
  next();
});


const indexRouter = require('./routes/index');
const authRouter = require('./routes/auth');
const codeRouter = require('./routes/code'); // Rute yang relevan

 app.use('/', indexRouter);
app.use('/auth', authRouter);
app.use('/code', codeRouter);

// 404 Handler
app.use((req, res, next) => {
  res.status(404).render('404', { title: '404 - Halaman Tidak Ditemukan' });
});

// Global Error Handler (sederhana)
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack || err);
  // Tangani error Multer secara spesifik
  if (err.code === 'LIMIT_FILE_TYPE_CUSTOM' || (err.message && err.message.includes('Jenis file tidak didukung'))) {
      req.flash('error_msg', err.message || 'Jenis file tidak didukung.');
      return res.redirect(req.headers.referer || '/code/upload');
  }
  req.flash('error_msg', 'Terjadi kesalahan pada server. Coba lagi nanti.');
  res.redirect(req.headers.referer || '/');
});


const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
