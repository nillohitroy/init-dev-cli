const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SERPAPI_KEY = process.env.SERPAPI_KEY;

// --- PROFESSIONAL SEARCH (SERPAPI) ---
async function fetchProfessionalJobData(targetRole) {
    try {
        const response = await axios.get('https://serpapi.com/search.json', {
            params: { engine: 'google_jobs', q: targetRole, hl: 'en', api_key: SERPAPI_KEY }
        });
        return (response.data.jobs_results || []).slice(0, 3).map(j => j.description).join('\n---\n');
    } catch (e) { return ""; }
}

async function fetchProfessionalResources(targetRole) {
    const queries = [
        { type: 'video', q: `site:youtube.com "${targetRole}" tutorial OR course` },
        { type: 'book', q: `site:amazon.com OR site:goodreads.com "${targetRole}" book` },
        { type: 'lab', q: `site:github.com "${targetRole}" tutorial OR labs OR exercises` },
        { type: 'article', q: `site:medium.com OR site:dev.to "${targetRole}" guide` }
    ];

    const results = { video: [], book: [], lab: [], article: [] };

    await Promise.all(queries.map(async (query) => {
        try {
            const res = await axios.get('https://serpapi.com/search.json', {
                params: { engine: 'google', q: query.q, api_key: SERPAPI_KEY }
            });
            results[query.type] = (res.data.organic_results || []).slice(0, 2).map(r => ({ title: r.title, link: r.link }));
        } catch (e) {}
    }));

    return results;
}

// --- SIMPLE SEARCH (FREE APIs & DYNAMIC LINKS) ---
async function fetchSimpleResources(targetRole) {
    const results = { video: [], book: [], lab: [], article: [] };

    try {
        // Free GitHub REST API for ranked projects & labs
        const githubRes = await axios.get(`https://api.github.com/search/repositories?q=${encodeURIComponent(targetRole + ' tutorial OR labs')}&sort=stars`);
        results.lab = (githubRes.data.items || []).slice(0, 2).map(repo => ({
            title: `[Repo] ${repo.full_name}`, link: repo.html_url
        }));
    } catch (e) {}

    try {
        // Free OpenLibrary API for books
        const bookRes = await axios.get(`https://openlibrary.org/search.json?q=${encodeURIComponent(targetRole)}&limit=2`);
        results.book = (bookRes.data.docs || []).map(book => ({
            title: book.title, link: `https://openlibrary.org${book.key}`
        }));
    } catch (e) {}

    // Dynamic search fallback for YouTube and Articles
    results.video = [{ 
        title: `${targetRole} YouTube Playlists`, 
        link: `https://www.youtube.com/results?search_query=${encodeURIComponent(targetRole + ' full course playlist')}` 
    }];
    
    results.article = [{ 
        title: `Top ${targetRole} Guides on Dev.to`, 
        link: `https://dev.to/search?q=${encodeURIComponent(targetRole)}` 
    }];

    return results;
}

module.exports = { fetchProfessionalJobData, fetchProfessionalResources, fetchSimpleResources };