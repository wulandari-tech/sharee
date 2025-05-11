// routes/index.js
const express = require('express');
const router = express.Router();
const Code = require('../models/code'); // Sesuaikan path ke model Anda

router.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9; // Default 9 item per halaman
    const skip = (page - 1) * limit;

    const searchQuery = req.query.search || '';
    const languageQuery = req.query.language || '';
    const tagQuery = req.query.tag || '';

    let findConditions = {};
    let sortOptions = { createdAt: -1 }; // Default sorting

    if (searchQuery) {
        findConditions.$text = { $search: searchQuery };
        // Jika menggunakan text search, MongoDB biasanya menangani relevansi
        // Jika ingin tetap sortir by date setelah relevansi, perlu lebih kompleks
        // sortOptions = { score: { $meta: "textScore" }, createdAt: -1 };
    }

    if (languageQuery) {
        findConditions.language = languageQuery;
    }

    if (tagQuery) {
        findConditions.tags = tagQuery; // Pencarian tag yang persis case-insensitive
    }

    // Tambahkan filter untuk tidak menampilkan 'file' kecuali secara eksplisit diminta (misalnya, jika ada filter bahasa 'file')
    if (!languageQuery || (languageQuery && languageQuery.toLowerCase() !== 'file')) {
        if (findConditions.language) {
            // Jika ada filter bahasa, dan itu bukan 'file', maka itu sudah cukup
            // Jika filter bahasa adalah 'all' atau kosong, dan kita tidak ingin 'file'
        } else {
            // findConditions.language = { $ne: 'file' }; // Sembunyikan 'file' secara default
        }
    }


    try {
        const codesPromise = Code.find(findConditions)
            .populate('author', 'username')
            .sort(sortOptions)
            .skip(skip)
            .limit(limit)
            .lean();

        const totalCodesPromise = Code.countDocuments(findConditions);
        const languagesPromise = Code.distinct('language');

        const [codes, totalCodes, allLanguages] = await Promise.all([
            codesPromise,
            totalCodesPromise,
            languagesPromise
        ]);

        const lastPage = Math.ceil(totalCodes / limit) || 1;
        
        const uniqueLanguages = [...new Set(allLanguages)]
                                .filter(lang => lang && lang.toLowerCase() !== 'file') // Hapus 'file' dari opsi filter
                                .sort();

        res.render('index', {
            title: 'Beranda - SHARECODE',
            codes,
            languages: uniqueLanguages,
            currentUser: req.user || null,
            query: req.query,
            currentPage: page,
            lastPage,
            hasPreviousPage: page > 1,
            hasNextPage: page < lastPage,
            previousPage: page - 1,
            nextPage: page + 1,
            totalCodes: totalCodes,
            limit: limit,
            searchQuery,
            languageQuery,
            tagQuery
        });

    } catch (err) {
        console.error("Error fetching data for homepage:", err);
        req.flash('error_msg', 'Tidak dapat memuat data. Silakan coba lagi nanti.');
        res.render('index', {
            title: 'Beranda - SHARECODE',
            codes: [],
            languages: [],
            currentUser: req.user || null,
            query: req.query || {},
            currentPage: 1,
            lastPage: 1,
            hasPreviousPage: false,
            hasNextPage: false,
            previousPage: 1,
            nextPage: 1,
            totalCodes: 0,
            limit: limit,
            searchQuery,
            languageQuery,
            tagQuery
        });
    }
});

module.exports = router;