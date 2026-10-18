const fs = require('fs');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const TABPFN_API_KEY = process.env.TABPFN_API_KEY;

// 1. Universal PDF Reader
async function readResumePdf(pdfPath) {
    const dataBuffer = fs.readFileSync(pdfPath);
    let resultText = "";
    
    let pdfParseModule;
    try {
        pdfParseModule = require('pdf-parse');
    } catch (e) {
        const imported = await import('pdf-parse');
        pdfParseModule = imported.default || imported;
    }

    if (pdfParseModule.PDFParse) {
        const parser = new pdfParseModule.PDFParse({ data: dataBuffer });
        const result = await parser.getText();
        resultText = result.text;
        if (typeof parser.destroy === 'function') await parser.destroy();
    } else {
        const parseFunc = typeof pdfParseModule === 'function' 
            ? pdfParseModule 
            : (pdfParseModule.default || pdfParseModule.pdfParse);
            
        if (typeof parseFunc !== 'function') throw new Error("Unable to resolve pdf-parse API.");
        const pdfData = await parseFunc(dataBuffer);
        resultText = pdfData.text;
    }
    return resultText;
}

// 2. Attempt TabPFN Text Analysis
async function tryTabPFNTextAnalysis(resumeText, targetRole) {
    if (!TABPFN_API_KEY) throw new Error("No TabPFN API Key provided.");
    
    // Attempting to use TabPFN 3.5's raw text integration by passing the unstructured text
    const response = await axios.post('https://api.priorlabs.ai/v1/predict', {
        model: 'tabpfn-3.5',
        data: [
            [resumeText, targetRole] // Sending raw text directly as a feature
        ]
    }, {
        headers: { 'Authorization': `Bearer ${TABPFN_API_KEY}` }
    });
    
    return response.data.predictions[0].probability_positive * 100;
}

// 3. Fallback to Local Gemma Engine
async function scoreWithGemma(resumeText, targetRole) {
    const prompt = `
    You are an expert ATS (Applicant Tracking System) reviewer.
    Analyze the following resume text against the target role of "${targetRole}".
    Read the entire text and determine the probability (from 0 to 100) that this candidate would pass an ATS screen.
    
    Consider their skills, years of experience, and relevance to the role.
    
    Return ONLY a valid JSON object strictly matching this format:
    {
      "ats_score": 85.5,
      "feedback": "Write a brief 1-sentence reason for this score."
    }
    
    Resume Text: ${resumeText.substring(0, 3500)}
    `;

    const response = await axios.post(OLLAMA_URL, {
        model: 'gemma:2b',
        prompt: prompt,
        stream: false,
        format: 'json'
    });

    const parsed = JSON.parse(response.data.response);
    return {
        score: parsed.ats_score || 0,
        feedback: parsed.feedback || "Analyzed by Gemma based on text relevance."
    };
}

// 4. Main Orchestrator
async function evaluateResume(pdfPath, targetRole) {
    const resumeText = await readResumePdf(pdfPath);
    let engine = "TabPFN";
    let score = 0;
    let feedback = "Analyzed via TabPFN Text Integration.";

    try {
        // Attempt TabPFN first
        score = await tryTabPFNTextAnalysis(resumeText, targetRole);
    } catch (error) {
        // If TabPFN rejects the unstructured data format or fails, pass it to Gemma
        engine = "Gemma (Local)";
        const gemmaResult = await scoreWithGemma(resumeText, targetRole);
        score = gemmaResult.score;
        feedback = gemmaResult.feedback;
    }

    return { score, engine, feedback };
}

module.exports = { evaluateResume };