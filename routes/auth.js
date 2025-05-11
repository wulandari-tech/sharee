const express = require('express');
const router = express.Router();
const User = require('../models/user');
const axios = require('axios');

const ensureAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  req.flash('error_msg', 'Silakan login untuk mengakses halaman ini.');
  res.redirect(`/auth/login?redirect=${encodeURIComponent(req.originalUrl)}`);
};

const ensureGuest = (req, res, next) => {
  if (req.session.user) {
    res.redirect('/');
  } else {
    return next();
  }
};

router.get('/register', ensureGuest, (req, res) => {
  res.render('register', { title: 'Register Akun', username: '', email: '' });
});

router.post('/register', ensureGuest, async (req, res, next) => {
  const { username, email, password, password2 } = req.body;
  const recaptchaResponse = req.body['g-recaptcha-response'];
  let validationErrors = [];

  if (!username || !email || !password || !password2) {
    validationErrors.push({ msg: 'Harap isi semua field yang wajib.' });
  }
  if (username && (username.length < 3 || username.length > 30)) {
    validationErrors.push({ msg: 'Username harus antara 3 dan 30 karakter.' });
  }
  if (email && !/.+\@.+\..+/.test(email)) {
      validationErrors.push({ msg: 'Format email tidak valid.' });
  }
  if (password !== password2) {
    validationErrors.push({ msg: 'Konfirmasi password tidak cocok.' });
  }
  if (password && password.length < 6) {
    validationErrors.push({ msg: 'Password minimal 6 karakter.' });
  }
  if (!recaptchaResponse) {
    validationErrors.push({ msg: 'Harap verifikasi reCAPTCHA.' });
  }

  if (validationErrors.length > 0) {
    req.flash('errors', validationErrors); // Gunakan flash untuk array errors
    return res.render('register', {
      title: 'Register Akun',
      username: username,
      email: email
    });
  }

  try {
    const recaptchaVerifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaResponse}&remoteip=${req.ip}`;
    const recaptchaResult = await axios.post(recaptchaVerifyUrl);

    if (!recaptchaResult.data.success || recaptchaResult.data.score < 0.5) { // Cek score jika v3
      req.flash('error_msg', 'Verifikasi reCAPTCHA gagal. Silakan coba lagi.');
      return res.redirect('/auth/register');
    }

    const existingUser = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }] });
    if (existingUser) {
      req.flash('error_msg', 'Email atau username sudah terdaftar.');
      return res.render('register', { title: 'Register Akun', username, email });
    }

    const newUser = new User({ username, email, password });
    await newUser.save();
    req.flash('success_msg', 'Registrasi berhasil! Silakan login.');
    res.redirect('/auth/login');

  } catch (error) {
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => ({ msg: val.message }));
        req.flash('errors', messages);
        return res.render('register', { title: 'Register Akun', username, email });
    }
    // console.error("Error registrasi:", error);
    // req.flash('error_msg', 'Terjadi kesalahan saat registrasi.');
    // res.render('register', { title: 'Register Akun', username, email });
    next(error);
  }
});

router.get('/login', ensureGuest, (req, res) => {
  res.render('login', { title: 'Login Akun' });
});

router.post('/login', ensureGuest, async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    req.flash('error_msg', 'Harap isi email dan password.');
    return res.redirect('/auth/login');
  }
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      req.flash('error_msg', 'Kombinasi email dan password salah.');
      return res.redirect('/auth/login');
    }
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      req.flash('error_msg', 'Kombinasi email dan password salah.');
      return res.redirect('/auth/login');
    }
    req.session.user = {
      _id: user._id,
      id: user._id.toString(),
      username: user.username,
      email: user.email
    };
    const redirectUrl = req.query.redirect || '/';
    req.flash('success_msg', 'Login berhasil!');
    res.redirect(redirectUrl);
  } catch (error) {
    // console.error("Error login:", error);
    // req.flash('error_msg', 'Terjadi kesalahan saat login.');
    // res.redirect('/auth/login');
    next(error);
  }
});

router.get('/logout', ensureAuthenticated, (req, res, next) => {
  req.session.destroy(err => {
    if (err) {
      // console.error("Error saat logout:", err);
      // req.flash('error_msg', 'Gagal logout.');
      // return res.redirect('/');
      return next(err);
    }
    res.clearCookie('connect.sid');
    req.flash('success_msg', 'Anda berhasil logout.');
    res.redirect('/auth/login');
  });
});

module.exports = {
  router: router,
  ensureAuthenticated: ensureAuthenticated,
  ensureGuest: ensureGuest
};