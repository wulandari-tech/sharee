const express = require('express');
const router = express.Router();
const Code = require('../models/code');

const ITEMS_PER_PAGE = 10;

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const searchQuery = req.query.search || '';
    const langQuery = req.query.language || '';
    const tagQuery = req.query.tag || '';

    let query = {};
    if (searchQuery) {
      query.$or = [
        { title: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } }
      ];
    }
    if (langQuery) {
      query.language = langQuery;
    }
    if (tagQuery) {
      query.tags = tagQuery.toLowerCase();
    }

    const totalCodes = await Code.countDocuments(query);
    const codes = await Code.find(query)
      .populate('author', 'username')
      .sort({ createdAt: -1 })
      .skip((page - 1) * ITEMS_PER_PAGE)
      .limit(ITEMS_PER_PAGE);

    const languages = await Code.distinct('language');

    res.render('index', {
      codes,
      languages,
      currentPage: page,
      hasNextPage: ITEMS_PER_PAGE * page < totalCodes,
      hasPreviousPage: page > 1,
      nextPage: page + 1,
      previousPage: page - 1,
      lastPage: Math.ceil(totalCodes / ITEMS_PER_PAGE),
      searchQuery,
      langQuery,
      tagQuery,
      title: 'Beranda - SHARE SOURCE CODE'
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Gagal memuat kode.');
    res.redirect('/');
  }
});

module.exports = router;