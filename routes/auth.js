const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const axios = require('axios');

router.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('register', { title: 'Register - SHARE SOURCE CODE' });
});

router.post('/register', async (req, res) => {
  const { username, email, password, password2, 'g-recaptcha-response': recaptchaResponse } = req.body;
  let errors = [];

  if (!username || !email || !password || !password2) {
    errors.push({ msg: 'Mohon isi semua field' });
  }
  if (password !== password2) {
    errors.push({ msg: 'Password tidak cocok' });
  }
  if (password.length < 6) {
    errors.push({ msg: 'Password minimal 6 karakter' });
  }

  if (!recaptchaResponse) {
    errors.push({ msg: 'Mohon verifikasi reCAPTCHA' });
  } else {
    try {
      const secretKey = process.env.RECAPTCHA_SECRET_KEY;
      const verificationURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaResponse}&remoteip=${req.connection.remoteAddress}`;
      const response = await axios.post(verificationURL);
      if (!response.data.success) {
        errors.push({ msg: 'Verifikasi reCAPTCHA gagal. Coba lagi.' });
      }
    } catch (error) {
      console.error("reCAPTCHA verification error:", error);
      errors.push({ msg: 'Terjadi kesalahan saat verifikasi reCAPTCHA.' });
    }
  }

  if (errors.length > 0) {
    return res.render('register', {
      errors,
      username,
      email,
      title: 'Register - SHARE SOURCE CODE'
    });
  }

  try {
    let user = await User.findOne({ $or: [{ email: email }, { username: username }] });
    if (user) {
      if (user.email === email) errors.push({ msg: 'Email sudah terdaftar' });
      if (user.username === username) errors.push({ msg: 'Username sudah terdaftar' });
      return res.render('register', {
        errors,
        username,
        email,
        title: 'Register - SHARE SOURCE CODE'
      });
    }

    const newUser = new User({ username, email, password });
    await newUser.save();
    req.flash('success_msg', 'Registrasi berhasil! Silakan login.');
    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Terjadi kesalahan server.');
    res.redirect('/auth/register');
  }
});

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('login', { title: 'Login - SHARE SOURCE CODE' });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    req.flash('error_msg', 'Mohon isi email dan password.');
    return res.redirect('/auth/login');
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      req.flash('error_msg', 'Email tidak terdaftar.');
      return res.redirect('/auth/login');
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      req.flash('error_msg', 'Password salah.');
      return res.redirect('/auth/login');
    }

    req.session.user = {
      id: user._id,
      username: user.username,
      email: user.email
    };
    req.flash('success_msg', 'Login berhasil!');
    res.redirect('/');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Terjadi kesalahan server.');
    res.redirect('/auth/login');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error(err);
      req.flash('error_msg', 'Gagal logout.');
      return res.redirect('/');
    }
    res.clearCookie('connect.sid');
    req.flash('success_msg', 'Anda telah logout.');
    res.redirect('/auth/login');
  });
});

module.exports = router;