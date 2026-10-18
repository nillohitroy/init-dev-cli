const axios = require('axios');

const OLLAMA_URL = 'http://localhost:11434/api/generate';

/**
 * Parses natural language into a structured JSON using local Gemma model.
 */
async function parseUserIntent(userInput) {
    const prompt = `
    You are an expert career counselor AI. 
    Read the user's input and extract their target job role and current skills.
    Return ONLY a valid JSON object in this exact format, with no markdown formatting or extra text:
    {
      "target_role": "extracted job title",
      "current_skills": ["skill 1", "skill 2"]
    }
    
    User Input: "${userInput}"
    `;

    try {
        const response = await axios.post(OLLAMA_URL, {
            model: 'gemma:2b',
            prompt: prompt,
            stream: false,
            format: 'json'
        });

        return JSON.parse(response.data.response);
    } catch (error) {
        throw new Error("Failed to connect to local Gemma model. Is Ollama running?");
    }
}

/**
 * Generates a fallback baseline curriculum using only local weights when offline.
 */
async function generateOfflineBaseline(targetRole, currentSkills) {
    const prompt = `
    You are a technical curriculum designer. The user has no internet access.
    Target Role: ${targetRole}
    Current Skills: ${currentSkills.join(', ')}
    
    Generate a concise, 3-step offline baseline roadmap for them to start learning immediately.
    Return ONLY a valid JSON object in this exact format:
    {
      "modules": [
        {
          "title": "Module Name",
          "description": "What to study and practice offline without tutorials."
        }
      ]
    }
    `;

    try {
        const response = await axios.post(OLLAMA_URL, {
            model: 'gemma:2b',
            prompt: prompt,
            stream: false,
            format: 'json'
        });

        return JSON.parse(response.data.response);
    } catch (error) {
        return { modules: [] };
    }
}

module.exports = { parseUserIntent, generateOfflineBaseline };