const express = require('express');
const router = express.Router();
const Code = require('../models/code'); // Pastikan path benar

router.get('/', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 9; // Jumlah item per halaman
  const searchQuery = req.query.search || '';
  const languageQuery = req.query.language || '';
  const tagQuery = req.query.tag || '';

  let queryOptions = {};
  const sortOptions = { createdAt: -1 }; // Default sort

  if (searchQuery) {
    queryOptions.$text = { $search: searchQuery };
    // Jika menggunakan MongoDB Atlas, Anda bisa menambahkan score untuk sorting relevansi
    // sortOptions.score = { $meta: "textScore" };
  }
  if (languageQuery) {
    queryOptions.programmingLanguage = languageQuery; // Filter berdasarkan programmingLanguage
  }
  if (tagQuery) {
    queryOptions.tags = tagQuery.toLowerCase();
  }

  try {
    const codes = await Code.find(queryOptions)
      .populate('author', 'username') // Ambil username author
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const totalCodes = await Code.countDocuments(queryOptions);
    // Ambil daftar bahasa unik untuk filter, kecuali 'file'
    const distinctLanguages = await Code.distinct('programmingLanguage');
    const languagesForFilter = distinctLanguages.filter(lang => lang && lang !== 'file').sort();


    res.render('index', {
      title: 'Beranda - SHARECODE',
      codes,
      currentPage: page,
      hasNextPage: limit * page < totalCodes,
      hasPreviousPage: page > 1,
      nextPage: page + 1,
      previousPage: page - 1,
      lastPage: Math.ceil(totalCodes / limit),
      languages: languagesForFilter,
    });
  } catch (error) {
    console.error("Error di halaman utama:", error);
    req.flash('error_msg', 'Gagal memuat daftar kode.');
    res.render('index', { title: 'Beranda - SHARECODE', codes: [], languages: [] }); // Tampilkan halaman kosong jika error
  }
});

module.exports = router;