const axios = require('axios');

const OLLAMA_URL = 'http://localhost:11434/api/generate';

function sanitizeRoadmap(roadmap) {
    if (!roadmap.phases) return roadmap;
    roadmap.phases.forEach(phase => {
        if (!phase.phase_name) phase.phase_name = "Unnamed Phase";
        if (phase.modules) {
            phase.modules.forEach(mod => {
                // Fix Gemma dropping the module_name key
                mod.module_name = mod.module_name || mod.title || mod.name || "Core Concepts";
                mod.status = "pending"; // Force pending status
                mod.estimated_hours = mod.estimated_hours || 5;
                if (mod.submodules) {
                    mod.submodules.forEach(sub => {
                        sub.title = sub.title || sub.name || "Resource";
                        sub.status = "pending";
                        sub.link = sub.link || "Search locally or on Google";
                        sub.type = sub.type || "article";
                    });
                } else {
                    mod.submodules = []; // Ensure array exists
                }
            });
        }
    });
    return roadmap;
}

async function generateStructuredRoadmap(targetRole, skills, marketData, resources) {
    const prompt = `
    You are a strict JSON API. Create a curriculum roadmap for a "${targetRole}". 
    Current skills: ${skills.join(', ')}.
    Resources available: ${JSON.stringify(resources)}

    CRITICAL INSTRUCTIONS:
    1. Output ONLY JSON. No explanations.
    2. Every module MUST have a "module_name".
    3. Every submodule MUST have a "title", "type" (video/book/lab/article), and a valid "link" from the provided resources.
    4. All "status" fields MUST be exactly "pending".

    SCHEMA FORMAT:
    {
      "role": "${targetRole}",
      "total_progress": 0,
      "phases": [
        {
          "phase_name": "Phase 1: Basics",
          "modules": [
            {
              "module_name": "Learn Syntax",
              "status": "pending",
              "estimated_hours": 10,
              "submodules": [
                {
                  "title": "Syntax Guide",
                  "type": "article",
                  "link": "https://example.com",
                  "status": "pending"
                }
              ]
            }
          ]
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
        const rawJson = JSON.parse(response.data.response);
        return sanitizeRoadmap(rawJson);
    } catch (error) {
        throw new Error("Failed to generate structured roadmap.");
    }
}

module.exports = { generateStructuredRoadmap };