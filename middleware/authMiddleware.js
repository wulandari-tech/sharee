const Code = require('../models/code');

module.exports.isLoggedIn = (req, res, next) => {
  if (!req.session.user) {
    req.flash('error_msg', 'Anda harus login terlebih dahulu.');
    return res.redirect('/auth/login');
  }
  next();
};

module.exports.isAuthor = async (req, res, next) => {
  try {
    const code = await Code.findById(req.params.id);
    if (!code) {
      req.flash('error_msg', 'Kode tidak ditemukan.');
      return res.redirect('/');
    }
    if (code.author.toString() !== req.session.user.id) {
      req.flash('error_msg', 'Anda tidak memiliki izin untuk aksi ini.');
      return res.redirect(`/code/view/${req.params.id}`);
    }
    next();
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Terjadi kesalahan server.');
    res.redirect('/');
  }
};